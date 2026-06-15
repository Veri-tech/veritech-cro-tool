// Agency-initiated Google OAuth for a specific client.
import { createFileRoute } from "@tanstack/react-router";
import { setCookie } from "@tanstack/react-start/server";

const SUPABASE_URL = "https://afyrxulrwartxwpxfylj.supabase.co";
// Use the anon/publishable key for auth verification
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFmeXJ4dWxyd2FydHh3cHhmeWxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNzI1MzcsImV4cCI6MjA5Njg0ODUzN30.RGDsMtvVbpbp1uPAlKNHlw_s2uXdY0q";
const GOOGLE_CLIENT_ID = "973934436364-tbnk2an8cb1bptr9atgupo1bqpuhu564.apps.googleusercontent.com";

export const Route = createFileRoute("/api/auth/google/agency-start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reqUrl = new URL(request.url);
        const clientId = reqUrl.searchParams.get("clientId");
        const token = reqUrl.searchParams.get("token");

        // Use request URL as base (works in all runtimes)
        const appUrl = `${reqUrl.protocol}//${reqUrl.host}`;

        if (!clientId || !token) {
          return new Response("Missing clientId or token", { status: 400 });
        }

        // Verify the agency user's Supabase JWT token
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "apikey": SUPABASE_ANON_KEY,
          },
        });

        if (!userRes.ok) {
          return new Response("Unauthorized", { status: 401 });
        }

        const userData = await userRes.json() as any;
        const userId = userData?.id;
        if (!userId) {
          return new Response("Unauthorized", { status: 401 });
        }

        const state = crypto.randomUUID();
        const cookieOpts = {
          httpOnly: true,
          sameSite: "lax" as const,
          secure: true,
          maxAge: 600,
          path: "/",
        };

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
        authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
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
