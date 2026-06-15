import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import { listClients, setNoteDate } from "@/lib/clients.functions";
import { runAudit } from "@/lib/audit.functions";
import { getClientReadiness } from "@/lib/integrations-admin.functions";
import { savePdfUrl, getPdfSignedUrl } from "@/lib/uploads.functions";
import { createClientInvitation } from "@/lib/email.functions";
import { generateAuditPdf } from "@/lib/pdf";
import { validateAuditUrl } from "@/lib/validate";
import { supabase } from "@/integrations/supabase/client";
import { AuditResults } from "@/components/AuditResults";
import { AlertTriangle, CheckCircle2, Plug, Download, UserPlus, TrendingUp, Bell, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { AuditChat } from "@/components/AuditChat";

import type { ParsedAudit } from "@/lib/parse";


const search = z.object({ client: z.string().uuid().optional() });

export const Route = createFileRoute("/_app/dashboard/audit")({
  ssr: false,
  validateSearch: (s) => search.parse(s),
  component: RunAuditPage,
});

const INDUSTRIES = ["E-commerce", "Lead Gen", "SaaS", "Services", "Other"] as const;
const LABELS: Record<string, string> = { google: "GA4", gsc: "Search Console", semrush: "Semrush", dataforseo: "DataForSEO" };

function RunAuditPage() {
  const sp = Route.useSearch();
  const listFn = useServerFn(listClients);
  const runFn = useServerFn(runAudit);

  const { data: clients, isLoading: loadingClients } = useQuery({
    queryKey: ["clients", { showArchived: false }],
    queryFn: () => listFn({ data: { includeArchived: false } }),
  });

  const [clientId, setClientId] = useState(sp.client ?? "");
  const [pageUrl, setPageUrl] = useState("");
  const [pageLabel, setPageLabel] = useState("Homepage");
  const [industry, setIndustry] = useState<string>("");
  const [traffic, setTraffic] = useState("");
  const [aov, setAov] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedAudit | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pageGoal, setPageGoal] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [primaryCta, setPrimaryCta] = useState("");
  const [deviceSplit, setDeviceSplit] = useState("");
  const [topTrafficSources, setTopTrafficSources] = useState("");
  const [competitorUrls, setCompetitorUrls] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");

  const readinessFn = useServerFn(getClientReadiness);
  const { data: readiness } = useQuery({
    queryKey: ["client-readiness", clientId],
    queryFn: () => readinessFn({ data: { clientId } }),
    enabled: !!clientId,
  });


  // Pre-fill from client
  useEffect(() => {
    if (!clientId || !clients) return;
    const c = clients.find((x) => x.id === clientId);
    if (c) {
      setIndustry(c.industry ?? "");
      setTraffic(String(c.monthly_traffic ?? ""));
      setAov(String(c.avg_order_value ?? ""));
    }
  }, [clientId, clients]);

  const m = useMutation({
    mutationFn: async () => {
      const v = validateAuditUrl(pageUrl);
      if (!v.valid) { setUrlError(v.error!); throw new Error(v.error!); }
      setUrlError(null);
      const client = clients?.find((c) => c.id === clientId);
      if (!client) throw new Error("Select a client");
      const startTime = Date.now();
      setElapsed(0);
      const tick = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
      // Optimistic: start tracking once we get auditId back. But since runAudit is synchronous,
      // we use a placeholder banner via the tracker after success (audit might already be done).
      try {
        const res = await runFn({
          data: {
            clientId,
            pageUrl: pageUrl.trim(),
            pageLabel: pageLabel.trim() || "Homepage",
            industry,
            trafficVolume: Number(traffic) || 0,
            aov: Number(aov) || 0,
            pageGoal: pageGoal.trim() || undefined,
            targetAudience: targetAudience.trim() || undefined,
            primaryCta: primaryCta.trim() || undefined,
            deviceSplit: deviceSplit.trim() || undefined,
            topTrafficSources: topTrafficSources.trim() || undefined,
            competitorUrls: competitorUrls.trim() || undefined,
            additionalContext: additionalContext.trim() || undefined,
          },
        });
        return res;
      } finally { clearInterval(tick); }
    },
    onSuccess: (res) => {
      setAuditId(res.auditId);
      setParsed(res.parsed);
      toast.success(`Audit complete — Score: ${res.parsed.score}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const client = clients?.find((c) => c.id === clientId);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Run CRO Audit</h1>
        <p className="text-sm text-[color:var(--muted)]">AI-powered audit takes ~30 seconds. Be patient on the first run.</p>
      </div>

      {clientId && readiness && !readiness.ready && (
        <div className="vt-card p-4 border-l-4 border-amber-400 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm font-medium">Audit can't start — missing required integrations</div>
              <div className="text-xs text-[color:var(--muted)] mt-1">
                This client needs to connect{" "}
                <strong>{readiness.missingRequired.map((p) => LABELS[p] ?? p).join(", ")}</strong> before audits can run with real data.
              </div>
              <ol className="text-xs text-[color:var(--muted)] mt-2 list-decimal list-inside space-y-1">
                <li>Ask the client to open <strong>Connect Tools</strong> in their portal, or</li>
                <li>Paste credentials yourself from the client's <Link to="/dashboard/clients/$id" params={{ id: clientId }} className="text-[color:var(--accent)] hover:underline">detail page</Link>, or</li>
                <li>Review status on the <Link to="/dashboard/integrations" className="text-[color:var(--accent)] hover:underline">Integrations dashboard</Link>.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {clientId && readiness?.ready && readiness.missingRecommended.length > 0 && (
        <div className="vt-card p-3 text-xs text-[color:var(--muted)] flex items-center gap-2">
          <Plug className="h-4 w-4 text-amber-400" />
          Ready to audit. Tip: connecting{" "}
          <strong>{readiness.missingRecommended.map((p) => LABELS[p] ?? p).join(", ")}</strong> will further improve results.
        </div>
      )}

      {clientId && readiness?.ready && readiness.missingRecommended.length === 0 && (
        <div className="vt-card p-3 text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> All data sources connected — ready to run.
        </div>
      )}

      <form className="vt-card p-6 space-y-4" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Client *">
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder={loadingClients ? "Loading…" : "Choose a client"} /></SelectTrigger>
              <SelectContent>
                {(clients ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Page label *">
            <Input value={pageLabel} onChange={(e) => setPageLabel(e.target.value)} required maxLength={80} />
          </Field>
          <div className="md:col-span-2">
            <Field label="Page URL (HTTPS) *">
              <Input value={pageUrl} onChange={(e) => { setPageUrl(e.target.value); setUrlError(null); }} placeholder="https://example.com/landing" required />
              {urlError && <p className="text-xs text-[color:var(--red)] mt-1">{urlError}</p>}
            </Field>
          </div>
          <Field label="Industry *">
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
              <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Monthly traffic">
            <Input type="number" min="0" value={traffic} onChange={(e) => setTraffic(e.target.value)} />
          </Field>
          <Field label="AOV (ZAR)">
            <Input type="number" min="0" step="0.01" value={aov} onChange={(e) => setAov(e.target.value)} />
          </Field>
        </div>

        {/* Advanced context toggle */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs text-[color:var(--accent)] hover:underline"
          >
            {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showAdvanced ? "Hide" : "Add more context"} (improves audit quality)
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-[color:var(--border)]">
              <Field label="Page goal">
                <Input value={pageGoal} onChange={(e) => setPageGoal(e.target.value)} placeholder="e.g. Generate leads, Sell product X" />
              </Field>
              <Field label="Primary CTA">
                <Input value={primaryCta} onChange={(e) => setPrimaryCta(e.target.value)} placeholder="e.g. Book a free consultation" />
              </Field>
              <Field label="Target audience">
                <Input value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="e.g. SME business owners, 35-55" />
              </Field>
              <Field label="Device split">
                <Input value={deviceSplit} onChange={(e) => setDeviceSplit(e.target.value)} placeholder="e.g. 60% mobile, 40% desktop" />
              </Field>
              <Field label="Top traffic sources">
                <Input value={topTrafficSources} onChange={(e) => setTopTrafficSources(e.target.value)} placeholder="e.g. Google Ads 40%, Organic 35%, Social 25%" />
              </Field>
              <Field label="Competitor URLs">
                <Input value={competitorUrls} onChange={(e) => setCompetitorUrls(e.target.value)} placeholder="e.g. competitor1.com, competitor2.com" />
              </Field>
              <div className="md:col-span-2">
                <Field label="Additional context">
                  <textarea
                    value={additionalContext}
                    onChange={(e) => setAdditionalContext(e.target.value)}
                    placeholder="Any other context Claude should know — recent changes, known issues, business constraints..."
                    rows={3}
                    className="vt-input resize-none w-full"
                    maxLength={1000}
                  />
                </Field>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[color:var(--muted)] flex-1 min-w-[180px]">Calls the Claude API with prior-audit context. Costs tokens against your monthly budget.</p>
          <Button
            type="submit"
            className="vt-btn-primary w-full sm:w-auto"
            disabled={m.isPending || !clientId || !pageUrl || !industry || (readiness ? !readiness.ready : false)}
            title={readiness && !readiness.ready ? "Connect required integrations first" : undefined}
          >
            {m.isPending ? `Analysing… ${elapsed}s` : "Run CRO Audit →"}
          </Button>
        </div>
      </form>


      {m.isPending && (
        <div className="vt-card p-6 space-y-3">
          <div className="vt-progress-bar rounded-full" />
          <p className="text-sm text-[color:var(--muted)]">Crawling page, building prompt, calling Claude… {elapsed}s elapsed</p>
        </div>
      )}

      {parsed && auditId && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 vt-card p-4">
            <div className="text-sm text-[color:var(--muted)] min-w-0">
              Saved audit for <strong>{client?.name}</strong> · {pageLabel}
            </div>
            <Link to="/dashboard/audits/$id" params={{ id: auditId }} className="text-[color:var(--accent)] hover:underline text-sm whitespace-nowrap">
              View Full Report →
            </Link>
          </div>
          <AuditResults parsed={parsed} />
          <AuditChat auditId={auditId} clientName={client?.name ?? "client"} />
          {client && (
            <PostAuditCTARow
              auditId={auditId}
              parsed={parsed}
              client={client}
              pageLabel={pageLabel}
              pageUrl={pageUrl}
            />
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-[color:var(--muted)]">{label}</Label>{children}</div>;
}

function PostAuditCTARow({
  auditId,
  parsed,
  client,
  pageLabel,
  pageUrl,
}: {
  auditId: string;
  parsed: ParsedAudit;
  client: any;
  pageLabel: string;
  pageUrl: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const saveUrlFn = useServerFn(savePdfUrl);
  const signFn = useServerFn(getPdfSignedUrl);
  const setNoteFn = useServerFn(setNoteDate);
  const inviteFn = useServerFn(createClientInvitation);

  const [generating, setGenerating] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState(client?.contact_email ?? "");

  // Competitor count for this client
  const { data: competitorCount } = useQuery({
    queryKey: ["competitor-count", client.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("competitors")
        .select("*", { count: "exact", head: true })
        .eq("client_id", client.id);
      return count ?? 0;
    },
  });

  // Local note_date that reflects optimistic updates
  const [noteDate, setNoteDateLocal] = useState<string | null>(client.note_date ?? null);
  useEffect(() => { setNoteDateLocal(client.note_date ?? null); }, [client.note_date]);

  async function onDownloadPdf() {
    setGenerating(true);
    try {
      const { data: auditRow } = await supabase
        .from("audits").select("agency_id").eq("id", auditId).maybeSingle();
      const agencyId = (auditRow as any)?.agency_id;
      if (!agencyId) throw new Error("Audit not found");
      const { data: agencyRow } = await supabase
        .from("agencies").select("name").eq("id", agencyId).maybeSingle();
      const blob = generateAuditPdf(parsed, {
        clientName: client.name,
        pageLabel,
        pageUrl,
        createdAt: new Date().toISOString(),
        agencyName: (agencyRow as any)?.name ?? "Veritech Digital",
      });
      const path = `${agencyId}/${client.id}/${auditId}.pdf`;

      const { error: upErr } = await supabase.storage
        .from("audit-reports").upload(path, blob, { upsert: true, contentType: "application/pdf" });
      if (upErr) throw upErr;
      await saveUrlFn({ data: { auditId, path } });
      const { url } = await signFn({ data: { auditId } });
      if (url) window.open(url, "_blank");
      toast.success("PDF report ready.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const invite = useMutation({
    mutationFn: async () => inviteFn({ data: { clientId: client.id, email: inviteEmail.trim() } }),
    onSuccess: () => {
      toast.success(`Invitation sent to ${inviteEmail}`);
      setInviteOpen(false);
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reminderSet = useMutation({
    mutationFn: async (date: string | null) => setNoteFn({ data: { clientId: client.id, date } }),
    onSuccess: (_r, date) => {
      setNoteDateLocal(date);
      if (date) toast.success(`Reminder set for ${new Date(date).toLocaleDateString()}`);
      else toast.success("Reminder cleared");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function set30Days() {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    reminderSet.mutate(d.toISOString().slice(0, 10));
  }

  const showInvite = !client.portal_user_id;
  const showCompetitors = (competitorCount ?? 0) === 0;

  return (
    <section className="space-y-3">
      <h3 className="text-lg font-semibold">Next steps</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Download PDF — always */}
        <CTAcard
          icon={<Download className="h-5 w-5 text-[color:var(--accent)]" />}
          title="Download PDF"
          body="Save a full report to share with your client."
        >
          <Button
            className="vt-btn-primary w-full sm:w-auto"
            onClick={onDownloadPdf}
            disabled={generating}
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Download PDF →"}
          </Button>
        </CTAcard>

        {/* Invite client — if no portal user */}
        {showInvite && (
          <CTAcard
            icon={<UserPlus className="h-5 w-5 text-[color:var(--accent)]" />}
            title="Invite client to portal"
            body={`Give ${client.name} read-only access to their reports.`}
          >
            <Button className="vt-btn-primary w-full sm:w-auto" onClick={() => setInviteOpen(true)}>
              Send Invitation →
            </Button>
          </CTAcard>
        )}

        {/* Add competitors — if none */}
        {showCompetitors && (
          <CTAcard
            icon={<TrendingUp className="h-5 w-5 text-[color:var(--accent)]" />}
            title="Add competitors"
            body={`Benchmark ${client.name} against their market.`}
          >
            <Button
              className="vt-btn-primary w-full sm:w-auto"
              onClick={() => navigate({ to: "/dashboard/clients/$id", params: { id: client.id }, hash: "competitors" })}
            >
              Add competitors →
            </Button>
          </CTAcard>
        )}

        {/* Reminder — always */}
        <CTAcard
          icon={<Bell className="h-5 w-5 text-[color:var(--accent)]" />}
          title="Set audit reminder"
          body="Get reminded to re-audit in 30 days."
        >
          {noteDate ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Reminder set for <strong>{new Date(noteDate).toLocaleDateString()}</strong></span>
              <button
                className="text-xs text-[color:var(--muted)] hover:text-[color:var(--red)] underline"
                onClick={() => reminderSet.mutate(null)}
                disabled={reminderSet.isPending}
              >
                Clear
              </button>
            </div>
          ) : (
            <Button
              className="vt-btn-primary w-full sm:w-auto"
              onClick={set30Days}
              disabled={reminderSet.isPending}
            >
              Set reminder →
            </Button>
          )}
        </CTAcard>
      </div>

      {/* Invite modal */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite {client.name}</DialogTitle>
            <DialogDescription>They'll get an email with a 7-day signup link.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!/^\S+@\S+\.\S+$/.test(inviteEmail)) return toast.error("Enter a valid email");
            invite.mutate();
          }}>
            <Input
              type="email"
              placeholder="client@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              autoFocus
            />
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
              <Button type="submit" className="vt-btn-primary" disabled={invite.isPending}>
                {invite.isPending ? "Sending…" : "Send invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function CTAcard({
  icon, title, body, children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="vt-card p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="shrink-0 mt-0.5">{icon}</div>
        <div className="min-w-0">
          <div className="font-semibold text-sm">{title}</div>
          <div className="text-xs text-[color:var(--muted)] mt-0.5">{body}</div>
        </div>
      </div>
      <div className="mt-auto">{children}</div>
    </div>
  );
}

