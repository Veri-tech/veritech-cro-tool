
-- ============ CORE TABLES FIRST (no policies yet) ============
CREATE TABLE public.agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  owner_id UUID REFERENCES auth.users(id),
  logo_url TEXT,
  primary_color TEXT DEFAULT '#4F8CFF',
  daily_audit_limit INTEGER DEFAULT 10,
  monthly_token_budget INTEGER DEFAULT 2000000,
  status TEXT CHECK (status IN ('active','suspended','cancelled')) DEFAULT 'active',
  suspended_reason TEXT,
  suspended_at TIMESTAMPTZ,
  contact_email TEXT,
  contact_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id),
  full_name TEXT,
  role TEXT CHECK (role IN ('super_admin','agency_admin','client')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ HELPER FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.get_user_role(_uid UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = _uid
$$;

CREATE OR REPLACE FUNCTION public.get_user_agency_id(_uid UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT agency_id FROM public.profiles WHERE id = _uid
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_uid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = _uid AND role = 'super_admin')
$$;

-- ============ GRANTS + POLICIES: agencies ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agencies TO authenticated;
GRANT ALL ON public.agencies TO service_role;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin all agencies" ON public.agencies FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "agency_admin own agency" ON public.agencies FOR SELECT TO authenticated
  USING (id = public.get_user_agency_id(auth.uid()));
CREATE POLICY "agency_admin update own" ON public.agencies FOR UPDATE TO authenticated
  USING (id = public.get_user_agency_id(auth.uid()) AND public.get_user_role(auth.uid()) = 'agency_admin');
CREATE POLICY "anyone insert agency on signup" ON public.agencies FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- ============ GRANTS + POLICIES: profiles ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_super_admin(auth.uid())
    OR (public.get_user_role(auth.uid()) = 'agency_admin'
        AND agency_id = public.get_user_agency_id(auth.uid())));
CREATE POLICY "profiles update own" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());
CREATE POLICY "profiles insert own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  contact_name TEXT,
  contact_email TEXT,
  monthly_traffic INTEGER,
  avg_order_value INTEGER,
  portal_user_id UUID REFERENCES auth.users(id),
  notes TEXT,
  archived BOOLEAN DEFAULT false,
  archived_at TIMESTAMPTZ,
  note_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin all clients" ON public.clients FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "agency_admin own clients" ON public.clients FOR ALL TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()) AND public.get_user_role(auth.uid()) = 'agency_admin')
  WITH CHECK (agency_id = public.get_user_agency_id(auth.uid()) AND public.get_user_role(auth.uid()) = 'agency_admin');
CREATE POLICY "client own client row" ON public.clients FOR SELECT TO authenticated
  USING (portal_user_id = auth.uid());

-- ============ AUDITS ============
CREATE TABLE public.audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  run_by UUID REFERENCES auth.users(id),
  initiated_by TEXT CHECK (initiated_by IN ('agency','client')),
  page_url TEXT NOT NULL,
  page_label TEXT,
  traffic_at_run INTEGER,
  aov_at_run INTEGER,
  score INTEGER,
  rating TEXT,
  output TEXT,
  parsed_data JSONB,
  friction_count INTEGER,
  critical_count INTEGER,
  revenue_low BIGINT,
  revenue_high BIGINT,
  pdf_url TEXT,
  status TEXT CHECK (status IN ('running','completed','failed','retrying')) DEFAULT 'running',
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audits TO authenticated;
GRANT ALL ON public.audits TO service_role;
ALTER TABLE public.audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin all audits" ON public.audits FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "agency_admin own audits" ON public.audits FOR ALL TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()) AND public.get_user_role(auth.uid()) = 'agency_admin')
  WITH CHECK (agency_id = public.get_user_agency_id(auth.uid()) AND public.get_user_role(auth.uid()) = 'agency_admin');
CREATE POLICY "client own audits" ON public.audits FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE portal_user_id = auth.uid()));

-- ============ COMPETITORS ============
CREATE TABLE public.competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  domain TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (agency_id, client_id, domain)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitors TO authenticated;
GRANT ALL ON public.competitors TO service_role;
ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin all comps" ON public.competitors FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "agency_admin own comps" ON public.competitors FOR ALL TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()))
  WITH CHECK (agency_id = public.get_user_agency_id(auth.uid()));
