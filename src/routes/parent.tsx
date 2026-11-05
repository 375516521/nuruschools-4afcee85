
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  GraduationCap,
  Search,
  Loader2,
  Wallet,
  BookOpen,
  ArrowLeft,
  Download,
  Lock,
  Users,
  Bell,
  Printer,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KARLI, ksh, scoreToLevel } from "@/lib/karli";
import { familyTotals, memberBalance, siblingDiscountFor, type FamilyPayload } from "@/lib/family";

export const Route = createFileRoute("/parent")({
  head: () => ({
    meta: [
      { title: "Parent Portal — Check Fees & Results | Karlisoft" },
      {
        name: "description",
        content:
          "Parents: check your child's term fees balance, latest CBE results and download their report card or ID card. No login or OTP required.",
      },
      { property: "og:title", content: "Parent Portal — Karlisoft" },
      {
        property: "og:description",
        content: "Check fees, results and attendance instantly with an admission number or your phone number.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ParentPage,
});

type Match = {
  id: string;
  adm_no: string;
  student_id: string | null;
  full_name: string;
  grade: string | null;
  stream: string | null;
  school_name: string;
};

function ParentPage() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [familyData, setFamilyData] = useState<FamilyPayload | null>(null);
  const [viewMode, setViewMode] = useState<"student" | "family">("student");

  const [adm, setAdm] = useState("");
  const [phone, setPhone] = useState("");

  const lookup = useMutation({
    mutationFn: async (args: { _adm_no: string; _guardian_phone: string }) => {
      // 1. Check student match
      const { data: students, error: sErr } = await supabase.rpc("parent_login", args);
      if (sErr) throw sErr;

      // 2. Check if student is in a family
      const { data: famRes } = await supabase.rpc("parent_family", args);
      if (famRes && (famRes as FamilyPayload).family) {
        setFamilyData(famRes as unknown as FamilyPayload);
      } else {
        setFamilyData(null);
      }

      return (students ?? []) as Match[];
    },
    onSuccess: async (rows) => {
      if (rows.length === 0) {
        toast.error("No learner found. Check the details and try again.");
        setMatches(null);
        return;
      }
      if (rows.length === 1) {
        await open(rows[0]!);
        return;
      }
      setMatches(rows);
    },
    onError: () => toast.error("Lookup failed. Please verify admission number and phone."),
  });

  async function open(m: Match) {
    const { data, error } = await supabase.rpc("parent_student_summary", { _student_id: m.id });
    if (error) {
      toast.error("Could not load the dashboard.");
      return;
    }
    setMatches(null);
    setSummary(data as Record<string, unknown>);
    setViewMode("student");
  }

  if (summary) {
    return (
      <Dashboard
        summary={summary}
        familyData={familyData}
        viewMode={viewMode}
        setViewMode={setViewMode}
        onBack={() => {
          setSummary(null);
          setFamilyData(null);
          setViewMode("student");
        }}
      />
    );
  }

  return (
    <div className="grid min-h-screen place-items-center bg-karli-hero px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </div>
          <span className="font-display text-lg font-bold">Parent Portal</span>
        </Link>

        <div className="card-karli p-6">
          {matches ? (
            <div>
              <h2 className="font-display font-semibold">Select your child</h2>
              <p className="mb-4 text-sm text-muted-foreground">More than one learner matched this record.</p>
              <div className="space-y-2">
                {matches.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => open(m)}
                    className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-secondary/50"
                  >
                    <p className="font-medium">{m.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.adm_no} · {m.grade}
                      {m.stream ? ` ${m.stream}` : ""}
                    </p>
                  </button>
                ))}
              </div>
              <Button variant="ghost" className="mt-4 w-full" onClick={() => setMatches(null)}>
                Back
              </Button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                lookup.mutate({ _adm_no: adm.trim(), _guardian_phone: phone.trim() });
              }}
            >
              <div>
                <h2 className="font-display font-semibold">Parent Sign In</h2>
                <p className="text-sm text-muted-foreground">
                  Enter your child&apos;s admission number and registered guardian phone number.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adm">Admission Number</Label>
                <Input
                  id="adm"
                  required
                  value={adm}
                  onChange={(e) => setAdm(e.target.value)}
                  placeholder="e.g. SDA-2026-0005"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ph">Guardian Phone Number</Label>
                <Input
                  id="ph"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 0722000111"
                />
              </div>
              <Button type="submit" className="w-full" disabled={lookup.isPending}>
                {lookup.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Search className="size-4 mr-1" />}
                Open Portal
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          No password required · Fast & direct access
          <br />
          Technical Support: {KARLI.email}
        </p>
      </div>
    </div>
  );
}

