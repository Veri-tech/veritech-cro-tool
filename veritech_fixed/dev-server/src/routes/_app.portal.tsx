import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Menu, X, LogOut } from "lucide-react";
import { useSession, homePathForRole, signOutAndRedirect } from "@/lib/auth";
import { VeritechLogo } from "@/components/Logo";
import { AuditRunningBanner } from "@/components/AuditRunningBanner";
import { NotificationBell } from "@/components/NotificationBell";
import { SetupWizard } from "@/components/SetupWizard";
import { getMySetupStatus } from "@/lib/integrations.functions";

export const Route = createFileRoute("/_app/portal")({
  ssr: false,
  component: PortalLayout,
});

type NavItem = { to: string; label: string; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/portal", label: "My Reports", exact: true },
  { to: "/portal/audit", label: "Run Audit" },
  { to: "/portal/history", label: "Score History" },
  { to: "/portal/connect", label: "Connect Tools" },
  { to: "/portal/account", label: "Account" },
];

function PortalLayout() {
  const { data } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const [wizardDismissed, setWizardDismissed] = useState(false);

  const setupFn = useServerFn(getMySetupStatus);
  const role = data?.profile?.role;
  const setupQuery = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => setupFn(),
    enabled: !!data && role === "client",
  });
  const showWizard =
    !wizardDismissed &&
    role === "client" &&
    setupQuery.data?.setupComplete === false &&
    !data?.client?.archived;

  useEffect(() => {
    if (!data) return;
    const r = data.profile?.role;
    if (r && r !== "client" && r !== "super_admin") {
      navigate({ to: homePathForRole(r), replace: true });
      return;
    }
    if (data.client?.archived && pathname !== "/portal/archived") {
      navigate({ to: "/portal/archived", replace: true });
    }
  }, [data, pathname, navigate]);

  if (role && role !== "client" && role !== "super_admin") return null;

  return (
    <div className="min-h-screen flex flex-col bg-[color:var(--navy)] text-[color:var(--light)]">
      <header className="sticky top-0 z-30 border-b border-[color:var(--border)] bg-[color:var(--navy2)]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-6">
            <Link to="/portal" aria-label="Portal home">
              {data?.agency?.logo_url
                ? <img src={data.agency.logo_url} alt={data.agency.name} className="h-8" />
                : <VeritechLogo size={30} />}
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {NAV.map((n) => {
                const active = n.exact ? pathname === n.to : pathname.startsWith(n.to);
                return (
                  <Link key={n.to} to={n.to}
                    className={`px-3 py-2 rounded-md text-sm ${
                      active ? "text-[color:var(--accent)] bg-[color:var(--accent)]/10"
                             : "text-[color:var(--light)]/80 hover:bg-[color:var(--slate)]"
                    }`}>
                    {n.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <button onClick={() => signOutAndRedirect()} className="hidden md:inline-flex vt-btn-secondary">
              <LogOut className="h-4 w-4" /> Logout
            </button>
            <button className="md:hidden text-[color:var(--muted)] p-2" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <AuditRunningBanner />

      {menuOpen && (
        <div className="fixed inset-0 z-50 bg-[color:var(--navy)] md:hidden">
          <div className="flex h-16 items-center justify-between px-4 border-b border-[color:var(--border)]">
            <VeritechLogo size={30} />
            <button onClick={() => setMenuOpen(false)} className="text-[color:var(--muted)] p-2"><X className="h-5 w-5" /></button>
          </div>
          <nav className="p-4 space-y-1">
            {NAV.map((n) => (
              <Link key={n.to} to={n.to} onClick={() => setMenuOpen(false)}
                className="block px-3 py-3 rounded-md text-base hover:bg-[color:var(--slate)]">
                {n.label}
              </Link>
            ))}
            <button onClick={() => signOutAndRedirect()}
              className="mt-4 block w-full text-left px-3 py-3 rounded-md text-base text-[color:var(--red)] hover:bg-[color:var(--slate)]">
              Logout
            </button>
          </nav>
        </div>
      )}

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 lg:px-6 py-8"><Outlet /></main>

      <footer className="border-t border-[color:var(--border)] py-6 px-4 text-center text-xs text-[color:var(--muted)]">
        Powered by Veritech Digital · veritechdigital.co.za ·{" "}
        <Link to="/privacy" className="vt-link">Privacy</Link> ·{" "}
        <Link to="/terms" className="vt-link">Terms</Link>
      </footer>

      {showWizard && <SetupWizard onClose={() => setWizardDismissed(true)} />}
    </div>
  );
}
