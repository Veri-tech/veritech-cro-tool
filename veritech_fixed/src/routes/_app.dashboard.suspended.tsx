import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/lib/auth";

export const Route = createFileRoute("/_app/dashboard/suspended")({
  component: SuspendedPage,
});

function SuspendedPage() {
  const { data } = useSession();
  return (
    <div className="mx-auto max-w-xl text-center py-16">
      <h1 className="text-2xl font-semibold text-[color:var(--amber)]">Your account has been suspended</h1>
      {data?.agency?.suspended_reason && (
        <p className="mt-3 text-sm text-[color:var(--muted)]">
          Reason: <span className="text-[color:var(--light)]">{data.agency.suspended_reason}</span>
        </p>
      )}
      <p className="mt-6 text-[color:var(--light)]/80">
        Contact{" "}
        <a className="vt-link" href="mailto:support@veritechdigital.co.za">
          support@veritechdigital.co.za
        </a>
        .
      </p>
      <p className="mt-3 text-xs text-[color:var(--muted)]">
        Existing PDF downloads remain available.
      </p>
    </div>
  );
}
