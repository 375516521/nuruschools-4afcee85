import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save, Loader2, CalendarCheck, Printer } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession, useActiveTerm } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SchoolLetterhead, DocFooter, type SchoolInfo } from "@/components/SchoolLetterhead";
import { logAudit } from "@/lib/audit";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

const STATUSES = ["present", "absent", "late", "sick"] as const;
type Status = (typeof STATUSES)[number];

function AttendancePage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const school = session?.school as SchoolInfo;
  const { data: term } = useActiveTerm(schoolId);
  const qc = useQueryClient();

  const [gradeId, setGradeId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, Status>>({});

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("grades").select("id, name").eq("school_id", schoolId!).order("level_order"))
        .data ?? [],
  });

  const { data: students } = useQuery({
    queryKey: ["att-students", gradeId],
    enabled: !!gradeId,
    queryFn: async () =>
      (
        await supabase
          .from("students")
          .select("id, adm_no, first_name, last_name, stream_id, streams(name)")
          .eq("grade_id", gradeId)
          .eq("status", "active")
          .order("adm_no")
      ).data ?? [],
  });

  const { data: existing } = useQuery({
    queryKey: ["attendance", gradeId, date],
    enabled: !!gradeId && !!date,
    queryFn: async () =>
      (await supabase.from("attendance").select("student_id, status").eq("grade_id", gradeId).eq("date", date))
        .data ?? [],
  });

  useEffect(() => {
    const next: Record<string, Status> = {};
    for (const r of existing ?? []) next[r.student_id] = r.status as Status;
    setMarks(next);
  }, [existing]);

  const save = useMutation({
    mutationFn: async () => {
      const rows = (students ?? []).map((s) => ({
        school_id: schoolId!,
        student_id: s.id,
        grade_id: gradeId,
        stream_id: s.stream_id,
        term_id: term?.id ?? null,
        date,
        status: marks[s.id] ?? "present",
      }));
      if (!rows.length) throw new Error("No learners in this grade.");
      const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "student_id,date" });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      logAudit("attendance_marked", "attendance", `${gradeId}:${date}`);
      toast.success(`Attendance saved for ${n} learners.`);
      void qc.invalidateQueries({ queryKey: ["attendance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = students ?? [];
  const summary = STATUSES.map((st) => ({
    st,
    n: list.filter((s) => (marks[s.id] ?? "present") === st).length,
  }));
  const gradeLabel = (grades ?? []).find((g) => g.id === gradeId)?.name ?? "";

  return (
    <AppShell
      title="Attendance register"
      subtitle="Daily class register — mark, save and print"
      actions={
        <>
          <Button size="sm" variant="outline" onClick={() => window.print()} disabled={!gradeId} className="no-print">
            <Printer className="size-4" /> Print register
          </Button>
          <Button size="sm" disabled={!gradeId || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
          </Button>
        </>
      }
    >
      <div className="card-nuru mb-5 grid gap-3 p-4 no-print sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Grade</Label>
          <Select value={gradeId} onValueChange={setGradeId}>
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
          <Label>Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Summary</Label>
          <p className="pt-2 text-sm text-muted-foreground">
            {summary.map((s) => `${s.n} ${s.st}`).join(" · ")}
          </p>
        </div>
      </div>

      {!gradeId ? (
        <div className="card-nuru grid place-items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <CalendarCheck className="size-6" /> Choose a grade and date to open the register.
        </div>
      ) : (
        <div className="card-nuru print-sheet p-6">
          <SchoolLetterhead
            school={school}
            documentTitle="Daily attendance register"
            meta={`${gradeLabel} · ${new Date(date).toLocaleDateString("en-KE", { dateStyle: "full" })}`}
          />
          <table className="doc-table mt-4 w-full text-sm">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Admission</th>
                <th>Learner</th>
                <th>Stream</th>
                <th className="text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={s.id}>
                  <td>{i + 1}</td>
                  <td className="font-mono text-xs">{s.adm_no}</td>
                  <td className="font-medium uppercase">
                    {s.first_name} {s.last_name}
                  </td>
                  <td>{(s as { streams?: { name?: string } }).streams?.name ?? "—"}</td>
                  <td className="text-right">
                    <span className="hidden print:inline uppercase">{marks[s.id] ?? "present"}</span>
                    <select
                      className="no-print h-8 rounded-md border border-input bg-background px-2 text-sm"
                      value={marks[s.id] ?? "present"}
                      onChange={(e) =>
                        setMarks((p) => ({ ...p, [s.id]: e.target.value as Status }))
                      }
                    >
                      {STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
              {list.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No active learners in this grade.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <DocFooter note="Attendance register" />
        </div>
      )}
    </AppShell>
  );
}
