import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { GraduationCap, Search, Loader2, Wallet, BookOpen, ArrowLeft, Download, Lock } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { NURU, ksh, scoreToLevel } from "@/lib/nuru";

export const Route = createFileRoute("/parent")({
  head: () => ({
    meta: [
      { title: "Parent Portal — Check Fees & Results | Fanisi Digital Solutions" },
      { name: "description", content: "Parents: check your child's term fees balance, latest CBE results and download their report card or ID card. No login or OTP required." },
      { property: "og:title", content: "Parent Portal — Fanisi Digital Solutions" },
      { property: "og:description", content: "Check fees, results and attendance instantly with an admission number or your phone number." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ParentPage,
});

type Match = { id: string; adm_no: string; student_id: string | null; full_name: string; grade: string | null; stream: string | null; school_name: string };

function ParentPage() {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [adm, setAdm] = useState("");
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");

  const lookup = useMutation({
    mutationFn: async (args: { _adm_no: string; _guardian_phone: string }) => {
      const { data, error } = await supabase.rpc("parent_login", args);
      if (error) throw error;
      return (data ?? []) as Match[];
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
    onError: () => toast.error("Lookup failed. Please try again."),
  });

  async function open(m: Match) {
    const { data, error } = await supabase.rpc("parent_student_summary", { _student_id: m.id });
    if (error) {
      toast.error("Could not load the dashboard.");
      return;
    }
    setMatches(null);
    setSummary(data as Record<string, unknown>);
  }

  if (summary) return <Dashboard summary={summary} onBack={() => setSummary(null)} />;

  return (
    <div className="grid min-h-screen place-items-center bg-nuru-hero px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </div>
          <span className="font-display text-lg font-bold">Parent Portal</span>
        </Link>

        <div className="card-nuru p-6">
          {matches ? (
            <div>
              <h2 className="font-display font-semibold">Select your child</h2>
              <p className="mb-4 text-sm text-muted-foreground">More than one learner matched.</p>
              <div className="space-y-2">
                {matches.map((m) => (
                  <button key={m.id} onClick={() => open(m)}
                    className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-primary hover:bg-secondary/50">
                    <p className="font-medium">{m.full_name}</p>
                    <p className="text-xs text-muted-foreground">{m.adm_no} · {m.grade}{m.stream ? ` ${m.stream}` : ""}</p>
                  </button>
                ))}
              </div>
              <Button variant="ghost" className="mt-4 w-full" onClick={() => setMatches(null)}>Back</Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); lookup.mutate({ _adm_no: adm.trim(), _guardian_phone: phone.trim() }); }}>
              <div>
                <h2 className="font-display font-semibold">Parent sign in</h2>
                <p className="text-sm text-muted-foreground">Use your child&apos;s admission number and the phone number the school has for you.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adm">Admission number</Label>
                <Input id="adm" required value={adm} onChange={(e) => setAdm(e.target.value)} placeholder="SDA-2026-0005" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ph">Your phone number</Label>
                <Input id="ph" type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0722000111" />
              </div>
              <Button type="submit" className="w-full" disabled={lookup.isPending}>
                {lookup.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Open my child&apos;s portal
              </Button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          No password needed. USSD coming soon: dial *483*SCHOOLCODE#.<br />Help: {NURU.email}
        </p>
      </div>
    </div>
  );
}

function Dashboard({ summary, onBack }: { summary: Record<string, unknown>; onBack: () => void }) {
  const s = summary["student"] as Record<string, string | null>;
  const term = summary["term"] as { year?: number; term?: number } | null;
  const billed = Number(summary["billed"] ?? 0);
  const paid = Number(summary["paid"] ?? 0);
  const results = (summary["results"] ?? []) as { subject: string; score: number | null; exam: string }[];
  const balance = billed - paid;
  const unlocked = Boolean(summary["unlocked"]);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-nuru-deep px-4 py-6">
        <div className="mx-auto max-w-2xl">
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-3 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <ArrowLeft className="size-4" /> Search again
          </Button>
          <p className="text-xs uppercase tracking-widest text-sidebar-foreground/60">{s["school_name"]}</p>
          <h1 className="font-display text-2xl font-bold text-sidebar-foreground">{s["full_name"]}</h1>
          <p className="text-sm text-sidebar-foreground/70">
            {s["grade"]}{s["stream"] ? ` ${s["stream"]}` : ""} · {s["adm_no"]} · ID {s["student_id"] ?? "—"}
          </p>
          {term ? <Badge className="mt-3 bg-sidebar-primary text-sidebar-primary-foreground">{term.year} Term {term.term}</Badge> : null}
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <section className="card-nuru p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display font-semibold"><Wallet className="size-4 text-primary" /> Term fees</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-xs text-muted-foreground">Billed</p><p className="font-display font-bold">{ksh(billed)}</p></div>
            <div><p className="text-xs text-muted-foreground">Paid</p><p className="font-display font-bold text-success">{ksh(paid)}</p></div>
            <div><p className="text-xs text-muted-foreground">Balance</p><p className={`font-display font-bold ${balance > 0 ? "text-destructive" : "text-success"}`}>{ksh(balance)}</p></div>
          </div>
        </section>

        <section className="card-nuru p-5">
          <h2 className="mb-3 flex items-center gap-2 font-display font-semibold">
            {unlocked ? <BookOpen className="size-4 text-primary" /> : <Lock className="size-4 text-destructive" />} Latest results
          </h2>
          {!unlocked ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm font-medium text-destructive">Results are locked</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Clear the outstanding balance of <span className="font-semibold">{ksh(balance)}</span> to unlock this
                term's results, report card and ID card. Payments reflect here immediately once the school records them.
              </p>
              <Button className="mt-3" variant="outline" asChild>
                <a href={`mailto:${NURU.email}`} target="_blank" rel="noreferrer">Contact support by email</a>
              </Button>
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground">No marks published for this term yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {results.map((r, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span>{r.subject} <span className="text-xs text-muted-foreground">· {r.exam}</span></span>
                  <span className="font-mono font-semibold">{r.score ?? "—"} <Badge variant="secondary" className="ml-1">{scoreToLevel(r.score)}</Badge></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {unlocked ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" onClick={() => window.print()}><Download className="size-4" /> Print report card</Button>
            <Button variant="outline" asChild>
              <a href={`/verify/${s["adm_no"]}`}><Download className="size-4" /> View ID card</a>
            </Button>
          </div>
        ) : null}

        <p className="pb-6 text-center text-xs text-muted-foreground">Questions? Email {NURU.email}</p>
      </main>
    </div>
  );
}
