// Super-admin server functions. Every handler verifies super_admin role.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!data || data.role !== "super_admin") throw new Error("Forbidden");
}

// ------------- Overview -------------
export const getPlatformOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await requireSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const since24h = new Date(Date.now() - 86400_000).toISOString();

    const [agencies, clients, audits, audits24h, failed24h, queue, usage30] = await Promise.all([
      supabaseAdmin.from("agencies").select("id, status", { count: "exact", head: false }),
      supabaseAdmin.from("clients").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("audits").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("audits").select("id", { count: "exact", head: true }).gte("created_at", since24h),
      supabaseAdmin.from("audits").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", since24h),
      supabaseAdmin.from("audit_queue").select("id", { count: "exact", head: true }).eq("status", "running"),
      supabaseAdmin.from("api_usage_log").select("tokens_total, cost_usd").gte("created_at", since30),
    ]);

    const tokens30 = (usage30.data ?? []).reduce((s, r: any) => s + (r.tokens_total ?? 0), 0);
    const cost30 = (usage30.data ?? []).reduce((s, r: any) => s + Number(r.cost_usd ?? 0), 0);
    const activeAgencies = (agencies.data ?? []).filter((a: any) => a.status === "active").length;
    const suspended = (agencies.data ?? []).filter((a: any) => a.status === "suspended").length;

    const { data: recent } = await supabaseAdmin
      .from("audits")
      .select("id, page_url, status, score, created_at, agency_id, agencies(name)")
      .order("created_at", { ascending: false })
      .limit(10);

    return {
      totals: {
        agencies: agencies.count ?? 0,
        activeAgencies,
        suspendedAgencies: suspended,
        clients: clients.count ?? 0,
        audits: audits.count ?? 0,
        audits24h: audits24h.count ?? 0,
        failed24h: failed24h.count ?? 0,
        queueDepth: queue.count ?? 0,
        tokens30,
        cost30,
      },
      recentAudits: recent ?? [],
    };
  });

// ------------- Agencies -------------
export const listAgencies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await requireSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: agencies } = await supabaseAdmin
      .from("agencies")
      .select("id, name, slug, status, contact_email, contact_name, daily_audit_limit, monthly_token_budget, created_at, suspended_reason")
      .order("created_at", { ascending: false });

    const ids = (agencies ?? []).map((a: any) => a.id);
    if (!ids.length) return { agencies: [] };

    const [clients, audits, usage] = await Promise.all([
      supabaseAdmin.from("clients").select("agency_id").in("agency_id", ids),
      supabaseAdmin.from("audits").select("agency_id").in("agency_id", ids),
      supabaseAdmin.from("api_usage_log").select("agency_id, tokens_total, cost_usd")
        .in("agency_id", ids)
        .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
    ]);

    const cByA: Record<string, number> = {};
    const aByA: Record<string, number> = {};
    const tByA: Record<string, number> = {};
    const $ByA: Record<string, number> = {};
    (clients.data ?? []).forEach((r: any) => { cByA[r.agency_id] = (cByA[r.agency_id] ?? 0) + 1; });
    (audits.data ?? []).forEach((r: any) => { aByA[r.agency_id] = (aByA[r.agency_id] ?? 0) + 1; });
    (usage.data ?? []).forEach((r: any) => {
      tByA[r.agency_id] = (tByA[r.agency_id] ?? 0) + (r.tokens_total ?? 0);
      $ByA[r.agency_id] = ($ByA[r.agency_id] ?? 0) + Number(r.cost_usd ?? 0);
    });

    return {
      agencies: (agencies ?? []).map((a: any) => ({
        ...a,
        clients: cByA[a.id] ?? 0,
        audits: aByA[a.id] ?? 0,
        tokens30: tByA[a.id] ?? 0,
        cost30: $ByA[a.id] ?? 0,
      })),
    };
  });

