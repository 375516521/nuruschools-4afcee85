import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const hoiSchema = z.object({
  school_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(72),
  phone: z.string().trim().max(20).optional().nullable(),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/i, "Letters, numbers, dot, dash and underscore only")
    .optional()
    .nullable(),
});

function friendlyDbError(message: string, fallback: string): Error {
  const m = (message || "").toLowerCase();
  if (m.includes("duplicate key") || m.includes("unique constraint")) {
    if (m.includes("username")) return new Error("That username is already taken.");
    if (m.includes("email")) return new Error("This email already has an account.");
    return new Error("This record already exists.");
  }
  if (m.includes("foreign key") || m.includes("violates")) return new Error("This school no longer exists. Refresh and try again.");
  if (m.includes("row-level") || m.includes("permission")) return new Error("You don't have permission to do this.");
  return new Error(fallback || message || "Something went wrong. Try again.");
}

export const createHoiAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    try { return hoiSchema.parse(input); }
    catch (e: any) {
      const issue = e?.issues?.[0];
      if (issue?.path?.includes("email")) throw new Error("Enter a valid email address.");
      if (issue?.path?.includes("password")) throw new Error("Password must be at least 8 characters.");
      if (issue?.path?.includes("username")) throw new Error("Username: letters, numbers, dot, dash and underscore only, 3-40 chars.");
      if (issue?.path?.includes("full_name")) throw new Error("Enter the HOI's full name.");
      if (issue?.path?.includes("school_id")) throw new Error("Select a school first.");
      throw new Error("Check the form and try again.");
    }
  })
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "superadmin" });
    if (!isSuper) throw new Error("Only a super admin can create HOI accounts.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const username = (data.username ?? email.split("@")[0] ?? "").toLowerCase();

    const { data: clash } = await supabaseAdmin.from("profiles").select("id, email").ilike("username", username).maybeSingle();
    if (clash && clash.email?.toLowerCase() !== email) throw new Error("That username is already used in another school.");

    const { data: existingProfile } = await supabaseAdmin.from("profiles").select("id, email").ilike("email", email).maybeSingle();

    let userId: string;
    let isUpdate = false;

    if (existingProfile) {
      isUpdate = true;
      userId = existingProfile.id;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: data.password, email_confirm: true });
      if (error) throw new Error("Could not update HOI login: " + error.message);
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email, password: data.password, email_confirm: true, user_metadata: { full_name: data.full_name } });
      if (error || !created.user) {
        const m = (error?.message || "").toLowerCase();
        if (m.includes("already") || m.includes("exists")) throw new Error("This email already has an account. Try again.");
        throw new Error(error?.message ?? "Could not create HOI login.");
      }
      userId = created.user.id;
    }

    // --- BLOCK: 1 HOI PER SCHOOL ---
    const { data: existingHoi } = await supabaseAdmin.from("user_roles").select("user_id").eq("school_id", data.school_id).eq("role", "hoi").maybeSingle();
    if (existingHoi && existingHoi.user_id !== userId) {
      const { data: oldHoi } = await supabaseAdmin.from("profiles").select("full_name, email").eq("id", existingHoi.user_id).maybeSingle();
      // Rollback new user so retry works
      if (!isUpdate) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error(`This school already has an HOI: ${oldHoi?.full_name || oldHoi?.email || "Unknown"}. Delete them first to replace.`);
    }

    try {
      const { error: pErr } = await supabaseAdmin.from("profiles").upsert({ id: userId, full_name: data.full_name, email, phone: data.phone ?? null, school_id: data.school_id, username, must_change_password: true }, { onConflict: "id" });
      if (pErr) throw friendlyDbError(pErr.message, "Could not save HOI profile.");

      const { data: role } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", userId).eq("role", "hoi").maybeSingle();
      if (role) {
        const { error: uErr } = await supabaseAdmin.from("user_roles").update({ school_id: data.school_id }).eq("id", role.id);
        if (uErr) throw friendlyDbError(uErr.message, "Could not assign HOI role.");
      } else {
        const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "hoi", school_id: data.school_id });
        if (rErr) throw friendlyDbError(rErr.message, "Could not assign HOI role.");
      }

      const { error: sErr } = await supabaseAdmin.from("schools").update({ hoi_name: data.full_name, hoi_phone: data.phone ?? null, hoi_email: email }).eq("id", data.school_id);
      if (sErr) throw friendlyDbError(sErr.message, "Could not update school contact.");

      await supabaseAdmin.from("audit_logs").insert({ school_id: data.school_id, user_id: context.userId, action: isUpdate ? "hoi_account_updated" : "hoi_account_created", entity: "profiles", entity_id: userId });

      const { verifyLogin } = await import("./verify-login.server");
      let verified = false;
      try { verified = await verifyLogin(email, data.password); } catch { verified = false; }
      if (!verified) return { ok: true as const, email, username, verified: false, warning: "Account saved, but test sign-in failed. HOI can still try to log in." };
      return { ok: true as const, email, username, verified: true };
    } catch (e: any) {
      if (!isUpdate) await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw e;
    }
  });
