import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GraduationCap, Loader2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NURU } from "@/lib/nuru";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a New Password — Nuru Technologies" },
      {
        name: "description",
        content:
          "Choose a new password for your Nuru Technologies school account after requesting a reset link.",
      },
      { property: "og:title", content: "Set a New Password — Nuru Technologies" },
      { property: "og:description", content: "Choose a new password for your school account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .regex(/[A-Z]/, "Needs one uppercase letter")
  .regex(/[0-9]/, "Needs one number")
  .regex(/[^A-Za-z0-9]/, "Needs one symbol");

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) setReady(true);
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    if (password !== confirm) {
      toast.error("The two passwords do not match.");
      return;
    }
    setBusy(true);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const email = userRes.user?.email;
    if (email) {
      await supabase.rpc("record_password_reset", { _email: email, _stage: "completed" });
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", userRes.user!.id);
    }
    toast.success("Password updated. Signing you in…");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-nuru-hero px-4 py-10">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <GraduationCap className="size-5" />
          </div>
          <span className="font-display text-lg font-bold">NURU Technologies</span>
        </Link>

        <div className="card-nuru p-6">
          <h1 className="flex items-center gap-2 font-display text-lg font-bold">
            <KeyRound className="size-4 text-primary" /> Set a new password
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ready
              ? "Choose a strong password you have not used before."
              : "Open this page from the reset link in your email, then set your new password."}
          </p>
          <form className="mt-4 space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="np">New password</Label>
              <Input
                id="np"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Min 8 characters, 1 uppercase, 1 number, 1 symbol.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cp">Confirm password</Label>
              <Input
                id="cp"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null} Update password
            </Button>
          </form>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            <Link to="/auth" className="font-medium text-primary">
              Back to sign in
            </Link>
          </p>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">Support: {NURU.whatsapp}</p>
      </div>
    </div>
  );
}