export const setAgencyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agencyId: string; status: "active" | "suspended" | "cancelled"; reason?: string }) =>
    z.object({
      agencyId: z.string().uuid(),
      status: z.enum(["active", "suspended", "cancelled"]),
      reason: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await requireSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const patch: any = { status: data.status };
    if (data.status === "suspended") {
      patch.suspended_reason = data.reason ?? null;
      patch.suspended_at = new Date().toISOString();
    } else {
      patch.suspended_reason = null;
      patch.suspended_at = null;
    }
    const { error } = await supabaseAdmin.from("agencies").update(patch).eq("id", data.agencyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateAgencyLimits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agencyId: string; daily_audit_limit: number; monthly_token_budget: number }) =>
    z.object({
      agencyId: z.string().uuid(),
      daily_audit_limit: z.number().int().min(0).max(10000),
      monthly_token_budget: z.number().int().min(0).max(1_000_000_000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await requireSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("agencies")
      .update({
        daily_audit_limit: data.daily_audit_limit,
        monthly_token_budget: data.monthly_token_budget,
      })
      .eq("id", data.agencyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ------------- All clients (cross-agency) -------------
export const listAllClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await requireSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("clients")
      .select("id, name, domain, industry, monthly_traffic, archived, created_at, agency_id, agencies(name)")
      .order("created_at", { ascending: false })
      .limit(500);
    return { clients: data ?? [] };
  });

// ------------- Usage -------------
export const getUsageBreakdown = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await requireSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: usage } = await supabaseAdmin
      .from("api_usage_log")
      .select("agency_id, tokens_input, tokens_output, tokens_total, cost_usd, created_at")
      .gte("created_at", since30)
      .order("created_at", { ascending: false });

    const { data: agencies } = await supabaseAdmin.from("agencies").select("id, name, monthly_token_budget");

    const byAgency: Record<string, { agency_id: string; name: string; budget: number; tokens: number; cost: number; calls: number }> = {};
    (agencies ?? []).forEach((a: any) => {
      byAgency[a.id] = { agency_id: a.id, name: a.name, budget: a.monthly_token_budget ?? 0, tokens: 0, cost: 0, calls: 0 };
    });
    (usage ?? []).forEach((r: any) => {
      const slot = byAgency[r.agency_id];
      if (!slot) return;
      slot.tokens += r.tokens_total ?? 0;
      slot.cost += Number(r.cost_usd ?? 0);
      slot.calls += 1;
    });

    // Daily series, last 30 days, totals across all agencies
    const days: Record<string, { tokens: number; cost: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const key = d.toISOString().slice(0, 10);
      days[key] = { tokens: 0, cost: 0 };
    }
    (usage ?? []).forEach((r: any) => {
      const key = (r.created_at as string).slice(0, 10);
      if (days[key]) {
        days[key].tokens += r.tokens_total ?? 0;
        days[key].cost += Number(r.cost_usd ?? 0);
      }
    });

    return {
      perAgency: Object.values(byAgency).sort((a, b) => b.tokens - a.tokens),
      daily: Object.entries(days).map(([date, v]) => ({ date, ...v })),
      total: {
        tokens: Object.values(byAgency).reduce((s, a) => s + a.tokens, 0),
        cost: Object.values(byAgency).reduce((s, a) => s + a.cost, 0),
      },
    };
  });

// ------------- Logs -------------
export const getSystemLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await requireSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [recentAudits, failedAudits, queue] = await Promise.all([
      supabaseAdmin
        .from("audits")
        .select("id, page_url, status, score, retry_count, error_message, created_at, agency_id, agencies(name), clients(name)")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("audits")
        .select("id, page_url, status, retry_count, error_message, created_at, agencies(name)")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("audit_queue")
        .select("id, status, started_at, completed_at, audit_id, agency_id, agencies(name)")
        .order("started_at", { ascending: false })
        .limit(25),
    ]);

    return {
      recentAudits: recentAudits.data ?? [],
      failedAudits: failedAudits.data ?? [],
      queue: queue.data ?? [],
    };
  });

// ------------- System config -------------
export const getSystemConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    await requireSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("system_config").select("key, value, updated_at").order("key");
    return { config: data ?? [] };
  });

export const updateSystemConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; value: string }) =>
    z.object({ key: z.string().min(1).max(100), value: z.string().max(10000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as any;
    await requireSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("system_config")
      .upsert({ key: data.key, value: data.value, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
