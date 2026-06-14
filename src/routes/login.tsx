import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { homePathForRole } from "@/lib/auth";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/login")({
  ssr: false,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "Sign in · Veritech CRO Tool" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/login" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data: signInData, error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err || !signInData.user) {
      setLoading(false);
      setError("Incorrect email or password. Please try again.");
      return;
    }

    // Get role from user_metadata first (fastest)
    let role: string | null = (signInData.user.user_metadata as { role?: string } | null)?.role ?? null;

    // Fall back to profiles table
    if (!role) {
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", signInData.user.id).maybeSingle();
      role = (profile as { role?: string } | null)?.role ?? null;
    }

    setLoading(false);

    if (!role) {
      window.location.href = "/complete-setup";
      return;
    }

    const dest = search.redirect && search.redirect.startsWith("/")
      ? search.redirect
      : homePathForRole(role as "super_admin" | "agency_admin" | "client" | null);

    // Use window.location for reliable redirect after auth
    window.location.href = dest;
  }

  return (
    <AuthShell
      title="Sign in to your account"
      footer={
        <div className="space-y-2">
          <div className="text-[color:var(--muted)]">
            Don't have an account?{" "}
            <Link to="/register" className="vt-link">Register your agency →</Link>
          </div>
          <div className="text-xs text-[color:var(--muted)]/80">
            Client? Check your email for an invitation link.
          </div>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-xs font-medium text-[color:var(--muted)] mb-1.5">Email</label>
          <input
            type="email" required autoComplete="email" className="vt-input"
            value={email} onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-[color:var(--muted)]">Password</label>
            <Link to="/forgot-password" className="text-xs vt-link">Forgot your password?</Link>
          </div>
          <input
            type="password" required autoComplete="current-password" className="vt-input"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <div className="rounded-md border border-[color:var(--red)]/40 bg-[color:var(--red)]/10 px-3 py-2 text-sm text-[color:var(--red)]">
            {error}
          </div>
        )}
        <button type="submit" disabled={loading} className="vt-btn-primary w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign In
        </button>
      </form>
    </AuthShell>
  );
}
