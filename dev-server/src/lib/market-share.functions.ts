// Server functions exposed to the client for the Market Share module.
// The actual sequential runner lives in ./market-share.server.ts and is
// invoked inside `startMarketShareJob` / `resumeMarketShareJob`.
//
// Client pattern: call start (no await), then poll getMarketShareStatus.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateAuditUrl } from "./validate";

const CompetitorSchema = z.object({
  name: z.string().trim().max(120).optional().nullable(),
  url: z.string().trim().url().max(500),
});

const StartInput = z.object({
  clientId: z.string().uuid(),
  clientUrl: z.string().trim().url().max(500),
  clientLabel: z.string().trim().min(1).max(120).optional(),
  competitors: z.array(CompetitorSchema).min(1).max(4),
  saveCompetitors: z.boolean().optional(),
});

async function getAgencyProfile(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.role === "client") throw new Error("Forbidden");
  if (!profile.agency_id) throw new Error("No agency");
  return profile;
}

// ---------- Start ----------
export const startMarketShareJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StartInput.parse(d))
  .handler(async ({ data, context }) => {
    const profile = await getAgencyProfile(context.supabase, context.userId);
    const agencyId = profile.agency_id as string;

    if (data.competitors.length > 4) throw new Error("Maximum 4 competitors");

    // Validate URLs
    const clientV = validateAuditUrl(data.clientUrl);
    if (!clientV.valid) throw new Error(clientV.error || "Invalid client URL");
    for (const c of data.competitors) {
      const v = validateAuditUrl(c.url);
      if (!v.valid) throw new Error(`Invalid competitor URL (${c.url}): ${v.error}`);
    }

    // Verify client belongs to agency
    const { data: client } = await context.supabase
      .from("clients")
      .select("id, name, domain, industry, monthly_traffic, avg_order_value, archived")
      .eq("id", data.clientId)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (!client) throw new Error("Client not found");
    if (client.archived) throw new Error("Client is archived");

    // Agency must be active + budget checks
    const { data: agency } = await context.supabase
      .from("agencies")
      .select("status, daily_audit_limit, monthly_token_budget")
      .eq("id", agencyId)
      .maybeSingle();
    if (!agency || agency.status !== "active") throw new Error("Agency not active");

    const creditsNeeded = 1 + data.competitors.length + 1;
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: dayCount } = await context.supabase
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("status", "completed")
      .gte("created_at", dayAgo);
    const dailyLimit = agency.daily_audit_limit ?? 10;
    if ((dayCount ?? 0) + creditsNeeded > dailyLimit) {
      const remaining = Math.max(0, dailyLimit - (dayCount ?? 0));
      throw new Error(
        `Needs ${creditsNeeded} credits, ${remaining} remaining. Resets in 24 hours.`,
      );
    }

    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const budget = agency.monthly_token_budget ?? 2_000_000;
    const { data: usageRows } = await context.supabase
      .from("api_usage_log")
      .select("tokens_total")
      .eq("agency_id", agencyId)
      .gte("created_at", monthStart.toISOString());
    const used = (usageRows ?? []).reduce((s: number, r: any) => s + (r.tokens_total ?? 0), 0);
    if (used >= budget) throw new Error("Monthly token budget reached.");

    // Optionally persist competitors for next time
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.saveCompetitors) {
      for (const c of data.competitors) {
        const domain = new URL(c.url).hostname.replace(/^www\./, "");
        await supabaseAdmin
          .from("competitors")
          .upsert(
            {
              agency_id: agencyId,
              client_id: client.id,
              domain,
              name: c.name?.trim() || null,
            },
            { onConflict: "agency_id,client_id,domain" },
          );
      }
    }

    // Create job row
    const stepsTotal = 1 + data.competitors.length + 1;
    const { data: jobRow, error: jErr } = await supabaseAdmin
      .from("market_share_jobs")
      .insert({
        agency_id: agencyId,
        client_id: client.id,
        status: "running",
        steps_total: stepsTotal,
        steps_completed: 0,
        current_step_label: "Starting…",
        can_resume: false,
        resume_from_step: 0,
      })
      .select("id")
      .single();
    if (jErr || !jobRow) throw new Error(`Failed to create job: ${jErr?.message}`);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

    const { executeMarketShareJob } = await import("./market-share.server");
    const result = await executeMarketShareJob({
      supabaseAdmin,
      anthropicKey: apiKey,
      jobId: jobRow.id,
      agencyId,
      clientId: client.id,
      clientName: client.name,
      clientUrl: data.clientUrl,
      clientLabel: data.clientLabel || data.clientUrl,
      industry: client.industry || "Other",
      trafficVolume: client.monthly_traffic ?? 1000,
      aov: client.avg_order_value ?? 0,
      competitors: data.competitors,
      startFromStep: 0,
    });

    return { jobId: jobRow.id, status: result.status };
  });

