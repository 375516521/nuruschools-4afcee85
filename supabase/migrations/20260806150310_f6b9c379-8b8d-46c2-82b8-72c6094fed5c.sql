
-- generic school-scoped tables: read for members, write for HOI/SuperAdmin
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['academic_years','terms','grades','streams','grade_id_configs',
    'teachers','subjects','teacher_subjects','exams','fee_structures','transfers','competency_scores']
  LOOP
    EXECUTE format('CREATE POLICY "%1$s read" ON public.%1$s FOR SELECT TO authenticated USING (public.in_my_school(school_id));', t);
    EXECUTE format('CREATE POLICY "%1$s admin write" ON public.%1$s FOR ALL TO authenticated USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));', t);
  END LOOP;
END $$;

-- admission counters: internal, admin only
CREATE POLICY "counters admin" ON public.admission_counters FOR ALL TO authenticated
  USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

-- students
CREATE POLICY "students read" ON public.students FOR SELECT TO authenticated
  USING (public.in_my_school(school_id) OR user_id = auth.uid());
CREATE POLICY "students admin write" ON public.students FOR ALL TO authenticated
  USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

-- marks: school staff read, teachers + admins write
CREATE POLICY "marks read" ON public.marks FOR SELECT TO authenticated
  USING (public.in_my_school(school_id)
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = marks.student_id AND s.user_id = auth.uid()));
CREATE POLICY "marks staff write" ON public.marks FOR ALL TO authenticated
  USING (public.is_school_admin(school_id) OR (public.has_role(auth.uid(),'teacher') AND public.in_my_school(school_id)))
  WITH CHECK (public.is_school_admin(school_id) OR (public.has_role(auth.uid(),'teacher') AND public.in_my_school(school_id)));

-- fee payments
CREATE POLICY "payments read" ON public.fee_payments FOR SELECT TO authenticated
  USING (public.in_my_school(school_id)
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = fee_payments.student_id AND s.user_id = auth.uid()));
CREATE POLICY "payments admin write" ON public.fee_payments FOR ALL TO authenticated
  USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

-- audit logs: append-only for signed-in users, readable by admins
CREATE POLICY "audit insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "audit read" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_superadmin() OR public.is_school_admin(school_id));
