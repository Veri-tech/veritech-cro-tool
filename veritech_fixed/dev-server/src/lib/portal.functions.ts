// Server functions powering the read-side and self-serve client portal.
// Every query MUST resolve to the caller's client row via portal_user_id =
// auth.uid(). Cross-tenant leakage here is unacceptable.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildAuditPrompt } from "./claude";
import { parseAuditOutput } from "./parse";
import { validateAuditUrl } from "./validate";

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const PRICE_INPUT_PER_M = 3;
const PRICE_OUTPUT_PER_M = 15;

async function callAnthropic(prompt: string, apiKey: string, timeoutMs = 55_000) {
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

/** Fetch the client row owned by the calling portal user. Throws on miss. */
async function getMyClient(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("clients")
    .select(
      "id, agency_id, name, domain, industry, monthly_traffic, avg_order_value, contact_name, contact_email, archived",
    )
    .eq("portal_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No client linked to this account");
  return data;
}

export const getPortalHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await getMyClient(context.supabase, context.userId);

    // Agency info for the "Your Agency" section.
    const { data: agency } = await context.supabase
      .from("agencies")
      .select("id, name, contact_email")
      .eq("id", client.agency_id)
      .maybeSingle();

    // All completed audits for this client.
    const { data: audits } = await context.supabase
      .from("audits")
      .select("id, page_url, page_label, status, score, rating, pdf_url, created_at, parsed_data")
      .eq("client_id", client.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false });

    // Daily limit info.
    const { data: agencyLimits } = await context.supabase
      .from("agencies")
      .select("daily_audit_limit")
      .eq("id", client.agency_id)
      .maybeSingle();
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: todayCount } = await context.supabase
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("client_id", client.id)
      .eq("status", "completed")
      .gte("created_at", dayAgo);

    return {
      client,
      agency: agency ?? null,
      audits: audits ?? [],
      dailyLimit: agencyLimits?.daily_audit_limit ?? 10,
      auditsToday: todayCount ?? 0,
    };
  });

export const getMyAuditDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const client = await getMyClient(context.supabase, context.userId);
    const { data: audit } = await context.supabase
      .from("audits")
      .select("*")
      .eq("id", data.id)
      .eq("client_id", client.id)
      .maybeSingle();
    if (!audit) throw new Error("Not found");
    return { audit, client };
  });

export const getMyScoreHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await getMyClient(context.supabase, context.userId);
    const { data: audits } = await context.supabase
      .from("audits")
      .select("id, page_label, score, created_at, pdf_url, parsed_data")
      .eq("client_id", client.id)
      .eq("status", "completed")
      .order("created_at", { ascending: true });
    return { client, audits: audits ?? [] };
  });

export const getMyIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const client = await getMyClient(context.supabase, context.userId);
    const { data } = await context.supabase
      .from("client_integrations_safe")
      .select("*")
      .eq("client_id", client.id);
    return { client, integrations: data ?? [] };
  });

// -------------- Self-serve audit run (client-initiated) --------------
const RunClientAuditInput = z.object({
  pageUrl: z.string().url(),
  pageLabel: z.string().min(1).max(120),
});

