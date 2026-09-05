CREATE POLICY "hoi_access_school_admin_manage" ON public.hoi_access
FOR ALL TO authenticated
USING (public.is_school_admin(school_id) AND (public.is_superadmin() OR user_id <> auth.uid()))
WITH CHECK (public.is_school_admin(school_id) AND (public.is_superadmin() OR user_id <> auth.uid()));