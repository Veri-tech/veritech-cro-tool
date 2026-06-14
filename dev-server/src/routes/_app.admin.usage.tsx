import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { getUsageBreakdown } from "@/lib/admin.functions";
import { Skeleton } from "@/components/Skeleton";

export const Route = createFileRoute("/_app/admin/usage")({
  component: AdminUsage,
});

function AdminUsage() {
  const fn = useServerFn(getUsageBreakdown);
  const { data, isLoading } = useQuery({ queryKey: ["admin-usage"], queryFn: () => fn() });

  if (isLoading || !data) {
    return <div className="max-w-6xl mx-auto space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-72" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">API Usage</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">Token spend across every agency, last 30 days.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="vt-card p-4">
          <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">Tokens (30d)</div>
          <div className="mt-2 text-2xl font-semibold">{(data.total.tokens / 1_000_000).toFixed(2)}M</div>
        </div>
        <div className="vt-card p-4">
          <div className="text-xs uppercase tracking-wider text-[color:var(--muted)]">Cost (30d)</div>
          <div className="mt-2 text-2xl font-semibold">${data.total.cost.toFixed(2)}</div>
        </div>
      </div>

      <section className="vt-card p-6">
        <h2 className="text-lg font-semibold mb-4">Daily spend</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="rgba(255,255,255,0.4)" fontSize={11} tickFormatter={(d) => d.slice(5)} />
              <YAxis stroke="rgba(255,255,255,0.4)" fontSize={11} />
              <Tooltip contentStyle={{ background: "#0A1628", border: "1px solid rgba(255,255,255,0.1)" }} />
              <Line type="monotone" dataKey="tokens" stroke="#4F8CFF" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="vt-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
            <tr className="border-b border-[color:var(--border)]">
              <th className="text-left px-4 py-3">Agency</th>
              <th className="text-right px-4 py-3">Calls</th>
              <th className="text-right px-4 py-3">Tokens</th>
              <th className="text-right px-4 py-3">Cost</th>
              <th className="text-right px-4 py-3">% of budget</th>
            </tr>
          </thead>
          <tbody>
            {data.perAgency.map((a) => {
              const pct = a.budget > 0 ? (a.tokens / a.budget) * 100 : 0;
              return (
                <tr key={a.agency_id} className="border-b border-[color:var(--border)] last:border-0">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-right font-mono">{a.calls}</td>
                  <td className="px-4 py-3 text-right font-mono">{(a.tokens / 1000).toFixed(1)}k</td>
                  <td className="px-4 py-3 text-right font-mono">${a.cost.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="w-24 h-1.5 bg-[color:var(--slate)] rounded overflow-hidden">
                        <div className={`h-full ${pct >= 80 ? "bg-red-400" : pct >= 50 ? "bg-yellow-400" : "bg-[color:var(--accent)]"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <span className="font-mono text-xs w-10 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
