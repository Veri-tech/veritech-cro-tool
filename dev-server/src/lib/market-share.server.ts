// Server-only: market-share analysis engine.
// Runs sequentially (no Promise.all) with a 44s elapsed-time budget so
// partial progress survives Worker timeouts. Each step writes immediately.
import { decryptJSON } from "./crypto.server";

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const PRICE_INPUT_PER_M = 3;
const PRICE_OUTPUT_PER_M = 15;
const BUDGET_MS = 44_000;

export interface CompetitorInput {
  name?: string | null;
  url: string;
}

export interface CompetitorResult {
  id: string;
  competitor_id: string | null;
  name: string | null;
  domain: string;
  page_url: string;
  score: number;
  rating: string;
  output: string;
  traffic_est: number | null;
  data_source: "semrush" | "dataforseo" | "ai_estimate";
  top_friction: { severity: string; title: string; fix: string }[];
}

export interface ClientSnapshot {
  audit_id: string;
  page_url: string;
  page_label: string;
  score: number;
  rating: string;
  output: string;
  reused: boolean;
  tokens_input: number;
  tokens_output: number;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  }
}

// ---------- Claude HTTP ----------
async function callClaude(
  prompt: string,
  apiKey: string,
  maxTokens = 2400,
  timeoutMs = 25_000,
): Promise<{ text: string; tokens_input: number; tokens_output: number }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const err = await r.text().catch(() => "");
      throw new Error(`Claude ${r.status}: ${err.slice(0, 200)}`);
    }
    const j = (await r.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (j.content ?? []).map((c) => c.text ?? "").join("\n").trim();
    return {
      text,
      tokens_input: j.usage?.input_tokens ?? 0,
      tokens_output: j.usage?.output_tokens ?? 0,
    };
  } finally {
    clearTimeout(t);
  }
}

// ---------- Prompts ----------
export function buildCompetitorPrompt(args: {
  competitorName: string;
  competitorUrl: string;
  industry: string;
  clientName: string;
  clientUrl: string;
}): string {
  return [
    `You are a senior CRO analyst doing a short competitive audit of a competitor page.`,
    `Industry: ${args.industry}`,
    `Reference client: ${args.clientName} (${args.clientUrl})`,
    `Competitor: ${args.competitorName} (${args.competitorUrl})`,
    ``,
    `Return EXACTLY these sections (plain text):`,
    ``,
    `# CRO SCORE`,
    `[1-100]`,
    ``,
    `# RATING`,
    `[Critical|Poor|Average|Good|Excellent]`,
    ``,
    `# TOP FRICTION POINTS`,
    `## [CRITICAL|HIGH|MEDIUM|LOW] | [Issue Title]`,
    `Fix: [recommendation]`,
    ``,
    `(Provide up to 5 friction points ordered by severity. No revenue figures, no A/B tests, no action plan — keep it tight.)`,
  ].join("\n");
}

export function buildSynthesisPrompt(args: {
  clientName: string;
  clientUrl: string;
  clientScore: number;
  clientRating: string;
  clientTraffic: number;
  aov: number;
  competitors: {
    name: string;
    domain: string;
    score: number;
    rating: string;
    traffic: number | null;
    data_source: string;
  }[];
}): string {
  const blocks: string[] = [];
  blocks.push(
    `You are synthesising a market-share CRO benchmark for ${args.clientName}.`,
    `Industry context: e-commerce / lead-gen. All currency MUST be South African Rand (R).`,
    ``,
    `CLIENT:`,
    `- ${args.clientName} (${args.clientUrl}) — CRO score ${args.clientScore}/100 (${args.clientRating}) — ~${args.clientTraffic.toLocaleString()} monthly sessions — AOV R${args.aov.toLocaleString()}`,
    ``,
    `COMPETITORS:`,
  );
  for (const c of args.competitors) {
    blocks.push(
      `- ${c.name} (${c.domain}) — CRO score ${c.score}/100 (${c.rating}) — est. traffic ${
        c.traffic != null ? c.traffic.toLocaleString() : "unknown"
      } (source: ${c.data_source})`,
    );
  }
  blocks.push(
    ``,
    `Return EXACTLY these sections using these headings (no markdown styling needed):`,
    ``,
    `# MARKET POSITION`,
    `[2-3 paragraphs: where the client sits vs the competitive set, who is the leader, who is the threat]`,
    ``,
    `# COMPETITIVE CRO GAPS`,
    `## [Competitor Name]`,
    `Your score: [n] vs Their score: [n] — Gap: [n] points`,
    `Dimensions trailing: [comma-separated CRO dimensions, e.g. trust, urgency, mobile checkout]`,
    `Estimated monthly revenue at stake: R[amount]`,
    `(Repeat block for every competitor)`,
    ``,
    `# REVENUE OPPORTUNITY`,
    `Total addressable monthly market: R[amount]`,
    `Client capture rate now: [n]%`,
    `Gap to leader: [n]% / R[amount] per month`,
    ``,
    `# MARKET SHARE RECOVERY ROADMAP`,
    `## 1. [Intervention title]`,
    `Market share recovery: [n]%`,
    `Revenue value: R[amount] per month`,
    `Description: [1-2 sentences]`,
    `(Repeat for at least 4 ranked interventions, highest impact first.)`,
  );
  return blocks.join("\n");
}

