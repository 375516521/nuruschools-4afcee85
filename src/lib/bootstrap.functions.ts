import { createServerFn } from "@tanstack/react-start";

export const FOUNDER_EMAIL = "charleswambua.edu@gmail.com";
export const FOUNDER_PASSWORD = "Nuru@2026";

/**
 * One-time founder bootstrap. Only runs while the system has NO superadmin at all,
 * so it cannot be used to take over an account once setup is complete.
 */
export const bootstrapFounder = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existingRoles, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("role", "superadmin")
    .limit(1);
  if (rolesError) throw new Error(rolesError.message);
  if ((existingRoles ?? []).length > 0) {
    return { ok: false as const, message: "Setup is already complete. Sign in with your password." };
  }

  const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({ perPage: 200 });
  if (listError) throw new Error(listError.message);
  const found = list.users.find((u) => (u.email ?? "").toLowerCase() === FOUNDER_EMAIL);

  let userId: string;
  if (found) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(found.id, {
      password: FOUNDER_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    userId = found.id;
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: FOUNDER_EMAIL,
      password: FOUNDER_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Founder" },
    });
    if (error) throw new Error(error.message);
    userId = data.user.id;
  }

  await supabaseAdmin.from("profiles").upsert({ id: userId, full_name: "Founder", email: FOUNDER_EMAIL }, { onConflict: "id" });
  const { error: roleError } = await supabaseAdmin
    .from("user_roles")
    .insert({ user_id: userId, role: "superadmin" });
  if (roleError && !roleError.message.includes("duplicate")) throw new Error(roleError.message);

  return { ok: true as const, message: "Founder account is ready. Signing you in…" };
});