// ---------- Resume ----------
export const resumeMarketShareJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const profile = await getAgencyProfile(context.supabase, context.userId);
    const agencyId = profile.agency_id as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: job, error: jErr } = await supabaseAdmin
      .from("market_share_jobs")
      .select("*, clients(id, name, domain, industry, monthly_traffic, avg_order_value)")
      .eq("id", data.jobId)
      .maybeSingle();
    if (jErr || !job) throw new Error("Job not found");
    if (job.agency_id !== agencyId) throw new Error("Forbidden");
    if (!job.can_resume) throw new Error("This job cannot be resumed");

    // Hydrate client snapshot from saved audit
    const { data: audit } = await supabaseAdmin
      .from("audits")
      .select("id, page_url, page_label, score, rating, output")
      .eq("id", job.audit_id!)
      .maybeSingle();
    if (!audit) throw new Error("Original client audit not found");

    // Pull competitors from already-saved competitor_audits (in order) to keep
    // the list the user originally chose, falling back to the latest competitors
    // table snapshot if none saved yet.
    const { data: savedCAs } = await supabaseAdmin
      .from("competitor_audits")
      .select("page_url, competitors(name, domain)")
      .eq("market_share_job_id", job.id)
      .order("created_at");

    // We need the full original competitor list to know what remains. We
    // reconstruct it by combining saved CAs + the current `competitors` table
    // for this client (in the order they were added).
    const { data: clientCompetitors } = await supabaseAdmin
      .from("competitors")
      .select("name, domain")
      .eq("client_id", job.client_id)
      .order("created_at");

    const competitorsList: { name?: string | null; url: string }[] = [];
    const seen = new Set<string>();
    for (const ca of savedCAs ?? []) {
      const d = (ca as any).competitors?.domain ?? new URL(ca.page_url).hostname.replace(/^www\./, "");
      seen.add(d);
      competitorsList.push({ name: (ca as any).competitors?.name ?? null, url: ca.page_url });
    }
    for (const c of clientCompetitors ?? []) {
      if (seen.has(c.domain)) continue;
      competitorsList.push({ name: c.name, url: `https://${c.domain}` });
    }

    await supabaseAdmin
      .from("market_share_jobs")
      .update({ status: "running", can_resume: false })
      .eq("id", job.id);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

    const { executeMarketShareJob } = await import("./market-share.server");
    const result = await executeMarketShareJob({
      supabaseAdmin,
      anthropicKey: apiKey,
      jobId: job.id,
      agencyId,
      clientId: job.client_id,
      clientName: (job as any).clients?.name ?? "Client",
      clientUrl: audit.page_url,
      clientLabel: audit.page_label ?? audit.page_url,
      industry: (job as any).clients?.industry ?? "Other",
      trafficVolume: (job as any).clients?.monthly_traffic ?? 1000,
      aov: (job as any).clients?.avg_order_value ?? 0,
      competitors: competitorsList,
      startFromStep: job.resume_from_step ?? 1,
      resumedClientSnapshot: {
        audit_id: audit.id,
        page_url: audit.page_url,
        page_label: audit.page_label ?? audit.page_url,
        score: audit.score ?? 0,
        rating: audit.rating ?? "Average",
        output: audit.output ?? "",
        reused: true,
        tokens_input: 0,
        tokens_output: 0,
      },
    });

    return { jobId: job.id, status: result.status };
  });

