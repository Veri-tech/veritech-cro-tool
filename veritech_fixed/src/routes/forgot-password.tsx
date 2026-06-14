import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Forgot password · Veritech CRO Tool" }] }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        typeof window !== "undefined" ? `${window.location.origin}/reset-password` : undefined,
    });
    setLoading(false);
    setSent(true);
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send a reset link."
      footer={<Link to="/login" className="vt-link">← Back to sign in</Link>}
    >
      {sent ? (
        <div className="rounded-md border border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 px-3 py-3 text-sm text-[color:var(--light)]">
          If that email exists, a reset link has been sent.
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[color:var(--muted)] mb-1.5">Email</label>
            <input type="email" required autoComplete="email" className="vt-input"
              value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button type="submit" disabled={loading} className="vt-btn-primary w-full">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Send reset link
          </button>
        </form>
      )}
    </AuthShell>
  );
}
