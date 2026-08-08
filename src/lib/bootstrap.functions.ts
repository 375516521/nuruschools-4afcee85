import { createServerFn } from "@tanstack/react-start";

export const FOUNDER_EMAIL = "charleswambua.edu@gmail.com";
export const FOUNDER_PASSWORD = "Nuru@2026";

/**
 * Founder bootstrap. Idempotent and locked to the founder email only:
 * it confirms the account, resets the default password, grants superadmin
 * and links a school if none is set. It can never target any other user.
 */
export const bootstrapFounder = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, school_id")
    .eq("id", userId)
    .maybeSingle();

  let schoolId = profile?.school_id ?? null;
  if (!schoolId) {
    const { data: school } = await supabaseAdmin.from("schools").select("id").order("created_at").limit(1).maybeSingle();
    schoolId = school?.id ?? null;
  }

  await supabaseAdmin
    .from("profiles")
    .upsert({ id: userId, full_name: "Founder", email: FOUNDER_EMAIL, school_id: schoolId }, { onConflict: "id" });

  const { data: existingRole } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "superadmin")
    .maybeSingle();
  if (!existingRole) {
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "superadmin" });
    if (roleError && !roleError.message.includes("duplicate")) throw new Error(roleError.message);
  }

  return { ok: true as const, message: "Founder super admin is ready. Signing you in…" };
});

