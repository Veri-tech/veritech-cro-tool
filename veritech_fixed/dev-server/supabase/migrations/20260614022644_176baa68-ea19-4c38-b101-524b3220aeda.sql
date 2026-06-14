-- Super admin should not be scoped to a specific agency.
-- agency_id = NULL ensures super_admin RLS policies
-- (which use is_super_admin()) apply correctly and the
-- user is never filtered by get_user_agency_id().
UPDATE public.profiles
SET agency_id = NULL
WHERE id = 'b66ab240-a63b-43e2-897c-bd3f09bd8a1d'
  AND role = 'super_admin';