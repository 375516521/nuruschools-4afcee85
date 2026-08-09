import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Printer, FileText, Trophy } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { scoreToLevel } from "@/lib/nuru";
import { SchoolLetterhead, DocFooter, type SchoolInfo } from "@/components/SchoolLetterhead";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type MarkRow = {
  student_id: string;
  score: number | null;
  comment: string | null;
  subject_id: string;
  exam_id: string;
  subjects: { name: string } | null;
  exams: { name: string; max_score: number } | null;
};

function ReportsPage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const school = session?.school as SchoolInfo;

  const [yearId, setYearId] = useState("");
  const [termId, setTermId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [studentId, setStudentId] = useState("all");
  const [view, setView] = useState<"cards" | "merit">("cards");

  const { data: years } = useQuery({
    queryKey: ["ry-years", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("academic_years")
          .select("id, year, is_active")
          .eq("school_id", schoolId!)
          .order("year", { ascending: false })
      ).data ?? [],
  });

  const { data: terms } = useQuery({
    queryKey: ["ry-terms", yearId],
    enabled: !!yearId,
    queryFn: async () =>
      (
        await supabase
          .from("terms")
          .select("id, term_number")
          .eq("academic_year_id", yearId)
          .order("term_number")
      ).data ?? [],
  });

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("grades")
          .select("id, name")
          .eq("school_id", schoolId!)
          .order("level_order")
      ).data ?? [],
  });

  const { data: students } = useQuery({
    queryKey: ["ry-students", gradeId],
    enabled: !!gradeId,
    queryFn: async () =>
      (
        await supabase
          .from("students")
          .select("id, adm_no, student_id, first_name, last_name, streams(name)")
          .eq("grade_id", gradeId)
          .eq("status", "active")
          .order("adm_no")
      ).data ?? [],
  });

  const { data: exams } = useQuery({
    queryKey: ["ry-exams", termId, gradeId],
    enabled: !!termId && !!gradeId,
    queryFn: async () =>
      (
        await supabase
          .from("exams")
          .select("id, name, max_score")
          .eq("term_id", termId)
          .eq("grade_id", gradeId)
          .order("created_at")
      ).data ?? [],
  });

  const examIds = (exams ?? []).map((e) => e.id);

  const { data: marks } = useQuery({
    queryKey: ["ry-marks", examIds.join(",")],
    enabled: examIds.length > 0,
    queryFn: async () =>
      ((
        await supabase
          .from("marks")
          .select(
            "student_id, score, comment, subject_id, exam_id, subjects(name), exams(name, max_score)",
          )
          .in("exam_id", examIds)
      ).data ?? []) as unknown as MarkRow[],
  });

  const ready = !!yearId && !!termId && !!gradeId && (exams ?? []).length > 0;
  const yearLabel = (years ?? []).find((y) => y.id === yearId)?.year;
  const termLabel = (terms ?? []).find((t) => t.id === termId)?.term_number;
  const gradeLabel = (grades ?? []).find((g) => g.id === gradeId)?.name;

  const shown = (students ?? []).filter((s) => studentId === "all" || s.id === studentId);

  const merit = (students ?? [])
    .map((s) => {
      const rows = (marks ?? []).filter((m) => m.student_id === s.id);
      const nums = rows.map((r) => Number(r.score ?? 0)).filter((n) => !Number.isNaN(n));
      const mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
      const total = nums.reduce((a, b) => a + b, 0);
      return { s, mean, total, count: nums.length };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => (b.mean ?? 0) - (a.mean ?? 0));

  const rankOf = (sid: string) => {
    const i = merit.findIndex((m) => m.s.id === sid);
    return i < 0 ? null : `${i + 1} of ${merit.length}`;
  };

  function cardFor(sid: string) {
    const rows = (marks ?? []).filter((m) => m.student_id === sid);
    const bySubject = new Map<
      string,
      { name: string; scores: { exam: string; score: number | null }[] }
    >();
    for (const m of rows) {
      const key = m.subject_id;
      if (!bySubject.has(key))
        bySubject.set(key, { name: m.subjects?.name ?? "Subject", scores: [] });
      bySubject.get(key)!.scores.push({ exam: m.exams?.name ?? "Exam", score: m.score });
    }
    const subjects = [...bySubject.values()].sort((a, b) => a.name.localeCompare(b.name));
    const all = rows.map((r) => Number(r.score ?? 0)).filter((n) => !Number.isNaN(n));
    const mean = all.length ? all.reduce((a, b) => a + b, 0) / all.length : null;
    return { subjects, mean };
  }

  return (
    <AppShell
      title="Report Cards"
      subtitle="One-click CBC report cards from recorded marks"
      actions={
        <>
          <Button
            size="sm"
            variant={view === "cards" ? "default" : "outline"}
            onClick={() => setView("cards")}
            className="no-print"
          >
            <FileText className="size-4" /> Report cards
          </Button>
          <Button
            size="sm"
            variant={view === "merit" ? "default" : "outline"}
            onClick={() => setView("merit")}
            className="no-print"
          >
            <Trophy className="size-4" /> Merit list
          </Button>
          <Button size="sm" onClick={() => window.print()} disabled={!ready || shown.length === 0}>
            <Printer className="size-4" /> Print / Save as PDF
          </Button>
        </>
      }
    >
      <div className="card-nuru mb-5 grid gap-4 p-4 no-print sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Academic year</Label>
          <Select
            value={yearId}
            onValueChange={(v) => {
              setYearId(v);
              setTermId("");
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              {(years ?? []).map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Term</Label>
          <Select value={termId} onValueChange={setTermId} disabled={!yearId}>
            <SelectTrigger>
              <SelectValue placeholder="Select term" />
            </SelectTrigger>
            <SelectContent>
              {(terms ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  Term {t.term_number}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Grade</Label>
          <Select
            value={gradeId}
            onValueChange={(v) => {
              setGradeId(v);
              setStudentId("all");
            }}
          >
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
          <Label>Learner</Label>
          <Select value={studentId} onValueChange={setStudentId} disabled={!gradeId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Whole class</SelectItem>
              {(students ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.adm_no} — {s.first_name} {s.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!ready ? (
        <div className="card-nuru grid place-items-center gap-2 p-10 text-center text-sm text-muted-foreground no-print">
          <FileText className="size-6" />
          {gradeId && termId
            ? "No exams recorded for this grade and term yet."
            : "Choose a year, term and grade to build report cards."}
        </div>
      ) : view === "merit" ? (
        <div className="card-nuru print-sheet p-6">
          <SchoolLetterhead
            school={school}
            documentTitle="Class merit list"
            meta={`${yearLabel} Term ${termLabel} · ${gradeLabel} · ${merit.length} learners ranked`}
          />
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2">Pos</th>
                <th className="py-2">Admission</th>
                <th className="py-2">Learner</th>
                <th className="py-2">Stream</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Mean</th>
                <th className="py-2 text-right">Level</th>
              </tr>
            </thead>
            <tbody>
              {merit.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    No marks recorded for this grade and term.
                  </td>
                </tr>
              ) : (
                merit.map((r, i) => (
                  <tr key={r.s.id} className="border-t border-border">
                    <td className="py-2 font-semibold">{i + 1}</td>
                    <td className="py-2 font-mono text-xs">{r.s.adm_no}</td>
                    <td className="py-2 font-medium">
                      {r.s.first_name} {r.s.last_name}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {(r.s as { streams?: { name?: string } }).streams?.name ?? "—"}
                    </td>
                    <td className="py-2 text-right">{r.total.toFixed(0)}</td>
                    <td className="py-2 text-right font-semibold">
                      {r.mean === null ? "-" : r.mean.toFixed(1)}
                    </td>
                    <td className="py-2 text-right">{scoreToLevel(r.mean)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="mt-6 flex justify-between text-[11px] text-muted-foreground">
            <span className="border-t border-border pt-1">Class teacher</span>
            <span className="border-t border-border pt-1">Head of Institution</span>
          </div>
          <DocFooter note="Merit list" />
        </div>
      ) : (
        <div className="space-y-6">
          {shown.map((s) => {
            const { subjects, mean } = cardFor(s.id);
            return (
              <div key={s.id} className="card-nuru print-sheet break-after-page p-6">
                <SchoolLetterhead
                  school={school}
                  documentTitle="CBC Learner Report Card"
                  meta={`${yearLabel} Term ${termLabel} · ${gradeLabel}${(s as { streams?: { name?: string } }).streams?.name ? ` ${(s as { streams?: { name?: string } }).streams?.name}` : ""}`}
                />
                <div className="mt-3 grid gap-1 rounded-lg bg-secondary/60 p-3 text-xs sm:grid-cols-4">
                  <p>
                    <span className="text-muted-foreground">Learner:</span>{" "}
                    <span className="font-semibold">
                      {s.first_name} {s.last_name}
                    </span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Admission:</span>{" "}
                    <span className="font-mono font-medium">{s.adm_no}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Student ID:</span>{" "}
                    <span className="font-mono font-medium">{s.student_id ?? "—"}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Position:</span>{" "}
                    <span className="font-semibold">{rankOf(s.id) ?? "—"}</span>
                  </p>
                </div>

                <table className="mt-4 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2">Learning area</th>
                      {(exams ?? []).map((e) => (
                        <th key={e.id} className="py-2 text-right">
                          {e.name}
                        </th>
                      ))}
                      <th className="py-2 text-right">Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.length === 0 ? (
                      <tr>
                        <td
                          colSpan={(exams?.length ?? 0) + 2}
                          className="py-4 text-muted-foreground"
                        >
                          No marks recorded.
                        </td>
                      </tr>
                    ) : (
                      subjects.map((sub) => {
                        const avg = sub.scores.length
                          ? sub.scores.reduce((a, b) => a + Number(b.score ?? 0), 0) /
                            sub.scores.length
                          : null;
                        return (
                          <tr key={sub.name} className="border-t border-border">
                            <td className="py-2 font-medium">{sub.name}</td>
                            {(exams ?? []).map((e) => {
                              const hit = sub.scores.find((x) => x.exam === e.name);
                              return (
                                <td key={e.id} className="py-2 text-right">
                                  {hit?.score ?? "-"}
                                </td>
                              );
                            })}
                            <td className="py-2 text-right font-semibold">{scoreToLevel(avg)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs">
                  <p>
                    Mean score:{" "}
                    <span className="font-semibold">{mean === null ? "-" : mean.toFixed(1)}</span> ·
                    Overall level: <span className="font-semibold">{scoreToLevel(mean)}</span>
                  </p>
                  <p className="text-muted-foreground">
                    Class teacher ______________ · Head of Institution ______________
                  </p>
                </div>
                <DocFooter note="Official school report card" />
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
