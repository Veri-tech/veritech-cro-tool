import { useState, type FormEvent } from "react";
import { X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/components/Toast";
import { useQueryClient } from "@tanstack/react-query";

export function OnboardingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("E-commerce");
  const [traffic, setTraffic] = useState("");
  const [aov, setAov] = useState("");
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const qc = useQueryClient();

  if (!open) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return toast.error("Client name is required.");
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("agency_id").eq("id", userData.user!.id).maybeSingle();
      if (!profile?.agency_id) throw new Error("No agency");
      const { error } = await supabase.from("clients").insert({
        agency_id: profile.agency_id,
        name: name.trim(),
        domain: domain.trim() || null,
        industry,
        monthly_traffic: traffic ? Number(traffic) : null,
        avg_order_value: aov ? Number(aov) : null,
      });
      if (error) throw error;
      toast.success("Client created. You can run audits now.");
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="vt-card w-full max-w-lg p-6 relative">
        <button onClick={onClose}
          className="absolute top-3 right-3 text-[color:var(--muted)] hover:text-white" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <header className="mb-5">
          <p className="text-xs uppercase tracking-wide text-[color:var(--accent)] font-semibold">
            Onboarding · Step {step} of 2
          </p>
          <h2 className="text-xl font-semibold mt-1">
            {step === 1 ? "Welcome 👋" : "Add your first client"}
          </h2>
        </header>

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-[color:var(--light)]/90 leading-relaxed">
              Veritech CRO Tool gives you AI-powered conversion audits in under a minute.
              You'll be able to:
            </p>
            <ul className="space-y-2 text-sm text-[color:var(--light)]/90">
              <li>• Manage all your clients in one place</li>
              <li>• Run Claude-powered audits with revenue impact estimates</li>
              <li>• Share branded PDF reports and a live client portal</li>
              <li>• Track score progression and recurring friction over time</li>
            </ul>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="vt-btn-secondary">Skip</button>
              <button onClick={() => setStep(2)} className="vt-btn-primary">Add my first client</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <form onSubmit={save} className="space-y-3" noValidate>
            <Field label="Client name *">
              <input className="vt-input" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Website domain">
              <input className="vt-input" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
            </Field>
            <Field label="Industry">
              <select className="vt-input" value={industry} onChange={(e) => setIndustry(e.target.value)}>
                <option>E-commerce</option><option>Lead Gen</option><option>SaaS</option>
                <option>Services</option><option>Other</option>
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly traffic">
                <input className="vt-input" type="number" min="0" value={traffic} onChange={(e) => setTraffic(e.target.value)} />
              </Field>
              <Field label="Avg. order value (R)">
                <input className="vt-input" type="number" min="0" value={aov} onChange={(e) => setAov(e.target.value)} />
              </Field>
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <button type="button" onClick={() => setStep(1)} className="vt-btn-secondary">← Back</button>
              <button type="submit" disabled={saving} className="vt-btn-primary">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Create client
              </button>
            </div>
          </form>
        )}
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
