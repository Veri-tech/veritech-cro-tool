// One-time setup wizard shown on the client's first portal login.
// Walks through each data source (GA4, GSC, Semrush, DataForSEO) with a
// live checklist showing what's already connected.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, ChevronRight, Circle, Sparkles, X } from "lucide-react";
import {
  saveManualCredentials,
  markSetupComplete,
  getMySetupStatus,
} from "@/lib/integrations.functions";

type Step = "intro" | "ga4" | "gsc" | "semrush" | "dataforseo" | "done";
const ORDER: Step[] = ["intro", "ga4", "gsc", "semrush", "dataforseo", "done"];

const STEP_META: Record<
  Exclude<Step, "intro" | "done">,
  { provider: "google" | "gsc" | "semrush" | "dataforseo"; label: string; tag: "Required" | "Recommended" | "Optional" }
> = {
  ga4: { provider: "google", label: "Google Analytics 4", tag: "Required" },
  gsc: { provider: "gsc", label: "Google Search Console", tag: "Recommended" },
  semrush: { provider: "semrush", label: "Semrush", tag: "Optional" },
  dataforseo: { provider: "dataforseo", label: "DataForSEO", tag: "Optional" },
};

export function SetupWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>("intro");
  const finishFn = useServerFn(markSetupComplete);
  const statusFn = useServerFn(getMySetupStatus);
  const qc = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ["setup-status"],
    queryFn: () => statusFn(),
  });

  const idx = ORDER.indexOf(step);
  const next = () => setStep(ORDER[Math.min(idx + 1, ORDER.length - 1)]);
  const back = () => setStep(ORDER[Math.max(idx - 1, 0)]);

  async function finish() {
    try {
      await finishFn();
      await qc.invalidateQueries({ queryKey: ["setup-status"] });
      await qc.invalidateQueries({ queryKey: ["portal-integrations-safe"] });
      toast.success("Setup complete");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="vt-card w-full max-w-3xl p-0 relative max-h-[90vh] overflow-hidden grid grid-cols-1 md:grid-cols-[220px_1fr]">
        <button
          onClick={onClose}
          aria-label="Close wizard"
          className="absolute top-4 right-4 text-[color:var(--muted)] hover:text-white z-10"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Sidebar checklist */}
        <aside className="hidden md:flex flex-col gap-1 p-5 border-r border-[color:var(--border)] bg-[color:var(--slate)]/30">
          <div className="text-xs uppercase tracking-wide text-[color:var(--muted)] mb-3">Setup checklist</div>
          {(Object.entries(STEP_META) as [Exclude<Step, "intro" | "done">, typeof STEP_META[keyof typeof STEP_META]][]).map(
            ([stepKey, meta]) => {
              const active = status?.providers?.[meta.provider]?.active;
              const current = step === stepKey;
              return (
                <button
                  key={stepKey}
                  onClick={() => setStep(stepKey)}
                  className={`flex items-start gap-2 text-left rounded-md px-2 py-2 text-sm transition-colors ${
                    current ? "bg-white/5 text-white" : "text-[color:var(--muted)] hover:text-white"
                  }`}
                >
                  {active
                    ? <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" />
                    : <Circle className="h-4 w-4 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <div className="truncate">{meta.label}</div>
                    <div className="text-[10px] uppercase tracking-wide opacity-70">{meta.tag}</div>
                  </div>
                </button>
              );
            },
          )}
          <div className="mt-auto pt-4 border-t border-[color:var(--border)] text-[11px] text-[color:var(--muted)]">
            {status ? `${status.connectedCount}/${status.totalProviders} connected` : "Loading…"}
          </div>
        </aside>

        <div className="p-6 overflow-y-auto">
          <Progress current={idx} total={ORDER.length - 1} />

          {step === "intro" && <IntroStep onNext={next} status={status} />}
          {step === "ga4" && (
            <ProviderStep
              title="Google Analytics 4"
              tag="Required"
              connected={!!status?.providers?.google?.active}
              description="Connect your GA4 property so audits use real traffic data instead of estimates. You'll need a service-account JSON key from Google Cloud Console."
              provider="google"
              onSkip={next}
              onSaved={next}
            />
          )}
          {step === "gsc" && (
            <ProviderStep
              title="Google Search Console"
              tag="Recommended"
              connected={!!status?.providers?.gsc?.active}
              description="Connect your Search Console site so audits include real query and click data."
              provider="gsc"
              onSkip={next}
              onSaved={next}
            />
          )}
          {step === "semrush" && (
            <ProviderStep
              title="Semrush"
              tag="Optional"
              connected={!!status?.providers?.semrush?.active}
              description="Optional — if you have a Semrush API key, your competitor analysis will use real traffic numbers."
              provider="semrush"
              onSkip={next}
              onSaved={next}
            />
          )}
          {step === "dataforseo" && (
            <ProviderStep
              title="DataForSEO"
              tag="Optional"
              connected={!!status?.providers?.dataforseo?.active}
              description="Optional fallback for competitor traffic data when Semrush isn't available."
              provider="dataforseo"
              onSkip={next}
              onSaved={next}
            />
          )}
          {step === "done" && (
            <div className="space-y-5 text-center py-6">
              <div className="mx-auto rounded-full bg-[color:var(--green)]/15 p-3 w-14 h-14 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-[color:var(--green)]" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">You're all set</h2>
                <p className="text-sm text-[color:var(--muted)] mt-2">
                  {status?.ready
                    ? "All required sources are connected — your agency can run audits with real data."
                    : "Some required sources are still missing — you can add them any time from Connect Tools."}
                </p>
                <p className="text-sm text-[color:var(--muted)] mt-2">
                  Manage data sources any time from <strong>Connect Tools</strong> in the menu.
                </p>
              </div>
              <button onClick={finish} className="vt-btn-primary">Enter the portal</button>
            </div>
          )}

          {step !== "intro" && step !== "done" && (
            <div className="flex justify-between mt-6 pt-4 border-t border-[color:var(--border)]">
              <button onClick={back} className="vt-btn-secondary text-sm">Back</button>
              <button onClick={next} className="text-sm text-[color:var(--muted)] hover:text-white inline-flex items-center gap-1">
                Skip <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Progress({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-6">
      {Array.from({ length: total + 1 }).map((_, i) => (
        <div
          key={i}
          className="h-1 flex-1 rounded-full transition-colors"
          style={{ background: i <= current ? "var(--accent)" : "rgba(255,255,255,0.08)" }}
        />
      ))}
    </div>
  );
}

function IntroStep({ onNext, status }: { onNext: () => void; status?: { connectedCount: number; totalProviders: number; ready: boolean } | undefined }) {
  return (
    <div className="space-y-5 py-2">
      <div className="rounded-lg bg-[color:var(--accent)]/15 p-3 w-14 h-14 flex items-center justify-center">
        <Sparkles className="h-7 w-7 text-[color:var(--accent)]" />
      </div>
      <div>
        <h2 className="text-2xl font-semibold">Welcome — let's set up your data</h2>
        <p className="text-sm text-[color:var(--muted)] mt-2">
          Connecting your analytics tools makes audits significantly more accurate.
          You can skip optional steps and add them later from the Connect Tools page.
        </p>
        {status && (
          <p className="text-xs text-[color:var(--muted)] mt-3">
            Currently connected: <strong>{status.connectedCount}</strong> of {status.totalProviders} data sources
            {status.ready ? " · ready for audits" : " · GA4 still required"}.
          </p>
        )}
      </div>
      <ul className="space-y-2 text-sm">
        <li className="flex items-center gap-2"><Dot /> Google Analytics 4 <span className="text-[10px] uppercase tracking-wide text-[color:var(--red)]">Required</span></li>
        <li className="flex items-center gap-2"><Dot /> Google Search Console <span className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Recommended</span></li>
        <li className="flex items-center gap-2"><Dot /> Semrush <span className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Optional</span></li>
        <li className="flex items-center gap-2"><Dot /> DataForSEO <span className="text-[10px] uppercase tracking-wide text-[color:var(--muted)]">Optional</span></li>
      </ul>
      <button onClick={onNext} className="vt-btn-primary w-full">Get started</button>
    </div>
  );
}

function Dot() {
  return <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--accent)]" />;
}

function ProviderStep({
  title,
  tag,
  connected,
  description,
  provider,
  onSaved,
  onSkip,
}: {
  title: string;
  tag: "Required" | "Recommended" | "Optional";
  connected: boolean;
  description: string;
  provider: "google" | "gsc" | "semrush" | "dataforseo";
  onSaved: () => void;
  onSkip: () => void;
}) {
  const tagColor = tag === "Required" ? "text-[color:var(--red)]" : tag === "Recommended" ? "text-amber-400" : "text-[color:var(--muted)]";
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{title}</h2>
            <span className={`text-[10px] uppercase tracking-wide ${tagColor}`}>{tag}</span>
          </div>
          <p className="text-sm text-[color:var(--muted)] mt-2">{description}</p>
        </div>
        {connected && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-400 px-2.5 py-1 text-xs font-medium shrink-0">
            <CheckCircle2 className="h-3 w-3" /> Connected
          </span>
        )}
      </div>
      <ManualCredsForm provider={provider} onSaved={onSaved} onCancel={onSkip} />
    </div>
  );
}



