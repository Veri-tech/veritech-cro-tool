import type { ReactNode } from "react";
import { VeritechLogo } from "./Logo";
import { Link } from "@tanstack/react-router";

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-[color:var(--navy)]">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <Link to="/" aria-label="Veritech CRO Tool home">
              <VeritechLogo size={44} />
            </Link>
          </div>
          <div className="vt-card p-7">
            <h1 className="text-xl font-semibold text-[color:var(--light)]">{title}</h1>
            {subtitle && (
              <p className="mt-1.5 text-sm text-[color:var(--muted)]">{subtitle}</p>
            )}
            <div className="mt-6">{children}</div>
          </div>
          {footer && <div className="mt-6 text-center text-sm">{footer}</div>}
        </div>
      </div>
      <footer className="py-6 text-center text-xs text-[color:var(--muted)]">
        Powered by Veritech Digital · veritechdigital.co.za ·{" "}
        <Link to="/privacy" className="vt-link">Privacy</Link> ·{" "}
        <Link to="/terms" className="vt-link">Terms</Link>
      </footer>
    </div>
  );
}
