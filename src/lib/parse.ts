// Best-effort parser for Claude audit output.
export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export interface FrictionPoint {
  severity: Severity;
  title: string;
  fix: string;
  revenueImpact: number;
  recurring: boolean;
}

export interface RevenueScenarios {
  conservative: number;
  moderate: number;
  optimistic: number;
}

export interface ABTest {
  title: string;
  description: string;
}

export interface ProgressTracker {
  fixesCompleted: number;
  stillOutstanding: number;
  newIssuesFound: number;
  percentActioned: number;
  narrative: string;
}

export interface ParsedAudit {
  score: number;
  rating: string;
  executiveSummary: string;
  frictionPoints: FrictionPoint[];
  revenueScenarios: RevenueScenarios;
  abTests: ABTest[];
  actionPlan: string[];
  progressTracker: ProgressTracker | null;
}

function parseRand(input: string): number {
  const m = input.replace(/[, ]/g, "").match(/R?(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : 0;
}

function section(text: string, name: string): string {
  const re = new RegExp(`#\\s*${name}\\b[^\\n]*\\n([\\s\\S]*?)(?=\\n#\\s|$)`, "i");
  const m = text.match(re);
  return m ? m[1].trim() : "";
}

export function parseAuditOutput(text: string): ParsedAudit {
  const scoreSec = section(text, "CRO SCORE");
  const scoreMatch = scoreSec.match(/\d{1,3}/);
  const score = scoreMatch ? Math.min(100, Math.max(0, Number(scoreMatch[0]))) : 0;

  const rating = section(text, "RATING").split("\n")[0]?.trim() || "Average";
  const executiveSummary = section(text, "EXECUTIVE SUMMARY");

  // Friction points: parse "## SEVERITY | Title" blocks within FRICTION POINTS section.
  const friction = section(text, "FRICTION POINTS");
  const frictionPoints: FrictionPoint[] = [];
  const blockRe = /##\s*(CRITICAL|HIGH|MEDIUM|LOW)\s*\|\s*([^\n]+)\n([\s\S]*?)(?=\n##\s|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(friction)) !== null) {
    const severity = m[1].toUpperCase() as Severity;
    const title = m[2].trim();
    const body = m[3];
    const fixMatch = body.match(/Fix:\s*([\s\S]*?)(?=\n[A-Z]|\nRevenue|$)/i);
    const revMatch = body.match(/Revenue Impact:\s*([^\n]+)/i);
    frictionPoints.push({
      severity,
      title,
      fix: (fixMatch?.[1] ?? "").trim(),
      revenueImpact: revMatch ? parseRand(revMatch[1]) : 0,
      recurring: /RECURRING/i.test(body),
    });
  }
  const severityOrder: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  frictionPoints.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const scenSec = section(text, "REVENUE SCENARIOS");
  const conservative = parseRand(scenSec.match(/Conservative[^\n]*?(R[\d, ]+)/i)?.[1] ?? "0");
  const moderate = parseRand(scenSec.match(/Moderate[^\n]*?(R[\d, ]+)/i)?.[1] ?? "0");
  const optimistic = parseRand(scenSec.match(/Optimistic[^\n]*?(R[\d, ]+)/i)?.[1] ?? "0");

  const abSec = section(text, "A/B TEST HYPOTHESES");
  const abTests: ABTest[] = [];
  const abRe = /##\s*Hypothesis\s*\d+:\s*([^\n]+)\n([\s\S]*?)(?=\n##\s|$)/gi;
  let am: RegExpExecArray | null;
  while ((am = abRe.exec(abSec)) !== null) {
    abTests.push({ title: am[1].trim(), description: am[2].trim() });
  }

  const planSec = section(text, "ACTION PLAN");
  const actionPlan = planSec
    .split("\n")
    .map((l) => l.replace(/^\s*\d+\.\s*/, "").trim())
    .filter(Boolean);

  let progressTracker: ProgressTracker | null = null;
  const progSec = section(text, "PROGRESS TRACKER");
  if (progSec) {
    const num = (re: RegExp) => Number(progSec.match(re)?.[1] ?? 0);
    progressTracker = {
      fixesCompleted: num(/FIXES COMPLETED:\s*(\d+)/i),
      stillOutstanding: num(/STILL OUTSTANDING:\s*(\d+)/i),
      newIssuesFound: num(/NEW ISSUES FOUND:\s*(\d+)/i),
      percentActioned: num(/RECOMMENDATIONS ACTIONED:\s*(\d+)/i),
      narrative: progSec
        .split("\n")
        .filter((l) => !/^[✅⚠️🆕📊]/.test(l) && l.trim())
        .join(" ")
        .trim(),
    };
  }

  return {
    score,
    rating,
    executiveSummary,
    frictionPoints,
    revenueScenarios: { conservative, moderate, optimistic },
    abTests,
    actionPlan,
    progressTracker,
  };
}

export function severityColor(s: Severity): string {
  return s === "CRITICAL" ? "var(--red)" : s === "HIGH" ? "var(--amber)" : s === "MEDIUM" ? "var(--accent)" : "var(--green)";
}

export function formatZar(n: number): string {
  return "R " + Math.round(n).toLocaleString("en-ZA");
}
