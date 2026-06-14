// Initiates the Semrush OAuth flow for the signed-in portal client.
import { createFileRoute } from "@tanstack/react-router";
import { setCookie } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";

async function verifyToken(token: string): Promise<string | null> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

export const Route = createFileRoute("/api/auth/semrush/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reqUrl = new URL(request.url);
        const token = reqUrl.searchParams.get("token");
        if (!token) return new Response("Missing token", { status: 401 });

        const userId = await verifyToken(token);
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const clientId = process.env.SEMRUSH_CLIENT_ID;
        const appUrl = process.env.APP_URL;
        if (!clientId || !appUrl) {
          return new Response(
            "Semrush OAuth not configured. Set SEMRUSH_CLIENT_ID, SEMRUSH_CLIENT_SECRET and APP_URL.",
            { status: 500 },
          );
        }

        const state = crypto.randomUUID();
        setCookie("semrush_oauth_state", state, {
          httpOnly: true, sameSite: "lax", secure: true, maxAge: 600, path: "/",
        });
        setCookie("semrush_oauth_uid", userId, {
          httpOnly: true, sameSite: "lax", secure: true, maxAge: 600, path: "/",
        });

        const redirectUri = `${appUrl}/api/auth/semrush/callback`;
        const authUrl = new URL("https://oauth.semrush.com/oauth2/authorize");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", "user.id,domains.info,analytics.traffic");
        authUrl.searchParams.set("state", state);

        return Response.redirect(authUrl.toString(), 302);
      },
    },
  },
});
