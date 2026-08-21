
-- =====================================================================
-- LOT 4 — AcreMap schema, roles & RLS
-- =====================================================================

-- 1) Enum des rôles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','agent','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.measurement_status AS ENUM ('draft','submitted','validated','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Fonction utilitaire updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 3) profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  username TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_insert_self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "user_roles_select_self_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5) Trigger d'inscription : profil + rôle agent par défaut
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, username)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'agent') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6) Macro: created_by pattern shared by hierarchy tables
-- sps
CREATE TABLE IF NOT EXISTS public.sps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  district TEXT,
  region TEXT,
  departement TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sps TO authenticated;
GRANT ALL ON public.sps TO service_role;
ALTER TABLE public.sps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sps_read_auth"    ON public.sps FOR SELECT TO authenticated USING (true);
CREATE POLICY "sps_insert_auth"  ON public.sps FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "sps_update_owner" ON public.sps FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "sps_delete_admin" ON public.sps FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_sps_updated BEFORE UPDATE ON public.sps FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- domaines
CREATE TABLE IF NOT EXISTS public.domaines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sp_id UUID NOT NULL REFERENCES public.sps(id) ON DELETE CASCADE,
  description TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_domaines_sp ON public.domaines(sp_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.domaines TO authenticated;
GRANT ALL ON public.domaines TO service_role;
ALTER TABLE public.domaines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dom_read_auth"    ON public.domaines FOR SELECT TO authenticated USING (true);
CREATE POLICY "dom_insert_auth"  ON public.domaines FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "dom_update_owner" ON public.domaines FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "dom_delete_admin" ON public.domaines FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_dom_updated BEFORE UPDATE ON public.domaines FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- parcelles
CREATE TABLE IF NOT EXISTS public.parcelles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  owner_name TEXT NOT NULL,
  owner_phone TEXT,
  domaine_id UUID NOT NULL REFERENCES public.domaines(id) ON DELETE CASCADE,
  convention_date TIMESTAMPTZ,
  declared_area NUMERIC,
  convention_status TEXT,
  owner_photo TEXT,
  group_photo TEXT,
  parcelle_photo TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parcelles_dom ON public.parcelles(domaine_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parcelles TO authenticated;
GRANT ALL ON public.parcelles TO service_role;
ALTER TABLE public.parcelles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "parc_read_auth"    ON public.parcelles FOR SELECT TO authenticated USING (true);
CREATE POLICY "parc_insert_auth"  ON public.parcelles FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "parc_update_owner" ON public.parcelles FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "parc_delete_admin" ON public.parcelles FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_parc_updated BEFORE UPDATE ON public.parcelles FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- measurements
CREATE TABLE IF NOT EXISTS public.measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcelle_id UUID REFERENCES public.parcelles(id) ON DELETE CASCADE,
  status public.measurement_status NOT NULL DEFAULT 'draft',
  area_m2 NUMERIC NOT NULL DEFAULT 0,
  perimeter_m NUMERIC NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'ha',
  points JSONB NOT NULL DEFAULT '[]'::jsonb,
  trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  device_profile JSONB,
  qa JSONB,
  notes TEXT,
  validated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_meas_parc   ON public.measurements(parcelle_id);
CREATE INDEX IF NOT EXISTS idx_meas_status ON public.measurements(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.measurements TO authenticated;
GRANT ALL ON public.measurements TO service_role;
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meas_read_auth"    ON public.measurements FOR SELECT TO authenticated USING (true);
CREATE POLICY "meas_insert_auth"  ON public.measurements FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "meas_update_owner_or_admin" ON public.measurements FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "meas_delete_admin" ON public.measurements FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_meas_updated BEFORE UPDATE ON public.measurements FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Garde-fou : seul un admin peut faire passer une mesure à 'validated'
CREATE OR REPLACE FUNCTION public.tg_meas_validate_guard()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'validated' AND (OLD.status IS DISTINCT FROM 'validated') THEN
    IF NOT public.has_role(auth.uid(),'admin') THEN
      RAISE EXCEPTION 'Seul un administrateur peut valider une mesure';
    END IF;
    NEW.validated_by := auth.uid();
    NEW.validated_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_meas_validate_guard ON public.measurements;
CREATE TRIGGER trg_meas_validate_guard BEFORE UPDATE ON public.measurements
  FOR EACH ROW EXECUTE FUNCTION public.tg_meas_validate_guard();

-- lots
CREATE TABLE IF NOT EXISTS public.lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parcelle_id UUID NOT NULL REFERENCES public.parcelles(id) ON DELETE CASCADE,
  measurement_id UUID NOT NULL REFERENCES public.measurements(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  polygon JSONB NOT NULL,
  bornes JSONB NOT NULL DEFAULT '[]'::jsonb,
  area_m2 NUMERIC NOT NULL,
  is_reserve BOOLEAN NOT NULL DEFAULT false,
  assignee_name TEXT,
  assigned_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lots_meas ON public.lots(measurement_id);
CREATE INDEX IF NOT EXISTS idx_lots_parc ON public.lots(parcelle_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lots TO authenticated;
GRANT ALL ON public.lots TO service_role;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lots_read_auth"    ON public.lots FOR SELECT TO authenticated USING (true);
CREATE POLICY "lots_insert_auth"  ON public.lots FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "lots_update_owner" ON public.lots FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "lots_delete_admin" ON public.lots FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_lots_updated BEFORE UPDATE ON public.lots FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- voies
CREATE TABLE IF NOT EXISTS public.voies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_id UUID NOT NULL REFERENCES public.measurements(id) ON DELETE CASCADE,
  axis TEXT NOT NULL,
  width_m NUMERIC NOT NULL,
  polygon JSONB NOT NULL,
  area_m2 NUMERIC NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voies_meas ON public.voies(measurement_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voies TO authenticated;
GRANT ALL ON public.voies TO service_role;
ALTER TABLE public.voies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voies_read_auth"    ON public.voies FOR SELECT TO authenticated USING (true);
CREATE POLICY "voies_insert_auth"  ON public.voies FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "voies_update_owner" ON public.voies FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "voies_delete_admin" ON public.voies FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- partages
CREATE TABLE IF NOT EXISTS public.partages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_id UUID NOT NULL REFERENCES public.measurements(id) ON DELETE CASCADE,
  axis TEXT NOT NULL,
  pct_ac NUMERIC NOT NULL,
  part_ac JSONB NOT NULL,
  part_proprio JSONB NOT NULL,
  area_ac_m2 NUMERIC NOT NULL,
  area_proprio_m2 NUMERIC NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partages_meas ON public.partages(measurement_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partages TO authenticated;
GRANT ALL ON public.partages TO service_role;
ALTER TABLE public.partages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "part_read_auth"    ON public.partages FOR SELECT TO authenticated USING (true);
CREATE POLICY "part_insert_auth"  ON public.partages FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "part_update_owner" ON public.partages FOR UPDATE TO authenticated USING (created_by = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "part_delete_admin" ON public.partages FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));
