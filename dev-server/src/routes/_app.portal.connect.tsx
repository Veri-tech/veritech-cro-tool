import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Circle, Info, Plug, Trash2 } from "lucide-react";
import {
  listMyIntegrationsSafe,
  testIntegration,
  disconnectIntegration,
  getMySetupStatus,
  saveGa4Property,
  saveGscSite,
} from "@/lib/integrations.functions";
import { ManualCredsForm } from "@/components/SetupWizard";
import { Skeleton } from "@/components/Skeleton";
import { supabase } from "@/integrations/supabase/client";

type Provider = "google" | "gsc" | "semrush" | "dataforseo";

const PROVIDERS: { id: Provider; title: string; subtitle: string; oauthName: string; tag: "Required" | "Recommended" | "Optional" }[] = [
  { id: "google", title: "Google Analytics 4", subtitle: "Real traffic, conversions, revenue data per audit", oauthName: "Google", tag: "Required" },
  { id: "gsc", title: "Google Search Console", subtitle: "Real queries, clicks, CTR & position data", oauthName: "Google", tag: "Recommended" },
  { id: "semrush", title: "Semrush", subtitle: "Competitor traffic & keyword intelligence", oauthName: "Semrush", tag: "Optional" },
  { id: "dataforseo", title: "DataForSEO", subtitle: "Fallback for competitor traffic data", oauthName: "", tag: "Optional" },
];

const ConnectSearchSchema = z.object({
  success: z.enum(["google", "semrush"]).optional(),
  message: z.string().optional(),
});

export const Route = createFileRoute("/_app/portal/connect")({
  ssr: false,
  validateSearch: (s) => ConnectSearchSchema.parse(s),
  component: ConnectTools,
});

