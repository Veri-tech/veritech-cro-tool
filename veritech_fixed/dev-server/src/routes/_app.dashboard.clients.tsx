import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Archive, ArchiveRestore } from "lucide-react";
import { listClients, createClient, setArchived } from "@/lib/clients.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/Skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/dashboard/clients")({
  ssr: false,
  component: ClientsPage,
});

const INDUSTRIES = ["E-commerce", "Lead Gen", "SaaS", "Services", "Other"] as const;

function ClientsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const fetchClients = useServerFn(listClients);

  const { data: clients, isLoading } = useQuery({
    queryKey: ["clients", { showArchived }],
    queryFn: () => fetchClients({ data: { includeArchived: showArchived } }),
  });

  const filtered = (clients ?? []).filter((c) => {
    const matchesSearch =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.domain ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesIndustry = industry === "all" || c.industry === industry;
    return matchesSearch && matchesIndustry;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clients</h1>
          <p className="text-sm text-[color:var(--muted)]">Manage your client roster and run audits.</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="vt-btn-primary">
          <Plus className="h-4 w-4 mr-2" /> Add Client
        </Button>
      </div>

      <div className="vt-card p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--muted)]" />
          <Input
            placeholder="Search name or domain…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 vt-input"
          />
        </div>
        <Select value={industry} onValueChange={setIndustry}>
          <SelectTrigger className="w-[180px]"><SelectValue placeholder="Industry" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All industries</SelectItem>
            {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="vt-card overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="bg-[color:var(--navy)] text-[color:var(--muted)] text-xs uppercase">
            <tr>
              <th className="px-4 py-3 text-left">Client</th>
              <th className="px-4 py-3 text-left">Domain</th>
              <th className="px-4 py-3 text-left">Industry</th>
              <th className="px-4 py-3 text-left">CRO Score</th>
              <th className="px-4 py-3 text-left">Last Audit</th>
              <th className="px-4 py-3 text-left">Portal</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-t border-[color:var(--border)]">
                <td colSpan={7} className="p-3"><Skeleton className="h-6 w-full" /></td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="p-10 text-center text-[color:var(--muted)]">
                {clients?.length ? "No matches." : "No clients yet. Click Add Client to get started."}
              </td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-[color:var(--border)] hover:bg-[color:var(--navy)]/60">
                <td className="px-4 py-3">
                  <Link to="/dashboard/clients/$id" params={{ id: c.id }} className="font-medium text-[color:var(--accent)] hover:underline">
                    {c.name}
                  </Link>
                  {c.archived && <span className="ml-2 text-xs text-[color:var(--muted)]">(archived)</span>}
                </td>
                <td className="px-4 py-3 text-[color:var(--muted)]">{c.domain ?? "—"}</td>
                <td className="px-4 py-3 text-[color:var(--muted)]">{c.industry ?? "—"}</td>
                <td className="px-4 py-3">{c.latest_score != null ? <ScoreBadge score={c.latest_score} /> : <span className="text-[color:var(--muted)]">—</span>}</td>
                <td className="px-4 py-3 text-[color:var(--muted)]">
                  {c.last_audit_at ? new Date(c.last_audit_at).toLocaleDateString() : "Never"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.portal_user_id ? (
                    <span className="text-[color:var(--green)]">Active</span>
                  ) : (
                    <InviteButton clientId={c.id} clientName={c.name} />
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <ArchiveButton clientId={c.id} archived={!!c.archived} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-sm text-[color:var(--muted)]">
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Show archived
        </label>
      </div>

      <AddClientModal open={modalOpen} onOpenChange={setModalOpen} />
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const c = score >= 81 ? "var(--green)" : score >= 66 ? "var(--teal)" : score >= 51 ? "var(--accent)" : score >= 30 ? "var(--amber)" : "var(--red)";
  return <span className="inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-md px-2 text-xs font-bold text-white" style={{ background: c }}>{score}</span>;
}

function ArchiveButton({ clientId, archived }: { clientId: string; archived: boolean }) {
  const qc = useQueryClient();
  const fn = useServerFn(setArchived);
  const m = useMutation({
    mutationFn: () => fn({ data: { id: clientId, archived: !archived } }),
    onSuccess: () => {
      toast.success(archived ? "Client restored" : "Client archived");
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button onClick={() => m.mutate()} className="text-[color:var(--muted)] hover:text-[color:var(--light)]" aria-label={archived ? "Restore" : "Archive"}>
      {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
    </button>
  );
}

function InviteButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      const { createClientInvitation } = await import("@/lib/email.functions");
      return createClientInvitation({ data: { clientId, email: email.trim() } });
    },
    onSuccess: () => {
      toast.success(`Invitation sent to ${email}`);
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false); setEmail("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[color:var(--accent)] hover:underline">Invite</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invite {clientName}</DialogTitle>
            <DialogDescription>They'll get an email with a 7-day signup link.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Enter a valid email"); m.mutate(); }}>
            <Input type="email" placeholder="client@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" className="vt-btn-primary" disabled={m.isPending}>{m.isPending ? "Sending…" : "Send invite"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddClientModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(createClient);
  const [form, setForm] = useState({
    name: "", domain: "", industry: "", contact_name: "", contact_email: "",
    monthly_traffic: "", avg_order_value: "", notes: "",
  });
  useEffect(() => { if (!open) setForm({ name: "", domain: "", industry: "", contact_name: "", contact_email: "", monthly_traffic: "", avg_order_value: "", notes: "" }); }, [open]);

  const m = useMutation({
    mutationFn: () => fn({
      data: {
        name: form.name.trim(),
        domain: form.domain.trim() || null,
        industry: (form.industry as any) || null,
        contact_name: form.contact_name.trim() || null,
        contact_email: form.contact_email.trim() || null,
        monthly_traffic: form.monthly_traffic ? Number(form.monthly_traffic) : null,
        avg_order_value: form.avg_order_value ? Number(form.avg_order_value) : null,
        notes: form.notes.trim() || null,
      },
    }),
    onSuccess: () => { toast.success("Client added successfully"); qc.invalidateQueries({ queryKey: ["clients"] }); onOpenChange(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a client</DialogTitle>
          <DialogDescription>You can update these details later.</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (form.name.trim().length < 2) return toast.error("Name must be at least 2 characters."); m.mutate(); }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Company name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Website domain"><Input placeholder="example.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} /></Field>
            <Field label="Industry">
              <Select value={form.industry} onValueChange={(v) => setForm({ ...form, industry: v })}>
                <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>{INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Contact name"><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
            <Field label="Contact email"><Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
            <Field label="Monthly traffic"><Input type="number" min="0" value={form.monthly_traffic} onChange={(e) => setForm({ ...form, monthly_traffic: e.target.value })} /></Field>
            <Field label="AOV (ZAR)"><Input type="number" min="0" step="0.01" value={form.avg_order_value} onChange={(e) => setForm({ ...form, avg_order_value: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="vt-btn-primary" disabled={m.isPending}>{m.isPending ? "Saving…" : "Add client"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs text-[color:var(--muted)]">{label}</Label>{children}</div>;
}
