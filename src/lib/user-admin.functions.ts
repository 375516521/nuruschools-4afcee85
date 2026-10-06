import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AuthedContext = { supabase: SupabaseClient<Database>; userId: string };

/** Throws unless the caller holds the superadmin role. */
async function assertSuper(context: AuthedContext) {
  const { data: isSuper } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "superadmin",
  });
  if (!isSuper) throw new Error("Only the super admin can manage user accounts.");
}

async function audit(
  schoolId: string | null,
  userId: string,
  action: string,
  entity: string,
  entityId: string | null,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("audit_logs").insert({
    school_id: schoolId,
    user_id: userId,
    action,
    entity,
    entity_id: entityId,
  });
}

export type ManagedUser = {
  id: string;
  full_name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  school_id: string | null;
  school_name: string | null;
  disabled: boolean;
  last_sign_in_at: string | null;
  last_password_reset_at: string | null;
};

/** Full directory of every account across every connected school. Super admin only. */
export const listAllUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ManagedUser[]> => {
    await assertSuper(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: authList }, { data: profiles }, { data: roles }, { data: schools }] =
      await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
        supabaseAdmin
          .from("profiles")
          .select("id, full_name, username, email, phone, school_id, last_password_reset_at"),
        supabaseAdmin.from("user_roles").select("user_id, role"),
        supabaseAdmin.from("schools").select("id, name"),
      ]);

    const schoolName = new Map((schools ?? []).map((s) => [s.id, s.name]));
    const rank: Record<string, number> = { superadmin: 4, hoi: 3, teacher: 2, student: 1 };
    const roleOf = new Map<string, string>();
    for (const r of roles ?? []) {
      const cur = roleOf.get(r.user_id);
      if (!cur || (rank[r.role] ?? 0) > (rank[cur] ?? 0)) roleOf.set(r.user_id, r.role as string);
    }
    const authOf = new Map(
      (authList?.users ?? []).map((u) => [
        u.id,
        {
          disabled: Boolean((u as { banned_until?: string | null }).banned_until),
          last_sign_in_at: u.last_sign_in_at ?? null,
        },
      ]),
    );

    return (profiles ?? [])
      .map((p) => ({
        id: p.id,
        full_name: p.full_name ?? "",
        username: p.username,
        email: p.email,
        phone: p.phone,
        role: roleOf.get(p.id) ?? "student",
        school_id: p.school_id,
        school_name: p.school_id ? (schoolName.get(p.school_id) ?? null) : null,
        disabled: authOf.get(p.id)?.disabled ?? false,
        last_sign_in_at: authOf.get(p.id)?.last_sign_in_at ?? null,
        last_password_reset_at: p.last_password_reset_at,
      }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  });

/** Super admin sets a new password for any account. */
export const adminSetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(8).max(72) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuper(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("profiles")
      .update({ must_change_password: true, last_password_reset_at: new Date().toISOString() })
      .eq("id", data.user_id);
    await audit(null, context.userId, "password_reset_by_superadmin", "profiles", data.user_id);
    return { ok: true as const };
  });

/** Suspend or restore any account. A suspended user cannot sign in. */
export const setUserDisabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ user_id: z.string().uuid(), disabled: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuper(context);
    if (data.user_id === context.userId) throw new Error("You cannot suspend your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.disabled ? "876000h" : "none",
    });
    if (error) throw new Error(error.message);
    await audit(
      null,
      context.userId,
      data.disabled ? "user_suspended" : "user_restored",
      "profiles",
      data.user_id,
    );
    return { ok: true as const };
  });

/** Move an account to a different school and/or change its role. Superadmin is never granted here. */
export const updateUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        full_name: z.string().trim().min(2).max(80).optional(),
        username: z
          .string()
          .trim()
          .min(3)
          .max(40)
          .regex(/^[a-z0-9._-]+$/i, "Letters, numbers, dot, dash and underscore only")
          .optional(),
        phone: z.string().trim().max(20).nullable().optional(),
        school_id: z.string().uuid().nullable().optional(),
        role: z.enum(["hoi", "teacher", "student"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuper(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.username) {
      const { data: clash } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("username", data.username)
        .neq("id", data.user_id)
        .maybeSingle();
      if (clash) throw new Error("That username is already used in another school.");
    }

    const patch: {
      full_name?: string;
      username?: string;
      phone?: string | null;
      school_id?: string | null;
    } = {};
    if (data.full_name) patch.full_name = data.full_name;
    if (data.username) patch.username = data.username.toLowerCase();
    if (data.phone !== undefined) patch.phone = data.phone;
    if (data.school_id !== undefined) patch.school_id = data.school_id;
    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", data.user_id);
      if (error) throw new Error(error.message);
    }

    if (data.role) {
      const { data: current } = await supabaseAdmin
        .from("user_roles")
        .select("id, role")
        .eq("user_id", data.user_id)
        .maybeSingle();
      if (current?.role === "superadmin") throw new Error("The super admin role cannot be changed.");
      if (current) {
        await supabaseAdmin
          .from("user_roles")
          .update({ role: data.role, school_id: data.school_id ?? null })
          .eq("id", current.id);
      } else {
        await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: data.user_id, role: data.role, school_id: data.school_id ?? null });
      }
    }

    await audit(
      data.school_id ?? null,
      context.userId,
      "user_account_updated",
      "profiles",
      data.user_id,
    );
    return { ok: true as const };
  });

/** Permanently removes an account. Super admin only; the super admin cannot delete itself. */
export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuper(context);
    if (data.user_id === context.userId) throw new Error("You cannot delete your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (role?.role === "superadmin") throw new Error("The super admin account cannot be deleted.");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    await audit(null, context.userId, "user_account_deleted", "profiles", data.user_id);
    return { ok: true as const };
  });

/** Switch a whole school on or off. Staff of a disabled school keep their login but see no data. */
export const setSchoolActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ school_id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuper(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("schools")
      .update({ is_active: data.is_active })
      .eq("id", data.school_id);
    if (error) throw new Error(error.message);
    await audit(
      data.school_id,
      context.userId,
      data.is_active ? "school_activated" : "school_deactivated",
      "schools",
      data.school_id,
    );
    return { ok: true as const };
  });
