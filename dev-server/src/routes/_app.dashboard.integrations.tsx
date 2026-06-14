import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertCircle, Plug, RotateCw, Trash2, AlertTriangle } from "lucide-react";
import {
  listAgencyIntegrations,
  adminTestIntegration,
  adminDisconnectIntegration,
} from "@/lib/integrations-admin.functions";

export const Route = createFileRoute("/_app/dashboard/integrations")({
  ssr: false,
  loader: ({ context }) => context.queryClient.ensureQueryData(integrationsQO()),
  component: IntegrationsPage,
});

const integrationsQO = () =>
  queryOptions({
    queryKey: ["agency-integrations"],
    queryFn: () => listAgencyIntegrations(),
  });

const PROVIDER_LABELS: Record<string, string> = {
  google: "GA4",
  gsc: "Search Console",
  semrush: "Semrush",
  dataforseo: "DataForSEO",
};
const PROVIDER_KEYS = ["google", "gsc", "semrush", "dataforseo"] as const;
type ProviderKey = typeof PROVIDER_KEYS[number];

function StatusIcon({ row }: { row: any }) {
  if (!row?.has_credentials) return <XCircle className="h-4 w-4 text-[color:var(--muted)]" />;
  if (row.status === "active") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (row.status === "requires_reauth" || row.last_error)
    return <AlertCircle className="h-4 w-4 text-amber-400" />;
  return <XCircle className="h-4 w-4 text-[color:var(--muted)]" />;
}

function IntegrationsPage() {
  const fn = useServerFn(listAgencyIntegrations);
  const { data } = useSuspenseQuery({
    ...integrationsQO(),
    queryFn: () => fn(),
  });

  const rows = data.rows;
  const ready = rows.filter((r) => r.ready).length;
  const partial = rows.filter((r) => !r.ready && r.connectedCount > 0).length;
  const none = rows.filter((r) => r.connectedCount === 0).length;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Per-client connection status across GA4, Search Console, Semrush, and DataForSEO.
            Audits won't run until each client has the required GA4 connection.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Audit-ready" value={ready} tone="emerald" />
        <Stat label="Partial setup" value={partial} tone="amber" />
        <Stat label="No integrations" value={none} tone="muted" />
      </div>

      <div className="vt-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-[color:var(--slate)]/40 text-[color:var(--muted)]">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">Readiness</th>
                {PROVIDER_KEYS.map((k) => (
                  <th key={k} className="text-left px-4 py-3 font-medium">{PROVIDER_LABELS[k]}</th>
                ))}
                <th className="text-right px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[color:var(--muted)]">No clients yet.</td></tr>
              )}
              {rows.map((c) => <ClientRow key={c.id} c={c} />)}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-[color:var(--muted)]">
        Credentials are stored encrypted and never displayed in the dashboard. Use Test to re-verify a saved key,
        or Disconnect to clear it — the client can re-paste from their portal.
      </p>
    </div>
  );
}

function ClientRow({ c }: { c: any }) {
  const qc = useQueryClient();
  const testFn = useServerFn(adminTestIntegration);
  const disconnectFn = useServerFn(adminDisconnectIntegration);
  const [busy, setBusy] = useState<string | null>(null);

  async function handleTest(provider: ProviderKey) {
    setBusy(`test:${provider}`);
    try {
      const r = await testFn({ data: { clientId: c.id, provider } });
      if (r.ok) toast.success(`${c.name} · ${PROVIDER_LABELS[provider]}: ${r.message}`);
      else toast.error(`${c.name} · ${PROVIDER_LABELS[provider]}: ${r.message}`);
      await qc.invalidateQueries({ queryKey: ["agency-integrations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect(provider: ProviderKey) {
    if (!confirm(`Disconnect ${PROVIDER_LABELS[provider]} for ${c.name}?`)) return;
    setBusy(`disc:${provider}`);
    try {
      await disconnectFn({ data: { clientId: c.id, provider } });
      toast.success(`${PROVIDER_LABELS[provider]} disconnected`);
      await qc.invalidateQueries({ queryKey: ["agency-integrations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <tr className="hover:bg-[color:var(--slate)]/20 align-top">
      <td className="px-4 py-3">
        <div className="font-medium">{c.name}</div>
        {c.domain && <div className="text-xs text-[color:var(--muted)]">{c.domain}</div>}
      </td>
      <td className="px-4 py-3">
        {c.ready ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Ready
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs text-amber-400" title={`Missing: ${c.missingRequired.map((p: string) => PROVIDER_LABELS[p]).join(", ")}`}>
            <AlertTriangle className="h-3.5 w-3.5" /> Needs {c.missingRequired.map((p: string) => PROVIDER_LABELS[p]).join(", ")}
          </span>
        )}
      </td>
      {PROVIDER_KEYS.map((p) => {
        const row = (c.providers as any)[p];
        const has = !!row?.has_credentials;
        return (
          <td key={p} className="px-4 py-3">
            <div className="flex items-center gap-2">
              <StatusIcon row={row} />
              <span className="text-xs text-[color:var(--muted)]">
                {has ? (row.status === "active" ? "Active" : (row.status ?? "")) : "—"}
              </span>
            </div>
            {row?.last_error && (
              <div className="text-[10px] text-amber-400/80 mt-1 max-w-[180px] truncate" title={row.last_error}>
                {row.last_error}
              </div>
            )}
            {row?.last_synced_at && (
              <div className="text-[10px] text-[color:var(--muted)] mt-1">
                tested {new Date(row.last_synced_at).toLocaleDateString()}
              </div>
            )}
            {has && (
              <div className="flex gap-1 mt-1.5">
                <button
                  onClick={() => handleTest(p)}
                  disabled={busy === `test:${p}`}
                  className="text-[10px] inline-flex items-center gap-0.5 text-[color:var(--accent)] hover:underline disabled:opacity-50"
                  title="Re-test connection"
                >
                  <RotateCw className="h-3 w-3" /> {busy === `test:${p}` ? "…" : "Test"}
                </button>
                <button
                  onClick={() => handleDisconnect(p)}
                  disabled={busy === `disc:${p}`}
                  className="text-[10px] inline-flex items-center gap-0.5 text-[color:var(--red)] hover:underline disabled:opacity-50"
                  title="Disconnect"
                >
                  <Trash2 className="h-3 w-3" /> {busy === `disc:${p}` ? "…" : "Remove"}
                </button>
              </div>
            )}
          </td>
        );
      })}
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <Link
          to="/dashboard/clients/$id"
          params={{ id: c.id }}
          className="vt-btn-secondary text-xs inline-flex items-center gap-1"
        >
          <Plug className="h-3 w-3" /> View client
        </Link>
      </td>
    </tr>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "muted" }) {
  const color =
    tone === "emerald" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : "text-[color:var(--muted)]";
  return (
    <div className="vt-card p-4">
      <div className="text-xs text-[color:var(--muted)] uppercase tracking-wide">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}
