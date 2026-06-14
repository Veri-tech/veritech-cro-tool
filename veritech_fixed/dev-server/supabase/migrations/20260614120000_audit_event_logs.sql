-- Dedicated event log for super admin visibility.
-- Tracks audit lifecycle, invitation, OAuth, and agency events.
CREATE TABLE IF NOT EXISTS public.audit_event_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast super admin queries
CREATE INDEX IF NOT EXISTS idx_event_logs_agency
  ON public.audit_event_logs(agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_type
  ON public.audit_event_logs(event_type, created_at DESC);

ALTER TABLE public.audit_event_logs ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.audit_event_logs TO service_role;
GRANT SELECT ON public.audit_event_logs TO authenticated;

-- Only super admins can read the event log
CREATE POLICY "super_admin_all_event_logs"
  ON public.audit_event_logs
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
