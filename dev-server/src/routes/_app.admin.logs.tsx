import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { getSystemLogs } from "@/lib/admin.functions";
import { Skeleton } from "@/components/Skeleton";

export const Route = createFileRoute("/_app/admin/logs")({
  component: AdminLogs,
});

type Tab = "recent" | "failed" | "queue";

function AdminLogs() {
  const fn = useServerFn(getSystemLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["admin-logs"],
    queryFn: () => fn(),
    refetchInterval: 15_000,
  });
  const [tab, setTab] = useState<Tab>("recent");

  if (isLoading || !data) {
    return <div className="max-w-6xl mx-auto space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>;
  }

  const tabs: { id: Tab; label: string; count: number; icon: any }[] = [
    { id: "recent", label: "Recent audits", count: data.recentAudits.length, icon: CheckCircle },
    { id: "failed", label: "Failed", count: data.failedAudits.length, icon: AlertTriangle },
    { id: "queue", label: "Queue", count: data.queue.length, icon: Clock },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">System Logs</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">Audit runs, failures, and queue activity across the platform.</p>
      </header>

      <div className="flex gap-1 border-b border-[color:var(--border)]">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm border-b-2 -mb-px transition-colors ${
                tab === t.id ? "border-[color:var(--accent)] text-[color:var(--accent)]"
                             : "border-transparent text-[color:var(--muted)] hover:text-[color:var(--light)]"
              }`}>
              <Icon className="h-4 w-4 inline mr-1.5" />{t.label} <span className="text-xs opacity-60">({t.count})</span>
            </button>
          );
        })}
      </div>

      {tab === "recent" && (
        <div className="vt-card divide-y divide-[color:var(--border)]">
          {data.recentAudits.map((a: any) => (
            <div key={a.id} className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
              <div className="min-w-0">
                <div className="font-mono text-xs truncate">{a.page_url}</div>
                <div className="text-xs text-[color:var(--muted)]">
                  {a.agencies?.name} · {a.clients?.name} · {new Date(a.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {a.score != null && <span className="font-mono">{a.score}</span>}
                {a.retry_count > 0 && <span className="text-xs text-yellow-300">retry×{a.retry_count}</span>}
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  a.status === "completed" ? "bg-green-500/15 text-green-300" :
                  a.status === "failed" ? "bg-red-500/15 text-red-300" :
                  "bg-yellow-500/15 text-yellow-300"
                }`}>{a.status}</span>
              </div>
            </div>
          ))}
          {data.recentAudits.length === 0 && <div className="px-4 py-8 text-center text-sm text-[color:var(--muted)]">No recent audits.</div>}
        </div>
      )}

      {tab === "failed" && (
        <div className="vt-card divide-y divide-[color:var(--border)]">
          {data.failedAudits.map((a: any) => (
            <div key={a.id} className="px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="font-mono text-xs truncate">{a.page_url}</div>
                <span className="text-xs text-[color:var(--muted)] shrink-0">{a.agencies?.name} · retry×{a.retry_count}</span>
              </div>
              {a.error_message && (
                <div className="mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded p-2 font-mono">
                  {a.error_message}
                </div>
              )}
              <div className="text-xs text-[color:var(--muted)] mt-1">{new Date(a.created_at).toLocaleString()}</div>
            </div>
          ))}
          {data.failedAudits.length === 0 && <div className="px-4 py-8 text-center text-sm text-[color:var(--muted)]">No failed audits in recent history.</div>}
        </div>
      )}

      {tab === "queue" && (
        <div className="vt-card divide-y divide-[color:var(--border)]">
          {data.queue.map((q: any) => {
            const duration = q.completed_at
              ? Math.round((new Date(q.completed_at).getTime() - new Date(q.started_at).getTime()) / 1000)
              : Math.round((Date.now() - new Date(q.started_at).getTime()) / 1000);
            return (
              <div key={q.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="font-mono text-xs">{q.audit_id?.slice(0, 8) ?? "—"}</div>
                  <div className="text-xs text-[color:var(--muted)] truncate">{q.agencies?.name} · started {new Date(q.started_at).toLocaleTimeString()}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono">{duration}s</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    q.status === "completed" ? "bg-green-500/15 text-green-300" :
                    q.status === "failed" ? "bg-red-500/15 text-red-300" :
                    "bg-yellow-500/15 text-yellow-300"
                  }`}>{q.status}</span>
                </div>
              </div>
            );
          })}
          {data.queue.length === 0 && <div className="px-4 py-8 text-center text-sm text-[color:var(--muted)]">Queue is empty.</div>}
        </div>
      )}
    </div>
  );
}
