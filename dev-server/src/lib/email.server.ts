// Server-only email sender. Uses Resend HTTP API if RESEND_API_KEY is set,
// otherwise logs the payload and returns a stubbed message id (so triggers
// stay wired and the platform can ship before final SMTP/domain config).
//
// All templates: navy header (#0A1628), Veritech accent (#4F8CFF), plain
// text fallback always provided.

const FROM = "Veritech CRO Tool <noreply@veritechdigital.co.za>";
const ACCENT = "#4F8CFF";
const NAVY = "#0A1628";

function appUrl(): string {
  return (
    process.env.APP_URL ||
    process.env.VITE_APP_URL ||
    "https://veritechcro.app"
  );
}

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail({ to, subject, html, text }: SendArgs): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
    return { ok: false, error: "invalid-recipient" };
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email:STUB] would send "${subject}" to ${to}`);
    return { ok: true, id: "stub-" + Date.now() };
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html, text }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.error(`[email] Resend ${r.status}: ${body.slice(0, 200)}`);
      return { ok: false, error: `resend-${r.status}` };
    }
    const j = (await r.json()) as { id?: string };
    return { ok: true, id: j.id };
  } catch (e) {
    console.error("[email] send failed:", e);
    return { ok: false, error: e instanceof Error ? e.message : "send-failed" };
  }
}

// ---------- Shared HTML chrome ----------
function wrap(bodyHtml: string, previewText = ""): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Veritech</title></head>
<body style="margin:0;padding:0;background:#f4f6fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:#1a1a2e;">
<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(previewText)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(20,30,60,0.06);">
      <tr><td style="background:${NAVY};padding:22px 28px;">
        <span style="color:#ffffff;font-size:18px;font-weight:600;letter-spacing:-0.01em;">Veritech <span style="color:${ACCENT};font-weight:500;">CRO Tool</span></span>
      </td></tr>
      <tr><td style="padding:28px;font-size:15px;line-height:1.6;color:#1a1a2e;">${bodyHtml}</td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #eef0f6;font-size:12px;color:#8b93a7;">Veritech Digital · noreply@veritechdigital.co.za</td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}
function button(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr><td style="border-radius:8px;background:${ACCENT};">
<a href="${href}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

// =================================================================
// TEMPLATE 1 — invitation to client
// =================================================================
export function emailInvitation(args: { to: string; agencyName: string; token: string }) {
  const link = `${appUrl()}/accept-invite?token=${encodeURIComponent(args.token)}`;
  const subject = "You've been invited to view your CRO reports";
  const html = wrap(
    `<h2 style="margin:0 0 12px;font-size:20px;">You're invited</h2>
     <p>${escapeHtml(args.agencyName)} has invited you to access your conversion-rate-optimisation reports inside the Veritech CRO Tool.</p>
     <p>Use the link below to set up your portal — it takes about a minute.</p>
     ${button("Accept Invitation →", link)}
     <p style="color:#8b93a7;font-size:13px;">This link expires in 7 days.</p>`,
    `Your agency has invited you to your CRO reports.`,
  );
  const text = `${args.agencyName} has invited you to view your CRO reports.\n\nAccept your invitation: ${link}\n\nThis link expires in 7 days.`;
  return sendEmail({ to: args.to, subject, html, text });
}

// =================================================================
// TEMPLATE 2 — audit complete (agency-initiated) → client
// =================================================================
export function emailAuditCompleteToClient(args: {
  to: string; score: number; rating: string; pageLabel: string; topFriction?: string;
}) {
  const subject = `Your latest CRO report is ready — Score: ${args.score}`;
  const link = `${appUrl()}/portal`;
  const html = wrap(
    `<h2 style="margin:0 0 12px;font-size:20px;">New CRO report ready</h2>
     <div style="display:inline-block;background:${NAVY};color:#fff;padding:14px 18px;border-radius:10px;margin:8px 0 16px;">
       <div style="font-size:12px;opacity:0.7;letter-spacing:0.05em;text-transform:uppercase;">Score</div>
       <div style="font-size:30px;font-weight:700;color:${ACCENT};line-height:1;">${args.score}<span style="font-size:14px;color:#fff;opacity:0.6;">/100</span></div>
       <div style="font-size:13px;margin-top:4px;">${escapeHtml(args.rating)}</div>
     </div>
     <p>We've completed your audit for <strong>${escapeHtml(args.pageLabel)}</strong>.</p>
     ${args.topFriction ? `<p style="background:#f4f6fb;padding:12px 14px;border-radius:8px;font-size:14px;">Top friction: ${escapeHtml(args.topFriction)}</p>` : ""}
     ${button("View My Report →", link)}`,
    `Your CRO report is ready — score ${args.score}.`,
  );
  const text = `Your latest CRO report is ready.\nScore: ${args.score}/100 (${args.rating})\nPage: ${args.pageLabel}\n\nView: ${link}`;
  return sendEmail({ to: args.to, subject, html, text });
}

// =================================================================
// TEMPLATE 3 — audit complete (client-initiated) → agency admin
// =================================================================
export function emailAuditCompleteToAgency(args: {
  to: string; clientName: string; pageLabel: string; score: number; clientId: string;
}) {
  const subject = `${args.clientName} ran a new audit — Score: ${args.score}`;
  const link = `${appUrl()}/dashboard/clients/${args.clientId}`;
  const html = wrap(
    `<p><strong>${escapeHtml(args.clientName)}</strong> just self-served a new audit.</p>
     <ul style="padding-left:18px;">
       <li>Page: ${escapeHtml(args.pageLabel)}</li>
       <li>Score: <strong>${args.score}/100</strong></li>
       <li>Time: ${new Date().toLocaleString()}</li>
     </ul>
     ${button("View in Dashboard →", link)}`,
    `${args.clientName} ran an audit — ${args.score}/100.`,
  );
  const text = `${args.clientName} ran a new audit.\nPage: ${args.pageLabel}\nScore: ${args.score}/100\n\nView: ${link}`;
  return sendEmail({ to: args.to, subject, html, text });
}

// =================================================================
// TEMPLATE 4 — welcome → agency admin
// =================================================================
export function emailWelcome(args: { to: string; fullName: string }) {
  const subject = "Welcome to Veritech CRO Tool";
  const link = `${appUrl()}/dashboard`;
  const html = wrap(
    `<h2 style="margin:0 0 12px;font-size:20px;">Welcome, ${escapeHtml(args.fullName)} 👋</h2>
     <p>Your agency account is ready. Three steps to get the most out of it:</p>
     <ol style="padding-left:18px;">
       <li><a style="color:${ACCENT}" href="${appUrl()}/dashboard/clients">Add your first client</a></li>
       <li><a style="color:${ACCENT}" href="${appUrl()}/dashboard/audit">Run your first audit</a></li>
       <li><a style="color:${ACCENT}" href="${appUrl()}/dashboard/settings">Configure agency settings & branding</a></li>
     </ol>
     ${button("Go to Dashboard →", link)}`,
    `Your Veritech account is ready.`,
  );
  const text = `Welcome to Veritech CRO Tool, ${args.fullName}.\n\nGetting started:\n1. Add a client: ${appUrl()}/dashboard/clients\n2. Run your first audit: ${appUrl()}/dashboard/audit\n3. Configure settings: ${appUrl()}/dashboard/settings\n\nDashboard: ${link}`;
  return sendEmail({ to: args.to, subject, html, text });
}

// =================================================================
// TEMPLATE 5 — password reset (manual fallback; Supabase Auth normally handles)
// =================================================================
export function emailPasswordReset(args: { to: string; link: string }) {
  const subject = "Reset your Veritech CRO Tool password";
  const html = wrap(
    `<h2 style="margin:0 0 12px;font-size:20px;">Reset your password</h2>
     <p>Click the button below to set a new password. If you didn't ask for this, you can safely ignore this email.</p>
     ${button("Reset Password →", args.link)}
     <p style="color:#8b93a7;font-size:13px;">This link expires in 1 hour.</p>`,
    `Reset your Veritech password.`,
  );
  const text = `Reset your Veritech CRO Tool password:\n${args.link}\n\nLink expires in 1 hour.`;
  return sendEmail({ to: args.to, subject, html, text });
}

// =================================================================
// TEMPLATE 6 — Google connection expired → client
// =================================================================
export function emailGoogleExpired(args: { to: string }) {
  const subject = "Your Google connection needs renewal";
  const link = `${appUrl()}/portal/connect`;
  const html = wrap(
    `<h2 style="margin:0 0 12px;font-size:20px;">Reconnect Google to keep audits accurate</h2>
     <p>Your Google (GA4 / Search Console) connection has stopped working. Without it, new CRO audits fall back to estimates instead of using your real traffic and search data.</p>
     ${button("Reconnect Now →", link)}
     <p style="color:#8b93a7;font-size:13px;">This usually takes under a minute.</p>`,
    `Reconnect Google to keep audits accurate.`,
  );
  const text = `Your Google connection has expired. Reconnect: ${link}`;
  return sendEmail({ to: args.to, subject, html, text });
}

// =================================================================
// TEMPLATE 7 — Semrush plan notice → client
// =================================================================
export function emailSemrushPlanNotice(args: { to: string }) {
  const subject = "Semrush connected — using AI estimates for competitor data";
  const link = `${appUrl()}/portal/connect`;
  const html = wrap(
    `<h2 style="margin:0 0 12px;font-size:20px;">Semrush connected</h2>
     <p>Your Semrush API key is working, but your plan doesn't include the Traffic Analytics endpoint we'd normally use for competitor traffic.</p>
     <p>That's OK — we'll use AI estimates for market-share reports. Your <strong>CRO audits are unaffected</strong>.</p>
     ${button("Manage Connection →", link)}`,
    `Semrush connected; market share will use AI estimates.`,
  );
  const text = `Semrush connected. Your plan doesn't include Traffic Analytics, so market share uses AI estimates. CRO audits are unaffected.\n\n${link}`;
  return sendEmail({ to: args.to, subject, html, text });
}

