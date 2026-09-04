CREATE TABLE public.fee_discounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, term_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_discounts TO authenticated;
GRANT ALL ON public.fee_discounts TO service_role;
ALTER TABLE public.fee_discounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school staff read discounts" ON public.fee_discounts FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "school staff manage discounts" ON public.fee_discounts FOR ALL TO authenticated USING (public.in_my_school(school_id)) WITH CHECK (public.in_my_school(school_id));
CREATE TRIGGER trg_fee_discounts_updated_at BEFORE UPDATE ON public.fee_discounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.mpesa_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  term_id uuid REFERENCES public.terms(id) ON DELETE SET NULL,
  phone text NOT NULL,
  amount numeric NOT NULL,
  account_reference text,
  merchant_request_id text,
  checkout_request_id text UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  result_code text,
  result_desc text,
  mpesa_receipt text,
  payment_id uuid REFERENCES public.fee_payments(id) ON DELETE SET NULL,
  initiated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.mpesa_transactions TO authenticated;
GRANT ALL ON public.mpesa_transactions TO service_role;
ALTER TABLE public.mpesa_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "school staff read mpesa" ON public.mpesa_transactions FOR SELECT TO authenticated USING (public.in_my_school(school_id));
CREATE POLICY "school staff start mpesa" ON public.mpesa_transactions FOR INSERT TO authenticated WITH CHECK (public.in_my_school(school_id));
CREATE TRIGGER trg_mpesa_updated_at BEFORE UPDATE ON public.mpesa_transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_mpesa_school_created ON public.mpesa_transactions (school_id, created_at DESC);
CREATE INDEX idx_fee_discounts_term ON public.fee_discounts (term_id, student_id);