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
    const { validateStaffAssignments, subjectAssignmentRows } = await import("./staff-validation.server");
    const validated = await validateStaffAssignments(context.supabase, context.userId, data.school_id, data.grade_ids, data.modules, data.subject_ids, data.class_teacher_grade_id, data.class_teacher_stream_id);
    data.grade_ids = validated.gradeIds;
    if (!data.subject_ids.length) throw new Error("Select at least one learning area.");

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

    const { data: existing, error: lookupError } = await supabaseAdmin.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (existing) throw new Error("This email already has an account. Edit the existing teacher instead.");
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({ email, password: data.password, email_confirm: true, user_metadata: { full_name: data.full_name } });
    if (createError || !created.user) throw new Error(createError?.message ?? "Could not create teacher login.");
    const userId = created.user.id;

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
      const rows = subjectAssignmentRows(data.school_id, teacher.id, data.grade_ids, validated.subjects);
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
      const { error: deleteError } = await del;
      if (deleteError) throw new Error(deleteError.message);
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
        { onConflict: "user_id,school_id" },
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

const updateSchema = z.object({
  teacher_id: z.string().uuid(),
  grade_ids: z.array(z.string().uuid()).max(20),
  subject_ids: z.array(z.string().uuid()).max(60),
  modules: z.array(z.string().max(30)).max(20),
  is_active: z.boolean(),
});

/** Changes an existing teacher's classes, learning areas, modules or active state (super admin or HOI of that school). */
export const updateTeacherAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: teacher, error: readError } = await context.supabase.from("teachers").select("id, school_id, user_id").eq("id", data.teacher_id).maybeSingle();
    if (readError || !teacher) throw new Error(readError?.message ?? "Teacher not found.");
    const { validateStaffAssignments, subjectAssignmentRows } = await import("./staff-validation.server");
    const validated = await validateStaffAssignments(context.supabase, context.userId, teacher.school_id, data.grade_ids, data.modules, data.subject_ids);
    if (!data.subject_ids.length) throw new Error("Select at least one learning area.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: activeError } = await supabaseAdmin.from("teachers").update({ is_active: data.is_active }).eq("id", teacher.id);
    if (activeError) throw new Error(activeError.message);
    const { error: deleteError } = await supabaseAdmin.from("teacher_subjects").delete().eq("teacher_id", teacher.id);
    if (deleteError) throw new Error(deleteError.message);
    const rows = subjectAssignmentRows(teacher.school_id, teacher.id, validated.gradeIds, validated.subjects);
    if (rows.length) {
      const { error } = await supabaseAdmin.from("teacher_subjects").insert(rows);
      if (error) throw new Error(error.message);
    }
    if (teacher.user_id) {
      const { error } = await supabaseAdmin.from("hoi_access").upsert(
        { user_id: teacher.user_id, school_id: teacher.school_id, grade_ids: data.grade_ids, modules: data.modules },
        { onConflict: "user_id,school_id" },
      );
      if (error) throw new Error(error.message);
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(teacher.user_id, { ban_duration: data.is_active ? "none" : "876000h" });
      if (authError) throw new Error(authError.message);
      if (!data.is_active) {
        const { error } = await supabaseAdmin.from("class_teachers").delete().eq("teacher_user_id", teacher.user_id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabaseAdmin.from("class_teachers").delete().eq("teacher_user_id", teacher.user_id).not("grade_id", "in", `(${data.grade_ids.join(",")})`);
        if (error) throw new Error(error.message);
      }
    }
    await supabaseAdmin.from("audit_logs").insert({
      school_id: teacher.school_id,
      user_id: context.userId,
      action: "teacher_access_updated",
      entity: "teachers",
      entity_id: teacher.id,
    });
    return { ok: true as const };
  });
