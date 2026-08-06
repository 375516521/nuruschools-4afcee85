
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('superadmin','hoi','teacher','student');
CREATE TYPE public.student_status AS ENUM ('active','deactivated','graduated','archived','transferred_out');
CREATE TYPE public.grade_band AS ENUM ('pre_primary','primary','junior','senior');
CREATE TYPE public.payment_method AS ENUM ('cash','bank','mpesa','cheque','waiver');
CREATE TYPE public.cbc_level AS ENUM ('exceeding','meeting','approaching','below');

-- ============ CORE ============
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  school_code text NOT NULL UNIQUE,
  uli_code text,
  county text,
  phone text,
  email text,
  logo_url text,
  modules jsonb NOT NULL DEFAULT '{"academics":true,"fees":true,"assets":false,"library":false,"hr":false,"ai":true,"biometrics":false,"parentapp":true,"elearning":false,"procurement":false,"admissions":true,"transport":false,"hostel":false,"bom":false,"api":false}'::jsonb,
  plan text NOT NULL DEFAULT 'starter',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  must_change_password boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  UNIQUE (user_id, role)
);

-- ============ SECURITY HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'superadmin');
$$;

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin(_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_superadmin()
      OR (public.has_role(auth.uid(),'hoi') AND public.current_school_id() = _school);
$$;

CREATE OR REPLACE FUNCTION public.in_my_school(_school uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_superadmin() OR public.current_school_id() = _school;
$$;

-- ============ ACADEMIC STRUCTURE ============
CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  year int NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, year)
);

CREATE TABLE public.terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  term_number int NOT NULL CHECK (term_number BETWEEN 1 AND 3),
  start_date date,
  end_date date,
  is_active boolean NOT NULL DEFAULT false,
  UNIQUE (academic_year_id, term_number)
);

CREATE TABLE public.grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  band public.grade_band NOT NULL,
  level_order int NOT NULL,
  UNIQUE (school_id, name)
);

CREATE TABLE public.streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  name text NOT NULL,
  UNIQUE (grade_id, name)
);

CREATE TABLE public.grade_id_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL UNIQUE REFERENCES public.grades(id) ON DELETE CASCADE,
  id_prefix text NOT NULL,
  start_number int NOT NULL DEFAULT 1,
  upto_number int NOT NULL DEFAULT 200,
  last_number int NOT NULL DEFAULT 0
);

CREATE TABLE public.admission_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  year int NOT NULL,
  last_sequence int NOT NULL DEFAULT 0,
  UNIQUE (school_id, year)
);

-- ============ PEOPLE ============
CREATE TABLE public.teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  email text,
  phone text,
  tsc_number text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  adm_no text NOT NULL,
  student_id text,
  first_name text NOT NULL,
  last_name text NOT NULL,
  gender text,
  dob date,
  photo_url text,
  grade_id uuid REFERENCES public.grades(id) ON DELETE SET NULL,
  stream_id uuid REFERENCES public.streams(id) ON DELETE SET NULL,
  guardian_name text,
  guardian_phone text,
  status public.student_status NOT NULL DEFAULT 'active',
  year_joined int NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  status_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, adm_no),
  UNIQUE (school_id, student_id)
);

CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_id uuid REFERENCES public.grades(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text
);

CREATE TABLE public.teacher_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  stream_id uuid REFERENCES public.streams(id) ON DELETE CASCADE,
  UNIQUE (teacher_id, subject_id, grade_id, stream_id)
);

-- ============ EXAMS ============
CREATE TABLE public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  stream_id uuid REFERENCES public.streams(id) ON DELETE CASCADE,
  name text NOT NULL,
  max_score int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  exam_id uuid NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  score numeric(5,2),
  performance_level text,
  comment text,
  UNIQUE (exam_id, student_id, subject_id)
);

CREATE TABLE public.competency_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  competency text NOT NULL,
  level public.cbc_level NOT NULL,
  UNIQUE (term_id, student_id, competency)
);

-- ============ FEES ============
CREATE TABLE public.fee_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  grade_id uuid NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  stream_id uuid REFERENCES public.streams(id) ON DELETE CASCADE,
  item text NOT NULL DEFAULT 'Tuition',
  amount numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE public.fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  method public.payment_method NOT NULL DEFAULT 'cash',
  reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============ LIFECYCLE / OPS ============
CREATE TABLE public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  transfer_type text NOT NULL,
  destination text,
  reason text,
  fee_cleared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============ INDEXES ============
