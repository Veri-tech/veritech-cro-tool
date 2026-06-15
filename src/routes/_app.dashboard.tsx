import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, PlayCircle, BarChart3, Plug, Settings, Menu, X, LogOut, ShieldCheck,
} from "lucide-react";
import { useSession, homePathForRole, signOutAndRedirect } from "@/lib/auth";
import { VeritechLogo } from "@/components/Logo";
import { AuditRunningBanner } from "@/components/AuditRunningBanner";
import { NotificationBell } from "@/components/NotificationBell";
import { getAgencySettings } from "@/lib/settings.functions";

export const Route = createFileRoute("/_app/dashboard")({
  ssr: false,
  component: DashboardLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/clients", label: "Clients", icon: Users },
  { to: "/dashboard/audit", label: "Run Audit", icon: PlayCircle },
  { to: "/dashboard/market-share", label: "Market Share", icon: BarChart3 },
  { to: "/dashboard/integrations", label: "Integrations", icon: Plug },
  { to: "/dashboard/settings", label: "Settings", icon: Settings },
];

function DashboardLayout() {
  const { data } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const settingsFn = useServerFn(getAgencySettings);
  const { data: settings } = useQuery({
    queryKey: ["agency-settings"],
    queryFn: () => settingsFn(),
    enabled: !!data?.user,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!data) return;
    const role = data.profile?.role;
    // Allow super_admin to also operate the agency dashboard
    if (role && role !== "agency_admin" && role !== "super_admin") {
      navigate({ to: homePathForRole(role), replace: true });
      return;
    }
    if (data.agency?.status === "suspended" && pathname !== "/dashboard/suspended") {
      navigate({ to: "/dashboard/suspended", replace: true });
    }
  }, [data, pathname, navigate]);

  const role = data?.profile?.role;
  if (role && role !== "agency_admin" && role !== "super_admin") return null;

  const logoUrl = settings?.agency?.logo_url ?? null;
  const agencyName = settings?.agency?.name ?? "Veritech";

  return (
    <div className="min-h-screen bg-[color:var(--navy)] text-[color:var(--light)]">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-[color:var(--border)] bg-[color:var(--navy2)] transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center justify-between px-5 border-b border-[color:var(--border)]">
          {logoUrl ? (
            <div className="flex items-center gap-2 min-w-0">
              <img src={logoUrl} alt={agencyName} className="h-8 w-8 rounded object-contain" />
              <span className="text-sm font-semibold truncate">{agencyName}</span>
            </div>
          ) : (
            <VeritechLogo size={32} />
          )}
          <button className="lg:hidden text-[color:var(--muted)]" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
                    : "text-[color:var(--light)]/80 hover:bg-[color:var(--slate)]"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <UsageBar
          agencyLimit={settings?.agency?.daily_audit_limit ?? data?.agency?.daily_audit_limit ?? 10}
          tokenBudget={settings?.agency?.monthly_token_budget ?? data?.agency?.monthly_token_budget ?? 2_000_000}
          auditsToday={settings?.usage?.auditsToday ?? 0}
          tokensUsed={settings?.usage?.tokensUsed ?? 0}
        />
      </aside>

      {/* Header */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--navy)]/85 backdrop-blur px-4 lg:px-6">
          <button onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-[color:var(--muted)]" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="lg:hidden"><VeritechLogo size={28} /></div>
          <div className="flex items-center gap-3 ml-auto">
            {role === "super_admin" && (
              <Link to="/admin" className="vt-btn-secondary hidden sm:flex items-center gap-1.5 text-xs">
                <ShieldCheck className="h-3.5 w-3.5" />
                Admin
              </Link>
            )}
            <NotificationBell />
            <span className="hidden sm:inline text-sm text-[color:var(--muted)]">
              {data?.profile?.full_name ?? data?.user?.email}
            </span>
            <button onClick={() => signOutAndRedirect()} className="vt-btn-secondary" aria-label="Logout">
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>
        <AuditRunningBanner />
        <main className="p-4 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}

function UsageBar({
  agencyLimit, tokenBudget, auditsToday, tokensUsed,
}: { agencyLimit: number; tokenBudget: number; auditsToday: number; tokensUsed: number }) {
  const auditPct = Math.min(100, (auditsToday / Math.max(1, agencyLimit)) * 100);
  const tokenPct = Math.min(100, (tokensUsed / Math.max(1, tokenBudget)) * 100);
  return (
    <div className="absolute bottom-0 inset-x-0 border-t border-[color:var(--border)] p-4 text-xs text-[color:var(--muted)] font-mono space-y-2">
      <div>
        <div className="flex justify-between"><span>Audits today</span><span>{auditsToday}/{agencyLimit}</span></div>
        <div className="h-1 mt-1 w-full rounded bg-[color:var(--slate)] overflow-hidden">
          <div className="h-full bg-[color:var(--accent)]" style={{ width: `${auditPct}%` }} />
        </div>
      </div>
      <div>
        <div className="flex justify-between">
          <span>Tokens</span>
          <span>{(tokensUsed / 1_000).toFixed(0)}k/{(tokenBudget / 1_000_000).toFixed(1)}M</span>
        </div>
        <div className="h-1 mt-1 w-full rounded bg-[color:var(--slate)] overflow-hidden">
          <div className="h-full bg-[color:var(--teal)]" style={{ width: `${tokenPct}%` }} />
        </div>
      </div>
    </div>
  );
}
