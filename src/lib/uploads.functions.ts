// Server-side: persist the storage path of a freshly uploaded PDF on the audit row.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const savePdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ auditId: z.string().uuid(), path: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles").select("agency_id, role").eq("id", context.userId).maybeSingle();
    if (!profile || profile.role === "client") throw new Error("Forbidden");
    const { data: audit } = await context.supabase
      .from("audits").select("id, agency_id").eq("id", data.auditId).maybeSingle();
    if (!audit || audit.agency_id !== profile.agency_id) throw new Error("Forbidden");
    const { error } = await context.supabase
      .from("audits").update({ pdf_url: data.path }).eq("id", data.auditId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPdfSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ auditId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles").select("agency_id, role").eq("id", context.userId).maybeSingle();
    if (!profile) throw new Error("Forbidden");
    const { data: audit } = await context.supabase
      .from("audits").select("id, agency_id, pdf_url, client_id").eq("id", data.auditId).maybeSingle();
    if (!audit) throw new Error("Not found");
    const isAgencyMember = profile.role !== "client" && audit.agency_id === profile.agency_id;
    let isClient = false;
    if (!isAgencyMember && profile.role === "client") {
      const { data: c } = await context.supabase
        .from("clients").select("id").eq("id", audit.client_id).eq("portal_user_id", context.userId).maybeSingle();
      isClient = !!c;
    }
    if (!isAgencyMember && !isClient && profile.role !== "super_admin") throw new Error("Forbidden");
    if (!audit.pdf_url) return { url: null };

    const { data: signed, error } = await context.supabase.storage
      .from("audit-reports").createSignedUrl(audit.pdf_url, 60 * 10);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
