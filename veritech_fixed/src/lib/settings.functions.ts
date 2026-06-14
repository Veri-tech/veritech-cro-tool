import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAgencyId(supabase: any, userId: string): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles").select("agency_id, role").eq("id", userId).maybeSingle();
  if (!profile || profile.role === "client") throw new Error("Forbidden");
  if (!profile.agency_id) throw new Error("No agency");
  return profile.agency_id;
}

export const getAgencySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const agencyId = await getAgencyId(context.supabase, context.userId);
    const { data: agency } = await context.supabase
      .from("agencies")
      .select("id, name, slug, logo_url, primary_color, contact_email, contact_name, daily_audit_limit, monthly_token_budget, status")
      .eq("id", agencyId)
      .maybeSingle();
    if (!agency) throw new Error("Agency not found");

    // Usage this month
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const { data: usageRows } = await context.supabase
      .from("api_usage_log")
      .select("tokens_input, tokens_output, tokens_total, cost_usd, created_at")
      .eq("agency_id", agencyId)
      .gte("created_at", monthStart.toISOString());

    const tokensUsed = (usageRows ?? []).reduce((s: number, r: any) => s + (r.tokens_total ?? 0), 0);
    const costUsd = (usageRows ?? []).reduce((s: number, r: any) => s + Number(r.cost_usd ?? 0), 0);

    // Audits today
    const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: auditsToday } = await context.supabase
      .from("audits")
      .select("*", { count: "exact", head: true })
      .eq("agency_id", agencyId)
      .eq("status", "completed")
      .gte("created_at", dayAgo);

    return { agency, usage: { tokensUsed, costUsd, auditsToday: auditsToday ?? 0 } };
  });

const BrandingInput = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  primary_color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  logo_url: z.string().url().nullable().optional(),
  contact_email: z.string().trim().email().optional().nullable().or(z.literal("")),
  contact_name: z.string().trim().max(120).optional().nullable(),
});

export const updateAgencyBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BrandingInput.parse(d))
  .handler(async ({ data, context }) => {
    const agencyId = await getAgencyId(context.supabase, context.userId);
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) if (v !== undefined) patch[k] = v === "" ? null : v;
    const { error } = await context.supabase.from("agencies").update(patch as never).eq("id", agencyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
