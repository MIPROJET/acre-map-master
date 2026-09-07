-- Revoke direct EXECUTE on trigger-only SECURITY DEFINER functions.
-- Trigger execution does not require EXECUTE privilege for the triggering
-- user, so the triggers keep working while these functions disappear from
-- the callable API surface for anon/authenticated clients.
revoke execute on function public.guard_user_roles_changes() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.protect_profile_lifecycle_flags() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- has_role() and is_super_admin() are intentionally kept executable by
-- authenticated users: RLS policies across all tables invoke them directly
-- and the admin server functions call has_role via RPC. Both are STABLE,
-- have a fixed search_path, and contain internal scoping (has_role only
-- answers for the caller's own user id unless the caller is an admin).
-- Re-grant explicitly so the intent is documented and survives default
-- privilege changes.
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
revoke execute on function public.is_super_admin() from public, anon;
grant execute on function public.is_super_admin() to authenticated;