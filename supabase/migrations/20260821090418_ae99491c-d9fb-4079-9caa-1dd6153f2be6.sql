
-- 1. Role-scoped SELECT on operational tables (replace USING (true))
do $$
declare t text;
begin
  foreach t in array array['domaines','lots','measurements','imports','sps','parcelles'] loop
    execute format('drop policy if exists %I on public.%I', t||'_select', t);
    execute format($f$create policy %I on public.%I for select to authenticated
      using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent') or public.has_role(auth.uid(),'viewer'))$f$, t||'_select', t);
  end loop;
end $$;

-- 2. profiles: own profile or admin
drop policy if exists profiles_select_auth on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- 3. user_roles: own roles or admin
drop policy if exists user_roles_select_auth on public.user_roles;
create policy user_roles_select_own on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

-- 4. Revoke EXECUTE on internal SECURITY DEFINER trigger functions
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.protect_profile_lifecycle_flags() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
