import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { Download, FileText, Loader2, PlayCircle, Sparkles } from "lucide-react";
import { getPortalHome } from "@/lib/portal.functions";
import { getPdfSignedUrl, savePdfUrl } from "@/lib/uploads.functions";
import { generateAuditPdf } from "@/lib/pdf";
import { supabase } from "@/integrations/supabase/client";
import { ClientOnboardingDialog } from "@/components/ClientOnboardingDialog";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import type { ParsedAudit } from "@/lib/parse";
import { AuditProgressionDashboard, type ProgressionAuditRow } from "@/components/AuditProgressionDashboard";

export const Route = createFileRoute("/_app/portal/")({
  ssr: false,
  validateSearch: (s) => z.object({ onboarding: z.string().optional() }).parse(s),
  component: PortalHome,
});

function PortalHome() {
  const fn = useServerFn(getPortalHome);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["portal-home"],
    queryFn: () => fn(),
    refetchInterval: 30_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const client = data.client;
  const audits = data.audits;
  const remaining = Math.max(0, data.dailyLimit - data.auditsToday);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">
          Welcome back, {client.contact_name ?? "there"}
        </h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          {client.name} {client.domain && `· ${client.domain}`}
        </p>
      </header>

      {audits.length === 0 ? (
        <EmptyState client={client} />
      ) : audits.length === 1 ? (
        <FirstAuditState audit={audits[0]} clientName={client.name} refetch={refetch} />
      ) : (
        <ProgressionState audits={audits} clientName={client.name} refetch={refetch} />
      )}

      <RecentReportsList audits={audits} refetch={refetch} clientName={client.name} agencyName="Veritech" />

      <div className="text-xs text-[color:var(--muted)] font-mono text-right">
        {remaining} audits remaining today
      </div>

      <ClientOnboardingDialog companyName={client.name} />
    </div>
  );
}

function EmptyState({ client }: { client: any }) {
  return (
    <div className="vt-card p-10 text-center space-y-4">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[color:var(--accent)]/15 text-[color:var(--accent)] mx-auto">
        <Sparkles className="h-7 w-7" />
      </div>
      <h2 className="text-xl font-semibold">No audits yet</h2>
      <p className="text-sm text-[color:var(--muted)] max-w-md mx-auto">
        Your agency will run your first audit soon, or you can request one yourself.
      </p>
      <p className="text-xs text-[color:var(--muted)]">
        Industry benchmark — most {client.industry || "sites"} score between
        <strong> 45–65</strong> on their first audit.
      </p>
      <div className="flex justify-center gap-2">
        <Link to="/portal/audit" className="vt-btn-primary">
          <PlayCircle className="h-4 w-4 mr-1" /> Run my first audit
        </Link>
      </div>
    </div>
  );
}

