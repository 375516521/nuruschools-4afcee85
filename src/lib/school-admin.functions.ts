import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const hoiSchema = z.object({
  school_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  password: z.string().min(8).max(72),
  phone: z.string().trim().max(20).optional().nullable(),
});

/**
 * Creates (or re-points) a Head of Institution login for one school.
 * Superadmin only — the caller's role is verified server side.
 */
export const createHoiAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => hoiSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isSuper } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "superadmin",
    });
    if (!isSuper) throw new Error("Only a super admin can create HOI accounts.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    const { data: list, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listError) throw new Error(listError.message);
    const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);

    let userId: string;
    if (existing) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password: data.password,
        email_confirm: true,
      });
      if (error) throw new Error(error.message);
      userId = existing.id;
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
      if (error) throw new Error(error.message);
      userId = created.user.id;
    }

    const { error: pErr } = await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        full_name: data.full_name,
        email,
        phone: data.phone ?? null,
        school_id: data.school_id,
        must_change_password: true,
      },
      { onConflict: "id" },
    );
    if (pErr) throw new Error(pErr.message);

    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "hoi")
      .maybeSingle();
    if (role) {
      await supabaseAdmin
        .from("user_roles")
        .update({ school_id: data.school_id })
        .eq("id", role.id);
    } else {
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "hoi", school_id: data.school_id });
      if (rErr) throw new Error(rErr.message);
    }

    return { ok: true as const, email };
  });
