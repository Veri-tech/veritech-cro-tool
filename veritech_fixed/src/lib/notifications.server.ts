// Server-only helper for inserting notifications using the service role.
// The notifications RLS policy is `user_id = auth.uid()` for ALL ops, so the
// per-request user client cannot insert notifications targeting other users.
// We use the admin client (bypasses RLS) and validate inputs at the call site.

export type NotificationType =
  | "audit_complete"
  | "audit_requested"
  | "audit_failed"
  | "integration_expired"
  | "integration_insufficient"
  | "usage_warning"
  | "invite_accepted"
  | "new_report_ready"
  | "market_share_complete"
  | "market_share_partial";

export interface NotificationInput {
  userId: string;
  agencyId?: string | null;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
}

export async function insertNotification(input: NotificationInput): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("notifications").insert({
    user_id: input.userId,
    agency_id: input.agencyId ?? null,
    type: input.type,
    title: input.title.slice(0, 240),
    body: (input.body ?? "").slice(0, 1000) || null,
    link: input.link ?? null,
  });
  if (error) console.error("[notifications] insert failed:", error.message);
}

export async function insertNotificationsForAgencyAdmins(
  agencyId: string,
  payload: Omit<NotificationInput, "userId" | "agencyId">,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admins } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("agency_id", agencyId)
    .eq("role", "agency_admin");
  const ids = (admins ?? []).map((a) => a.id);
  if (ids.length === 0) return;
  const rows = ids.map((id) => ({
    user_id: id,
    agency_id: agencyId,
    type: payload.type,
    title: payload.title.slice(0, 240),
    body: (payload.body ?? "").slice(0, 1000) || null,
    link: payload.link ?? null,
  }));
  const { error } = await supabaseAdmin.from("notifications").insert(rows);
  if (error) console.error("[notifications] bulk insert failed:", error.message);
}
