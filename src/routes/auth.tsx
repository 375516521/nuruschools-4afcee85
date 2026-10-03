import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GraduationCap, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { signInWithUsername } from "@/lib/login.functions";
import { NURU } from "@/lib/nuru";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Staff Sign In — Fanisi Digital Solutions" },
      { name: "description", content: "Secure sign in for school heads, teachers and administrators using the Fanisi Digital Solutions school management system." },
      { property: "og:title", content: "Staff Sign In — Fanisi Digital Solutions" },
      { property: "og:description", content: "Secure sign in for school heads, teachers and administrators." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const signInUsername = useServerFn(signInWithUsername);
  const [forgot, setForgot] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const id = email.trim();
    if (id.includes("@")) {
      const { error } = await supabase.auth.signInWithPassword({ email: id.toLowerCase(), password });
      setBusy(false);
      if (error) {
        toast.error(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
        return;
      }
    } else {
      const res = await signInUsername({ data: { username: id, password } });
      if ("error" in res) {
        setBusy(false);
        toast.error(res.error);
        return;
      }
      const { error } = await supabase.auth.setSession(res);
      setBusy(false);
      if (error) {
        toast.error(error.message);
        return;
      }
    }
    navigate({ to: "/dashboard" });
  }

  /** Emails a reset link and logs the request so the super admin is notified. */
  async function sendReset(e: React.FormEvent) {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!target) {
      toast.error("Enter the email address on your account.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(target, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    await supabase.rpc("record_password_reset", { _email: target, _stage: "requested" });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Check your email for the reset link.");
    setForgot(false);
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


  return (
    <div className="grid min-h-screen bg-nuru-hero px-4 py-10 place-items-center">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </div>
          <span className="font-display text-lg font-bold">FANISI DIGITAL SOLUTIONS</span>
        </Link>

        <div className="card-nuru p-6">
          <div>
            <h1 className="font-display text-lg font-semibold">Staff sign in</h1>
            <p className="text-sm text-muted-foreground">Accounts are created by your super admin or Head of Institution.</p>

              {forgot ? (
                <form onSubmit={sendReset} className="space-y-4 pt-4">
                  <p className="text-sm text-muted-foreground">
                    We&apos;ll email you a secure link to set a new password.
                  </p>
                  <div className="space-y-1.5">
                    <Label htmlFor="fe">Email on your account</Label>
                    <Input id="fe" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="head@school.ac.ke" />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null} Email me a reset link
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => setForgot(false)}>
                    Back to sign in
                  </Button>
                </form>
              ) : (
                <form onSubmit={signIn} className="space-y-4 pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="e1">Email or username</Label>
                    <Input id="e1" type="text" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="head@school.ac.ke" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="p1">Password</Label>
                    <Input id="p1" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : null} Sign in
                  </Button>
                  <button type="button" onClick={() => setForgot(true)}
                    className="w-full text-center text-xs font-medium text-primary underline-offset-2 hover:underline">
                    Forgot your password?
                  </button>
                </form>
              )}
          </div>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Parent? <Link to="/parent" className="font-medium text-primary">Check your child's progress</Link> — no login required.
        </p>
        <p className="mt-2 text-center text-xs text-muted-foreground">Support: {NURU.whatsapp}</p>
      </div>
    </div>
  );
}
