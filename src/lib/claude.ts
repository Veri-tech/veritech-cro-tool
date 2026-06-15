// Claude prompt builder for Veritech CRO Audits.
export interface AuditPromptInput {
  clientName: string;
  pageUrl: string;
  pageLabel: string;
  industry: string;
  trafficVolume: number;
  aov: number;
  // Enhanced context
  pageGoal?: string;
  targetAudience?: string;
  primaryCta?: string;
  deviceSplit?: string;
  topTrafficSources?: string;
  competitorUrls?: string;
  additionalContext?: string;
}

export interface AnalyticsData {
  ga4?: {
    sessions: number;
    users: number;
    conversion_rate: number;
    bounce_rate: number;
  };
  gsc?: {
    clicks: number;
    impressions: number;
    avg_ctr: number;
    avg_position: number;
  };
}

export function buildAuditPrompt(
  input: AuditPromptInput,
  previousAudit?: string | null,
  analyticsData?: AnalyticsData | null,
): string {
  const blocks: string[] = [];

  if (analyticsData?.ga4 || analyticsData?.gsc) {
    blocks.push("REAL CLIENT DATA — use for all calculations:");
    if (analyticsData.ga4) {
      const g = analyticsData.ga4;
      blocks.push(
        `GA4 (last 30 days): sessions=${g.sessions} users=${g.users} conversion_rate=${g.conversion_rate}% bounce_rate=${g.bounce_rate}%`,
      );
    }
    if (analyticsData.gsc) {
      const s = analyticsData.gsc;
      blocks.push(
        `GSC (last 30 days): clicks=${s.clicks} impressions=${s.impressions} avg_ctr=${s.avg_ctr}% avg_position=${s.avg_position}`,
      );
    }
    blocks.push("Do not use generic estimates when real figures provided.\n");
  }

  const contextBlocks: string[] = [
    `You are a senior CRO (Conversion Rate Optimisation) analyst auditing a live web page for ${input.clientName}.`,
    `Industry: ${input.industry}`,
    `Page label: ${input.pageLabel}`,
    `Page URL: ${input.pageUrl}`,
    `Monthly traffic to this page: ${input.trafficVolume.toLocaleString()} sessions`,
    `Average order value (ZAR): R${input.aov.toLocaleString()}`,
  ];

  if (input.pageGoal) contextBlocks.push(`Page goal: ${input.pageGoal}`);
  if (input.targetAudience) contextBlocks.push(`Target audience: ${input.targetAudience}`);
  if (input.primaryCta) contextBlocks.push(`Primary CTA: ${input.primaryCta}`);
  if (input.deviceSplit) contextBlocks.push(`Device split: ${input.deviceSplit}`);
  if (input.topTrafficSources) contextBlocks.push(`Top traffic sources: ${input.topTrafficSources}`);
  if (input.competitorUrls) contextBlocks.push(`Competitor URLs to benchmark against: ${input.competitorUrls}`);
  if (input.additionalContext) contextBlocks.push(`Additional context: ${input.additionalContext}`);

  contextBlocks.push(
    "",
    "All revenue figures MUST be in South African Rand (R), calculated from real traffic × AOV × estimated lift. Be specific to the page content (no generic boilerplate).",
    "",
  );

  blocks.push(...contextBlocks);

  if (previousAudit) {
    const trimmed = previousAudit.slice(0, 3000);
    blocks.push(
      "PREVIOUS AUDIT (for cross-reference; mark unfixed issues with ⚠️ RECURRING):",
      "```",
      trimmed,
      "```",
      "",
    );
  }

  blocks.push(
    "Return your audit using EXACTLY the following section headers and structure (markdown not required, plain text headings):",
    "",
    "# CRO SCORE",
    "[1-100]",
    "",
    "# RATING",
    "[Critical|Poor|Average|Good|Excellent]",
    "",
    "# EXECUTIVE SUMMARY",
    "[2-3 paragraphs covering the page's biggest CRO problems and the headline opportunity]",
    "",
    "# FRICTION POINTS",
    "## [CRITICAL|HIGH|MEDIUM|LOW] | [Issue Title]",
    "Fix: [recommendation]",
    "Revenue Impact: R[amount] per month",
    "[Append ⚠️ RECURRING on its own line if this issue appeared in the previous audit]",
    "",
    "(Repeat the friction point block for at least 5 issues, ordered by severity.)",
    "",
    "# REVENUE SCENARIOS",
    "Conservative (10% lift): R[amount]",
    "Moderate (20% lift): R[amount]",
    "Optimistic (35% lift): R[amount]",
    "",
    "# A/B TEST HYPOTHESES",
    "## Hypothesis 1: [Title]",
    "[Description]",
    "## Hypothesis 2: [Title]",
    "[Description]",
    "## Hypothesis 3: [Title]",
    "[Description]",
    "",
    "# ACTION PLAN",
    "1. [action]",
    "2. [action]",
    "3. [action]",
    "4. [action]",
    "5. [action]",
  );

  if (previousAudit) {
    blocks.push(
      "",
      "# PROGRESS TRACKER",
      "✅ FIXES COMPLETED: [n]",
      "⚠️ STILL OUTSTANDING: [n]",
      "🆕 NEW ISSUES FOUND: [n]",
      "📊 RECOMMENDATIONS ACTIONED: [n]%",
      "[Narrative paragraph comparing this audit to the previous one]",
    );
  }

  return blocks.join("\n");
}
