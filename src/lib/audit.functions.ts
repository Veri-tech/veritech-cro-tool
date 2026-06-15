// Server functions powering the AI audit engine.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildAuditPrompt } from "./claude";
import { logEvent } from "./event-log.server";
import { parseAuditOutput } from "./parse";
import { validateAuditUrl } from "./validate";

const RunInput = z.object({
  clientId: z.string().uuid(),
  pageUrl: z.string().url(),
  pageLabel: z.string().min(1).max(120),
  trafficVolume: z.number().int().nonnegative(),
  aov: z.number().nonnegative(),
  industry: z.string().min(1).max(60),
  // Enhanced context fields
  pageGoal: z.string().max(200).optional(),
  targetAudience: z.string().max(200).optional(),
  primaryCta: z.string().max(200).optional(),
  deviceSplit: z.string().max(100).optional(),
  topTrafficSources: z.string().max(200).optional(),
  competitorUrls: z.string().max(500).optional(),
  additionalContext: z.string().max(1000).optional(),
});

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const PRICE_INPUT_PER_M = 3; // USD per 1M input tokens
const PRICE_OUTPUT_PER_M = 15; // USD per 1M output tokens

// Refresh a stored Google OAuth access token if expiring within 5 minutes.
// Returns the (possibly refreshed) access token, or "" if refresh failed —
// caller should then skip the API call and degrade gracefully. Reads/writes
// encrypted columns via the service-role admin client.
async function refreshGoogleTokenIfNeeded(
  supabaseAdmin: any,
  integration: {
    id: string;
    access_token: string | null;
    refresh_token: string | null;
    token_expiry: string | null;
  },
): Promise<string> {
  const { decryptString, encryptString } = await import("@/lib/crypto.server");

  // If token is valid for more than 5 minutes, return as-is.
  if (integration.token_expiry && integration.access_token) {
    const expiresAt = new Date(integration.token_expiry).getTime();
    if (expiresAt - Date.now() > 5 * 60 * 1000) {
      try { return decryptString(integration.access_token); } catch { /* fall through */ }
    }
  }

  // Attempt refresh.
  try {
    if (!integration.refresh_token) throw new Error("No refresh token on file");
    const refreshToken = decryptString(integration.refresh_token);
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: (process.env.GOOGLE_CLIENT_ID || '973934436364-tbnk2an8cb1bptr9atgupo1bqpuhu564.apps.googleusercontent.com') ?? "",
        client_secret: (process.env.GOOGLE_CLIENT_SECRET || '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') ?? "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!r.ok) throw new Error("Refresh failed: " + r.status);
    const json = (await r.json()) as { access_token: string; expires_in: number };
    const newExpiry = new Date(Date.now() + json.expires_in * 1000).toISOString();
    await supabaseAdmin
      .from("client_integrations")
      .update({
        access_token: encryptString(json.access_token),
        token_expiry: newExpiry,
        status: "active",
        last_error: null,
      })
      .eq("id", integration.id);
    return json.access_token;
  } catch (err) {
    await supabaseAdmin
      .from("client_integrations")
      .update({
        status: "requires_reauth",
        last_error: err instanceof Error ? err.message : "refresh-failed",
      })
      .eq("id", integration.id);
    return "";
  }
}

