import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NURU } from "@/lib/nuru";
import { bootstrapFounder, FOUNDER_EMAIL, FOUNDER_PASSWORD } from "@/lib/bootstrap.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff Sign In — Nuru Technologies" },
      { name: "description", content: "Secure sign in for school heads, teachers and administrators using the Nuru Technologies school management system." },
      { property: "og:title", content: "Staff Sign In — Nuru Technologies" },
      { property: "og:description", content: "Secure sign in for school heads, teachers and administrators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Z]/, "Needs one uppercase letter")
  .regex(/[0-9]/, "Needs one number")
  .regex(/[^A-Za-z0-9]/, "Needs one symbol");

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/dashboard" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin, data: { full_name: fullName } },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Check your email to confirm your account.");
      return;
    }
    navigate({ to: "/dashboard" });
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  async function setupFounder() {
    setBusy(true);
    try {
      const res = await bootstrapFounder();
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({
        email: FOUNDER_EMAIL,
        password: FOUNDER_PASSWORD,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Super admin ready. Welcome.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Setup failed.");
    } finally {
      setBusy(false);
    }
  }




  return (
    <div className="grid min-h-screen bg-nuru-hero px-4 py-10 place-items-center">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </div>
          <span className="font-display text-lg font-bold">NURU Technologies</span>
        </Link>

        <div className="card-nuru p-6">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="e1">Email</Label>
                  <Input id="e1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="head@school.ac.ke" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p1">Password</Label>
                  <Input id="p1" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null} Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-4 pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="n2">Full name</Label>
                  <Input id="n2" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e2">Email</Label>
                  <Input id="e2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="p2">Password</Label>
                  <Input id="p2" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Min 8 characters, 1 uppercase, 1 number, 1 symbol.</p>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null} Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
        </div>

        <div className="card-nuru mt-4 p-4">
          <p className="font-display text-sm font-semibold">First-time setup</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Activates the founder super admin account ({FOUNDER_EMAIL}) with the password{" "}
            <span className="font-mono font-semibold">{FOUNDER_PASSWORD}</span>. Runs only once — change the
            password after signing in.
          </p>
          <Button variant="secondary" className="mt-3 w-full" disabled={busy} onClick={setupFounder}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Activate super admin & sign in
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Parent? <Link to="/parent" className="font-medium text-primary">Check your child's progress</Link> — no login required.
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">Support: {NURU.whatsapp}</p>
      </div>
    </div>
  );
}
