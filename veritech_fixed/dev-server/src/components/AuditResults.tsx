import { ParsedAudit, formatZar, severityColor } from "@/lib/parse";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";

export function AuditResults({ parsed, deltaScore }: { parsed: ParsedAudit; deltaScore?: number | null }) {
  return (
    <Tabs defaultValue="report" className="w-full">
      <TabsList className="grid w-full grid-cols-2 max-w-sm">
        <TabsTrigger value="report">Report</TabsTrigger>
        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
      </TabsList>
      <TabsContent value="report" className="mt-6">
        <ReportView parsed={parsed} deltaScore={deltaScore} />
      </TabsContent>
      <TabsContent value="dashboard" className="mt-6">
        <DashboardView parsed={parsed} />
      </TabsContent>
    </Tabs>
  );
}

function ReportView({ parsed, deltaScore }: { parsed: ParsedAudit; deltaScore?: number | null }) {
  const ratingColor =
    parsed.score >= 81 ? "var(--green)" :
    parsed.score >= 66 ? "var(--teal)" :
    parsed.score >= 51 ? "var(--accent)" :
    parsed.score >= 30 ? "var(--amber)" : "var(--red)";

  return (
    <div className="space-y-8">
      {/* Score header */}
      <div className="flex flex-col items-center gap-3 vt-card p-8">
        <div
          className="relative flex h-32 w-32 items-center justify-center rounded-full border-4"
          style={{ borderColor: ratingColor }}
        >
          <span className="text-4xl font-bold" style={{ color: ratingColor }}>{parsed.score}</span>
          <span className="absolute -bottom-2 right-0 rounded-md bg-[color:var(--navy)] px-2 py-0.5 text-xs">/ 100</span>
        </div>
        {deltaScore != null && deltaScore !== 0 && (
          <span
            className="rounded-full px-3 py-1 text-sm font-semibold"
            style={{
              background: deltaScore > 0 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
              color: deltaScore > 0 ? "var(--green)" : "var(--red)",
            }}
          >
            {deltaScore > 0 ? "↑" : "↓"} {Math.abs(deltaScore)} vs previous
          </span>
        )}
        <span className="text-lg font-semibold" style={{ color: ratingColor }}>{parsed.rating}</span>
      </div>

      {/* Progress tracker */}
      {parsed.progressTracker && (
        <section className="vt-card p-6 space-y-4">
          <h3 className="text-lg font-semibold">Progress since last audit</h3>
          <p className="text-sm text-[color:var(--muted)]">{parsed.progressTracker.narrative}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="✅ Fixes completed" value={parsed.progressTracker.fixesCompleted} />
            <Stat label="⚠️ Still outstanding" value={parsed.progressTracker.stillOutstanding} />
            <Stat label="🆕 New issues" value={parsed.progressTracker.newIssuesFound} />
            <Stat label="📊 Actioned" value={`${parsed.progressTracker.percentActioned}%`} />
          </div>
        </section>
      )}

      {/* Executive summary */}
      <section className="vt-card p-6">
        <h3 className="text-lg font-semibold mb-2">Executive summary</h3>
        <p className="text-sm whitespace-pre-line text-[color:var(--light)]/90 leading-relaxed">{parsed.executiveSummary}</p>
      </section>

      {/* Friction points */}
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">Friction points</h3>
        {parsed.frictionPoints.length === 0 && (
          <div className="vt-card p-6 text-sm text-[color:var(--muted)]">No friction points returned.</div>
        )}
        {parsed.frictionPoints.map((f, i) => (
          <article key={i} className="vt-card p-5 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white"
                style={{ background: severityColor(f.severity) }}
              >
                {f.severity}
              </span>
              {f.recurring && (
                <span className="rounded-md bg-[color:var(--amber)]/20 px-2 py-0.5 text-xs font-semibold text-[color:var(--amber)]">
                  ⚠️ RECURRING
                </span>
              )}
              <h4 className="text-base font-semibold">{f.title}</h4>
            </div>
            <p className="text-sm text-[color:var(--light)]/90"><span className="font-semibold">Fix:</span> {f.fix}</p>
            {f.revenueImpact > 0 && (
              <p className="text-sm text-[color:var(--green)] font-mono">+{formatZar(f.revenueImpact)} / month potential</p>
            )}
          </article>
        ))}
      </section>

      {/* Revenue scenarios */}
      <section>
        <h3 className="text-lg font-semibold mb-3">Revenue scenarios</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ScenarioCard name="Conservative" lift="10%" amount={parsed.revenueScenarios.conservative} color="var(--accent)" />
          <ScenarioCard name="Moderate" lift="20%" amount={parsed.revenueScenarios.moderate} color="var(--teal)" />
          <ScenarioCard name="Optimistic" lift="35%" amount={parsed.revenueScenarios.optimistic} color="var(--green)" />
        </div>
      </section>

      {/* A/B tests */}
      {parsed.abTests.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-3">A/B test hypotheses</h3>
          <div className="space-y-3">
            {parsed.abTests.map((t, i) => (
              <div key={i} className="vt-card p-5">
                <h4 className="font-semibold mb-1">{t.title}</h4>
                <p className="text-sm text-[color:var(--muted)] whitespace-pre-line">{t.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Action plan */}
      {parsed.actionPlan.length > 0 && (
        <section className="vt-card p-6">
          <h3 className="text-lg font-semibold mb-3">Priority action plan</h3>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            {parsed.actionPlan.map((a, i) => <li key={i}>{a}</li>)}
          </ol>
        </section>
      )}
    </div>
  );
}

const EFFORT_SCORE: Record<string, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1.5, LOW: 1 };
function effortScore(sev: string) {
  return EFFORT_SCORE[sev] ?? 1.5;
}

function DashboardView({ parsed }: { parsed: ParsedAudit }) {
  if (parsed.frictionPoints.length === 0) {
    return (
      <div className="vt-card p-8 text-center text-sm text-[color:var(--muted)]">
        Run the audit to generate dashboard data.
      </div>
    );
  }

  const matrixData = parsed.frictionPoints.map((fp) => ({
    name: fp.title,
    fix: fp.fix,
    impact: fp.revenueImpact,
    effort: effortScore(fp.severity),
    severity: fp.severity,
    recurring: fp.recurring,
    size: fp.recurring ? 12 : 8,
    color: severityColor(fp.severity),
  }));

  const revenueData = [
    { name: "Conservative", value: parsed.revenueScenarios.conservative, color: "var(--accent)" },
    { name: "Moderate", value: parsed.revenueScenarios.moderate, color: "var(--teal)" },
    { name: "Optimistic", value: parsed.revenueScenarios.optimistic, color: "var(--green)" },
  ];

  const sevCounts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
  for (const fp of parsed.frictionPoints) sevCounts[fp.severity] = (sevCounts[fp.severity] ?? 0) + 1;
  const pieData = [
    { name: "Critical", value: sevCounts.CRITICAL, color: "var(--red)" },
    { name: "High", value: sevCounts.HIGH, color: "var(--amber)" },
    { name: "Medium", value: sevCounts.MEDIUM, color: "var(--accent)" },
    { name: "Low", value: sevCounts.LOW, color: "var(--green)" },
  ].filter((s) => s.value > 0);
  const totalIssues = parsed.frictionPoints.length;

  return (
    <div className="space-y-6">
      {/* Chart 1 — Priority Matrix */}
      <section className="vt-card p-6">
        <h3 className="text-lg font-semibold mb-3">Fix Priority Matrix</h3>
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              type="number"
              dataKey="effort"
              name="Effort"
              domain={[0.5, 3.5]}
              ticks={[1, 1.5, 2, 3]}
              tickFormatter={(v) => (v === 1 ? "Low" : v === 1.5 ? "Med" : v === 2 ? "High" : v === 3 ? "Critical" : "")}
              stroke="#94a3b8"
              fontSize={11}
              label={{ value: "Effort", position: "insideBottom", offset: -10, fill: "#94a3b8", fontSize: 11 }}
            />
            <YAxis
              type="number"
              dataKey="impact"
              name="Revenue Impact (ZAR)"
              stroke="#94a3b8"
              fontSize={11}
              tickFormatter={(v) => formatZar(v)}
            />
            <ZAxis type="number" dataKey="size" range={[60, 220]} />
            <Tooltip
              cursor={{ strokeDasharray: "3 3" }}
              contentStyle={{
                background: "#0A1628",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                fontSize: 12,
              }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as any;
                return (
                  <div className="rounded-md border border-[color:var(--border)] bg-[color:var(--navy)] p-3 text-xs max-w-[260px]">
                    <div className="font-semibold mb-1">{d.name}</div>
                    <div className="text-[color:var(--muted)] mb-1 line-clamp-3">{d.fix}</div>
                    <div className="font-mono text-[color:var(--green)]">{formatZar(d.impact)}</div>
                  </div>
                );
              }}
            />
            <Scatter data={matrixData}>
              {matrixData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </section>

      {/* Chart 2 — Revenue Scenarios */}
      <section className="vt-card p-6">
        <h3 className="text-lg font-semibold mb-3">Monthly Revenue Opportunity</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={revenueData} margin={{ top: 8, right: 20, left: 10, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} />
            <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => formatZar(v)} />
            <Tooltip
              formatter={(v: number) => formatZar(v)}
              contentStyle={{
                background: "#0A1628",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 6,
                fontSize: 12,
              }}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {revenueData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Chart 3 — Friction Breakdown */}
      {pieData.length > 0 && (
        <section className="vt-card p-6">
          <h3 className="text-lg font-semibold mb-3">Issues by Severity</h3>
          <div className="relative">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
                >
                  {pieData.map((d, i) => (
                    <Cell key={i} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0A1628",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ marginTop: -20 }}>
              <div className="text-2xl font-bold">{totalIssues}</div>
              <div className="text-xs text-[color:var(--muted)]">total</div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--navy)] p-3">
      <div className="text-xs text-[color:var(--muted)]">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

function ScenarioCard({ name, lift, amount, color }: { name: string; lift: string; amount: number; color: string }) {
  return (
    <div className="vt-card p-5">
      <div className="text-sm text-[color:var(--muted)]">{name} ({lift} lift)</div>
      <div className="mt-2 text-2xl font-bold font-mono" style={{ color }}>{formatZar(amount)}</div>
      <div className="text-xs text-[color:var(--muted)] mt-1">per month</div>
    </div>
  );
}
