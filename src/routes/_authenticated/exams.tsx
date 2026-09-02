import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { BarChart3, Loader2, Plus, Printer, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession, useActiveTerm } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SchoolLetterhead, DocFooter, type SchoolInfo } from "@/components/SchoolLetterhead";
import { scoreToLevel } from "@/lib/nuru";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/exams")({
  component: ExamsPage,
});

type Exam = {
  id: string;
  name: string;
  grade_id: string;
  max_score: number;
  is_active: boolean;
  term_id: string;
};

type MarkRow = {
  score: number | null;
  student_id: string;
  subject_id: string;
  exam_id: string;
  students?: { first_name: string; last_name: string; adm_no: string } | null;
  subjects?: { name: string } | null;
};

function mean(xs: number[]) {
  if (!xs.length) return null;
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
}

function ExamsPage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const school = session?.school as SchoolInfo;
  const { data: term } = useActiveTerm(schoolId);
  const qc = useQueryClient();

  const [gradeId, setGradeId] = useState("");
  const [examId, setExamId] = useState("all");
  const [newName, setNewName] = useState("");
  const [newMax, setNewMax] = useState("100");

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("grades").select("id, name").eq("school_id", schoolId!).order("level_order"))
        .data ?? [],
  });

  const { data: exams } = useQuery({
    queryKey: ["exams", schoolId, term?.id],
    enabled: !!schoolId && !!term,
    queryFn: async () =>
      ((
        await supabase
          .from("exams")
          .select("id, name, grade_id, max_score, is_active, term_id")
          .eq("school_id", schoolId!)
          .eq("term_id", term!.id)
          .order("created_at")
      ).data ?? []) as Exam[],
  });

  const gradeExams = (exams ?? []).filter((e) => !gradeId || e.grade_id === gradeId);
  const examIds = gradeExams.filter((e) => examId === "all" || e.id === examId).map((e) => e.id);

  const { data: marks } = useQuery({
    queryKey: ["exam-analytics", examIds.join(",")],
    enabled: examIds.length > 0,
    queryFn: async () =>
      ((
        await supabase
          .from("marks")
          .select("score, student_id, subject_id, exam_id, students(first_name, last_name, adm_no), subjects(name)")
          .in("exam_id", examIds)
      ).data ?? []) as MarkRow[],
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!gradeId) throw new Error("Choose a grade first.");
      if (!newName.trim()) throw new Error("Give the exam a name.");
      if (!term) throw new Error("No active term is set.");
      const { error } = await supabase.from("exams").insert({
        school_id: schoolId!,
        grade_id: gradeId,
        term_id: term.id,
        academic_year_id: (term as { academic_years?: { id: string } }).academic_years!.id,
        name: newName.trim().toUpperCase(),
        max_score: Number(newMax) || 100,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      logAudit("exam_created", "exams", newName);
      toast.success("Exam created.");
      setNewName("");
      void qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (e: Exam) => {
      const { error } = await supabase.from("exams").update({ is_active: !e.is_active }).eq("id", e.id);
      if (error) throw error;
      return e;
    },
    onSuccess: (e) => {
      logAudit(e.is_active ? "exam_deactivated" : "exam_activated", "exams", e.id);
      toast.success(e.is_active ? "Exam deactivated." : "Exam activated.");
      void qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("marks").delete().eq("exam_id", id);
      const { error } = await supabase.from("exams").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      logAudit("exam_deleted", "exams", id);
      toast.success("Exam deleted.");
      void qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const analytics = useMemo(() => {
    const rows = (marks ?? []).filter((m) => m.score !== null);
    const bySubject = new Map<string, number[]>();
    const byStudent = new Map<string, { name: string; adm: string; scores: number[] }>();
    const byExam = new Map<string, number[]>();
    for (const m of rows) {
      const s = Number(m.score);
      const subj = m.subjects?.name ?? "Subject";
      bySubject.set(subj, [...(bySubject.get(subj) ?? []), s]);
      byExam.set(m.exam_id, [...(byExam.get(m.exam_id) ?? []), s]);
      const st = byStudent.get(m.student_id) ?? {
        name: `${m.students?.first_name ?? ""} ${m.students?.last_name ?? ""}`.trim(),
        adm: m.students?.adm_no ?? "",
        scores: [],
      };
      st.scores.push(s);
      byStudent.set(m.student_id, st);
    }
    const learners = [...byStudent.values()]
      .map((s) => ({ ...s, mean: mean(s.scores) ?? 0 }))
      .sort((a, b) => b.mean - a.mean);
    const subjects = [...bySubject.entries()]
      .map(([name, xs]) => ({ name, mean: mean(xs) ?? 0, entries: xs.length }))
      .sort((a, b) => b.mean - a.mean);
    const trend = gradeExams
      .map((e) => ({ name: e.name, mean: mean(byExam.get(e.id) ?? []) }))
      .filter((t) => t.mean !== null);
    return {
      overall: mean(rows.map((m) => Number(m.score))),
      entries: rows.length,
      learners,
      subjects,
      trend,
    };
  }, [marks, gradeExams]);

  const gradeLabel = (grades ?? []).find((g) => g.id === gradeId)?.name ?? "";
  const maxTrend = Math.max(1, ...analytics.trend.map((t) => t.mean ?? 0));

  return (
    <AppShell
      title="Exam analytics"
      subtitle="Create exams, manage them and read performance at a glance"
      actions={
        <Button size="sm" variant="outline" className="no-print" onClick={() => window.print()} disabled={!gradeId}>
          <Printer className="size-4" /> Print analysis
        </Button>
      }
    >
      <div className="card-nuru mb-5 grid gap-3 p-4 no-print sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Grade</Label>
          <Select value={gradeId} onValueChange={(v) => { setGradeId(v); setExamId("all"); }}>
            <SelectTrigger>
              <SelectValue placeholder="Select grade" />
            </SelectTrigger>
            <SelectContent>
              {(grades ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Exam</Label>
          <Select value={examId} onValueChange={setExamId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All exams this term</SelectItem>
              {gradeExams.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>New exam name</Label>
          <Input placeholder="e.g. OPENER" value={newName} onChange={(e) => setNewName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Out of</Label>
          <div className="flex gap-2">
            <Input type="number" min={1} value={newMax} onChange={(e) => setNewMax(e.target.value)} />
            <Button disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            </Button>
          </div>
        </div>
      </div>

      {gradeId ? (
        <div className="card-nuru mb-5 p-4 no-print">
          <p className="mb-3 text-sm font-semibold">Exams for {gradeLabel} this term</p>
          <div className="grid gap-2">
            {gradeExams.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium uppercase">{e.name}</span>
                  <Badge variant={e.is_active ? "default" : "secondary"}>
                    {e.is_active ? "Active" : "Inactive"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">out of {e.max_score}</span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => toggle.mutate(e)}>
                    <Power className="size-4" /> {e.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove.mutate(e.id)} aria-label={`Delete ${e.name}`}>
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {gradeExams.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">No exams created for this grade yet.</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!gradeId ? (
        <div className="card-nuru grid place-items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <BarChart3 className="size-6" /> Choose a grade to see the exam analysis.
        </div>
      ) : (
        <div className="card-nuru print-sheet p-6">
          <SchoolLetterhead
            school={school}
            documentTitle="Exam performance analysis"
            meta={`${gradeLabel} · ${examId === "all" ? "All exams" : gradeExams.find((e) => e.id === examId)?.name} · ${analytics.entries} marks recorded`}
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Grade mean score</p>
              <p className="font-display text-2xl font-bold">{analytics.overall ?? "—"}</p>
              <p className="text-xs">Level {scoreToLevel(analytics.overall)}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Learners assessed</p>
              <p className="font-display text-2xl font-bold">{analytics.learners.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Subjects assessed</p>
              <p className="font-display text-2xl font-bold">{analytics.subjects.length}</p>
            </div>
          </div>

          <p className="mt-5 mb-2 text-sm font-semibold">Performance trend across exams</p>
          <table className="doc-table w-full text-sm">
            <thead>
              <tr>
                <th>Exam</th>
                <th className="text-right">Mean</th>
                <th>Level</th>
                <th className="w-1/2">Trend</th>
              </tr>
            </thead>
            <tbody>
              {analytics.trend.map((t) => (
                <tr key={t.name}>
                  <td className="uppercase">{t.name}</td>
                  <td className="text-right font-semibold">{t.mean}</td>
                  <td>{scoreToLevel(t.mean)}</td>
                  <td>
                    <div className="h-2 w-full rounded bg-secondary">
                      <div
                        className="h-2 rounded bg-primary"
                        style={{ width: `${Math.round(((t.mean ?? 0) / maxTrend) * 100)}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {analytics.trend.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">
                    No marks recorded yet for this selection.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>

          <p className="mt-5 mb-2 text-sm font-semibold">Subject breakdown</p>
          <table className="doc-table w-full text-sm">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Learning area</th>
                <th className="text-right">Mean</th>
                <th>Level</th>
                <th className="text-right">Entries</th>
              </tr>
            </thead>
            <tbody>
              {analytics.subjects.map((s, i) => (
                <tr key={s.name}>
                  <td>{i + 1}</td>
                  <td className="uppercase">{s.name}</td>
                  <td className="text-right font-semibold">{s.mean}</td>
                  <td>{scoreToLevel(s.mean)}</td>
                  <td className="text-right">{s.entries}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold">Top 10 learners</p>
              <table className="doc-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Learner</th>
                    <th className="text-right">Mean</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.learners.slice(0, 10).map((l, i) => (
                    <tr key={l.adm}>
                      <td>{i + 1}</td>
                      <td className="uppercase">{l.name}</td>
                      <td className="text-right font-semibold">{l.mean}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Learners needing support</p>
              <table className="doc-table w-full text-sm">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Learner</th>
                    <th className="text-right">Mean</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.learners.slice(-10).reverse().map((l, i) => (
                    <tr key={l.adm}>
                      <td>{i + 1}</td>
                      <td className="uppercase">{l.name}</td>
                      <td className="text-right font-semibold">{l.mean}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DocFooter note="Exam performance analysis" />
        </div>
      )}
    </AppShell>
  );
}
