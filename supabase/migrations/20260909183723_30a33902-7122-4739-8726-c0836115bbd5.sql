DROP POLICY IF EXISTS sps_read ON public.sps;
DROP POLICY IF EXISTS domaines_read ON public.domaines;
DROP POLICY IF EXISTS parcelles_read ON public.parcelles;
DROP POLICY IF EXISTS measurements_read ON public.measurements;
DROP POLICY IF EXISTS lots_read ON public.lots;
DROP POLICY IF EXISTS imports_read ON public.imports;
DROP POLICY IF EXISTS morcellement_plans_read ON public.morcellement_plans;
DROP POLICY IF EXISTS parcelle_photos_read ON public.parcelle_photos;
DROP POLICY IF EXISTS parcelle_assignments_read ON public.parcelle_assignments;

DROP POLICY IF EXISTS imports_read ON storage.objects;
DROP POLICY IF EXISTS imports_insert ON storage.objects;
DROP POLICY IF EXISTS imports_update ON storage.objects;
DROP POLICY IF EXISTS photos_read ON storage.objects;
DROP POLICY IF EXISTS photos_insert ON storage.objects;
DROP POLICY IF EXISTS photos_update ON storage.objects;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;