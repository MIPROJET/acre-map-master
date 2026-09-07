-- 1. Colonnes d'archivage (archivage doux, restauration possible)
alter table public.sps add column if not exists archived_at timestamp with time zone;
alter table public.domaines add column if not exists archived_at timestamp with time zone;
alter table public.parcelles add column if not exists archived_at timestamp with time zone;

-- 2. Index anti-doublon sur les codes métier
-- (aucun doublon existant : vérifié avant exécution)
create unique index if not exists sps_code_key on public.sps (code);
create unique index if not exists domaines_code_key on public.domaines (code);
create unique index if not exists parcelles_code_key on public.parcelles (code);
create unique index if not exists lots_parcelle_code_key on public.lots (parcelle_id, code);

-- 3. Index de performance pour les jointures fréquentes
create index if not exists domaines_sp_id_idx on public.domaines (sp_id);
create index if not exists parcelles_domaine_id_idx on public.parcelles (domaine_id);
create index if not exists measurements_parcelle_id_idx on public.measurements (parcelle_id);