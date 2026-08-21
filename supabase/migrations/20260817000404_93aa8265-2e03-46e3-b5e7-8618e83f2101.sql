INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::app_role FROM auth.users u WHERE u.email = 'innocentkoffi1@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles SET full_name = 'KOFFI Inocent', disabled = false, must_change_password = false
WHERE id = (SELECT id FROM auth.users WHERE email = 'innocentkoffi1@gmail.com');