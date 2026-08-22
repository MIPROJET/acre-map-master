-- 1. is_super_admin: lire la source autoritative (auth.users.raw_app_meta_data) au lieu du JWT
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and (
        coalesce(u.raw_app_meta_data ->> 'role', '') = 'super_admin'
        or coalesce((u.raw_app_meta_data ->> 'is_super_admin')::boolean, false) = true
      )
  )
$$;

-- 2. Retirer l'accès EXECUTE aux fonctions internes (triggers / event trigger)
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_lifecycle_flags() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Les fonctions d'autorisation restent appelables (utilisées par les policies RLS et le code serveur)
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 3. Garde-fou contre l'auto-attribution de rôles
CREATE OR REPLACE FUNCTION public.guard_user_roles_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  -- contextes serveur/interne (service_role, triggers) : pas de JWT
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if public.has_role(auth.uid(), 'admin') or public.is_super_admin() then
    return coalesce(new, old);
  end if;
  raise exception 'Seul un administrateur peut modifier les rôles';
end;
$$;

REVOKE ALL ON FUNCTION public.guard_user_roles_changes() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_user_roles_changes ON public.user_roles;
CREATE TRIGGER guard_user_roles_changes
BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_user_roles_changes();