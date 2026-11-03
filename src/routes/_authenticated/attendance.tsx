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
import { useAllowedGrades, useHoiAccess } from "@/lib/access";
import { logAudit } from "@/lib/audit";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

type Session = "morning" | "afternoon";
type Mark = { morning: boolean; afternoon: boolean };

function AttendancePage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const school = session?.school as SchoolInfo;
  const isSuper = (session?.roles ?? []).includes("superadmin");
  const { data: access } = useHoiAccess(session?.user?.id ?? null);
  const { data: term } = useActiveTerm(schoolId);
  const qc = useQueryClient();

  const [gradeId, setGradeId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, Mark>>({});

  const { data: grades } = useAllowedGrades(schoolId, isSuper, access ?? null);

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
      (
        await supabase
          .from("attendance")
          .select("student_id, morning_status, afternoon_status")
          .eq("grade_id", gradeId)
          .eq("date", date)
      ).data ?? [],
  });

  useEffect(() => {
    const next: Record<string, Mark> = {};
    for (const r of existing ?? []) {
      next[r.student_id] = {
        morning: r.morning_status !== "absent",
        afternoon: r.afternoon_status !== "absent",
      };
    }
    setMarks(next);
  }, [existing]);

  const markOf = (id: string): Mark => marks[id] ?? { morning: true, afternoon: true };

  function setSession(id: string, s: Session, present: boolean) {
    setMarks((prev) => ({ ...prev, [id]: { ...markOf(id), [s]: present } }));
  }

  function setAll(s: Session, present: boolean) {
    setMarks((prev) => {
      const next = { ...prev };
      for (const st of students ?? []) {
        next[st.id] = { ...(next[st.id] ?? { morning: true, afternoon: true }), [s]: present };
      }
      return next;
    });
  }

  const save = useMutation({
    mutationFn: async () => {
      const rows = (students ?? []).map((s) => {
        const m = markOf(s.id);
        return {
          school_id: schoolId!,
          student_id: s.id,
          grade_id: gradeId,
          stream_id: s.stream_id,
          term_id: term?.id ?? null,
          date,
          morning_status: m.morning ? "present" : "absent",
          afternoon_status: m.afternoon ? "present" : "absent",
          status: m.morning || m.afternoon ? "present" : "absent",
        };
      });
      if (!rows.length) throw new Error("No learners in this grade.");
      const { error } = await supabase
        .from("attendance")
        .upsert(rows, { onConflict: "student_id,date" });
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
  const amPresent = list.filter((s) => markOf(s.id).morning).length;
  const pmPresent = list.filter((s) => markOf(s.id).afternoon).length;
  const gradeLabel = (grades ?? []).find((g) => g.id === gradeId)?.name ?? "";

  return (
    <AppShell
      title="Attendance register"
      subtitle="Tap Present or Absent for the morning and afternoon sessions"
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.print()}
            disabled={!gradeId}
            className="no-print"
          >
            <Printer className="size-4" /> Print register
          </Button>
          <Button size="sm" disabled={!gradeId || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}{" "}
            Save
          </Button>
        </>
      }
    >
      <div className="card-karli mb-5 grid gap-3 p-4 no-print sm:grid-cols-3">
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
            Morning {amPresent}/{list.length} present · Afternoon {pmPresent}/{list.length} present
          </p>
        </div>
      </div>

      {gradeId && list.length ? (
        <div className="mb-4 flex flex-wrap gap-2 no-print">
          <Button size="sm" variant="outline" onClick={() => setAll("morning", true)}>
            All present (AM)
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAll("morning", false)}>
            All absent (AM)
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAll("afternoon", true)}>
            All present (PM)
          </Button>
          <Button size="sm" variant="outline" onClick={() => setAll("afternoon", false)}>
            All absent (PM)
          </Button>
        </div>
      ) : null}

      {!gradeId ? (
        <div className="card-karli grid place-items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <CalendarCheck className="size-6" /> Choose a grade and date to open the register.
        </div>
      ) : (
        <div className="card-karli print-sheet p-6">
          <SchoolLetterhead
            school={school}
            documentTitle="Daily attendance register"
            meta={`${gradeLabel} · ${new Date(date).toLocaleDateString("en-KE", { dateStyle: "full" })} · AM ${amPresent}/${list.length} · PM ${pmPresent}/${list.length}`}
          />
          <table className="doc-table mt-4 w-full text-sm">
            <thead>
              <tr>
                <th className="w-10">#</th>
                <th>Admission</th>
                <th>Learner</th>
                <th>Stream</th>
                <th className="text-center">Morning</th>
                <th className="text-center">Afternoon</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => {
                const m = markOf(s.id);
                return (
                  <tr key={s.id}>
                    <td>{i + 1}</td>
                    <td className="font-mono text-xs">{s.adm_no}</td>
                    <td className="font-medium uppercase">
                      {s.first_name} {s.last_name}
                    </td>
                    <td>{(s as { streams?: { name?: string } }).streams?.name ?? "—"}</td>
                    <td className="text-center">
                      <SessionToggle
                        present={m.morning}
                        onChange={(v) => setSession(s.id, "morning", v)}
                      />
                    </td>
                    <td className="text-center">
                      <SessionToggle
                        present={m.afternoon}
                        onChange={(v) => setSession(s.id, "afternoon", v)}
                      />
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
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

function SessionToggle({
  present,
  onChange,
}: {
  present: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <>
      <span className="hidden font-semibold uppercase print:inline">
        {present ? "Present" : "Absent"}
      </span>
      <div className="inline-flex overflow-hidden rounded-md border border-border no-print">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={cn(
            "px-2.5 py-1 text-xs font-semibold transition-colors",
            present ? "bg-success text-primary-foreground" : "bg-background text-muted-foreground",
          )}
        >
          P
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={cn(
            "border-l border-border px-2.5 py-1 text-xs font-semibold transition-colors",
            !present
              ? "bg-destructive text-destructive-foreground"
              : "bg-background text-muted-foreground",
          )}
        >
          A
        </button>
      </div>
    </>
  );
}
