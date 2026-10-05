CREATE TABLE public.class_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  stream_id uuid REFERENCES public.streams(id) ON DELETE CASCADE,
  teacher_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX class_teachers_class_unique ON public.class_teachers (grade_id, COALESCE(stream_id, '00000000-0000-0000-0000-000000000000'::uuid));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_teachers TO authenticated;
GRANT ALL ON public.class_teachers TO service_role;
ALTER TABLE public.class_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "School members read class teachers" ON public.class_teachers FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "School admins manage class teachers" ON public.class_teachers FOR ALL TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE OR REPLACE FUNCTION public.is_class_teacher(_grade_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.class_teachers WHERE teacher_user_id = auth.uid() AND grade_id = _grade_id);
$$;