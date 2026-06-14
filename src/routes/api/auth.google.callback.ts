// Google OAuth callback. Verifies CSRF state, exchanges the code for tokens,
// reads userinfo + GA4 properties + GSC sites, encrypts tokens, and upserts
// both a `google` and a `gsc` row in client_integrations.
import { createFileRoute } from "@tanstack/react-router";
import { getCookie, deleteCookie } from "@tanstack/react-start/server";
import { logEvent } from "@/lib/event-log.server";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
};

type GA4Prop = { propertyId: string; displayName: string };

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reqUrl = new URL(request.url);
        const code = reqUrl.searchParams.get("code");
        const state = reqUrl.searchParams.get("state");
        const cookieState = getCookie("google_oauth_state");
        const userId = getCookie("google_oauth_uid");

        const appUrl = process.env.APP_URL ?? `${reqUrl.protocol}//${reqUrl.host}`;
        const back = (qs: string) => Response.redirect(`${appUrl}/portal/connect${qs}`, 302);

        if (!code || !state || !cookieState || state !== cookieState) {
          return new Response("Invalid OAuth state (possible CSRF).", { status: 400 });
        }
        if (!userId) {
          return Response.redirect(
            `${appUrl}/login?redirect=/portal/connect&message=session_expired`,
            302,
          );
        }

        const clientId = (process.env.GOOGLE_CLIENT_ID || '973934436364-tbnk2an8cb1bptr9atgupo1bqpuhu564.apps.googleusercontent.com');
        const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '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');
        if (!clientId || !clientSecret) {
          return new Response("Google OAuth not configured.", { status: 500 });
        }
        const redirectUri = `${appUrl}/api/auth/google/callback`;

        // 1. Exchange code for tokens
        const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: redirectUri,
          }),
        });
        if (!tokenRes.ok) {
          const t = await tokenRes.text();
          return new Response(`Token exchange failed: ${t}`, { status: 400 });
        }
        const tokens = (await tokenRes.json()) as TokenResponse;

        // 2. Account email
        const meRes = await fetch("https://www.googleapis.com/userinfo/v2/me", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const me = meRes.ok ? ((await meRes.json()) as { email?: string }) : { email: undefined };

        // 3. GA4 properties
        const ga4Properties: GA4Prop[] = [];
        const ga4Res = await fetch(
          "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
          { headers: { Authorization: `Bearer ${tokens.access_token}` } },
        );
        if (ga4Res.ok) {
          const g = (await ga4Res.json()) as any;
          for (const acc of g.accountSummaries ?? []) {
            for (const p of acc.propertySummaries ?? []) {
              const raw = (p.property as string) ?? "";
              ga4Properties.push({
                propertyId: raw.replace("properties/", ""),
                displayName: p.displayName ?? raw,
              });
            }
          }
        }

        // 4. GSC sites
        const gscSites: string[] = [];
        const gscRes = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        if (gscRes.ok) {
          const g = (await gscRes.json()) as any;
          for (const s of g.siteEntry ?? []) {
            if (s.siteUrl && s.permissionLevel && s.permissionLevel !== "siteUnverifiedUser") {
              gscSites.push(s.siteUrl as string);
            }
          }
        }

        // 5. Encrypt tokens + persist
        const { encryptString } = await import("@/lib/crypto.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: clientRow, error: clientErr } = await supabaseAdmin
          .from("clients")
          .select("id, agency_id")
          .eq("portal_user_id", userId)
          .maybeSingle();
        if (clientErr) return new Response(clientErr.message, { status: 500 });
        if (!clientRow) {
          return new Response("No client linked to this account.", { status: 400 });
        }

        const accessEnc = encryptString(tokens.access_token);
        const refreshEnc = tokens.refresh_token ? encryptString(tokens.refresh_token) : null;
        const expiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
        const nowIso = new Date().toISOString();

        const base = {
          client_id: clientRow.id,
          agency_id: clientRow.agency_id,
          auth_method: "oauth" as const,
          account_email: me.email ?? null,
          access_token: accessEnc,
          refresh_token: refreshEnc,
          token_expiry: expiry,
          status: "active" as const,
          last_error: null,
          connected_at: nowIso,
        };

        const upGoogle = await supabaseAdmin
          .from("client_integrations")
          .upsert(
            { ...base, provider: "google", ga4_properties_list: ga4Properties as any },
            { onConflict: "client_id,provider" },
          );
        if (upGoogle.error) return new Response(upGoogle.error.message, { status: 500 });

        const upGsc = await supabaseAdmin
          .from("client_integrations")
          .upsert(
            { ...base, provider: "gsc", gsc_sites_list: gscSites as any },
            { onConflict: "client_id,provider" },
          );
        if (upGsc.error) return new Response(upGsc.error.message, { status: 500 });

        deleteCookie("google_oauth_state");
        deleteCookie("google_oauth_uid");

        void logEvent({
          eventType: "oauth_connected",
          userId,
          clientId: clientRow.id,
          detail: "provider=google email=" + email,
        });
        return back("?success=google");
      },
    },
  },
});
