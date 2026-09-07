-- ============ ROLES ============
create type public.app_role as enum ('admin','agent','viewer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  username text unique,
  phone text,
  must_change_password boolean not null default false,
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
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
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "profiles_select_auth" on public.profiles for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (auth.uid() = id or public.has_role(auth.uid(),'admin'))
  with check (auth.uid() = id or public.has_role(auth.uid(),'admin'));
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check (auth.uid() = id or public.has_role(auth.uid(),'admin'));
create policy "profiles_delete_admin" on public.profiles for delete to authenticated
  using (public.has_role(auth.uid(),'admin'));

create policy "user_roles_select_auth" on public.user_roles for select to authenticated using (true);
create policy "user_roles_admin_write" on public.user_roles for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- ============ TIMESTAMP TRIGGER ============
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

-- ============ NEW USER TRIGGER ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, username, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'phone'
  ) on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id,'agent') on conflict do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ HIERARCHIE ============
create table public.sps (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  district text not null default '',
  region text not null default '',
  departement text not null default '',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sps to authenticated;
grant all on public.sps to service_role;
alter table public.sps enable row level security;

create table public.domaines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  sp_id uuid not null references public.sps(id) on delete cascade,
  description text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.domaines to authenticated;
grant all on public.domaines to service_role;
alter table public.domaines enable row level security;

create table public.parcelles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  domaine_id uuid not null references public.domaines(id) on delete cascade,
  owner_name text not null default '',
  owner_phone text,
  convention_date timestamptz,
  convention_status text not null default 'EN_COURS',
  declared_area numeric,
  notes text,
  owner_photo text,
  group_photo text,
  parcelle_photo text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.parcelles to authenticated;
grant all on public.parcelles to service_role;
alter table public.parcelles enable row level security;

create table public.measurements (
  id uuid primary key default gen_random_uuid(),
  parcelle_id uuid references public.parcelles(id) on delete cascade,
  status text not null default 'draft',
  points jsonb not null default '[]'::jsonb,
  trace jsonb not null default '[]'::jsonb,
  area_m2 numeric not null default 0,
  perimeter_m numeric not null default 0,
  unit text not null default 'ha',
  device_profile jsonb,
  qa jsonb,
  notes text,
  validated_by uuid references auth.users(id) on delete set null,
  validated_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.measurements to authenticated;
grant all on public.measurements to service_role;
alter table public.measurements enable row level security;

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  parcelle_id uuid not null references public.parcelles(id) on delete cascade,
  measurement_id uuid references public.measurements(id) on delete set null,
  code text not null,
  polygon jsonb not null default '[]'::jsonb,
  bornes jsonb,
  area_m2 numeric not null default 0,
  is_reserve boolean not null default false,
  assignee_name text,
  assigned_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parcelle_id, code)
);
grant select, insert, update, delete on public.lots to authenticated;
grant all on public.lots to service_role;
alter table public.lots enable row level security;

create table public.imports (
  id uuid primary key default gen_random_uuid(),
  parcelle_id uuid references public.parcelles(id) on delete cascade,
  file_name text not null,
  file_type text not null,
  storage_path text,
  size_bytes bigint,
  status text not null default 'pending',
  error text,
  parsed jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.imports to authenticated;
grant all on public.imports to service_role;
alter table public.imports enable row level security;

-- Policies terrain : lecture pour tout connecté, écriture agent/admin, suppression admin
do $$
declare t text;
begin
  foreach t in array array['sps','domaines','parcelles','measurements','lots','imports'] loop
    execute format('create policy "%1$s_select" on public.%1$s for select to authenticated using (true)', t);
    execute format('create policy "%1$s_insert" on public.%1$s for insert to authenticated with check (public.has_role(auth.uid(),''admin'') or public.has_role(auth.uid(),''agent''))', t);
    execute format('create policy "%1$s_update" on public.%1$s for update to authenticated using (public.has_role(auth.uid(),''admin'') or public.has_role(auth.uid(),''agent'')) with check (public.has_role(auth.uid(),''admin'') or public.has_role(auth.uid(),''agent''))', t);
    execute format('create policy "%1$s_delete" on public.%1$s for delete to authenticated using (public.has_role(auth.uid(),''admin''))', t);
    execute format('create trigger set_updated_at_%1$s before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

create trigger set_updated_at_profiles before update on public.profiles for each row execute function public.set_updated_at();

create index idx_domaines_sp on public.domaines(sp_id);
create index idx_parcelles_domaine on public.parcelles(domaine_id);
create index idx_measurements_parcelle on public.measurements(parcelle_id);
create index idx_lots_parcelle on public.lots(parcelle_id);
create index idx_imports_parcelle on public.imports(parcelle_id);
