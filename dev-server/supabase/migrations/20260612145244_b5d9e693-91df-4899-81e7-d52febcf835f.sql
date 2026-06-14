
ALTER TABLE public.client_integrations
  ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'manual'
    CHECK (auth_method IN ('oauth','manual')),
  ADD COLUMN IF NOT EXISTS manual_credentials text;

ALTER TABLE public.client_integrations
  DROP CONSTRAINT IF EXISTS client_integrations_provider_check;
ALTER TABLE public.client_integrations
  ADD CONSTRAINT client_integrations_provider_check
  CHECK (provider IN ('google','gsc','semrush','dataforseo'));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS setup_complete boolean NOT NULL DEFAULT false;

DROP VIEW IF EXISTS public.client_integrations_safe;
CREATE VIEW public.client_integrations_safe AS
SELECT
  id, client_id, agency_id, provider, account_email,
  auth_method, status, last_error,
  ga4_property_id, ga4_properties_list,
  gsc_site_url, gsc_sites_list,
  semrush_account_id, semrush_plan,
  semrush_has_traffic_api, semrush_has_keyword_api,
  scopes, connected_at, last_synced_at, token_expiry,
  (access_token IS NOT NULL OR manual_credentials IS NOT NULL) AS has_credentials
FROM public.client_integrations;

ALTER VIEW public.client_integrations_safe SET (security_invoker = true);
GRANT SELECT ON public.client_integrations_safe TO authenticated;
GRANT SELECT ON public.client_integrations_safe TO service_role;
