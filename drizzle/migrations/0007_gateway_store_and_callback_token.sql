ALTER TABLE public.school_gateway_settings ADD COLUMN IF NOT EXISTS store_name text;
ALTER TABLE public.school_gateway_settings ADD COLUMN IF NOT EXISTS callback_token text NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex');
ALTER TABLE public.mpesa_transactions ADD COLUMN IF NOT EXISTS payer_name text;
GRANT ALL ON public.mpesa_transactions TO service_role;
DROP POLICY IF EXISTS "School admins update mpesa" ON public.mpesa_transactions;
CREATE POLICY "School admins update mpesa" ON public.mpesa_transactions FOR UPDATE TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));
GRANT UPDATE ON public.mpesa_transactions TO authenticated;