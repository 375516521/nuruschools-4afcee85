-- 1. Schools: activation + HOI contact
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hoi_name text,
  ADD COLUMN IF NOT EXISTS hoi_phone text,
  ADD COLUMN IF NOT EXISTS hoi_email text;

-- 2. Terms: opening / closing / next term dates
ALTER TABLE public.terms
  ADD COLUMN IF NOT EXISTS opening_date date,
  ADD COLUMN IF NOT EXISTS closing_date date,
  ADD COLUMN IF NOT EXISTS next_term_opening_date date;

UPDATE public.terms SET opening_date = COALESCE(opening_date, start_date),
                        closing_date = COALESCE(closing_date, end_date);

-- 3. Unique usernames across every connected school
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS last_password_reset_at timestamptz;

UPDATE public.profiles
   SET username = lower(split_part(COALESCE(email, 'user-' || left(id::text, 8)), '@', 1))
 WHERE username IS NULL;

-- de-duplicate any collisions before adding the unique index
WITH d AS (
  SELECT id, lower(username) AS u,
         row_number() OVER (PARTITION BY lower(username) ORDER BY created_at, id) AS rn
    FROM public.profiles WHERE username IS NOT NULL
)
UPDATE public.profiles p SET username = d.u || '-' || left(p.id::text, 4)
  FROM d WHERE d.id = p.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_global_unique
  ON public.profiles (lower(username));

-- 4. Password reset notifications for the super admin
CREATE TABLE IF NOT EXISTS public.password_reset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  email text NOT NULL,
  full_name text,
  role text,
  stage text NOT NULL DEFAULT 'requested',
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.password_reset_events TO authenticated;
GRANT ALL ON public.password_reset_events TO service_role;

ALTER TABLE public.password_reset_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "superadmin reads reset events" ON public.password_reset_events;
CREATE POLICY "superadmin reads reset events" ON public.password_reset_events
  FOR SELECT TO authenticated USING (public.is_superadmin());

DROP POLICY IF EXISTS "superadmin updates reset events" ON public.password_reset_events;
CREATE POLICY "superadmin updates reset events" ON public.password_reset_events
  FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

-- Recorded through a definer function so an anonymous "forgot password" request can log it
CREATE OR REPLACE FUNCTION public.record_password_reset(_email text, _stage text DEFAULT 'requested')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.profiles;
BEGIN
  IF _email IS NULL OR length(trim(_email)) = 0 THEN RETURN; END IF;
  SELECT * INTO _p FROM public.profiles WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  INSERT INTO public.password_reset_events (user_id, school_id, email, full_name, role, stage)
  VALUES (
    _p.id, _p.school_id, lower(trim(_email)), _p.full_name,
    (SELECT role::text FROM public.user_roles WHERE user_id = _p.id LIMIT 1),
    CASE WHEN _stage IN ('requested','completed') THEN _stage ELSE 'requested' END
  );
  IF _stage = 'completed' AND _p.id IS NOT NULL THEN
    UPDATE public.profiles SET last_password_reset_at = now() WHERE id = _p.id;
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.record_password_reset(text, text) TO anon, authenticated;

-- 5. HOI grade access validation helper
CREATE OR REPLACE FUNCTION public.hoi_can_access_grade(_grade_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_superadmin()
      OR NOT EXISTS (SELECT 1 FROM public.hoi_access WHERE user_id = auth.uid())
      OR EXISTS (
           SELECT 1 FROM public.hoi_access ha
            WHERE ha.user_id = auth.uid()
              AND (array_length(ha.grade_ids, 1) IS NULL OR _grade_id = ANY (ha.grade_ids))
         );
$$;

GRANT EXECUTE ON FUNCTION public.hoi_can_access_grade(uuid) TO authenticated;

-- 6. Username availability check (no email exposure)
CREATE OR REPLACE FUNCTION public.username_available(_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = lower(trim(_username)));
$$;

GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;

-- 7. Performance indexes for large enrolments
CREATE INDEX IF NOT EXISTS idx_students_school_grade_status ON public.students (school_id, grade_id, status);
CREATE INDEX IF NOT EXISTS idx_students_names ON public.students (school_id, lower(first_name), lower(last_name));
CREATE INDEX IF NOT EXISTS idx_marks_student ON public.marks (student_id);
CREATE INDEX IF NOT EXISTS idx_marks_exam ON public.marks (exam_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student_term ON public.fee_payments (student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_grade_term ON public.fee_structures (grade_id, term_id);
CREATE INDEX IF NOT EXISTS idx_exams_term_grade ON public.exams (term_id, grade_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher ON public.teacher_subjects (teacher_id);