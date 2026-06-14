import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine, BarChart, Bar, PieChart, Pie, Cell, Legend,
} from "recharts";
import { formatZar, severityColor, type ParsedAudit, type FrictionPoint } from "@/lib/parse";

export type ProgressionAuditRow = {
  id: string;
  score: number | null;
  revenue_low: number | null;
  revenue_high: number | null;
  critical_count: number | null;
  created_at: string | null;
  page_label: string | null;
  parsed_data: ParsedAudit | null;
};

const tooltipStyle = {
  background: "#0A1628",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 6,
  fontSize: 12,
} as const;

const SEV_COLOR: Record<string, string> = {
  CRITICAL: "#EF4444",
  HIGH: "#F59E0B",
  MEDIUM: "#4F8CFF",
  LOW: "#22C55E",
};

function fmtDate(d: string | null) {
  return new Date(d ?? Date.now()).toLocaleDateString("en-ZA", { month: "short", day: "numeric" });
}

function StatCard({
  label, value, valueColor, accent,
}: { label: string; value: string; valueColor?: string; accent?: React.ReactNode }) {
  return (
    <div className="vt-card p-4">
      <div className="text-xs uppercase tracking-wide text-[color:var(--muted)]">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold font-mono" style={{ color: valueColor }}>{value}</span>
        {accent}
      </div>
    </div>
  );
}