function FirstAuditState({ audit, clientName, refetch }: { audit: any; clientName: string; refetch: () => void }) {
  const parsed = audit.parsed_data as ParsedAudit | null;
  const score = audit.score ?? 0;
  const color = scoreColor(score);

  return (
    <section className="vt-card p-6 sm:p-8 space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 items-center">
        <div
          className="flex h-32 w-32 sm:h-40 sm:w-40 mx-auto items-center justify-center rounded-full border-4"
          style={{ borderColor: color }}
        >
          <span className="text-4xl sm:text-5xl font-bold" style={{ color }}>{score}</span>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{audit.page_label || "Your first audit"}</h2>
          <p className="text-sm text-[color:var(--muted)]">{audit.rating ?? "Rated"}</p>
          {parsed && (
            <p className="text-sm text-[color:var(--light)]/90 line-clamp-3">
              {parsed.executiveSummary}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <Link
              to="/portal/audits/$id"
              params={{ id: audit.id }}
              className="vt-btn-primary"
            >
              View full report →
            </Link>
            <PdfButton audit={audit} clientName={clientName} refetch={refetch} />
          </div>
        </div>
      </div>
      <div className="border-t border-[color:var(--border)] pt-4 text-xs text-[color:var(--muted)]">
        Benchmarks — Below 50: friction-heavy · 51–65: average · 66–80: strong · 81+: best in class
      </div>
    </section>
  );
}

function ProgressionState({ audits, clientName, refetch }: { audits: any[]; clientName: string; refetch: () => void }) {
  const navigate = useNavigate();
  const handlePointClick = (auditId: string) => {
    const el = document.getElementById(`report-${auditId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-[color:var(--accent)]");
      setTimeout(() => el.classList.remove("ring-2", "ring-[color:var(--accent)]"), 2000);
    }
  };
  return (
    <AuditProgressionDashboard
      audits={audits as ProgressionAuditRow[]}
      rightChart="friction"
      onPointClick={handlePointClick}
    />
  );
}

function RecentReportsList({
  audits, refetch, clientName, agencyName,
}: { audits: any[]; refetch: () => void; clientName: string; agencyName: string }) {
  const [page, setPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pageFilter, setPageFilter] = useState("");
  const [minScore, setMinScore] = useState("");
  const [maxScore, setMaxScore] = useState("");

  const filtered = useMemo(() => {
    return audits.filter((a) => {
      if (dateFrom && new Date(a.created_at ?? 0) < new Date(dateFrom)) return false;
      if (dateTo && new Date(a.created_at ?? 0) > new Date(dateTo + "T23:59:59")) return false;
      if (pageFilter && !(a.page_label ?? "").toLowerCase().includes(pageFilter.toLowerCase())) return false;
      const s = a.score ?? 0;
      if (minScore && s < Number(minScore)) return false;
      if (maxScore && s > Number(maxScore)) return false;
      return true;
    });
  }, [audits, dateFrom, dateTo, pageFilter, minScore, maxScore]);

  const perPage = 20;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const visible = filtered.slice((page - 1) * perPage, page * perPage);

  if (audits.length === 0) return null;

  return (
    <section className="vt-card p-6 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold">Previous reports</h3>
        <span className="text-xs text-[color:var(--muted)] font-mono">
          {filtered.length} of {audits.length}
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
        <input type="date" className="vt-input text-xs" value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} placeholder="From" />
        <input type="date" className="vt-input text-xs" value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }} placeholder="To" />
        <input className="vt-input text-xs" placeholder="Page label" value={pageFilter}
          onChange={(e) => { setPageFilter(e.target.value); setPage(1); }} />
        <input type="number" min="0" max="100" className="vt-input text-xs" placeholder="Min score" value={minScore}
          onChange={(e) => { setMinScore(e.target.value); setPage(1); }} />
        <input type="number" min="0" max="100" className="vt-input text-xs" placeholder="Max score" value={maxScore}
          onChange={(e) => { setMaxScore(e.target.value); setPage(1); }} />
      </div>

      <ul className="divide-y divide-[color:var(--border)]">
        {visible.length === 0 && (
          <li className="py-4 text-center text-sm text-[color:var(--muted)]">No reports match.</li>
        )}
        {visible.map((a) => (
          <li key={a.id} id={`report-${a.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3 rounded-md transition-shadow">
            <div className="min-w-0">
              <Link
                to="/portal/audits/$id"
                params={{ id: a.id }}
                className="font-medium hover:text-[color:var(--accent)]"
              >
                {a.page_label || "Audit"}
              </Link>
              <p className="text-xs text-[color:var(--muted)]">
                {new Date(a.created_at ?? Date.now()).toLocaleString()}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <ScoreBadge score={a.score ?? 0} />
              <PdfButton audit={a} clientName={clientName} refetch={refetch} compact />
            </div>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="vt-btn-secondary">← Prev</button>
          <span>Page {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="vt-btn-secondary">Next →</button>
        </div>
      )}
    </section>
  );
}

function PdfButton({ audit, clientName, refetch, compact }: { audit: any; clientName: string; refetch: () => void; compact?: boolean }) {
  const [working, setWorking] = useState(false);
  const [pollingPdf, setPollingPdf] = useState(false);
  const qc = useQueryClient();
  const signFn = useServerFn(getPdfSignedUrl);
  const saveUrlFn = useServerFn(savePdfUrl);
  const toast = useToast();

  // Poll for 'running' audits with no pdf_url for up to 2 minutes.
  useEffect(() => {
    if (audit.pdf_url || audit.status !== "completed" || !audit.parsed_data) return;
    if (!pollingPdf) return;
    const t = setInterval(() => { refetch(); }, 10_000);
    return () => clearInterval(t);
  }, [audit.pdf_url, audit.status, audit.parsed_data, pollingPdf, refetch]);

  async function handleClick() {
    setWorking(true);
    try {
      if (audit.pdf_url) {
        const { url } = await signFn({ data: { auditId: audit.id } });
        if (!url) throw new Error("No PDF available");
        window.open(url, "_blank");
        return;
      }
      // Generate on demand.
      const parsed = audit.parsed_data as ParsedAudit | null;
      if (!parsed) throw new Error("Report not parsed");
      const blob = generateAuditPdf(parsed, {
        clientName,
        pageLabel: audit.page_label ?? "Audit",
        pageUrl: audit.page_url ?? "",
        createdAt: audit.created_at ?? new Date().toISOString(),
        agencyName: "Veritech Digital",
      });
      const path = `${audit.agency_id ?? "client"}/${audit.client_id ?? "x"}/${audit.id}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("audit-reports").upload(path, blob, { upsert: true, contentType: "application/pdf" });
      if (upErr) throw upErr;
      await saveUrlFn({ data: { auditId: audit.id, path } }).catch(() => {/* client role can't save; ignore */});
      const { url } = await signFn({ data: { auditId: audit.id } });
      if (url) window.open(url, "_blank");
      toast.success("PDF generated.");
      qc.invalidateQueries({ queryKey: ["portal-home"] });
      setPollingPdf(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF failed");
    } finally {
      setWorking(false);
    }
  }

  const label = audit.pdf_url ? "Download PDF" : "Generate PDF";
  return (
    <button onClick={handleClick} disabled={working}
      className={compact ? "vt-btn-secondary text-xs" : "vt-btn-secondary"}>
      {working ? <Loader2 className="h-4 w-4 animate-spin" /> :
        audit.pdf_url ? <Download className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      {compact ? (audit.pdf_url ? "PDF" : "Generate") : label}
    </button>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = scoreColor(score);
  return (
    <span className="rounded-full px-3 py-1 text-sm font-bold font-mono"
      style={{ background: `${color}20`, color }}>{score}</span>
  );
}

function scoreColor(score: number) {
  if (score >= 81) return "var(--green)";
  if (score >= 66) return "var(--teal)";
  if (score >= 51) return "var(--accent)";
  if (score >= 30) return "var(--amber)";
  return "var(--red)";
}
