/**
 * PharmacologicalBadge — indicator pill for findings that match an expected
 * pharmacological effect profile (D9 fired in the GRADE confidence engine).
 *
 * Violet palette: reserved for "may need expert review/override" signals
 * (consistent with override zones per CLAUDE.md design decisions).
 */

interface PharmacologicalBadgeProps {
  /** D9 rationale string — shown as tooltip on hover. */
  rationale?: string | null;
  /** Compact mode: shows abbreviated "Pharm" instead of "Pharmacological". */
  compact?: boolean;
  className?: string;
}

export function PharmacologicalBadge({
  rationale,
  compact = false,
  className,
}: PharmacologicalBadgeProps) {
  const label = compact ? "Pharm" : "Pharmacological";
  const tooltip = rationale
    ? rationale
    : "Matches expected pharmacological effect profile";

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-1.5 py-0.5",
        "text-[10px] font-medium leading-none",
        "bg-violet-50 text-violet-600 border-violet-200",
        className ?? "",
      ].join(" ")}
      title={tooltip}
    >
      {label}
    </span>
  );
}
