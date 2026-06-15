// Agency-side server fns: list clients' integration status, run admin
// test/disconnect actions, manage API keys, manual data, and compute audit readiness.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logEvent } from "@/lib/event-log.server";

type Provider = "google" | "gsc" | "semrush" | "dataforseo" | "manual";
const ProviderEnum = z.enum(["google", "gsc", "semrush", "dataforseo", "manual"]);

export const REQUIRED_PROVIDERS: Provider[] = [];  // Nothing required — any source works
export const RECOMMENDED_PROVIDERS: Provider[] = ["google"];
export const ALL_PROVIDERS: Provider[] = ["google", "gsc", "semrush", "dataforseo", "manual"];
export const DATA_PROVIDERS: Provider[] = ["google", "gsc", "semrush", "dataforseo", "manual"];

export const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Google Analytics 4",
  gsc: "Google Search Console",
  semrush: "Semrush",
  dataforseo: "DataForSEO",
  manual: "Manual Data",
};

export const PROVIDER_DESCRIPTIONS: Record<Provider, string> = {
  google: "Pull real GA4 sessions, users, conversion rate & bounce rate automatically",
  gsc: "Pull search clicks, impressions, CTR & position from Search Console",
  semrush: "Pull organic keywords & traffic estimates (paid Semrush account required)",
  dataforseo: "Free alternative to Semrush for organic traffic data",
  manual: "Manually enter analytics data for clients without connected accounts",
};

export const PROVIDER_FREE: Record<Provider, boolean> = {
  google: true,   // free via OAuth
  gsc: true,      // free via OAuth
  semrush: false, // paid
  dataforseo: true, // free tier available
  manual: true,   // always free
};

async function requireAgencyProfile(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("agency_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.role === "client") throw new Error("Forbidden");
  if (!profile.agency_id) throw new Error("No agency");
  return profile as { agency_id: string; role: string };
}

async function requireClientInAgency(supabase: any, clientId: string, agencyId: string) {
  const { data: c } = await supabase
    .from("clients")
    .select("id, name, agency_id")
    .eq("id", clientId)
    .maybeSingle();
  if (!c || c.agency_id !== agencyId) throw new Error("Client not found");
  return c as { id: string; name: string; agency_id: string };
}

// ---------- List all clients with per-provider status ----------
export const listAgencyIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const profile = await requireAgencyProfile(supabase, userId);

    const { data: clients, error: cErr } = await supabase
      .from("clients")
      .select("id, name, domain, setup_complete, portal_user_id")
      .eq("agency_id", profile.agency_id)
      .order("name", { ascending: true });
    if (cErr) throw new Error(cErr.message);

    const { data: integrations, error: iErr } = await supabase
      .from("client_integrations_safe")
      .select("client_id, provider, status, account_email, last_synced_at, last_error, has_credentials, auth_method")
      .eq("agency_id", profile.agency_id);
    if (iErr) throw new Error(iErr.message);

    const byClient = new Map<string, Record<string, any>>();
    for (const row of integrations ?? []) {
      const m = byClient.get(row.client_id!) ?? {};
      m[row.provider as string] = row;
      byClient.set(row.client_id!, m);
    }

    // Get agency-level settings (DataForSEO agency key, etc.)
    const { data: agencySettings } = await supabase
      .from("agencies")
      .select("settings")
      .eq("id", profile.agency_id)
      .maybeSingle();

    const agencyApiKeys = (agencySettings?.settings as any)?.apiKeys ?? {};

    const rows = (clients ?? []).map((c) => {
      const m = byClient.get(c.id) ?? {};

      // Inject agency-level keys as virtual "active" provider rows
      const agencyProviders = ["dataforseo", "semrush"] as const;
      for (const p of agencyProviders) {
        if (agencyApiKeys[p] && !m[p]) {
          m[p] = {
            has_credentials: true,
            status: "active",
            account_email: "Agency key",
            last_synced_at: null,
            last_error: null,
            auth_method: "agency",
          };
        }
      }

      const connectedCount = DATA_PROVIDERS.filter(
        (p) => m[p]?.has_credentials && m[p]?.status === "active",
      ).length;
      const hasAnyDataSource = connectedCount > 0;
      return {
        id: c.id,
        name: c.name,
        domain: c.domain,
        setup_complete: !!c.setup_complete,
        has_portal_user: !!c.portal_user_id,
        providers: Object.fromEntries(ALL_PROVIDERS.map((p) => [p, m[p] ?? null])),
        connectedCount,
        totalProviders: DATA_PROVIDERS.length,
        ready: hasAnyDataSource,
        missingRequired: hasAnyDataSource ? [] : ["any"],
      };
    });

    return { rows, agencyApiKeys };
  });

