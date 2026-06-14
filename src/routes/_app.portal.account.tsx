import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LogOut, Mail, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getPortalHome, updateMyProfile } from "@/lib/portal.functions";
import { signOutAndRedirect, useSession } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Skeleton } from "@/components/Skeleton";

export const Route = createFileRoute("/_app/portal/account")({
  ssr: false,
  component: AccountPage,
});

function AccountPage() {
  const { data: session } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const homeFn = useServerFn(getPortalHome);
  const updateFn = useServerFn(updateMyProfile);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-home"],
    queryFn: () => homeFn(),
  });

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [emailModal, setEmailModal] = useState(false);

  useEffect(() => {
    if (session?.profile?.full_name) setName(session.profile.full_name);
  }, [session?.profile?.full_name]);

  async function saveName() {
    if (!name.trim()) return;
    setSavingName(true);
    try {
      await updateFn({ data: { fullName: name.trim() } });
      toast.success("Name saved.");
      qc.invalidateQueries({ queryKey: ["session"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSavingName(false); }
  }

  async function changePassword() {
    if (!session?.user?.email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(session.user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent.");
  }

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  const agency = data.agency;

  return (
    <div className="max-w-2xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Account</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Manage your profile and your agency relationship.
        </p>
      </header>

      <section className="vt-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Profile</h2>
        <div>
          <label className="block text-xs font-medium text-[color:var(--muted)] mb-1.5">Full name</label>
          <div className="flex gap-2">
            <input className="vt-input flex-1" value={name} onChange={(e) => setName(e.target.value)} />
            <button onClick={saveName} disabled={savingName} className="vt-btn-primary">
              {savingName ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-[color:var(--muted)] mb-1.5">Email</label>
          <div className="flex gap-2 items-center">
            <input className="vt-input flex-1 opacity-60" value={session?.user?.email ?? ""} readOnly />
            <button onClick={() => setEmailModal(true)} className="vt-btn-secondary text-xs">
              Change Email
            </button>
          </div>
        </div>
        <div>
          <button onClick={changePassword} className="vt-btn-secondary">Change Password</button>
        </div>
        <div className="pt-2 border-t border-[color:var(--border)]">
          <button onClick={() => signOutAndRedirect()} className="vt-btn-secondary text-[color:var(--red)]">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </section>

      {agency?.contact_email && (
        <section className="vt-card p-6 space-y-2">
          <h2 className="text-lg font-semibold">Your agency</h2>
          <p className="text-sm">
            <strong>{agency.name}</strong>
          </p>
          <p className="text-sm">
            <a href={`mailto:${agency.contact_email}`}
              className="inline-flex items-center gap-1.5 text-[color:var(--accent)] hover:underline">
              <Mail className="h-4 w-4" /> {agency.contact_email}
            </a>
          </p>
          <p className="text-xs text-[color:var(--muted)]">
            Contact your agency if you have questions about your account or audits.
          </p>
        </section>
      )}

      {emailModal && (
        <ChangeEmailModal onClose={() => setEmailModal(false)} />
      )}
    </div>
  );
}

function ChangeEmailModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function submit() {
    if (!email.includes("@")) return toast.error("Invalid email");
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ email });
      if (error) throw error;
      toast.success("Verification sent. Check both inboxes.");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="vt-card w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-[color:var(--muted)]">
          <X className="h-5 w-5" />
        </button>
        <h3 className="text-lg font-semibold">Change email</h3>
        <p className="text-xs text-[color:var(--muted)] mt-1">
          We'll send a verification link to both addresses. Click both to complete the change.
        </p>
        <input className="vt-input mt-4" placeholder="new@email.com"
          value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="vt-btn-secondary">Cancel</button>
          <button onClick={submit} disabled={busy} className="vt-btn-primary">
            {busy ? "Sending…" : "Send verification"}
          </button>
        </div>
      </div>
    </div>
  );
}