CREATE POLICY "client own comps" ON public.competitors FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE portal_user_id = auth.uid()));

-- ============ COMPETITOR AUDITS ============
CREATE TABLE public.competitor_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) NOT NULL,
  client_id UUID REFERENCES public.clients(id) NOT NULL,
  competitor_id UUID REFERENCES public.competitors(id) ON DELETE CASCADE,
  audit_id UUID REFERENCES public.audits(id),
  market_share_job_id UUID,
  page_url TEXT NOT NULL,
  score INTEGER,
  rating TEXT,
  output TEXT,
  traffic_est BIGINT,
  data_source TEXT CHECK (data_source IN ('semrush','dataforseo','ai_estimate')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitor_audits TO authenticated;
GRANT ALL ON public.competitor_audits TO service_role;
ALTER TABLE public.competitor_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin all ca" ON public.competitor_audits FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "agency_admin own ca" ON public.competitor_audits FOR ALL TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()))
  WITH CHECK (agency_id = public.get_user_agency_id(auth.uid()));
CREATE POLICY "client own ca" ON public.competitor_audits FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE portal_user_id = auth.uid()));

-- ============ CLIENT INVITATIONS ============
CREATE TABLE public.client_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id),
  client_id UUID REFERENCES public.clients(id),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  accepted BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ DEFAULT (NOW() + interval '7 days'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_invitations TO authenticated;
GRANT SELECT, UPDATE ON public.client_invitations TO anon;
GRANT ALL ON public.client_invitations TO service_role;
ALTER TABLE public.client_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agency_admin own invites" ON public.client_invitations FOR ALL TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()))
  WITH CHECK (agency_id = public.get_user_agency_id(auth.uid()));
CREATE POLICY "anon read invites by token" ON public.client_invitations FOR SELECT TO anon USING (true);

-- ============ AUDIT REQUESTS ============
CREATE TABLE public.audit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) NOT NULL,
  client_id UUID REFERENCES public.clients(id) NOT NULL,
  requested_by UUID REFERENCES auth.users(id),
  page_url TEXT NOT NULL,
  page_label TEXT,
  status TEXT CHECK (status IN ('pending','running','completed','failed')) DEFAULT 'pending',
  audit_id UUID REFERENCES public.audits(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_requests TO authenticated;
GRANT ALL ON public.audit_requests TO service_role;
ALTER TABLE public.audit_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin all req" ON public.audit_requests FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "agency_admin own req" ON public.audit_requests FOR ALL TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()))
  WITH CHECK (agency_id = public.get_user_agency_id(auth.uid()));
CREATE POLICY "client own req" ON public.audit_requests FOR ALL TO authenticated
  USING (requested_by = auth.uid())
  WITH CHECK (requested_by = auth.uid());

-- ============ AUDIT QUEUE ============
CREATE TABLE public.audit_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id),
  user_id UUID REFERENCES auth.users(id),
  audit_id UUID REFERENCES public.audits(id),
  status TEXT CHECK (status IN ('running','completed','failed')) DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_queue TO authenticated;
GRANT ALL ON public.audit_queue TO service_role;
ALTER TABLE public.audit_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own queue" ON public.audit_queue FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid());

-- ============ MARKET SHARE JOBS ============
CREATE TABLE public.market_share_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) NOT NULL,
  client_id UUID REFERENCES public.clients(id) NOT NULL,
  audit_id UUID REFERENCES public.audits(id),
  status TEXT CHECK (status IN ('pending','running','partial','completed','failed')) DEFAULT 'pending',
  steps_total INTEGER DEFAULT 0,
  steps_completed INTEGER DEFAULT 0,
  current_step_label TEXT,
  can_resume BOOLEAN DEFAULT false,
  resume_from_step INTEGER DEFAULT 0,
  synthesis_output TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.market_share_jobs TO authenticated;
GRANT ALL ON public.market_share_jobs TO service_role;
ALTER TABLE public.market_share_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin all ms" ON public.market_share_jobs FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "agency_admin own ms" ON public.market_share_jobs FOR ALL TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()))
  WITH CHECK (agency_id = public.get_user_agency_id(auth.uid()));
CREATE POLICY "client own ms" ON public.market_share_jobs FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE portal_user_id = auth.uid()));

