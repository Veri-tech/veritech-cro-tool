// Agency-side integration management server functions
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Get GA4 properties and GSC sites for a connected client
export const getClientOAuthProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ clientId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("agency_id, role").eq("id", userId).maybeSingle();
    if (!profile?.agency_id) throw new Error("No agency");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabaseAdmin
      .from("client_integrations")
      .select("provider, ga4_properties_list, gsc_sites_list, account_email, manual_credentials")
      .eq("client_id", data.clientId)
      .in("provider", ["google", "gsc"]);

    const google = rows?.find((r) => r.provider === "google");
    const gsc = rows?.find((r) => r.provider === "gsc");

    return {
      ga4Properties: (google?.ga4_properties_list as any[]) ?? [],
      gscSites: (gsc?.gsc_sites_list as string[]) ?? [],
      accountEmail: google?.account_email ?? gsc?.account_email ?? null,
      ga4Selected: (google?.manual_credentials as any)?.ga4PropertyId ?? null,
      gscSelected: (gsc?.manual_credentials as any)?.siteUrl ?? null,
    };
  });

// Save selected GA4 property and GSC site for a client
export const saveClientOAuthSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    clientId: z.string().uuid(),
    ga4PropertyId: z.string().optional(),
    gscSiteUrl: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("agency_id").eq("id", userId).maybeSingle();
    if (!profile?.agency_id) throw new Error("No agency");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { encryptJSON } = await import("@/lib/crypto.server");

    if (data.ga4PropertyId) {
      const encrypted = await encryptJSON({ ga4PropertyId: data.ga4PropertyId });
      await supabaseAdmin
        .from("client_integrations")
        .update({
          manual_credentials: encrypted,
          auth_method: "oauth",
          status: "active",
        })
        .eq("client_id", data.clientId)
        .eq("provider", "google");
    }

    if (data.gscSiteUrl) {
      const encrypted = await encryptJSON({ siteUrl: data.gscSiteUrl });
      await supabaseAdmin
        .from("client_integrations")
        .update({
          manual_credentials: encrypted,
          auth_method: "oauth",
          status: "active",
        })
        .eq("client_id", data.clientId)
        .eq("provider", "gsc");
    }

    return { ok: true };
  });
