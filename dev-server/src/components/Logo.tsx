export function VeritechLogo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex items-center justify-center rounded-md font-mono font-bold text-white"
        style={{
          width: size,
          height: size,
          background: "linear-gradient(135deg, #4F8CFF 0%, #00C4CC 100%)",
          fontSize: size * 0.55,
        }}
        aria-hidden
      >
        V
      </div>
      <div className="leading-tight">
        <div className="text-[color:var(--light)] font-semibold tracking-tight text-sm">
          Veritech
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--muted)]">
          CRO Tool
        </div>
      </div>
    </div>
  );
}
