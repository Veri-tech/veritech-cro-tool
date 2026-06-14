import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Download, FileText, Loader2 } from "lucide-react";
import { getMyAuditDetail } from "@/lib/portal.functions";
import { getPdfSignedUrl, savePdfUrl } from "@/lib/uploads.functions";
import { generateAuditPdf } from "@/lib/pdf";
import { supabase } from "@/integrations/supabase/client";
import { AuditResults } from "@/components/AuditResults";
import { Skeleton } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import type { ParsedAudit } from "@/lib/parse";

export const Route = createFileRoute("/_app/portal/audits/$id")({
  ssr: false,
  component: PortalAuditDetail,
});

function PortalAuditDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const fn = useServerFn(getMyAuditDetail);
  const signFn = useServerFn(getPdfSignedUrl);
  const saveUrlFn = useServerFn(savePdfUrl);
  const [generating, setGenerating] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["portal-audit", id],
    queryFn: () => fn({ data: { id } }),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error || !data) {
    navigate({ to: "/portal", replace: true });
    return null;
  }

  const audit = data.audit;
  const client = data.client;
  const parsed = audit.parsed_data as ParsedAudit | null;

  async function handlePdf() {
    setGenerating(true);
    try {
      if (audit.pdf_url) {
        const { url } = await signFn({ data: { auditId: id } });
        if (!url) throw new Error("PDF unavailable");
        window.open(url, "_blank");
        return;
      }
      if (!parsed) throw new Error("Report not parsed");
      const blob = generateAuditPdf(parsed, {
        clientName: client.name,
        pageLabel: audit.page_label ?? "Audit",
        pageUrl: audit.page_url ?? "",
        createdAt: audit.created_at ?? new Date().toISOString(),
        agencyName: "Veritech Digital",
      });
      const path = `${audit.agency_id}/${audit.client_id}/${id}.pdf`;
      const { error: upErr } = await supabase.storage
        .from("audit-reports").upload(path, blob, { upsert: true, contentType: "application/pdf" });
      if (upErr) throw upErr;
      await saveUrlFn({ data: { auditId: id, path } }).catch(() => {/* client role can't save */});
      const { url } = await signFn({ data: { auditId: id } });
      if (url) window.open(url, "_blank");
      toast.success("PDF ready.");
      qc.invalidateQueries({ queryKey: ["portal-audit", id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/portal" className="inline-flex items-center gap-1 text-sm text-[color:var(--accent)] hover:underline">
        <ArrowLeft className="h-4 w-4" /> Back to My Reports
      </Link>

      <header className="vt-card p-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{audit.page_label || "Audit"}</h1>
          <p className="text-sm text-[color:var(--muted)] truncate">{audit.page_url}</p>
          <p className="text-xs text-[color:var(--muted)] mt-1">
            {audit.created_at ? new Date(audit.created_at ?? Date.now()).toLocaleString() : ""} · Score {audit.score ?? "—"}
          </p>
        </div>
        {audit.status === "completed" && parsed && (
          <button onClick={handlePdf} disabled={generating} className="vt-btn-primary">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> :
              audit.pdf_url ? <Download className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            {audit.pdf_url ? "Download PDF" : generating ? "Generating…" : "Generate PDF"}
          </button>
        )}
      </header>

      {parsed ? (
        <AuditResults parsed={parsed} />
      ) : audit.status === "running" ? (
        <div className="vt-card p-6 text-sm text-[color:var(--muted)] flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Audit in progress…
        </div>
      ) : (
        <div className="vt-card p-6 text-sm text-[color:var(--muted)]">
          No parsed report available for this audit.
        </div>
      )}
    </div>
  );
}
