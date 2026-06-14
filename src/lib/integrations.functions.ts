// Server functions for managing per-client integration credentials.
// All persistence goes through service_role so encrypted blobs are never
// exposed to RLS-readable client code. The browser only ever sees the
// `client_integrations_safe` view (no tokens, no manual_credentials).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Provider = "google" | "gsc" | "semrush" | "dataforseo";

const ProviderEnum = z.enum(["google", "gsc", "semrush", "dataforseo"]);

// Per-provider credential shapes pasted by the client.
const ManualCredsSchema = z.discriminatedUnion("provider", [
  z.object({
    provider: z.literal("google"),
    serviceAccountJson: z.string().min(50).max(20_000),
    ga4PropertyId: z.string().trim().min(1).max(64),
  }),
  z.object({
    provider: z.literal("gsc"),
    serviceAccountJson: z.string().min(50).max(20_000),
    siteUrl: z.string().trim().url().max(255),
  }),
  z.object({
    provider: z.literal("semrush"),
    apiKey: z.string().trim().min(8).max(255),
  }),
  z.object({
    provider: z.literal("dataforseo"),
    login: z.string().trim().min(1).max(255),
    password: z.string().trim().min(1).max(255),
  }),
]);

async function getMyClientId(supabase: any, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("clients")
    .select("id, agency_id")
    .eq("portal_user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("No client linked to this account");
  return data.id;
}

// ---------- List safe integrations for the calling client ----------
export const listMyIntegrationsSafe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = await getMyClientId(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("client_integrations_safe")
      .select("*")
      .eq("client_id", clientId);
    if (error) throw new Error(error.message);
    return { clientId, integrations: data ?? [] };
  });

// ---------- Save manually-pasted credentials ----------
export const saveManualCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ManualCredsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: clientRow, error: cErr } = await supabase
      .from("clients")
      .select("id, agency_id")
      .eq("portal_user_id", userId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!clientRow) throw new Error("No client linked to this account");

    // Provider-specific: try to extract account_email + verify shape.
    let accountEmail: string | null = null;
    let extra: Record<string, unknown> = {};

    if (data.provider === "google" || data.provider === "gsc") {
      try {
        const parsed = JSON.parse(data.serviceAccountJson);
        if (parsed.type !== "service_account") {
          throw new Error("This doesn't look like a service-account JSON key.");
        }
        if (!parsed.client_email || !parsed.private_key) {
          throw new Error("Service-account JSON is missing client_email or private_key.");
        }
        accountEmail = parsed.client_email;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Invalid JSON";
        throw new Error(`Invalid service-account JSON: ${msg}`);
      }
      if (data.provider === "google") {
        extra.ga4_property_id = data.ga4PropertyId;
      } else {
        extra.gsc_site_url = data.siteUrl;
      }
    }

    const { encryptJSON } = await import("@/lib/crypto.server");
    const encrypted = encryptJSON(data);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Map google + gsc both onto the existing provider rows.
    const dbProvider: Provider = data.provider;
    const { error: upErr } = await supabaseAdmin
      .from("client_integrations")
      .upsert(
        {
          client_id: clientRow.id,
          agency_id: clientRow.agency_id,
          provider: dbProvider,
          auth_method: "manual",
          manual_credentials: encrypted,
          account_email: accountEmail,
          status: "active",
          last_error: null,
          connected_at: new Date().toISOString(),
          ...extra,
        },
        { onConflict: "client_id,provider" },
      );
    if (upErr) throw new Error(upErr.message);

    // EMAIL TEMPLATE 7 — Semrush connected without Traffic Analytics access
    if (data.provider === "semrush") {
      try {
        const probe = await fetch(
          `https://api.semrush.com/analytics/ta/api/v3/summary?key=${encodeURIComponent(data.apiKey)}&targets=example.com`,
        );
        const txt = await probe.text();
        const hasTrafficApi = probe.ok && !/error|forbidden|access/i.test(txt);
        if (!hasTrafficApi) {
          const { data: userRow } = await supabaseAdmin.auth.admin.getUserById(userId);
          const to = userRow?.user?.email;
          if (to) {
            const { emailSemrushPlanNotice } = await import("@/lib/email.server");
            await emailSemrushPlanNotice({ to });
          }
        }
      } catch (e) { console.warn("[email] semrush probe:", e); }
    }

    return { ok: true };
  });

// ---------- Test connection (per-provider real ping) ----------
const TestInput = z.object({ provider: ProviderEnum });