export const runClientAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RunClientAuditInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const client = await getMyClient(supabase, userId);
    if (client.archived) throw new Error("Account archived");
    const agencyId = client.agency_id;

    // Agency must be active
    const { data: agency } = await supabase
      .from("agencies")
      .select("status, daily_audit_limit, monthly_token_budget, name")
      .eq("id", agencyId)
      .maybeSingle();
    if (!agency || agency.status !== "active") throw new Error("Agency not active");

    // URL validation
    const v = validateAuditUrl(data.pageUrl);
    if (!v.valid) throw new Error(v.error || "Invalid URL");

    // Concurrency
    const fiveAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: running } = await supabase
      .from("audit_queue").select("id")
      .eq("agency_id", agencyId).eq("status", "running")
      .gte("started_at", fiveAgo).limit(1);
    if (running && running.length) throw new Error("An audit is already in progress for your agency");

    // Daily limit (per client portal, scoped to this client)
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const dailyLimit = agency.daily_audit_limit ?? 10;
    const { count: dayCount } = await supabase
      .from("audits").select("*", { count: "exact", head: true })
      .eq("client_id", client.id).eq("status", "completed")
      .gte("created_at", dayAgo);
    if ((dayCount ?? 0) >= dailyLimit) {
      throw new Error(`Daily audit limit reached (${dailyLimit}). Resets in 24h.`);
    }

    // Monthly token budget
    const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    const budget = agency.monthly_token_budget ?? 2_000_000;
    const { data: usageRows } = await supabase
      .from("api_usage_log").select("tokens_total")
      .eq("agency_id", agencyId).gte("created_at", monthStart.toISOString());
    const used = (usageRows ?? []).reduce((s, r) => s + (r.tokens_total ?? 0), 0);
    if (used >= budget) {
      throw new Error("Your agency has reached their monthly audit budget. Try again next month.");
    }

    // Audit row
    const traffic = client.monthly_traffic ?? 0;
    const aov = client.avg_order_value ?? 0;
    const industry = client.industry ?? "Other";

    const { data: auditRow, error: insErr } = await supabase
      .from("audits").insert({
        agency_id: agencyId,
        client_id: client.id,
        page_url: data.pageUrl,
        page_label: data.pageLabel,
        status: "running",
        initiated_by: "client",
        run_by: userId,
        retry_count: 0,
        traffic_at_run: traffic,
        aov_at_run: aov,
      }).select("id").single();
    if (insErr || !auditRow) throw new Error("Failed to create audit");
    const auditId = auditRow.id as string;

    await supabase.from("audit_queue").insert({
      agency_id: agencyId, audit_id: auditId, user_id: userId,
      status: "running", started_at: new Date().toISOString(),
    });

    try {
      const { data: prior } = await supabase
        .from("audits").select("output")
        .eq("client_id", client.id).eq("status", "completed")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

      const prompt = buildAuditPrompt(
        {
          clientName: client.name,
          pageUrl: data.pageUrl,
          pageLabel: data.pageLabel,
          industry,
          trafficVolume: traffic,
          aov,
        },
        prior?.output ?? null,
        null,
      );

      let result;
      try { result = await callAnthropic(prompt, apiKey); }
      catch {
        await supabase.from("audits").update({ status: "retrying", retry_count: 1 }).eq("id", auditId);
        await new Promise((r) => setTimeout(r, 10_000));
        result = await callAnthropic(prompt, apiKey);
      }

      const parsed = parseAuditOutput(result.text);
      const critical = parsed.frictionPoints.filter((f) => f.severity === "CRITICAL").length;
      const totalTokens = result.tokens_input + result.tokens_output;
      const costUsd =
        (result.tokens_input / 1_000_000) * PRICE_INPUT_PER_M +
        (result.tokens_output / 1_000_000) * PRICE_OUTPUT_PER_M;

      await supabase.from("audits").update({
        status: "completed",
        output: result.text,
        parsed_data: parsed as unknown as never,
        score: parsed.score,
        rating: parsed.rating,
        friction_count: parsed.frictionPoints.length,
        critical_count: critical,
        revenue_low: parsed.revenueScenarios.conservative,
        revenue_high: parsed.revenueScenarios.optimistic,
      }).eq("id", auditId);

      await supabase.from("api_usage_log").insert({
        agency_id: agencyId, audit_id: auditId,
        tokens_input: result.tokens_input, tokens_output: result.tokens_output,
        tokens_total: totalTokens, cost_usd: costUsd,
      });

      await supabase.from("audit_queue")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("audit_id", auditId);

      // audit_request marker for the agency's pending requests view.
      await supabase.from("audit_requests").insert({
        agency_id: agencyId,
        client_id: client.id,
        requested_by: userId,
        page_url: data.pageUrl,
        page_label: data.pageLabel,
        status: "completed",
        audit_id: auditId,
      });

      // Notifications: agency admins (audit_requested) + self (new_report_ready) + usage warning.
      const { insertNotification, insertNotificationsForAgencyAdmins } =
        await import("@/lib/notifications.server");
      await insertNotificationsForAgencyAdmins(agencyId, {
        type: "audit_requested",
        title: `Client ${client.name} ran a new audit — ${parsed.score}/100`,
        body: `Page: ${data.pageLabel}`,
        link: `/dashboard/clients/${client.id}`,
      });
      await insertNotification({
        userId,
        agencyId,
        type: "new_report_ready",
        title: `Your latest report is ready — ${parsed.score}/100`,
        body: `Audit for ${data.pageLabel}`,
        link: "/portal",
      });
      // EMAIL TEMPLATE 3 — client-initiated audit complete → agency admins
      try {
        const { emailAllAgencyAdmins, emailAuditCompleteToAgency } = await import("@/lib/email.server");
        await emailAllAgencyAdmins(agencyId, (to) =>
          emailAuditCompleteToAgency({
            to,
            clientName: client.name,
            pageLabel: data.pageLabel,
            score: parsed.score,
            clientId: client.id,
          }),
        );
      } catch (e) { console.warn("[email] audit-complete agency:", e); }

      const newUsed = used + totalTokens;
      if (used < budget * 0.8 && newUsed >= budget * 0.8) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const monthStart2 = new Date(); monthStart2.setUTCDate(1); monthStart2.setUTCHours(0,0,0,0);
        const { data: existing } = await supabaseAdmin
          .from("notifications").select("id")
          .eq("agency_id", agencyId).eq("type", "usage_warning")
          .gte("created_at", monthStart2.toISOString()).limit(1);
        if (!existing || existing.length === 0) {
          await insertNotificationsForAgencyAdmins(agencyId, {
            type: "usage_warning",
            title: "80% of monthly audit budget used",
            body: `Approx. ${Math.round((newUsed / budget) * 100)}% of budget consumed.`,
            link: "/dashboard/settings",
          });
          try {
            const daysIntoMonth = Math.max(1, Math.ceil((Date.now() - monthStart2.getTime()) / 86_400_000));
            const burn = newUsed / daysIntoMonth;
            const estDays = burn > 0 ? Math.max(0, Math.floor((budget - newUsed) / burn)) : 30;
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
      await supabase.from("audits")
        .update({ status: "failed", error_message: msg.slice(0, 500) }).eq("id", auditId);
      await supabase.from("audit_queue")
        .update({ status: "failed", completed_at: new Date().toISOString() })
        .eq("audit_id", auditId);
      const { insertNotification } = await import("@/lib/notifications.server");
      await insertNotification({
        userId,
        agencyId,
        type: "audit_failed",
        title: `Audit failed for ${client.name}`,
        body: msg.slice(0, 240),
        link: "/portal/audit",
      });
      throw err;
    }
  });

// -------------- Account update --------------
const AccountInput = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
});
export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AccountInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.fullName !== undefined) {
      const { error } = await context.supabase
        .from("profiles").update({ full_name: data.fullName }).eq("id", context.userId);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
