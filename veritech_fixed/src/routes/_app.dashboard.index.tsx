import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useMemo, useState } from "react";
import { Users, PlayCircle, FileText, TrendingUp, Plus } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { getDashboardSummary } from "@/lib/clients.functions";
import { Skeleton } from "@/components/Skeleton";
import { OnboardingDialog } from "@/components/OnboardingDialog";

export const Route = createFileRoute("/_app/dashboard/")({
  validateSearch: (s) => z.object({ onboarding: z.string().optional() }).parse(s),
  component: DashboardHome,
});

function DashboardHome() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [onboardOpen, setOnboardOpen] = useState(search.onboarding === "1");
  const fn = useServerFn(getDashboardSummary);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  const hasClients = data.clientCount > 0;
  const hasAudits = (data.recent ?? []).length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">An overview of your CRO activity.</p>
      </header>

      {!hasClients && <EmptyClientsState onOpenOnboarding={() => setOnboardOpen(true)} />}
      {hasClients && !hasAudits && <NoAuditsYetState />}
      {hasClients && hasAudits && <HasAuditsState data={data} />}

      <OnboardingDialog
        open={onboardOpen}
        onClose={() => {
          setOnboardOpen(false);
          navigate({ to: "/dashboard", replace: true, search: {} });
        }}
      />
    </div>
  );
}

function EmptyClientsState({ onOpenOnboarding }: { onOpenOnboarding: () => void }) {
  return (
    <div className="vt-card p-10 text-center space-y-4">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--accent)]/15 text-[color:var(--accent)] mx-auto">
        <Users className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-semibold">Welcome to Veritech CRO</h2>
      <p className="text-sm text-[color:var(--muted)] max-w-md mx-auto">
        Add your first client to start running AI-powered conversion audits and share reports back to them.
      </p>
      <div className="flex justify-center gap-3">
        <button onClick={onOpenOnboarding} className="vt-btn-primary">Start onboarding</button>
        <Link to="/dashboard/clients" className="vt-btn-secondary">Add client manually</Link>
      </div>
    </div>
  );
}

function NoAuditsYetState() {
  return (
    <div className="vt-card p-10 text-center space-y-4">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--accent)]/15 text-[color:var(--accent)] mx-auto">
        <PlayCircle className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-semibold">You're ready to run your first audit</h2>
      <p className="text-sm text-[color:var(--muted)] max-w-md mx-auto">
        Pick a key page (home, PDP, checkout, landing page) and Claude will return a full CRO report in under a minute.
      </p>
      <Link to="/dashboard/audit" className="vt-btn-primary inline-flex">
        <PlayCircle className="h-4 w-4 mr-1" /> Run first audit
      </Link>
    </div>
  );
}

function HasAuditsState({ data }: { data: Awaited<ReturnType<typeof getDashboardSummary>> }) {
  // Build score-over-time chart from the most-recent 10 audits.
  const chartData = useMemo(() => {
    return [...(data.recent ?? [])]
      .reverse()
      .map((a: any) => ({
        date: new Date(a.created_at).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }),
        score: a.score ?? 0,
        label: a.page_label,
      }));
  }, [data.recent]);

  return (
    <>
      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Kpi icon={Users} label="Active clients" value={data.clientCount} />
        <Kpi icon={FileText} label="Audits this month" value={data.auditsThisMonth} />
        <Kpi icon={TrendingUp} label="Audits last 24h" value={data.auditsToday} />
      </div>

      {/* Score trend */}
      <section className="vt-card p-6">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold truncate">Recent CRO scores</h3>
            <p className="text-xs text-[color:var(--muted)]">Last {chartData.length} completed audits</p>
          </div>
          <Link to="/dashboard/audit" className="vt-btn-primary shrink-0">
            <Plus className="h-4 w-4 mr-1" /> <span className="hidden sm:inline">Run audit</span><span className="sm:hidden">New</span>
          </Link>
        </header>
        {chartData.length === 0 ? (
          <p className="text-sm text-[color:var(--muted)]">No score data yet.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Line type="monotone" dataKey="score" stroke="#4F8CFF" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Recent audits list */}
      <section className="vt-card p-6">
        <h3 className="text-lg font-semibold mb-4">Recent audits</h3>
        <ul className="divide-y divide-[color:var(--border)]">
          {data.recent.map((a: any) => (
            <li key={a.id} className="flex items-center justify-between py-3">
              <div className="min-w-0">
                <Link to="/dashboard/audits/$id" params={{ id: a.id }} className="font-medium hover:text-[color:var(--accent)]">
                  {a.page_label || "Audit"}
                </Link>
                <p className="text-xs text-[color:var(--muted)] truncate">
                  {a.clients?.name} · {new Date(a.created_at).toLocaleString()}
                </p>
              </div>
              <ScoreBadge score={a.score ?? 0} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="vt-card p-5">
      <div className="flex items-center gap-3">
        <span className="rounded-md bg-[color:var(--accent)]/15 p-2 text-[color:var(--accent)]">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">{label}</div>
          <div className="text-2xl font-semibold font-mono">{value}</div>
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 81 ? "var(--green)" :
    score >= 66 ? "var(--teal)" :
    score >= 51 ? "var(--accent)" :
    score >= 30 ? "var(--amber)" : "var(--red)";
  return (
    <span
      className="rounded-full px-3 py-1 text-sm font-bold font-mono"
      style={{ background: `${color}20`, color }}
    >
      {score}
    </span>
  );
}
