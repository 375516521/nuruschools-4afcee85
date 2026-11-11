import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// ---------- Helpers ----------

function friendlyDbError(message: string, fallback: string): Error {
  const m = (message || "").toLowerCase();
  if (m.includes("duplicate key") || m.includes("unique constraint")) {
    if (m.includes("username")) return new Error("That username is already taken.");
    if (m.includes("email")) return new Error("This email already has an account.");
    return new Error("This record already exists.");
  }
  if (m.includes("foreign key") || m.includes("violates")) return new Error("One of the selected grades / subjects no longer exists. Refresh and try again.");
  if (m.includes("row-level") || m.includes("permission")) return new Error("You don't have permission to do this.");
  return new Error(fallback || message || "Something went wrong. Try again.");
}

async function getMyRoles(supabase: any, userId: string) {
  const [{ data: isSuper }, { data: isHoi }, { data: profile }] = await Promise.all([
    supabase.rpc("has_role", { _user_id: userId, _role: "superadmin" }),
    supabase.rpc("has_role", { _user_id: userId, _role: "hoi" }),
    supabase.from("profiles").select("school_id").eq("id", userId).maybeSingle(),
  ]);
  return { isSuper: !!isSuper, isHoi: !!isHoi, mySchoolId: profile?.school_id as string | undefined };
}

function requireSameSchool(isSuper: boolean, isHoi: boolean, mySchoolId: string | undefined, schoolId: string, msg = "You can only manage staff in your own school.") {
  if (!isSuper && (!isHoi || mySchoolId !== schoolId)) throw new Error(msg);
}

// ---------- 1. Update Staff Access ----------

const staffAccessSchema = z.object({
  user_id: z.string().uuid(),
  school_id: z.string().uuid(),
  grade_ids: z.array(z.string().uuid()).max(20),
  modules: z.array(z.string().max(30)).max(20),
});

