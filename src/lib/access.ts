import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type HoiAccess = { grade_ids: string[] | null; modules: string[] | null } | null;

/** Module key each navigation route belongs to. Routes not listed are always available. */
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

/** Access rules saved for this Head of Institution by the super admin. */
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

export function canUseRoute(route: string, isSuper: boolean, access: HoiAccess): boolean {
  if (isSuper) return true;
  const mod = ROUTE_MODULE[route];
  if (!mod) return true;
  const mods = access?.modules ?? null;
  if (!mods || mods.length === 0) return true; // no restriction saved yet
  return mods.includes(mod);
}

/** Grades of the school, already narrowed to the grades this user may work with. */
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
      if (isSuper || !allowed || allowed.length === 0) return rows;
      return rows.filter((g) => allowed.includes(g.id));
    },
  });
}
