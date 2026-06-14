
-- 1. Profiles: prevent self-promotion via role / agency_id change
DROP POLICY IF EXISTS "profiles update own" ON public.profiles;
CREATE POLICY "profiles update own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role IS NOT DISTINCT FROM (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND agency_id IS NOT DISTINCT FROM (SELECT p.agency_id FROM public.profiles p WHERE p.id = auth.uid())
  );

-- 2. client_invitations: stop the wide-open anon SELECT.
-- Token-based lookup now happens server-side via service role, so revoke the policy entirely.
DROP POLICY IF EXISTS "anon read invites by token" ON public.client_invitations;
REVOKE SELECT ON public.client_invitations FROM anon;

-- 3. client_integrations: remove client portal access to the raw row (tokens/credentials).
-- Clients keep access via the client_integrations_safe view (no secrets).
DROP POLICY IF EXISTS "agency or client read base" ON public.client_integrations;
CREATE POLICY "agency or super_admin read base"
  ON public.client_integrations FOR SELECT
  TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (
      get_user_role(auth.uid()) = 'agency_admin'
      AND agency_id = get_user_agency_id(auth.uid())
    )
  );

-- 4. audit_queue: enforce agency_id on insert
DROP POLICY IF EXISTS "own queue" ON public.audit_queue;
CREATE POLICY "own queue"
  ON public.audit_queue FOR ALL
  TO authenticated
  USING ((user_id = auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (
    user_id = auth.uid()
    AND (agency_id IS NULL OR agency_id = get_user_agency_id(auth.uid()))
  );

-- 5. Revoke EXECUTE on internal security-definer helpers from anon.
-- These are only meant to be called from RLS policies, which run as the table owner.
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_agency_id(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_agency_id(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;
