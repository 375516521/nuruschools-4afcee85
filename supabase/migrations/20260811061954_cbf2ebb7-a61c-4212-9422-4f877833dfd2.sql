-- =========================================================
-- FULL SCHOOL SAAS - 2M LEARNERS READY
-- Superadmin creates HOI -> HOI creates teachers -> RBAC by modules/grades/subjects
-- =========================================================

-- ========= 0. HELPERS =========
CREATE OR REPLACE FUNCTION public.current_user_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = auth.uid() LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'superadmin')
$$;
CREATE OR REPLACE FUNCTION public.is_hoi()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.hoi_access WHERE user_id = auth.uid())
$$;

-- ========= 1. SCHOOLS =========
ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hoi_name text,
  ADD COLUMN IF NOT EXISTS hoi_phone text,
  ADD COLUMN IF NOT EXISTS hoi_email text;
CREATE INDEX IF NOT EXISTS idx_schools_active ON public.schools(is_active) WHERE is_active=true;

-- ========= 2. TERMS =========
ALTER TABLE public.terms
  ADD COLUMN IF NOT EXISTS opening_date date,
  ADD COLUMN IF NOT EXISTS closing_date date,
  ADD COLUMN IF NOT EXISTS next_term_opening_date date;
UPDATE public.terms SET opening_date = COALESCE(opening_date, start_date),
                        closing_date = COALESCE(closing_date, end_date)
WHERE opening_date IS NULL OR closing_date IS NULL;

-- ========= 3. PROFILES + USERNAME GLOBAL UNIQUE =========
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS last_password_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.profiles
   SET username = lower(split_part(COALESCE(email, 'user-' || left(id::text, 8)), '@', 1))
 WHERE username IS NULL;

WITH d AS (
  SELECT id, lower(username) AS u,
         row_number() OVER (PARTITION BY lower(username) ORDER BY created_at, id) AS rn
    FROM public.profiles WHERE username IS NOT NULL
)
UPDATE public.profiles p SET username = d.u || '-' || left(p.id::text, 4)
  FROM d WHERE d.id = p.id AND d.rn > 1;

