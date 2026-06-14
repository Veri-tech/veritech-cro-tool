// Redirect legacy /portal/integrations → /portal/connect (path renamed in Phase 3).
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/portal/integrations")({
  beforeLoad: () => { throw redirect({ to: "/portal/connect" }); },
});