CREATE INDEX idx_profiles_school ON public.profiles(school_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_years_school ON public.academic_years(school_id);
CREATE INDEX idx_terms_year ON public.terms(academic_year_id);
CREATE INDEX idx_grades_school ON public.grades(school_id);
CREATE INDEX idx_streams_grade ON public.streams(grade_id);
CREATE INDEX idx_students_school ON public.students(school_id);
CREATE INDEX idx_students_grade ON public.students(grade_id);
CREATE INDEX idx_students_admno ON public.students(adm_no);
CREATE INDEX idx_students_guardian ON public.students(guardian_phone);
CREATE INDEX idx_teachers_school ON public.teachers(school_id);
CREATE INDEX idx_subjects_grade ON public.subjects(grade_id);
CREATE INDEX idx_ts_teacher ON public.teacher_subjects(teacher_id);
CREATE INDEX idx_exams_term ON public.exams(term_id);
CREATE INDEX idx_marks_exam ON public.marks(exam_id);
CREATE INDEX idx_marks_student ON public.marks(student_id);
CREATE INDEX idx_fs_term ON public.fee_structures(term_id);
CREATE INDEX idx_fp_student ON public.fee_payments(student_id);
CREATE INDEX idx_audit_school ON public.audit_logs(school_id);

-- ============ GENERATOR FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.generate_adm_no(_school_id uuid, _year int)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _code text; _seq int;
BEGIN
  SELECT school_code INTO _code FROM public.schools WHERE id = _school_id;
  IF _code IS NULL THEN RAISE EXCEPTION 'School not found'; END IF;
  INSERT INTO public.admission_counters (school_id, year, last_sequence)
  VALUES (_school_id, _year, 1)
  ON CONFLICT (school_id, year) DO UPDATE SET last_sequence = public.admission_counters.last_sequence + 1
  RETURNING last_sequence INTO _seq;
  RETURN _code || '-' || _year::text || '-' || lpad(_seq::text, 4, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.generate_student_id(_grade_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cfg public.grade_id_configs; _next int;
BEGIN
  SELECT * INTO _cfg FROM public.grade_id_configs WHERE grade_id = _grade_id FOR UPDATE;
  IF _cfg.id IS NULL THEN RETURN NULL; END IF;
  _next := GREATEST(_cfg.last_number + 1, _cfg.start_number);
  IF _next > _cfg.upto_number THEN
    RAISE EXCEPTION 'ID range exhausted for this grade (limit %)', _cfg.upto_number;
  END IF;
  UPDATE public.grade_id_configs SET last_number = _next WHERE id = _cfg.id;
  RETURN _cfg.id_prefix || '-' || lpad(_next::text, 3, '0');
END; $$;

CREATE OR REPLACE FUNCTION public.students_before_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.adm_no IS NULL OR NEW.adm_no = '' THEN
    NEW.adm_no := public.generate_adm_no(NEW.school_id, COALESCE(NEW.year_joined, EXTRACT(YEAR FROM now())::int));
  END IF;
  IF (NEW.student_id IS NULL OR NEW.student_id = '') AND NEW.grade_id IS NOT NULL THEN
    NEW.student_id := public.generate_student_id(NEW.grade_id);
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_students_before_insert
BEFORE INSERT ON public.students FOR EACH ROW EXECUTE FUNCTION public.students_before_insert();

-- adm_no / student_id are immutable
CREATE OR REPLACE FUNCTION public.students_protect_ids()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.adm_no := OLD.adm_no;
  IF OLD.student_id IS NOT NULL THEN NEW.student_id := OLD.student_id; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_students_protect_ids
BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.students_protect_ids();

-- new auth user -> profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- public ID verification (safe columns only)
CREATE OR REPLACE FUNCTION public.verify_student_id(_adm_no text)
RETURNS TABLE (adm_no text, student_id text, full_name text, grade text, stream text, photo_url text, school_name text, school_code text, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.adm_no, s.student_id, s.first_name || ' ' || s.last_name,
         g.name, st.name, s.photo_url, sc.name, sc.school_code, s.status::text
  FROM public.students s
  JOIN public.schools sc ON sc.id = s.school_id
  LEFT JOIN public.grades g ON g.id = s.grade_id
  LEFT JOIN public.streams st ON st.id = s.stream_id
  WHERE upper(s.adm_no) = upper(_adm_no);
$$;

-- parent lookup (no login): by adm no OR first name + guardian phone
CREATE OR REPLACE FUNCTION public.parent_lookup(_adm_no text DEFAULT NULL, _first_name text DEFAULT NULL, _guardian_phone text DEFAULT NULL)
RETURNS TABLE (id uuid, adm_no text, student_id text, full_name text, grade text, stream text, photo_url text, school_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.adm_no, s.student_id, s.first_name || ' ' || s.last_name,
         g.name, st.name, s.photo_url, sc.name
  FROM public.students s
  JOIN public.schools sc ON sc.id = s.school_id
  LEFT JOIN public.grades g ON g.id = s.grade_id
  LEFT JOIN public.streams st ON st.id = s.stream_id
  WHERE s.status = 'active' AND (
    (_adm_no IS NOT NULL AND upper(s.adm_no) = upper(_adm_no))
    OR (_first_name IS NOT NULL AND _guardian_phone IS NOT NULL
        AND lower(s.first_name) = lower(_first_name)
        AND right(regexp_replace(s.guardian_phone,'\D','','g'), 9) = right(regexp_replace(_guardian_phone,'\D','','g'), 9))
  )
  LIMIT 20;
$$;

-- parent dashboard summary for one student
CREATE OR REPLACE FUNCTION public.parent_student_summary(_student_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'student', jsonb_build_object(
      'adm_no', s.adm_no, 'student_id', s.student_id,
      'full_name', s.first_name || ' ' || s.last_name,
      'grade', g.name, 'stream', st.name, 'photo_url', s.photo_url,
      'guardian_phone', s.guardian_phone,
      'school_name', sc.name, 'school_code', sc.school_code, 'logo_url', sc.logo_url
    ),
    'term', (SELECT jsonb_build_object('year', ay.year, 'term', t.term_number)
             FROM public.terms t JOIN public.academic_years ay ON ay.id = t.academic_year_id
             WHERE t.school_id = s.school_id AND t.is_active LIMIT 1),
    'billed', COALESCE((SELECT SUM(fs.amount) FROM public.fee_structures fs
             JOIN public.terms t ON t.id = fs.term_id AND t.is_active
             WHERE fs.grade_id = s.grade_id),0),
    'paid', COALESCE((SELECT SUM(fp.amount) FROM public.fee_payments fp
             JOIN public.terms t ON t.id = fp.term_id AND t.is_active
             WHERE fp.student_id = s.id),0),
    'results', COALESCE((SELECT jsonb_agg(jsonb_build_object('subject', sub.name, 'score', m.score, 'level', m.performance_level, 'exam', e.name))
             FROM public.marks m
             JOIN public.exams e ON e.id = m.exam_id
             JOIN public.terms t ON t.id = e.term_id AND t.is_active
             JOIN public.subjects sub ON sub.id = m.subject_id
             WHERE m.student_id = s.id), '[]'::jsonb)
  )
  FROM public.students s
  JOIN public.schools sc ON sc.id = s.school_id
  LEFT JOIN public.grades g ON g.id = s.grade_id
  LEFT JOIN public.streams st ON st.id = s.stream_id
  WHERE s.id = _student_id;
$$;

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools, public.profiles, public.user_roles,
  public.academic_years, public.terms, public.grades, public.streams, public.grade_id_configs,
  public.admission_counters, public.teachers, public.students, public.subjects, public.teacher_subjects,
  public.exams, public.marks, public.competency_scores, public.fee_structures, public.fee_payments,
  public.transfers, public.audit_logs TO authenticated;
GRANT ALL ON public.schools, public.profiles, public.user_roles,
  public.academic_years, public.terms, public.grades, public.streams, public.grade_id_configs,
  public.admission_counters, public.teachers, public.students, public.subjects, public.teacher_subjects,
  public.exams, public.marks, public.competency_scores, public.fee_structures, public.fee_payments,
  public.transfers, public.audit_logs TO service_role;

REVOKE ALL ON FUNCTION public.generate_adm_no(uuid,int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.generate_student_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_adm_no(uuid,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_student_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_student_id(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parent_lookup(text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parent_student_summary(uuid) TO anon, authenticated;

-- ============ RLS ============
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_id_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competency_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.in_my_school(school_id));
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_superadmin()) WITH CHECK (id = auth.uid() OR public.is_superadmin());
CREATE POLICY "profiles admin write" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR public.has_role(auth.uid(),'hoi'));

CREATE POLICY "roles read own" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin() OR public.has_role(auth.uid(),'hoi'));
CREATE POLICY "roles superadmin manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());

CREATE POLICY "schools read" ON public.schools FOR SELECT TO authenticated
  USING (public.in_my_school(id));
CREATE POLICY "schools superadmin manage" ON public.schools FOR ALL TO authenticated
  USING (public.is_superadmin()) WITH CHECK (public.is_superadmin());
CREATE POLICY "schools hoi update" ON public.schools FOR UPDATE TO authenticated
  USING (public.is_school_admin(id)) WITH CHECK (public.is_school_admin(id));
