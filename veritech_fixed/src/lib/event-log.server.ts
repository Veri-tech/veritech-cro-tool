// Server-only event logger for audit_event_logs table.
// Non-blocking — never throws, never blocks the caller.
// All writes go through service_role to bypass RLS.

export type EventType =
  | "audit_started"
  | "audit_completed"
  | "audit_failed"
  | "invitation_sent"
  | "invitation_accepted"
  | "oauth_connected"
  | "oauth_revoked"
  | "oauth_refresh_failed"
  | "agency_suspended"
  | "agency_unsuspended"
  | "market_share_started"
  | "market_share_completed"
  | "market_share_partial";

export interface LogEventParams {
  eventType: EventType;
  agencyId?: string | null;
  userId?: string | null;
  clientId?: string | null;
  detail?: string | null;
}

export async function logEvent(params: LogEventParams): Promise<void> {
  try {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await supabaseAdmin.from("audit_event_logs").insert({
      event_type: params.eventType,
      agency_id: params.agencyId ?? null,
      user_id: params.userId ?? null,
      client_id: params.clientId ?? null,
      detail: params.detail ?? null,
    });
  } catch (err) {
    // Never let logging failures surface to the user
    console.error("[event-log] Failed to log event:", params.eventType, err);
  }
}
