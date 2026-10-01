import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, IdCard, Wallet, TrendingUp, ArrowRight, AlertCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { AppShell, useSession, useActiveTerm } from "@/components/AppShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ksh } from "@/lib/nuru";
import { useHoiAccess, canUseRoute } from "@/lib/access";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { data: session } = useSession();
  const schoolId = (session?.profile as { school_id?: string } | null)?.school_id ?? null;
  const school = session?.school as { name?: string; school_code?: string } | null;
  const { data: term } = useActiveTerm(schoolId);
  const roles = session?.roles ?? [];
  const isSuper = roles.includes("superadmin");
  const { data: access } = useHoiAccess(session?.user?.id ?? null);

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", schoolId, term?.id],
    enabled: !!schoolId,
    queryFn: async () => {
      const [students, teachers, configs, payments, structures] = await Promise.all([
        supabase.from("students").select("id, status, grade_id", { count: "exact" }).eq("school_id", schoolId!),
        supabase.from("teachers").select("id", { count: "exact", head: true }).eq("school_id", schoolId!),
        supabase.from("grade_id_configs").select("last_number, start_number, upto_number").eq("school_id", schoolId!),
        term ? supabase.from("fee_payments").select("amount").eq("school_id", schoolId!).eq("term_id", term.id) : Promise.resolve({ data: [] }),
        term ? supabase.from("fee_structures").select("amount, grade_id").eq("school_id", schoolId!).eq("term_id", term.id) : Promise.resolve({ data: [] }),
      ]);
      const rows = students.data ?? [];
      const active = rows.filter((r) => r.status === "active");
      const idsIssued = (configs.data ?? []).reduce((a, c) => a + Math.max(0, c.last_number - (c.start_number - 1)), 0);
      const idsCapacity = (configs.data ?? []).reduce((a, c) => a + (c.upto_number - c.start_number + 1), 0);
      const collected = (payments.data ?? []).reduce((a, p) => a + Number(p.amount), 0);
      const perGrade = new Map<string, number>();
      for (const f of structures.data ?? []) perGrade.set(f.grade_id, (perGrade.get(f.grade_id) ?? 0) + Number(f.amount));
      const billed = active.reduce((a, s) => a + (s.grade_id ? (perGrade.get(s.grade_id) ?? 0) : 0), 0);
      return {
        total: rows.length, active: active.length,
        teachers: teachers.count ?? 0,
        idsIssued, idsCapacity, collected, billed,
      };
    },
  });

  const pct = stats && stats.billed > 0 ? Math.round((stats.collected / stats.billed) * 100) : 0;
  const termLabel = term ? `${(term as { academic_years?: { year?: number } }).academic_years?.year} Term ${term.term_number}` : "No active term";

  return (
    <AppShell title={school?.name ?? "Dashboard"} subtitle={`${termLabel} · ${roles.join(", ") || "no role assigned"}`}>
      {!schoolId ? (
        <div className="card-nuru flex items-start gap-3 p-5">
          <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <h2 className="font-display font-semibold">You are not attached to a school yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              A SuperAdmin needs to assign your account to a school before data appears here.
              {roles.includes("superadmin") ? " As SuperAdmin you can open Settings to link yourself to a school." : ""}
            </p>
            <Button asChild size="sm" className="mt-3"><Link to="/settings">Open settings</Link></Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Active learners" value={String(stats?.active ?? 0)} sub={`${stats?.total ?? 0} total on roll`} />
        <StatCard icon={IdCard} label="ID cards issued" value={`${stats?.idsIssued ?? 0} / ${stats?.idsCapacity ?? 0}`} sub="Across all grades" />
        <StatCard icon={Wallet} label="Collected this term" value={ksh(stats?.collected)} sub={`Billed ${ksh(stats?.billed)}`} />
        <StatCard icon={TrendingUp} label="Collection rate" value={`${pct}%`} sub={pct >= 80 ? "On track" : "Follow up defaulters"} />
      </div>

      <section className="card-nuru mt-5 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display font-semibold">Fee collection — {termLabel}</h2>
          <Badge variant={pct >= 80 ? "default" : "secondary"}>{pct}%</Badge>
        </div>
        <Progress value={pct} />
        <p className="mt-2 text-sm text-muted-foreground">{ksh(stats?.collected)} collected of {ksh(stats?.billed)} billed.</p>
      </section>

      <section className="mt-5 grid gap-4 md:grid-cols-3">
        {[
          { to: "/students", title: "Add a learner", body: "Admission number and student ID generate automatically." },
          { to: "/id-cards", title: "Print ID cards", body: "Set ranges per grade, then bulk print 8 cards per A4 page." },
          { to: "/fees", title: "Record a payment", body: "Cash, bank or MPESA — balances update instantly." },
        ]
          .filter((c) => canUseRoute(c.to, isSuper, access ?? null, roles))
          .map((c) => (
          <Link key={c.to} to={c.to} className="card-nuru group p-5 transition-colors hover:border-primary">
            <h3 className="flex items-center gap-2 font-display font-semibold">
              {c.title} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
          </Link>
          ))}
      </section>
    </AppShell>
  );
}

function StatCard({ icon: Icon, label, value, sub }: {
  icon: typeof Users; label: string; value: string; sub: string;
}) {
  return (
    <div className="card-nuru p-5">
      <div className="mb-3 grid size-9 place-items-center rounded-lg bg-secondary text-primary">
        <Icon className="size-4" />
      </div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}
