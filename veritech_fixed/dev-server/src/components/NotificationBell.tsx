import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications.functions";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const qc = useQueryClient();
  const listFn = useServerFn(listMyNotifications);
  const markFn = useServerFn(markNotificationRead);
  const markAllFn = useServerFn(markAllNotificationsRead);

  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listFn({ data: { limit: 20 } }),
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  async function onMarkAll() {
    await markAllFn();
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function onItemClick(id: string) {
    await markFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["notifications"] });
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md p-2 text-[color:var(--muted)] hover:bg-[color:var(--slate)]"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[color:var(--red)] px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] z-50 rounded-lg border border-[color:var(--border)] bg-[color:var(--navy2)] shadow-xl">
          <header className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">Notifications</h3>
              <p className="text-xs text-[color:var(--muted)]">
                {unread > 0 ? `${unread} unread` : "All caught up"}
              </p>
            </div>
            {unread > 0 && (
              <button
                onClick={onMarkAll}
                className="inline-flex items-center gap-1 text-xs text-[color:var(--accent)] hover:underline"
              >
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </header>

          <div className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[color:var(--muted)]">
                No notifications yet.
              </p>
            ) : (
              <ul className="divide-y divide-[color:var(--border)]">
                {items.map((n) => {
                  const Wrapper = n.link
                    ? ({ children }: { children: React.ReactNode }) => (
                        <Link
                          to={n.link!}
                          onClick={() => onItemClick(n.id)}
                          className="block hover:bg-[color:var(--slate)]/50"
                        >
                          {children}
                        </Link>
                      )
                    : ({ children }: { children: React.ReactNode }) => (
                        <button
                          onClick={() => onItemClick(n.id)}
                          className="block w-full text-left hover:bg-[color:var(--slate)]/50"
                        >
                          {children}
                        </button>
                      );
                  return (
                    <li key={n.id} className={n.read ? "opacity-70" : ""}>
                      <Wrapper>
                        <div className="flex items-start gap-3 px-4 py-3">
                          {!n.read && (
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[color:var(--accent)]" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[color:var(--light)] line-clamp-2">
                              {n.title}
                            </p>
                            {n.body && (
                              <p className="text-xs text-[color:var(--muted)] mt-0.5 line-clamp-2">
                                {n.body}
                              </p>
                            )}
                            <p className="text-[10px] uppercase tracking-wide text-[color:var(--muted)] mt-1 font-mono">
                              {timeAgo(n.created_at)}
                            </p>
                          </div>
                        </div>
                      </Wrapper>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