// ---------- Status ----------
export const getMarketShareStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id, role")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Forbidden");

    const { data: job } = await supabase
      .from("market_share_jobs")
      .select("*")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!job) throw new Error("Job not found");

    const isAgency = profile.role !== "client" && job.agency_id === profile.agency_id;
    let isOwnerClient = false;
    if (!isAgency && profile.role === "client") {
      const { data: c } = await supabase
        .from("clients")
        .select("id")
        .eq("portal_user_id", userId)
        .eq("id", job.client_id)
        .maybeSingle();
      isOwnerClient = !!c;
    }
    if (!isAgency && !isOwnerClient && profile.role !== "super_admin") {
      throw new Error("Forbidden");
    }

    const { data: cas } = await supabase
      .from("competitor_audits")
      .select("id, competitor_id, page_url, score, rating, output, traffic_est, data_source, created_at, competitors(name, domain)")
      .eq("market_share_job_id", job.id)
      .order("created_at");

    const { data: clientAudit } = job.audit_id
      ? await supabase
          .from("audits")
          .select("id, page_url, page_label, score, rating, output, created_at")
          .eq("id", job.audit_id)
          .maybeSingle()
      : { data: null as any };

    return {
      job: {
        id: job.id,
        client_id: job.client_id,
        agency_id: job.agency_id,
        audit_id: job.audit_id,
        status: job.status,
        steps_total: job.steps_total,
        steps_completed: job.steps_completed,
        current_step_label: job.current_step_label,
        can_resume: job.can_resume,
        resume_from_step: job.resume_from_step,
        synthesis_output: job.synthesis_output,
        error_message: job.error_message,
        created_at: job.created_at,
        updated_at: job.updated_at,
      },
      client_audit: clientAudit,
      competitor_audits: (cas ?? []).map((c: any) => ({
        id: c.id,
        competitor_id: c.competitor_id,
        page_url: c.page_url,
        domain: c.competitors?.domain ?? null,
        name: c.competitors?.name ?? null,
        score: c.score,
        rating: c.rating,
        output: c.output,
        traffic_est: c.traffic_est,
        data_source: c.data_source,
      })),
    };
  });

// ---------- List previous jobs for a client ----------
export const listMarketShareJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const profile = await getAgencyProfile(context.supabase, context.userId);
    const agencyId = profile.agency_id as string;
    let q = context.supabase
      .from("market_share_jobs")
      .select("id, client_id, status, steps_total, steps_completed, can_resume, created_at, clients(name)")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    const { data: jobs } = await q;

    // Competitor counts per job
    const jobIds = (jobs ?? []).map((j: any) => j.id);
    let counts: Record<string, number> = {};
    if (jobIds.length) {
      const { data: cas } = await context.supabase
        .from("competitor_audits")
        .select("market_share_job_id")
        .in("market_share_job_id", jobIds);
      for (const ca of cas ?? []) {
        if (!ca.market_share_job_id) continue;
        counts[ca.market_share_job_id] = (counts[ca.market_share_job_id] ?? 0) + 1;
      }
    }

    return (jobs ?? []).map((j: any) => ({
      id: j.id,
      client_id: j.client_id,
      client_name: j.clients?.name ?? "—",
      status: j.status,
      steps_completed: j.steps_completed,
      steps_total: j.steps_total,
      can_resume: j.can_resume,
      created_at: j.created_at,
      competitors_count: counts[j.id] ?? 0,
    }));
  });

