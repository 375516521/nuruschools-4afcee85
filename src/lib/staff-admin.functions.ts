import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const teacherSchema = z.object({
  school_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/i, "Letters, numbers, dot, dash and underscore only")
    .optional()
    .nullable(),
  password: z.string().min(8).max(72),
  phone: z.string().trim().max(20).optional().nullable(),
  tsc_number: z.string().trim().max(30).optional().nullable(),
  subject_ids: z.array(z.string().uuid()).max(60).default([]),
  grade_ids: z.array(z.string().uuid()).max(20).default([]),
  modules: z.array(z.string().max(30)).max(20).default([]),
  class_teacher_grade_id: z.string().uuid().optional().nullable(),
  class_teacher_stream_id: z.string().uuid().optional().nullable(),
});

/**
 * Creates a teacher login for one school and links them to every grade + learning area they teach.
 * Callable by a super admin, or by the HOI of that same school (limited to the grades they own).
 */
export const createTeacherAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => teacherSchema.parse(input))
  .handler(async ({ data, context }) => {
    const [{ data: isSuper }, { data: isHoi }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "superadmin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "hoi" }),
    ]);

    if (!isSuper) {
      if (!isHoi) throw new Error("Only a super admin or a Head of Institution can create teachers.");
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("school_id")
        .eq("id", context.userId)
        .maybeSingle();
      if (profile?.school_id !== data.school_id)
        throw new Error("You can only create teachers for your own school.");

      // The HOI may only assign grades they have been granted access to.
      const { data: access } = await context.supabase
        .from("hoi_access")
        .select("grade_ids")
        .eq("user_id", context.userId)
        .maybeSingle();
      const allowed = (access?.grade_ids ?? []) as string[];
      if (allowed.length) {
        const blocked = data.grade_ids.filter((g) => !allowed.includes(g));
        if (blocked.length)
          throw new Error("You can only assign teachers to the grades you have been given access to.");
      }
    }


    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const username = (data.username ?? email.split("@")[0] ?? "").toLowerCase();

    const { data: clash } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .ilike("username", username)
      .maybeSingle();
    if (clash && clash.email?.toLowerCase() !== email)
      throw new Error("That username is already used in another school.");

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
        username,
        must_change_password: true,
      },
      { onConflict: "id" },
    );
    if (pErr) throw new Error(pErr.message);

    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "teacher")
      .maybeSingle();
    if (!role) {
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role: "teacher", school_id: data.school_id });
      if (rErr) throw new Error(rErr.message);
    }

    const teacherRow = {
      school_id: data.school_id,
      user_id: userId,
      full_name: data.full_name,
      email,
      phone: data.phone ?? null,
      tsc_number: data.tsc_number ?? null,
      is_active: true,
    };
    const { data: found } = await supabaseAdmin
      .from("teachers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const query = found
      ? supabaseAdmin.from("teachers").update(teacherRow).eq("id", found.id)
      : supabaseAdmin.from("teachers").insert(teacherRow);
    const { data: teacher, error: tErr } = await query.select("id").single();
    if (tErr) throw new Error(tErr.message);

    if (data.subject_ids.length && data.grade_ids.length) {
      await supabaseAdmin.from("teacher_subjects").delete().eq("teacher_id", teacher.id);
      const rows = data.grade_ids.flatMap((gid) =>
        data.subject_ids.map((sid) => ({
          school_id: data.school_id,
          teacher_id: teacher.id,
          subject_id: sid,
          grade_id: gid,
        })),
      );
      const { error: tsErr } = await supabaseAdmin.from("teacher_subjects").insert(rows);
      if (tsErr) throw new Error(tsErr.message);
    }


    // Class teacher: owns one class, which is always part of their grade access.
    if (data.class_teacher_grade_id) {
      if (!data.grade_ids.includes(data.class_teacher_grade_id))
        data.grade_ids = [...data.grade_ids, data.class_teacher_grade_id];
      let del = supabaseAdmin
        .from("class_teachers")
        .delete()
        .eq("grade_id", data.class_teacher_grade_id);
      del = data.class_teacher_stream_id
        ? del.eq("stream_id", data.class_teacher_stream_id)
        : del.is("stream_id", null);
      await del;
      const { error: cErr } = await supabaseAdmin.from("class_teachers").insert({
        school_id: data.school_id,
        grade_id: data.class_teacher_grade_id,
        stream_id: data.class_teacher_stream_id ?? null,
        teacher_user_id: userId,
      });
      if (cErr) throw new Error(cErr.message);
    }

    // Grade + module access for this teacher (what they may open in the app).
    if (data.modules.length && data.grade_ids.length) {
      const { error: aErr } = await supabaseAdmin.from("hoi_access").upsert(
        {
          user_id: userId,
          school_id: data.school_id,
          grade_ids: data.grade_ids,
          modules: data.modules,
        },
        { onConflict: "user_id" },
      );
      if (aErr) throw new Error(aErr.message);
    }

    await supabaseAdmin.from("audit_logs").insert({
      school_id: data.school_id,
      user_id: context.userId,
      action: existing ? "teacher_account_updated" : "teacher_account_created",
      entity: "teachers",
      entity_id: teacher.id,
    });

    const { verifyLogin } = await import("./verify-login.server");
    const verified = await verifyLogin(email, data.password);
    if (!verified) throw new Error("Account saved, but the test sign-in failed. Please try again.");
    return { ok: true as const, email, username, verified };
  });
