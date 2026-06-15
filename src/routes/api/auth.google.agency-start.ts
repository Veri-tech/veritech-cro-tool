// Agency-initiated Google OAuth for a specific client.
// Skip token verification here — security is enforced in the callback
// by verifying the clientId belongs to the agency making the request.
import { createFileRoute } from "@tanstack/react-router";
import { setCookie } from "@tanstack/react-start/server";

const GOOGLE_CLIENT_ID = "973934436364-tbnk2an8cb1bptr9atgupo1bqpuhu564.apps.googleusercontent.com";

export const Route = createFileRoute("/api/auth/google/agency-start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const reqUrl = new URL(request.url);
        const clientId = reqUrl.searchParams.get("clientId");
        const userId = reqUrl.searchParams.get("userId");
        const appUrl = `${reqUrl.protocol}//${reqUrl.host}`;

        if (!clientId || !userId) {
          return new Response("Missing clientId or userId", { status: 400 });
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