export const updateStaffAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    try { return staffAccessSchema.parse(input); }
    catch { throw new Error("Select at least one grade and one module."); }
  })
  .handler(async ({ data, context }) => {
    const { isSuper, isHoi, mySchoolId } = await getMyRoles(context.supabase, context.userId);
    requireSameSchool(isSuper, isHoi, mySchoolId, data.school_id);

    const wanted = (isSuper ? ["hoi", "teacher"] : ["teacher"]) as ("hoi" | "teacher")[];
    const { data: targetRoles } = await context.supabase.from("user_roles").select("role").eq("user_id", data.user_id).eq("school_id", data.school_id).in("role", wanted);
    if (!targetRoles?.length) throw new Error("That person is not on this school's staff.");

    if (data.grade_ids.length === 0 || data.modules.length === 0) throw new Error("Select at least one grade and one module.");

    const { data: g, error: gErr } = await context.supabase.from("grades").select("id").eq("school_id", data.school_id).in("id", data.grade_ids);
    if (gErr) throw friendlyDbError(gErr.message, "Could not check grades.");
    if ((g ?? []).length !== new Set(data.grade_ids).size) throw new Error("All grades must belong to this school.");

    if (!isSuper) {
      const { data: mine } = await context.supabase.from("hoi_access").select("grade_ids").eq("user_id", context.userId).eq("school_id", data.school_id).maybeSingle();
      const allowed = mine?.grade_ids ?? [];
      if (allowed.length && data.grade_ids.some((id) => !allowed.includes(id))) throw new Error("You can only assign grades you have access to.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("hoi_access").upsert(
      { user_id: data.user_id, school_id: data.school_id, grade_ids: data.grade_ids, modules: data.modules },
      { onConflict: "user_id,school_id" },
    );
    if (error) throw friendlyDbError(error.message, "Could not save access.");

    if (data.grade_ids.length) {
      const { error: ctErr } = await supabaseAdmin.from("class_teachers").delete().eq("teacher_user_id", data.user_id).not("grade_id", "in", `(${data.grade_ids.join(",")})`);
      if (ctErr) throw friendlyDbError(ctErr.message, "Could not clean up class-teacher posts.");
    }

    await supabaseAdmin.from("audit_logs").insert({ school_id: data.school_id, user_id: context.userId, action: "staff_access_updated", entity: "hoi_access", entity_id: data.user_id });
    return { ok: true as const };
  });

// ---------- 2. Create Teacher ----------

const teacherSchema = z.object({
  school_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(120),
  username: z.string().trim().min(3).max(40).regex(/^[a-z0-9._-]+$/i, "Letters, numbers, dot, dash and underscore only").optional().nullable(),
  password: z.string().min(8).max(72),
  phone: z.string().trim().max(20).optional().nullable(),
  tsc_number: z.string().trim().max(30).optional().nullable(),
  subject_ids: z.array(z.string().uuid()).max(60).default([]),
  grade_ids: z.array(z.string().uuid()).max(20).default([]),
  modules: z.array(z.string().max(30)).max(20).default([]),
  class_teacher_grade_id: z.string().uuid().optional().nullable(),
  class_teacher_stream_id: z.string().uuid().optional().nullable(),
});

export const createTeacherAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    try { return teacherSchema.parse(input); }
    catch (e: any) {
      const issue = e?.issues?.[0];
      if (issue?.path?.includes("email")) throw new Error("Enter a valid email address.");
      if (issue?.path?.includes("password")) throw new Error("Password must be at least 8 characters.");
      if (issue?.path?.includes("username")) throw new Error("Username: letters, numbers, dot, dash and underscore only, 3-40 chars.");
      if (issue?.path?.includes("full_name")) throw new Error("Enter the teacher's full name.");
      throw new Error("Check the form and try again.");
    }
  })
  .handler(async ({ data, context }) => {
    if (!data.subject_ids.length) throw new Error("Select at least one learning area.");
    if (!data.grade_ids.length) throw new Error("Select at least one grade.");
    if (!data.modules.length) throw new Error("Select at least one module.");

    const { validateStaffAssignments, subjectAssignmentRows } = await import("./staff-validation.server");
    let validated: Awaited<ReturnType<typeof validateStaffAssignments>>;
    try {
      validated = await validateStaffAssignments(context.supabase, context.userId, data.school_id, data.grade_ids, data.modules, data.subject_ids, data.class_teacher_grade_id, data.class_teacher_stream_id);
    } catch (e: any) {
      const m = (e?.message || "").toLowerCase();
      if (m.includes("hoi") && m.includes("grade")) throw new Error("HOI has no grades assigned yet. Ask admin to assign grades to the HOI first.");
      throw new Error(e?.message || "Could not validate grades / modules.");
    }
    data.grade_ids = validated.gradeIds;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();
    const username = (data.username ?? email.split("@")[0] ?? "").toLowerCase();

    const { data: clash } = await supabaseAdmin.from("profiles").select("id, email").ilike("username", username).maybeSingle();
    if (clash && clash.email?.toLowerCase() !== email) throw new Error("That username is already used in another school.");

    const { data: existing, error: lookupError } = await supabaseAdmin.from("profiles").select("id").ilike("email", email).maybeSingle();
    if (lookupError) throw friendlyDbError(lookupError.message, "Could not check email.");
    if (existing) throw new Error("This email already has an account. Edit the existing teacher instead.");

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({ email, password: data.password, email_confirm: true, user_metadata: { full_name: data.full_name } });
    if (createError || !created.user) {
      const m = (createError?.message || "").toLowerCase();
      if (m.includes("already") || m.includes("exists")) throw new Error("This email already has an account. Edit the existing teacher instead.");
      throw new Error(createError?.message ?? "Could not create teacher login.");
    }
    const userId = created.user.id;

    try {
      const { error: pErr } = await supabaseAdmin.from("profiles").upsert(
        { id: userId, full_name: data.full_name, email, phone: data.phone ?? null, school_id: data.school_id, username, must_change_password: true },
        { onConflict: "id" },
      );
      if (pErr) throw friendlyDbError(pErr.message, "Could not save teacher profile.");

      const { data: role } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", userId).eq("role", "teacher").maybeSingle();
      if (!role) {
        const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "teacher", school_id: data.school_id });
        if (rErr) throw friendlyDbError(rErr.message, "Could not assign teacher role.");
      }

      const teacherRow = { school_id: data.school_id, user_id: userId, full_name: data.full_name, email, phone: data.phone ?? null, tsc_number: data.tsc_number ?? null, is_active: true };
      const { data: found } = await supabaseAdmin.from("teachers").select("id").eq("user_id", userId).maybeSingle();
      const query = found ? supabaseAdmin.from("teachers").update(teacherRow).eq("id", found.id) : supabaseAdmin.from("teachers").insert(teacherRow);
      const { data: teacher, error: tErr } = await query.select("id").single();
      if (tErr) throw friendlyDbError(tErr.message, "Could not save teacher record.");

      if (data.subject_ids.length && data.grade_ids.length) {
        await supabaseAdmin.from("teacher_subjects").delete().eq("teacher_id", teacher.id);
        const rows = subjectAssignmentRows(data.school_id, teacher.id, data.grade_ids, validated.subjects);
        const { error: tsErr } = await supabaseAdmin.from("teacher_subjects").insert(rows);
        if (tsErr) throw friendlyDbError(tsErr.message, "Could not link learning areas.");
      }

      if (data.class_teacher_grade_id) {
        if (!data.grade_ids.includes(data.class_teacher_grade_id)) data.grade_ids = [...data.grade_ids, data.class_teacher_grade_id];
        let del = supabaseAdmin.from("class_teachers").delete().eq("grade_id", data.class_teacher_grade_id);
        del = data.class_teacher_stream_id ? del.eq("stream_id", data.class_teacher_stream_id) : del.is("stream_id", null);
        const { error: deleteError } = await del;
        if (deleteError) throw friendlyDbError(deleteError.message, "Could not assign class teacher.");
        const { error: cErr } = await supabaseAdmin.from("class_teachers").insert({ school_id: data.school_id, grade_id: data.class_teacher_grade_id, stream_id: data.class_teacher_stream_id ?? null, teacher_user_id: userId });
        if (cErr) throw friendlyDbError(cErr.message, "Could not assign class teacher.");
      }

      if (data.modules.length && data.grade_ids.length) {
        const { error: aErr } = await supabaseAdmin.from("hoi_access").upsert({ user_id: userId, school_id: data.school_id, grade_ids: data.grade_ids, modules: data.modules }, { onConflict: "user_id,school_id" });
        if (aErr) throw friendlyDbError(aErr.message, "Could not save grade access.");
      }

      await supabaseAdmin.from("audit_logs").insert({ school_id: data.school_id, user_id: context.userId, action: "teacher_account_created", entity: "teachers", entity_id: teacher.id });

      const { verifyLogin } = await import("./verify-login.server");
      let verified = false;
      try { verified = await verifyLogin(email, data.password); } catch { verified = false; }
      if (!verified) return { ok: true as const, email, username, verified: false, warning: "Account created, but test sign-in failed. Teacher can still try to log in." };
      return { ok: true as const, email, username, verified: true };
    } catch (e: any) {
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw e;
    }
  });