CREATE INDEX IF NOT EXISTS idx_profiles_lower_email ON public.profiles (lower(email));
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON public.profiles (school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active ON public.profiles(school_id, is_active) WHERE is_active=true;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_global_unique ON public.profiles (lower(username));
ALTER TABLE public.profiles ALTER COLUMN username SET NOT NULL;

-- ========= 4. MODULES =========
CREATE TABLE IF NOT EXISTS public.modules (
  id text PRIMARY KEY, name text NOT NULL
);
INSERT INTO public.modules(id,name) VALUES 
('students','Students'),('exams','Exams/Marks'),('fees','Fees'),
('attendance','Attendance'),('timetable','Timetable'),('reports','Reports')
ON CONFLICT DO NOTHING;

-- ========= 5. HOI_ACCESS + TEACHER_ACCESS =========
CREATE TABLE IF NOT EXISTS public.hoi_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_ids uuid[] DEFAULT '{}',
  module_ids text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.hoi_access ADD COLUMN IF NOT EXISTS school_id uuid REFERENCES public.schools(id);
ALTER TABLE public.hoi_access ADD COLUMN IF NOT EXISTS module_ids text[] DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.teacher_access (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_ids uuid[] DEFAULT '{}',
  subject_ids uuid[] DEFAULT '{}',
  module_ids text[] DEFAULT '{}',
  is_class_teacher boolean DEFAULT false,
  class_teacher_grade_id uuid REFERENCES public.grades(id),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_teacher_access_school ON public.teacher_access(school_id);
CREATE INDEX IF NOT EXISTS idx_hoi_access_school ON public.hoi_access(school_id);

-- ========= 6. PASSWORD RESET LOG =========
CREATE TABLE IF NOT EXISTS public.password_reset_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  email text NOT NULL,
  full_name text,
  role text,
  stage text NOT NULL DEFAULT 'requested' CHECK (stage IN ('requested','completed','failed')),
  acknowledged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reset_events_created ON public.password_reset_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reset_events_school ON public.password_reset_events(school_id);
ALTER TABLE public.password_reset_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.password_reset_events TO authenticated;
GRANT ALL ON public.password_reset_events TO service_role;
DROP POLICY IF EXISTS "superadmin reads reset events" ON public.password_reset_events;
CREATE POLICY "superadmin reads reset events" ON public.password_reset_events FOR SELECT TO authenticated USING (public.is_superadmin());
DROP POLICY IF EXISTS "superadmin updates reset events" ON public.password_reset_events;
CREATE POLICY "superadmin updates reset events" ON public.password_reset_events FOR UPDATE TO authenticated USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
DROP POLICY IF EXISTS "allow insert reset events" ON public.password_reset_events;
CREATE POLICY "allow insert reset events" ON public.password_reset_events FOR INSERT TO authenticated, anon WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.record_password_reset(_email text, _stage text DEFAULT 'requested')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _p public.profiles;
BEGIN
  IF _email IS NULL OR length(trim(_email))=0 THEN RETURN; END IF;
  SELECT * INTO _p FROM public.profiles WHERE lower(email)=lower(trim(_email)) LIMIT 1;
  INSERT INTO public.password_reset_events (user_id, school_id, email, full_name, role, stage)
  VALUES (_p.id, _p.school_id, lower(trim(_email)), _p.full_name,
    (SELECT role::text FROM public.user_roles WHERE user_id=_p.id LIMIT 1),
    CASE WHEN _stage IN ('requested','completed') THEN _stage ELSE 'requested' END);
  IF _stage='completed' AND _p.id IS NOT NULL THEN
    UPDATE public.profiles SET last_password_reset_at=now() WHERE id=_p.id;
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.record_password_reset(text,text) TO anon, authenticated;

-- ========= 7. RBAC HELPERS =========
CREATE OR REPLACE FUNCTION public.can_access_module(_module text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_superadmin()
      OR EXISTS (SELECT 1 FROM public.hoi_access WHERE user_id=auth.uid() AND (_module=ANY(module_ids) OR module_ids='{}' OR array_length(module_ids,1) IS NULL))
      OR EXISTS (SELECT 1 FROM public.teacher_access WHERE user_id=auth.uid() AND (_module=ANY(module_ids) OR module_ids='{}'))
$$;
CREATE OR REPLACE FUNCTION public.hoi_can_access_grade(_grade_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_superadmin()
      OR NOT EXISTS (SELECT 1 FROM public.hoi_access WHERE user_id=auth.uid())
      OR EXISTS (
           SELECT 1 FROM public.hoi_access ha JOIN public.grades g ON g.id=_grade_id
           WHERE ha.user_id=auth.uid() AND ha.school_id=g.school_id
             AND (ha.grade_ids IS NULL OR array_length(ha.grade_ids,1) IS NULL OR _grade_id=ANY(ha.grade_ids))
         );
$$;
CREATE OR REPLACE FUNCTION public.teacher_can_access_grade(_grade_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT public.is_superadmin() OR public.is_hoi() OR 
         EXISTS (SELECT 1 FROM public.teacher_access WHERE user_id=auth.uid() AND (_grade_id=ANY(grade_ids) OR is_class_teacher AND class_teacher_grade_id=_grade_id))
$$;
CREATE OR REPLACE FUNCTION public.username_available(_username text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT length(trim(_username))>=3 AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(username)=lower(trim(_username)));
$$;
GRANT EXECUTE ON FUNCTION public.username_available(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hoi_can_access_grade(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_module(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_can_access_grade(uuid) TO authenticated;

-- ========= 8. CREATE HOI (SUPERADMIN ONLY) =========
CREATE OR REPLACE FUNCTION public.create_hoi(_email text, _username text, _full_name text, _school_id uuid, _grade_ids uuid[], _module_ids text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid;
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'Only superadmin'; END IF;
  SELECT id INTO new_id FROM auth.users WHERE lower(email)=lower(_email) LIMIT 1;
  IF new_id IS NULL THEN RAISE EXCEPTION 'Create auth user first via Edge Function: supabase.auth.admin.createUser'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username)=lower(trim(_username)) AND id!=new_id) THEN RAISE EXCEPTION 'Username taken'; END IF;
  INSERT INTO public.profiles(id, school_id, email, username, full_name)
  VALUES (new_id, _school_id, lower(_email), lower(_username), _full_name)
  ON CONFLICT (id) DO UPDATE SET school_id=_school_id, email=EXCLUDED.email, username=EXCLUDED.username, full_name=EXCLUDED.full_name;
  INSERT INTO public.user_roles(user_id, role) VALUES (new_id, 'hoi') ON CONFLICT (user_id) DO UPDATE SET role='hoi';
  INSERT INTO public.hoi_access(user_id, school_id, grade_ids, module_ids)
  VALUES (new_id, _school_id, _grade_ids, _module_ids)
  ON CONFLICT (user_id) DO UPDATE SET school_id=EXCLUDED.school_id, grade_ids=EXCLUDED.grade_ids, module_ids=EXCLUDED.module_ids;
  RETURN new_id;
END; $$;

-- ========= 9. CREATE TEACHER (HOI + SUPERADMIN) =========
CREATE OR REPLACE FUNCTION public.create_teacher(_email text, _username text, _full_name text, _grade_ids uuid[], _subject_ids uuid[], _module_ids text[], _is_class_teacher boolean, _class_grade uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE new_id uuid; v_school uuid;
BEGIN
  IF NOT (public.is_superadmin() OR public.is_hoi()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  v_school := public.current_user_school_id();
  SELECT id INTO new_id FROM auth.users WHERE lower(email)=lower(_email) LIMIT 1;
  IF new_id IS NULL THEN RAISE EXCEPTION 'Create auth user first via Edge Function'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username)=lower(trim(_username)) AND id!=new_id) THEN RAISE EXCEPTION 'Username taken'; END IF;
  INSERT INTO public.profiles(id, school_id, email, username, full_name)
  VALUES (new_id, v_school, lower(_email), lower(_username), _full_name)
  ON CONFLICT (id) DO UPDATE SET school_id=v_school, username=EXCLUDED.username, full_name=EXCLUDED.full_name;
  INSERT INTO public.user_roles(user_id, role) VALUES (new_id, 'teacher') ON CONFLICT (user_id) DO UPDATE SET role='teacher';
  INSERT INTO public.teacher_access(user_id, school_id, grade_ids, subject_ids, module_ids, is_class_teacher, class_teacher_grade_id, created_by)
  VALUES (new_id, v_school, _grade_ids, _subject_ids, _module_ids, _is_class_teacher, _class_grade, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET grade_ids=EXCLUDED.grade_ids, subject_ids=EXCLUDED.subject_ids, module_ids=EXCLUDED.module_ids, is_class_teacher=EXCLUDED.is_class_teacher, class_teacher_grade_id=EXCLUDED.class_teacher_grade_id;
  RETURN new_id;
END; $$;

-- ========= 10. EDIT PROFILE + LOGIN DETAILS =========
CREATE OR REPLACE FUNCTION public.update_user_profile(
  _user_id uuid, _full_name text DEFAULT NULL, _username text DEFAULT NULL,
  _grade_ids uuid[] DEFAULT NULL, _subject_ids uuid[] DEFAULT NULL, _module_ids text[] DEFAULT NULL,
  _is_class_teacher boolean DEFAULT NULL, _class_grade uuid DEFAULT NULL, _is_active boolean DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_school uuid; is_super boolean;
BEGIN
  is_super := public.is_superadmin(); v_school := public.current_user_school_id();
  IF NOT is_super AND NOT public.is_hoi() THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF NOT is_super THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=_user_id AND school_id=v_school) THEN RAISE EXCEPTION 'User not in your school'; END IF;
    IF EXISTS (SELECT 1 FROM public.hoi_access WHERE user_id=_user_id) THEN RAISE EXCEPTION 'HOI cannot edit another HOI'; END IF;
  END IF;
  IF _username IS NOT NULL THEN
    IF length(trim(_username))<3 THEN RAISE EXCEPTION 'Username too short'; END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username)=lower(trim(_username)) AND id!=_user_id) THEN RAISE EXCEPTION 'Username taken'; END IF;
    UPDATE public.profiles SET username=lower(trim(_username)) WHERE id=_user_id;
  END IF;
  IF _full_name IS NOT NULL THEN UPDATE public.profiles SET full_name=_full_name WHERE id=_user_id; END IF;
  IF _is_active IS NOT NULL THEN UPDATE public.profiles SET is_active=_is_active WHERE id=_user_id; END IF;
  IF EXISTS (SELECT 1 FROM public.hoi_access WHERE user_id=_user_id) THEN
    UPDATE public.hoi_access SET grade_ids=COALESCE(_grade_ids,grade_ids), module_ids=COALESCE(_module_ids,module_ids) WHERE user_id=_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.teacher_access WHERE user_id=_user_id) THEN
    UPDATE public.teacher_access SET grade_ids=COALESCE(_grade_ids,grade_ids), subject_ids=COALESCE(_subject_ids,subject_ids), module_ids=COALESCE(_module_ids,module_ids), is_class_teacher=COALESCE(_is_class_teacher,is_class_teacher), class_teacher_grade_id=COALESCE(_class_grade,class_teacher_grade_id) WHERE user_id=_user_id;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.update_user_email(_user_id uuid, _new_email text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.is_superadmin() OR public.is_hoi()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF _new_email IS NULL OR position('@' in _new_email)=0 THEN RAISE EXCEPTION 'Invalid email'; END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(email)=lower(trim(_new_email)) AND id!=_user_id) THEN RAISE EXCEPTION 'Email taken'; END IF;
  UPDATE public.profiles SET email=lower(trim(_new_email)) WHERE id=_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_reset_password(_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE temp_pass text;
BEGIN
  IF NOT (public.is_superadmin() OR public.is_hoi()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  temp_pass := 'Temp@' || left(md5(random()::text), 8);
  PERFORM public.record_password_reset((SELECT email FROM public.profiles WHERE id=_user_id), 'completed');
  UPDATE public.profiles SET last_password_reset_at=now() WHERE id=_user_id;
  RETURN temp_pass;
END; $$;

CREATE OR REPLACE FUNCTION public.deactivate_user(_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT (public.is_superadmin() OR public.is_hoi()) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  UPDATE public.profiles SET is_active=false WHERE id=_user_id;
END; $$;

CREATE OR REPLACE FUNCTION public.transfer_hoi_school(_hoi_id uuid, _new_school_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'Only superadmin'; END IF;
  UPDATE public.profiles SET school_id=_new_school_id WHERE id=_hoi_id;
  UPDATE public.hoi_access SET school_id=_new_school_id WHERE user_id=_hoi_id;
END; $$;

-- ========= 11. RLS FOR 2M =========
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "school isolation students" ON public.students;
CREATE POLICY "school isolation students" ON public.students FOR ALL TO authenticated
USING ( public.is_superadmin() OR school_id=public.current_user_school_id() AND (public.hoi_can_access_grade(grade_id) OR public.teacher_can_access_grade(grade_id)) )
WITH CHECK ( public.is_superadmin() OR school_id=public.current_user_school_id() );

ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "school isolation marks" ON public.marks;
CREATE POLICY "school isolation marks" ON public.marks FOR SELECT TO authenticated
USING ( public.is_superadmin() OR public.is_hoi() OR EXISTS (SELECT 1 FROM public.students s WHERE s.id=marks.student_id AND s.school_id=public.current_user_school_id() AND public.teacher_can_access_grade(s.grade_id)) );

ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fees module check" ON public.fee_payments;
CREATE POLICY "fees module check" ON public.fee_payments FOR SELECT TO authenticated
USING ( public.is_superadmin() OR public.can_access_module('fees') );

-- ========= 12. PERFORMANCE INDEXES FOR 2M =========
CREATE INDEX IF NOT EXISTS idx_students_school_grade_status ON public.students (school_id, grade_id, status);
CREATE INDEX IF NOT EXISTS idx_students_names_trgm ON public.students USING gin (lower(first_name || ' ' || last_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_marks_student ON public.marks (student_id);
CREATE INDEX IF NOT EXISTS idx_marks_exam ON public.marks (exam_id);
CREATE INDEX IF NOT EXISTS idx_marks_student_exam_unique ON public.marks (student_id, exam_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_student_term ON public.fee_payments (student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_grade_term ON public.fee_structures (grade_id, term_id);
CREATE INDEX IF NOT EXISTS idx_exams_term_grade ON public.exams (term_id, grade_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher ON public.teacher_subjects (teacher_id);

-- Grant exec
GRANT EXECUTE ON FUNCTION public.create_hoi(text,text,text,uuid,uuid[],text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_teacher(text,text,text,uuid[],uuid[],text[],boolean,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_profile(uuid,text,text,uuid[],uuid[],text[],boolean,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_email(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_password(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_hoi_school(uuid,uuid) TO authenticated;
