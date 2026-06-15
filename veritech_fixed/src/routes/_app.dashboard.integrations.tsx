import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSuspenseQuery, useQueryClient, queryOptions, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2, XCircle, AlertCircle, RotateCw, Trash2, AlertTriangle,
  ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Plus, Pencil,
  Database, BarChart3, Search, TrendingUp, ClipboardList, Key, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listAgencyIntegrations,
  adminTestIntegration,
  adminDisconnectIntegration,
  toggleClientProvider,
  saveManualData,
  saveAgencyApiKey,
  PROVIDER_LABELS,
  PROVIDER_DESCRIPTIONS,
  PROVIDER_FREE,
} from "@/lib/integrations-admin.functions";
import {
  getClientOAuthProperties,
  saveClientOAuthSelection,
} from "@/lib/integrations.functions";

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

type Provider = "google" | "gsc" | "semrush" | "dataforseo" | "manual";

const PROVIDER_ICONS: Record<Provider, typeof Database> = {
  google: BarChart3,
  gsc: Search,
  semrush: TrendingUp,
  dataforseo: Database,
  manual: ClipboardList,
};

const PROVIDER_KEYS: Provider[] = ["google", "gsc", "semrush", "dataforseo", "manual"];

function IntegrationsPage() {
  const fn = useServerFn(listAgencyIntegrations);
  const { data } = useSuspenseQuery({
    ...integrationsQO(),
    queryFn: () => fn(),
  });
  const [agencyKeyModal, setAgencyKeyModal] = useState<"dataforseo" | "semrush" | null>(null);

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
            Manage data sources per client. Audits run with any active source — GA4, DataForSEO, or manual data.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setAgencyKeyModal("dataforseo")}
            className="vt-btn-secondary text-xs flex items-center gap-1.5"
          >
            <Key className="h-3.5 w-3.5" /> DataForSEO Key
          </button>
          <button
            onClick={() => setAgencyKeyModal("semrush")}
            className="vt-btn-secondary text-xs flex items-center gap-1.5"
          >
            <Key className="h-3.5 w-3.5" /> Semrush Key
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat label="Audit-ready" value={ready} tone="emerald" />
        <Stat label="Partial setup" value={partial} tone="amber" />
        <Stat label="No data sources" value={none} tone="muted" />
      </div>

      {/* Provider legend */}
      <div className="vt-card p-4">
        <h3 className="text-xs font-medium text-[color:var(--muted)] uppercase tracking-wide mb-3">Available Data Sources</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PROVIDER_KEYS.map((p) => {
            const Icon = PROVIDER_ICONS[p];
            return (
              <div key={p} className="flex items-start gap-2.5 p-3 rounded-lg bg-[color:var(--slate)]/30">
                <Icon className="h-4 w-4 text-[color:var(--accent)] mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    {PROVIDER_LABELS[p]}
                    {PROVIDER_FREE[p] && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Free</span>
                    )}
                  </div>
                  <div className="text-xs text-[color:var(--muted)] mt-0.5">{PROVIDER_DESCRIPTIONS[p]}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Client rows */}
      <div className="space-y-3">
        {rows.length === 0 && (
          <div className="vt-card p-8 text-center text-[color:var(--muted)]">
            No clients yet. Add a client to manage their integrations.
          </div>
        )}
        {rows.map((c) => <ClientCard key={c.id} c={c} />)}
      </div>

      <p className="text-xs text-[color:var(--muted)]">
        Credentials are stored encrypted and never displayed. Toggle off to disable a source without removing it.
      </p>

      {/* Agency API Key Modal */}
      {agencyKeyModal && (
        <AgencyKeyModal
          provider={agencyKeyModal}
          onClose={() => setAgencyKeyModal(null)}
        />
      )}
      {propertyModal && (
        <PropertySelectorModal
          clientId={c.id}
          clientName={c.name}
          onClose={() => { setPropertyModal(false); }}
        />
      )}
    </div>
  );
}

