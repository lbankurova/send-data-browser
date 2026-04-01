import type { StudyContext } from "@/types/study-context";
import type { CrossAnimalFlags } from "@/lib/analysis-view-api";
import { AlertTriangle } from "lucide-react";

interface StudyBannerProps {
  studyContext: StudyContext;
  doseGroupCount: number;
  tumorCount?: number;
  tkSubjectCount?: number;
  crossAnimalFlags?: CrossAnimalFlags;
  /** A5: multi-compound study indicator */
  isMultiCompound?: boolean;
  compounds?: string[];
  /** BP-C1: Human-readable design type label. */
  designTypeLabel?: string | null;
  /** BP-C4: Escalation caveat text. */
  designCaveat?: string | null;
  /** True for crossover/escalation studies. */
  isCrossover?: boolean;
  /** Within-subject N for crossover studies (same animals at all doses). */
  withinSubjectN?: number | null;
}

/**
 * Compact study identity bar for analysis views.
 * Shows species+strain, duration+route, dose group count, GLP status.
 * Matches MortalityBanner pattern: bg-muted/30, text-xs, border-b border-border/40.
 */
export function StudyBanner({ studyContext, doseGroupCount, tumorCount, tkSubjectCount, crossAnimalFlags, isMultiCompound, compounds, designTypeLabel, designCaveat, isCrossover, withinSubjectN }: StudyBannerProps) {
  const { species, strain, dosingDurationWeeks, recoveryPeriodDays, route } = studyContext;

  // Format: "Sprague-Dawley rat" or just "Rat" if no strain
  const speciesStrain = strain
    ? `${titleCase(strain)} ${species.toLowerCase()}`
    : titleCase(species);

  // Format: "13-week, 2wk rec oral gavage" or "oral gavage" if no duration
  const recSuffix = recoveryPeriodDays != null
    ? (recoveryPeriodDays >= 7
        ? `, ${Math.round(recoveryPeriodDays / 7)}wk rec`
        : `, ${recoveryPeriodDays}d rec`)
    : "";
  const durationRoute = dosingDurationWeeks != null
    ? `${Math.round(dosingDurationWeeks)}-week${recSuffix} ${route.toLowerCase()}`
    : route.toLowerCase();

  return (
    <div className="flex items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="font-semibold">
        {speciesStrain}
        {isCrossover && withinSubjectN != null && (
          <span className="ml-1 font-normal text-muted-foreground" title="Within-subject design: same animals receive all treatments">
            N={withinSubjectN} (within-subject)
          </span>
        )}
      </span>
      <span className="text-muted-foreground/40">|</span>
      <span>{durationRoute}</span>
      <span className="text-muted-foreground/40">|</span>
      <span>{doseGroupCount} dose group{doseGroupCount !== 1 ? "s" : ""}</span>
      {studyContext.studyType && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span>{titleCase(studyContext.studyType)}</span>
        </>
      )}
      {designTypeLabel && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span title={designCaveat ?? undefined}>{designTypeLabel}</span>
        </>
      )}
      {isMultiCompound && compounds && compounds.length > 1 && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-amber-600 font-medium">{compounds.length} test articles</span>
        </>
      )}
      {tumorCount != null && tumorCount > 0 && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span>
            {tumorCount} tumor{tumorCount !== 1 ? "s" : ""}
            {crossAnimalFlags?.tumor_linkage?.banner_text && (
              <span className="ml-1 text-foreground/70">
                | <AlertTriangle className="inline h-3 w-3 shrink-0 align-text-bottom" style={{ color: "#D97706" }} /> {crossAnimalFlags.tumor_linkage.banner_text}
              </span>
            )}
          </span>
        </>
      )}
      {crossAnimalFlags?.tissue_battery?.study_level_note && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span className="text-foreground/70">
            <AlertTriangle className="inline h-3 w-3 shrink-0 align-text-bottom" style={{ color: "#D97706" }} /> Tissue battery: {crossAnimalFlags.tissue_battery.study_level_note}
          </span>
        </>
      )}
      {tkSubjectCount != null && tkSubjectCount > 0 && (
        <>
          <span className="text-muted-foreground/40">|</span>
          <span>{tkSubjectCount} TK satellite{tkSubjectCount !== 1 ? "s" : ""} excluded</span>
        </>
      )}
      {/* Mortality moved to context panel — banner stays compact */}
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
