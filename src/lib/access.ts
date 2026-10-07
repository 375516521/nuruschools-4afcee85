import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HoiAccess = { grade_ids: string[] | null; modules: string[] | null } | null;

/** Per-user module key each navigation route belongs to (set for individual HOIs/teachers). */
export const ROUTE_MODULE: Record<string, string> = {
  "/students": "admissions",
  "/attendance": "academics",
  "/id-cards": "admissions",
  "/marks": "academics",
  "/exams": "academics",
  "/reports": "academics",
  "/fees": "fees",
  "/library": "library",
  "/assets": "assets",
};

import { SCHOOL_MODULES } from "./staff-modules";
export { SCHOOL_MODULES, TEACHER_MODULES } from "./staff-modules";

/** Disabled module keys + disabled grade ids for a school. Missing rows mean "enabled". */
export type SchoolAccess = { disabledModules: string[]; disabledGrades: string[] };

export async function fetchSchoolAccess(schoolId: string): Promise<SchoolAccess> {
  const [m, g] = await Promise.all([
    supabase.from("school_module_access").select("module_key, is_enabled").eq("school_id", schoolId),
    supabase.from("school_grade_access").select("grade_id, is_enabled").eq("school_id", schoolId),
  ]);
  return {
    disabledModules: (m.data ?? []).filter((r) => !r.is_enabled).map((r) => r.module_key),
    disabledGrades: (g.data ?? []).filter((r) => !r.is_enabled).map((r) => r.grade_id),
  };
}

export function useSchoolAccess(schoolId?: string | null) {
  return useQuery({
    queryKey: ["school-access", schoolId],
    enabled: !!schoolId,
    queryFn: () => fetchSchoolAccess(schoolId!),
  });
}

/**
 * Removes grades switched off for this school, then (for HOIs/teachers) keeps only the
 * grades granted to the signed-in user. Super admin always sees everything.
 */
export async function onlyEnabledGrades<T extends { id: string }>(
  schoolId: string,
  rows: T[],
): Promise<T[]> {
  const { data: isSuper } = await supabase.rpc("is_superadmin");
  if (isSuper) return rows;
  const { data: u } = await supabase.auth.getUser();
  const [{ disabledGrades }, mine] = await Promise.all([
    fetchSchoolAccess(schoolId),
    u.user
      ? supabase.from("hoi_access").select("grade_ids").eq("user_id", u.user.id).eq("school_id", schoolId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const granted = ((mine.data as { grade_ids?: string[] } | null)?.grade_ids ?? []) as string[];
  return rows.filter(
    (r) => !disabledGrades.includes(r.id) && (granted.length === 0 || granted.includes(r.id)),
  );
}

/** Access rules saved for this Head of Institution / teacher. */
export function useHoiAccess(userId?: string | null) {
  return useQuery({
    queryKey: ["hoi-access", userId],
    enabled: !!userId,
    queryFn: async () =>
      ((
        await supabase
          .from("hoi_access")
          .select("grade_ids, modules")
          .eq("user_id", userId!)
          .maybeSingle()
      ).data ?? null) as HoiAccess,
  });
}

/** Routes reserved for school administrators (super admin or Head of Institution). */
export const ADMIN_ROUTES = ["/promotions", "/settings", "/teachers"];

export function canUseRoute(
  route: string,
  isSuper: boolean,
  access: HoiAccess,
  roles: string[] = [],
  school: SchoolAccess | null = null,
): boolean {
  if (isSuper) return true;
  if (route === "/users") return false;
  if (ADMIN_ROUTES.includes(route) && !roles.includes("hoi")) return false;
  const schoolKey = SCHOOL_MODULES.find((m) => m.route === route)?.key;
  if (schoolKey && school?.disabledModules.includes(schoolKey)) return false;
  const mod = ROUTE_MODULE[route];
  if (!mod && !schoolKey) return true;
  if (route === "/dashboard") return true;
  const mods = access?.modules ?? null;
  if (!mods || mods.length === 0) return !roles.includes("teacher");
  return (!!mod && mods.includes(mod)) || (!!schoolKey && mods.includes(schoolKey));
}

/** Grades of the school, narrowed to those enabled for the school and granted to this user. */
export function useAllowedGrades(
  schoolId?: string | null,
  isSuper = false,
  access: HoiAccess = null,
) {
  const allowed = access?.grade_ids ?? null;
  return useQuery({
    queryKey: ["grades", schoolId, isSuper ? "all" : (allowed ?? []).join(",")],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("grades")
        .select("id, name, band, level_order")
        .eq("school_id", schoolId!)
        .order("level_order");
      const rows = data ?? [];
      if (isSuper) return rows;
      const enabled = await onlyEnabledGrades(schoolId!, rows);
      if (!allowed || allowed.length === 0) return enabled;
      return enabled.filter((g) => allowed.includes(g.id));
    },
  });
}

/**
 * Learning areas a signed-in user may enter marks for in one grade. Super admin, HOI and the
 * class teacher of that grade see every learning area; other teachers only those assigned to them.
 */
export async function onlyMySubjects<T extends { id: string }>(gradeId: string, rows: T[]): Promise<T[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const [{ data: roles }, { data: isClassTeacher }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", u.user.id),
    supabase.rpc("is_class_teacher", { _grade_id: gradeId }),
  ]);
  const r = (roles ?? []).map((x) => x.role as string);
  if (r.includes("superadmin") || r.includes("hoi") || isClassTeacher) return rows;
  const { data: t } = await supabase.from("teachers").select("id").eq("user_id", u.user.id).maybeSingle();
  if (!t) return [];
  const { data: ts } = await supabase
    .from("teacher_subjects")
    .select("subject_id")
    .eq("teacher_id", t.id)
    .eq("grade_id", gradeId);
  const ids = (ts ?? []).map((x) => x.subject_id);
  if (ids.length === 0) return [];
  return rows.filter((s) => ids.includes(s.id));
}