export function ManualCredsForm({
  provider,
  onSaved,
  onCancel,
}: {
  provider: "google" | "gsc" | "semrush" | "dataforseo";
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const saveFn = useServerFn(saveManualCredentials);
  const qc = useQueryClient();
  const [saving, setSaving] = useState(false);

  // Per-provider local state
  const [serviceJson, setServiceJson] = useState("");
  const [ga4PropertyId, setGa4PropertyId] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  async function handleSave() {
    setSaving(true);
    try {
      const payload: any = { provider };
      if (provider === "google") {
        payload.serviceAccountJson = serviceJson;
        payload.ga4PropertyId = ga4PropertyId.trim();
      } else if (provider === "gsc") {
        payload.serviceAccountJson = serviceJson;
        payload.siteUrl = siteUrl.trim();
      } else if (provider === "semrush") {
        payload.apiKey = apiKey.trim();
      } else if (provider === "dataforseo") {
        payload.login = login.trim();
        payload.password = password;
      }
      await saveFn({ data: payload });
      await qc.invalidateQueries({ queryKey: ["portal-integrations-safe"] });
      toast.success(`${labelFor(provider)} saved`);
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {(provider === "google" || provider === "gsc") && (
        <>
          <label className="block text-xs font-medium text-[color:var(--muted)]">
            Service-account JSON key
          </label>
          <textarea
            value={serviceJson}
            onChange={(e) => setServiceJson(e.target.value)}
            placeholder='Paste the entire {"type":"service_account",...} JSON file here'
            className="vt-input font-mono text-xs min-h-[140px]"
          />
          <p className="text-xs text-[color:var(--muted)]">
            Create a service account in Google Cloud Console, give it{" "}
            {provider === "google" ? "GA4 Viewer" : "Search Console"} access, then download
            its JSON key and paste it above.
          </p>
          {provider === "google" ? (
            <div>
              <label className="block text-xs font-medium text-[color:var(--muted)] mt-2">
                GA4 Property ID
              </label>
              <input
                value={ga4PropertyId}
                onChange={(e) => setGa4PropertyId(e.target.value)}
                placeholder="e.g. 312345678"
                className="vt-input"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-[color:var(--muted)] mt-2">
                Site URL
              </label>
              <input
                value={siteUrl}
                onChange={(e) => setSiteUrl(e.target.value)}
                placeholder="https://example.com/"
                className="vt-input"
              />
            </div>
          )}
        </>
      )}

      {provider === "semrush" && (
        <>
          <label className="block text-xs font-medium text-[color:var(--muted)]">
            Semrush API key
          </label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Your Semrush API key"
            className="vt-input"
            type="password"
          />
          <p className="text-xs text-[color:var(--muted)]">
            Find your API key under Semrush → Profile → Subscription info → API.
          </p>
        </>
      )}

      {provider === "dataforseo" && (
        <>
          <label className="block text-xs font-medium text-[color:var(--muted)]">
            DataForSEO login (email)
          </label>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="you@example.com"
            className="vt-input"
          />
          <label className="block text-xs font-medium text-[color:var(--muted)] mt-2">
            DataForSEO password
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="vt-input"
            type="password"
          />
        </>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <button onClick={handleSave} disabled={saving} className="vt-btn-primary">
          {saving ? "Saving…" : "Save credentials"}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="vt-btn-secondary">
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function labelFor(p: string) {
  return p === "google" ? "GA4" : p === "gsc" ? "Search Console" : p === "semrush" ? "Semrush" : "DataForSEO";
}
