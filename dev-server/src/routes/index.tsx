import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession, homePathForRole } from "@/lib/auth";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Veritech CRO Tool" }] }),
  component: Index,
});

function Index() {
  const { data, isLoading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;
    if (!data?.user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    navigate({ to: homePathForRole(data.profile?.role), replace: true });
  }, [isLoading, data, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--navy)]">
      <div className="w-64">
        <div className="vt-progress-bar rounded-full" />
      </div>
    </div>
  );
}