export function AuditProgressionDashboard({
  audits,
  rightChart = "conversion",
  onPointClick,
}: {
  audits: ProgressionAuditRow[];
  rightChart?: "conversion" | "friction";
  onPointClick?: (auditId: string) => void;
}) {
  const asc = useMemo(
    () => [...audits].sort((a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()),
    [audits],
  );
  const latest = asc[asc.length - 1];
  const prior = asc[asc.length - 2];
  const latestScore = latest?.score ?? 0;
  const priorScore = prior?.score ?? null;
  const delta = priorScore != null ? latestScore - priorScore : null;

  const last3 = asc.slice(-3).map((a) => a.score ?? 0);
  let trend = { label: "Stable", color: "var(--muted)" };
  if (last3.length >= 2) {
    const diff = last3[last3.length - 1] - last3[0];
    if (diff > 2) trend = { label: "Improving", color: "var(--green)" };
    else if (diff < -2) trend = { label: "Declining", color: "var(--red)" };
  }

  const fixesActioned = asc.reduce(
    (s, a) => s + (a.parsed_data?.progressTracker?.fixesCompleted ?? 0), 0,
  );
  const revenueRecovered = (prior?.revenue_low != null && latest?.revenue_low != null)
    ? Math.max(0, (prior.revenue_low ?? 0) - (latest.revenue_low ?? 0)) : 0;

  const scoreData = asc.map((a) => ({
    id: a.id, date: fmtDate(a.created_at), score: a.score ?? 0,
  }));
  const firstScore = asc[0]?.score ?? 0;
  const lineColor = latestScore > firstScore ? "#22C55E" : latestScore < firstScore ? "#EF4444" : "#4F8CFF";

  const revenueData = asc.map((a) => ({
    date: fmtDate(a.created_at),
    Conservative: a.parsed_data?.revenueScenarios?.conservative ?? 0,
    Moderate: a.parsed_data?.revenueScenarios?.moderate ?? 0,
    Optimistic: a.parsed_data?.revenueScenarios?.optimistic ?? 0,
  }));

  const crData = asc.map((a) => ({
    date: fmtDate(a.created_at),
    "Current CR": Number((((a.score ?? 0) / 100) * 5).toFixed(2)),
    Industry: 2.5,
    "Top Quartile": 5,
  }));

  const latestFriction: FrictionPoint[] = latest?.parsed_data?.frictionPoints ?? [];
  const sevCounts = latestFriction.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc;
  }, {});
  const pieData = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const)
    .filter((k) => (sevCounts[k] ?? 0) > 0)
    .map((k) => ({ name: k, value: sevCounts[k] }));

  const recurring = latestFriction.filter((f) => f.recurring);

  return (
    <div className="space-y-6">
      {/* Row 1 — stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Latest CRO Score"
          value={`${latestScore}/100`}
          accent={delta != null && delta !== 0 ? (
            <span className="text-sm font-semibold" style={{ color: delta > 0 ? "var(--green)" : "var(--red)" }}>
              {delta > 0 ? "↑" : "↓"} {Math.abs(delta)}
            </span>
          ) : null}
        />
        <StatCard label="Trend" value={trend.label} valueColor={trend.color} />
        <StatCard label="Fixes Actioned" value={String(fixesActioned)} />
        <StatCard label="Revenue Recovered" value={formatZar(revenueRecovered)} />
      </div>

      {/* Row 2 — Score History */}
      <section className="vt-card p-4 sm:p-6">
        <h3 className="text-lg font-semibold mb-3">Score History</h3>
        <div style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <LineChart
              data={scoreData}
              onClick={(e: any) => {
                const id = e?.activePayload?.[0]?.payload?.id;
                if (onPointClick && id) onPointClick(id);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
              <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
              <Tooltip contentStyle={tooltipStyle} />
              <ReferenceLine y={51} stroke="#94a3b8" strokeDasharray="4 4"
                label={{ value: "Average", fill: "#94a3b8", fontSize: 10, position: "insideTopRight" }} />
              <ReferenceLine y={66} stroke="#94a3b8" strokeDasharray="4 4"
                label={{ value: "Good", fill: "#94a3b8", fontSize: 10, position: "insideTopRight" }} />
              <Line type="monotone" dataKey="score" stroke={lineColor} strokeWidth={2}
                dot={{ r: 4, cursor: onPointClick ? "pointer" : "default" }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Row 3 — 50/50 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="vt-card p-4 sm:p-6">
          <h3 className="text-lg font-semibold mb-3">Revenue Opportunity</h3>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => formatZar(Number(v))} width={80} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => formatZar(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Conservative" stroke="#94a3b8" />
                <Line type="monotone" dataKey="Moderate" stroke="#4F8CFF" strokeWidth={2} />
                <Line type="monotone" dataKey="Optimistic" stroke="#22C55E" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {rightChart === "conversion" ? (
          <section className="vt-card p-4 sm:p-6">
            <h3 className="text-lg font-semibold mb-3">Conversion Rate Gap</h3>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={crData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="date" stroke="#94a3b8" fontSize={11} />
                  <YAxis domain={[0, 8]} stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: any) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Current CR" fill="#4F8CFF" />
                  <Bar dataKey="Industry" fill="#94a3b8" />
                  <Bar dataKey="Top Quartile" fill="#22C55E" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        ) : (
          <section className="vt-card p-4 sm:p-6">
            <h3 className="text-lg font-semibold mb-3">Friction Breakdown (latest)</h3>
            <div style={{ width: "100%", height: 260 }}>
              {pieData.length === 0 ? (
                <p className="text-sm text-[color:var(--muted)]">No friction points in latest audit.</p>
              ) : (
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={80} label>
                      {pieData.map((d) => <Cell key={d.name} fill={SEV_COLOR[d.name]} />)}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Row 4 — Recurring issues */}
      {recurring.length > 0 && (
        <section className="vt-card p-4 sm:p-6 border-l-4 border-l-[color:var(--amber)]">
          <h3 className="text-base font-semibold mb-3">
            ⚠️ Recurring issues — these have appeared in multiple audits and remain unfixed
          </h3>
          <ul className="space-y-3">
            {recurring.map((f, i) => (
              <li key={i} className="rounded-md bg-[color:var(--navy)] p-3">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-medium">{f.title}</span>
                  <span className="rounded-md px-2 py-0.5 text-xs font-medium text-white"
                    style={{ background: severityColor(f.severity) }}>{f.severity}</span>
                </div>
                <div className="text-xs text-[color:var(--muted)]">
                  Revenue impact: {formatZar(f.revenueImpact)}/month
                </div>
                {f.fix && <div className="text-sm mt-1">{f.fix}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Friction Pie used in single-audit (State 1) view */
export function FrictionPie({ frictionPoints }: { frictionPoints: FrictionPoint[] }) {
  const counts = frictionPoints.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc;
  }, {});
  const data = (["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const)
    .filter((k) => (counts[k] ?? 0) > 0)
    .map((k) => ({ name: k, value: counts[k] }));
  if (data.length === 0) return null;
  return (
    <section className="vt-card p-4 sm:p-6">
      <h3 className="text-lg font-semibold mb-3">Friction Breakdown</h3>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" outerRadius={80} label>
              {data.map((d) => <Cell key={d.name} fill={SEV_COLOR[d.name]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/** Industry comparison bar chart for State 1 */
export function IndustryComparisonBar({ score }: { score: number }) {
  const data = [
    { name: "Your Score", value: score, fill: "#4F8CFF" },
    { name: "Industry Avg", value: 52, fill: "#94a3b8" },
    { name: "Top Quartile", value: 72, fill: "#22C55E" },
  ];
  return (
    <section className="vt-card p-4 sm:p-6">
      <h3 className="text-lg font-semibold mb-3">Industry Comparison</h3>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} />
            <YAxis domain={[0, 100]} stroke="#94a3b8" fontSize={11} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((d) => <Cell key={d.name} fill={d.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/** Big circular score gauge */
export function ScoreGauge({ score }: { score: number }) {
  const color = score >= 81 ? "#22C55E" : score >= 66 ? "#14B8A6" : score >= 51 ? "#4F8CFF" : score >= 30 ? "#F59E0B" : "#EF4444";
  const r = 70; const c = 2 * Math.PI * r;
  const dash = (score / 100) * c;
  return (
    <section className="vt-card p-6 flex flex-col items-center text-center">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r={r} stroke="rgba(255,255,255,0.08)" strokeWidth="14" fill="none" />
        <circle cx="90" cy="90" r={r} stroke={color} strokeWidth="14" fill="none"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          transform="rotate(-90 90 90)" />
        <text x="90" y="98" textAnchor="middle" fontSize="36" fontWeight="bold" fill={color}>{score}</text>
      </svg>
      <p className="text-sm text-[color:var(--muted)] mt-3">
        Baseline set. Run next audit in 30 days to track progress.
      </p>
    </section>
  );
}
