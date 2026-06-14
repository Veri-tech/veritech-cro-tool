// Semrush OAuth callback. Verifies state, exchanges code, probes which Semrush
// data tiers the connected user can access, and stores everything encrypted.
import { createFileRoute } from "@tanstack/react-router";
import { getCookie, deleteCookie } from "@tanstack/react-start/server";

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

export const Route = createFileRoute("/api/auth/semrush/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reqUrl = new URL(request.url);
        const code = reqUrl.searchParams.get("code");
        const state = reqUrl.searchParams.get("state");
        const cookieState = getCookie("semrush_oauth_state");
        const userId = getCookie("semrush_oauth_uid");

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

        const clientId = process.env.SEMRUSH_CLIENT_ID;
        const clientSecret = process.env.SEMRUSH_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return new Response("Semrush OAuth not configured.", { status: 500 });
        }
        const redirectUri = `${appUrl}/api/auth/semrush/callback`;

        // 1. Exchange code
        const tokenRes = await fetch("https://oauth.semrush.com/oauth2/access_token", {
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

        // 2. Account info
        const meRes = await fetch("https://oauth.semrush.com/oauth2/userinfo", {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const me = meRes.ok
          ? ((await meRes.json()) as { email?: string; plan?: string; id?: string })
          : { email: undefined, plan: undefined, id: undefined };

        // 3. Permission probe — which data APIs work on this plan?
        const trafficRes = await fetch(
          `https://api.semrush.com/analytics/v1/domain/overview?domain=example.com&key=${encodeURIComponent(tokens.access_token)}`,
        );
        const hasTrafficApi = trafficRes.ok;

        const keywordRes = await fetch(
          `https://api.semrush.com/analytics/v1/domain/organic?domain=example.com&key=${encodeURIComponent(tokens.access_token)}`,
        );
        const hasKeywordApi = keywordRes.ok;

        // 4. Encrypt + persist
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

        const up = await supabaseAdmin
          .from("client_integrations")
          .upsert(
            {
              client_id: clientRow.id,
              agency_id: clientRow.agency_id,
              provider: "semrush",
              auth_method: "oauth",
              account_email: me.email ?? null,
              access_token: accessEnc,
              refresh_token: refreshEnc,
              token_expiry: expiry,
              semrush_account_id: me.id ?? null,
              semrush_plan: me.plan ?? null,
              semrush_has_traffic_api: hasTrafficApi,
              semrush_has_keyword_api: hasKeywordApi,
              status: "active",
              last_error: null,
              connected_at: nowIso,
            },
            { onConflict: "client_id,provider" },
          );
        if (up.error) return new Response(up.error.message, { status: 500 });

        // 5. If no traffic API, warn the user via notification
        if (!hasTrafficApi) {
          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            agency_id: clientRow.agency_id,
            type: "integration_insufficient",
            title: "Semrush connected with limited data access",
            body: "Traffic API requires Guru plan or above. Competitor analysis will use AI estimates.",
            link: "/portal/connect",
          });
        }

        deleteCookie("semrush_oauth_state");
        deleteCookie("semrush_oauth_uid");

        return back("?success=semrush");
      },
    },
  },
});