-- ============ API USAGE ============
CREATE TABLE public.api_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id),
  audit_id UUID REFERENCES public.audits(id),
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,
  cost_usd NUMERIC(10,6),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT ON public.api_usage_log TO authenticated;
GRANT ALL ON public.api_usage_log TO service_role;
ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin all usage" ON public.api_usage_log FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "agency_admin own usage" ON public.api_usage_log FOR SELECT TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid()));

-- ============ CLIENT INTEGRATIONS ============
CREATE TABLE public.client_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id),
  provider TEXT CHECK (provider IN ('google','semrush')),
  account_email TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  ga4_property_id TEXT,
  ga4_properties_list JSONB,
  gsc_site_url TEXT,
  gsc_sites_list JSONB,
  semrush_account_id TEXT,
  semrush_plan TEXT,
  semrush_has_traffic_api BOOLEAN DEFAULT false,
  semrush_has_keyword_api BOOLEAN DEFAULT false,
  scopes TEXT[],
  status TEXT CHECK (status IN ('active','expired','requires_reauth','insufficient_permissions')) DEFAULT 'active',
  last_error TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  UNIQUE (client_id, provider)
);
GRANT ALL ON public.client_integrations TO service_role;
ALTER TABLE public.client_integrations ENABLE ROW LEVEL SECURITY;
-- SELECT policy needed so security_invoker view works for authenticated users
GRANT SELECT ON public.client_integrations TO authenticated;
CREATE POLICY "agency or client read base" ON public.client_integrations FOR SELECT TO authenticated
  USING (agency_id = public.get_user_agency_id(auth.uid())
    OR client_id IN (SELECT id FROM public.clients WHERE portal_user_id = auth.uid())
    OR public.is_super_admin(auth.uid()));

CREATE VIEW public.client_integrations_safe
WITH (security_invoker = true) AS
SELECT id, client_id, agency_id, provider, account_email, token_expiry,
  ga4_property_id, ga4_properties_list, gsc_site_url, gsc_sites_list,
  semrush_account_id, semrush_plan, semrush_has_traffic_api, semrush_has_keyword_api,
  scopes, status, last_error, connected_at, last_synced_at
FROM public.client_integrations;
GRANT SELECT ON public.client_integrations_safe TO authenticated;
GRANT ALL ON public.client_integrations_safe TO service_role;

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  agency_id UUID REFERENCES public.agencies(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ SYSTEM CONFIG ============
CREATE TABLE public.system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
GRANT ALL ON public.system_config TO service_role;
GRANT SELECT ON public.system_config TO authenticated;
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super_admin write config" ON public.system_config FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "all authed read config" ON public.system_config FOR SELECT TO authenticated USING (true);

INSERT INTO public.system_config (key, value) VALUES
  ('default_daily_audit_limit','10'),
  ('default_monthly_token_budget','2000000'),
  ('support_email','support@veritechdigital.co.za'),
  ('privacy_email','privacy@veritechdigital.co.za');

-- ============ STORAGE POLICIES ============
-- audit-reports: agency_admin read/write own folder; client read own client_id folder
CREATE POLICY "audit-reports agency rw" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'audit-reports'
    AND (storage.foldername(name))[1] = public.get_user_agency_id(auth.uid())::text)
  WITH CHECK (bucket_id = 'audit-reports'
    AND (storage.foldername(name))[1] = public.get_user_agency_id(auth.uid())::text);

CREATE POLICY "audit-reports client read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'audit-reports'
    AND (storage.foldername(name))[2] IN (
      SELECT id::text FROM public.clients WHERE portal_user_id = auth.uid()
    ));

CREATE POLICY "audit-reports super_admin" ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'audit-reports' AND public.is_super_admin(auth.uid()))
  WITH CHECK (bucket_id = 'audit-reports' AND public.is_super_admin(auth.uid()));

-- agency-assets: agency_admin write own folder; all authed read
CREATE POLICY "agency-assets agency write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'agency-assets'
    AND (storage.foldername(name))[1] = public.get_user_agency_id(auth.uid())::text);
CREATE POLICY "agency-assets agency update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'agency-assets'
    AND (storage.foldername(name))[1] = public.get_user_agency_id(auth.uid())::text);
CREATE POLICY "agency-assets agency delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'agency-assets'
    AND (storage.foldername(name))[1] = public.get_user_agency_id(auth.uid())::text);
CREATE POLICY "agency-assets all read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'agency-assets');
