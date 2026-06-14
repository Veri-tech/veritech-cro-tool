// Initiates the Google OAuth flow for the signed-in portal client.
// The browser passes the user's Supabase access token as ?token=... so we
// can identify them server-side, then we set httpOnly state+uid cookies
// and redirect to Google.
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

export const Route = createFileRoute("/api/auth/google/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reqUrl = new URL(request.url);
        const token = reqUrl.searchParams.get("token");
        if (!token) return new Response("Missing token", { status: 401 });

        const userId = await verifyToken(token);
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const clientId = (process.env.GOOGLE_CLIENT_ID || '973934436364-tbnk2an8cb1bptr9atgupo1bqpuhu564.apps.googleusercontent.com');
        const appUrl = process.env.APP_URL;
        if (!clientId || !appUrl) {
          return new Response(
            "Google OAuth not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_URL.",
            { status: 500 },
          );
        }

        const state = crypto.randomUUID();
        setCookie("google_oauth_state", state, {
          httpOnly: true, sameSite: "lax", secure: true, maxAge: 600, path: "/",
        });
        setCookie("google_oauth_uid", userId, {
          httpOnly: true, sameSite: "lax", secure: true, maxAge: 600, path: "/",
        });

        const redirectUri = `${appUrl}/api/auth/google/callback`;
        const scope = [
          "https://www.googleapis.com/auth/analytics.readonly",
          "https://www.googleapis.com/auth/webmasters.readonly",
          "https://www.googleapis.com/auth/userinfo.email",
        ].join(" ");

        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", clientId);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", scope);
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
        authUrl.searchParams.set("state", state);

        return Response.redirect(authUrl.toString(), 302);
      },
    },
  },
});
