# Schéma complet AcreMap — SQL à exécuter manuellement

Script idempotent : peut être rejoué sans risque. À coller dans le SQL Editor Supabase (projet `ckkjqpsoavrikgiuuktf`).

## 1. Types, extensions, utilitaires

```sql
create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('admin','agent','viewer');
exception when duplicate_object then null; end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
```

## 2. Rôles et profils

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  username text,
  phone text,
  must_change_password boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = _user_id and ur.role = _role and p.disabled = false
  )
$$;
```

## 3. Hiérarchie territoriale et parcelles

```sql
create table if not exists public.sps (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  district text not null,
  region text not null,
  departement text not null,
  notes text,
  created_by uuid references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists sps_code_uniq on public.sps (lower(code));

create table if not exists public.domaines (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text not null,
  sp_id uuid not null references public.sps(id) on delete cascade,
  description text,
  notes text,
  created_by uuid references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists domaines_code_uniq on public.domaines (sp_id, lower(code));

create table if not exists public.parcelles (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  name text,
  domaine_id uuid not null references public.domaines(id) on delete cascade,
  owner_name text not null default '',
  owner_phone text,
  convention_date timestamptz,
  convention_status text not null default 'none',
  declared_area numeric,
  notes text,
  owner_photo text,
  group_photo text,
  parcelle_photo text,
  created_by uuid references auth.users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.parcelles add column if not exists name text;
alter table public.parcelles add column if not exists archived_at timestamptz;
create unique index if not exists parcelles_code_uniq on public.parcelles (domaine_id, lower(code));
```

## 4. Relevés, plans de morcellement, lots

```sql
create table if not exists public.measurements (
  id uuid primary key default gen_random_uuid(),
  parcelle_id uuid references public.parcelles(id) on delete set null,
  status text not null default 'draft',
  points jsonb not null default '[]'::jsonb,
  trace jsonb not null default '[]'::jsonb,
  area_m2 numeric not null default 0,
  perimeter_m numeric not null default 0,
  unit text not null default 'm2',
  device_profile jsonb,
  qa jsonb,
  notes text,
  validated_by uuid references auth.users(id),
  validated_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.morcellement_plans (
  id uuid primary key default gen_random_uuid(),
  parcelle_id uuid not null references public.parcelles(id) on delete cascade,
  measurement_id uuid references public.measurements(id) on delete set null,
  reference text,
  config jsonb not null default '{}'::jsonb,
  score jsonb not null default '{}'::jsonb,
  target_m2 numeric not null default 0,
  total_m2 numeric not null default 0,
  conforme boolean not null default false,
  status text not null default 'draft',
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lots (
  id uuid primary key default gen_random_uuid(),
  parcelle_id uuid not null references public.parcelles(id) on delete cascade,
  measurement_id uuid references public.measurements(id) on delete set null,
  plan_id uuid references public.morcellement_plans(id) on delete cascade,
  code text not null,
  part text not null default 'ac',        -- 'ac' (AgriCapital) | 'prop' (propriétaire)
  kind text not null default 'lot',       -- 'lot' | 'reserve' | 'collecte'
  label text,
  polygon jsonb not null default '[]'::jsonb,
  bornes jsonb,
  area_m2 numeric not null default 0,
  target_area_m2 numeric,
  is_reserve boolean not null default false,
  assignee_name text,
  assignee_contact text,
  assignee_account text,
  assigned_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lots_plan_idx on public.lots (plan_id);
create unique index if not exists lots_plan_code_uniq on public.lots (plan_id, code) where plan_id is not null;
```

## 5. Imports, photos, affectations

```sql
create table if not exists public.imports (
  id uuid primary key default gen_random_uuid(),
  parcelle_id uuid references public.parcelles(id) on delete set null,
  file_name text not null,
  file_type text not null,
  storage_path text,
  size_bytes bigint,
  status text not null default 'queued',
  error text,
  parsed jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parcelle_photos (
  id uuid primary key default gen_random_uuid(),
  parcelle_id uuid not null references public.parcelles(id) on delete cascade,
  kind text not null,
  storage_path text not null,
  caption text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.parcelle_assignments (
  id uuid primary key default gen_random_uuid(),
  parcelle_id uuid not null references public.parcelles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_label text not null default 'agent',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parcelle_id, user_id)
);
```

## 6. Droits, RLS et déclencheurs (toutes les tables métier)

```sql
do $$
declare t text;
begin
  foreach t in array array['sps','domaines','parcelles','measurements',
                           'morcellement_plans','lots','imports',
                           'parcelle_photos','parcelle_assignments']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('alter table public.%I enable row level security', t);

    execute format($p$drop policy if exists "%1$s_read" on public.%1$I$p$, t);
    execute format($p$create policy "%1$s_read" on public.%1$I for select to authenticated using (true)$p$, t);

    execute format($p$drop policy if exists "%1$s_write" on public.%1$I$p$, t);
    execute format($p$create policy "%1$s_write" on public.%1$I for insert to authenticated
      with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent'))$p$, t);

    execute format($p$drop policy if exists "%1$s_update" on public.%1$I$p$, t);
    execute format($p$create policy "%1$s_update" on public.%1$I for update to authenticated
      using (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent'))
      with check (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'agent'))$p$, t);

    execute format($p$drop policy if exists "%1$s_delete" on public.%1$I$p$, t);
    execute format($p$create policy "%1$s_delete" on public.%1$I for delete to authenticated
      using (public.has_role(auth.uid(),'admin'))$p$, t);

    execute format('drop trigger if exists set_updated_at_%1$s on public.%1$I', t);
    execute format('create trigger set_updated_at_%1$s before update on public.%1$I
      for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
```

## 7. Stockage (buckets `imports` et `photos`, privés)

Les buckets existent déjà. Politiques d'objets :

```sql
do $$
declare b text;
begin
  foreach b in array array['imports','photos'] loop
    execute format($p$drop policy if exists "%1$s_read" on storage.objects$p$, b);
    execute format($p$create policy "%1$s_read" on storage.objects for select to authenticated
      using (bucket_id = %1$L)$p$, b);
    execute format($p$drop policy if exists "%1$s_insert" on storage.objects$p$, b);
    execute format($p$create policy "%1$s_insert" on storage.objects for insert to authenticated
      with check (bucket_id = %1$L)$p$, b);
    execute format($p$drop policy if exists "%1$s_update" on storage.objects$p$, b);
    execute format($p$create policy "%1$s_update" on storage.objects for update to authenticated
      using (bucket_id = %1$L)$p$, b);
    execute format($p$drop policy if exists "%1$s_delete" on storage.objects$p$, b);
    execute format($p$create policy "%1$s_delete" on storage.objects for delete to authenticated
      using (bucket_id = %1$L and public.has_role(auth.uid(),'admin'))$p$, b);
  end loop;
end $$;
```

## 8. Après exécution

Aucune action supplémentaire dans l'application : la synchronisation (`syncAll`, `syncNow`, `syncRemoved`) pousse et récupère automatiquement `sps`, `domaines`, `parcelles`, `measurements`, `morcellement_plans`, `lots` et les imports dès le retour du réseau.