async function callAnthropic(prompt: string, apiKey: string, timeoutMs = 55_000): Promise<{ text: string; tokens_input: number; tokens_output: number; }>
{
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Anthropic ${res.status}: ${errText.slice(0, 300)}`);
    }
    const json = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = (json.content ?? []).map((c) => c.text ?? "").join("\n").trim();
    return {
      text,
      tokens_input: json.usage?.input_tokens ?? 0,
      tokens_output: json.usage?.output_tokens ?? 0,
    };
  } finally {
    clearTimeout(t);
  }
}

export const runAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RunInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Profile + role
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, agency_id")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found");
    if (profile.role === "client") throw new Error("Forbidden");
    const agencyId = profile.agency_id;
    if (!agencyId) throw new Error("No agency");

    // 2. Agency must be active
    const { data: agency } = await supabase
      .from("agencies")
      .select("status, daily_audit_limit, monthly_token_budget")
      .eq("id", agencyId)
      .maybeSingle();
    if (!agency || agency.status !== "active") throw new Error("Agency not active");

    // 3. Client belongs to agency
    const { data: client } = await supabase
      .from("clients")
      .select("id, name, domain, industry, monthly_traffic, avg_order_value, portal_user_id")
      .eq("id", data.clientId)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (!client) throw new Error("Client not found");

    // 4. URL validation
    const v = validateAuditUrl(data.pageUrl);
    if (!v.valid) throw new Error(v.error || "Invalid URL");

    // 4b. Required-integration check (real data sources must be connected)
    {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { assertClientReady } = await import("./integrations-admin.functions");
      await assertClientReady(supabaseAdmin, client.id);
    }

    // 5. Concurrency check
    const fiveAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: running } = await supabase
      .from("audit_queue")
      .select("id")
      .eq("agency_id", agencyId)
      .eq("status", "running")
      .gte("started_at", fiveAgo)
      .limit(1);
    if (running && running.length) throw new Error("Audit already in progress");

    // 6. Daily limit
    const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const dailyLimit = agency.daily_audit_limit ?? 10;
    const { count: dayCount } = await supabase
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("status", "completed")
      .gte("created_at", dayAgo);
    if ((dayCount ?? 0) >= dailyLimit) {
      throw new Error(`Daily audit limit reached (${dailyLimit}). Resets in 24h.`);
    }

    // 7. Monthly token budget
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const budget = agency.monthly_token_budget ?? 2_000_000;
    const { data: usageRows } = await supabase
      .from("api_usage_log")
      .select("tokens_total")
      .eq("agency_id", agencyId)
      .gte("created_at", monthStart.toISOString());
    const used = (usageRows ?? []).reduce((s, r) => s + (r.tokens_total ?? 0), 0);
    if (used >= budget) {
      const nextMonth = new Date(monthStart);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      throw new Error(`Monthly token budget reached. Resets on ${nextMonth.toLocaleDateString()}.`);
    }

    // 8. Insert audit + queue rows
    const { data: auditRow, error: insErr } = await supabase
      .from("audits")
      .insert({
        agency_id: agencyId,
        client_id: client.id,
        page_url: data.pageUrl,
        page_label: data.pageLabel,
        status: "running",
        initiated_by: "agency",
        run_by: userId,
        retry_count: 0,
        traffic_at_run: data.trafficVolume,
        aov_at_run: data.aov,
      })
      .select("id")
      .single();
    if (insErr || !auditRow) throw new Error("Failed to create audit");
    const auditId = auditRow.id;

    await supabase.from("audit_queue").insert({
      agency_id: agencyId,
      audit_id: auditId,
      user_id: userId,
      status: "running",
      started_at: new Date().toISOString(),
    });

    try {
      // 9. Prior audit context
      const { data: prior } = await supabase
        .from("audits")
        .select("output")
        .eq("client_id", client.id)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // 10. Build prompt + call Claude
      const apiKey = process.env.ANTHROPIC_API_KEY || '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';
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

      // Preflight: refresh any expiring Google OAuth tokens for GA4/GSC so
      // the downstream fetchers don't 401. Failures here mark the integration
      // as requires_reauth and we continue without that data source.
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: googleRows } = await supabaseAdmin
          .from("client_integrations")
          .select("id, provider, access_token, refresh_token, token_expiry, status")
          .eq("client_id", client.id)
          .in("provider", ["google", "gsc"])
          .eq("status", "active");
        for (const row of googleRows ?? []) {
          if (!row.refresh_token) continue; // service-account / JWT flow — skip
          const tok = await refreshGoogleTokenIfNeeded(supabaseAdmin, row as any);
          if (!tok) {
            console.warn(`[audit] ${row.provider} token refresh failed for client ${client.id} — skipping live data`);
          }
        }
      } catch (e) {
        console.warn("[audit] google token preflight failed:", e);
      }

      // Pull live analytics from saved integrations (best-effort; null if none).
      let analytics = null as Awaited<ReturnType<typeof import("./fetchers.server").gatherAnalyticsForAudit>>;
      try {
        const { gatherAnalyticsForAudit } = await import("./fetchers.server");
        analytics = await gatherAnalyticsForAudit(client.id, data.pageUrl, client.domain ?? "");
      } catch (e) {
        console.warn("[audit] analytics fetch failed:", e);
      }


      const prompt = buildAuditPrompt(
        {
          clientName: client.name,
          pageUrl: data.pageUrl,
          pageLabel: data.pageLabel,
          industry: data.industry,
          trafficVolume: data.trafficVolume,
          aov: data.aov,
          pageGoal: data.pageGoal,
          targetAudience: data.targetAudience,
          primaryCta: data.primaryCta,
          deviceSplit: data.deviceSplit,
          topTrafficSources: data.topTrafficSources,
          competitorUrls: data.competitorUrls,
          additionalContext: data.additionalContext,
        },
        prior?.output ?? null,
        analytics,
      );

      let result;
      try {
        result = await callAnthropic(prompt, apiKey);
      } catch (err) {
        // Retry once
        await supabase.from("audits").update({ status: "retrying", retry_count: 1 }).eq("id", auditId);
        await new Promise((r) => setTimeout(r, 10_000));
        result = await callAnthropic(prompt, apiKey);
      }

      const parsed = parseAuditOutput(result.text);
      const critical = parsed.frictionPoints.filter((f) => f.severity === "CRITICAL").length;
      const revenueLow = parsed.revenueScenarios.conservative;
      const revenueHigh = parsed.revenueScenarios.optimistic;
      const totalTokens = result.tokens_input + result.tokens_output;
      const costUsd =
        (result.tokens_input / 1_000_000) * PRICE_INPUT_PER_M +
        (result.tokens_output / 1_000_000) * PRICE_OUTPUT_PER_M;

      // Log audit completed
      void logEvent({
        eventType: "audit_completed",
        agencyId,
        userId,
        clientId: data.clientId,
        detail: `score=${parsed.score} url=${data.pageUrl}`,
      });

      await supabase
        .from("audits")
        .update({
          status: "completed",
          output: result.text,
          parsed_data: parsed as unknown as never,
          score: parsed.score,
          rating: parsed.rating,
          friction_count: parsed.frictionPoints.length,
          critical_count: critical,
          revenue_low: revenueLow,
          revenue_high: revenueHigh,
        })
        .eq("id", auditId);

      await supabase.from("api_usage_log").insert({
        agency_id: agencyId,
        audit_id: auditId,
        tokens_input: result.tokens_input,
        tokens_output: result.tokens_output,
        tokens_total: totalTokens,
        cost_usd: costUsd,
      });

      await supabase
        .from("audit_queue")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("audit_id", auditId);

      // Notifications + emails (use admin client → bypass per-user RLS on notifications).
      const { insertNotification, insertNotificationsForAgencyAdmins } =
        await import("@/lib/notifications.server");
      await insertNotificationsForAgencyAdmins(agencyId, {
        type: "audit_complete",
        title: `Audit complete for ${client.name} — ${parsed.score}/100`,
        body: `Page: ${data.pageLabel}`,
        link: `/dashboard/clients/${client.id}`,
      });
      if (client.portal_user_id) {
        await insertNotification({
          userId: client.portal_user_id,
          agencyId,
          type: "new_report_ready",
          title: `Your latest report is ready — ${parsed.score}/100`,
          body: `Audit for ${data.pageLabel}`,
          link: "/portal",
        });
        // EMAIL TEMPLATE 2 — agency-initiated audit complete → client
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: pu } = await supabaseAdmin.auth.admin.getUserById(client.portal_user_id);
          const clientEmail = pu?.user?.email;
          if (clientEmail) {
            const { emailAuditCompleteToClient } = await import("@/lib/email.server");
            const top = parsed.frictionPoints[0]?.title;
            await emailAuditCompleteToClient({
              to: clientEmail,
              score: parsed.score,
              rating: parsed.rating,
              pageLabel: data.pageLabel,
              topFriction: top,
            });
          }
        } catch (e) { console.warn("[email] audit-complete client:", e); }
      }
      // Usage warning at 80% — notification + email, deduped once per calendar month.
      const newUsed = used + totalTokens;
      if (used < budget * 0.8 && newUsed >= budget * 0.8) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const monthAgo = new Date(); monthAgo.setUTCDate(1); monthAgo.setUTCHours(0, 0, 0, 0);
        const { data: existing } = await supabaseAdmin
          .from("notifications")
          .select("id")
          .eq("agency_id", agencyId)
          .eq("type", "usage_warning")
          .gte("created_at", monthAgo.toISOString())
          .limit(1);
        if (!existing || existing.length === 0) {
          await insertNotificationsForAgencyAdmins(agencyId, {
            type: "usage_warning",
            title: "80% of monthly audit budget used",
            body: `Approx. ${Math.round((newUsed / budget) * 100)}% of budget consumed.`,
            link: "/dashboard/settings",
          });
          // EMAIL TEMPLATE 8 → all agency admins
          try {
            const now = Date.now();
            const monthEnd = new Date(monthAgo);
            monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
            const daysIntoMonth = Math.max(1, Math.ceil((now - monthAgo.getTime()) / 86_400_000));
            const burnPerDay = newUsed / daysIntoMonth;
            const remaining = Math.max(0, budget - newUsed);
            const estDays = burnPerDay > 0 ? Math.max(0, Math.floor(remaining / burnPerDay)) : 30;
            const { emailAllAgencyAdmins, emailUsageWarning } = await import("@/lib/email.server");
            await emailAllAgencyAdmins(agencyId, (to) =>
              emailUsageWarning({ to, used: newUsed, budget, estDaysRemaining: estDays }),
            );
          } catch (e) { console.warn("[email] usage warning:", e); }
        }
      }

      return { auditId, parsed };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Audit failed";
      void logEvent({
        eventType: "audit_failed",
        agencyId,
        userId,
        clientId: data.clientId,
        detail: msg.slice(0, 300),
      });
      await supabase
        .from("audits")
        .update({ status: "failed", error_message: msg.slice(0, 500) })
        .eq("id", auditId);
      await supabase
        .from("audit_queue")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("audit_id", auditId);
      const { insertNotification } = await import("@/lib/notifications.server");
      await insertNotification({
        userId,
        agencyId,
        type: "audit_failed",
        title: `Audit failed for ${client.name}`,
        body: msg.slice(0, 240),
        link: "/dashboard/audit",
      });
      throw err;
    }
  });

const StatusInput = z.object({ id: z.string().uuid() });
export const getAuditStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id, role")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Forbidden");
    const { data: audit } = await supabase
      .from("audits")
      .select("id, status, score, rating, error_message, created_at, client_id, agency_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!audit) throw new Error("Not found");
    if (profile.role !== "super_admin" && audit.agency_id !== profile.agency_id) throw new Error("Forbidden");
    return {
      id: audit.id,
      status: audit.status,
      score: audit.score,
      rating: audit.rating,
      error_message: audit.error_message,
      created_at: audit.created_at,
    };
  });

export const getAuditById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id, role")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Forbidden");
    const { data: audit } = await supabase
      .from("audits")
      .select("*, clients(id, name, domain)")
      .eq("id", data.id)
      .maybeSingle();
    if (!audit) throw new Error("Not found");
    if (profile.role !== "super_admin" && audit.agency_id !== profile.agency_id) throw new Error("Forbidden");
    return audit;
  });

const RetryInput = z.object({ id: z.string().uuid() });
export const retryAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RetryInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id, role")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.role === "client") throw new Error("Forbidden");
    const { data: audit } = await supabase
      .from("audits")
      .select("id, agency_id, client_id, page_url, page_label, traffic_at_run, aov_at_run, clients(industry)")
      .eq("id", data.id)
      .maybeSingle();
    if (!audit || audit.agency_id !== profile.agency_id) throw new Error("Forbidden");
    await supabase.from("audits").update({ status: "running", retry_count: 0, error_message: null }).eq("id", audit.id);
    await supabase.from("audit_queue").delete().eq("audit_id", audit.id);
    return { ok: true, auditId: audit.id };
  });
