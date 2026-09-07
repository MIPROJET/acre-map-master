-- 1. Schéma privé, non exposé via la Data API (seul "public" est exposé)
create schema if not exists private;

-- 2. Déplacer les helpers SECURITY DEFINER hors du schéma public exposé.
-- Les OID de fonctions sont préservés : toutes les policies RLS existantes
-- continuent de fonctionner sans être recréées.
alter function public.has_role(uuid, public.app_role) set schema private;
alter function public.is_super_admin() set schema private;

-- 3. Droits d'exécution : nécessaires pour l'évaluation des policies RLS,
-- mais plus appelables via l'API puisque le schéma n'est pas exposé.
grant usage on schema private to authenticated;
grant usage on schema private to service_role;
revoke execute on function private.has_role(uuid, public.app_role) from public, anon;
revoke execute on function private.is_super_admin() from public, anon;
grant execute on function private.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function private.is_super_admin() to authenticated, service_role;

-- 4. Les triggers résolvent les noms de fonctions à l'exécution :
-- les faire pointer vers private.*
create or replace function public.guard_user_roles_changes()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- contextes serveur/interne (service_role, triggers) : pas de JWT
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  if private.has_role(auth.uid(), 'admin') or private.is_super_admin() then
    return coalesce(new, old);
  end if;
  raise exception 'Seul un administrateur peut modifier les rôles';
end;
$function$;

create or replace function public.protect_profile_lifecycle_flags()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- service_role / internal contexts (no JWT) keep full control
  if auth.uid() is null then
    return new;
  end if;
  if private.has_role(auth.uid(), 'admin') then
    return new;
  end if;
  new.disabled := old.disabled;
  new.must_change_password := old.must_change_password;
  new.id := old.id;
  return new;
end;
$function$;