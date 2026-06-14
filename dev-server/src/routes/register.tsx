import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { usePasswordStrength } from "@/lib/auth";

export const Route = createFileRoute("/register")({
  ssr: false,
  head: () => ({ meta: [{ title: "Register agency · Veritech CRO Tool" }] }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [touchedConfirm, setTouchedConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = usePasswordStrength(password);
  const passwordsMatch = !touchedConfirm || confirm === password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setError("Please enter your full name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Please enter a valid work email.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    if (agencyName.trim().length < 2) return setError("Agency name must be at least 2 characters.");

    setLoading(true);
    try {
      const { data: signUp, error: signErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/dashboard` : undefined,
          data: { full_name: fullName },
        },
      });
      if (signErr || !signUp.user) throw new Error(signErr?.message ?? "Sign up failed.");

      // Read defaults from system_config
      const { data: cfgRows } = await supabase
        .from("system_config")
        .select("key,value")
        .in("key", ["default_daily_audit_limit", "default_monthly_token_budget"]);
      const cfg: Record<string, string> = {};
      (cfgRows ?? []).forEach((r: { key: string; value: string }) => (cfg[r.key] = r.value));

      const { data: agency, error: agErr } = await supabase
        .from("agencies")
        .insert({
          name: agencyName.trim(),
          owner_id: signUp.user.id,
          daily_audit_limit: cfg.default_daily_audit_limit ? Number(cfg.default_daily_audit_limit) : 10,
          monthly_token_budget: cfg.default_monthly_token_budget
            ? Number(cfg.default_monthly_token_budget)
            : 2_000_000,
          contact_email: email,
          contact_name: fullName,
        })
        .select("id")
        .single();
      if (agErr || !agency) throw new Error(agErr?.message ?? "Could not create agency.");

      const { error: pErr } = await supabase.from("profiles").insert({
        id: signUp.user.id,
        agency_id: agency.id,
        full_name: fullName,
        role: "agency_admin",
      });
      if (pErr) throw new Error(pErr.message);

      await supabase.auth.updateUser({
        data: { role: "agency_admin", agency_id: agency.id, full_name: fullName },
      });

      // Welcome email (best-effort, non-blocking).
      try {
        const { sendWelcomeEmail } = await import("@/lib/email.functions");
        await sendWelcomeEmail();
      } catch (e) { console.warn("[email] welcome:", e); }

      navigate({ to: "/dashboard", replace: true, search: { onboarding: "1" } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Create your agency account"
      subtitle="For agencies and consultants. Your clients will be invited separately."
      footer={
        <span className="text-[color:var(--muted)]">
          Already have an account?{" "}
          <Link to="/login" className="vt-link">Sign in →</Link>
        </span>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <Field label="Full name">
          <input required className="vt-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Work email">
          <input type="email" required autoComplete="email" className="vt-input"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" required autoComplete="new-password" minLength={8} className="vt-input"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          {strength && <StrengthMeter strength={strength} />}
        </Field>
        <Field label="Confirm password">
          <input type="password" required autoComplete="new-password" className="vt-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => setTouchedConfirm(true)}
          />
          {!passwordsMatch && (
            <p className="mt-1 text-xs text-[color:var(--red)]">Passwords do not match.</p>
          )}
        </Field>
        <Field label="Agency / company name">
          <input required minLength={2} className="vt-input"
            value={agencyName} onChange={(e) => setAgencyName(e.target.value)} />
        </Field>
        {error && (
          <div className="rounded-md border border-[color:var(--red)]/40 bg-[color:var(--red)]/10 px-3 py-2 text-sm text-[color:var(--red)]">
            {error}
          </div>
        )}
        <button type="submit" disabled={loading} className="vt-btn-primary w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Create account
        </button>
      </form>
    </AuthShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[color:var(--muted)] mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function StrengthMeter({ strength }: { strength: "weak" | "fair" | "strong" }) {
  const map = {
    weak:   { w: "33%", c: "var(--red)",    label: "Weak" },
    fair:   { w: "66%", c: "var(--amber)",  label: "Fair" },
    strong: { w: "100%", c: "var(--green)", label: "Strong" },
  } as const;
  const s = map[strength];
  return (
    <div className="mt-2">
      <div className="h-1 w-full rounded bg-[color:var(--slate)] overflow-hidden">
        <div className="h-full transition-all" style={{ width: s.w, background: s.c }} />
      </div>
      <p className="mt-1 text-xs" style={{ color: s.c }}>{s.label}</p>
    </div>
  );
}
