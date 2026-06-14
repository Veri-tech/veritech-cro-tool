import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAgency(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.role === "client") throw new Error("Forbidden");
  if (!profile.agency_id) throw new Error("No agency");
  return profile.agency_id as string;
}

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ includeArchived: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const agencyId = await getAgency(context.supabase, context.userId);
    let q = context.supabase
      .from("clients")
      .select("id, name, domain, industry, archived, portal_user_id, note_date, created_at, monthly_traffic, avg_order_value")
      .eq("agency_id", agencyId)
      .order("created_at", { ascending: false });
    if (!data.includeArchived) q = q.eq("archived", false);
    const { data: clients } = await q;

    // Latest audit per client (single query then group)
    const ids = (clients ?? []).map((c: any) => c.id);
    let audits: any[] = [];
    if (ids.length) {
      const { data: a } = await context.supabase
        .from("audits")
        .select("id, client_id, score, created_at")
        .in("client_id", ids)
        .eq("status", "completed")
        .order("created_at", { ascending: false });
      audits = a ?? [];
    }
    const latest = new Map<string, any>();
    for (const a of audits) if (!latest.has(a.client_id)) latest.set(a.client_id, a);

    return (clients ?? []).map((c: any) => ({
      ...c,
      latest_score: latest.get(c.id)?.score ?? null,
      last_audit_at: latest.get(c.id)?.created_at ?? null,
    }));
  });

