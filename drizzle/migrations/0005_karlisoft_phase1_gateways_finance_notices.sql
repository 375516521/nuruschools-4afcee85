ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS id_card_valid_until date;

CREATE TABLE public.school_gateway_settings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references public.schools(id) on delete cascade,
  whatsapp_api_key text,
  whatsapp_sender text,
  mpesa_consumer_key text,
  mpesa_consumer_secret text,
  mpesa_passkey text,
  mpesa_till text,
  mpesa_shortcode text,
  mpesa_environment text not null default 'sandbox' check (mpesa_environment in ('sandbox','production')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

CREATE TABLE public.notices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  title text not null,
  body text not null,
  notify_whatsapp boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);

CREATE TABLE public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  spent_on date not null default current_date,
  category text not null,
  description text,
  amount numeric(12,2) not null check (amount > 0),
  payment_method payment_method not null default 'cash',
  created_by uuid,
  created_at timestamptz not null default now()
);

CREATE TABLE public.budget_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  term_id uuid references public.terms(id) on delete cascade,
  category text not null,
  budgeted_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

CREATE TABLE public.petty_cash (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  entry_date date not null default current_date,
  description text not null,
  amount_out numeric(12,2) not null default 0,
  amount_in numeric(12,2) not null default 0,
  approved_by text,
  created_at timestamptz not null default now()
);

CREATE TABLE public.vouchers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  voucher_no text not null,
  issued_on date not null default current_date,
  payee text not null,
  description text,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'approved',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (school_id, voucher_no)
);

CREATE TABLE public.scholarships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  term_id uuid not null references public.terms(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_gateway_settings TO authenticated;
GRANT ALL ON public.school_gateway_settings TO service_role;
GRANT SELECT ON public.notices TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.notices TO authenticated;
GRANT ALL ON public.notices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_expenses TO authenticated;
GRANT ALL ON public.finance_expenses TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_items TO authenticated;
GRANT ALL ON public.budget_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.petty_cash TO authenticated;
GRANT ALL ON public.petty_cash TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vouchers TO authenticated;
GRANT ALL ON public.vouchers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scholarships TO authenticated;
GRANT ALL ON public.scholarships TO service_role;

ALTER TABLE public.school_gateway_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.petty_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scholarships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School admins manage gateway settings" ON public.school_gateway_settings
  FOR ALL TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY "Anyone can read notices" ON public.notices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "School admins manage notices" ON public.notices FOR ALL TO authenticated
  USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY "School members read expenses" ON public.finance_expenses FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "School admins manage expenses" ON public.finance_expenses FOR ALL TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "School members read budget items" ON public.budget_items FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "School admins manage budget items" ON public.budget_items FOR ALL TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "School members read petty cash" ON public.petty_cash FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "School admins manage petty cash" ON public.petty_cash FOR ALL TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "School members read vouchers" ON public.vouchers FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "School admins manage vouchers" ON public.vouchers FOR ALL TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "School members read scholarships" ON public.scholarships FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "School admins manage scholarships" ON public.scholarships FOR ALL TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE TRIGGER school_gateway_settings_updated_at AFTER UPDATE ON public.school_gateway_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.school_gateway_settings IS 'Per-school WhatsApp and M-Pesa Daraja credentials (HOI Settings)';
COMMENT ON COLUMN public.schools.id_card_valid_until IS 'ID card validity date printed on student ID cards';

-- Re-expose the parent summary with the school id so the parent portal can load the notice board.
CREATE OR REPLACE FUNCTION public.parent_student_summary(_student_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH s AS (
    SELECT st.*, sc.id AS school_uuid, sc.name AS school_name, sc.school_code, sc.logo_url,
           g.name AS grade_name, str.name AS stream_name
    FROM public.students st
    JOIN public.schools sc ON sc.id = st.school_id
    LEFT JOIN public.grades g ON g.id = st.grade_id
    LEFT JOIN public.streams str ON str.id = st.stream_id
    WHERE st.id = _student_id
  ),
  amt AS (
    SELECT
      COALESCE((SELECT SUM(fs.amount) FROM public.fee_structures fs
                JOIN public.terms t ON t.id = fs.term_id AND t.is_active
                WHERE fs.grade_id = (SELECT grade_id FROM s)),0)
      - COALESCE((SELECT SUM(fd.amount) FROM public.fee_discounts fd
                JOIN public.terms t ON t.id = fd.term_id AND t.is_active
                WHERE fd.student_id = _student_id),0)
      - COALESCE((SELECT SUM(so.amount) FROM public.scholarships so
                JOIN public.terms t ON t.id = so.term_id AND t.is_active
                WHERE so.student_id = _student_id),0) AS billed,
      COALESCE((SELECT SUM(fp.amount) FROM public.fee_payments fp
                JOIN public.terms t ON t.id = fp.term_id AND t.is_active
                WHERE fp.student_id = _student_id),0) AS paid
  )
  SELECT jsonb_build_object(
    'student', jsonb_build_object(
      'adm_no', s.adm_no, 'student_id', s.student_id,
      'full_name', s.first_name || ' ' || s.last_name,
      'grade', s.grade_name, 'stream', s.stream_name, 'photo_url', s.photo_url,
      'guardian_phone', s.guardian_phone,
      'school_id', s.school_uuid,
      'school_name', s.school_name, 'school_code', s.school_code, 'logo_url', s.logo_url
    ),
    'term', (SELECT jsonb_build_object('year', ay.year, 'term', t.term_number)
             FROM public.terms t JOIN public.academic_years ay ON ay.id = t.academic_year_id
             WHERE t.school_id = s.school_uuid AND t.is_active LIMIT 1),
    'billed', amt.billed, 'paid', amt.paid,
    'balance', amt.billed - amt.paid,
    'unlocked', (amt.billed - amt.paid) <= 0,
    'results', CASE WHEN (amt.billed - amt.paid) <= 0 THEN
        COALESCE((SELECT jsonb_agg(jsonb_build_object('subject', sub.name, 'score', m.score, 'level', m.performance_level, 'exam', e.name, 'comment', m.comment))
             FROM public.marks m
             JOIN public.exams e ON e.id = m.exam_id
             JOIN public.terms t ON t.id = e.term_id AND t.is_active
             JOIN public.subjects sub ON sub.id = m.subject_id
             WHERE m.student_id = _student_id), '[]'::jsonb)
      ELSE '[]'::jsonb END
  )
  FROM s, amt;
$$;