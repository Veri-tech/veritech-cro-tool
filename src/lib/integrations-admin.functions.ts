// Agency-side server fns: list clients' integration status, run admin
// test/disconnect actions, and compute audit readiness.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Provider = "google" | "gsc" | "semrush" | "dataforseo";
const ProviderEnum = z.enum(["google", "gsc", "semrush", "dataforseo"]);

// Required = bare minimum the audit pipeline needs for real (non-estimated) data.
// Recommended = nice-to-have, audit still runs without it.
export const REQUIRED_PROVIDERS: Provider[] = ["google"];
export const RECOMMENDED_PROVIDERS: Provider[] = ["gsc"];
export const ALL_PROVIDERS: Provider[] = ["google", "gsc", "semrush", "dataforseo"];

export const PROVIDER_LABELS: Record<Provider, string> = {
  google: "Google Analytics 4",
  gsc: "Google Search Console",
  semrush: "Semrush",
  dataforseo: "DataForSEO",
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
      .select("client_id, provider, status, account_email, last_synced_at, last_error, has_credentials")
      .eq("agency_id", profile.agency_id);
    if (iErr) throw new Error(iErr.message);

    const byClient = new Map<string, Record<string, any>>();
    for (const row of integrations ?? []) {
      const m = byClient.get(row.client_id!) ?? {};
      m[row.provider as string] = row;
      byClient.set(row.client_id!, m);
    }

    const rows = (clients ?? []).map((c) => {
      const m = byClient.get(c.id) ?? {};
      const connectedCount = ALL_PROVIDERS.filter(
        (p) => m[p]?.has_credentials && m[p]?.status === "active",
      ).length;
      const missingRequired = REQUIRED_PROVIDERS.filter(
        (p) => !(m[p]?.has_credentials && m[p]?.status === "active"),
      );
      return {
        id: c.id,
        name: c.name,
        domain: c.domain,
        setup_complete: !!c.setup_complete,
        has_portal_user: !!c.portal_user_id,
        providers: Object.fromEntries(ALL_PROVIDERS.map((p) => [p, m[p] ?? null])),
        connectedCount,
        totalProviders: ALL_PROVIDERS.length,
        ready: missingRequired.length === 0,
        missingRequired,
      };
    });

    return { rows };
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

    const missingRequired = REQUIRED_PROVIDERS.filter((p) => !providers[p].active);
    const missingRecommended = RECOMMENDED_PROVIDERS.filter((p) => !providers[p].active);

    return {
      ready: missingRequired.length === 0,
      providers,
      missingRequired,
      missingRecommended,
      required: REQUIRED_PROVIDERS,
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
  const missing = REQUIRED_PROVIDERS.filter((p) => {
    const r = map.get(p);
    return !(r?.manual_credentials && r.status === "active");
  });
  if (missing.length) {
    const labels = missing.map((p) => PROVIDER_LABELS[p]).join(", ");
    const err = new Error(
      `Cannot run audit — missing required integration(s): ${labels}. Ask the client to connect them from the portal's Connect Tools page, or paste the credentials yourself.`,
    );
    (err as any).code = "INTEGRATIONS_MISSING";
    (err as any).missing = missing;
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
    try { creds = decryptJSON(row.manual_credentials); }
    catch { return { ok: false, message: "Could not decrypt saved credentials." }; }

    let result: { ok: boolean; message: string };
    try {
      if (data.provider === "semrush") {
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
        // google / gsc — structural validation already happened on save
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

    // EMAIL TEMPLATE 6 — Google/GSC connection expired → client
    if (!result.ok && (data.provider === "google" || data.provider === "gsc")) {
      try {
        const { data: client } = await supabaseAdmin
          .from("clients").select("portal_user_id").eq("id", data.clientId).maybeSingle();
        if (client?.portal_user_id) {
          const { data: pu } = await supabaseAdmin.auth.admin.getUserById(client.portal_user_id);
          const to = pu?.user?.email;
          if (to) {
            const { emailGoogleExpired } = await import("@/lib/email.server");
            await emailGoogleExpired({ to });
          }
        }
      } catch (e) { console.warn("[email] google-expired:", e); }
    }

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
    return { ok: true };
  });
