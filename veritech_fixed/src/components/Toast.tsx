import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

type ToastType = "success" | "error" | "info" | "warning";

interface ToastItem {
  id: number;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (input: Omit<ToastItem, "id">) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const COLORS: Record<ToastType, { border: string; icon: string }> = {
  success: { border: "border-l-[color:var(--green)]", icon: "text-[color:var(--green)]" },
  error: { border: "border-l-[color:var(--red)]", icon: "text-[color:var(--red)]" },
  info: { border: "border-l-[color:var(--accent)]", icon: "text-[color:var(--accent)]" },
  warning: { border: "border-l-[color:var(--amber)]", icon: "text-[color:var(--amber)]" },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((curr) => curr.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((input: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    setItems((curr) => [...curr, { ...input, id }]);
    setTimeout(() => remove(id), 4000);
  }, [remove]);

  const ctx: ToastContextValue = {
    toast: push,
    success: (title, description) => push({ type: "success", title, description }),
    error: (title, description) => push({ type: "error", title, description }),
    info: (title, description) => push({ type: "info", title, description }),
    warning: (title, description) => push({ type: "warning", title, description }),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => {
          const Icon = ICONS[t.type];
          const c = COLORS[t.type];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-lg border border-l-4 ${c.border} border-[color:var(--border)] bg-[color:var(--navy2)] p-3 shadow-lg`}
              role="status"
            >
              <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${c.icon}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-[color:var(--light)]">{t.title}</div>
                {t.description && (
                  <div className="mt-0.5 text-xs text-[color:var(--muted)]">{t.description}</div>
                )}
              </div>
              <button
                onClick={() => remove(t.id)}
                className="text-[color:var(--muted)] hover:text-[color:var(--light)]"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

// Helper for top-of-app loading
export function useAutoDismiss(setter: (msg: string | null) => void, msg: string | null, ms = 4000) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setter(null), ms);
    return () => clearTimeout(t);
  }, [msg, ms, setter]);
}