function Dashboard({
  summary,
  familyData,
  viewMode,
  setViewMode,
  onBack,
}: {
  summary: Record<string, unknown>;
  familyData: FamilyPayload | null;
  viewMode: "student" | "family";
  setViewMode: (v: "student" | "family") => void;
  onBack: () => void;
}) {
  const s = summary["student"] as Record<string, string | null>;
  const schoolId = s["school_id"];
  const term = summary["term"] as { year?: number; term?: number } | null;
  const billed = Number(summary["billed"] ?? 0);
  const paid = Number(summary["paid"] ?? 0);
  const results = (summary["results"] ?? []) as { subject: string; score: number | null; exam: string }[];
  const balance = billed - paid;
  const unlocked = Boolean(summary["unlocked"]);

  // Notices query (visible even when balance > 0)
  const { data: notices } = useQuery({
    queryKey: ["parent-notices", schoolId],
    enabled: !!schoolId,
    queryFn: async () =>
      (
        await supabase
          .from("notices")
          .select("id, title, body, created_at")
          .eq("school_id", schoolId!)
          .order("created_at", { ascending: false })
          .limit(5)
      ).data ?? [],
  });

  const famTotals = familyData ? familyTotals(familyData) : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-karli-deep px-4 py-6 text-sidebar-foreground">
        <div className="mx-auto max-w-2xl">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            className="mb-3 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <ArrowLeft className="size-4 mr-1" /> Search another learner
          </Button>

          <p className="text-xs uppercase tracking-widest text-sidebar-foreground/60">{s["school_name"]}</p>
          <h1 className="font-display text-2xl font-bold">{s["full_name"]}</h1>
          <p className="text-sm text-sidebar-foreground/70">
            {s["grade"]}
            {s["stream"] ? ` ${s["stream"]}` : ""} · {s["adm_no"]} · ID {s["student_id"] ?? "—"}
          </p>

          <div className="mt-3 flex items-center gap-2">
            {term ? (
              <Badge className="bg-sidebar-primary text-sidebar-primary-foreground">
                {term.year} Term {term.term}
              </Badge>
            ) : null}
            {familyData && (
              <Badge variant="outline" className="border-sidebar-foreground/30 text-sidebar-foreground">
                Family: {familyData.family.fam_no}
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        {/* FAMILY BANNER */}
        {familyData && familyData.members.length > 1 && (
          <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 p-3.5">
            <div className="flex items-center gap-2.5">
              <Users className="size-5 text-primary shrink-0" />
              <div>
                <p className="text-sm font-semibold text-primary">Family Group: {familyData.family.fam_no}</p>
                <p className="text-xs text-muted-foreground">
                  You have {familyData.members.length} children registered under this family account.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={viewMode === "family" ? "secondary" : "default"}
              onClick={() => setViewMode(viewMode === "family" ? "student" : "family")}
            >
              {viewMode === "family" ? "Single Student" : "View Family Dashboard"}
            </Button>
          </div>
        )}

        {/* NOTICE BOARD (ALWAYS VISIBLE EVEN IF BALANCE > 0) */}
        {notices && notices.length > 0 && (
          <section className="card-karli p-5">
            <h2 className="mb-3 flex items-center gap-2 font-display font-semibold">
              <Bell className="size-4 text-primary" /> Notice Board
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
              </span>
            </h2>
            <div className="space-y-3">
              {notices.map((n) => (
                <div key={n.id} className="rounded-md border p-3 bg-muted/20">
                  <div className="flex justify-between items-baseline">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(n.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{n.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* VIEW 1: FAMILY DASHBOARD */}
        {viewMode === "family" && familyData && famTotals ? (
          <div className="space-y-5">
            <section className="card-karli p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="flex items-center gap-2 font-display font-semibold">
                  <Users className="size-4 text-primary" /> Combined Family Finances
                </h2>
                <Button size="sm" variant="outline" onClick={() => window.print()}>
                  <Printer className="size-3.5 mr-1" /> Combined Statement
                </Button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-2 border rounded-md">
                  <p className="text-xs text-muted-foreground">Combined Billed</p>
                  <p className="font-display font-bold text-sm">{ksh(famTotals.billed)}</p>
                </div>
                <div className="p-2 border rounded-md">
                  <p className="text-xs text-muted-foreground">Total Paid</p>
                  <p className="font-display font-bold text-sm text-emerald-600">{ksh(famTotals.paid)}</p>
                </div>
                <div className="p-2 border rounded-md">
                  <p className="text-xs text-muted-foreground">Sibling Discount</p>
                  <p className="font-display font-bold text-sm text-primary">-{ksh(famTotals.discount)}</p>
                </div>
                <div className="p-2 border rounded-md">
                  <p className="text-xs text-muted-foreground">Combined Balance</p>
                  <p
                    className={`font-display font-bold text-sm ${famTotals.balance > 0 ? "text-destructive" : "text-emerald-600"}`}
                  >
                    {famTotals.balance > 0 ? ksh(famTotals.balance) : "Cleared"}
                  </p>
                </div>
              </div>

              {famTotals.credit > 0 && (
                <div className="mt-3 p-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                  <Sparkles className="size-3.5 shrink-0" />
                  Family Wallet Credit Available: <span className="font-semibold">{ksh(famTotals.credit)}</span> (Applied to next term)
                </div>
              )}
            </section>

            {/* INDIVIDUAL CHILD BREAKDOWNS */}
            <section className="space-y-3">
              <h3 className="font-display font-semibold text-sm">Learner Fee Breakdowns</h3>
              {familyData.members.map((kid, idx) => {
                const discount = siblingDiscountFor(idx, kid.billed, familyData.family);
                const kidBal = memberBalance(kid, familyData.family, idx);
                return (
                  <Card key={kid.id}>
                    <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-semibold">{kid.full_name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          Adm: {kid.adm_no} · {kid.grade} {kid.stream || ""}
                        </p>
                      </div>
                      <Badge variant={kidBal > 0 ? "destructive" : "outline"}>
                        {kidBal > 0 ? `Balance: ${ksh(kidBal)}` : "Cleared"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="py-2 px-4 text-xs space-y-1 border-t">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Tuition & Fees:</span>
                        <span>{ksh(kid.billed)}</span>
                      </div>
                      {discount > 0 && (
                        <div className="flex justify-between text-primary font-medium">
                          <span>Sibling Discount:</span>
                          <span>-{ksh(discount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Amount Paid:</span>
                        <span className="text-emerald-600 font-medium">{ksh(kid.paid)}</span>
                      </div>
                      {kid.wallet > 0 && (
                        <div className="flex justify-between text-emerald-600">
                          <span>Wallet Credit:</span>
                          <span>+{ksh(kid.wallet)}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </section>
          </div>
        ) : (
          /* VIEW 2: SINGLE STUDENT VIEW */
          <>
            <section className="card-karli p-5">
              <h2 className="mb-3 flex items-center gap-2 font-display font-semibold">
                <Wallet className="size-4 text-primary" /> Term Fees
              </h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Billed</p>
                  <p className="font-display font-bold">{ksh(billed)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="font-display font-bold text-emerald-600">{ksh(paid)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Balance</p>
                  <p className={`font-display font-bold ${balance > 0 ? "text-destructive" : "text-emerald-600"}`}>
                    {balance > 0 ? ksh(balance) : "Cleared"}
                  </p>
                </div>
              </div>
            </section>

            <section className="card-karli p-5">
              <h2 className="mb-3 flex items-center gap-2 font-display font-semibold">
                {unlocked ? <BookOpen className="size-4 text-primary" /> : <Lock className="size-4 text-destructive" />}{" "}
                Latest Results
              </h2>
              {!unlocked ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <p className="text-sm font-medium text-destructive">Results are locked</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Clear the outstanding balance of <span className="font-semibold">{ksh(balance)}</span> to unlock
                    this term&apos;s report card, results breakdown, and student ID card.
                  </p>
                  <Button className="mt-3" variant="outline" asChild>
                    <a href={`mailto:${KARLI.email}`} target="_blank" rel="noreferrer">
                      Contact School Office
                    </a>
                  </Button>
                </div>
              ) : results.length === 0 ? (
                <p className="text-sm text-muted-foreground">No marks published for this term yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {results.map((r, i) => (
                    <li key={i} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        {r.subject} <span className="text-xs text-muted-foreground">· {r.exam}</span>
                      </span>
                      <span className="font-mono font-semibold">
                        {r.score ?? "—"}{" "}
                        <Badge variant="secondary" className="ml-1">
                          {scoreToLevel(r.score)}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {unlocked ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="outline" onClick={() => window.print()}>
                  <Download className="size-4 mr-1" /> Print Report Card
                </Button>
                <Button variant="outline" asChild>
                  <a href={`/verify/${s["adm_no"]}`}>
                    <Download className="size-4 mr-1" /> View ID Card
                  </a>
                </Button>
              </div>
            ) : null}
          </>
        )}

        <p className="pb-6 text-center text-xs text-muted-foreground">Questions or inquiries? Email {KARLI.email}</p>
      </main>
    </div>
  );
}

