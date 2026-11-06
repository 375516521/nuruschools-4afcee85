-- Create payroll_records table
CREATE TABLE IF NOT EXISTS public.payroll_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    staff_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    month VARCHAR(7) NOT NULL, -- Format: YYYY-MM e.g. '2026-11'
    basic_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
    allowances NUMERIC(12,2) NOT NULL DEFAULT 0,
    deduction_nssf NUMERIC(12,2) NOT NULL DEFAULT 0,
    deduction_nhif NUMERIC(12,2) NOT NULL DEFAULT 0,
    deduction_paye NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_deductions NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid')),
    payment_method public.payment_method DEFAULT 'bank',
    paid_at TIMESTAMPTZ,
    expense_id UUID REFERENCES public.finance_expenses(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_school_staff_month UNIQUE(school_id, staff_id, month)
);

-- Enable RLS
ALTER TABLE public.payroll_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "School staff can view payroll records for their school"
    ON public.payroll_records FOR SELECT
    USING (
        school_id IN (
            SELECT school_id FROM public.profiles WHERE id = auth.uid()
        )
    );

CREATE POLICY "School admin or HOI can manage payroll records"
    ON public.payroll_records FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role IN ('superadmin', 'hoi')
        )
    );

-- Index for speedy monthly lookups
CREATE INDEX IF NOT EXISTS idx_payroll_school_month ON public.payroll_records(school_id, month);
