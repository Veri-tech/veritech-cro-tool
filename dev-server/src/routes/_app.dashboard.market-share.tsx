import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
} from "recharts";
import {
  Plus,
  Trash2,
  Play,
  Pause,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Download,
  XCircle,
  RotateCw,
  History,
} from "lucide-react";
import { listClients } from "@/lib/clients.functions";
import { getAgencySettings } from "@/lib/settings.functions";
import {
  startMarketShareJob,
  resumeMarketShareJob,
  getMarketShareStatus,
  listMarketShareJobs,
  listInProgressMarketShareJobs,
  cancelMarketShareJob,
  getSavedCompetitorsForClient,
  uploadMarketSharePdf,
} from "@/lib/market-share.functions";
import { validateAuditUrl } from "@/lib/validate";
import { generateMarketSharePdf } from "@/lib/market-share-pdf";

const searchSchema = z.object({
  client: fallback(z.string().uuid().optional(), undefined),
  job: fallback(z.string().uuid().optional(), undefined),
  resume: fallback(z.boolean().optional(), undefined),
});

export const Route = createFileRoute("/_app/dashboard/market-share")({
  ssr: false,
  validateSearch: zodValidator(searchSchema),
  component: MarketSharePage,
});

type CompetitorRow = { name: string; url: string };

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function MarketSharePage() {
  const navigate = useNavigate({ from: "/dashboard/market-share" });
  const search = Route.useSearch();
  const qc = useQueryClient();

  const listClientsFn = useServerFn(listClients);
  const listInProgressFn = useServerFn(listInProgressMarketShareJobs);
  const settingsFn = useServerFn(getAgencySettings);
  const listJobsFn = useServerFn(listMarketShareJobs);
  const getStatusFn = useServerFn(getMarketShareStatus);
  const startFn = useServerFn(startMarketShareJob);
  const resumeFn = useServerFn(resumeMarketShareJob);
  const cancelFn = useServerFn(cancelMarketShareJob);
  const getSavedCompetitorsFn = useServerFn(getSavedCompetitorsForClient);
  const uploadPdfFn = useServerFn(uploadMarketSharePdf);

  const clientsQ = useQuery({
    queryKey: ["clients", { archived: false }],
    queryFn: () => listClientsFn({ data: { includeArchived: false } }),
  });
  const settingsQ = useQuery({
    queryKey: ["agency-settings"],
    queryFn: () => settingsFn(),
    staleTime: 60_000,
  });
  const inProgressQ = useQuery({
    queryKey: ["ms-in-progress"],
    queryFn: () => listInProgressFn(),
    refetchInterval: 10_000,
  });

  const [clientId, setClientId] = useState<string | null>(search.client ?? null);
  const [clientUrl, setClientUrl] = useState("");
  const [clientLabel, setClientLabel] = useState("Home");
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([{ name: "", url: "" }]);
  const [saveForLater, setSaveForLater] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(search.job ?? null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync clientId from URL once clients load
  useEffect(() => {
    if (!clientId && clientsQ.data && clientsQ.data.length === 1) {
      setClientId(clientsQ.data[0].id);
    }
  }, [clientsQ.data, clientId]);

  // Pull saved competitors when client changes
  const savedCompetitorsQ = useQuery({
    queryKey: ["saved-competitors", clientId],
    queryFn: () => getSavedCompetitorsFn({ data: { clientId: clientId! } }),
    enabled: !!clientId,
  });
  useEffect(() => {
    if (!savedCompetitorsQ.data || activeJobId) return;
    if (savedCompetitorsQ.data.length > 0) {
      setCompetitors(
        savedCompetitorsQ.data.slice(0, 4).map((c) => ({
          name: c.name ?? "",
          url: `https://${c.domain}`,
        })),
      );
    } else {
      setCompetitors([{ name: "", url: "" }]);
    }
  }, [savedCompetitorsQ.data, activeJobId]);

  // Default client URL when client is picked
  const selectedClient = useMemo(
    () => clientsQ.data?.find((c) => c.id === clientId) ?? null,
    [clientsQ.data, clientId],
  );
  useEffect(() => {
    if (selectedClient?.domain && !clientUrl) {
      setClientUrl(`https://${selectedClient.domain.replace(/^https?:\/\//, "")}`);
    }
  }, [selectedClient, clientUrl]);

  // Today's audit indicator
  const todayAuditExists = useMemo(() => {
    if (!selectedClient?.latest_audit_at) return false;
    const d = new Date(selectedClient.latest_audit_at);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return d.getTime() >= start.getTime();
  }, [selectedClient]);

  // ---------- Active job polling ----------
  const statusQ = useQuery({
    queryKey: ["ms-status", activeJobId],
    queryFn: () => getStatusFn({ data: { jobId: activeJobId! } }),
    enabled: !!activeJobId,
    refetchInterval: (q) => {
      const s = (q.state.data as any)?.job?.status;
      if (s === "completed" || s === "failed" || s === "partial") return false;
      return 3000;
    },
  });

  // ---------- Mutations ----------
  const startMut = useMutation({
    mutationFn: (vars: { competitors: CompetitorRow[] }) =>
      startFn({
        data: {
          clientId: clientId!,
          clientUrl,
          clientLabel: clientLabel || "Home",
          competitors: vars.competitors.map((c) => ({ name: c.name || null, url: c.url })),
          saveCompetitors: saveForLater,
        },
      }),
    onSuccess: (res) => {
      setActiveJobId(res.jobId);
      navigate({
        search: (prev: any) => ({ ...prev, client: clientId ?? undefined, job: res.jobId, resume: undefined }),
        replace: true,
      });
      qc.invalidateQueries({ queryKey: ["ms-in-progress"] });
      qc.invalidateQueries({ queryKey: ["ms-jobs"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to start"),
  });

  const resumeMut = useMutation({
    mutationFn: (jobId: string) => resumeFn({ data: { jobId } }),
    onSuccess: (_res, jobId) => {
      setActiveJobId(jobId);
      qc.invalidateQueries({ queryKey: ["ms-status", jobId] });
      qc.invalidateQueries({ queryKey: ["ms-in-progress"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Failed to resume"),
  });

  const cancelMut = useMutation({
    mutationFn: (jobId: string) => cancelFn({ data: { jobId } }),
    onSuccess: () => {
      setActiveJobId(null);
      navigate({ search: {}, replace: true });
      qc.invalidateQueries({ queryKey: ["ms-in-progress"] });
    },
  });

  // Auto-resume if URL says so
  useEffect(() => {
    if (search.resume && search.job && !resumeMut.isPending && !statusQ.isFetching) {
      // Only trigger once
      resumeMut.mutate(search.job);
      navigate({
        search: (prev: any) => ({ ...prev, resume: undefined }),
        replace: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.resume, search.job]);

  // ---------- Previous jobs list ----------
  const jobsQ = useQuery({
    queryKey: ["ms-jobs", clientId],
    queryFn: () => listJobsFn({ data: clientId ? { clientId } : {} }),
    enabled: !!clientId,
  });

  // ---------- Derived ----------
  const stepsTotal = useMemo(() => 1 + competitors.length + 1, [competitors]);
  const dailyLimit = settingsQ.data?.agency?.daily_audit_limit ?? 10;
  const auditsToday = settingsQ.data?.usage?.auditsToday ?? 0;
  const remainingCredits = Math.max(0, dailyLimit - auditsToday);
  const validCompetitors = competitors.filter((c) => validateAuditUrl(c.url).valid);
  const canRun =
    !!clientId &&
    validateAuditUrl(clientUrl).valid &&
    validCompetitors.length >= 1 &&
    stepsTotal <= remainingCredits;

  // ---------- PDF ----------
  async function downloadPdf() {
    if (!statusQ.data) return;
    setPdfBusy(true);
    try {
      const meta = {
        agencyName: settingsQ.data?.agency?.name ?? "Veritech",
        clientName: selectedClient?.name ?? "Client",
        clientUrl: statusQ.data.client_audit?.page_url ?? clientUrl,
        clientScore: statusQ.data.client_audit?.score ?? 0,
        generatedAt: new Date().toISOString(),
      };
      const comps = statusQ.data.competitor_audits.map((c: any) => ({
        name: c.name || c.domain || domainOf(c.page_url),
        domain: c.domain ?? domainOf(c.page_url),
        score: c.score ?? 0,
        rating: c.rating ?? "",
        traffic_est: c.traffic_est,
        data_source: c.data_source,
        top_friction: parseTopFriction(c.output ?? ""),
      }));
      const blob = generateMarketSharePdf(meta, comps, statusQ.data.job.synthesis_output ?? "");
      // Save to user device
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `market-share-${selectedClient?.name?.replace(/\s+/g, "_") ?? "client"}-${activeJobId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      // Upload to storage as well
      try {
        const buf = await blob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        await uploadPdfFn({
          data: {
            jobId: activeJobId!,
            clientId: clientId!,
            pdfBase64: base64,
          },
        });
      } catch (e) {
        console.warn("PDF upload failed:", e);
      }
    } finally {
      setPdfBusy(false);
    }
  }

  // ---------- Render branches ----------
  const job = statusQ.data?.job;
  const isRunning = !!job && (job.status === "running");
  const isPartial = !!job && job.status === "partial";
  const isCompleted = !!job && job.status === "completed";
  const isFailed = !!job && job.status === "failed";
  const showForm = !activeJobId || (isFailed && !isPartial);

  // In-progress banner: only show when not viewing the same job
  const otherInProgress = (inProgressQ.data ?? []).filter((j) => j.id !== activeJobId);

  return (
    <div className="space-y-6 max-w-6xl">
      <header>
        <h1 className="text-2xl font-semibold">Market Share Analysis</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Compare your clients against their competitors.
        </p>
      </header>

      {otherInProgress.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          {otherInProgress.map((j) => (
            <div key={j.id} className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <strong>You have an in-progress analysis for {j.client_name}.</strong>
                <span className="ml-2 text-[color:var(--muted)]">{j.current_step_label ?? ""}</span>
              </div>
              <button
                className="vt-btn-secondary text-xs shrink-0"
                onClick={() => {
                  setClientId(j.client_id);
                  setActiveJobId(j.id);
                  navigate({
                    search: { client: j.client_id, job: j.id, resume: j.can_resume || undefined },
                    replace: true,
                  });
                }}
              >
                {j.can_resume ? "Resume →" : "View →"}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* FORM */}
      {showForm && (
        <FormCard
          clients={clientsQ.data ?? []}
          clientId={clientId}
          setClientId={(id) => {
            setClientId(id);
            setActiveJobId(null);
            setError(null);
            setClientUrl("");
            navigate({ search: { client: id ?? undefined }, replace: true });
          }}
          selectedClient={selectedClient}
          clientUrl={clientUrl}
          setClientUrl={setClientUrl}
          clientLabel={clientLabel}
          setClientLabel={setClientLabel}
          todayAuditExists={todayAuditExists}
          competitors={competitors}
          setCompetitors={setCompetitors}
          saveForLater={saveForLater}
          setSaveForLater={setSaveForLater}
          stepsTotal={stepsTotal}
          remainingCredits={remainingCredits}
          canRun={canRun}
          running={startMut.isPending}
          onRun={() => {
            setError(null);
            startMut.mutate({ competitors: validCompetitors });
          }}
        />
      )}

      {/* PROGRESS / RESULTS */}
      {activeJobId && job && (
        <>
          {(isRunning || isPartial) && (
            <ProgressCard
              job={job}
              competitors={statusQ.data?.competitor_audits ?? []}
              isPartial={isPartial}
              onResume={() => resumeMut.mutate(activeJobId)}
              resuming={resumeMut.isPending}
              onCancel={() => cancelMut.mutate(activeJobId)}
            />
          )}
          {isFailed && (
            <div className="vt-card p-6 space-y-3">
              <div className="flex items-center gap-2 text-red-400">
                <XCircle className="h-5 w-5" /> Analysis failed
              </div>
              <p className="text-sm text-[color:var(--muted)]">{job.error_message ?? "Unknown error"}</p>
              <button
                className="vt-btn-secondary"
                onClick={() => {
                  setActiveJobId(null);
                  navigate({ search: {}, replace: true });
                }}
              >
                Start over
              </button>
            </div>
          )}
          {isCompleted && statusQ.data && (
            <ResultsView
              clientName={selectedClient?.name ?? "Client"}
              clientAudit={statusQ.data.client_audit}
              competitors={statusQ.data.competitor_audits}
              synthesis={job.synthesis_output ?? ""}
              onDownloadPdf={downloadPdf}
              pdfBusy={pdfBusy}
            />
          )}
        </>
      )}

      {/* Previous analyses */}
      {clientId && (
        <section className="vt-card p-5 space-y-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[color:var(--muted)]" />
            <h2 className="text-sm font-semibold">Previous Analyses</h2>
          </div>
          {jobsQ.isLoading ? (
            <p className="text-xs text-[color:var(--muted)]">Loading…</p>
          ) : (jobsQ.data ?? []).length === 0 ? (
            <p className="text-xs text-[color:var(--muted)]">No previous analyses yet.</p>
          ) : (
            <ul className="divide-y divide-[color:var(--border)]">
              {(jobsQ.data ?? []).map((j) => (
                <li key={j.id} className="py-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {new Date(j.created_at).toLocaleString()}{" "}
                      <span className="text-xs text-[color:var(--muted)] ml-2">
                        ({j.competitors_count} competitors)
                      </span>
                    </div>
                    <div className="text-xs text-[color:var(--muted)]">
                      Status: {j.status}
                      {j.status !== "completed" &&
                        ` · ${j.steps_completed}/${j.steps_total}`}
                    </div>
                  </div>
                  <button
                    className="vt-btn-secondary text-xs shrink-0"
                    onClick={() => {
                      setActiveJobId(j.id);
                      navigate({
                        search: { client: clientId, job: j.id, resume: j.can_resume || undefined },
                        replace: true,
                      });
                    }}
                  >
                    {j.can_resume ? "Resume →" : "View →"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

// ============================================================
// FORM
// ============================================================
function FormCard(props: {
  clients: any[];
  clientId: string | null;
  setClientId: (id: string | null) => void;
  selectedClient: any;
  clientUrl: string;
  setClientUrl: (v: string) => void;
  clientLabel: string;
  setClientLabel: (v: string) => void;
  todayAuditExists: boolean;
  competitors: CompetitorRow[];
  setCompetitors: (rows: CompetitorRow[]) => void;
  saveForLater: boolean;
  setSaveForLater: (v: boolean) => void;
  stepsTotal: number;
  remainingCredits: number;
  canRun: boolean;
  running: boolean;
  onRun: () => void;
}) {
  const {
    clients,
    clientId,
    setClientId,
    selectedClient,
    clientUrl,
    setClientUrl,
    clientLabel,
    setClientLabel,
    todayAuditExists,
    competitors,
    setCompetitors,
    saveForLater,
    setSaveForLater,
    stepsTotal,
    remainingCredits,
    canRun,
    running,
    onRun,
  } = props;

  const insufficient = stepsTotal > remainingCredits;

  return (
    <div className="vt-card p-6 space-y-5">
      {/* Client selector */}
      <div>
        <label className="text-xs font-medium text-[color:var(--muted)] uppercase tracking-wide">
          Client
        </label>
        <select
          value={clientId ?? ""}
          onChange={(e) => setClientId(e.target.value || null)}
          className="mt-1 w-full bg-[color:var(--navy)] border border-[color:var(--border)] rounded-md px-3 py-2 text-sm"
        >
          <option value="">Select a client…</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.domain ? `· ${c.domain}` : ""}
              {c.latest_audit_score != null ? ` · ${c.latest_audit_score}/100` : ""}
            </option>
          ))}
        </select>
      </div>

      {selectedClient && (
        <div className="rounded-md bg-[color:var(--slate)]/30 p-3 text-sm space-y-1">
          <div className="font-medium">{selectedClient.name}</div>
          <div className="text-xs text-[color:var(--muted)]">
            {selectedClient.domain ?? "—"}{" "}
            {selectedClient.latest_audit_score != null
              ? `· Latest score ${selectedClient.latest_audit_score}/100 (${new Date(selectedClient.latest_audit_at).toLocaleDateString()})`
              : "· No audits yet"}
          </div>
          {!selectedClient.latest_audit_at && (
            <p className="text-xs text-amber-300">
              No audits exist — a new one runs automatically as part of this analysis.
            </p>
          )}
          {todayAuditExists && (
            <p className="text-xs text-emerald-400">
              Using today's audit — no new credit used.
            </p>
          )}
        </div>
      )}

      {/* Client URL & Label */}
      {clientId && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-[color:var(--muted)]">Page URL</label>
            <input
              type="url"
              value={clientUrl}
              onChange={(e) => setClientUrl(e.target.value)}
              placeholder="https://example.com/page"
              className="mt-1 w-full bg-[color:var(--navy)] border border-[color:var(--border)] rounded-md px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[color:var(--muted)]">Page label</label>
            <input
              type="text"
              value={clientLabel}
              onChange={(e) => setClientLabel(e.target.value)}
              placeholder="Home"
              className="mt-1 w-full bg-[color:var(--navy)] border border-[color:var(--border)] rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}

      {/* Competitors */}
      {clientId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[color:var(--muted)] uppercase tracking-wide">
              Competitors (max 4)
            </label>
            <button
              type="button"
              onClick={() => {
                if (competitors.length >= 4) return;
                setCompetitors([...competitors, { name: "", url: "" }]);
              }}
              disabled={competitors.length >= 4}
              title={competitors.length >= 4 ? "Maximum 4 competitors" : "Add competitor"}
              className="text-xs inline-flex items-center gap-1 text-[color:var(--accent)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="h-3 w-3" /> Add Competitor
            </button>
          </div>
          {competitors.map((c, i) => {
            const v = c.url ? validateAuditUrl(c.url) : { valid: true };
            return (
              <div key={i} className="flex flex-col sm:flex-row gap-2 items-start">
                <input
                  type="text"
                  placeholder="Name (optional)"
                  value={c.name}
                  onChange={(e) => {
                    const next = [...competitors];
                    next[i] = { ...next[i], name: e.target.value };
                    setCompetitors(next);
                  }}
                  className="flex-1 bg-[color:var(--navy)] border border-[color:var(--border)] rounded-md px-3 py-2 text-sm"
                />
                <input
                  type="url"
                  placeholder="https://competitor.com"
                  value={c.url}
                  onChange={(e) => {
                    const next = [...competitors];
                    next[i] = { ...next[i], url: e.target.value };
                    setCompetitors(next);
                  }}
                  className={`flex-[2] bg-[color:var(--navy)] border rounded-md px-3 py-2 text-sm ${
                    !v.valid && c.url ? "border-red-500/60" : "border-[color:var(--border)]"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = competitors.filter((_, j) => j !== i);
                    setCompetitors(next.length ? next : [{ name: "", url: "" }]);
                  }}
                  className="text-[color:var(--muted)] hover:text-red-400 p-2"
                  aria-label="Remove competitor"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          <label className="flex items-center gap-2 text-xs text-[color:var(--muted)] pt-1">
            <input
              type="checkbox"
              checked={saveForLater}
              onChange={(e) => setSaveForLater(e.target.checked)}
            />
            Save these competitors for next time
          </label>
        </div>
      )}

      {/* Credit cost */}
      {clientId && (
        <div
          className={`rounded-md p-3 text-sm border ${
            insufficient
              ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
              : "border-[color:var(--border)] bg-[color:var(--slate)]/30"
          }`}
        >
          This analysis uses <strong>{stepsTotal} audit credits</strong> (1 client +{" "}
          {competitors.length} competitor{competitors.length === 1 ? "" : "s"} + 1 synthesis).
          You have <strong>{remainingCredits}</strong> credits remaining today.
          {insufficient && (
            <div className="mt-1 font-medium">
              Not enough credits — wait for the daily reset or upgrade your plan.
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onRun}
        disabled={!canRun || running}
        className="vt-btn-primary inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        Run Market Share Analysis →
      </button>
    </div>
  );
}

// ============================================================
// PROGRESS
// ============================================================
function ProgressCard({
  job,
  competitors,
  isPartial,
  onResume,
  resuming,
  onCancel,
}: {
  job: any;
  competitors: any[];
  isPartial: boolean;
  onResume: () => void;
  resuming: boolean;
  onCancel: () => void;
}) {
  const pct = job.steps_total ? Math.round((job.steps_completed / job.steps_total) * 100) : 0;
  return (
    <div className="vt-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isPartial ? (
            <Pause className="h-5 w-5 text-amber-400" />
          ) : (
            <Loader2 className="h-5 w-5 text-[color:var(--accent)] animate-spin" />
          )}
          <h2 className="font-semibold">
            {isPartial ? "Analysis paused" : "Analysis in progress…"}
          </h2>
        </div>
        <span className="text-xs text-[color:var(--muted)]">
          Step {job.steps_completed}/{job.steps_total}
        </span>
      </div>
      <div className="w-full h-2 rounded bg-[color:var(--slate)] overflow-hidden">
        <div
          className={`h-full transition-all ${
            isPartial ? "bg-amber-400" : "bg-[color:var(--accent)]"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm text-[color:var(--muted)]">{job.current_step_label ?? ""}</p>

      {/* Live competitor cards */}
      {competitors.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {competitors.map((c) => (
            <CompetitorCard key={c.id} competitor={c} />
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        {isPartial && (
          <button
            className="vt-btn-primary inline-flex items-center gap-2"
            onClick={onResume}
            disabled={resuming}
          >
            {resuming ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            Resume Analysis →
          </button>
        )}
        <button className="vt-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================================
// RESULTS VIEW
// ============================================================
function ResultsView({
  clientName,
  clientAudit,
  competitors,
  synthesis,
  onDownloadPdf,
  pdfBusy,
}: {
  clientName: string;
  clientAudit: any;
  competitors: any[];
  synthesis: string;
  onDownloadPdf: () => void;
  pdfBusy: boolean;
}) {
  const sections = useMemo(() => parseSynthesis(synthesis), [synthesis]);
  const chartData = useMemo(() => {
    const rows: any[] = [];
    if (clientAudit)
      rows.push({
        name: clientName,
        score: clientAudit.score ?? 0,
        isClient: true,
        source: "your-client",
      });
    for (const c of competitors) {
      rows.push({
        name: c.name || c.domain || domainOf(c.page_url),
        score: c.score ?? 0,
        isClient: false,
        source: c.data_source,
      });
    }
    return rows;
  }, [clientAudit, competitors, clientName]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-emerald-400">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-semibold">Market share analysis complete</span>
        </div>
        <button
          onClick={onDownloadPdf}
          disabled={pdfBusy}
          className="vt-btn-secondary inline-flex items-center gap-2 disabled:opacity-50"
        >
          {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download Market Share Report PDF
        </button>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {clientAudit && (
          <div className="vt-card p-4 border-[color:var(--accent)]">
            <div className="text-[10px] uppercase tracking-wider text-[color:var(--accent)] font-semibold">
              Your Client
            </div>
            <div className="text-base font-semibold mt-1">{clientName}</div>
            <div className="text-xs text-[color:var(--muted)] truncate">{clientAudit.page_url}</div>
            <div className="text-3xl font-bold mt-2 text-[color:var(--accent)]">
              {clientAudit.score}
              <span className="text-sm text-[color:var(--muted)]"> /100</span>
            </div>
            <div className="text-xs text-[color:var(--muted)] mt-1">{clientAudit.rating}</div>
          </div>
        )}
        {competitors.map((c) => (
          <CompetitorCard key={c.id} competitor={c} />
        ))}
      </div>

      {/* Benchmark chart */}
      <div className="vt-card p-5">
        <h2 className="text-sm font-semibold mb-3">CRO Score Benchmark</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} angle={-15} textAnchor="end" />
            <YAxis stroke="#94a3b8" fontSize={11} domain={[0, 100]} />
            <Tooltip
              contentStyle={{
                background: "#0A1628",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Bar dataKey="score" radius={[6, 6, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.isClient ? "#4F8CFF" : scoreColor(d.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[color:var(--muted)]">
          {competitors.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1">
              <span className="font-medium">{c.name || c.domain}:</span>
              <DataSourceBadge source={c.data_source} />
            </span>
          ))}
        </div>
      </div>

      {/* Synthesis sections */}
      {sections.position && (
        <Section title="Market Position">
          <p className="text-sm whitespace-pre-wrap text-[color:var(--light)]/90">
            {sections.position}
          </p>
        </Section>
      )}

      {sections.gaps && (
        <Section title="Competitive CRO Gaps">
          <div className="space-y-3">
            {sections.gaps.map((g, i) => (
              <div key={i} className="rounded-md border border-[color:var(--border)] p-3">
                <div className="font-medium text-sm">{g.competitor}</div>
                <p className="text-xs whitespace-pre-wrap text-[color:var(--muted)] mt-1">{g.body}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {sections.opportunity && (
        <Section title="Revenue Opportunity">
          <p className="text-sm whitespace-pre-wrap text-[color:var(--light)]/90">
            {sections.opportunity}
          </p>
        </Section>
      )}

      {sections.roadmap && (
        <Section title="Market Share Recovery Roadmap">
          <div className="space-y-3">
            {sections.roadmap.map((r, i) => (
              <div key={i} className="rounded-md border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/5 p-3">
                <div className="font-medium text-sm">{r.title}</div>
                <p className="text-xs whitespace-pre-wrap text-[color:var(--muted)] mt-1">{r.body}</p>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="vt-card p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--accent)] mb-3">
        {title}
      </h2>
      {children}
    </div>
  );
}

function CompetitorCard({ competitor }: { competitor: any }) {
  const friction = parseTopFriction(competitor.output ?? "");
  return (
    <div className="vt-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{competitor.name || competitor.domain || domainOf(competitor.page_url)}</div>
          <div className="text-xs text-[color:var(--muted)] truncate">
            {competitor.domain ?? domainOf(competitor.page_url)}
          </div>
        </div>
        <DataSourceBadge source={competitor.data_source} />
      </div>
      <div className="flex items-baseline gap-1 mt-2">
        <span className="text-2xl font-bold" style={{ color: scoreColor(competitor.score ?? 0) }}>
          {competitor.score ?? "—"}
        </span>
        <span className="text-xs text-[color:var(--muted)]">/100 · {competitor.rating ?? ""}</span>
      </div>
      {competitor.traffic_est != null && (
        <div className="text-[10px] text-[color:var(--muted)] mt-1">
          ~{Number(competitor.traffic_est).toLocaleString()} sessions/mo
        </div>
      )}
      {friction.length > 0 && (
        <ul className="mt-3 space-y-1">
          {friction.slice(0, 3).map((f, i) => (
            <li key={i} className="text-xs">
              <span className="font-semibold" style={{ color: severityColor(f.severity) }}>
                [{f.severity}]
              </span>{" "}
              {f.title}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DataSourceBadge({ source }: { source: string }) {
  const label =
    source === "semrush" ? "Semrush" : source === "dataforseo" ? "DataForSEO" : "AI Estimate";
  const color =
    source === "semrush" ? "#10b981" : source === "dataforseo" ? "#0ea5e9" : "#f59e0b";
  return (
    <span
      className="text-[10px] px-2 py-0.5 rounded font-medium"
      style={{ background: `${color}22`, color }}
    >
      {label}
    </span>
  );
}

// ============================================================
// Helpers
// ============================================================
function scoreColor(s: number): string {
  if (s >= 75) return "#10b981";
  if (s >= 50) return "#4F8CFF";
  if (s >= 30) return "#f59e0b";
  return "#ef4444";
}
function severityColor(s: string): string {
  if (s === "CRITICAL") return "#ef4444";
  if (s === "HIGH") return "#f59e0b";
  if (s === "MEDIUM") return "#4F8CFF";
  return "#10b981";
}

function parseTopFriction(text: string): { severity: string; title: string; fix: string }[] {
  if (!text) return [];
  const sec = text.match(/#\s*(?:TOP\s*)?FRICTION POINTS\b[^\n]*\n([\s\S]*?)(?=\n#\s|$)/i)?.[1] ?? "";
  const out: { severity: string; title: string; fix: string }[] = [];
  const re = /##\s*(CRITICAL|HIGH|MEDIUM|LOW)\s*\|\s*([^\n]+)\n([\s\S]*?)(?=\n##\s|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sec)) !== null) {
    const fix = m[3].match(/Fix:\s*([\s\S]*?)$/i)?.[1]?.trim() ?? "";
    out.push({ severity: m[1].toUpperCase(), title: m[2].trim(), fix });
  }
  return out;
}

function parseSynthesis(text: string): {
  position: string;
  gaps: { competitor: string; body: string }[];
  opportunity: string;
  roadmap: { title: string; body: string }[];
} {
  const section = (n: string) => {
    const re = new RegExp(`#\\s*${n}\\b[^\\n]*\\n([\\s\\S]*?)(?=\\n#\\s|$)`, "i");
    return text.match(re)?.[1]?.trim() ?? "";
  };
  const position = section("MARKET POSITION");
  const gapsSec = section("COMPETITIVE CRO GAPS");
  const oppSec = section("REVENUE OPPORTUNITY");
  const roadmapSec = section("MARKET SHARE RECOVERY ROADMAP");

  const gaps: { competitor: string; body: string }[] = [];
  const gapRe = /##\s*([^\n]+)\n([\s\S]*?)(?=\n##\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = gapRe.exec(gapsSec)) !== null) {
    gaps.push({ competitor: m[1].trim(), body: m[2].trim() });
  }

  const roadmap: { title: string; body: string }[] = [];
  const rmRe = /##\s*([^\n]+)\n([\s\S]*?)(?=\n##\s|$)/g;
  let rm: RegExpExecArray | null;
  while ((rm = rmRe.exec(roadmapSec)) !== null) {
    roadmap.push({ title: rm[1].trim(), body: rm[2].trim() });
  }

  return { position, gaps, opportunity: oppSec, roadmap };
}
