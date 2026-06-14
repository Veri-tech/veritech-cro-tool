import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, PlayCircle, ArrowLeft, Loader2, Check, X } from "lucide-react";
import { getClientDetail, addCompetitor, removeCompetitor, setArchived } from "@/lib/clients.functions";
import { adminTestIntegration, adminDisconnectIntegration } from "@/lib/integrations-admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/Skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import {
  AuditProgressionDashboard, FrictionPie, IndustryComparisonBar, ScoreGauge,
  type ProgressionAuditRow,
} from "@/components/AuditProgressionDashboard";
import { formatZar } from "@/lib/parse";

export const Route = createFileRoute("/_app/dashboard/clients/$id")({
  ssr: false,
  component: ClientDetail,
});

function ClientDetail() {
  const { id } = Route.useParams();
  const fetchFn = useServerFn(getClientDetail);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: () => fetchFn({ data: { id } }),
  });

  if (isLoading) return <div className="max-w-6xl mx-auto space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!data) return <div className="max-w-6xl mx-auto py-12 text-center text-[color:var(--muted)]">Client not found.</div>;

  const { client, audits, competitors, pendingRequests, completedAudits } = data as any;
  const lastAudit = audits[0];
  const noteDate = client.note_date ? new Date(client.note_date) : null;
  const reminderDue = noteDate && noteDate.getTime() <= Date.now();
  const daysSinceLast = lastAudit?.created_at ? Math.floor((Date.now() - new Date(lastAudit.created_at).getTime()) / 86400_000) : null;

  const [filterLabel, setFilterLabel] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  let filteredAudits = [...audits];
  if (filterLabel) filteredAudits = filteredAudits.filter((a: any) => a.page_label === filterLabel);
  if (filterStatus) filteredAudits = filteredAudits.filter((a: any) => a.status === filterStatus);
  if (sortOrder === "asc") filteredAudits.reverse();
  const totalPages = Math.max(1, Math.ceil(filteredAudits.length / PAGE_SIZE));
  const pageAudits = filteredAudits.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const labelOptions = [...new Set(audits.map((a: any) => a.page_label).filter(Boolean))] as string[];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Link to="/dashboard/clients" className="inline-flex items-center gap-1 text-sm text-[color:var(--accent)] hover:underline">
        <ArrowLeft className="h-4 w-4" /> All clients
      </Link>

      {/* Header */}
      <div className="vt-card p-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{client.name}</h1>
          {client.domain && <p className="text-sm text-[color:var(--accent)]">{client.domain}</p>}
          <div className="mt-2 text-sm text-[color:var(--muted)] space-y-1">
            {client.industry && <div>Industry: {client.industry}</div>}
            {client.contact_name && <div>Contact: {client.contact_name} {client.contact_email && `• ${client.contact_email}`}</div>}
            <div>Monthly traffic: {client.monthly_traffic?.toLocaleString() ?? "—"} · AOV: R{client.avg_order_value?.toLocaleString() ?? "—"}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/dashboard/audit" search={{ client: client.id }} className="vt-btn-primary inline-flex items-center gap-2">
            <PlayCircle className="h-4 w-4" /> Run New Audit
          </Link>
          <ArchiveBtn id={client.id} archived={!!client.archived} onDone={() => qc.invalidateQueries({ queryKey: ["client", id] })} />
        </div>
      </div>

      {reminderDue && (
        <div className="vt-card border-l-4 border-l-[color:var(--amber)] p-4 text-sm">
          ⏰ Audit reminder: {daysSinceLast} days since last audit. <Link to="/dashboard/audit" search={{ client: client.id }} className="text-[color:var(--accent)] underline">Run a new audit →</Link>
        </div>
      )}

      {pendingRequests.length > 0 && (
        <div className="vt-card p-4 border-l-4 border-l-[color:var(--accent)]">
          <h3 className="font-semibold mb-2">Pending audit requests from client</h3>
          <ul className="text-sm space-y-1">
            {pendingRequests.map((r: any) => <li key={r.id}>{r.page_label || r.page_url} — {new Date(r.created_at).toLocaleDateString()}</li>)}
          </ul>
        </div>
      )}

      {/* Analytics dashboard */}
      <AnalyticsSection
        clientId={client.id}
        industry={client.industry}
        completedAudits={completedAudits as ProgressionAuditRow[]}
        latestCritical={lastAudit?.score != null ? (audits.find((a: any) => a.status === "completed")?.critical_count ?? null) : null}
      />

      {/* Audit history */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Audit history</h2>
        <div className="flex flex-wrap gap-3 items-center mb-3 text-sm">
          <select
            value={filterLabel}
            onChange={(e) => { setFilterLabel(e.target.value); setPage(0); }}
            className="bg-[color:var(--navy)] border border-[color:var(--border)] rounded-md px-2 py-1.5"
          >
            <option value="">All pages</option>
            {labelOptions.map((label) => (
              <option key={label} value={label}>{label}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}
            className="bg-[color:var(--navy)] border border-[color:var(--border)] rounded-md px-2 py-1.5"
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="running">Running</option>
            <option value="failed">Failed</option>
          </select>
          <select
            value={sortOrder}
            onChange={(e) => { setSortOrder(e.target.value as "desc" | "asc"); setPage(0); }}
            className="bg-[color:var(--navy)] border border-[color:var(--border)] rounded-md px-2 py-1.5"
          >
            <option value="desc">Newest first</option>
            <option value="asc">Oldest first</option>
          </select>
          <span className="text-xs text-[color:var(--muted)] ml-auto">
            Showing {pageAudits.length} of {filteredAudits.length} audits
          </span>
        </div>
        <div className="vt-card overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="bg-[color:var(--navy)] text-[color:var(--muted)] text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Page</th>
                <th className="px-4 py-3 text-left">URL</th>
                <th className="px-4 py-3 text-left">Score</th>
                <th className="px-4 py-3 text-left">Initiated by</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {pageAudits.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-[color:var(--muted)]">No audits match the current filters.</td></tr>}
              {pageAudits.map((a: any) => (
                <tr key={a.id} className="border-t border-[color:var(--border)] hover:bg-[color:var(--navy)]/60">
                  <td className="px-4 py-3">{new Date(a.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">{a.page_label || "—"}</td>
                  <td className="px-4 py-3 text-[color:var(--muted)] truncate max-w-[200px]">{a.page_url}</td>
                  <td className="px-4 py-3">{a.score != null ? <Score s={a.score} /> : "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    <span className="rounded-md bg-[color:var(--slate)] px-2 py-0.5">{a.initiated_by ?? "agency"}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    {a.status === "completed" && (
                      <Link to="/dashboard/audits/$id" params={{ id: a.id }} className="text-[color:var(--accent)] hover:underline text-xs">View →</Link>
                    )}
                    <button
                      className="text-xs text-[color:var(--muted)] hover:text-[color:var(--light)]"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/dashboard/audits/${a.id}`);
                        toast.success("Report link copied");
                      }}
                    >
                      Copy link
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-3 text-sm">
            <button
              className="vt-btn-secondary px-3 py-1 disabled:opacity-40"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >← Previous</button>
            <span className="text-[color:var(--muted)]">Page {page + 1} of {totalPages}</span>
            <button
              className="vt-btn-secondary px-3 py-1 disabled:opacity-40"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >Next →</button>
          </div>
        )}
      </section>

      {/* Competitor benchmark chart */}
      <CompetitorBenchmarkChart
        clientName={client.name}
        clientScore={lastAudit?.score ?? null}
        competitors={competitors}
      />

      {/* Competitors */}
      <CompetitorsSection clientId={client.id} competitors={competitors} />

      <ClientIntegrationsSection clientId={client.id} />

    </div>
  );
}

function Score({ s }: { s: number }) {
  const c = s >= 81 ? "var(--green)" : s >= 66 ? "var(--teal)" : s >= 51 ? "var(--accent)" : s >= 30 ? "var(--amber)" : "var(--red)";
  return <span className="inline-flex h-6 min-w-[2.25rem] items-center justify-center rounded-md px-2 text-xs font-bold text-white" style={{ background: c }}>{s}</span>;
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    completed: "var(--green)", running: "var(--accent)", retrying: "var(--amber)", failed: "var(--red)",
  };
  return <span className="rounded-md px-2 py-0.5 text-white" style={{ background: map[status ?? ""] ?? "var(--muted)" }}>{status ?? "—"}</span>;
}

function ArchiveBtn({ id, archived, onDone }: { id: string; archived: boolean; onDone: () => void }) {
  const fn = useServerFn(setArchived);
  const m = useMutation({
    mutationFn: () => fn({ data: { id, archived: !archived } }),
    onSuccess: () => { toast.success(archived ? "Restored" : "Archived"); onDone(); },
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="vt-btn-secondary">{archived ? "Restore" : "Archive"}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{archived ? "Restore client?" : "Archive client?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {archived ? "Client will reappear in your active list." : "Archived clients are hidden from the main list but their history is preserved."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => m.mutate()}>{archived ? "Restore" : "Archive"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CompetitorsSection({ clientId, competitors }: { clientId: string; competitors: any[] }) {
  const qc = useQueryClient();
  const addFn = useServerFn(addCompetitor);
  const rmFn = useServerFn(removeCompetitor);
  const [domain, setDomain] = useState("");
  const [name, setName] = useState("");

  const add = useMutation({
    mutationFn: () => addFn({ data: { clientId, domain: domain.trim(), name: name.trim() || null } }),
    onSuccess: () => { toast.success("Competitor added"); setDomain(""); setName(""); qc.invalidateQueries({ queryKey: ["client", clientId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="vt-card p-6">
      <h2 className="text-lg font-semibold mb-3">Competitors</h2>
      {competitors.length === 0 && <p className="text-sm text-[color:var(--muted)] mb-3">No competitors added yet.</p>}
      <ul className="space-y-2 mb-4">
        {competitors.map((c) => (
          <li key={c.id} className="flex items-center justify-between rounded-md bg-[color:var(--navy)] px-3 py-2 text-sm">
            <div>
              <div className="font-medium">{c.name || c.domain}</div>
              <div className="text-xs text-[color:var(--muted)]">{c.domain}</div>
            </div>
            <div className="flex items-center gap-3">
              {c.latest_score != null && <Score s={c.latest_score} />}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="text-[color:var(--muted)] hover:text-[color:var(--red)]" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {c.domain}?</AlertDialogTitle>
                  <AlertDialogDescription>Deletes all competitor audit history. This cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-[color:var(--red)] hover:bg-[color:var(--red)]/90"
                    onClick={async () => { await rmFn({ data: { id: c.id } }); toast.success("Removed"); qc.invalidateQueries({ queryKey: ["client", clientId] }); }}
                  >Remove</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            </div>
          </li>
        ))}
      </ul>
      <form className="flex flex-wrap gap-2 items-end" onSubmit={(e) => { e.preventDefault(); if (domain.trim().length < 3) return toast.error("Domain required"); add.mutate(); }}>
        <div className="flex-1 min-w-[180px]"><Label className="text-xs text-[color:var(--muted)]">Domain</Label><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="competitor.com" /></div>
        <div className="flex-1 min-w-[180px]"><Label className="text-xs text-[color:var(--muted)]">Name (optional)</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button type="submit" className="vt-btn-primary" disabled={add.isPending}><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </form>
    </section>
  );
}

function CompetitorBenchmarkChart({
  clientName,
  clientScore,
  competitors,
}: {
  clientName: string;
  clientScore: number | null;
  competitors: any[];
}) {
  const scored = competitors.filter((c) => c.latest_score != null);
  if (clientScore == null && scored.length === 0) return null;
  const data: any[] = [];
  if (clientScore != null) data.push({ name: clientName, score: clientScore, isClient: true });
  for (const c of scored) data.push({ name: c.name || c.domain, score: c.latest_score, isClient: false });
  const color = (s: number) => (s >= 75 ? "#10b981" : s >= 50 ? "#4F8CFF" : s >= 30 ? "#f59e0b" : "#ef4444");
  return (
    <section className="vt-card p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Competitor Benchmark</h2>
        <Link
          to="/dashboard/market-share"
          search={{ client: scored.length === 0 ? undefined : undefined }}
          className="text-xs text-[color:var(--accent)] hover:underline"
        >
          Run market share analysis →
        </Link>
      </div>
      {scored.length === 0 ? (
        <p className="text-sm text-[color:var(--muted)]">
          Run a market share analysis to populate competitor scores.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data} margin={{ top: 8, right: 10, left: -10, bottom: 24 }}>
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
              {data.map((d, i) => (
                <Cell key={i} fill={d.isClient ? "#4F8CFF" : color(d.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </section>
  );
}

const PROVIDERS: { key: "google" | "gsc" | "semrush" | "dataforseo"; label: string }[] = [
  { key: "google", label: "Google Analytics 4" },
  { key: "gsc", label: "Google Search Console" },
  { key: "semrush", label: "Semrush" },
  { key: "dataforseo", label: "DataForSEO" },
];

function ClientIntegrationsSection({ clientId }: { clientId: string }) {
  const qc = useQueryClient();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["client-integrations", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_integrations_safe")
        .select("*")
        .eq("client_id", clientId);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const byProvider = new Map<string, any>();
  for (const r of rows ?? []) byProvider.set(r.provider as string, r);

  return (
    <section className="vt-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Integrations</h2>
        <p className="text-xs text-[color:var(--muted)]">
          Ask your client to connect from their portal.
        </p>
      </div>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PROVIDERS.map((p) => (
            <IntegrationCard
              key={p.key}
              clientId={clientId}
              provider={p.key}
              label={p.label}
              row={byProvider.get(p.key) ?? null}
              onChanged={() => qc.invalidateQueries({ queryKey: ["client-integrations", clientId] })}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function IntegrationCard({
  clientId,
  provider,
  label,
  row,
  onChanged,
}: {
  clientId: string;
  provider: "google" | "gsc" | "semrush" | "dataforseo";
  label: string;
  row: any | null;
  onChanged: () => void;
}) {
  const testFn = useServerFn(adminTestIntegration);
  const disconnectFn = useServerFn(adminDisconnectIntegration);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const connected = !!(row?.has_credentials && row?.status === "active");
  const expired = !!row?.has_credentials && row?.status !== "active";

  const test = useMutation({
    mutationFn: async () => testFn({ data: { clientId, provider } }),
    onSuccess: (r: any) => {
      setResult(r);
      if (r?.ok) toast.success(`${label}: ${r.message}`);
      else toast.error(`${label}: ${r?.message ?? "Test failed"}`);
      onChanged();
    },
    onError: (e: Error) => {
      setResult({ ok: false, message: e.message });
      toast.error(e.message);
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => disconnectFn({ data: { clientId, provider } }),
    onSuccess: () => {
      toast.success(`${label} disconnected`);
      setResult(null);
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  let badge: { text: string; color: string };
  if (connected) badge = { text: "Connected", color: "var(--green)" };
  else if (expired) badge = { text: "Needs reconnection", color: "var(--amber)" };
  else badge = { text: "Not connected", color: "var(--muted)" };

  return (
    <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--navy)] p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-medium truncate">{label}</div>
          {row?.account_email && (
            <div className="text-xs text-[color:var(--muted)] truncate">{row.account_email}</div>
          )}
          {row?.last_synced_at && (
            <div className="text-xs text-[color:var(--muted)]">
              Last synced {new Date(row.last_synced_at).toLocaleDateString()}
            </div>
          )}
          {row?.last_error && (
            <div className="text-xs text-[color:var(--red)] mt-1 line-clamp-2">{row.last_error}</div>
          )}
        </div>
        <span
          className="rounded-md px-2 py-0.5 text-xs font-medium text-white shrink-0"
          style={{ background: badge.color }}
        >
          {badge.text}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {row?.has_credentials ? (
          <>
            <Button
              size="sm"
              variant="outline"
              className="vt-btn-secondary"
              disabled={test.isPending}
              onClick={() => test.mutate()}
            >
              {test.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Test connection"
              )}
            </Button>
            {result && !test.isPending && (
              <span
                className="inline-flex items-center gap-1 text-xs"
                style={{ color: result.ok ? "var(--green)" : "var(--red)" }}
              >
                {result.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                {result.ok ? "OK" : "Failed"}
              </span>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="vt-btn-secondary">
                  Disconnect
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Disconnect {label}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Stored credentials will be deleted. The client will need to reconnect from their portal.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-[color:var(--red)] hover:bg-[color:var(--red)]/90"
                    onClick={() => disconnect.mutate()}
                  >
                    Disconnect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <Link to="/portal/connect" className="text-xs text-[color:var(--accent)] hover:underline">
            Connect tools →
          </Link>
        )}
      </div>
    </div>
  );
}


function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="vt-card p-4">
      <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-bold font-mono">{value}</div>
      {sub && <div className="text-xs text-[color:var(--muted)] mt-1">{sub}</div>}
    </div>
  );
}

function AnalyticsSection({
  clientId,
  industry,
  completedAudits,
  latestCritical,
}: {
  clientId: string;
  industry: string | null;
  completedAudits: ProgressionAuditRow[];
  latestCritical: number | null;
}) {
  const count = completedAudits.length;

  if (count === 0) {
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatTile label={`Avg CRO Score · ${industry || "your industry"}`} value="52/100" />
          <StatTile label="Industry avg conversion rate" value="2.5%" />
          <StatTile label="Top quartile conversion rate" value="5%" />
          <StatTile label="Avg monthly revenue at risk / 10k visitors" value="R85,000" />
        </div>
        <div className="vt-card p-6 text-center space-y-3">
          <p className="text-sm text-[color:var(--muted)]">
            Run your first audit to replace these with real data.
          </p>
          <Link to="/dashboard/audit" search={{ client: clientId } as any} className="vt-btn-primary inline-flex items-center gap-2">
            <PlayCircle className="h-4 w-4" /> Run First Audit →
          </Link>
        </div>
      </section>
    );
  }

  if (count === 1) {
    const a = completedAudits[0];
    const score = a.score ?? 0;
    const parsed = a.parsed_data;
    const diff = score - 52;
    const diffLabel = diff >= 0 ? `+${diff} above average` : `${diff} below average`;
    return (
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Analytics</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="vt-card p-4">
            <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">CRO Score</div>
            <div className="mt-2"><Score s={score} /></div>
            <div className="text-xs text-[color:var(--muted)] mt-2">out of 100</div>
          </div>
          <StatTile label="Revenue at Risk" value={`${formatZar(a.revenue_high ?? 0)}/mo`} />
          <StatTile label="Critical Issues" value={String(latestCritical ?? a.critical_count ?? 0)} />
          <StatTile label="vs Industry" value={diffLabel} sub="(Avg = 52)" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ScoreGauge score={score} />
          <IndustryComparisonBar score={score} />
        </div>
        {parsed?.frictionPoints && parsed.frictionPoints.length > 0 && (
          <FrictionPie frictionPoints={parsed.frictionPoints} />
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold">Analytics</h2>
      <AuditProgressionDashboard audits={completedAudits} rightChart="conversion" />
    </section>
  );
}
