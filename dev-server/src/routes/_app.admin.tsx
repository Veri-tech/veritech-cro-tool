import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LayoutDashboard, Building2, Users, Activity, FileText, Settings, LogOut, Menu, X } from "lucide-react";
import { useSession, homePathForRole, signOutAndRedirect } from "@/lib/auth";
import { NotificationBell } from "@/components/NotificationBell";

export const Route = createFileRoute("/_app/admin")({
  ssr: false,
  component: AdminLayout,
});

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const NAV: NavItem[] = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/admin/agencies", label: "Agencies", icon: Building2 },
  { to: "/admin/clients", label: "All Clients", icon: Users },
  { to: "/admin/usage", label: "API Usage", icon: Activity },
  { to: "/admin/logs", label: "Logs", icon: FileText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
  { to: "/dashboard", label: "Agency Workspace", icon: Building2 },
];

function AdminLayout() {
  const { data } = useSession();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!data) return;
    if (data.profile?.role && data.profile.role !== "super_admin") {
      navigate({ to: homePathForRole(data.profile.role), replace: true });
    }
  }, [data, navigate]);

  if (data?.profile?.role && data.profile.role !== "super_admin") return null;

  return (
    <div className="min-h-screen bg-[color:var(--navy)] text-[color:var(--light)]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-[color:var(--border)] bg-[color:var(--navy2)] transition-transform lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="h-16 flex items-center justify-between px-5 border-b border-[color:var(--border)]">
          <div className="font-semibold tracking-tight">
            <span className="text-[color:var(--accent)] font-mono">Veritech</span>{" "}
            <span className="text-[color:var(--muted)] text-xs uppercase tracking-widest">Admin</span>
          </div>
          <button className="lg:hidden text-[color:var(--muted)]" onClick={() => setSidebarOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="px-3 py-4 space-y-1">
          {NAV.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? "bg-[color:var(--accent)]/10 text-[color:var(--accent)]"
                         : "text-[color:var(--light)]/80 hover:bg-[color:var(--slate)]"
                }`}>
                <Icon className="h-4 w-4" /><span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-[color:var(--border)] bg-[color:var(--navy)]/85 backdrop-blur px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-[color:var(--muted)]"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3 ml-auto">
            <NotificationBell />
            <button onClick={() => signOutAndRedirect()} className="vt-btn-secondary">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          </div>
        </header>
        <main className="p-4 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
