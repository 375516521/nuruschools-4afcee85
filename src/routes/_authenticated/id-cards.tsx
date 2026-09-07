import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Printer, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession } from "@/components/AppShell";
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
import { verifyUrl, NURU } from "@/lib/nuru";
import { SchoolLogo, type SchoolInfo } from "@/components/SchoolLetterhead";

export const Route = createFileRoute("/_authenticated/id-cards")({
  component: IdCardsPage,
});

function IdCardsPage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const school = session?.school as SchoolInfo;
  const qc = useQueryClient();
  const [gradeId, setGradeId] = useState("");

  const { data: grades } = useQuery({
    queryKey: ["grades", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (await supabase.from("grades").select("*").eq("school_id", schoolId!).order("level_order"))
        .data ?? [],
  });

  const { data: config } = useQuery({
    queryKey: ["grade-id-config", gradeId],
    enabled: !!gradeId,
    queryFn: async () =>
      (await supabase.from("grade_id_configs").select("*").eq("grade_id", gradeId).maybeSingle())
        .data,
  });

  const { data: students } = useQuery({
    queryKey: ["id-card-students", gradeId],
    enabled: !!gradeId,
    queryFn: async () =>
      (
        await supabase
          .from("students")
          .select("*, streams(name), grades(name)")
          .eq("grade_id", gradeId)
          .eq("status", "active")
          .order("adm_no")
      ).data ?? [],
  });

  const saveRange = useMutation({
    mutationFn: async (form: FormData) => {
      const start = Number(form.get("start"));
      const upto = Number(form.get("upto"));
      const prefix = String(form.get("prefix") ?? "")
        .trim()
        .toUpperCase();
      if (!prefix) throw new Error("Enter an ID prefix, e.g. SDA-G4.");
      if (!Number.isInteger(start) || !Number.isInteger(upto) || start < 1 || upto < start) {
        throw new Error("Enter a valid range — 'up to' must be greater than 'start from'.");
      }
      const { error } = await supabase.from("grade_id_configs").upsert(
        {
          school_id: schoolId!,
          grade_id: gradeId,
          id_prefix: prefix,
          start_number: start,
          upto_number: upto,
        },
        { onConflict: "grade_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ID range saved.");
      void qc.invalidateQueries({ queryKey: ["grade-id-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remaining = config ? config.upto_number - config.last_number : 0;

  return (
    <AppShell
      title="ID cards"
      subtitle="Set a number range per grade, then print 10 cards per A4 sheet"
      actions={
        <Button size="sm" onClick={() => window.print()} disabled={!students?.length}>
          <Printer className="size-4" /> Print sheet
        </Button>
      }
    >
      <div className="mb-5 grid gap-4 lg:grid-cols-[280px_1fr] print:hidden">
        <div className="card-nuru space-y-3 p-5">
          <div className="space-y-1.5">
            <Label>Grade</Label>
            <Select value={gradeId} onValueChange={setGradeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a grade" />
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

          {gradeId ? (
            <form
              key={gradeId}
              className="space-y-3 border-t border-border pt-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveRange.mutate(new FormData(e.currentTarget));
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="prefix">ID prefix</Label>
                <Input
                  id="prefix"
                  name="prefix"
                  defaultValue={config?.id_prefix ?? `${school?.school_code ?? "SCH"}-`}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="start">Start from</Label>
                  <Input
                    id="start"
                    name="start"
                    type="number"
                    min={1}
                    defaultValue={config?.start_number ?? 1}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="upto">Up to</Label>
                  <Input
                    id="upto"
                    name="upto"
                    type="number"
                    min={1}
                    defaultValue={config?.upto_number ?? 100}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Last issued: <strong>{config?.last_number ?? "—"}</strong> · Remaining:{" "}
                <strong>{remaining}</strong>
              </p>
              <Button type="submit" size="sm" className="w-full" disabled={saveRange.isPending}>
                {saveRange.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}{" "}
                Save range
              </Button>
            </form>
          ) : null}
        </div>

        <div className="card-nuru grid place-items-center p-5 text-center text-sm text-muted-foreground">
          {gradeId
            ? `${students?.length ?? 0} active learners ready to print.`
            : "Pick a grade to preview its ID cards."}
        </div>
      </div>

      {pages.map((page, pi) => (
        <div
          key={pi}
          className="card-nuru print-sheet mb-4 grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 print:mb-0 print:grid-cols-2 print:gap-[4mm] print:break-after-page"
        >
          {page.map((s) => (
            <article
              key={s.id}
              className="break-inside-avoid overflow-hidden rounded-xl border border-border bg-card shadow-sm print:h-[58mm] print:shadow-none"
            >
              <header className="id-card-header flex items-center gap-2 bg-nuru-deep px-3 py-2 text-sidebar-foreground">
                <SchoolLogo
                  school={school}
                  className="size-9 bg-sidebar-primary text-sidebar-primary-foreground"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-xs font-bold uppercase">
                    {school?.name}
                  </p>
                  <p className="truncate text-[9px] text-sidebar-foreground/70">
                    {[school?.county ? `${school.county} County` : null, school?.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <span className="rounded bg-sidebar-primary px-1.5 py-0.5 text-[8px] font-bold tracking-widest text-sidebar-primary-foreground uppercase">
                  Student ID
                </span>
              </header>
              <div className="flex gap-3 p-3">
                {s.photo_url ? (
                  <img
                    src={s.photo_url}
                    alt={`${s.first_name} ${s.last_name}`}
                    className="size-20 shrink-0 rounded-lg border border-border object-cover"
                  />
                ) : (
                  <div className="grid size-20 shrink-0 place-items-center rounded-lg border border-border bg-secondary font-display text-lg font-bold text-primary">
                    {s.first_name[0]}
                    {s.last_name[0]}
                  </div>
                )}
                <div className="min-w-0 flex-1 text-[11px] leading-snug">
                  <p className="truncate font-display text-sm font-bold">
                    {s.first_name} {s.last_name}
                  </p>
                  <p className="text-muted-foreground">
                    {(s.grades as { name?: string } | null)?.name}
                    {(s.streams as { name?: string } | null)?.name
                      ? ` ${(s.streams as { name?: string }).name}`
                      : ""}
                  </p>
                  <p className="mt-1 font-mono">ADM {s.adm_no}</p>
                  <p className="font-mono">ID {s.student_id ?? "—"}</p>
                  {s.guardian_phone ? (
                    <p className="truncate text-muted-foreground">Guardian {s.guardian_phone}</p>
                  ) : null}
                </div>
                <div className="shrink-0 text-center">
                  <QRCodeSVG value={verifyUrl(s.adm_no)} size={54} />
                  <p className="mt-1 text-[7px] text-muted-foreground">Scan to verify</p>
                </div>
              </div>
              <footer className="flex items-center justify-between border-t border-border bg-secondary/60 px-3 py-1.5 text-[8px] text-muted-foreground">
                <span>
                  {school?.school_code}
                  {school?.uli_code ? ` · ULI ${school.uli_code}` : ""} · Valid{" "}
                  {new Date().getFullYear()}
                </span>
                <span>{NURU.name}</span>
              </footer>
            </article>
          ))}
        </div>
      ))}

    </AppShell>
  );
}
