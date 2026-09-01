-- 1. Exams: allow deactivation
ALTER TABLE public.exams ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2. Attendance register
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  grade_id uuid REFERENCES public.grades(id) ON DELETE SET NULL,
  stream_id uuid REFERENCES public.streams(id) ON DELETE SET NULL,
  term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL,
  date date NOT NULL DEFAULT current_date,
  status text NOT NULL DEFAULT 'present',
  remark text,
  marked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance readable in school" ON public.attendance
  FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "attendance managed in school" ON public.attendance
  FOR ALL TO authenticated USING (public.in_my_school(school_id)) WITH CHECK (public.in_my_school(school_id));
CREATE INDEX IF NOT EXISTS idx_attendance_school_date ON public.attendance (school_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_grade_date ON public.attendance (grade_id, date);
CREATE TRIGGER trg_attendance_updated_at BEFORE UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Library
CREATE TABLE IF NOT EXISTS public.library_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  author text,
  isbn text,
  category text,
  total_copies integer NOT NULL DEFAULT 1,
  available_copies integer NOT NULL DEFAULT 1,
  shelf text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_books TO authenticated;
GRANT ALL ON public.library_books TO service_role;
ALTER TABLE public.library_books ENABLE ROW LEVEL SECURITY;
CREATE POLICY "books readable in school" ON public.library_books
  FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "books managed in school" ON public.library_books
  FOR ALL TO authenticated USING (public.in_my_school(school_id)) WITH CHECK (public.in_my_school(school_id));
CREATE TRIGGER trg_library_books_updated_at BEFORE UPDATE ON public.library_books
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.library_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.library_books(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  borrowed_on date NOT NULL DEFAULT current_date,
  due_on date,
  returned_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.library_loans TO authenticated;
GRANT ALL ON public.library_loans TO service_role;
ALTER TABLE public.library_loans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loans readable in school" ON public.library_loans
  FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "loans managed in school" ON public.library_loans
  FOR ALL TO authenticated USING (public.in_my_school(school_id)) WITH CHECK (public.in_my_school(school_id));
CREATE TRIGGER trg_library_loans_updated_at BEFORE UPDATE ON public.library_loans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Assets
CREATE TABLE IF NOT EXISTS public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  serial_number text,
  quantity integer NOT NULL DEFAULT 1,
  value numeric NOT NULL DEFAULT 0,
  location text,
  condition text NOT NULL DEFAULT 'good',
  purchased_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assets TO authenticated;
GRANT ALL ON public.assets TO service_role;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assets readable in school" ON public.assets
  FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "assets managed in school" ON public.assets
  FOR ALL TO authenticated USING (public.in_my_school(school_id)) WITH CHECK (public.in_my_school(school_id));
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON public.assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Uppercase learner names automatically
CREATE OR REPLACE FUNCTION public.students_uppercase_names()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.first_name := upper(trim(NEW.first_name));
  NEW.last_name := upper(trim(NEW.last_name));
  IF NEW.guardian_name IS NOT NULL THEN NEW.guardian_name := upper(trim(NEW.guardian_name)); END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_students_uppercase_ins ON public.students;
CREATE TRIGGER trg_students_uppercase_ins BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.students_uppercase_names();
DROP TRIGGER IF EXISTS trg_students_uppercase_upd ON public.students;
CREATE TRIGGER trg_students_uppercase_upd BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.students_uppercase_names();
