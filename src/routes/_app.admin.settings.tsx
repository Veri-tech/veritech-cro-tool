import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { getSystemConfig, updateSystemConfig } from "@/lib/admin.functions";
import { Skeleton } from "@/components/Skeleton";

export const Route = createFileRoute("/_app/admin/settings")({
  component: AdminSettings,
});

// Known config keys with friendly metadata. Unknown keys still render as plain rows.
const KNOWN: Record<string, { label: string; help: string; type?: "number" | "text" | "textarea" }> = {
  default_daily_audit_limit: { label: "Default daily audit limit", help: "Applied to new agencies on signup.", type: "number" },
  default_monthly_token_budget: { label: "Default monthly token budget", help: "Default Claude token cap per agency.", type: "number" },
  support_email: { label: "Support contact email", help: "Shown to clients in error states and notifications.", type: "text" },
  maintenance_mode: { label: "Maintenance mode", help: 'Set to "on" to block new audit runs.', type: "text" },
  audit_concurrency: { label: "Per-agency audit concurrency", help: "Maximum simultaneously-running audits per agency.", type: "number" },
};

function AdminSettings() {
  const fn = useServerFn(getSystemConfig);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["admin-config"], queryFn: () => fn() });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const map: Record<string, string> = {};
    data.config.forEach((c: any) => { map[c.key] = c.value; });
    Object.keys(KNOWN).forEach((k) => { if (!(k in map)) map[k] = ""; });
    setDraft(map);
  }, [data]);

  if (isLoading || !data) {
    return <div className="max-w-3xl mx-auto space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  }

  const save = async (key: string) => {
    setSavingKey(key);
    try {
      await updateSystemConfig({ data: { key, value: draft[key] ?? "" } });
      qc.invalidateQueries({ queryKey: ["admin-config"] });
    } finally { setSavingKey(null); }
  };

  const allKeys = Array.from(new Set([...Object.keys(KNOWN), ...data.config.map((c: any) => c.key)]));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Platform Settings</h1>
        <p className="text-sm text-[color:var(--muted)] mt-1">Global defaults applied across the platform.</p>
      </header>

      <div className="space-y-3">
        {allKeys.map((key) => {
          const meta = KNOWN[key];
          const original = data.config.find((c: any) => c.key === key)?.value ?? "";
          const dirty = (draft[key] ?? "") !== original;
          return (
            <div key={key} className="vt-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <label className="text-sm font-medium">{meta?.label ?? key}</label>
                  <p className="text-xs text-[color:var(--muted)] mt-0.5 font-mono">{key}</p>
                  {meta?.help && <p className="text-xs text-[color:var(--muted)] mt-1">{meta.help}</p>}
                </div>
                <button
                  onClick={() => save(key)}
                  disabled={!dirty || savingKey === key}
                  className="vt-btn-primary py-1.5 px-3 text-xs disabled:opacity-40 shrink-0"
                >
                  <Save className="h-3 w-3" />{savingKey === key ? "Saving…" : "Save"}
                </button>
              </div>
              <input
                type={meta?.type === "number" ? "number" : "text"}
                value={draft[key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                className="vt-input mt-3"
                placeholder={meta?.type === "number" ? "0" : ""}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
