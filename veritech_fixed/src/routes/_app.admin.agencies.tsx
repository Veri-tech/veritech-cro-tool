import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Building2, Pause, Play, Settings2, X } from "lucide-react";
import { listAgencies, setAgencyStatus, updateAgencyLimits } from "@/lib/admin.functions";
import { Skeleton } from "@/components/Skeleton";

export const Route = createFileRoute("/_app/admin/agencies")({
  component: AdminAgencies,
});

function AdminAgencies() {
  const fn = useServerFn(listAgencies);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-agencies"],
    queryFn: () => fn(),
  });
  const [editing, setEditing] = useState<any | null>(null);

  if (isLoading || !data) {
    return <div className="max-w-6xl mx-auto space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Agencies</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">{data.agencies.length} agencies on the platform.</p>
      </header>

      <div className="vt-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
            <tr className="border-b border-[color:var(--border)]">
              <th className="text-left px-4 py-3">Agency</th>
              <th className="text-left px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Clients</th>
              <th className="text-right px-4 py-3">Audits</th>
              <th className="text-right px-4 py-3">Tokens (30d)</th>
              <th className="text-right px-4 py-3">Cost (30d)</th>
              <th className="text-right px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.agencies.map((a: any) => (
              <tr key={a.id} className="border-b border-[color:var(--border)] last:border-0">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-[color:var(--accent)]" />
                    <div>
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-[color:var(--muted)]">{a.contact_email ?? "—"}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.status === "active" ? "bg-green-500/15 text-green-300" :
                    a.status === "suspended" ? "bg-yellow-500/15 text-yellow-300" :
                    "bg-red-500/15 text-red-300"
                  }`}>{a.status}</span>
                  {a.suspended_reason && <div className="text-xs text-[color:var(--muted)] mt-1">{a.suspended_reason}</div>}
                </td>
                <td className="px-4 py-3 text-right font-mono">{a.clients}</td>
                <td className="px-4 py-3 text-right font-mono">{a.audits}</td>
                <td className="px-4 py-3 text-right font-mono">{(a.tokens30 / 1000).toFixed(0)}k</td>
                <td className="px-4 py-3 text-right font-mono">${a.cost30.toFixed(2)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-1">
                    <button
                      onClick={() => setEditing(a)}
                      className="vt-btn-secondary py-1 px-2 text-xs"
                      title="Edit limits"
                    >
                      <Settings2 className="h-3 w-3" />
                    </button>
                    {a.status === "active" ? (
                      <button
                        onClick={async () => {
                          const reason = prompt("Reason for suspension (optional):") ?? undefined;
                          if (!confirm(`Suspend ${a.name}?`)) return;
                          await setAgencyStatus({ data: { agencyId: a.id, status: "suspended", reason } });
                          qc.invalidateQueries({ queryKey: ["admin-agencies"] });
                        }}
                        className="vt-btn-secondary py-1 px-2 text-xs text-yellow-300"
                        title="Suspend"
                      >
                        <Pause className="h-3 w-3" />
                      </button>
                    ) : (
                      <button
                        onClick={async () => {
                          await setAgencyStatus({ data: { agencyId: a.id, status: "active" } });
                          qc.invalidateQueries({ queryKey: ["admin-agencies"] });
                        }}
                        className="vt-btn-secondary py-1 px-2 text-xs text-green-300"
                        title="Reactivate"
                      >
                        <Play className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <LimitsDialog
          agency={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["admin-agencies"] });
          }}
        />
      )}
    </div>
  );
}

function LimitsDialog({ agency, onClose, onSaved }: { agency: any; onClose: () => void; onSaved: () => void }) {
  const [daily, setDaily] = useState<number>(agency.daily_audit_limit ?? 10);
  const [budget, setBudget] = useState<number>(agency.monthly_token_budget ?? 2_000_000);
  const [saving, setSaving] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="vt-card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{agency.name} · limits</h3>
          <button onClick={onClose} className="text-[color:var(--muted)]"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-[color:var(--muted)]">Daily audit limit</label>
            <input type="number" value={daily} onChange={(e) => setDaily(parseInt(e.target.value || "0"))} className="vt-input mt-1" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-[color:var(--muted)]">Monthly token budget</label>
            <input type="number" value={budget} onChange={(e) => setBudget(parseInt(e.target.value || "0"))} className="vt-input mt-1" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="vt-btn-secondary">Cancel</button>
          <button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await updateAgencyLimits({ data: { agencyId: agency.id, daily_audit_limit: daily, monthly_token_budget: budget } });
                onSaved();
              } finally { setSaving(false); }
            }}
            className="vt-btn-primary"
          >{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>
  );
}
