import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { usePasswordStrength } from "@/lib/auth";

const searchSchema = z.object({ token: z.string().optional() });

interface Invitation {
  id: string;
  email: string;
  agency_id: string;
  client_id: string;
  accepted: boolean;
  expires_at: string;
}

export const Route = createFileRoute("/accept-invite")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Accept invite · Veritech CRO Tool" }] }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const search = useSearch({ from: "/accept-invite" });
  const navigate = useNavigate();
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "expired" | "used" | "missing">("loading");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const strength = usePasswordStrength(password);

  useEffect(() => {
    if (!search.token) {
      setStatus("missing");
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("client_invitations")
        .select("id,email,agency_id,client_id,accepted,expires_at")
        .eq("token", search.token!)
        .maybeSingle();
      if (!data) {
        setStatus("missing");
        return;
      }
      const inv = data as Invitation;
      setInvite(inv);
      if (inv.accepted) setStatus("used");
      else if (new Date(inv.expires_at).getTime() < Date.now()) setStatus("expired");
      else setStatus("ok");
    })();
  }, [search.token]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!invite) return;
    if (fullName.trim().length < 2) return setError("Please enter your full name.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");

    setSubmitting(true);
    try {
      const { data: signUp, error: sErr } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (sErr || !signUp.user) throw new Error(sErr?.message ?? "Sign up failed.");

      const userId = signUp.user.id;

      const { error: pErr } = await supabase.from("profiles").insert({
        id: userId, agency_id: invite.agency_id, full_name: fullName, role: "client",
      });
      if (pErr) throw new Error(pErr.message);

      const { error: cErr } = await supabase
        .from("clients").update({ portal_user_id: userId }).eq("id", invite.client_id);
      if (cErr) throw new Error(cErr.message);

      await supabase.from("client_invitations").update({ accepted: true }).eq("id", invite.id);

      await supabase.auth.updateUser({
        data: {
          role: "client", agency_id: invite.agency_id,
          client_id: invite.client_id, full_name: fullName,
        },
      });

      // Notify agency admins by email + in-app notification (best-effort).
      try {
        const { notifyInviteAccepted } = await import("@/lib/email.functions");
        await notifyInviteAccepted({ data: { clientId: invite.client_id } });
      } catch (e) { console.warn("[email] invite-accepted:", e); }

      navigate({ to: "/portal", replace: true, search: { onboarding: "1" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return (
      <AuthShell title="Loading invitation…">
        <div className="vt-progress-bar rounded-full" />
      </AuthShell>
    );
  }
  if (status === "missing") {
    return (
      <AuthShell title="Invitation not found"
        footer={<Link to="/login" className="vt-link">Go to sign in →</Link>}>
        <p className="text-sm text-[color:var(--muted)]">
          The invite link is invalid. Contact your agency for a fresh link.
        </p>
      </AuthShell>
    );
  }
  if (status === "expired") {
    return (
      <AuthShell title="This invitation has expired"
        footer={<Link to="/login" className="vt-link">Go to sign in →</Link>}>
        <p className="text-sm text-[color:var(--muted)]">
          Contact your agency to request a new one.
        </p>
      </AuthShell>
    );
  }
  if (status === "used") {
    return (
      <AuthShell title="This invitation has already been used"
        footer={<Link to="/login" className="vt-link">Try logging in →</Link>}>
        <p className="text-sm text-[color:var(--muted)]">
          If you've forgotten your password, use the reset link on the sign-in page.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set up your client portal" subtitle={`Invited as ${invite?.email}`}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-xs font-medium text-[color:var(--muted)] mb-1.5">Full name</label>
          <input className="vt-input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--muted)] mb-1.5">Password</label>
          <input type="password" required minLength={8} className="vt-input"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {strength && (
            <p className="mt-1 text-xs" style={{
              color: strength === "weak" ? "var(--red)" : strength === "fair" ? "var(--amber)" : "var(--green)"
            }}>
              {strength === "weak" ? "Weak" : strength === "fair" ? "Fair" : "Strong"}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--muted)] mb-1.5">Confirm password</label>
          <input type="password" required className="vt-input"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && (
          <div className="rounded-md border border-[color:var(--red)]/40 bg-[color:var(--red)]/10 px-3 py-2 text-sm text-[color:var(--red)]">
            {error}
          </div>
        )}
        <button type="submit" disabled={submitting} className="vt-btn-primary w-full">
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </button>
      </form>
    </AuthShell>
  );
}
