import type { StudyMortality } from "@/types/mortality";

interface MortalityBannerProps {
  mortality: StudyMortality;
}

/**
 * Compact mortality context banner for findings/NOAEL views.
 * Returns null when no mortality events detected.
 * Uses neutral gray per design system (no colored badges for categorical info).
 */
export function MortalityBanner({ mortality }: MortalityBannerProps) {
  if (!mortality.has_mortality) return null;

  // Build cause summary from death records (main-study only)
  const mainDeaths = mortality.deaths.filter((d) => !d.is_recovery);
  const causes = [...new Set(mainDeaths.map((d) => d.cause).filter(Boolean))];
  const causeText = causes.length > 0 ? causes.join(", ") : "unspecified cause";

  // Dose info
  const doseText = mortality.mortality_loael_label
    ? `at ${mortality.mortality_loael_label}`
    : "";

  // Accidental note
  const accidentalNote =
    mortality.total_accidental > 0
      ? ` (${mortality.total_accidental} accidental death${mortality.total_accidental > 1 ? "s" : ""} excluded)`
      : "";

  return (
    <div className="flex items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="font-semibold">Mortality:</span>
      <span>
        {mortality.total_deaths} treatment-related death{mortality.total_deaths !== 1 ? "s" : ""}
        {doseText ? ` ${doseText}` : ""} — {causeText}
        {accidentalNote}
      </span>
    </div>
  );
}
