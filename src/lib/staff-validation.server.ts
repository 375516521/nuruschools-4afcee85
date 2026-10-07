import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SCHOOL_MODULES, TEACHER_MODULES } from "./staff-modules";

export async function validateStaffAssignments(client: SupabaseClient<Database>, userId: string, schoolId: string, gradeIds: string[], modules: string[], subjectIds: string[] = [], classGrade?: string | null, classStream?: string | null, forHoi = false) {
  const [{ data: isSuper, error: roleError }, { data: isHoi }, { data: profile }] = await Promise.all([
    client.rpc("has_role", { _user_id: userId, _role: "superadmin" }),
    client.rpc("has_role", { _user_id: userId, _role: "hoi" }),
    client.from("profiles").select("school_id").eq("id", userId).maybeSingle(),
  ]);
  if (roleError) throw new Error(roleError.message);
  if (!isSuper && (!isHoi || profile?.school_id !== schoolId || forHoi)) throw new Error("You can only manage teachers in your own school.");
  const allGrades = [...new Set([...gradeIds, ...(classGrade ? [classGrade] : [])])];
  if (!allGrades.length || !modules.length) throw new Error("Select at least one class and module.");
  const moduleOptions = forHoi ? SCHOOL_MODULES.filter((m) => m.key !== "users_schools") : TEACHER_MODULES;
  if (modules.some((m) => !moduleOptions.some((option) => option.key === m))) throw new Error("Choose valid staff modules.");
  const [g, s, access, schoolAccess] = await Promise.all([
    client.from("grades").select("id").eq("school_id", schoolId).in("id", allGrades),
    client.from("subjects").select("id, grade_id").eq("school_id", schoolId).in("id", subjectIds),
    client.from("hoi_access").select("grade_ids, modules").eq("user_id", userId).eq("school_id", schoolId).maybeSingle(),
    client.from("school_grade_access").select("grade_id, is_enabled").eq("school_id", schoolId),
  ]);
  for (const r of [g, s, access, schoolAccess]) if (r.error) throw new Error(r.error.message);
  if (g.data?.length !== allGrades.length) throw new Error("All classes must belong to the selected school.");
  if (s.data?.length !== new Set(subjectIds).size || s.data?.some((subject) => subject.grade_id && !allGrades.includes(subject.grade_id))) throw new Error("Learning areas must belong to the selected classes and school.");
  if (!isSuper) {
    const allowed = access.data?.grade_ids ?? [];
    if (allGrades.some((id) => (allowed.length > 0 && !allowed.includes(id)) || schoolAccess.data?.some((g) => g.grade_id === id && !g.is_enabled))) throw new Error("You can only assign classes enabled for you.");
  }
  if (classStream) {
    const { data: stream, error } = await client.from("streams").select("grade_id").eq("id", classStream).eq("school_id", schoolId).maybeSingle();
    if (error || !classGrade || stream?.grade_id !== classGrade) throw new Error("Choose a stream from the class teacher's class.");
  }
  return { gradeIds: allGrades, subjects: s.data ?? [], isSuper: Boolean(isSuper) };
}

export function subjectAssignmentRows(schoolId: string, teacherId: string, gradeIds: string[], subjects: { id: string; grade_id: string | null }[]) {
  return gradeIds.flatMap((gradeId) => subjects.filter((s) => !s.grade_id || s.grade_id === gradeId).map((s) => ({ school_id: schoolId, teacher_id: teacherId, grade_id: gradeId, subject_id: s.id })));
}