// ---------- 3. Update Teacher Access ----------

const updateSchema = z.object({
  teacher_id: z.string().uuid(),
  grade_ids: z.array(z.string().uuid()).max(20),
  subject_ids: z.array(z.string().uuid()).max(60),
  modules: z.array(z.string().max(30)).max(20),
  is_active: z.boolean(),
});

export const updateTeacherAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    try { return updateSchema.parse(input); } catch { throw new Error("Select at least one grade, learning area and module."); }
  })
  .handler(async ({ data, context }) => {
    const { data: teacher, error: readError } = await context.supabase.from("teachers").select("id, school_id, user_id").eq("id", data.teacher_id).maybeSingle();
    if (readError || !teacher) throw new Error(readError?.message ?? "Teacher not found.");
    const { validateStaffAssignments, subjectAssignmentRows } = await import("./staff-validation.server");
    const validated = await validateStaffAssignments(context.supabase, context.userId, teacher.school_id, data.grade_ids, data.modules, data.subject_ids);
    if (!data.subject_ids.length) throw new Error("Select at least one learning area.");
    if (!data.grade_ids.length) throw new Error("Select at least one grade.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: activeError } = await supabaseAdmin.from("teachers").update({ is_active: data.is_active }).eq("id", teacher.id);
    if (activeError) throw friendlyDbError(activeError.message, "Could not update teacher.");
    const { error: deleteError } = await supabaseAdmin.from("teacher_subjects").delete().eq("teacher_id", teacher.id);
    if (deleteError) throw friendlyDbError(deleteError.message, "Could not update learning areas.");
    const rows = subjectAssignmentRows(teacher.school_id, teacher.id, validated.gradeIds, validated.subjects);
    if (rows.length) {
      const { error } = await supabaseAdmin.from("teacher_subjects").insert(rows);
      if (error) throw friendlyDbError(error.message, "Could not link learning areas.");
    }
    if (teacher.user_id) {
      const { error } = await supabaseAdmin.from("hoi_access").upsert({ user_id: teacher.user_id, school_id: teacher.school_id, grade_ids: data.grade_ids, modules: data.modules }, { onConflict: "user_id,school_id" });
      if (error) throw friendlyDbError(error.message, "Could not save grade access.");
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(teacher.user_id, { ban_duration: data.is_active ? "none" : "876000h" });
      if (authError) throw friendlyDbError(authError.message, "Could not update login status.");
      if (!data.is_active) {
        const { error } = await supabaseAdmin.from("class_teachers").delete().eq("teacher_user_id", teacher.user_id);
        if (error) throw friendlyDbError(error.message, "Could not remove class-teacher post.");
      } else if (data.grade_ids.length) {
        const { error } = await supabaseAdmin.from("class_teachers").delete().eq("teacher_user_id", teacher.user_id).not("grade_id", "in", `(${data.grade_ids.join(",")})`);
        if (error) throw friendlyDbError(error.message, "Could not clean up class-teacher posts.");
      }
    }
    await supabaseAdmin.from("audit_logs").insert({ school_id: teacher.school_id, user_id: context.userId, action: "teacher_access_updated", entity: "teachers", entity_id: teacher.id });
    return { ok: true as const };
  });

// ---------- 4. Edit Teacher / HOI Details ----------

const editStaffDetailsSchema = z.object({
  user_id: z.string().uuid(),
  school_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(80).optional(),
  username: z.string().trim().min(3).max(40).regex(/^[a-z0-9._-]+$/i, "Letters, numbers, dot, dash and underscore only").optional().nullable(),
  password: z.string().min(8).max(72).optional().nullable(),
  phone: z.string().trim().max(20).optional().nullable(),
  tsc_number: z.string().trim().max(30).optional().nullable(),
});

export const updateTeacherDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    try { return editStaffDetailsSchema.parse(input); } catch { throw new Error("Check name, username and password and try again."); }
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isSuper, isHoi, mySchoolId } = await getMyRoles(context.supabase, context.userId);
    requireSameSchool(isSuper, isHoi, mySchoolId, data.school_id, "You can only edit teachers in your own school.");

    const { data: target } = await supabaseAdmin.from("teachers").select("id, user_id, school_id").eq("user_id", data.user_id).eq("school_id", data.school_id).maybeSingle();
    if (!target) throw new Error("Teacher not found in this school.");
    const { data: profile } = await supabaseAdmin.from("profiles").select("id, email, username, full_name").eq("id", data.user_id).maybeSingle();
    if (!profile) throw new Error("Teacher profile not found.");

    const username = data.username?.trim().toLowerCase();
    if (username && username !== profile.username?.toLowerCase()) {
      const { data: clash } = await supabaseAdmin.from("profiles").select("id").ilike("username", username).maybeSingle();
      if (clash && clash.id !== data.user_id) throw new Error("That username is already taken. Choose another.");
    }
    if (data.password) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
      if (authErr) throw new Error("Could not update password: " + authErr.message);
    }
    const profileUpdate: Record<string, any> = {};
    if (data.full_name) profileUpdate.full_name = data.full_name.trim();
    if (username) profileUpdate.username = username;
    if (data.phone !== undefined) profileUpdate.phone = data.phone || null;
    if (data.password) profileUpdate.must_change_password = false;
    if (Object.keys(profileUpdate).length) {
      const { error: pErr } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.user_id);
      if (pErr) throw friendlyDbError(pErr.message, "Could not save teacher details.");
    }
    const teacherUpdate: Record<string, any> = {};
    if (data.full_name) teacherUpdate.full_name = data.full_name.trim();
    if (data.phone !== undefined) teacherUpdate.phone = data.phone || null;
    if (data.tsc_number !== undefined) teacherUpdate.tsc_number = data.tsc_number || null;
    if (Object.keys(teacherUpdate).length) {
      const { error: tErr } = await supabaseAdmin.from("teachers").update(teacherUpdate).eq("id", target.id);
      if (tErr) throw friendlyDbError(tErr.message, "Could not save teacher details.");
    }
    await supabaseAdmin.from("audit_logs").insert({ school_id: data.school_id, user_id: context.userId, action: "teacher_details_updated", entity: "teachers", entity_id: target.id });
    return { ok: true as const, username: username ?? profile.username, full_name: data.full_name ?? profile.full_name };
  });

