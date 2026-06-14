import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, PlayCircle } from "lucide-react";
import { getPortalHome, runClientAudit } from "@/lib/portal.functions";
import { validateAuditUrl } from "@/lib/validate";
import { AuditResults } from "@/components/AuditResults";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { startAuditTracking } from "@/components/AuditRunningBanner";
import type { ParsedAudit } from "@/lib/parse";

export const Route = createFileRoute("/_app/portal/audit")({
  ssr: false,
  component: PortalRunAudit,
});

function PortalRunAudit() {
  const qc = useQueryClient();
  const toast = useToast();
  const homeFn = useServerFn(getPortalHome);
  const runFn = useServerFn(runClientAudit);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-home"],
    queryFn: () => homeFn(),
  });

  const [pageUrl, setPageUrl] = useState("");
  const [pageLabel, setPageLabel] = useState("Homepage");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedAudit | null>(null);

  const m = useMutation({
    mutationFn: async () => {
      const v = validateAuditUrl(pageUrl);
      if (!v.valid) { setUrlError(v.error!); throw new Error(v.error!); }
      setUrlError(null);
      const startTime = Date.now();
      setElapsed(0);
      const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
      try {
        startAuditTracking("pending", data?.client.name ?? "your site", "/portal/audit");
        const res = await runFn({
          data: { pageUrl: pageUrl.trim(), pageLabel: pageLabel.trim() || "Homepage" },
        });
        return res;
      } finally { clearInterval(tick); }
    },
    onSuccess: (res) => {
      setAuditId(res.auditId);
      setParsed(res.parsed);
      sessionStorage.removeItem("veritech_running_audit");
      toast.success(`Audit complete — Score: ${res.parsed.score}`);
      qc.invalidateQueries({ queryKey: ["portal-home"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: Error) => {
      sessionStorage.removeItem("veritech_running_audit");
      toast.error(e.message);
    },
  });

  if (isLoading || !data) {
    return <Skeleton className="h-64 w-full" />;
  }

  const remaining = Math.max(0, data.dailyLimit - data.auditsToday);
  const client = data.client;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Run an audit</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">
          Pick any page on your site and get an AI-powered CRO report in under a minute.
        </p>
      </div>

      <form
        className="vt-card p-6 space-y-4"
        onSubmit={(e) => { e.preventDefault(); m.mutate(); }}
      >
        <Field label="Page URL (HTTPS) *">
          <input
            className="vt-input"
            value={pageUrl}
            onChange={(e) => { setPageUrl(e.target.value); setUrlError(null); }}
            placeholder="https://example.com/landing"
            required
          />
          {urlError && <p className="text-xs text-[color:var(--red)] mt-1">{urlError}</p>}
        </Field>

        <Field label="Page label *">
          <input
            className="vt-input"
            value={pageLabel}
            onChange={(e) => setPageLabel(e.target.value)}
            maxLength={80}
            required
          />
        </Field>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <ReadField label="Monthly traffic" value={`${(client.monthly_traffic ?? 0).toLocaleString()} visits/mo`} />
          <ReadField label="AOV" value={`R ${(client.avg_order_value ?? 0).toLocaleString()}`} />
        </div>
        <p className="text-xs text-[color:var(--muted)]">
          To update traffic or AOV, contact your agency.
        </p>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border)] pt-4">
          <p className="text-xs text-[color:var(--muted)] font-mono">
            {remaining} audits remaining today
          </p>
          <button
            type="submit"
            className="vt-btn-primary w-full sm:w-auto"
            disabled={m.isPending || !pageUrl || remaining === 0}
          >
            {m.isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Analysing… {elapsed}s</>
            ) : (
              <>Run My Audit →</>
            )}
          </button>
        </div>
      </form>

      {m.isPending && (
        <div className="vt-card p-6">
          <div className="vt-progress-bar rounded-full" />
          <p className="text-sm text-[color:var(--muted)] mt-3">
            Crawling page, building prompt, calling Claude… {elapsed}s elapsed
          </p>
        </div>
      )}

      {parsed && auditId && (
        <>
          <div className="vt-card p-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              Your report is ready · <strong>Score {parsed.score}/100</strong>
            </p>
            <Link to="/portal/audits/$id" params={{ id: auditId }} className="text-[color:var(--accent)] hover:underline text-sm whitespace-nowrap">
              View full report →
            </Link>
          </div>
          <AuditResults parsed={parsed} />
        </>
      )}
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

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--navy)] p-3">
      <p className="text-xs text-[color:var(--muted)]">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  );
}
