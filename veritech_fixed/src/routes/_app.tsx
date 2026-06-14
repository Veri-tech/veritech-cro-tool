import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession, homePathForRole } from "@/lib/auth";

// Pathless layout: enforces auth + global redirects (cancelled agency).
export const Route = createFileRoute("/_app")({
  ssr: false,
  component: AppGate,
});

function AppGate() {
  const { data, isLoading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!data?.user) {
      const redirect = typeof window !== "undefined" ? window.location.pathname : "/";
      navigate({ to: "/login", search: { redirect }, replace: true });
      return;
    }
    if (data.agency?.status === "cancelled") {
      navigate({ to: "/account-closed", replace: true });
    }
  }, [isLoading, data, navigate]);

  if (isLoading || !data?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--navy)]">
        <div className="w-64"><div className="vt-progress-bar rounded-full" /></div>
      </div>
    );
  }
  // Role mismatch handled in nested portal layouts.
  void homePathForRole;
  return <Outlet />;
}
