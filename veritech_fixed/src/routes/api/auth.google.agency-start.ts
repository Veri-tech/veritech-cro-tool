// Agency-initiated Google OAuth for a specific client.
// Agency clicks "Connect GA4" in the integrations dashboard.
// We store the clientId in a cookie, then redirect to Google.
import { createFileRoute } from "@tanstack/react-router";
import { setCookie } from "@tanstack/react-start/server";

export const Route = createFileRoute("/api/auth/google/agency-start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reqUrl = new URL(request.url);
        const clientId = reqUrl.searchParams.get("clientId");
        const token = reqUrl.searchParams.get("token"); // agency's supabase session token
        const appUrl = process.env.APP_URL ?? `${reqUrl.protocol}//${reqUrl.host}`;

        if (!clientId || !token) {
          return new Response("Missing clientId or token", { status: 401 });
        }

        // Verify the agency user's token
        const SUPABASE_URL = "https://afyrxulrwartxwpxfylj.supabase.co";
        const SUPABASE_KEY = "sb_publishable_RGDsMtvVbpbp1uPAlKNHlw_s2uXdY0q";
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "apikey": SUPABASE_KEY,
          },
        });
        if (!userRes.ok) return new Response("Unauthorized", { status: 401 });
        const userData = await userRes.json() as any;
        const userId = userData?.id;
        if (!userId) return new Response("Unauthorized", { status: 401 });

        const googleClientId = process.env.GOOGLE_CLIENT_ID || "973934436364-tbnk2an8cb1bptr9atgupo1bqpuhu564.apps.googleusercontent.com";
        const state = crypto.randomUUID();

        // Store state, userId, and clientId in cookies
        const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: true, maxAge: 600, path: "/" };
        setCookie("google_oauth_state", state, cookieOpts);
        setCookie("google_oauth_uid", userId, cookieOpts);
        setCookie("google_oauth_client_id", clientId, cookieOpts);
        setCookie("google_oauth_mode", "agency", cookieOpts);

        const redirectUri = `${appUrl}/api/auth/google/callback`;
        const scope = [
          "https://www.googleapis.com/auth/analytics.readonly",
          "https://www.googleapis.com/auth/webmasters.readonly",
          "https://www.googleapis.com/auth/userinfo.email",
        ].join(" ");

        const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        authUrl.searchParams.set("client_id", googleClientId);
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
