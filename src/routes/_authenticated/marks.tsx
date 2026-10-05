import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { onlyEnabledGrades , onlyMySubjects } from "@/lib/access";
import { AppShell, useSession, useActiveTerm } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { scoreToLevel } from "@/lib/nuru";

export const Route = createFileRoute("/_authenticated/marks")({
  component: MarksPage,
});

function MarksPage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const { data: term } = useActiveTerm(schoolId);
  const qc = useQueryClient();

  const [examId, setExamId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({});

  const { data: exams } = useQuery({
    queryKey: ["exams", schoolId, term?.id],
    enabled: !!schoolId && !!term,
    queryFn: async () => (await supabase.from("exams").select("*").eq("school_id", schoolId!).eq("term_id", term!.id).order("created_at")).data ?? [],
  });

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () => onlyEnabledGrades(schoolId!, (await supabase.from("grades").select("*").eq("school_id", schoolId!).order("level_order")).data ?? []),
  });

  const { data: subjects } = useQuery({
    queryKey: ["subjects", schoolId, gradeId],
    enabled: !!schoolId,
    queryFn: async () => {
      const rows = (await supabase.from("subjects").select("*").eq("school_id", schoolId!).order("name")).data ?? [];
      return gradeId ? onlyMySubjects(gradeId, rows) : rows;
    },
  });

  const { data: students } = useQuery({
    queryKey: ["marks-students", gradeId],
    enabled: !!gradeId,
    queryFn: async () => (await supabase.from("students").select("id, adm_no, first_name, last_name").eq("grade_id", gradeId).eq("status", "active").order("adm_no")).data ?? [],
  });

  const { data: existing } = useQuery({
    queryKey: ["marks", examId, subjectId, gradeId],
    enabled: !!examId && !!subjectId && !!gradeId,
    queryFn: async () => (await supabase.from("marks").select("student_id, score").eq("exam_id", examId).eq("subject_id", subjectId)).data ?? [],
  });

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const m of existing ?? []) next[m.student_id] = m.score === null ? "" : String(m.score);
    setScores(next);
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      const rows = Object.entries(scores)
        .filter(([, v]) => v !== "")
        .map(([student_id, v]) => {
          const score = Number(v);
          if (Number.isNaN(score) || score < 0 || score > 100) throw new Error("Scores must be between 0 and 100.");
          return { exam_id: examId, subject_id: subjectId, student_id, score, school_id: schoolId! };
        });
      if (rows.length === 0) throw new Error("Enter at least one score.");
      const { error } = await supabase.from("marks").upsert(rows, { onConflict: "exam_id,student_id,subject_id" });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => { toast.success(`${n} scores saved.`); void qc.invalidateQueries({ queryKey: ["marks"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const ready = examId && gradeId && subjectId;

  return (
    <AppShell
      title="Marks entry"
      subtitle="CBC competency levels are derived automatically from the score"
      actions={<Button size="sm" disabled={!ready || save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save marks
      </Button>}
    >
      <div className="card-nuru mb-5 grid gap-3 p-5 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Exam</Label>
          <Select value={examId} onValueChange={setExamId}>
            <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
            <SelectContent>{(exams ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Grade</Label>
          <Select value={gradeId} onValueChange={setGradeId}>
            <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
            <SelectContent>{(grades ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Subject</Label>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
            <SelectContent>{(subjects ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {!exams?.length ? (
        <p className="text-sm text-muted-foreground">No exams exist for the active term yet. Create one in Settings before entering marks.</p>
      ) : null}

      {ready ? (
        <div className="card-nuru overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Admission No</TableHead>
                <TableHead>Learner</TableHead>
                <TableHead className="w-32">Score /100</TableHead>
                <TableHead className="w-28">Level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(students ?? []).map((s) => {
                const v = scores[s.id] ?? "";
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs">{s.adm_no}</TableCell>
                    <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                    <TableCell>
                      <Input inputMode="numeric" value={v} onChange={(e) => setScores((p) => ({ ...p, [s.id]: e.target.value }))} className="h-9" />
                    </TableCell>
                    <TableCell>{v === "" ? "—" : <Badge variant="secondary">{scoreToLevel(Number(v))}</Badge>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Choose an exam, grade and subject to start entering marks.</p>
      )}
    </AppShell>
  );
}