// ---------- Save agency-level API key (DataForSEO, etc.) ----------
export const saveAgencyApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    provider: z.enum(["dataforseo", "semrush"]),
    credentials: z.record(z.string()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireAgencyProfile(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptJSON } = await import("@/lib/crypto.server");

    const encrypted = await encryptJSON(data.credentials);

    // Store in agencies.settings.apiKeys
    const { data: agency } = await supabaseAdmin
      .from("agencies")
      .select("settings")
      .eq("id", profile.agency_id)
      .maybeSingle();

    const currentSettings = (agency?.settings as any) ?? {};
    const apiKeys = currentSettings.apiKeys ?? {};
    apiKeys[data.provider] = encrypted;

    await supabaseAdmin
      .from("agencies")
      .update({ settings: { ...currentSettings, apiKeys } })
      .eq("id", profile.agency_id);

    return { ok: true };
  });

// ---------- Save manual data for a client ----------
export const saveManualData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    clientId: z.string().uuid(),
    data: z.object({
      sessions: z.number().optional(),
      users: z.number().optional(),
      conversion_rate: z.number().optional(),
      bounce_rate: z.number().optional(),
      avg_order_value: z.number().optional(),
      organic_keywords: z.number().optional(),
      organic_traffic: z.number().optional(),
      clicks: z.number().optional(),
      impressions: z.number().optional(),
    }),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireAgencyProfile(supabase, userId);
    await requireClientInAgency(supabase, data.clientId, profile.agency_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptJSON } = await import("@/lib/crypto.server");

    const encrypted = await encryptJSON(data.data);

    await supabaseAdmin
      .from("client_integrations")
      .upsert({
        client_id: data.clientId,
        agency_id: profile.agency_id,
        provider: "manual",
        auth_method: "manual",
        manual_credentials: encrypted,
        status: "active",
        last_synced_at: new Date().toISOString(),
        last_error: null,
      }, { onConflict: "client_id,provider" });

    return { ok: true };
  });

// ---------- Toggle provider enabled/disabled for a client ----------
export const toggleClientProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    clientId: z.string().uuid(),
    provider: ProviderEnum,
    enabled: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireAgencyProfile(supabase, userId);
    await requireClientInAgency(supabase, data.clientId, profile.agency_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("client_integrations")
      .update({ status: data.enabled ? "active" : "disabled" })
      .eq("client_id", data.clientId)
      .eq("provider", data.provider);

    return { ok: true };
  });

// ---------- Readiness for a single client (agency-side) ----------
export const getClientReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const profile = await requireAgencyProfile(supabase, userId);
    await requireClientInAgency(supabase, data.clientId, profile.agency_id);

    const { data: rows } = await supabase
      .from("client_integrations_safe")
      .select("provider, status, has_credentials, last_error, last_synced_at, account_email")
      .eq("client_id", data.clientId);

    const map = new Map<string, any>();
    for (const r of rows ?? []) map.set(r.provider as string, r);

    const providers = Object.fromEntries(
      ALL_PROVIDERS.map((p) => {
        const r = map.get(p);
        const active = !!(r?.has_credentials && r.status === "active");
        return [p, { active, status: r?.status ?? null, last_error: r?.last_error ?? null, last_synced_at: r?.last_synced_at ?? null, account_email: r?.account_email ?? null }];
      }),
    );

    const hasAnyActive = ALL_PROVIDERS.some((p) => providers[p].active);

    return {
      ready: hasAnyActive,
      providers,
      missingRequired: hasAnyActive ? [] : ["any"],
      missingRecommended: [],
      required: [],
      recommended: RECOMMENDED_PROVIDERS,
    };
  });