export const updateHoiDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    try { return editStaffDetailsSchema.parse(input); } catch { throw new Error("Check name, username and password and try again."); }
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isSuper, mySchoolId } = await getMyRoles(context.supabase, context.userId);
    const isSelf = context.userId === data.user_id;
    if (!isSuper && !isSelf) throw new Error("You can only edit your own details.");
    if (!isSuper && mySchoolId !== data.school_id) throw new Error("You can only edit HOI in your own school.");

    const { data: role } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", data.user_id).eq("school_id", data.school_id).eq("role", "hoi").maybeSingle();
    if (!role) throw new Error("HOI not found in this school.");
    const { data: profile } = await supabaseAdmin.from("profiles").select("id, email, username, full_name").eq("id", data.user_id).maybeSingle();
    if (!profile) throw new Error("HOI profile not found.");

    const username = data.username?.trim().toLowerCase();
    if (username && username !== profile.username?.toLowerCase()) {
      const { data: clash } = await supabaseAdmin.from("profiles").select("id").ilike("username", username).maybeSingle();
      if (clash && clash.id !== data.user_id) throw new Error("That username is already taken. Choose another.");
    }
    if (data.password) {
      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.password });
      if (authErr) throw new Error("Could not update password: " + authErr.message);
    }
    const profileUpdate: Record<string, any> = {};
    if (data.full_name) profileUpdate.full_name = data.full_name.trim();
    if (username) profileUpdate.username = username;
    if (data.phone !== undefined) profileUpdate.phone = data.phone || null;
    if (data.password) profileUpdate.must_change_password = false;
    if (Object.keys(profileUpdate).length) {
      const { error: pErr } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.user_id);
      if (pErr) throw friendlyDbError(pErr.message, "Could not save HOI details.");
    }
    await supabaseAdmin.from("audit_logs").insert({ school_id: data.school_id, user_id: context.userId, action: "hoi_details_updated", entity: "profiles", entity_id: data.user_id });
    return { ok: true as const, username: username ?? profile.username, full_name: data.full_name ?? profile.full_name };
  });