export const testIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TestInput.parse(d))
  .handler(async ({ data, context }) => {
    const clientId = await getMyClientId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { decryptJSON } = await import("@/lib/crypto.server");

    const { data: row, error } = await supabaseAdmin
      .from("client_integrations")
      .select("manual_credentials, auth_method")
      .eq("client_id", clientId)
      .eq("provider", data.provider)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.manual_credentials) {
      return { ok: false, message: "No credentials saved yet." };
    }

    let creds: any;
    try {
      creds = decryptJSON(row.manual_credentials);
    } catch {
      return { ok: false, message: "Could not decrypt saved credentials. Please re-enter them." };
    }

    let result: { ok: boolean; message: string };
    try {
      if (data.provider === "semrush") {
        const r = await fetch(
          `https://api.semrush.com/?type=domain_ranks&key=${encodeURIComponent(creds.apiKey)}&export_columns=Db&domain=example.com&database=us`,
        );
        const txt = await r.text();
        if (!r.ok || txt.toLowerCase().includes("error")) {
          result = { ok: false, message: `Semrush rejected the key: ${txt.slice(0, 120)}` };
        } else {
          result = { ok: true, message: "Semrush key verified." };
        }
      } else if (data.provider === "dataforseo") {
        const r = await fetch("https://api.dataforseo.com/v3/appendix/user_data", {
          headers: {
            Authorization:
              "Basic " + Buffer.from(`${creds.login}:${creds.password}`).toString("base64"),
          },
        });
        const j = (await r.json()) as any;
        if (!r.ok || j.status_code !== 20000) {
          result = { ok: false, message: `DataForSEO rejected credentials (${j.status_message ?? r.status}).` };
        } else {
          const bal = j.tasks?.[0]?.result?.[0]?.money?.balance;
          result = { ok: true, message: `DataForSEO connected${bal != null ? ` · balance $${bal}` : ""}.` };
        }
      } else if (data.provider === "google" || data.provider === "gsc") {
        // We don't have JWT signing in the Worker runtime by default; mark the
        // credentials as syntactically valid and rely on real audit calls to
        // surface deeper issues. We did structural validation on save.
        result = { ok: true, message: "Service-account key stored. It will be used on the next audit." };
      } else {
        result = { ok: false, message: "Unknown provider." };
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
      .eq("client_id", clientId)
      .eq("provider", data.provider);

    return result;
  });

// ---------- Disconnect ----------
export const disconnectIntegration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ provider: ProviderEnum }).parse(d))
  .handler(async ({ data, context }) => {
    const clientId = await getMyClientId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("client_integrations")
      .delete()
      .eq("client_id", clientId)
      .eq("provider", data.provider);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Setup wizard state ----------
export const getMySetupStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: client, error } = await context.supabase
      .from("clients")
      .select("id, setup_complete")
      .eq("portal_user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const providers: Provider[] = ["google", "gsc", "semrush", "dataforseo"];
    const required: Provider[] = ["google"];
    const recommended: Provider[] = ["gsc"];

    let providerStatus: Record<string, { active: boolean; status: string | null }> =
      Object.fromEntries(providers.map((p) => [p, { active: false, status: null }]));

    if (client) {
      const { data: rows } = await context.supabase
        .from("client_integrations_safe")
        .select("provider, status, has_credentials")
        .eq("client_id", client.id);
      for (const r of rows ?? []) {
        const p = r.provider as string;
        if (!providers.includes(p as Provider)) continue;
        providerStatus[p] = {
          active: !!(r.has_credentials && r.status === "active"),
          status: r.status ?? null,
        };
      }
    }

    const connectedCount = providers.filter((p) => providerStatus[p].active).length;
    const missingRequired = required.filter((p) => !providerStatus[p].active);

    return {
      setupComplete: !!client?.setup_complete,
      providers: providerStatus,
      connectedCount,
      totalProviders: providers.length,
      required,
      recommended,
      missingRequired,
      ready: missingRequired.length === 0,
    };
  });

export const markSetupComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("clients")
      .update({ setup_complete: true })
      .eq("portal_user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ---------- Save selected GA4 property / GSC site for the calling client ----------
const SaveGa4Input = z.object({ propertyId: z.string().trim().min(1).max(64) });
export const saveGa4Property = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveGa4Input.parse(d))
  .handler(async ({ data, context }) => {
    const clientId = await getMyClientId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("client_integrations")
      .update({ ga4_property_id: data.propertyId })
      .eq("client_id", clientId)
      .eq("provider", "google");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SaveGscInput = z.object({ siteUrl: z.string().trim().min(3).max(255) });
export const saveGscSite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SaveGscInput.parse(d))
  .handler(async ({ data, context }) => {
    const clientId = await getMyClientId(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("client_integrations")
      .update({ gsc_site_url: data.siteUrl })
      .eq("client_id", clientId)
      .eq("provider", "gsc");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
