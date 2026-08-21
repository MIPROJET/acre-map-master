# SQL manuel — AcreMap (à exécuter dans Supabase SQL Editor)

Ce script est idempotent : il peut être relancé sans risque.
Il ajoute la colonne `name` sur `parcelles`, complète les tables manquantes,
les index, les grants, les RLS et les politiques de stockage.

## 1. Colonne `name` sur les parcelles

```sql
alter table public.parcelles add column if not exists name text;
comment on column public.parcelles.name is 'Nom libre de la parcelle (saisi à l''étape Parcelle)';
```

## 2. Colonnes complémentaires sur les imports

```sql
alter table public.imports add column if not exists parsed jsonb;
alter table public.imports add column if not exists storage_path text;
alter table public.imports add column if not exists error text;
```

## 3. Index utiles

```sql
create unique index if not exists sps_code_key        on public.sps (code);
create unique index if not exists domaines_code_key   on public.domaines (code);
create unique index if not exists parcelles_code_key  on public.parcelles (code);
create index if not exists domaines_sp_idx           on public.domaines (sp_id);
create index if not exists parcelles_domaine_idx     on public.parcelles (domaine_id);
create index if not exists measurements_parcelle_idx on public.measurements (parcelle_id);
create index if not exists lots_parcelle_idx         on public.lots (parcelle_id);
create index if not exists imports_parcelle_idx      on public.imports (parcelle_id);
create index if not exists imports_created_idx       on public.imports (created_at desc);
```

## 4. Table des photos liées (propriétaire, famille, parcelle)

```sql
create table if not exists public.parcelle_photos (
  id uuid primary key default gen_random_uuid(),
  parcelle_id uuid not null references public.parcelles(id) on delete cascade,
  kind text not null default 'parcelle',   -- 'owner' | 'group' | 'parcelle'
  storage_path text not null,
  caption text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.parcelle_photos to authenticated;
grant all on public.parcelle_photos to service_role;

alter table public.parcelle_photos enable row level security;

drop policy if exists parcelle_photos_select on public.parcelle_photos;
create policy parcelle_photos_select on public.parcelle_photos for select to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent') or has_role(auth.uid(),'viewer'));

drop policy if exists parcelle_photos_write on public.parcelle_photos;
create policy parcelle_photos_write on public.parcelle_photos for insert to authenticated
  with check (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent'));

drop policy if exists parcelle_photos_update on public.parcelle_photos;
create policy parcelle_photos_update on public.parcelle_photos for update to authenticated
  using (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent'))
  with check (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent'));

drop policy if exists parcelle_photos_delete on public.parcelle_photos;
create policy parcelle_photos_delete on public.parcelle_photos for delete to authenticated
  using (has_role(auth.uid(),'admin'));

drop trigger if exists set_updated_at_parcelle_photos on public.parcelle_photos;
create trigger set_updated_at_parcelle_photos before update on public.parcelle_photos
  for each row execute function public.set_updated_at();
```

## 5. Affectation d'une parcelle à un utilisateur (suivi terrain)

```sql
create table if not exists public.parcelle_assignments (
  id uuid primary key default gen_random_uuid(),
  parcelle_id uuid not null references public.parcelles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_label text not null default 'agent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parcelle_id, user_id)
);

grant select, insert, update, delete on public.parcelle_assignments to authenticated;
grant all on public.parcelle_assignments to service_role;

alter table public.parcelle_assignments enable row level security;

drop policy if exists pa_select on public.parcelle_assignments;
create policy pa_select on public.parcelle_assignments for select to authenticated
  using (user_id = auth.uid() or has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent'));

drop policy if exists pa_write on public.parcelle_assignments;
create policy pa_write on public.parcelle_assignments for all to authenticated
  using (has_role(auth.uid(),'admin'))
  with check (has_role(auth.uid(),'admin'));

drop trigger if exists set_updated_at_parcelle_assignments on public.parcelle_assignments;
create trigger set_updated_at_parcelle_assignments before update on public.parcelle_assignments
  for each row execute function public.set_updated_at();
```

## 6. Politiques de stockage (buckets `imports` et `photos`)

Les buckets existent déjà et sont privés. Les politiques ci-dessous autorisent
les utilisateurs authentifiés disposant d'un rôle à lire/écrire.

```sql
drop policy if exists storage_imports_read on storage.objects;
create policy storage_imports_read on storage.objects for select to authenticated
  using (bucket_id = 'imports'
     and (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent') or has_role(auth.uid(),'viewer')));

drop policy if exists storage_imports_write on storage.objects;
create policy storage_imports_write on storage.objects for insert to authenticated
  with check (bucket_id = 'imports' and (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent')));

drop policy if exists storage_imports_update on storage.objects;
create policy storage_imports_update on storage.objects for update to authenticated
  using (bucket_id = 'imports' and (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent')))
  with check (bucket_id = 'imports' and (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent')));

drop policy if exists storage_imports_delete on storage.objects;
create policy storage_imports_delete on storage.objects for delete to authenticated
  using (bucket_id = 'imports' and has_role(auth.uid(),'admin'));

drop policy if exists storage_photos_read on storage.objects;
create policy storage_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'photos'
     and (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent') or has_role(auth.uid(),'viewer')));

drop policy if exists storage_photos_write on storage.objects;
create policy storage_photos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent')));

drop policy if exists storage_photos_update on storage.objects;
create policy storage_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent')))
  with check (bucket_id = 'photos' and (has_role(auth.uid(),'admin') or has_role(auth.uid(),'agent')));

drop policy if exists storage_photos_delete on storage.objects;
create policy storage_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and has_role(auth.uid(),'admin'));
```

## 7. Rappel manuel (hors SQL)

Dans le dashboard Supabase : **Authentication → Providers → Email** →
activer « Prevent use of leaked passwords » (protection contre les mots de passe compromis).

## Après exécution

Aucune action supplémentaire dans l'application : le code lit et écrit déjà
`parcelles.name`, `imports.storage_path` et le bucket `imports` (bouton
« Traiter » de la page Traitement & morcellement).