// ---------- In-progress jobs for the agency (banner) ----------
export const listInProgressMarketShareJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const profile = await getAgencyProfile(context.supabase, context.userId);
    const agencyId = profile.agency_id as string;
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data } = await context.supabase
      .from("market_share_jobs")
      .select("id, client_id, status, can_resume, created_at, current_step_label, clients(name)")
      .eq("agency_id", agencyId)
      .in("status", ["running", "partial"])
      .gte("created_at", since)
      .order("created_at", { ascending: false });
    return (data ?? []).map((j: any) => ({
      id: j.id,
      client_id: j.client_id,
      client_name: j.clients?.name ?? "Client",
      status: j.status,
      can_resume: j.can_resume,
      current_step_label: j.current_step_label,
      created_at: j.created_at,
    }));
  });

// ---------- Cancel a running job ----------
export const cancelMarketShareJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ jobId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const profile = await getAgencyProfile(context.supabase, context.userId);
    const agencyId = profile.agency_id as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("market_share_jobs")
      .update({ status: "failed", error_message: "Cancelled by user", can_resume: false })
      .eq("id", data.jobId)
      .eq("agency_id", agencyId);
    return { ok: true };
  });

// ---------- Pre-fill competitors for a client ----------
export const getSavedCompetitorsForClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const profile = await getAgencyProfile(context.supabase, context.userId);
    const agencyId = profile.agency_id as string;
    const { data: comps } = await context.supabase
      .from("competitors")
      .select("id, name, domain, created_at")
      .eq("agency_id", agencyId)
      .eq("client_id", data.clientId)
      .order("created_at");
    // Plus latest score per competitor
    const ids = (comps ?? []).map((c: any) => c.id);
    let latestById: Record<string, { score: number | null; created_at: string }> = {};
    if (ids.length) {
      const { data: cas } = await context.supabase
        .from("competitor_audits")
        .select("competitor_id, score, created_at")
        .in("competitor_id", ids)
        .order("created_at", { ascending: false });
      for (const ca of cas ?? []) {
        if (!latestById[ca.competitor_id!]) {
          latestById[ca.competitor_id!] = { score: ca.score, created_at: ca.created_at ?? "" };
        }
      }
    }
    return (comps ?? []).map((c: any) => ({
      ...c,
      latest_score: latestById[c.id]?.score ?? null,
    }));
  });

// ---------- Persist generated PDF URL on the job ----------
export const saveMarketSharePdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ jobId: z.string().uuid(), pdfUrl: z.string().min(1).max(1000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const profile = await getAgencyProfile(context.supabase, context.userId);
    const agencyId = profile.agency_id as string;
    // We don't have a column; stash in error_message? No — leave it client-side
    // for now. (The schema doesn't include a market_share PDF column.)
    // Verify ownership instead and just return ok.
    const { data: j } = await context.supabase
      .from("market_share_jobs")
      .select("agency_id")
      .eq("id", data.jobId)
      .maybeSingle();
    if (!j || j.agency_id !== agencyId) throw new Error("Forbidden");
    return { ok: true };
  });

// ---------- Upload PDF to storage ----------
const UploadPdfInput = z.object({
  jobId: z.string().uuid(),
  clientId: z.string().uuid(),
  pdfBase64: z.string().min(100).max(8_000_000),
});
export const uploadMarketSharePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UploadPdfInput.parse(d))
  .handler(async ({ data, context }) => {
    const profile = await getAgencyProfile(context.supabase, context.userId);
    const agencyId = profile.agency_id as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const path = `${agencyId}/${data.clientId}/market_share_${data.jobId}.pdf`;
    const bytes = Buffer.from(data.pdfBase64, "base64");
    const { error } = await supabaseAdmin.storage
      .from("audit-reports")
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (error) throw new Error(error.message);
    const { data: signed } = await supabaseAdmin.storage
      .from("audit-reports")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    return { ok: true, path, signedUrl: signed?.signedUrl ?? null };
  });
