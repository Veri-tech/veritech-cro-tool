import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { signOutAndRedirect } from "@/lib/auth";

export const Route = createFileRoute("/complete-setup")({
  ssr: false,
  head: () => ({ meta: [{ title: "Finish setup · Veritech CRO Tool" }] }),
  component: CompleteSetupPage,
});

function CompleteSetupPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [fullName, setFullName] = useState("");
  const [agencyName, setAgencyName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate({ to: "/login", replace: true });
        return;
      }
      // If profile already exists, send them to the right place
      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      if ((profile as { role?: string } | null)?.role) {
        navigate({ to: "/dashboard", replace: true });
        return;
      }
      const meta = (data.user.user_metadata ?? {}) as { full_name?: string };
      setFullName(meta.full_name ?? "");
      setChecking(false);
    })();
  }, [navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) return setError("Please enter your full name.");
    if (agencyName.trim().length < 2) return setError("Agency name must be at least 2 characters.");
    setLoading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) throw new Error("You are not signed in.");

      const { data: agency, error: agErr } = await supabase
        .from("agencies")
        .insert({
          name: agencyName.trim(),
          owner_id: user.id,
          daily_audit_limit: 10,
          monthly_token_budget: 2_000_000,
          contact_email: user.email,
          contact_name: fullName,
        })
        .select("id")
        .single();
      if (agErr || !agency) throw new Error(agErr?.message ?? "Could not create agency.");

      const { error: pErr } = await supabase.from("profiles").insert({
        id: user.id,
        agency_id: agency.id,
        full_name: fullName,
        role: "agency_admin",
      });
      if (pErr) throw new Error(pErr.message);

      await supabase.auth.updateUser({
        data: { role: "agency_admin", agency_id: agency.id, full_name: fullName },
      });

      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <AuthShell title="Loading…">
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-[color:var(--muted)]" />
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Finish setting up your account"
      subtitle="We just need a couple of details to create your agency workspace."
      footer={
        <div className="flex items-center justify-between text-[color:var(--muted)]">
          <button type="button" onClick={() => signOutAndRedirect()} className="vt-link">
            ← Sign out
          </button>
          <Link to="/login" className="vt-link">Back to sign in</Link>
        </div>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-xs font-medium text-[color:var(--muted)] mb-1.5">Full name</label>
          <input required className="vt-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--muted)] mb-1.5">Agency / company name</label>
          <input required minLength={2} className="vt-input"
            value={agencyName} onChange={(e) => setAgencyName(e.target.value)} />
        </div>
        {error && (
          <div className="rounded-md border border-[color:var(--red)]/40 bg-[color:var(--red)]/10 px-3 py-2 text-sm text-[color:var(--red)]">
            {error}
          </div>
        )}
        <button type="submit" disabled={loading} className="vt-btn-primary w-full">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Continue
        </button>
      </form>
    </AuthShell>
  );
}
