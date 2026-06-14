import { createFileRoute } from "@tanstack/react-router";
import { signOutAndRedirect } from "@/lib/auth";

export const Route = createFileRoute("/account-closed")({
  ssr: false,
  head: () => ({ meta: [{ title: "Account closed · Veritech CRO Tool" }] }),
  component: AccountClosedPage,
});

function AccountClosedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[color:var(--navy)] px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-[color:var(--light)]">This account has been closed</h1>
        <p className="mt-4 text-sm text-[color:var(--muted)]">
          Contact{" "}
          <a className="vt-link" href="mailto:support@veritechdigital.co.za">
            support@veritechdigital.co.za
          </a>{" "}
          if you need assistance.
        </p>
        <button onClick={() => signOutAndRedirect()} className="mt-8 vt-btn-secondary">Logout</button>
      </div>
    </div>
  );
}
