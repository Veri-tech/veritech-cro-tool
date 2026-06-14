// Public-callable server fns for email triggers initiated from the browser
// (welcome, invite-accepted, password-reset request, create-invitation).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  emailWelcome,
  emailInviteAccepted,
  emailInvitation,
  emailPasswordReset,
} from "@/lib/email.server";

// Send welcome email to the agency admin who just signed up.
export const sendWelcomeEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = user?.user?.email;
    const fullName =
      (user?.user?.user_metadata?.full_name as string | undefined) ||
      (user?.user?.email?.split("@")[0] ?? "there");
    if (!email) return { ok: false };
    await emailWelcome({ to: email, fullName });
    return { ok: true };
  });

// Notify all agency admins that an invited client has accepted.
const InviteAcceptedInput = z.object({ clientId: z.string().uuid() });
export const notifyInviteAccepted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InviteAcceptedInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: client } = await supabaseAdmin
      .from("clients")
      .select("id, name, agency_id, portal_user_id")
      .eq("id", data.clientId)
      .maybeSingle();
    if (!client) return { ok: false };
    // Only the client's own portal user may trigger this notification.
    if (client.portal_user_id !== context.userId) throw new Error("Forbidden");
    const { emailAllAgencyAdmins } = await import("@/lib/email.server");
    await emailAllAgencyAdmins(client.agency_id, (to) =>
      emailInviteAccepted({ to, clientName: client.name }),
    );
    // Insert a notification.
    const { insertNotificationsForAgencyAdmins } = await import("@/lib/notifications.server");
    await insertNotificationsForAgencyAdmins(client.agency_id, {
      type: "invite_accepted",
      title: `${client.name} joined the portal`,
      link: `/dashboard/clients`,
    });
    return { ok: true };
  });

// Agency admin creates a client invitation → emails the client.
const CreateInviteInput = z.object({
  clientId: z.string().uuid(),
  email: z.string().email(),
});
export const createClientInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInviteInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("agency_id, role")
      .eq("id", userId)
      .maybeSingle();
    if (!profile || profile.role === "client") throw new Error("Forbidden");
    const agencyId = profile.agency_id;
    if (!agencyId) throw new Error("No agency");
    const { data: client } = await supabase
      .from("clients")
      .select("id, name, agency_id")
      .eq("id", data.clientId)
      .eq("agency_id", agencyId)
      .maybeSingle();
    if (!client) throw new Error("Client not found");
    const { data: agency } = await supabase
      .from("agencies")
      .select("name")
      .eq("id", agencyId)
      .maybeSingle();

    // Create token + invite row (service role bypasses RLS).
    const token = crypto.randomUUID() + crypto.randomUUID().slice(0, 8);
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("client_invitations").insert({
      agency_id: agencyId,
      client_id: client.id,
      email: data.email,
      token,
      accepted: false,
      expires_at: expiresAt,
    });
    if (error) throw new Error(error.message);

    await emailInvitation({
      to: data.email,
      agencyName: agency?.name ?? "Your agency",
      token,
    });
    return { ok: true };
  });

// Wrapper around supabase reset link → custom branded email.
// Public (unauthenticated) so forgot-password works.
const ResetInput = z.object({ email: z.string().email() });
export const requestPasswordReset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ResetInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo =
      (process.env.APP_URL || process.env.VITE_APP_URL || "https://veritechcro.app") +
      "/reset-password";
    const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: data.email,
      options: { redirectTo },
    });
    if (error) {
      // Don't leak whether email exists; treat as silent success.
      console.warn("[email] reset link generate:", error.message);
      return { ok: true };
    }
    const link = linkData?.properties?.action_link;
    if (link) await emailPasswordReset({ to: data.email, link });
    return { ok: true };
  });