// ---------- 5. DELETE Teacher / HOI ----------

const deleteStaffSchema = z.object({
  user_id: z.string().uuid(),
  school_id: z.string().uuid(),
  confirm: z.literal(true, { errorMap: () => ({ message: "Tick confirm to delete." }) }),
});

export const deleteTeacher = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    try { return deleteStaffSchema.parse(input); } catch { throw new Error("Tick confirm to delete this teacher."); }
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isSuper, isHoi, mySchoolId } = await getMyRoles(context.supabase, context.userId);
    requireSameSchool(isSuper, isHoi, mySchoolId, data.school_id, "You can only delete teachers in your own school.");
    if (data.user_id === context.userId) throw new Error("You cannot delete yourself.");

    const { data: teacher } = await supabaseAdmin.from("teachers").select("id, user_id").eq("user_id", data.user_id).eq("school_id", data.school_id).maybeSingle();
    if (!teacher) throw new Error("Teacher not found in this school.");

    // Clean children first, then auth - in this order to avoid orphans
    await supabaseAdmin.from("class_teachers").delete().eq("teacher_user_id", data.user_id);
    await supabaseAdmin.from("teacher_subjects").delete().eq("teacher_id", teacher.id);
    await supabaseAdmin.from("hoi_access").delete().eq("user_id", data.user_id).eq("school_id", data.school_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("school_id", data.school_id).eq("role", "teacher");
    const { error: tErr } = await supabaseAdmin.from("teachers").delete().eq("id", teacher.id);
    if (tErr) throw friendlyDbError(tErr.message, "Could not delete teacher.");
    await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (authErr) throw new Error("Teacher record deleted, but login could not be deleted: " + authErr.message);

    await supabaseAdmin.from("audit_logs").insert({ school_id: data.school_id, user_id: context.userId, action: "teacher_deleted", entity: "teachers", entity_id: teacher.id });
    return { ok: true as const };
  });

