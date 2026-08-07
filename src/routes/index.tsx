import { createFileRoute, Link } from "@tanstack/react-router";
import {
  GraduationCap, IdCard, Wallet, Sparkles, ShieldCheck, Users,
  ArrowRight, Check, QrCode, BarChart3, MessageCircle, Mail,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NURU, PLANS, ksh } from "@/lib/nuru";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Nuru Technologies — CBC School Management System for Kenya" },
      { name: "description", content: "Nuru Technologies runs your whole school: CBC assessment, auto admission numbers, QR student ID cards, fees & MPESA reconciliation, parent access and AI reports." },
      { property: "og:title", content: "Nuru Technologies — CBC School Management System" },
      { property: "og:description", content: "Admissions, CBC grading, QR ID cards, fees, parent access and AI analytics for Kenyan schools." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: IdCard, title: "QR Student ID Engine", body: "HOI sets a prefix and range per grade. IDs generate automatically, never change on promotion, and print 10-up on A4." },
  { icon: GraduationCap, title: "CBC Assessment", body: "EE1 to BE grading with configurable ranges, plus the seven CBC core competencies scored per learner per term." },
  { icon: Wallet, title: "Fees & MPESA", body: "Fee structures per year, term, grade and stream. Record cash, bank or MPESA payments and see live balances." },
  { icon: Users, title: "Parent Access, No Login", body: "Parents type an admission number, or a learner's first name plus their phone, and see fees, results and ID cards instantly." },
  { icon: Sparkles, title: "AI Report Comments", body: "Generate unique, learner-specific comments for a whole stream in one click, plus exam analysis and defaulter prediction." },
  { icon: ShieldCheck, title: "Locked-Down Security", body: "Role-based access, row-level isolation per school, immutable admission numbers and a full audit trail." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </div>
          <div className="mr-auto leading-tight">
            <p className="font-display text-sm font-bold">NURU</p>
            <p className="text-[11px] text-muted-foreground">Technologies</p>
          </div>
          <Button asChild variant="ghost" size="sm"><Link to="/parent">Parents</Link></Button>
          <Button asChild size="sm"><Link to="/auth">Staff login</Link></Button>
        </div>
      </header>

      <section className="bg-nuru-hero">
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <Badge variant="secondary" className="mb-5 gap-1.5">
            <Sparkles className="size-3" /> Built for the Kenyan CBC curriculum
          </Badge>
          <h1 className="max-w-3xl font-display text-4xl leading-[1.1] font-extrabold tracking-tight md:text-6xl">
            One system to run your <span className="text-nuru-gradient">entire school</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground md:text-lg">{NURU.tagline}. From admission number to graduation — admissions, CBC assessment, QR ID cards, fees, parent access and AI-powered reports.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/auth">Open the school dashboard <ArrowRight className="size-4" /></Link></Button>
            <Button asChild size="lg" variant="outline"><Link to="/parent">I'm a parent</Link></Button>
          </div>
          <dl className="mt-12 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
            {[["14", "Grade levels"], ["7", "CBC bands"], ["<1.5s", "Load time"], ["99.9%", "Uptime SLA"]].map(([v, l]) => (
              <div key={l}>
                <dt className="font-display text-2xl font-bold text-primary">{v}</dt>
                <dd className="text-xs text-muted-foreground">{l}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <h2 className="font-display text-2xl font-bold md:text-3xl">Everything a school actually needs</h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <article key={title} className="card-nuru p-5">
              <div className="mb-3 grid size-10 place-items-center rounded-lg bg-secondary text-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="font-display text-base font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-nuru-deep py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="font-display text-2xl font-bold text-sidebar-foreground md:text-3xl">
            The <span className="text-sidebar-primary">ID card engine</span>, done properly
          </h2>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              { icon: IdCard, t: "Set the range once", d: "Grade 7 → prefix GR7, 001 to 200. The system blocks issue #201 instead of silently duplicating." },
              { icon: QrCode, t: "Every card carries a QR", d: "Scan it anywhere to verify the learner at /verify/{admission-no} — no login needed." },
              { icon: BarChart3, t: "Track utilisation", d: "See IDs used 145 / 200 per grade, then bulk-generate and print 10 cards per A4 sheet." },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="rounded-xl bg-sidebar-accent/50 p-5">
                <Icon className="mb-3 size-6 text-sidebar-primary" />
                <h3 className="font-display font-semibold text-sidebar-foreground">{t}</h3>
                <p className="mt-1.5 text-sm text-sidebar-foreground/70">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 md:py-20">
        <h2 className="font-display text-2xl font-bold md:text-3xl">Simple annual pricing</h2>
        <p className="mt-2 text-sm text-muted-foreground">All tiers include 24/7 WhatsApp support under 1 hour and two onsite training sessions.</p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <article key={p.name} className={`card-nuru p-6 ${i === 1 ? "ring-2 ring-primary" : ""}`}>
              {i === 1 ? <Badge className="mb-3">Most popular</Badge> : null}
              <h3 className="font-display text-lg font-bold">{p.name}</h3>
              <p className="mt-1 font-display text-3xl font-extrabold text-primary">{ksh(p.price)}</p>
              <p className="text-xs text-muted-foreground">per year</p>
              <p className="mt-3 text-sm text-muted-foreground">{p.blurb}</p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {["Unlimited learners", "Onsite staff training", "99.9% uptime SLA"].map((f) => (
                  <li key={f} className="flex gap-2"><Check className="size-4 shrink-0 text-success" />{f}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-border bg-secondary/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm sm:flex-row sm:items-center">
          <p className="mr-auto font-display font-semibold">{NURU.name}</p>
          <a href={NURU.whatsappLink} className="flex items-center gap-2 text-muted-foreground hover:text-primary">
            <MessageCircle className="size-4" /> {NURU.whatsapp}
          </a>
          <a href={`mailto:${NURU.email}`} className="flex items-center gap-2 text-muted-foreground hover:text-primary">
            <Mail className="size-4" /> {NURU.email}
          </a>
        </div>
      </footer>
    </div>
  );
}
