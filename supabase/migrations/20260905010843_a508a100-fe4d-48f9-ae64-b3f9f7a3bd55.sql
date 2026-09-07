CREATE TABLE IF NOT EXISTS public.morcellement_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcelle_id uuid NOT NULL REFERENCES public.parcelles(id) ON DELETE CASCADE,
  measurement_id uuid REFERENCES public.measurements(id) ON DELETE SET NULL,
  reference text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  score jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_m2 numeric NOT NULL DEFAULT 0,
  total_m2 numeric NOT NULL DEFAULT 0,
  conforme boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.morcellement_plans TO authenticated;
GRANT ALL ON public.morcellement_plans TO service_role;

ALTER TABLE public.morcellement_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS morcellement_plans_select ON public.morcellement_plans;
CREATE POLICY morcellement_plans_select ON public.morcellement_plans
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'agent'::app_role) OR private.has_role(auth.uid(), 'viewer'::app_role));

DROP POLICY IF EXISTS morcellement_plans_insert ON public.morcellement_plans;
CREATE POLICY morcellement_plans_insert ON public.morcellement_plans
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'agent'::app_role));

DROP POLICY IF EXISTS morcellement_plans_update ON public.morcellement_plans;
CREATE POLICY morcellement_plans_update ON public.morcellement_plans
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'agent'::app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role) OR private.has_role(auth.uid(), 'agent'::app_role));

DROP POLICY IF EXISTS morcellement_plans_delete ON public.morcellement_plans;
CREATE POLICY morcellement_plans_delete ON public.morcellement_plans
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS set_morcellement_plans_updated_at ON public.morcellement_plans;
CREATE TRIGGER set_morcellement_plans_updated_at
  BEFORE UPDATE ON public.morcellement_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS morcellement_plans_parcelle_idx ON public.morcellement_plans (parcelle_id);

ALTER TABLE public.lots
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.morcellement_plans(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS part text NOT NULL DEFAULT 'proprietaire',
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'lot',
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS target_area_m2 numeric,
  ADD COLUMN IF NOT EXISTS assignee_contact text,
  ADD COLUMN IF NOT EXISTS assignee_account text;

CREATE INDEX IF NOT EXISTS lots_plan_idx ON public.lots (plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS lots_plan_code_unique ON public.lots (plan_id, code) WHERE plan_id IS NOT NULL;