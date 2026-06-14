import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X, ChevronRight, BarChart3, Plug, Sparkles } from "lucide-react";

const STORAGE_KEY = "veritech_client_onboarding_done";

export function ClientOnboardingDialog({ companyName }: { companyName: string }) {
  const [step, setStep] = useState(1);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) setOpen(true);
  }, []);

  function dismiss() {
    setOpen(false);
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_KEY, "1");
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="vt-card w-full max-w-lg p-6 relative">
        <button onClick={dismiss}
          className="absolute top-3 right-3 text-[color:var(--muted)] hover:text-white" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
        <p className="text-xs uppercase tracking-wide text-[color:var(--accent)] font-semibold">
          Welcome · Step {step} of 3
        </p>

        {step === 1 && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-[color:var(--accent)]/15 p-2 text-[color:var(--accent)]">
                <Sparkles className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-semibold">Welcome to your CRO portal</h2>
            </div>
            <p className="text-sm text-[color:var(--light)]/90">
              <strong>{companyName}</strong> — this is your private dashboard for tracking how
              well your site converts visitors into customers.
            </p>
            <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--navy)] p-4 text-sm">
              <p className="font-semibold mb-1">What is a CRO Score?</p>
              <p className="text-[color:var(--muted)]">
                A score from 0–100 that measures conversion friction on a given page.
                Higher is better. 66+ is considered good. 81+ is excellent.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={dismiss} className="vt-btn-secondary">Skip</button>
              <button onClick={() => setStep(2)} className="vt-btn-primary">
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-[color:var(--accent)]/15 p-2 text-[color:var(--accent)]">
                <Plug className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-semibold">Connect your Google account</h2>
            </div>
            <p className="text-sm text-[color:var(--light)]/90">
              Connecting Google Analytics & Search Console lets your agency use your
              <strong> real traffic data</strong> to make audits more accurate.
            </p>
            <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--navy)] p-4 text-sm space-y-2">
              <p className="font-semibold">What read-only access means</p>
              <p className="text-[color:var(--muted)]">
                We can <em>read</em> traffic numbers and search performance only. We can never
                make changes to your accounts or campaigns.
              </p>
            </div>
            <div className="flex justify-between gap-2 pt-2">
              <button onClick={() => setStep(1)} className="vt-btn-secondary">← Back</button>
              <div className="flex gap-2">
                <button onClick={() => setStep(3)} className="vt-btn-secondary">Skip for now</button>
                <Link to="/portal/connect" onClick={dismiss} className="vt-btn-primary">
                  Connect Google
                </Link>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-[color:var(--green)]/15 p-2 text-[color:var(--green)]">
                <BarChart3 className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-semibold">You're all set</h2>
            </div>
            <p className="text-sm text-[color:var(--light)]/90">
              Your agency runs audits for you, and you can run your own any time from
              <strong> Run Audit</strong>. Reports are saved here forever.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={dismiss} className="vt-btn-primary">
                Go to my reports →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
