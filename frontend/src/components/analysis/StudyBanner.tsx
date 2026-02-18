import type { StudyContext } from "@/types/study-context";

interface StudyBannerProps {
  studyContext: StudyContext;
  doseGroupCount: number;
  tumorCount?: number;
}

/**
 * Compact study identity bar for analysis views.
 * Shows species+strain, duration+route, dose group count, GLP status.
 * Matches MortalityBanner pattern: bg-muted/30, text-[11px], border-b border-border/40.
 */
export function StudyBanner({ studyContext, doseGroupCount, tumorCount }: StudyBannerProps) {
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
