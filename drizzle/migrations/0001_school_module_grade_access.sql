CREATE TABLE IF NOT EXISTS public.school_module_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, module_key)
);
CREATE TABLE IF NOT EXISTS public.school_grade_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, grade_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_module_access TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_grade_access TO authenticated;
GRANT ALL ON public.school_module_access TO service_role;
GRANT ALL ON public.school_grade_access TO service_role;
ALTER TABLE public.school_module_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_grade_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school reads module access" ON public.school_module_access FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "superadmin manages module access" ON public.school_module_access FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "school reads grade access" ON public.school_grade_access FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "superadmin manages grade access" ON public.school_grade_access FOR ALL TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());