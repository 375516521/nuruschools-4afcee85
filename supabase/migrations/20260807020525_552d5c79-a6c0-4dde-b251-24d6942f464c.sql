CREATE OR REPLACE FUNCTION public.parent_student_summary(_student_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH s AS (
    SELECT st.*, sc.name AS school_name, sc.school_code, sc.logo_url,
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
                WHERE fs.grade_id = (SELECT grade_id FROM s)),0) AS billed,
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
      'school_name', s.school_name, 'school_code', s.school_code, 'logo_url', s.logo_url
    ),
    'term', (SELECT jsonb_build_object('year', ay.year, 'term', t.term_number)
             FROM public.terms t JOIN public.academic_years ay ON ay.id = t.academic_year_id
             WHERE t.school_id = s.school_id AND t.is_active LIMIT 1),
    'billed', amt.billed,
    'paid', amt.paid,
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
$function$;