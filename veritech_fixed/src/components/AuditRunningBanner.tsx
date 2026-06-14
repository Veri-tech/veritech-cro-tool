import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getAuditStatus } from "@/lib/audit.functions";

interface RunningAudit {
  auditId: string;
  startedAt: number;
  clientName: string;
  returnTo?: string;
}

export function AuditRunningBanner() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [audit, setAudit] = useState<RunningAudit | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const checkStatus = useServerFn(getAuditStatus);

  // Load from sessionStorage on mount + path change
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = sessionStorage.getItem("veritech_running_audit");
    if (!raw) { setAudit(null); return; }
    try {
      const parsed = JSON.parse(raw) as RunningAudit;
      if (Date.now() - parsed.startedAt > 10 * 60_000) {
        // Do one final check before clearing
        (async () => {
          try {
            const status: any = await checkStatus({ data: { id: parsed.auditId } });
            if (status.status === "completed") {
              toast.success(`Audit complete — Score: ${status.score ?? "?"}/100`);
            } else if (status.status === "failed") {
              toast.error(`Audit failed: ${status.error_message ?? "Unknown error"}`);
            }
          } catch { /* ignore */ }
          sessionStorage.removeItem("veritech_running_audit");
          setAudit(null);
        })();
        return;
      }
      setAudit(parsed);
    } catch { sessionStorage.removeItem("veritech_running_audit"); }
  }, [pathname, checkStatus]);

  // Tick + poll
  useEffect(() => {
    if (!audit) return;
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - audit.startedAt) / 1000)), 1000);
    let polling = false;
    const poll = setInterval(async () => {
      if (polling) return;
      polling = true;
      try {
        const res = await checkStatus({ data: { id: audit.auditId } });
        if (res.status === "completed") {
          toast.success(`Audit complete — Score: ${res.score ?? "?"}`);
          sessionStorage.removeItem("veritech_running_audit");
          setAudit(null);
          // Tell run-audit page (if open) to refetch.
          window.dispatchEvent(new CustomEvent("veritech:audit-complete", { detail: { auditId: audit.auditId } }));
        } else if (res.status === "failed") {
          toast.error(res.error_message || "Audit failed");
          sessionStorage.removeItem("veritech_running_audit");
          setAudit(null);
          window.dispatchEvent(new CustomEvent("veritech:audit-failed", { detail: { auditId: audit.auditId } }));
        }
      } catch { /* swallow */ }
      polling = false;
    }, 3000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [audit, checkStatus]);

  if (!audit) return null;
  const href = audit.returnTo || (pathname.startsWith("/portal") ? "/portal/audit" : "/dashboard/audit");
  return (
    <Link
      to={href}
      className="block bg-[color:var(--accent)]/15 border-b border-[color:var(--accent)]/30 px-4 py-2 text-sm hover:bg-[color:var(--accent)]/25"
    >
      ⏳ Audit in progress for <strong>{audit.clientName}</strong>… {elapsed}s elapsed
    </Link>
  );
}

export function startAuditTracking(auditId: string, clientName: string, returnTo?: string) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(
    "veritech_running_audit",
    JSON.stringify({ auditId, clientName, startedAt: Date.now(), returnTo } satisfies RunningAudit),
  );
}
