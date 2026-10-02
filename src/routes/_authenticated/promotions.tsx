import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowRight, GraduationCap, Loader2, CalendarRange, Copy } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logAudit } from "@/lib/audit";
import { ksh } from "@/lib/nuru";

export const Route = createFileRoute("/_authenticated/promotions")({
  component: PromotionsPage,
  head: () => ({
    meta: [
      { title: "Promote learners & roll over terms | Fanisi" },
      {
        name: "description",
        content:
          "Move a whole grade to the next class, graduate finalists and switch the school to the next term in one place.",
      },
      { property: "og:title", content: "Promote learners & roll over terms | Fanisi" },
      {
        property: "og:description",
        content: "Bulk class promotion, graduation and term rollover for your school.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Grade = { id: string; name: string; level_order: number };

function PromotionsPage() {
  const { data: session } = useSession();
  const roles = session?.roles ?? [];
  if (session && !roles.includes("superadmin") && !roles.includes("hoi")) {
    return (
      <AppShell title="Promotions & term rollover">
        <div className="card-nuru p-5 text-sm text-muted-foreground">
          Only the Head of Institution or super admin can promote learners or change the term.
        </div>
      </AppShell>
    );
  }
  return <PromotionsInner />;
}

function PromotionsInner() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const qc = useQueryClient();
  const { data: balances } = useQuery({
    queryKey: ["promote-balances", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const [st, fs, fp, fd] = await Promise.all([
        supabase.from("students").select("id, grade_id").eq("school_id", schoolId!).eq("status", "active"),
        supabase.from("fee_structures").select("grade_id, amount").eq("school_id", schoolId!),
        supabase.from("fee_payments").select("student_id, amount").eq("school_id", schoolId!),
        supabase.from("fee_discounts").select("student_id, amount").eq("school_id", schoolId!),
      ]);
      const perGrade = new Map<string, number>();
      for (const f of fs.data ?? []) perGrade.set(f.grade_id, (perGrade.get(f.grade_id) ?? 0) + Number(f.amount));
      const out: Record<string, number> = {};
      for (const s of st.data ?? []) out[s.id] = s.grade_id ? (perGrade.get(s.grade_id) ?? 0) : 0;
      for (const p of fp.data ?? []) if (p.student_id in out) out[p.student_id] -= Number(p.amount);
      for (const d of fd.data ?? []) if (d.student_id in out) out[d.student_id] -= Number(d.amount);
      return out;
    },
  });

  const [fromGrade, setFromGrade] = useState("");
  const [toGrade, setToGrade] = useState("");
  const [toStream, setToStream] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [fromTerm, setFromTerm] = useState("");
  const [toTerm, setToTerm] = useState("");

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      ((
        await supabase
          .from("grades")
          .select("id, name, level_order")
          .eq("school_id", schoolId!)
          .order("level_order")
      ).data ?? []) as Grade[],
  });

  const { data: streams } = useQuery({
    queryKey: ["streams", toGrade],
    enabled: !!toGrade,
    queryFn: async () =>
      (await supabase.from("streams").select("id, name").eq("grade_id", toGrade).order("name"))
        .data ?? [],
  });

  const { data: learners } = useQuery({
    queryKey: ["promote-learners", fromGrade],
    enabled: !!fromGrade,
    queryFn: async () =>
      (
        await supabase
          .from("students")
          .select("id, adm_no, first_name, last_name, streams(name)")
          .eq("grade_id", fromGrade)
          .eq("status", "active")
          .order("adm_no")
      ).data ?? [],
  });

  const { data: terms } = useQuery({
    queryKey: ["all-terms", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("terms")
          .select("id, term_number, is_active, academic_year_id, academic_years(year)")
          .eq("school_id", schoolId!)
          .order("term_number")
      ).data ?? [],
  });

  const chosen = useMemo(
    () => (learners ?? []).filter((l) => selected[l.id] !== false).map((l) => l.id),
    [learners, selected],
  );

  function pickFrom(id: string) {
    setFromGrade(id);
    setSelected({});
    setToStream("");
    const list = grades ?? [];
    const current = list.find((g) => g.id === id);
    const next = current
      ? list.find((g) => g.level_order > current.level_order)
      : undefined;
    setToGrade(next?.id ?? "");
  }

  const promote = useMutation({
    mutationFn: async () => {
      if (!fromGrade) throw new Error("Choose the class the learners are leaving.");
      if (!toGrade) throw new Error("Choose the class they are joining.");
      if (chosen.length === 0) throw new Error("Select at least one learner.");
      const { error } = await supabase
        .from("students")
        .update({ grade_id: toGrade, stream_id: toStream || null })
        .in("id", chosen);
      if (error) throw error;
      await logAudit("promote_learners", "students", null, {
        from_grade: fromGrade,
        to_grade: toGrade,
        count: chosen.length,
      });
    },
    onSuccess: () => {
      toast.success(`${chosen.length} learners moved up.`);
      setSelected({});
      void qc.invalidateQueries({ queryKey: ["promote-learners"] });
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const graduate = useMutation({
    mutationFn: async () => {
      if (chosen.length === 0) throw new Error("Select at least one learner.");
      const { error } = await supabase
        .from("students")
        .update({ status: "graduated" })
        .in("id", chosen);
      if (error) throw error;
      await logAudit("graduate_learners", "students", null, {
        grade: fromGrade,
        count: chosen.length,
      });
    },
    onSuccess: () => {
      toast.success("Finalists marked as graduated.");
      setSelected({});
      void qc.invalidateQueries({ queryKey: ["promote-learners"] });
      void qc.invalidateQueries({ queryKey: ["students"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rollTerm = useMutation({
    mutationFn: async (copyFees: boolean) => {
      if (!toTerm) throw new Error("Choose the term you are opening.");
      if (copyFees && !fromTerm) throw new Error("Choose the term whose fee structure to copy.");
      if (copyFees && fromTerm === toTerm) throw new Error("Pick two different terms.");

      if (copyFees) {
        const existing = await supabase
          .from("fee_structures")
          .select("id")
          .eq("school_id", schoolId!)
          .eq("term_id", toTerm);
        if ((existing.data ?? []).length > 0) {
          throw new Error("That term already has a fee structure — clear it first on the Fees page.");
        }
        const source = await supabase
          .from("fee_structures")
          .select("grade_id, item, amount")
          .eq("school_id", schoolId!)
          .eq("term_id", fromTerm);
        const target = (terms ?? []).find((t) => t.id === toTerm);
        if (!target) throw new Error("Term not found.");
        const rows = (source.data ?? []).map((r) => ({
          ...r,
          school_id: schoolId!,
          term_id: toTerm,
          academic_year_id: target.academic_year_id,
        }));
        if (rows.length > 0) {
          const { error } = await supabase.from("fee_structures").insert(rows);
          if (error) throw error;
        }
      }

      await supabase.from("terms").update({ is_active: false }).eq("school_id", schoolId!);
      const { error } = await supabase.from("terms").update({ is_active: true }).eq("id", toTerm);
      if (error) throw error;
      await logAudit("roll_over_term", "terms", toTerm, { from_term: fromTerm, copyFees });
    },
    onSuccess: () => {
      toast.success("The school is now on the new term.");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fromLevel = (grades ?? []).find((g) => g.id === fromGrade)?.level_order ?? null;
  const isFinalYear =
    fromLevel !== null && !(grades ?? []).some((g) => g.level_order > fromLevel);

  return (
    <AppShell
      title="Promotions & term rollover"
      subtitle="Move a whole class up, graduate finalists and open the next term"
    >
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <section className="card-nuru space-y-3 p-5">
            <h2 className="font-display font-semibold">Move learners up</h2>
            <div className="space-y-1.5">
              <Label>Current class</Label>
              <Select value={fromGrade} onValueChange={pickFrom}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
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
              <Label>New class</Label>
              <Select value={toGrade} onValueChange={(v) => { setToGrade(v); setToStream(""); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  {(grades ?? [])
                    .filter((g) => g.id !== fromGrade)
                    .map((g) => (
                      <SelectItem key={g.id} value={g.id}>
                        {g.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>New stream (optional)</Label>
              <Select value={toStream} onValueChange={setToStream} disabled={!toGrade}>
                <SelectTrigger>
                  <SelectValue placeholder="Keep unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {(streams ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => {
                if (window.confirm(`Move ${chosen.length} learners to the new class?`)) promote.mutate();
              }}
              disabled={promote.isPending || chosen.length === 0}
            >
              {promote.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ArrowRight className="size-4" />
              )}{" "}
              Promote {chosen.length} learners
            </Button>
            {isFinalYear ? (
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  if (window.confirm(`Mark ${chosen.length} learners as graduated?`)) graduate.mutate();
                }}
                disabled={graduate.isPending || chosen.length === 0}
              >
                <GraduationCap className="size-4" /> Graduate {chosen.length} finalists
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Fee balances, marks and admission numbers stay with each learner.
            </p>
          </section>

          <section className="card-nuru space-y-3 p-5">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <CalendarRange className="size-4" /> Term rollover
            </h2>
            <div className="space-y-1.5">
              <Label>Copy fees from</Label>
              <Select value={fromTerm} onValueChange={setFromTerm}>
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {(terms ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {(t.academic_years as { year?: number } | null)?.year} Term {t.term_number}
                      {t.is_active ? " (current)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>New current term</Label>
              <Select value={toTerm} onValueChange={setToTerm}>
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {(terms ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {(t.academic_years as { year?: number } | null)?.year} Term {t.term_number}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full"
              onClick={() => { if (window.confirm("Switch the whole school to this term?")) rollTerm.mutate(true); }}
              disabled={rollTerm.isPending}
            >
              {rollTerm.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Copy className="size-4" />
              )}{" "}
              Open term & copy fees
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => { if (window.confirm("Switch the whole school to this term?")) rollTerm.mutate(false); }}
              disabled={rollTerm.isPending}
            >
              Open term only
            </Button>
          </section>
        </div>

        <section className="card-nuru p-5">
          {!fromGrade ? (
            <p className="text-sm text-muted-foreground">
              Pick a class on the left to list its learners.
            </p>
          ) : (learners ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No active learners in that class.</p>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display font-semibold">
                  {chosen.length} of {(learners ?? []).length} selected
                </h2>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelected({})}>
                    Select all
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setSelected(
                        Object.fromEntries((learners ?? []).map((l) => [l.id, false])),
                      )
                    }
                  >
                    Clear
                  </Button>
                </div>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2">
                {(learners ?? []).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={selected[l.id] !== false}
                      onCheckedChange={(v) =>
                        setSelected((prev) => ({ ...prev, [l.id]: v === true }))
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {l.first_name} {l.last_name}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">{l.adm_no}</span>
                    {(balances?.[l.id] ?? 0) > 0 ? (
                      <span className="text-xs font-medium text-destructive">
                        owes {ksh(balances?.[l.id] ?? 0)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}