// ---------- Server-side helper used by runAudit ----------
export async function assertClientReady(supabaseAdmin: any, clientId: string) {
  const { data: rows } = await supabaseAdmin
    .from("client_integrations")
    .select("provider, status, manual_credentials")
    .eq("client_id", clientId);
  const map = new Map<string, any>();
  for (const r of rows ?? []) map.set(r.provider as string, r);
  const hasAny = ALL_PROVIDERS.some((p) => {
    const r = map.get(p);
    return r?.manual_credentials && r.status === "active";
  });
  if (!hasAny) {
    const err = new Error(
      `Cannot run audit — no data sources configured. Add a GA4 connection, DataForSEO key, or enter manual data in the Integrations section.`,
    );
    (err as any).code = "INTEGRATIONS_MISSING";
    throw err;
  }
}

// ---------- Admin: test a client's integration ----------
const AdminTestInput = z.object({ clientId: z.string().uuid(), provider: ProviderEnum });
export const adminTestIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdminTestInput.parse(d))
  .handler(async ({ data, context }) => {
    const profile = await requireAgencyProfile(context.supabase, context.userId);
    await requireClientInAgency(context.supabase, data.clientId, profile.agency_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptJSON } = await import("@/lib/crypto.server");

    const { data: row } = await supabaseAdmin
      .from("client_integrations")
      .select("manual_credentials")
      .eq("client_id", data.clientId)
      .eq("provider", data.provider)
      .maybeSingle();
    if (!row?.manual_credentials) {
      return { ok: false, message: "No credentials saved for this client." };
    }
    let creds: any;
    try { creds = await decryptJSON(row.manual_credentials); }
    catch { return { ok: false, message: "Could not decrypt saved credentials." }; }

    let result: { ok: boolean; message: string };
    try {
      if (data.provider === "manual") {
        result = { ok: true, message: "Manual data saved and ready." };
      } else if (data.provider === "semrush") {
        const r = await fetch(
          `https://api.semrush.com/?type=domain_ranks&key=${encodeURIComponent(creds.apiKey)}&export_columns=Db&domain=example.com&database=us`,
        );
        const txt = await r.text();
        result = !r.ok || txt.toLowerCase().includes("error")
          ? { ok: false, message: `Semrush rejected the key: ${txt.slice(0, 120)}` }
          : { ok: true, message: "Semrush key verified." };
      } else if (data.provider === "dataforseo") {
        const r = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
          headers: { Authorization: "Basic " + Buffer.from(`${creds.login}:${creds.password}`).toString("base64") },
        });
        const j = (await r.json()) as any;
        result = !r.ok || j.status_code !== 20000
          ? { ok: false, message: `DataForSEO rejected credentials (${j.status_message ?? r.status}).` }
          : { ok: true, message: `DataForSEO connected.` };
      } else {
        result = { ok: true, message: "Service-account key stored. Used on next audit." };
      }
    } catch (e) {
      result = { ok: false, message: e instanceof Error ? e.message.slice(0, 200) : "Test failed" };
    }

    await supabaseAdmin
      .from("client_integrations")
      .update({
        last_synced_at: new Date().toISOString(),
        status: result.ok ? "active" : "requires_reauth",
        last_error: result.ok ? null : result.message,
      })
      .eq("client_id", data.clientId)
      .eq("provider", data.provider);

    return result;
  });

// ---------- Admin: disconnect a client's integration ----------
export const adminDisconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdminTestInput.parse(d))
  .handler(async ({ data, context }) => {
    const profile = await requireAgencyProfile(context.supabase, context.userId);
    await requireClientInAgency(context.supabase, data.clientId, profile.agency_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("client_integrations")
      .delete()
      .eq("client_id", data.clientId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    void logEvent({
      eventType: "oauth_revoked",
      agencyId: profile.agency_id,
      clientId: data.clientId,
      detail: `provider=${data.provider}`,
    });
    return { ok: true };
  });
