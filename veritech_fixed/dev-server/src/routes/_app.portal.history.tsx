import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Legend,
} from "recharts";
import { Download, PlayCircle } from "lucide-react";
import { getMyScoreHistory } from "@/lib/portal.functions";
import { getPdfSignedUrl } from "@/lib/uploads.functions";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import type { ParsedAudit } from "@/lib/parse";

export const Route = createFileRoute("/_app/portal/history")({
  ssr: false,
  component: ScoreHistory,
});

const SERIES_COLORS = ["#4F8CFF", "#22c55e", "#a855f7", "#f59e0b", "#06b6d4", "#ec4899"];

function ScoreHistory() {
  const fn = useServerFn(getMyScoreHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["portal-history"],
    queryFn: () => fn(),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const audits = data.audits;

  if (audits.length === 0) {
    return (
      <div className="vt-card p-10 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Score history</h1>
        <p className="text-sm text-[color:var(--muted)] max-w-md mx-auto">
          No audits yet. Once you (or your agency) runs your first audit, your CRO score will
          start tracking here.
        </p>
        <Link to="/portal/audit" className="vt-btn-primary inline-flex">
          <PlayCircle className="h-4 w-4" /> Run first audit
        </Link>
      </div>
    );
  }

  if (audits.length === 1) {
    const a = audits[0];
    const color = scoreColor(a.score ?? 0);
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">Score history</h1>
        <div className="vt-card p-10 text-center space-y-4">
          <div className="inline-flex h-32 w-32 items-center justify-center rounded-full border-4 mx-auto"
            style={{ borderColor: color }}>
            <span className="text-4xl font-bold" style={{ color }}>{a.score ?? "—"}</span>
          </div>
          <div>
            <p className="font-semibold">{a.page_label}</p>
            <p className="text-xs text-[color:var(--muted)]">
              {new Date(a.created_at ?? Date.now()).toLocaleDateString()}
            </p>
          </div>
          <p className="text-sm text-[color:var(--muted)]">
            Run your next audit to start tracking your trend.
          </p>
          <Link to="/portal/audit" className="vt-btn-primary inline-flex">
            <PlayCircle className="h-4 w-4" /> Run Audit →
          </Link>
        </div>
      </div>
    );
  }

  // 2+ audits: per-page series.
  const labels = Array.from(new Set(audits.map((a) => a.page_label || "Page")));
  const allDates = Array.from(new Set(audits.map((a) =>
    new Date(a.created_at ?? Date.now()).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }),
  )));
  const chartData = allDates.map((date) => {
    const row: Record<string, string | number> = { date };
    for (const label of labels) {
      const match = audits.find((a) =>
        new Date(a.created_at ?? Date.now()).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }) === date
        && (a.page_label || "Page") === label,
      );
      if (match?.score != null) row[label] = match.score;
    }
    return row;
  });

  // Trend from last 3 audits, overall.
  const last3 = audits.slice(-3).map((a) => a.score ?? 0);
  const trend = computeTrend(last3);

  const selected = selectedId ? audits.find((a) => a.id === selectedId) : null;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Score history</h1>
          <p className="text-sm text-[color:var(--muted)] mt-1">{audits.length} audits tracked</p>
        </div>
        <TrendBadge trend={trend} />
      </header>

      <section className="vt-card p-6">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              onClick={(e) => {
                const pl = (e as any)?.activePayload?.[0];
                if (!pl) return;
                const date = pl.payload?.date;
                const label = pl.dataKey;
                const match = audits.find((a) =>
                  new Date(a.created_at ?? Date.now()).toLocaleDateString("en-ZA", { month: "short", day: "numeric" }) === date
                  && (a.page_label || "Page") === label,
                );
                if (match) setSelectedId(match.id);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
              <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <ReferenceLine y={51} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "Average", fill: "#f59e0b", fontSize: 10 }} />
              <ReferenceLine y={66} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "Strong", fill: "#22c55e", fontSize: 10 }} />
              {labels.map((label, i) => (
                <Line
                  key={label}
                  type="monotone"
                  dataKey={label}
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 4, cursor: "pointer" }}
                  activeDot={{ r: 6 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {selected && <AuditSummaryPanel audit={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function AuditSummaryPanel({ audit, onClose }: { audit: any; onClose: () => void }) {
  const parsed = audit.parsed_data as ParsedAudit | null;
  const signFn = useServerFn(getPdfSignedUrl);
  const toast = useToast();
  const [working, setWorking] = useState(false);

  async function download() {
    setWorking(true);
    try {
      const { url } = await signFn({ data: { auditId: audit.id } });
      if (!url) throw new Error("PDF not generated yet. Open the audit detail and click Generate.");
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally { setWorking(false); }
  }

  return (
    <section className="vt-card p-6 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">{audit.page_label || "Audit"}</h3>
          <p className="text-xs text-[color:var(--muted)]">
            {new Date(audit.created_at ?? Date.now()).toLocaleString()} · Score {audit.score ?? "—"}
          </p>
        </div>
        <button onClick={onClose} className="text-xs text-[color:var(--muted)] hover:text-white">
          Close ✕
        </button>
      </header>

      {parsed && parsed.frictionPoints.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wide text-[color:var(--muted)] mb-2">Top friction points</p>
          <ul className="space-y-1.5 text-sm">
            {parsed.frictionPoints.slice(0, 3).map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[color:var(--accent)]">•</span>
                <span><strong>{f.severity}</strong> · {f.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Link to="/portal/audits/$id" params={{ id: audit.id }} className="vt-btn-primary">
          Open full report →
        </Link>
        <button onClick={download} disabled={working} className="vt-btn-secondary">
          <Download className="h-4 w-4" /> {working ? "Opening…" : "Download PDF"}
        </button>
      </div>
    </section>
  );
}

function TrendBadge({ trend }: { trend: "improving" | "declining" | "stable" }) {
  const colors = {
    improving: { bg: "rgba(34,197,94,0.15)", text: "var(--green)", label: "↑ Improving" },
    declining: { bg: "rgba(239,68,68,0.15)", text: "var(--red)", label: "↓ Declining" },
    stable: { bg: "rgba(148,163,184,0.15)", text: "var(--muted)", label: "→ Stable" },
  }[trend];
  return (
    <span className="rounded-full px-3 py-1 text-sm font-semibold"
      style={{ background: colors.bg, color: colors.text }}>{colors.label}</span>
  );
}

function computeTrend(scores: number[]): "improving" | "declining" | "stable" {
  if (scores.length < 2) return "stable";
  const first = scores[0];
  const last = scores[scores.length - 1];
  if (last - first >= 3) return "improving";
  if (first - last >= 3) return "declining";
  return "stable";
}

function scoreColor(score: number) {
  if (score >= 81) return "var(--green)";
  if (score >= 66) return "var(--teal)";
  if (score >= 51) return "var(--accent)";
  if (score >= 30) return "var(--amber)";
  return "var(--red)";
}
