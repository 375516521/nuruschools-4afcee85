ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signature_url text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS title text;

CREATE TABLE IF NOT EXISTS public.hoi_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade_ids uuid[] NOT NULL DEFAULT '{}',
  modules text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, school_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hoi_access TO authenticated;
GRANT ALL ON public.hoi_access TO service_role;
ALTER TABLE public.hoi_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hoi_access_read_own_or_super" ON public.hoi_access
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_superadmin());

CREATE POLICY "hoi_access_super_manage" ON public.hoi_access
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$;

CREATE TRIGGER trg_hoi_access_updated_at
  BEFORE UPDATE ON public.hoi_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS students_adm_no_global_unique ON public.students (upper(adm_no));

CREATE OR REPLACE FUNCTION public.log_audit(_action text, _entity text DEFAULT NULL, _entity_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (school_id, user_id, action, entity, entity_id)
  VALUES (public.current_school_id(), auth.uid(), _action, _entity, _entity_id);
END; $$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text) TO authenticated;