import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Plus, School } from "lucide-react";
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

function SettingsPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const profile = session?.profile as { id?: string; school_id?: string; full_name?: string } | null;
  const schoolId = profile?.school_id ?? null;
  const school = session?.school as { name?: string; school_code?: string } | null;
  const roles = session?.roles ?? [];
  const isSuper = roles.includes("superadmin");
  const { data: term } = useActiveTerm(schoolId);
  const [pick, setPick] = useState("");
  const [examGrade, setExamGrade] = useState("");

  const { data: schools } = useQuery({
    queryKey: ["all-schools"],
    enabled: isSuper,
    queryFn: async () => (await supabase.from("schools").select("id, name, school_code").order("name")).data ?? [],
  });

  const attach = useMutation({
    mutationFn: async () => {
      if (!pick) throw new Error("Choose a school first.");
      const { error } = await supabase.from("profiles").update({ school_id: pick }).eq("id", profile!.id!);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("School linked to your account."); void qc.invalidateQueries({ queryKey: ["session"] }); },
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
                <Button onClick={() => attach.mutate()} disabled={attach.isPending}>
                  {attach.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Link
                </Button>
              </div>
            </div>
          ) : null}
        </section>

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
