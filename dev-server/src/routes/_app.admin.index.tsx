import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, PlayCircle, Activity, AlertTriangle, DollarSign, Cpu, Clock } from "lucide-react";
import { getPlatformOverview } from "@/lib/admin.functions";
import { Skeleton } from "@/components/Skeleton";

export const Route = createFileRoute("/_app/admin/")({
  component: AdminOverview,
});

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function AdminOverview() {
  const fn = useServerFn(getPlatformOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const t = data.totals;
  const stats = [
    { label: "Agencies", value: t.agencies, icon: Building2, sub: `${t.activeAgencies} active · ${t.suspendedAgencies} suspended` },
    { label: "Clients", value: t.clients, icon: Users },
    { label: "Total audits", value: fmt(t.audits), icon: PlayCircle },
    { label: "Audits (24h)", value: t.audits24h, icon: Activity, sub: `${t.failed24h} failed` },
    { label: "Queue depth", value: t.queueDepth, icon: Clock },
    { label: "Tokens (30d)", value: fmt(t.tokens30), icon: Cpu },
    { label: "Cost (30d)", value: "$" + t.cost30.toFixed(2), icon: DollarSign },
    { label: "Failures (24h)", value: t.failed24h, icon: AlertTriangle, alert: t.failed24h > 0 },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Platform Overview</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">Global health and signals across every agency.</p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`vt-card p-4 ${s.alert ? "border-red-500/40" : ""}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-[color:var(--muted)]">{s.label}</span>
                <Icon className={`h-4 w-4 ${s.alert ? "text-red-400" : "text-[color:var(--accent)]"}`} />
              </div>
              <div className="mt-2 text-2xl font-semibold">{s.value}</div>
              {s.sub && <div className="mt-1 text-xs text-[color:var(--muted)]">{s.sub}</div>}
            </div>
          );
        })}
      </div>

      <section className="vt-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Recent audits</h2>
          <Link to="/admin/logs" className="text-sm text-[color:var(--accent)] hover:underline">View logs →</Link>
        </div>
        {data.recentAudits.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">No audits yet.</p>
        ) : (
          <ul className="divide-y divide-[color:var(--border)]">
            {data.recentAudits.map((a: any) => (
              <li key={a.id} className="py-3 flex items-center justify-between gap-4 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-mono text-xs text-[color:var(--light)]/80">{a.page_url}</div>
                  <div className="text-xs text-[color:var(--muted)]">
                    {a.agencies?.name ?? "—"} · {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {a.score != null && <span className="font-mono text-sm">{a.score}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.status === "completed" ? "bg-green-500/15 text-green-300" :
                    a.status === "failed" ? "bg-red-500/15 text-red-300" :
                    "bg-yellow-500/15 text-yellow-300"
                  }`}>{a.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
