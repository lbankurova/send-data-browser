import type { StudyContext } from "@/types/study-context";
import type { StudyMortality } from "@/types/mortality";

interface StudyBannerProps {
  studyContext: StudyContext;
  doseGroupCount: number;
  tumorCount?: number;
  mortality?: StudyMortality | null;
}

/**
 * Compact study identity bar for analysis views.
 * Shows species+strain, duration+route, dose group count, GLP status.
 * Matches MortalityBanner pattern: bg-muted/30, text-[11px], border-b border-border/40.
 */
export function StudyBanner({ studyContext, doseGroupCount, tumorCount, mortality }: StudyBannerProps) {
  const { species, strain, dosingDurationWeeks, route, glpCompliant } = studyContext;

  // Format: "Sprague-Dawley rat" or just "Rat" if no strain
  const speciesStrain = strain
    ? `${titleCase(strain)} ${species.toLowerCase()}`
    : titleCase(species);

  // Format: "13-week oral gavage" or "oral gavage" if no duration
  const durationRoute = dosingDurationWeeks != null
    ? `${Math.round(dosingDurationWeeks)}-week ${route.toLowerCase()}`
    : route.toLowerCase();

  return (
    <div className="flex items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
      <span className="font-semibold">{speciesStrain}</span>
      <span className="text-muted-foreground/40">|</span>
      <span>{durationRoute}</span>
      <span className="text-muted-foreground/40">|</span>
      <span>{doseGroupCount} dose group{doseGroupCount !== 1 ? "s" : ""}</span>
      {glpCompliant && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span>GLP</span>
        </>
      )}
      {tumorCount != null && tumorCount > 0 && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span>{tumorCount} tumor{tumorCount !== 1 ? "s" : ""}</span>
        </>
      )}
      {mortality?.has_mortality && mortality.total_deaths > 0 && (
        <span
          className="ml-auto border-l-4 pl-1.5 font-medium text-foreground"
          style={{ borderLeftColor: "#DC2626" }}
        >
          {mortality.total_deaths} death{mortality.total_deaths !== 1 ? "s" : ""}
          {mortality.mortality_loael != null && (() => {
            // NOAEL cap = dose level below the mortality LOAEL
            const capLevel = mortality.mortality_loael - 1;
            const capDose = mortality.by_dose.find(d => d.dose_level === capLevel);
            const mortalityDose = mortality.by_dose.find(d => d.dose_level === mortality.mortality_loael);
            const unit = mortality.mortality_loael_label?.match(/\d[\d.]*\s*(mg\/kg|mg|µg\/kg|µg|g\/kg|g)/)?.[1] ?? "";
            const capLabel = capDose?.dose_value != null && unit ? `${capDose.dose_value} ${unit}` : null;
            const mortalityLabel = mortalityDose?.dose_value != null && unit ? `${mortalityDose.dose_value} ${unit}` : null;
            if (capLabel && mortalityLabel) return ` \u2014 NOAEL \u2264 ${capLabel} (mortality at ${mortalityLabel})`;
            if (mortalityLabel) return ` \u2014 NOAEL capped below ${mortalityLabel}`;
            return " \u2014 NOAEL capped";
          })()}
        </span>
      )}
    </div>
  );
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(s.includes("-") ? "-" : " ");
}
