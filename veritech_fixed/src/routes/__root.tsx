import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { ToastProvider } from "@/components/Toast";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--navy)] px-4">
      <div className="max-w-md text-center">
        <h1 className="font-mono text-[110px] leading-none text-[color:var(--muted)]/40">404</h1>
        <h2 className="mt-2 text-2xl font-semibold text-[color:var(--light)]">Page not found</h2>
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          The page you're looking for doesn't exist or you don't have permission to view it.
        </p>
        <div className="mt-6">
          <Link to="/" className="vt-btn-primary">Take me home →</Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    console.error("[root error boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--navy)] px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-[color:var(--light)]">This page didn't load</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          Something went wrong on our end. Try again or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="vt-btn-primary">
            Try again
          </button>
          <a href="/" className="vt-btn-secondary">Go home</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Veritech CRO Tool" },
      { name: "description", content: "AI-powered CRO Intelligence Platform by Veritech Digital" },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:title", content: "Veritech CRO Tool" },
      { property: "og:description", content: "AI-powered CRO Intelligence Platform by Veritech Digital" },
      { property: "og:type", content: "website" },
      { name: "theme-color", content: "#0A1628" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap",
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href:
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='12' fill='%230A1628'/><text x='32' y='44' text-anchor='middle' font-family='JetBrains Mono,monospace' font-weight='700' font-size='38' fill='%234F8CFF'>V</text></svg>`
          ),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Outlet />
      </ToastProvider>
    </QueryClientProvider>
  );
}
