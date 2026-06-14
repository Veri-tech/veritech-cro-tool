import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/terms")({
  ssr: false,
  head: () => ({ meta: [{ title: "Terms of Service · Veritech CRO Tool" }] }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 text-[color:var(--light)]">
      <Link to="/" className="text-xs uppercase tracking-widest vt-link">← Home</Link>
      <h1 className="mt-4 text-3xl font-semibold">Terms of Service</h1>
      <p className="mt-1 text-xs text-[color:var(--muted)]">Veritech Digital</p>

      <Section title="1. Acceptable use">
        <p>You may use the Veritech CRO Tool to audit pages you own or are authorised to
        audit. You may not use it to scan illegal content, harass third parties, or attempt
        to exfiltrate data you do not own.</p>
      </Section>

      <Section title="2. Audit credits & rate limits">
        <p>Each agency is allocated daily audit and monthly token limits, set per plan.
        Exceeding the cap pauses further audits until reset. Limits can be increased on
        request.</p>
      </Section>

      <Section title="3. Data ownership">
        <p>Clients own their data. Agencies access client data only through scoped
        permissions. Veritech Digital acts as the data processor.</p>
      </Section>

      <Section title="4. Liability">
        <p>The CRO Tool produces AI-generated recommendations. Final implementation
        decisions and outcomes are the responsibility of the agency and the client.
        Veritech Digital is not liable for revenue impact, missed opportunities, or
        indirect damages.</p>
      </Section>

      <Section title="5. Cancellation">
        <p>You may close your account at any time from Settings. Closing the account
        triggers the 30-day data retention window defined in the Privacy Policy.</p>
      </Section>

      <Section title="6. Contact">
        <p><a className="vt-link" href="mailto:support@veritechdigital.co.za">support@veritechdigital.co.za</a></p>
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-sm text-[color:var(--light)]/80 leading-relaxed">{children}</div>
    </section>
  );
}
