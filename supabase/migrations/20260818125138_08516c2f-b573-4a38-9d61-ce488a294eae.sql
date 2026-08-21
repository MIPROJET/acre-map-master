-- 1) Storage: prevent ownership reassignment on update
DROP POLICY IF EXISTS "acremap_files_update" ON storage.objects;
CREATE POLICY "acremap_files_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = ANY (ARRAY['imports','photos'])
    AND ((owner = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  )
  WITH CHECK (
    bucket_id = ANY (ARRAY['imports','photos'])
    AND ((owner = auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

-- 2) Profiles: harden lifecycle-flag protection (defense in depth alongside the trigger)
CREATE OR REPLACE FUNCTION public.protect_profile_lifecycle_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- service_role / internal contexts (no JWT) keep full control
  if auth.uid() is null then
    return new;
  end if;
  if public.has_role(auth.uid(), 'admin') then
    return new;
  end if;
  new.disabled := old.disabled;
  new.must_change_password := old.must_change_password;
  new.id := old.id;
  return new;
end; $function$;

DROP TRIGGER IF EXISTS protect_profile_lifecycle_flags ON public.profiles;
CREATE TRIGGER protect_profile_lifecycle_flags
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_lifecycle_flags();

-- 3) Revoke EXECUTE on SECURITY DEFINER functions from unauthenticated roles
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE ALL ON FUNCTION public.is_super_admin() FROM anon, public;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.protect_profile_lifecycle_flags() FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM anon, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.protect_profile_lifecycle_flags() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated, service_role;