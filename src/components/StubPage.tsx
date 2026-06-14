export function StubPage({
  title,
  subtitle,
  comingIn,
}: {
  title: string;
  subtitle?: string;
  comingIn?: string;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--light)]">{title}</h1>
      {subtitle && <p className="mt-2 text-sm text-[color:var(--muted)]">{subtitle}</p>}
      <div className="mt-8 vt-card p-10 text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-[color:var(--muted)]">
          Coming{comingIn ? ` in ${comingIn}` : " soon"}
        </p>
        <p className="mt-3 text-[color:var(--light)]/80">
          This area is part of the platform shell. Feature implementation arrives in a later phase.
        </p>
      </div>
    </div>
  );
}
