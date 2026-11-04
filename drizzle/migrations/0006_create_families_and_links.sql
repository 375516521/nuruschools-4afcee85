-- Family groups: one family per school, auto FAM numbers, sibling discount config
CREATE TABLE public.families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  fam_no text NOT NULL,
  primary_phone text,
  sibling_discount_type text NOT NULL DEFAULT 'none' CHECK (sibling_discount_type IN ('none','percent','amount')),
  sibling_discount_value numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, fam_no)
);

CREATE OR REPLACE FUNCTION public.next_fam_no(_school_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE n int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_school_id::text, 0));
  SELECT COALESCE(MAX(substring(fam_no from 4)::int), 0) + 1 INTO n
  FROM public.families
  WHERE school_id = _school_id AND fam_no ~ '^FAM[0-9]+$';
  RETURN 'FAM' || LPAD(n::text, 3, '0');
END $$;

CREATE OR REPLACE FUNCTION public.families_set_fam_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.fam_no IS NULL OR NEW.fam_no = '' THEN
    NEW.fam_no := public.next_fam_no(NEW.school_id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER families_before_insert
BEFORE INSERT ON public.families
FOR EACH ROW EXECUTE FUNCTION public.families_set_fam_no();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.families TO authenticated;
GRANT ALL ON public.families TO service_role;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
CREATE POLICY "families school read"
  ON public.families FOR SELECT TO authenticated
  USING (in_my_school(school_id));
CREATE POLICY "families school admin write"
  ON public.families FOR ALL TO authenticated
  USING (is_school_admin(school_id))
  WITH CHECK (is_school_admin(school_id));

-- Learners belong to an optional family and can hold wallet credit
ALTER TABLE public.students ADD COLUMN family_id uuid REFERENCES public.families(id) ON DELETE SET NULL;
ALTER TABLE public.students ADD COLUMN wallet_balance numeric NOT NULL DEFAULT 0;
CREATE INDEX students_family_idx ON public.students (family_id);

-- Mark payments made through a family account so receipts/statements show it
ALTER TABLE public.fee_payments ADD COLUMN family_code text;

-- Parent portal: family payload, verified by the same admission number + phone check
CREATE OR REPLACE FUNCTION public.parent_family(_adm_no text, _guardian_phone text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH me AS (
    SELECT s.id, s.family_id, s.school_id
    FROM public.students s
    WHERE s.status = 'active'
      AND _adm_no IS NOT NULL AND _guardian_phone IS NOT NULL
      AND length(regexp_replace(_guardian_phone,'\D','','g')) >= 9
      AND upper(trim(s.adm_no)) = upper(trim(_adm_no))
      AND right(regexp_replace(coalesce(s.guardian_phone,''),'\D','','g'), 9) = right(regexp_replace(_guardian_phone,'\D','','g'), 9)
    LIMIT 1
  ), fam AS (
    SELECT f.* FROM public.families f JOIN me ON me.family_id = f.id
  ), kids AS (
    SELECT st.id, st.adm_no, st.first_name, st.last_name, st.wallet_balance,
           g.name AS grade_name, str.name AS stream_name, st.photo_url
    FROM public.students st
    JOIN fam ON fam.id = st.family_id
    LEFT JOIN public.grades g ON g.id = st.grade_id
    LEFT JOIN public.streams str ON str.id = st.stream_id
    WHERE st.status = 'active'
    ORDER BY st.adm_no
  ), kid_amt AS (
    SELECT k.id,
      COALESCE((SELECT SUM(fs.amount) FROM public.fee_structures fs
                JOIN public.terms t ON t.id = fs.term_id AND t.is_active
                WHERE fs.grade_id = (SELECT grade_id FROM public.students st WHERE st.id = k.id)),0)
      - COALESCE((SELECT SUM(fd.amount) FROM public.fee_discounts fd
                JOIN public.terms t ON t.id = fd.term_id AND t.is_active
                WHERE fd.student_id = k.id),0)
      - COALESCE((SELECT SUM(so.amount) FROM public.scholarships so
                JOIN public.terms t ON t.id = so.term_id AND t.is_active
                WHERE so.student_id = k.id),0) AS billed,
      COALESCE((SELECT SUM(fp.amount) FROM public.fee_payments fp
                JOIN public.terms t ON t.id = fp.term_id AND t.is_active
                WHERE fp.student_id = k.id),0) AS paid
    FROM kids k
  )
  SELECT CASE WHEN fam.id IS NULL THEN NULL ELSE jsonb_build_object(
    'family', jsonb_build_object('id', fam.id, 'fam_no', fam.fam_no,
      'primary_phone', fam.primary_phone,
      'sibling_discount_type', fam.sibling_discount_type,
      'sibling_discount_value', fam.sibling_discount_value),
    'school', jsonb_build_object('name', sc.name, 'logo_url', sc.logo_url),
    'term', (SELECT jsonb_build_object('year', ay.year, 'term', t.term_number)
             FROM public.terms t JOIN public.academic_years ay ON ay.id = t.academic_year_id
             WHERE t.school_id = me.school_id AND t.is_active LIMIT 1),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', k.id, 'adm_no', k.adm_no,
        'full_name', k.first_name || ' ' || k.last_name,
        'grade', k.grade_name, 'stream', k.stream_name, 'photo_url', k.photo_url,
        'billed', ka.billed, 'paid', ka.paid, 'wallet', k.wallet_balance))
      FROM kids k JOIN kid_amt ka ON ka.id = k.id), '[]'::jsonb)
  ) END
  FROM me
  LEFT JOIN fam ON fam.id = me.family_id
  LEFT JOIN public.schools sc ON sc.id = me.school_id;
$$;

GRANT EXECUTE ON FUNCTION public.parent_family(text, text) TO anon, authenticated;