export const deleteHoi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    try { return deleteStaffSchema.parse(input); } catch { throw new Error("Tick confirm to delete this HOI."); }
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isSuper } = await getMyRoles(context.supabase, context.userId);
    if (!isSuper) throw new Error("Only Super Admin can delete an HOI.");
    if (data.user_id === context.userId) throw new Error("You cannot delete yourself.");

    const { data: role } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", data.user_id).eq("school_id", data.school_id).eq("role", "hoi").maybeSingle();
    if (!role) throw new Error("HOI not found in this school.");

    await supabaseAdmin.from("class_teachers").delete().eq("teacher_user_id", data.user_id);
    await supabaseAdmin.from("hoi_access").delete().eq("user_id", data.user_id).eq("school_id", data.school_id);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("school_id", data.school_id).eq("role", "hoi");
    await supabaseAdmin.from("profiles").delete().eq("id", data.user_id);
    const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (authErr) throw new Error("HOI record deleted, but login could not be deleted: " + authErr.message);

    await supabaseAdmin.from("audit_logs").insert({ school_id: data.school_id, user_id: context.userId, action: "hoi_deleted", entity: "profiles", entity_id: data.user_id });
    return { ok: true as const };
  });

// ---------- 6. PASSWORD RESET (inside system, no email) ----------

const resetPasswordSchema = z.object({
  user_id: z.string().uuid(),
  school_id: z.string().uuid(),
  new_password: z.string().min(8).max(72),
});

export const resetTeacherPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    try { return resetPasswordSchema.parse(input); } catch { throw new Error("New password must be at least 8 characters."); }
  })
  .handler(async ({ data, context }) => {
    // HOI (own school) OR Super Admin can reset a teacher
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isSuper, isHoi, mySchoolId } = await getMyRoles(context.supabase, context.userId);
    requireSameSchool(isSuper, isHoi, mySchoolId, data.school_id, "You can only reset passwords for teachers in your own school.");
    if (data.user_id === context.userId) throw new Error("Use Change Password for your own account.");

    const { data: teacher } = await supabaseAdmin.from("teachers").select("id").eq("user_id", data.user_id).eq("school_id", data.school_id).maybeSingle();
    if (!teacher) throw new Error("Teacher not found in this school.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.new_password });
    if (error) throw new Error("Could not reset password: " + error.message);

    // Force teacher to change it on next login for security
    await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", data.user_id);
    await supabaseAdmin.from("audit_logs").insert({ school_id: data.school_id, user_id: context.userId, action: "teacher_password_reset", entity: "teachers", entity_id: teacher.id });
    return { ok: true as const, message: "Password reset. Give the teacher the new password - they will be asked to change it on next login." };
  });

export const resetHoiPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    try { return resetPasswordSchema.parse(input); } catch { throw new Error("New password must be at least 8 characters."); }
  })
  .handler(async ({ data, context }) => {
    // ONLY Super Admin can reset an HOI
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { isSuper } = await getMyRoles(context.supabase, context.userId);
    if (!isSuper) throw new Error("Only Super Admin can reset an HOI password.");
    if (data.user_id === context.userId) throw new Error("Use Change Password for your own account.");

    const { data: role } = await supabaseAdmin.from("user_roles").select("id").eq("user_id", data.user_id).eq("school_id", data.school_id).eq("role", "hoi").maybeSingle();
    if (!role) throw new Error("HOI not found in this school.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, { password: data.new_password });
    if (error) throw new Error("Could not reset password: " + error.message);

    await supabaseAdmin.from("profiles").update({ must_change_password: true }).eq("id", data.user_id);
    await supabaseAdmin.from("audit_logs").insert({ school_id: data.school_id, user_id: context.userId, action: "hoi_password_reset", entity: "profiles", entity_id: data.user_id });
    return { ok: true as const, message: "HOI password reset. Give the HOI the new password - they will be asked to change it on next login." };
  });