const CreateClientInput = z.object({
  name: z.string().trim().min(2).max(120),
  domain: z.string().trim().max(255).optional().nullable(),
  industry: z.enum(["E-commerce", "Lead Gen", "SaaS", "Services", "Other"]).optional().nullable(),
  contact_name: z.string().trim().max(120).optional().nullable(),
  contact_email: z.string().trim().email().optional().nullable().or(z.literal("")),
  monthly_traffic: z.number().int().nonnegative().optional().nullable(),
  avg_order_value: z.number().nonnegative().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateClientInput.parse(d))
  .handler(async ({ data, context }) => {
    const agencyId = await getAgency(context.supabase, context.userId);
    const { data: row, error } = await context.supabase
      .from("clients")
      .insert({
        agency_id: agencyId,
        name: data.name,
        domain: data.domain || null,
        industry: data.industry || null,
        contact_name: data.contact_name || null,
        contact_email: data.contact_email || null,
        monthly_traffic: data.monthly_traffic ?? null,
        avg_order_value: data.avg_order_value ?? null,
        notes: data.notes || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

const UpdateClientInput = CreateClientInput.partial().extend({ id: z.string().uuid() });
export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateClientInput.parse(d))
  .handler(async ({ data, context }) => {
    const agencyId = await getAgency(context.supabase, context.userId);
    const { id, ...patch } = data;
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) if (v !== undefined) cleaned[k] = v === "" ? null : v;
    const { error } = await context.supabase
      .from("clients")
      .update(cleaned as never)
      .eq("id", id)
      .eq("agency_id", agencyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ToggleArchive = z.object({ id: z.string().uuid(), archived: z.boolean() });
export const setArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ToggleArchive.parse(d))
  .handler(async ({ data, context }) => {
    const agencyId = await getAgency(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("clients")
      .update({ archived: data.archived, archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.id)
      .eq("agency_id", agencyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SetReminder = z.object({ id: z.string().uuid(), days: z.number().int().min(1).max(365) });
export const setAuditReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetReminder.parse(d))
  .handler(async ({ data, context }) => {
    const agencyId = await getAgency(context.supabase, context.userId);
    const date = new Date();
    date.setDate(date.getDate() + data.days);
    await context.supabase
      .from("clients")
      .update({ note_date: date.toISOString().slice(0, 10) })
      .eq("id", data.id)
      .eq("agency_id", agencyId);
    return { ok: true, date: date.toISOString().slice(0, 10) };
  });

const SetNoteDateInput = z.object({
  clientId: z.string().uuid(),
  date: z.string().nullable(), // 'YYYY-MM-DD' or null to clear
});
export const setNoteDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetNoteDateInput.parse(d))
  .handler(async ({ data, context }) => {
    const agencyId = await getAgency(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("clients")
      .update({ note_date: data.date })
      .eq("id", data.clientId)
      .eq("agency_id", agencyId);
    if (error) throw new Error(error.message);
    return { ok: true, date: data.date };
  });

export const getClientDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const agencyId = await getAgency(context.supabase, context.userId);
    const { data: client } = await context.supabase
      .from("clients")
      .select("*")
      .eq("id", data.id)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (!client) throw new Error("Not found");
    const { data: audits } = await context.supabase
      .from("audits")
      .select("id, page_url, page_label, status, score, rating, initiated_by, pdf_url, created_at, error_message")
      .eq("client_id", client.id)
      .order("created_at", { ascending: false });
    const { data: competitors } = await context.supabase
      .from("competitors")
      .select("id, domain, name, created_at")
      .eq("client_id", client.id)
      .order("created_at");
    const competitorIds = (competitors ?? []).map((c: any) => c.id);
    let latestByCompetitor: Record<string, { score: number | null; created_at: string | null }> = {};
    if (competitorIds.length) {
      const { data: cas } = await context.supabase
        .from("competitor_audits")
        .select("competitor_id, score, created_at")
        .in("competitor_id", competitorIds)
        .order("created_at", { ascending: false });
      for (const ca of cas ?? []) {
        if (!ca.competitor_id) continue;
        if (!latestByCompetitor[ca.competitor_id]) {
          latestByCompetitor[ca.competitor_id] = { score: ca.score, created_at: ca.created_at };
        }
      }
    }
    const enrichedCompetitors = (competitors ?? []).map((c: any) => ({
      ...c,
      latest_score: latestByCompetitor[c.id]?.score ?? null,
      latest_audit_at: latestByCompetitor[c.id]?.created_at ?? null,
    }));
    const { data: requests } = await context.supabase
      .from("audit_requests")
      .select("id, page_url, page_label, status, created_at")
      .eq("client_id", client.id)
      .eq("status", "pending");
    const { data: completedAudits } = await context.supabase
      .from("audits")
      .select("id, score, revenue_low, revenue_high, critical_count, created_at, page_label, parsed_data")
      .eq("client_id", client.id)
      .eq("status", "completed")
      .order("created_at", { ascending: true });
    return {
      client,
      audits: audits ?? [],
      competitors: enrichedCompetitors,
      pendingRequests: requests ?? [],
      completedAudits: completedAudits ?? [],
    };
  });

const AddCompetitor = z.object({
  clientId: z.string().uuid(),
  domain: z.string().trim().min(3).max(255),
  name: z.string().trim().max(120).optional().nullable(),
});
export const addCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AddCompetitor.parse(d))
  .handler(async ({ data, context }) => {
    const agencyId = await getAgency(context.supabase, context.userId);
    const { error } = await context.supabase.from("competitors").insert({
      agency_id: agencyId,
      client_id: data.clientId,
      domain: data.domain.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      name: data.name || null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeCompetitor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const agencyId = await getAgency(context.supabase, context.userId);
    await context.supabase.from("competitor_audits").delete().eq("competitor_id", data.id).eq("agency_id", agencyId);
    await context.supabase.from("competitors").delete().eq("id", data.id).eq("agency_id", agencyId);
    return { ok: true };
  });

export const getDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const agencyId = await getAgency(context.supabase, context.userId);
    const { count: clientCount } = await context.supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("archived", false);
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { count: auditsMonth } = await context.supabase
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("status", "completed")
      .gte("created_at", monthStart.toISOString());
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: auditsToday } = await context.supabase
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("status", "completed")
      .gte("created_at", dayAgo);
    const { data: recent } = await context.supabase
      .from("audits")
      .select("id, page_label, score, initiated_by, created_at, clients(name)")
      .eq("agency_id", agencyId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(10);
    return {
      clientCount: clientCount ?? 0,
      auditsThisMonth: auditsMonth ?? 0,
      auditsToday: auditsToday ?? 0,
      recent: recent ?? [],
    };
  });
