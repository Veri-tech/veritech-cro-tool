import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { getAuditById, retryAudit } from "@/lib/audit.functions";
import { savePdfUrl, getPdfSignedUrl } from "@/lib/uploads.functions";
import { AuditResults } from "@/components/AuditResults";
import { AuditChat } from "@/components/AuditChat";
import { ParsedAudit } from "@/lib/parse";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { supabase } from "@/integrations/supabase/client";
import { generateAuditPdf } from "@/lib/pdf";

export const Route = createFileRoute("/_app/dashboard/audits/$id")({
  ssr: false,
  component: AuditDetail,
});

function AuditDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const fn = useServerFn(getAuditById);
  const saveUrlFn = useServerFn(savePdfUrl);
  const signFn = useServerFn(getPdfSignedUrl);
  const retryFn = useServerFn(retryAudit);
  const [generating, setGenerating] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit", id],
    queryFn: () => fn({ data: { id } }),
    retry: false,
  });

  if (isLoading) return <div className="max-w-5xl mx-auto space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-96 w-full" /></div>;
  if (error || !data) {
    navigate({ to: "/dashboard/clients", replace: true });
    return null;
  }

  const audit = data as any;
  const parsed = audit.parsed_data as ParsedAudit | null;

  async function downloadOrGenerate() {
    setGenerating(true);
    try {
      if (audit.pdf_url) {
        const { url } = await signFn({ data: { auditId: id } });
        if (!url) throw new Error("No PDF available");
        window.open(url, "_blank");
        return;
      }
      if (!parsed) throw new Error("Audit not parsed");
      const { data: agencyRow } = await supabase
        .from("agencies").select("name").eq("id", audit.agency_id).maybeSingle();
      const blob = generateAuditPdf(parsed, {
        clientName: audit.clients?.name ?? "Client",
        pageLabel: audit.page_label ?? "Audit",
        pageUrl: audit.page_url,
        createdAt: audit.created_at,
        agencyName: (agencyRow as any)?.name ?? "Veritech Digital",
      });
      const path = `${audit.agency_id}/${audit.client_id}/${id}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("audit-reports").upload(path, blob, { upsert: true, contentType: "application/pdf" });
      if (upErr) throw upErr;
      await saveUrlFn({ data: { auditId: id, path } });
      const { url } = await signFn({ data: { auditId: id } });
      if (url) window.open(url, "_blank");
      toast.success("PDF report ready.");
      qc.invalidateQueries({ queryKey: ["audit", id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function onRetry() {
    setRetrying(true);
    try {
      await retryFn({ data: { id } });
      toast.success("Retry queued.");
      qc.invalidateQueries({ queryKey: ["audit", id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Link to="/dashboard/clients/$id" params={{ id: audit.client_id }} className="inline-flex items-center gap-1 text-sm text-[color:var(--accent)] hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to {audit.clients?.name ?? "client"}
      </Link>

      <div className="vt-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{audit.page_label || "Audit"}</h1>
            <p className="text-sm text-[color:var(--muted)] truncate">{audit.page_url}</p>
            <p className="text-xs text-[color:var(--muted)] mt-1">
              {audit.clients?.name} · {new Date(audit.created_at).toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-[color:var(--slate)] px-2 py-1 text-xs">
              Initiated by: {audit.initiated_by ?? "agency"}
            </span>
            {audit.status === "completed" && parsed && (
              <button onClick={downloadOrGenerate} disabled={generating} className="vt-btn-primary">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> :
                  audit.pdf_url ? <Download className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                {audit.pdf_url ? "Download PDF" : generating ? "Generating…" : "Generate PDF"}
              </button>
            )}
          </div>
        </div>
      </div>

      {audit.status === "failed" && (
        <div className="vt-card p-6 border-l-4 border-l-[color:var(--red)] flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-[color:var(--red)]">Audit failed</h3>
            <p className="text-sm mt-1">{audit.error_message ?? "Unknown error."}</p>
          </div>
          <button onClick={onRetry} disabled={retrying} className="vt-btn-secondary">
            {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Retry
          </button>
        </div>
      )}

      {parsed ? (
        <AuditResults parsed={parsed} />
      ) : audit.status === "running" ? (
        <div className="vt-card p-6 text-sm text-[color:var(--muted)] flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Audit in progress…
        </div>
      ) : (
        <div className="vt-card p-6 text-sm text-[color:var(--muted)]">No parsed report available.</div>
      )}
    </div>
  );
}