// =================================================================
// TEMPLATE 8 — usage warning → agency admin
// =================================================================
export function emailUsageWarning(args: {
  to: string; used: number; budget: number; estDaysRemaining: number;
}) {
  const subject = "80% of monthly audit budget used";
  const link = `${appUrl()}/dashboard/settings`;
  const pct = Math.round((args.used / args.budget) * 100);
  const html = wrap(
    `<h2 style="margin:0 0 12px;font-size:20px;">Heads-up on monthly usage</h2>
     <p>Your agency has used <strong>${pct}%</strong> of this month's audit token budget.</p>
     <ul style="padding-left:18px;">
       <li>Used: ${args.used.toLocaleString()} tokens</li>
       <li>Budget: ${args.budget.toLocaleString()} tokens</li>
       <li>Estimated days remaining at current rate: <strong>${args.estDaysRemaining}</strong></li>
     </ul>
     ${button("Manage Usage →", link)}`,
    `You've used 80% of your monthly audit budget.`,
  );
  const text = `You've used ${pct}% of this month's audit budget (${args.used.toLocaleString()} / ${args.budget.toLocaleString()} tokens). Est. ${args.estDaysRemaining} days remaining.\n\nManage: ${link}`;
  return sendEmail({ to: args.to, subject, html, text });
}

