// Per-client audit history endpoint. Uses the bearer token to RLS-scope reads
// and validates client ownership before allowing access.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function unauthorized(msg = "Unauthorized") {
  return new Response(msg, { status: 401 });
}

async function authedClient(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
  const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { supabase, userId: user.id };
}

const ClientIdSchema = z.object({ clientId: z.string().uuid() });

export const Route = createFileRoute("/api/memory")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ctx = await authedClient(request);
        if (!ctx) return unauthorized();

        const url = new URL(request.url);
        const parsed = ClientIdSchema.safeParse({ clientId: url.searchParams.get("clientId") });
        if (!parsed.success) return new Response("Missing clientId", { status: 400 });
        const clientId = parsed.data.clientId;

        const { data: profile } = await ctx.supabase
          .from("profiles").select("agency_id, role").eq("id", ctx.userId).maybeSingle();
        if (!profile) return unauthorized("Profile not found");

        // Verify access: agency_admin sees own agency's client; client sees only their own.
        let allowed = false;
        if (profile.role === "super_admin") {
          allowed = true;
        } else if (profile.role === "agency_admin") {
          const { data: c } = await ctx.supabase
            .from("clients").select("id")
            .eq("id", clientId).eq("agency_id", profile.agency_id ?? "").maybeSingle();
          allowed = !!c;
        } else if (profile.role === "client") {
          const { data: c } = await ctx.supabase
            .from("clients").select("id")
            .eq("id", clientId).eq("portal_user_id", ctx.userId).maybeSingle();
          allowed = !!c;
        }
        if (!allowed) return new Response("Forbidden", { status: 403 });

        const { data: audits, error } = await ctx.supabase
          .from("audits")
          .select("id, page_url, page_label, score, rating, status, pdf_url, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false });
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ audits: audits ?? [] });
      },

      DELETE: async ({ request }) => {
        const ctx = await authedClient(request);
        if (!ctx) return unauthorized();

        const url = new URL(request.url);
        const parsed = ClientIdSchema.safeParse({ clientId: url.searchParams.get("clientId") });
        if (!parsed.success) return new Response("Missing clientId", { status: 400 });
        const clientId = parsed.data.clientId;

        const { data: profile } = await ctx.supabase
          .from("profiles").select("agency_id, role").eq("id", ctx.userId).maybeSingle();
        if (!profile) return unauthorized("Profile not found");

        // Agency admin (own agency) or super_admin only.
        if (profile.role === "client") return new Response("Forbidden", { status: 403 });
        if (profile.role === "agency_admin") {
          const { data: c } = await ctx.supabase
            .from("clients").select("id")
            .eq("id", clientId).eq("agency_id", profile.agency_id ?? "").maybeSingle();
          if (!c) return new Response("Forbidden", { status: 403 });
        }

        const { error } = await ctx.supabase
          .from("audits").delete().eq("client_id", clientId);
        if (error) return new Response(error.message, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