// ---------- Parsers ----------
export function parseCompetitorOutput(text: string): {
  score: number;
  rating: string;
  friction: { severity: string; title: string; fix: string }[];
} {
  const section = (n: string) => {
    const re = new RegExp(`#\\s*${n}\\b[^\\n]*\\n([\\s\\S]*?)(?=\\n#\\s|$)`, "i");
    return text.match(re)?.[1]?.trim() ?? "";
  };
  const scoreM = section("CRO SCORE").match(/\d{1,3}/);
  const score = scoreM ? Math.min(100, Math.max(0, Number(scoreM[0]))) : 0;
  const rating = section("RATING").split("\n")[0]?.trim() || "Average";
  const fSec = section("TOP FRICTION POINTS");
  const blockRe = /##\s*(CRITICAL|HIGH|MEDIUM|LOW)\s*\|\s*([^\n]+)\n([\s\S]*?)(?=\n##\s|$)/gi;
  const friction: { severity: string; title: string; fix: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(fSec)) !== null) {
    const fix = m[3].match(/Fix:\s*([\s\S]*?)$/i)?.[1]?.trim() ?? "";
    friction.push({ severity: m[1].toUpperCase(), title: m[2].trim(), fix });
  }
  return { score, rating, friction };
}

// ---------- Traffic fallback chain ----------
export async function fetchCompetitorTraffic(
  supabaseAdmin: any,
  clientId: string,
  competitorDomain: string,
  anthropicKey: string,
): Promise<{ traffic: number | null; data_source: "semrush" | "dataforseo" | "ai_estimate" }> {
  const { data: rows } = await supabaseAdmin
    .from("client_integrations")
    .select("provider, manual_credentials, status, semrush_has_traffic_api")
    .eq("client_id", clientId)
    .in("provider", ["semrush", "dataforseo"])
    .eq("status", "active");

  const sem = rows?.find((r: any) => r.provider === "semrush");
  const dfs = rows?.find((r: any) => r.provider === "dataforseo");

  // 1. Semrush
  if (sem?.manual_credentials) {
    try {
      const creds = decryptJSON<any>(sem.manual_credentials);
      const url = `https://api.semrush.com/?type=domain_ranks&key=${encodeURIComponent(creds.apiKey)}&export_columns=Ot&domain=${encodeURIComponent(competitorDomain)}&database=us`;
      const r = await fetch(url);
      const txt = await r.text();
      if (r.ok && !txt.toLowerCase().includes("error")) {
        const lines = txt.trim().split("\n");
        const n = lines[1] ? Number(lines[1].split(";")[0]) : NaN;
        if (Number.isFinite(n) && n > 0) {
          return { traffic: Math.round(n), data_source: "semrush" };
        }
      }
    } catch { /* fall through */ }
  }

  // 2. DataForSEO
  if (dfs?.manual_credentials) {
    try {
      const creds = decryptJSON<any>(dfs.manual_credentials);
      const auth = "Basic " + Buffer.from(`${creds.login}:${creds.password}`).toString("base64");
      const r = await fetch(
        "https://api.dataforseo.com/v3/dataforseo_labs/google/domain_rank_overview/live",
        {
          method: "POST",
          headers: { authorization: auth, "content-type": "application/json" },
          body: JSON.stringify([{ target: competitorDomain, location_code: 2840, language_code: "en" }]),
        },
      );
      if (r.ok) {
        const j = (await r.json()) as any;
        const etv = j.tasks?.[0]?.result?.[0]?.items?.[0]?.metrics?.organic?.etv;
        if (Number.isFinite(etv) && etv > 0) {
          return { traffic: Math.round(etv), data_source: "dataforseo" };
        }
      }
    } catch { /* fall through */ }
  }

  // 3. AI estimate
  try {
    const prompt = `Estimate the monthly organic traffic (sessions) to ${competitorDomain}. Reply with a single integer only — no commentary, no units. If unknown, reply 0.`;
    const r = await callClaude(prompt, anthropicKey, 50, 15_000);
    const n = Number(r.text.replace(/[^0-9]/g, ""));
    return { traffic: Number.isFinite(n) && n > 0 ? n : null, data_source: "ai_estimate" };
  } catch {
    return { traffic: null, data_source: "ai_estimate" };
  }
}

