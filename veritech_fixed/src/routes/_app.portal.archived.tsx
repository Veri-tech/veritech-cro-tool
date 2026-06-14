import { createFileRoute } from "@tanstack/react-router";
import { useSession, signOutAndRedirect } from "@/lib/auth";

export const Route = createFileRoute("/_app/portal/archived")({
  component: ArchivedPage,
});

function ArchivedPage() {
  const { data } = useSession();
  return (
    <div className="mx-auto max-w-xl text-center py-16">
      <h1 className="text-2xl font-semibold text-[color:var(--amber)]">
        Your account access has been paused
      </h1>
      <p className="mt-4 text-[color:var(--light)]/80">
        Contact{" "}
        <a className="vt-link" href={`mailto:${data?.agency?.contact_email ?? "your agency"}`}>
          {data?.agency?.contact_email ?? "your agency"}
        </a>{" "}
        for more information.
      </p>
      <button onClick={() => signOutAndRedirect()} className="mt-8 vt-btn-secondary">Logout</button>
    </div>
  );
}
