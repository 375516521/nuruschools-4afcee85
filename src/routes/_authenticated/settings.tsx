import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, School, CalendarRange, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession, useActiveTerm } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NURU } from "@/lib/nuru";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const GRADE_PLAN: { name: string; band: "pre_primary" | "primary" | "junior" | "senior" }[] = [
  { name: "PP1", band: "pre_primary" },
  { name: "PP2", band: "pre_primary" },
  { name: "Grade 1", band: "primary" },
  { name: "Grade 2", band: "primary" },
  { name: "Grade 3", band: "primary" },
  { name: "Grade 4", band: "primary" },
  { name: "Grade 5", band: "primary" },
  { name: "Grade 6", band: "primary" },
  { name: "Grade 7", band: "junior" },
  { name: "Grade 8", band: "junior" },
  { name: "Grade 9", band: "junior" },
  { name: "Grade 10", band: "senior" },
  { name: "Grade 11", band: "senior" },
  { name: "Grade 12", band: "senior" },
];

function SettingsPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const profile = session?.profile as { id?: string; school_id?: string; full_name?: string } | null;
  const schoolId = profile?.school_id ?? null;
  const school = session?.school as { name?: string; school_code?: string } | null;
  const roles = session?.roles ?? [];
  const isSuper = roles.includes("superadmin");
  const isAdmin = isSuper || roles.includes("hoi");
  const { data: term } = useActiveTerm(schoolId);
  const [pick, setPick] = useState("");
  const [examGrade, setExamGrade] = useState("");

  const { data: schools } = useQuery({
    queryKey: ["all-schools"],
    enabled: isSuper,
    queryFn: async () => (await supabase.from("schools").select("id, name, school_code").order("name")).data ?? [],
  });

  const attach = useMutation({
    mutationFn: async (id?: string) => {
      const target = id ?? pick;
      if (!target) throw new Error("Choose a school first.");
      const { error } = await supabase.from("profiles").update({ school_id: target }).eq("id", profile!.id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("School linked to your account."); void qc.invalidateQueries({ queryKey: ["session-profile"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const createSchool = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") ?? "").trim();
      const code = String(form.get("code") ?? "").trim().toUpperCase();
      const county = String(form.get("county") ?? "").trim() || null;
      const year = Number(form.get("year") ?? new Date().getFullYear());
      if (!name || !code) throw new Error("Enter the school name and code.");
      if (!Number.isFinite(year)) throw new Error("Enter a valid year.");

      const { data: created, error } = await supabase
        .from("schools").insert({ name, school_code: code, county }).select("id").single();
      if (error) throw error;
      const sid = created.id;

      const { data: gradeRows, error: gErr } = await supabase.from("grades").insert(
        GRADE_PLAN.map((g, i) => ({ school_id: sid, name: g.name, band: g.band, level_order: i + 1 })),
      ).select("id, name");
      if (gErr) throw gErr;

      const { error: sErr } = await supabase.from("streams").insert(
        (gradeRows ?? []).map((g) => ({ school_id: sid, grade_id: g.id, name: "A" })),
      );
      if (sErr) throw sErr;

      const { data: ay, error: ayErr } = await supabase
        .from("academic_years").insert({ school_id: sid, year, is_active: true }).select("id").single();
      if (ayErr) throw ayErr;

      const { error: tErr } = await supabase.from("terms").insert(
        [1, 2, 3].map((n) => ({ school_id: sid, academic_year_id: ay.id, term_number: n, is_active: n === 1 })),
      );
      if (tErr) throw tErr;

      return sid;
    },
    onSuccess: async (sid) => {
      toast.success("School created with grades, streams and an academic year.");
      await attach.mutateAsync(sid);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: years } = useQuery({
    queryKey: ["academic-years", schoolId],
    enabled: !!schoolId,
    queryFn: async () => (await supabase.from("academic_years").select("id, year, is_active").eq("school_id", schoolId!).order("year", { ascending: false })).data ?? [],
  });

  const { data: terms } = useQuery({
    queryKey: ["all-terms", schoolId],
    enabled: !!schoolId,
    queryFn: async () => (await supabase.from("terms").select("id, term_number, is_active, academic_year_id").eq("school_id", schoolId!).order("term_number")).data ?? [],
  });

  const addYear = useMutation({
    mutationFn: async (form: FormData) => {
      const year = Number(form.get("year"));
      if (!Number.isFinite(year) || year < 2000) throw new Error("Enter a valid year.");
      const { data: ay, error } = await supabase
        .from("academic_years").insert({ school_id: schoolId!, year, is_active: false }).select("id").single();
      if (error) throw error;
      const { error: tErr } = await supabase.from("terms").insert(
        [1, 2, 3].map((n) => ({ school_id: schoolId!, academic_year_id: ay.id, term_number: n, is_active: false })),
      );
      if (tErr) throw tErr;
    },
    onSuccess: () => {
      toast.success("Academic year added with three terms.");
      void qc.invalidateQueries({ queryKey: ["academic-years"] });
      void qc.invalidateQueries({ queryKey: ["all-terms"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activate = useMutation({
    mutationFn: async (t: { id: string; academic_year_id: string }) => {
      await supabase.from("terms").update({ is_active: false }).eq("school_id", schoolId!).neq("id", t.id);
      await supabase.from("academic_years").update({ is_active: false }).eq("school_id", schoolId!).neq("id", t.academic_year_id);
      const { error } = await supabase.from("terms").update({ is_active: true }).eq("id", t.id);
      if (error) throw error;
      await supabase.from("academic_years").update({ is_active: true }).eq("id", t.academic_year_id);
    },
    onSuccess: () => {
      toast.success("Active term updated.");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () => (await supabase.from("grades").select("id, name").eq("school_id", schoolId!).order("level_order")).data ?? [],
  });

  const createExam = useMutation({
    mutationFn: async (form: FormData) => {
      const name = String(form.get("name") ?? "").trim();
      if (!name) throw new Error("Enter an exam name.");
      if (!term) throw new Error("No active term is set.");
      if (!examGrade) throw new Error("Choose the grade this exam is for.");
      const { error } = await supabase.from("exams").insert({
        school_id: schoolId!,
        term_id: term.id,
        academic_year_id: term.academic_years.id,
        grade_id: examGrade,
        name,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Exam created."); void qc.invalidateQueries({ queryKey: ["exams"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell title="Settings" subtitle="School, term and account configuration">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card-nuru p-5">
          <h2 className="flex items-center gap-2 font-display font-semibold"><School className="size-4 text-primary" /> Your school</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="School" value={school?.name ?? "Not linked"} />
            <Row label="Code" value={school?.school_code ?? "—"} />
            <Row label="Active term" value={term ? `Term ${term.term_number}` : "None"} />
            <Row label="Signed in as" value={profile?.full_name ?? "—"} />
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {roles.length ? roles.map((r) => <Badge key={r} variant="secondary">{r}</Badge>) : <Badge variant="outline">no role</Badge>}
          </div>

          {isSuper ? (
            <div className="mt-5 space-y-2 border-t border-border pt-4">
              <Label>Link my account to a school</Label>
              <div className="flex gap-2">
                <Select value={pick} onValueChange={setPick}>
                  <SelectTrigger><SelectValue placeholder="Select school" /></SelectTrigger>
                  <SelectContent>
                    {(schools ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.school_code})</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button onClick={() => attach.mutate(undefined)} disabled={attach.isPending}>
                  {attach.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Link
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        {isSuper ? (
          <section className="card-nuru p-5">
            <h2 className="flex items-center gap-2 font-display font-semibold"><Plus className="size-4 text-primary" /> Create a school</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sets up PP1–Grade 12, one stream per grade, an academic year and three terms, then links it to you.
            </p>
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => { e.preventDefault(); createSchool.mutate(new FormData(e.currentTarget)); }}
            >
              <Input name="name" placeholder="School name e.g. Malawa Primary School" required />
              <div className="grid gap-2 sm:grid-cols-3">
                <Input name="code" placeholder="Code e.g. MPS" required />
                <Input name="county" placeholder="County" />
                <Input name="year" type="number" defaultValue={new Date().getFullYear()} required />
              </div>
              <Button type="submit" className="w-full" disabled={createSchool.isPending}>
                {createSchool.isPending ? <Loader2 className="size-4 animate-spin" /> : <School className="size-4" />} Create school
              </Button>
            </form>
          </section>
        ) : null}

        {schoolId && isAdmin ? (
          <section className="card-nuru p-5">
            <h2 className="flex items-center gap-2 font-display font-semibold"><CalendarRange className="size-4 text-primary" /> Academic years & terms</h2>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(e) => { e.preventDefault(); addYear.mutate(new FormData(e.currentTarget)); e.currentTarget.reset(); }}
            >
              <Input name="year" type="number" placeholder={`${new Date().getFullYear() + 1}`} />
              <Button type="submit" disabled={addYear.isPending}>
                {addYear.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add year
              </Button>
            </form>
            <div className="mt-4 space-y-3">
              {(years ?? []).map((y) => (
                <div key={y.id} className="rounded-lg border border-border p-3">
                  <p className="font-display text-sm font-semibold">{y.year}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(terms ?? []).filter((t) => t.academic_year_id === y.id).map((t) => (
                      <Button
                        key={t.id}
                        size="sm"
                        variant={t.is_active ? "default" : "outline"}
                        disabled={activate.isPending || t.is_active}
                        onClick={() => activate.mutate({ id: t.id, academic_year_id: y.id })}
                      >
                        {t.is_active ? <CheckCircle2 className="size-3.5" /> : null} Term {t.term_number}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
              {(years ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No academic years yet.</p> : null}
            </div>
          </section>
        ) : null}

        <section className="card-nuru p-5">
          <h2 className="font-display font-semibold">Exams for the active term</h2>
          <p className="mt-1 text-sm text-muted-foreground">Create the assessments teachers will enter marks against.</p>
          <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); createExam.mutate(new FormData(e.currentTarget)); e.currentTarget.reset(); }}>
            <Select value={examGrade} onValueChange={setExamGrade}>
              <SelectTrigger><SelectValue placeholder="Grade this exam is for" /></SelectTrigger>
              <SelectContent>
                {(grades ?? []).map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input name="name" placeholder="e.g. Opener Exam" />
              <Button type="submit" disabled={createExam.isPending || !term}>
                {createExam.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Add
              </Button>
            </div>
          </form>
        </section>

        <section className="card-nuru p-5 lg:col-span-2">
          <h2 className="font-display font-semibold">Support</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            WhatsApp {NURU.whatsapp} · Email {NURU.email}
          </p>
        </section>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
