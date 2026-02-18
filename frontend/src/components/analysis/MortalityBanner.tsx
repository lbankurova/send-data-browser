import { useMemo } from "react";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import type { StudyMortality } from "@/types/mortality";

interface MortalityBannerProps {
  mortality: StudyMortality;
}

/**
 * Compact mortality context banner for findings/NOAEL views.
 * Returns null when no mortality events detected.
 * Uses neutral gray per design system (no colored badges for categorical info).
 *
 * When early_death_subjects exist, shows a toggle to switch between
 * all-animals and scheduled-sacrifice-only terminal statistics.
 */
export function MortalityBanner({ mortality }: MortalityBannerProps) {
  if (!mortality.has_mortality) return null;

  const details = mortality.early_death_details ?? [];
  const earlyDeathCount = details.length;

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
      {earlyDeathCount > 0 && <EarlyDeathToggle details={details} />}
    </div>
  );
}

function EarlyDeathToggle({
  details,
}: {
  details: StudyMortality["early_death_details"];
}) {
  const { useScheduledOnly: isScheduledOnly, setUseScheduledOnly } = useScheduledOnly();
  const count = details.length;

  // Build per-sex/dose summary for tooltip
  const tooltip = useMemo(() => {
    if (!isScheduledOnly) return "Click to exclude early-death subjects from terminal stats.";
    const lines: string[] = [];
    for (const d of details) {
      lines.push(`${d.USUBJID} (${d.sex}, ${d.dose_label || `dose ${d.dose_level}`}): ${d.disposition}`);
    }
    return `Excluded from terminal stats:\n${lines.join("\n")}\n\nClick to show all animals.`;
  }, [details, isScheduledOnly]);

  return (
    <button
      type="button"
      className="ml-auto flex items-center gap-1.5 rounded border border-border/60 bg-background px-2 py-0.5 text-[10px] transition-colors hover:bg-muted/60"
      onClick={() => setUseScheduledOnly(!isScheduledOnly)}
      title={tooltip}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${isScheduledOnly ? "bg-gray-400" : "bg-gray-300"}`}
      />
      <span>
        {isScheduledOnly
          ? `${count} early death${count !== 1 ? "s" : ""} excluded`
          : "All animals"}
      </span>
    </button>
  );
}