// =================================================================
// TEMPLATE 9 — invite accepted → agency admin
// =================================================================
export function emailInviteAccepted(args: { to: string; clientName: string }) {
  const subject = `${args.clientName} has joined the portal`;
  const link = `${appUrl()}/dashboard/clients`;
  const html = wrap(
    `<p><strong>${escapeHtml(args.clientName)}</strong> just accepted their invitation and signed into the client portal.</p>
     <p style="color:#8b93a7;font-size:13px;">${new Date().toLocaleString()}</p>
     ${button("View in Dashboard →", link)}`,
    `${args.clientName} joined the portal.`,
  );
  const text = `${args.clientName} just joined the portal.\n\nView: ${link}`;
  return sendEmail({ to: args.to, subject, html, text });
}

// ---------- Helper: send to all agency admins ----------
export async function emailAllAgencyAdmins(
  agencyId: string,
  sender: (to: string) => Promise<unknown>,
): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, agency_id, role")
    .eq("agency_id", agencyId)
    .eq("role", "agency_admin");
  const ids = (data ?? []).map((r) => r.id);
  if (ids.length === 0) return;
  const { data: users } = await supabaseAdmin.auth.admin.listUsers();
  const emails = (users?.users ?? [])
    .filter((u) => ids.includes(u.id) && u.email)
    .map((u) => u.email as string);
  await Promise.all(emails.map((e) => sender(e).catch((err) => console.error("[email] admin send:", err))));
}