function ClientCard({ c }: { c: any }) {
  const [expanded, setExpanded] = useState(false);
  const [manualModal, setManualModal] = useState(false);
  const [agencyKeyModal, setAgencyKeyModal] = useState<"dataforseo" | "semrush" | null>(null);
  const [propertyModal, setPropertyModal] = useState(false);

  return (
    <div className="vt-card overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[color:var(--slate)]/20 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`h-2 w-2 rounded-full ${c.ready ? "bg-emerald-400" : c.connectedCount > 0 ? "bg-amber-400" : "bg-[color:var(--muted)]"}`} />
          <div className="text-left">
            <div className="font-medium text-sm">{c.name}</div>
            {c.domain && <div className="text-xs text-[color:var(--muted)]">{c.domain}</div>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {PROVIDER_KEYS.map((p) => {
              const row = c.providers[p];
              const active = row?.has_credentials && row?.status === "active";
              const Icon = PROVIDER_ICONS[p];
              return (
                <div
                  key={p}
                  title={`${PROVIDER_LABELS[p]}: ${active ? "Active" : row?.has_credentials ? row.status : "Not connected"}`}
                  className={`h-6 w-6 rounded flex items-center justify-center ${
                    active ? "bg-emerald-500/20 text-emerald-400" :
                    row?.has_credentials ? "bg-amber-500/20 text-amber-400" :
                    "bg-[color:var(--slate)]/40 text-[color:var(--muted)]/40"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                </div>
              );
            })}
          </div>
          <span className="text-xs text-[color:var(--muted)]">
            {c.connectedCount}/{PROVIDER_KEYS.length} active
          </span>
          {expanded ? <ChevronDown className="h-4 w-4 text-[color:var(--muted)]" /> : <ChevronRight className="h-4 w-4 text-[color:var(--muted)]" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-[color:var(--border)] px-4 py-4 space-y-3">
          {!c.ready && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              No active data sources. Connect at least one to enable audits.
            </div>
          )}

          <div className="space-y-2">
            {PROVIDER_KEYS.map((p) => (
              <ProviderRow
                key={p}
                clientId={c.id}
                clientName={c.name}
                provider={p}
                row={c.providers[p]}
                onManualEdit={p === "manual" ? () => setManualModal(true) : undefined}
                onAddAgencyKey={p === "dataforseo" || p === "semrush" ? (prov) => setAgencyKeyModal(prov as "dataforseo" | "semrush") : undefined}
                onOpenPropertyModal={(p === "google" || p === "gsc") ? () => setPropertyModal(true) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {manualModal && (
        <ManualDataModal
          clientId={c.id}
          clientName={c.name}
          existing={c.providers.manual}
          onClose={() => setManualModal(false)}
        />
      )}
      {agencyKeyModal && (
        <AgencyKeyModal
          provider={agencyKeyModal}
          onClose={() => setAgencyKeyModal(null)}
        />
      )}
      {propertyModal && (
        <PropertySelectorModal
          clientId={c.id}
          clientName={c.name}
          onClose={() => { setPropertyModal(false); }}
        />
      )}
    </div>
  );
}

function ProviderRow({
  clientId, clientName, provider, row, onManualEdit, onAddAgencyKey, onOpenPropertyModal,
}: {
  clientId: string;
  clientName: string;
  provider: Provider;
  row: any;
  onManualEdit?: () => void;
  onAddAgencyKey?: (provider: string) => void;
  onOpenPropertyModal?: () => void;
}) {
  const qc = useQueryClient();
  const testFn = useServerFn(adminTestIntegration);
  const disconnectFn = useServerFn(adminDisconnectIntegration);
  const toggleFn = useServerFn(toggleClientProvider);
  const [busy, setBusy] = useState<string | null>(null);

  const has = !!row?.has_credentials;
  const active = has && row?.status === "active";
  const disabled = has && row?.status === "disabled";
  const Icon = PROVIDER_ICONS[provider];

  async function handleToggle() {
    if (!has) return;
    setBusy("toggle");
    try {
      await toggleFn({ data: { clientId, provider, enabled: !active } });
      await qc.invalidateQueries({ queryKey: ["agency-integrations"] });
      toast.success(`${PROVIDER_LABELS[provider]} ${active ? "disabled" : "enabled"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(null); }
  }

  async function handleTest() {
    setBusy("test");
    try {
      const r = await testFn({ data: { clientId, provider } });
      if (r.ok) toast.success(`${clientName} · ${PROVIDER_LABELS[provider]}: ${r.message}`);
      else toast.error(`${clientName} · ${PROVIDER_LABELS[provider]}: ${r.message}`);
      await qc.invalidateQueries({ queryKey: ["agency-integrations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally { setBusy(null); }
  }

  async function handleDisconnect() {
    if (!confirm(`Remove ${PROVIDER_LABELS[provider]} for ${clientName}?`)) return;
    setBusy("disc");
    try {
      await disconnectFn({ data: { clientId, provider } });
      toast.success(`${PROVIDER_LABELS[provider]} removed`);
      await qc.invalidateQueries({ queryKey: ["agency-integrations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(null); }
  }

  return (
    <div className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${
      active ? "bg-emerald-500/5 border border-emerald-500/20" :
      disabled ? "bg-[color:var(--slate)]/20 border border-[color:var(--border)] opacity-60" :
      "bg-[color:var(--slate)]/20 border border-[color:var(--border)]"
    }`}>
      <Icon className={`h-4 w-4 shrink-0 ${active ? "text-emerald-400" : "text-[color:var(--muted)]"}`} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{PROVIDER_LABELS[provider]}</span>
          {PROVIDER_FREE[provider] && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400">Free</span>
          )}
        </div>
        <div className="text-xs text-[color:var(--muted)]">
          {has ? (
            active ? "Active — data will be used in audits" :
            disabled ? "Disabled — won't be used in audits" :
            row?.status ?? "Unknown status"
          ) : PROVIDER_DESCRIPTIONS[provider]}
        </div>
        {row?.last_error && (
          <div className="text-[10px] text-amber-400 mt-0.5 truncate">{row.last_error}</div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Status icon */}
        {has ? (
          active ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> :
          disabled ? <XCircle className="h-4 w-4 text-[color:var(--muted)]" /> :
          <AlertCircle className="h-4 w-4 text-amber-400" />
        ) : (
          <XCircle className="h-4 w-4 text-[color:var(--muted)]/40" />
        )}

        {/* Actions */}
        {has && (
          <button
            onClick={handleToggle}
            disabled={busy === "toggle"}
            title={active ? "Disable this source" : "Enable this source"}
            className="text-[color:var(--muted)] hover:text-[color:var(--light)] transition-colors"
          >
            {active
              ? <ToggleRight className="h-5 w-5 text-emerald-400" />
              : <ToggleLeft className="h-5 w-5" />
            }
          </button>
        )}

        {provider === "manual" ? (
          <button
            onClick={onManualEdit}
            className="text-xs flex items-center gap-1 text-[color:var(--accent)] hover:underline"
          >
            <Pencil className="h-3 w-3" />
            {has ? "Edit" : "Add data"}
          </button>
        ) : !has ? (
          provider === "google" || provider === "gsc" ? (
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  const { data: { session } } = await supabase.auth.getSession();
                  const token = session?.access_token;
                  if (!token) { toast.error("Not logged in"); return; }
                  const appUrl = window.location.origin;
                  const popup = window.open(
                    `${appUrl}/api/auth/google/agency-start?clientId=${clientId}&token=${token}`,
                    "google-oauth",
                    "width=600,height=700,left=200,top=100"
                  );
                  // Poll for popup close then refresh + open property selector
                  const timer = setInterval(() => {
                    if (popup?.closed) {
                      clearInterval(timer);
                      // Small delay then open property selector
                      setTimeout(() => {
                        onOpenPropertyModal?.();
                      }, 1000);
                    }
                  }, 500);
                }}
                className="text-xs flex items-center gap-1 text-[color:var(--accent)] hover:underline font-medium"
              >
                <ExternalLink className="h-3 w-3" />
                Connect {provider === "google" ? "GA4" : "GSC"}
              </button>
            </div>
          ) : onAddAgencyKey ? (
            <button
              onClick={() => onAddAgencyKey(provider)}
              className="text-xs flex items-center gap-1 text-[color:var(--accent)] hover:underline font-medium"
            >
              <Plus className="h-3 w-3" /> Add agency key
            </button>
          ) : (
            <span className="text-xs text-[color:var(--muted)]/60">Add key →</span>
          )
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleTest}
              disabled={!!busy}
              className="text-xs flex items-center gap-1 text-[color:var(--accent)] hover:underline disabled:opacity-50"
            >
              <RotateCw className={`h-3 w-3 ${busy === "test" ? "animate-spin" : ""}`} />
              Test
            </button>
            <button
              onClick={handleDisconnect}
              disabled={!!busy}
              className="text-xs flex items-center gap-1 text-red-400 hover:underline disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" />
              Remove
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ManualDataModal({ clientId, clientName, existing, onClose }: {
  clientId: string;
  clientName: string;
  existing: any;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveManualData);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    sessions: "",
    users: "",
    conversion_rate: "",
    bounce_rate: "",
    avg_order_value: "",
    organic_keywords: "",
    organic_traffic: "",
    clicks: "",
    impressions: "",
  });

  function field(key: keyof typeof form, label: string, hint?: string) {
    return (
      <div>
        <label className="block text-xs font-medium text-[color:var(--muted)] mb-1">{label}</label>
        <input
          type="number"
          placeholder={hint ?? "Optional"}
          className="vt-input"
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        />
      </div>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const num = (v: string) => v === "" ? undefined : Number(v);
      await saveFn({
        data: {
          clientId,
          data: {
            sessions: num(form.sessions),
            users: num(form.users),
            conversion_rate: num(form.conversion_rate),
            bounce_rate: num(form.bounce_rate),
            avg_order_value: num(form.avg_order_value),
            organic_keywords: num(form.organic_keywords),
            organic_traffic: num(form.organic_traffic),
            clicks: num(form.clicks),
            impressions: num(form.impressions),
          },
        },
      });
      toast.success("Manual data saved");
      await qc.invalidateQueries({ queryKey: ["agency-integrations"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="vt-card w-full max-w-lg p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Manual Data — {clientName}</h2>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            Enter analytics data manually. Leave fields blank to skip. This data will be used in audits instead of connected tools.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 text-xs font-medium text-[color:var(--muted)] uppercase tracking-wide">GA4 Metrics</div>
          {field("sessions", "Sessions (30d)")}
          {field("users", "Users (30d)")}
          {field("conversion_rate", "Conversion Rate (%)", "e.g. 2.4")}
          {field("bounce_rate", "Bounce Rate (%)", "e.g. 45.2")}
          {field("avg_order_value", "Avg Order Value (R)")}

          <div className="col-span-2 text-xs font-medium text-[color:var(--muted)] uppercase tracking-wide pt-2">Search Console Metrics</div>
          {field("clicks", "Clicks (30d)")}
          {field("impressions", "Impressions (30d)")}

          <div className="col-span-2 text-xs font-medium text-[color:var(--muted)] uppercase tracking-wide pt-2">Competitive Metrics</div>
          {field("organic_keywords", "Organic Keywords")}
          {field("organic_traffic", "Organic Traffic (monthly)")}
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="vt-btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="vt-btn-primary flex-1">
            {saving ? "Saving…" : "Save Data"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PropertySelectorModal({ clientId, clientName, onClose }: {
  clientId: string;
  clientName: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const getPropsFn = useServerFn(getClientOAuthProperties);
  const saveFn = useServerFn(saveClientOAuthSelection);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [props, setProps] = useState<any>(null);
  const [selectedGa4, setSelectedGa4] = useState("");
  const [selectedGsc, setSelectedGsc] = useState("");

  useEffect(() => {
    getPropsFn({ data: { clientId } })
      .then((d) => {
        setProps(d);
        setSelectedGa4(d.ga4Selected ?? "");
        setSelectedGsc(d.gscSelected ?? "");
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [clientId]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveFn({ data: { clientId, ga4PropertyId: selectedGa4 || undefined, gscSiteUrl: selectedGsc || undefined } });
      toast.success("GA4 & Search Console configured!");
      await qc.invalidateQueries({ queryKey: ["agency-integrations"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="vt-card w-full max-w-lg p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Select GA4 Property — {clientName}</h2>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            {props?.accountEmail ? `Connected as ${props.accountEmail}` : "Choose which property to use for this client's audits."}
          </p>
        </div>

        {loading ? (
          <div className="py-8 text-center text-[color:var(--muted)]">Loading properties…</div>
        ) : (
          <div className="space-y-4">
            {props?.ga4Properties?.length > 0 ? (
              <div>
                <label className="block text-xs font-medium text-[color:var(--muted)] mb-2">GA4 Property</label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {props.ga4Properties.map((p: any) => (
                    <label key={p.propertyId} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                      selectedGa4 === p.propertyId
                        ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10"
                        : "border-[color:var(--border)] hover:border-[color:var(--accent)]/50"
                    }`}>
                      <input
                        type="radio"
                        name="ga4"
                        value={p.propertyId}
                        checked={selectedGa4 === p.propertyId}
                        onChange={() => setSelectedGa4(p.propertyId)}
                        className="accent-[color:var(--accent)]"
                      />
                      <div>
                        <div className="text-sm font-medium">{p.displayName}</div>
                        <div className="text-xs text-[color:var(--muted)]">ID: {p.propertyId}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-sm text-amber-400 bg-amber-400/10 rounded-lg px-3 py-2">
                No GA4 properties found. Make sure the connected Google account has GA4 access.
              </div>
            )}

            {props?.gscSites?.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-[color:var(--muted)] mb-2">Search Console Site</label>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {props.gscSites.map((site: string) => (
                    <label key={site} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer border transition-colors ${
                      selectedGsc === site
                        ? "border-[color:var(--accent)] bg-[color:var(--accent)]/10"
                        : "border-[color:var(--border)] hover:border-[color:var(--accent)]/50"
                    }`}>
                      <input
                        type="radio"
                        name="gsc"
                        value={site}
                        checked={selectedGsc === site}
                        onChange={() => setSelectedGsc(site)}
                        className="accent-[color:var(--accent)]"
                      />
                      <span className="text-sm">{site}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="vt-btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving || loading || (!selectedGa4 && !selectedGsc)} className="vt-btn-primary flex-1 disabled:opacity-50">
            {saving ? "Saving…" : "Save Selection"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AgencyKeyModal({ provider, onClose }: {
  provider: "dataforseo" | "semrush";
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveAgencyApiKey);
  const [saving, setSaving] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");

  async function handleSave() {
    setSaving(true);
    try {
      const credentials = provider === "dataforseo"
        ? { login, password }
        : { apiKey };
      await saveFn({ data: { provider, credentials } });
      toast.success(`${PROVIDER_LABELS[provider]} key saved`);
      await qc.invalidateQueries({ queryKey: ["agency-integrations"] });
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="vt-card w-full max-w-md p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">{PROVIDER_LABELS[provider]} — Agency Key</h2>
          <p className="text-sm text-[color:var(--muted)] mt-1">
            This key is shared across all clients. Used as a fallback when clients don't have their own connection.
          </p>
        </div>

        {provider === "dataforseo" ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[color:var(--muted)] mb-1">Login (email)</label>
              <input type="email" className="vt-input" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="your@email.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[color:var(--muted)] mb-1">Password</label>
              <input type="password" className="vt-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="DataForSEO API password" />
            </div>
            <p className="text-xs text-[color:var(--muted)]">
              Get your credentials at <a href="https://app.dataforseo.com/api-dashboard" target="_blank" rel="noreferrer" className="vt-link">dataforseo.com</a>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[color:var(--muted)] mb-1">API Key</label>
              <input type="password" className="vt-input" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Semrush API key" />
            </div>
            <p className="text-xs text-[color:var(--muted)]">
              Get your key at <a href="https://www.semrush.com/api-analytics/" target="_blank" rel="noreferrer" className="vt-link">semrush.com</a>
            </p>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="vt-btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="vt-btn-primary flex-1">
            {saving ? "Saving…" : "Save Key"}
          </button>
        </div>
      </div>
    </div>
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
