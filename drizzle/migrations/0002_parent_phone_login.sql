CREATE OR REPLACE FUNCTION public.parent_login(_adm_no text, _guardian_phone text)
 RETURNS TABLE(id uuid, adm_no text, student_id text, full_name text, grade text, stream text, photo_url text, school_name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT s.id, s.adm_no, s.student_id, s.first_name || ' ' || s.last_name,
         g.name, st.name, s.photo_url, sc.name
  FROM public.students s
  JOIN public.schools sc ON sc.id = s.school_id
  LEFT JOIN public.grades g ON g.id = s.grade_id
  LEFT JOIN public.streams st ON st.id = s.stream_id
  WHERE s.status = 'active'
    AND _adm_no IS NOT NULL AND _guardian_phone IS NOT NULL
    AND length(regexp_replace(_guardian_phone,'\D','','g')) >= 9
    AND upper(trim(s.adm_no)) = upper(trim(_adm_no))
    AND right(regexp_replace(coalesce(s.guardian_phone,''),'\D','','g'), 9) = right(regexp_replace(_guardian_phone,'\D','','g'), 9)
  LIMIT 1;
$function$;
GRANT EXECUTE ON FUNCTION public.parent_login(text, text) TO anon, authenticated;