// ---------- Logging helper ----------
async function logTokens(
  supabaseAdmin: any,
  agencyId: string,
  auditId: string | null,
  tokens_input: number,
  tokens_output: number,
) {
  const total = tokens_input + tokens_output;
  const cost =
    (tokens_input / 1_000_000) * PRICE_INPUT_PER_M +
    (tokens_output / 1_000_000) * PRICE_OUTPUT_PER_M;
  await supabaseAdmin.from("api_usage_log").insert({
    agency_id: agencyId,
    audit_id: auditId,
    tokens_input,
    tokens_output,
    tokens_total: total,
    cost_usd: cost,
  });
}

// ---------- Main sequential runner ----------
export async function executeMarketShareJob(args: {
  supabaseAdmin: any;
  anthropicKey: string;
  jobId: string;
  agencyId: string;
  clientId: string;
  clientName: string;
  clientUrl: string;
  clientLabel: string;
  industry: string;
  trafficVolume: number;
  aov: number;
  competitors: CompetitorInput[];
  startFromStep: number; // 0 = client audit, 1.. = competitor index+1
  resumedClientSnapshot?: ClientSnapshot | null;
}): Promise<{ status: "completed" | "partial" | "failed"; reason?: string }> {
  const { supabaseAdmin, anthropicKey } = args;
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;

  const setJob = async (patch: Record<string, any>) => {
    await supabaseAdmin
      .from("market_share_jobs")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", args.jobId);
  };

  const notify = async (notif: {
    type: "market_share_complete" | "market_share_partial";
    title: string;
    body: string;
    link: string;
  }) => {
    try {
      const { insertNotificationsForAgencyAdmins } = await import("./notifications.server");
      await insertNotificationsForAgencyAdmins(args.agencyId, notif);
    } catch (e) {
      console.warn("[market-share] notif failed", e);
    }
  };

  const stepsTotal = 1 + args.competitors.length + 1;

  try {
    // STEP 1: client audit (if not already done)
    let client: ClientSnapshot;
    if (args.startFromStep > 0 && args.resumedClientSnapshot) {
      client = args.resumedClientSnapshot;
    } else {
      // Try reuse today's audit
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const { data: existing } = await supabaseAdmin
        .from("audits")
        .select("id, page_url, page_label, score, rating, output")
        .eq("client_id", args.clientId)
        .eq("status", "completed")
        .gte("created_at", startOfDay.toISOString())
        .order("created_at", { ascending: false })
        .limit(5);

      const reuse = existing?.find((a: any) => a.page_url === args.clientUrl) ?? existing?.[0];

      if (reuse) {
        client = {
          audit_id: reuse.id,
          page_url: reuse.page_url,
          page_label: reuse.page_label,
          score: reuse.score ?? 0,
          rating: reuse.rating ?? "Average",
          output: reuse.output ?? "",
          reused: true,
          tokens_input: 0,
          tokens_output: 0,
        };
        await setJob({
          audit_id: reuse.id,
          steps_completed: 1,
          current_step_label: `Using today's existing audit (score ${client.score})`,
          status: "running",
        });
      } else {
        // Fresh client audit
        const { buildAuditPrompt } = await import("./claude");
        let analytics = null;
        try {
          const { gatherAnalyticsForAudit } = await import("./fetchers.server");
          analytics = await gatherAnalyticsForAudit(
            args.clientId,
            args.clientUrl,
            domainOf(args.clientUrl),
          );
        } catch { /* ignore */ }

        const prompt = buildAuditPrompt(
          {
            clientName: args.clientName,
            pageUrl: args.clientUrl,
            pageLabel: args.clientLabel,
            industry: args.industry,
            trafficVolume: args.trafficVolume,
            aov: args.aov,
          },
          null,
          analytics,
        );

        const { data: auditInsert, error: aErr } = await supabaseAdmin
          .from("audits")
          .insert({
            agency_id: args.agencyId,
            client_id: args.clientId,
            page_url: args.clientUrl,
            page_label: args.clientLabel,
            status: "running",
            initiated_by: "agency",
            traffic_at_run: args.trafficVolume,
            aov_at_run: args.aov,
          })
          .select("id")
          .single();
        if (aErr || !auditInsert) throw new Error(`Client audit insert failed: ${aErr?.message}`);

        const r = await callClaude(prompt, anthropicKey, 4000, 25_000);
        const { parseAuditOutput } = await import("./parse");
        const parsed = parseAuditOutput(r.text);

        await supabaseAdmin
          .from("audits")
          .update({
            status: "completed",
            output: r.text,
            parsed_data: parsed as any,
            score: parsed.score,
            rating: parsed.rating,
            friction_count: parsed.frictionPoints.length,
            critical_count: parsed.frictionPoints.filter((f) => f.severity === "CRITICAL").length,
            revenue_low: parsed.revenueScenarios.conservative,
            revenue_high: parsed.revenueScenarios.optimistic,
          })
          .eq("id", auditInsert.id);

        await logTokens(supabaseAdmin, args.agencyId, auditInsert.id, r.tokens_input, r.tokens_output);

        client = {
          audit_id: auditInsert.id,
          page_url: args.clientUrl,
          page_label: args.clientLabel,
          score: parsed.score,
          rating: parsed.rating,
          output: r.text,
          reused: false,
          tokens_input: r.tokens_input,
          tokens_output: r.tokens_output,
        };
        await setJob({
          audit_id: auditInsert.id,
          steps_completed: 1,
          current_step_label: `Client audit complete — Score: ${parsed.score}`,
          status: "running",
        });
      }
    }

    // STEPS 2..N+1 — competitor sequential loop
    const competitorResults: CompetitorResult[] = [];
    // Re-hydrate already-saved competitor audits when resuming
    if (args.startFromStep > 1) {
      const { data: prev } = await supabaseAdmin
        .from("competitor_audits")
        .select("*, competitors(domain, name)")
        .eq("market_share_job_id", args.jobId)
        .order("created_at");
      for (const p of prev ?? []) {
        competitorResults.push({
          id: p.id,
          competitor_id: p.competitor_id,
          name: p.competitors?.name ?? null,
          domain: p.competitors?.domain ?? domainOf(p.page_url),
          page_url: p.page_url,
          score: p.score ?? 0,
          rating: p.rating ?? "",
          output: p.output ?? "",
          traffic_est: p.traffic_est,
          data_source: p.data_source,
          top_friction: parseCompetitorOutput(p.output ?? "").friction.slice(0, 3),
        });
      }
    }

    for (let i = Math.max(0, args.startFromStep - 1); i < args.competitors.length; i++) {
      if (elapsed() > BUDGET_MS) {
        await setJob({
          status: "partial",
          can_resume: true,
          resume_from_step: i + 1, // 1 = first competitor (step index)
          current_step_label: `Paused after ${i} of ${args.competitors.length} competitors`,
        });
        await notify({
          type: "market_share_partial",
          title: "Market Share Analysis paused",
          body: `${i} of ${args.competitors.length} competitors completed`,
          link: `/dashboard/market-share?client=${args.clientId}&job=${args.jobId}&resume=true`,
        });
        return { status: "partial", reason: "time-budget" };
      }

      const comp = args.competitors[i];
      const { validateAuditUrl } = await import("./validate");
      const v = validateAuditUrl(comp.url);
      if (!v.valid) {
        console.warn("[market-share] skip invalid competitor URL", comp.url, v.error);
        continue;
      }
      const compDomain = domainOf(comp.url);
      const compName = comp.name?.trim() || compDomain;

      await setJob({
        current_step_label: `Auditing ${compName} (${i + 1}/${args.competitors.length})…`,
      });

      // Upsert competitor row
      const { data: existingComp } = await supabaseAdmin
        .from("competitors")
        .select("id")
        .eq("agency_id", args.agencyId)
        .eq("client_id", args.clientId)
        .eq("domain", compDomain)
        .maybeSingle();

      let competitorId: string;
      if (existingComp) {
        competitorId = existingComp.id;
        if (comp.name) {
          await supabaseAdmin.from("competitors").update({ name: comp.name }).eq("id", competitorId);
        }
      } else {
        const { data: newComp, error: cErr } = await supabaseAdmin
          .from("competitors")
          .insert({
            agency_id: args.agencyId,
            client_id: args.clientId,
            domain: compDomain,
            name: comp.name || null,
          })
          .select("id")
          .single();
        if (cErr || !newComp) throw new Error(`Competitor upsert failed: ${cErr?.message}`);
        competitorId = newComp.id;
      }

      // Claude competitor audit
      const cPrompt = buildCompetitorPrompt({
        competitorName: compName,
        competitorUrl: comp.url,
        industry: args.industry,
        clientName: args.clientName,
        clientUrl: args.clientUrl,
      });
      const cRes = await callClaude(cPrompt, anthropicKey, 1600, 20_000);
      const cParsed = parseCompetitorOutput(cRes.text);
      await logTokens(supabaseAdmin, args.agencyId, client.audit_id, cRes.tokens_input, cRes.tokens_output);

      // Traffic fallback
      const traffic = await fetchCompetitorTraffic(
        supabaseAdmin,
        args.clientId,
        compDomain,
        anthropicKey,
      );

      // Save competitor_audit
      const { data: caRow, error: caErr } = await supabaseAdmin
        .from("competitor_audits")
        .insert({
          agency_id: args.agencyId,
          client_id: args.clientId,
          competitor_id: competitorId,
          audit_id: client.audit_id,
          market_share_job_id: args.jobId,
          page_url: comp.url,
          score: cParsed.score,
          rating: cParsed.rating,
          output: cRes.text,
          traffic_est: traffic.traffic,
          data_source: traffic.data_source,
        })
        .select("id")
        .single();
      if (caErr || !caRow) throw new Error(`Competitor audit save failed: ${caErr?.message}`);

      competitorResults.push({
        id: caRow.id,
        competitor_id: competitorId,
        name: comp.name ?? null,
        domain: compDomain,
        page_url: comp.url,
        score: cParsed.score,
        rating: cParsed.rating,
        output: cRes.text,
        traffic_est: traffic.traffic,
        data_source: traffic.data_source,
        top_friction: cParsed.friction.slice(0, 3),
      });

      await setJob({
        steps_completed: 1 + competitorResults.length,
        current_step_label: `${compName} complete — Score: ${cParsed.score}`,
      });
    }

    // FINAL STEP — synthesis
    if (elapsed() > BUDGET_MS) {
      await setJob({
        status: "partial",
        can_resume: true,
        resume_from_step: 1 + args.competitors.length, // synthesis pending
        current_step_label: "Paused before synthesis",
      });
      await notify({
        type: "market_share_partial",
        title: "Market Share Analysis paused",
        body: `All competitors done — synthesis pending`,
        link: `/dashboard/market-share?client=${args.clientId}&job=${args.jobId}&resume=true`,
      });
      return { status: "partial", reason: "time-budget-pre-synthesis" };
    }

    await setJob({ current_step_label: "Synthesising market analysis…" });

    const sPrompt = buildSynthesisPrompt({
      clientName: args.clientName,
      clientUrl: args.clientUrl,
      clientScore: client.score,
      clientRating: client.rating,
      clientTraffic: args.trafficVolume,
      aov: args.aov,
      competitors: competitorResults.map((c) => ({
        name: c.name || c.domain,
        domain: c.domain,
        score: c.score,
        rating: c.rating,
        traffic: c.traffic_est,
        data_source: c.data_source,
      })),
    });
    const sRes = await callClaude(sPrompt, anthropicKey, 3000, 30_000);
    await logTokens(supabaseAdmin, args.agencyId, client.audit_id, sRes.tokens_input, sRes.tokens_output);

    await setJob({
      status: "completed",
      can_resume: false,
      steps_completed: stepsTotal,
      synthesis_output: sRes.text,
      current_step_label: "Analysis complete",
    });

    await notify({
      type: "market_share_complete",
      title: `Market Share Analysis ready for ${args.clientName}`,
      body: `Client score ${client.score} vs ${competitorResults.length} competitor${competitorResults.length === 1 ? "" : "s"}`,
      link: `/dashboard/market-share?client=${args.clientId}&job=${args.jobId}`,
    });

    return { status: "completed" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[market-share] failed:", msg);
    await setJob({
      status: "failed",
      error_message: msg.slice(0, 500),
      current_step_label: `Failed: ${msg.slice(0, 120)}`,
    });
    return { status: "failed", reason: msg };
  }
}
