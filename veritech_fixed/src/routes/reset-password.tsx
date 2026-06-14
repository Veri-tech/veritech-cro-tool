import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Reset password · Veritech CRO Tool" }] }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const hasAccessToken = hash.includes("access_token=");
    setHasToken(hasAccessToken);
    if (hasAccessToken) {
      // Supabase auto-parses the hash and sets a recovery session.
      // No additional action needed; updateUser will work below.
    }
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) return setError(err.message);
    await supabase.auth.signOut();
    navigate({ to: "/login", search: { redirect: undefined }, replace: true });
  }

  if (hasToken === null) {
    return (
      <AuthShell title="Reset your password">
        <div className="vt-progress-bar rounded-full" />
      </AuthShell>
    );
  }

  if (!hasToken) {
    return (
      <AuthShell
        title="Invalid or expired link"
        subtitle="This password reset link is no longer valid."
        footer={<Link to="/forgot-password" className="vt-link">Request a new link →</Link>}
      >
        <p className="text-sm text-[color:var(--muted)]">
          Reset links expire after a short time. Please request a new one.
        </p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[color:var(--muted)] mb-1.5">New password</label>
          <input type="password" required minLength={8} className="vt-input"
            value={password} onChange={(e) => setPassword(e.target.value)} />
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
        <button type="submit" disabled={loading} className="vt-btn-primary w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Update password
        </button>
      </form>
    </AuthShell>
  );
}
