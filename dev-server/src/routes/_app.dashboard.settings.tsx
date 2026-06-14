import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, Upload, Image as ImageIcon } from "lucide-react";
import { getAgencySettings, updateAgencyBranding } from "@/lib/settings.functions";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/Toast";
import { Skeleton } from "@/components/Skeleton";

export const Route = createFileRoute("/_app/dashboard/settings")({
  ssr: false,
  component: SettingsPage,
});

function SettingsPage() {
  const fn = useServerFn(getAgencySettings);
  const updateFn = useServerFn(updateAgencyBranding);
  const qc = useQueryClient();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["agency-settings"],
    queryFn: () => fn(),
  });

  const [name, setName] = useState("");
  const [primary, setPrimary] = useState("#4F8CFF");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Email/password fields
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acctSaving, setAcctSaving] = useState(false);

  useEffect(() => {
    if (data?.agency) {
      setName(data.agency.name);
      setPrimary(data.agency.primary_color || "#4F8CFF");
      setContactName(data.agency.contact_name || "");
      setContactEmail(data.agency.contact_email || "");
      setLogoPreview(data.agency.logo_url);
    }
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-60" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  const a = data.agency;
  const usage = data.usage;

  async function saveBranding(e: FormEvent) {
    e.preventDefault();
    setSavingBrand(true);
    try {
      await updateFn({ data: {
        name: name.trim(),
        primary_color: primary,
        contact_name: contactName,
        contact_email: contactEmail,
      } });
      toast.success("Settings saved.");
      refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingBrand(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!file.type.startsWith("image/")) return toast.error("Logo must be an image.");
    if (file.size > 2 * 1024 * 1024) return toast.error("Logo must be under 2 MB.");
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${a.id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("agency-assets").upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: signed, error: sErr } = await supabase.storage
        .from("agency-assets").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (sErr) throw sErr;
      await updateFn({ data: { logo_url: signed.signedUrl } });
      setLogoPreview(signed.signedUrl);
      toast.success("Logo updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Logo upload failed");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function saveAccount(e: FormEvent) {
    e.preventDefault();
    if (!newEmail && !newPassword) return toast.error("Enter a new email or password.");
    if (newPassword && newPassword.length < 8) return toast.error("Password must be 8+ characters.");
    if (newPassword && newPassword !== confirmPassword) return toast.error("Passwords don't match.");
    setAcctSaving(true);
    try {
      const updates: { email?: string; password?: string } = {};
      if (newEmail) updates.email = newEmail.trim();
      if (newPassword) updates.password = newPassword;
      const { error } = await supabase.auth.updateUser(updates);
      if (error) throw error;
      toast.success(newEmail ? "Check your inbox to confirm the new email." : "Password updated.");
      setNewEmail(""); setNewPassword(""); setConfirmPassword("");
      qc.invalidateQueries({ queryKey: ["session"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setAcctSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-[color:var(--muted)]">Manage your agency's branding, account, and usage.</p>
      </header>

      {/* Branding */}
      <form onSubmit={saveBranding} className="vt-card p-6 space-y-5">
        <h2 className="text-lg font-semibold">Agency branding</h2>

        <div className="flex items-start gap-5">
          <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-[color:var(--border)] bg-[color:var(--navy)] overflow-hidden">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <ImageIcon className="h-8 w-8 text-[color:var(--muted)]" />
            )}
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Logo</label>
            <p className="text-xs text-[color:var(--muted)]">PNG/JPG/SVG, max 2 MB. Shown on PDFs and the client portal.</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
            <button type="button" onClick={() => fileRef.current?.click()}
              disabled={uploadingLogo} className="vt-btn-secondary">
              {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploadingLogo ? "Uploading…" : "Upload logo"}
            </button>
          </div>
        </div>

        <Field label="Agency name">
          <input className="vt-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </Field>

        <Field label="Brand colour">
          <div className="flex items-center gap-3">
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)}
              className="h-10 w-14 rounded border border-[color:var(--border)] bg-transparent" />
            <input className="vt-input flex-1 font-mono" value={primary} onChange={(e) => setPrimary(e.target.value)} pattern="^#[0-9a-fA-F]{6}$" />
          </div>
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Contact name">
            <input className="vt-input" value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </Field>
          <Field label="Contact email">
            <input type="email" className="vt-input" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
          </Field>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={savingBrand} className="vt-btn-primary">
            {savingBrand && <Loader2 className="h-4 w-4 animate-spin" />}
            Save changes
          </button>
        </div>
      </form>

      {/* Account */}
      <form onSubmit={saveAccount} className="vt-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Account</h2>
        <Field label="New email (leave blank to keep current)">
          <input type="email" className="vt-input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="New password">
            <input type="password" className="vt-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password">
            <input type="password" className="vt-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
          </Field>
        </div>
        <div className="flex justify-end">
          <button type="submit" disabled={acctSaving} className="vt-btn-primary">
            {acctSaving && <Loader2 className="h-4 w-4 animate-spin" />}
            Update account
          </button>
        </div>
      </form>

      {/* Usage */}
      <div className="vt-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">Usage & limits</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <UsageStat label="Audits today" value={`${usage.auditsToday} / ${a.daily_audit_limit ?? 10}`} />
          <UsageStat label="Tokens (month)" value={`${(usage.tokensUsed / 1_000).toFixed(1)}k / ${((a.monthly_token_budget ?? 0) / 1_000_000).toFixed(1)}M`} />
          <UsageStat label="Cost (USD, month)" value={`$${usage.costUsd.toFixed(2)}`} />
        </div>
        <p className="text-xs text-[color:var(--muted)]">
          Limits are set by your workspace administrator. Contact support@veritechdigital.co.za to request a change.
        </p>
      </div>
    </div>
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

function UsageStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--navy)] p-3">
      <div className="text-xs text-[color:var(--muted)] uppercase tracking-wide">{label}</div>
      <div className="text-lg font-mono font-semibold mt-1">{value}</div>
    </div>
  );
}
