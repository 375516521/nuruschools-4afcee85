REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_superadmin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.current_school_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_school_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.in_my_school(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.students_before_insert() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.students_protect_ids() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_adm_no(uuid,int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.generate_student_id(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_school_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.in_my_school(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_adm_no(uuid,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_student_id(uuid) TO authenticated;

-- ===== CHANGED PART: founder auto-elevation + create default user =====
CREATE OR REPLACE FUNCTION public.bootstrap_superadmin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) = 'charleswambua.edu@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'superadmin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.bootstrap_superadmin() FROM anon, public;

DROP TRIGGER IF EXISTS on_auth_user_bootstrap ON auth.users;
CREATE TRIGGER on_auth_user_bootstrap
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.bootstrap_superadmin();

-- Create default founder user with password @C#c2025 if it doesn't exist
DO $$
DECLARE 
  founder_id uuid;
BEGIN
  SELECT id INTO founder_id FROM auth.users WHERE email = 'charleswambua.edu@gmail.com';
  
  IF founder_id IS NULL THEN
    INSERT INTO auth.users 
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    VALUES 
    ('00000-0000-0000-0000-000',
     gen_random_uuid(),
     'authenticated',
     'authenticated',
     'charleswambua.edu@gmail.com',
     crypt('@C#c2025', gen_salt('bf')),
     now(), now(), now(),
     '{"provider":"email","providers":["email"]}'::jsonb,
     '{"full_name":"Charles Wambua"}'::jsonb)
    RETURNING id INTO founder_id;
    
    INSERT INTO public.user_roles (user_id, role) VALUES (founder_id, 'superadmin') ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Link founder to Nuru Demo School so RLS passes
DO $$
DECLARE founder_id uuid;
BEGIN
  SELECT id INTO founder_id FROM auth.users WHERE email = 'charleswambua.edu@gmail.com';
  IF founder_id IS NOT NULL THEN
    INSERT INTO public.school_members (school_id, user_id, role) 
    VALUES ('11111111-1111-1111-1111-111111111111', founder_id, 'admin')
    ON CONFLICT (school_id, user_id) DO NOTHING;
  END IF;
END $$;
-- ===== END CHANGED PART =====

-- ================= SEED =================
INSERT INTO public.schools (id, name, school_code, uli_code, county, phone, email, plan)
VALUES ('11111111-1111-1111-1111-111111111','Nuru Demo School','SDA','KEMIS-100234','Machakos','+254745939344','charleswambua.edu@gmail.com','pro')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.academic_years (id, school_id, year, is_active)
VALUES ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111',2026,true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.terms (id, school_id, academic_year_id, term_number, start_date, end_date, is_active) VALUES
('33333-3333-3333-3333-333333333331','11111111-1111-1111-1111-111111','22222-2222-2222-2222-222222222',1,'2026-01-05','2026-04-03',true),
('33333333-3333-3333-3333-333333333332','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',2,'2026-05-04','2026-08-07',false),
('33333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',3,'2026-09-07','2026-11-27',false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.grades (school_id, name, band, level_order) VALUES
('11111111-1111-1111-1111-111111111111','PP1','pre_primary',1),
('11111111-1111-1111-1111-111111111111','PP2','pre_primary',2),
('11111111-1111-1111-1111-111111111111','Grade 1','primary',3),
('11111111-1111-1111-1111-111111111','Grade 2','primary',4),
('11111111-1111-1111-1111-111111111111','Grade 3','primary',5),
('11111-1111-1111-1111-111111111111','Grade 4','primary',6),
('11111-1111-1111-1111-111111111','Grade 5','primary',7),
('11111-1111-1111-1111-111111111111','Grade 6','primary',8),
('11111111-1111-1111-1111-111','Grade 7','junior',9),
('11111111-1111-1111-1111-111','Grade 8','junior',10),
('11111111-1111-1111-1111-111111111','Grade 9','junior',11),
('11111111-1111-1111-1111-111111111111','Grade 10','senior',12),
('11111111-1111-1111-1111-111111111111','Grade 11','senior',13),
('11111111-1111-1111-1111-111111111111','Grade 12','senior',14)
ON CONFLICT DO NOTHING;

INSERT INTO public.streams (school_id, grade_id, name)
SELECT g.school_id, g.id, s.nm FROM public.grades g CROSS JOIN (VALUES ('A'),('B')) AS s(nm)
WHERE g.school_id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

INSERT INTO public.grade_id_configs (school_id, grade_id, id_prefix, start_number, upto_number, last_number)
SELECT g.school_id, g.id,
  CASE WHEN g.name LIKE 'PP%' THEN replace(g.name,' ','') ELSE 'GR' || replace(g.name,'Grade ','') END,
 1, 200, 0
FROM public.grades g WHERE g.school_id = '11111-1111-1111-1111-111111'
ON CONFLICT DO NOTHING;

INSERT INTO public.subjects (school_id, grade_id, name, code)
SELECT g.school_id, g.id, s.nm, s.cd FROM public.grades g
CROSS JOIN (VALUES ('Mathematics','MAT'),('English','ENG'),('Kiswahili','KIS'),('Integrated Science','SCI'),('Social Studies','SST')) AS s(nm,cd)
WHERE g.school_id = '11111-1111-1111-1111-111' AND g.band IN ('junior','primary')
ON CONFLICT DO NOTHING;

INSERT INTO public.fee_structures (school_id, academic_year_id, term_id, grade_id, item, amount)
SELECT g.school_id,'22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333331', g.id,'Tuition',
  CASE g.band WHEN 'pre_primary' THEN 8000 WHEN 'primary' THEN 12000 WHEN 'junior' THEN 18000 ELSE 25000 END
FROM public.grades g WHERE g.school_id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;

INSERT INTO public.students (school_id, first_name, last_name, gender, grade_id, stream_id, guardian_name, guardian_phone, year_joined)
SELECT '11111111-1111-1111-1111-111111111', v.fn, v.ln, v.gd,
  g.id, (SELECT st.id FROM public.streams st WHERE st.grade_id = g.id AND st.name = v.stream),
  v.gn, v.gp, 2026
FROM (VALUES
  ('John','Wambua','M','Grade 7','A','Mary Wambua','0722000111'),
  ('Faith','Mutiso','F','Grade 7','A','Peter Mutiso','0722000222'),
  ('Brian','Otieno','M','Grade 7','B','Alice Otieno','0722000333'),
  ('Grace','Njeri','F','Grade 8','A','Samuel Njeri','0722000444'),
  ('Kevin','Kiptoo','M','Grade 4','A','Ruth Kiptoo','0722000555'),
  ('Amina','Hassan','F','Grade 4','B','Yusuf Hassan','0722000666')
) AS v(fn,ln,gd,grade,stream,gn,gp)
JOIN public.grades g ON g.name = v.grade AND g.school_id = '11111111-1111-1111-1111-111111111111'
ON CONFLICT DO NOTHING;
