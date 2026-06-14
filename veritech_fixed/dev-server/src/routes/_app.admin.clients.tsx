import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { listAllClients } from "@/lib/admin.functions";
import { Skeleton } from "@/components/Skeleton";

export const Route = createFileRoute("/_app/admin/clients")({
  component: AdminClients,
});

function AdminClients() {
  const fn = useServerFn(listAllClients);
  const { data, isLoading } = useQuery({ queryKey: ["admin-all-clients"], queryFn: () => fn() });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const list = data?.clients ?? [];
    if (!q.trim()) return list;
    const t = q.toLowerCase();
    return list.filter((c: any) =>
      c.name?.toLowerCase().includes(t) ||
      c.domain?.toLowerCase().includes(t) ||
      c.agencies?.name?.toLowerCase().includes(t),
    );
  }, [data, q]);

  if (isLoading || !data) {
    return <div className="max-w-6xl mx-auto space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">All Clients</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">{data.clients.length} clients across every agency.</p>
      </header>

      <div className="relative max-w-sm">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, domain, agency…" className="vt-input pl-9" />
      </div>

      <div className="vt-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-[color:var(--muted)]">
            <tr className="border-b border-[color:var(--border)]">
              <th className="text-left px-4 py-3">Client</th>
              <th className="text-left px-4 py-3">Agency</th>
              <th className="text-left px-4 py-3">Domain</th>
              <th className="text-left px-4 py-3">Industry</th>
              <th className="text-right px-4 py-3">Traffic/mo</th>
              <th className="text-left px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr key={c.id} className="border-b border-[color:var(--border)] last:border-0">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-[color:var(--muted)]">{c.agencies?.name ?? "—"}</td>
                <td className="px-4 py-3 font-mono text-xs">{c.domain ?? "—"}</td>
                <td className="px-4 py-3 text-[color:var(--muted)]">{c.industry ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono">{c.monthly_traffic?.toLocaleString() ?? "—"}</td>
                <td className="px-4 py-3">
                  {c.archived ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[color:var(--slate)] text-[color:var(--muted)]">archived</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-300">active</span>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-[color:var(--muted)]">No clients match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