function ConnectTools() {
  const search = useSearch({ from: "/_app/portal/connect" });
  const qc = useQueryClient();
  const fn = useServerFn(listMyIntegrationsSafe);
  const statusFn = useServerFn(getMySetupStatus);
  const { data, isLoading } = useQuery({
    queryKey: ["portal-integrations-safe"],
    queryFn: () => fn(),
  });
  const { data: status } = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => statusFn(),
  });

  // Handle OAuth result toasts
  useEffect(() => {
    if (search.success === "google") {
      toast.success("Google account connected successfully");
      qc.invalidateQueries({ queryKey: ["portal-integrations-safe"] });
      qc.invalidateQueries({ queryKey: ["setup-status"] });
    } else if (search.success === "semrush") {
      toast.success("Semrush account connected successfully");
      qc.invalidateQueries({ queryKey: ["portal-integrations-safe"] });
      qc.invalidateQueries({ queryKey: ["setup-status"] });
    }
    if (search.message === "session_expired") {
      toast.info("Your session expired. Please log in and try again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.success, search.message]);

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const byProvider = new Map<string, any>();
  for (const r of data.integrations) {
    if (r.provider) byProvider.set(r.provider, r);
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">Connect tools</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Connect your data sources so audits use real data instead of estimates. Everything is encrypted at rest.
        </p>
      </header>

      {status && <SetupProgressOverview status={status} />}

      <div className="space-y-4">
        {PROVIDERS.map((p) => (
          <IntegrationCard key={p.id} meta={p} integration={byProvider.get(p.id)} />
        ))}
      </div>
    </div>
  );
}

function SetupProgressOverview({
  status,
}: {
  status: {
    connectedCount: number;
    totalProviders: number;
    ready: boolean;
    providers: Record<string, { active: boolean }>;
    missingRequired: string[];
  };
}) {
  const pct = Math.round((status.connectedCount / status.totalProviders) * 100);
  return (
    <section className="vt-card p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--muted)]">Setup progress</h2>
          <p className="text-sm mt-1">
            <strong>{status.connectedCount}</strong> of {status.totalProviders} data sources connected
            {status.ready
              ? <span className="ml-2 text-emerald-400">· ready for audits</span>
              : <span className="ml-2 text-amber-400">· GA4 still required</span>}
          </p>
        </div>
        <div className="text-2xl font-semibold">{pct}%</div>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full bg-[color:var(--accent)] transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PROVIDERS.map((p) => {
          const active = !!status.providers?.[p.id]?.active;
          return (
            <div key={p.id} className="flex items-center gap-2 text-xs">
              {active
                ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                : <Circle className="h-4 w-4 text-[color:var(--muted)] shrink-0" />}
              <span className={active ? "text-white" : "text-[color:var(--muted)]"}>{p.title}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

async function startOAuth(path: "/api/auth/google/start" | "/api/auth/semrush/start") {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    toast.error("You need to be signed in.");
    return;
  }
  window.location.href = `${path}?token=${encodeURIComponent(token)}`;
}

function IntegrationCard({
  meta,
  integration,
}: {
  meta: { id: Provider; title: string; subtitle: string; oauthName: string; tag: "Required" | "Recommended" | "Optional" };
  integration: any | undefined;
}) {
  const qc = useQueryClient();
  const testFn = useServerFn(testIntegration);
  const disconnectFn = useServerFn(disconnectIntegration);
  const [testing, setTesting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const connected = !!integration && integration.status === "active" && integration.has_credentials;
  const needsAttention = integration?.status && integration.status !== "active";
  const tagColor = meta.tag === "Required" ? "text-[color:var(--red)]" : meta.tag === "Recommended" ? "text-amber-400" : "text-[color:var(--muted)]";

  async function handleTest() {
    setTesting(true);
    try {
      const r = await testFn({ data: { provider: meta.id } });
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
      await qc.invalidateQueries({ queryKey: ["portal-integrations-safe"] });
      await qc.invalidateQueries({ queryKey: ["setup-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await disconnectFn({ data: { provider: meta.id } });
      toast.success(`${meta.title} disconnected`);
      setConfirmDisconnect(false);
      await qc.invalidateQueries({ queryKey: ["portal-integrations-safe"] });
      await qc.invalidateQueries({ queryKey: ["setup-status"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Disconnect failed");
    }
  }

  const isOAuthProvider = meta.id === "google" || meta.id === "gsc" || meta.id === "semrush";

  return (
    <section className="vt-card p-5 space-y-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{meta.title}</h2>
            <span className={`text-[10px] uppercase tracking-wide ${tagColor}`}>{meta.tag}</span>
          </div>
          <p className="text-xs text-[color:var(--muted)] mt-0.5">{meta.subtitle}</p>
        </div>
        <StatusPill connected={connected} needsAttention={!!needsAttention} />
      </header>

      {needsAttention && integration?.last_error && (
        <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
          {integration.last_error}
        </Banner>
      )}

      {connected && (
        <Banner tone="green" icon={<CheckCircle2 className="h-4 w-4" />}>
          Connected{integration?.account_email ? <> as <strong>{integration.account_email}</strong></> : null}
          {integration?.last_synced_at ? (
            <span className="text-[color:var(--muted)] ml-2">
              · last tested {new Date(integration.last_synced_at).toLocaleString()}
            </span>
          ) : null}
        </Banner>
      )}

      {/* Semrush limited-plan info */}
      {meta.id === "semrush" && connected && integration?.semrush_has_traffic_api === false && (
        <Banner tone="blue" icon={<Info className="h-4 w-4" />}>
          Connected as {integration.account_email}{integration.semrush_plan ? ` · ${integration.semrush_plan} plan` : ""}.
          Traffic data requires Guru plan or above. Competitor analysis uses AI estimates instead.
          Your CRO audit results are not affected.
        </Banner>
      )}

      {/* OAuth or manual */}
      {!connected && isOAuthProvider && (
        <button
          className="vt-btn-primary w-full justify-center"
          onClick={() => {
            if (meta.id === "semrush") startOAuth("/api/auth/semrush/start");
            else startOAuth("/api/auth/google/start");
          }}
        >
          <Plug className="h-4 w-4" />
          Connect {meta.id === "gsc" ? "Google Account" : meta.oauthName} Account
        </button>
      )}

      {!connected && meta.id === "dataforseo" && (
        <div className="border-t border-[color:var(--border)] pt-3">
          <ManualCredsForm provider={meta.id} />
        </div>
      )}

      {/* GA4 property selector */}
      {connected && meta.id === "google" && (
        <GA4PropertySelector
          properties={(integration?.ga4_properties_list as any[] | null) ?? []}
          selected={integration?.ga4_property_id ?? null}
        />
      )}

      {/* GSC site selector */}
      {connected && meta.id === "gsc" && (
        <GSCSiteSelector
          sites={(integration?.gsc_sites_list as string[] | null) ?? []}
          selected={integration?.gsc_site_url ?? null}
        />
      )}

      {/* Connected actions */}
      {(connected || needsAttention) && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={handleTest} disabled={testing} className="vt-btn-secondary">
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button
            onClick={() => setConfirmDisconnect(true)}
            className="vt-btn-secondary text-[color:var(--red)]"
          >
            <Trash2 className="h-4 w-4" /> Disconnect
          </button>
        </div>
      )}

      {confirmDisconnect && (
        <ConfirmModal
          title={`Disconnect ${meta.title}?`}
          body="Audits will fall back to estimates for this data source. You can reconnect at any time."
          onConfirm={handleDisconnect}
          onCancel={() => setConfirmDisconnect(false)}
        />
      )}
    </section>
  );
}

function GA4PropertySelector({
  properties, selected,
}: { properties: { propertyId: string; displayName: string }[]; selected: string | null }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveGa4Property);
  const m = useMutation({
    mutationFn: (propertyId: string) => saveFn({ data: { propertyId } }),
    onSuccess: () => {
      toast.success("GA4 property saved");
      qc.invalidateQueries({ queryKey: ["portal-integrations-safe"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        GA4 property
      </label>
      <select
        className="vt-input"
        value={selected ?? ""}
        onChange={(e) => e.target.value && m.mutate(e.target.value)}
        disabled={m.isPending || properties.length === 0}
      >
        <option value="">Select a property…</option>
        {properties.map((p) => (
          <option key={p.propertyId} value={p.propertyId}>
            {p.displayName} ({p.propertyId})
          </option>
        ))}
      </select>
      {!selected && (
        <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
          Select a GA4 property — required before audits can use real data.
        </Banner>
      )}
    </div>
  );
}

function GSCSiteSelector({
  sites, selected,
}: { sites: string[]; selected: string | null }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveGscSite);
  const m = useMutation({
    mutationFn: (siteUrl: string) => saveFn({ data: { siteUrl } }),
    onSuccess: () => {
      toast.success("Search Console site saved");
      qc.invalidateQueries({ queryKey: ["portal-integrations-safe"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-[color:var(--muted)]">
        Search Console site
      </label>
      <select
        className="vt-input"
        value={selected ?? ""}
        onChange={(e) => e.target.value && m.mutate(e.target.value)}
        disabled={m.isPending || sites.length === 0}
      >
        <option value="">Select a site…</option>
        {sites.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {!selected && (
        <Banner tone="amber" icon={<AlertTriangle className="h-4 w-4" />}>
          Select a verified Search Console site — required before audits use real data.
        </Banner>
      )}
    </div>
  );
}

function StatusPill({ connected, needsAttention }: { connected: boolean; needsAttention: boolean }) {
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--green)]/15 text-[color:var(--green)] px-2.5 py-1 text-xs font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--green)]" /> Connected
      </span>
    );
  }
  if (needsAttention) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--amber)]/15 text-[color:var(--amber)] px-2.5 py-1 text-xs font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--amber)]" /> Action needed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 text-[color:var(--muted)] px-2.5 py-1 text-xs font-medium">
      <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--muted)]" /> Not connected
    </span>
  );
}

function Banner({ tone, icon, children }: { tone: "green" | "amber" | "blue"; icon: React.ReactNode; children: React.ReactNode }) {
  const bg = { green: "rgba(34,197,94,0.12)", amber: "rgba(245,158,11,0.12)", blue: "rgba(79,140,255,0.12)" }[tone];
  const color = { green: "var(--green)", amber: "var(--amber)", blue: "var(--accent)" }[tone];
  return (
    <div className="rounded-lg px-3 py-2 text-sm flex items-start gap-2" style={{ background: bg, color }}>
      <span className="mt-0.5">{icon}</span>
      <div className="flex-1 text-[color:var(--light)]">{children}</div>
    </div>
  );
}

function ConfirmModal({
  title, body, onConfirm, onCancel,
}: { title: string; body: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="vt-card w-full max-w-md p-6">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-[color:var(--muted)] mt-2">{body}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onCancel} className="vt-btn-secondary">Keep connected</button>
          <button onClick={onConfirm} className="vt-btn-primary" style={{ background: "var(--red)" }}>
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}
