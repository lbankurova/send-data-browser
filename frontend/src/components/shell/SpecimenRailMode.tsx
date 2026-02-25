import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useLesionSeveritySummary } from "@/hooks/useLesionSeveritySummary";
import { useRuleResults } from "@/hooks/useRuleResults";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { useGlobalFilters } from "@/contexts/GlobalFilterContext";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { FilterSelect, FilterShowingLine } from "@/components/ui/FilterBar";
import {
  getNeutralHeatColor as getNeutralHeatColor01,
  titleCase,
} from "@/lib/severity-colors";
import { formatPatternLabel } from "@/lib/pattern-classification";
import { detectSyndromes } from "@/lib/syndrome-rules";
import { SparklineGlyph } from "@/components/ui/SparklineGlyph";
import { useFindingDoseTrends } from "@/hooks/useFindingDoseTrends";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useStudyContext } from "@/hooks/useStudyContext";
import type { LesionSeverityRow } from "@/types/analysis-views";
import {
  getNeutralHeatColor,
  deriveSpecimenSummaries,
  deriveSpecimenReviewStatus,
} from "@/lib/histopathology-helpers";
import type {
  SpecimenSummary,
  SpecimenReviewStatus,
} from "@/lib/histopathology-helpers";
import { specimenToOrganSystem } from "@/components/analysis/panes/HistopathologyContextPanel";
import { rail } from "@/lib/design-tokens";
import { useRailKeyboard } from "@/hooks/useRailKeyboard";
import type { PathologyReview } from "@/types/annotations";

// ---------------------------------------------------------------------------
// SpecimenRailItem (ported from HistopathologyView)
// ---------------------------------------------------------------------------

function SpecimenRailItem({
  summary,
  isSelected,
  onClick,
  reviewStatus,
  reviewTooltip,
  sortBy,
}: {
  summary: SpecimenSummary;
  isSelected: boolean;
  onClick: () => void;
  reviewStatus?: SpecimenReviewStatus;
  reviewTooltip?: string;
  sortBy?: string;
}) {
  const sevColors = getNeutralHeatColor(summary.maxSeverity);
  const incColors = getNeutralHeatColor01(summary.maxIncidence);
  const incPct = Math.round(summary.maxIncidence * 100);
  const bd = summary.signalScoreBreakdown;
  const scoreTooltip = sortBy === "signal"
    ? `Signal score: ${summary.signalScore.toFixed(1)}\n  Adverse findings (${summary.adverseCount} × 3): ${bd.adverse}\n  Max severity: ${bd.severity.toFixed(1)}\n  Peak incidence (${incPct}% × 5): ${bd.incidence.toFixed(1)}\n  Pattern weight: ${bd.pattern.toFixed(1)}\n  Syndrome boost: ${bd.syndromeBoost.toFixed(1)}\n  Clinical class (${summary.highestClinicalClass ?? "none"}): ${bd.clinicalFloor}\n  Sentinel boost: ${bd.sentinelBoost}`
    : undefined;
  return (
    <button
      className={cn(
        rail.itemBase,
        "px-2.5 py-2",
        isSelected ? rail.itemSelected : rail.itemIdle,
      )}
      onClick={onClick}
    >
      {/* Line 1: specimen name + quantitative indicators */}
      <div className="flex items-center">
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={scoreTooltip}>
          {summary.specimen.replace(/_/g, " ")}
        </span>
        {reviewStatus === "Confirmed" && (
          <span
            className="shrink-0 text-[9px] text-muted-foreground"
            title={reviewTooltip}
          >
            {"\u2713"}
          </span>
        )}
        {reviewStatus === "Revised" && (
          <span
            className="shrink-0 text-[9px] text-muted-foreground"
            title={reviewTooltip}
          >
            {"\u007E"}
          </span>
        )}
        {reviewStatus === "Under dispute" && (
          <span
            className="shrink-0 text-[9px] text-muted-foreground"
            title={reviewTooltip}
          >
            !
          </span>
        )}
        {reviewStatus === "PWG pending" && (
          <span
            className="shrink-0 text-[9px] text-muted-foreground"
            title={reviewTooltip}
          >
            P
          </span>
        )}
        {reviewStatus === "In review" && (
          <span
            className="shrink-0 text-[9px] text-muted-foreground/40"
            title={reviewTooltip}
          >
            {"\u00B7"}
          </span>
        )}
        <span className="shrink-0" title={formatPatternLabel(summary.pattern)}>
          <SparklineGlyph values={summary.pattern.sparkline} pattern={summary.pattern.pattern} />
        </span>
        <span
          className="ml-2 w-7 shrink-0 rounded-sm text-center font-mono text-[9px]"
          style={{ backgroundColor: sevColors.bg, color: sevColors.text }}
          title={`Max severity: ${summary.maxSeverity.toFixed(1)} (scale 1\u20135)`}
        >
          {summary.maxSeverity.toFixed(1)}
        </span>
        <span
          className="ml-1 w-8 shrink-0 rounded-sm text-center font-mono text-[9px]"
          style={{ backgroundColor: incColors.bg, color: incColors.text }}
          title={`Peak incidence: ${incPct}%`}
        >
          {incPct}%
        </span>
        <span
          className="w-3 shrink-0 text-right font-mono text-[9px] text-muted-foreground"
          title={`${summary.findingCount} findings`}
        >
          {summary.findingCount}
        </span>
        <span
          className={cn(
            "w-4 shrink-0 text-right font-mono text-[9px]",
            summary.adverseCount > 0
              ? "text-muted-foreground"
              : "text-muted-foreground/40",
          )}
          title={`${summary.adverseCount} adverse`}
        >
          {summary.adverseCount}A
        </span>
        {summary.hasSentinel && (
          <span
            className="ml-0.5 shrink-0 rounded bg-gray-200 px-0.5 font-mono text-[9px] text-muted-foreground"
            title={`Contains sentinel finding(s) — highest clinical class: ${summary.highestClinicalClass ?? "Sentinel"}`}
          >
            S
          </span>
        )}
      </div>

      {/* Line 2: pattern label + organ system + domains */}
      <div className="mt-0.5 flex items-center gap-2">
        <span className="truncate text-[10px] text-muted-foreground">
          {formatPatternLabel(summary.pattern)}
        </span>
        <span className="text-[10px] text-muted-foreground/60">
          {titleCase(specimenToOrganSystem(summary.specimen))}
        </span>
        {summary.domains.map((d) => (
          <DomainLabel key={d} domain={d} />
        ))}
      </div>
      {/* Line 3: syndrome badge (when detected) */}
      {summary.pattern.syndrome && (
        <div className="mt-0.5 truncate text-[10px] text-muted-foreground/70">
          {"\uD83D\uDD17"} {summary.pattern.syndrome.syndrome.syndrome_name}
        </div>
      )}
    </button>
  );
}

function buildReviewTooltip(
  status: SpecimenReviewStatus,
  findingNames: string[],
  reviews: Record<string, PathologyReview> | undefined,
): string {
  const total = findingNames.length;
  const reviewed = reviews
    ? findingNames.filter((f) => reviews[f] && reviews[f].peerReviewStatus !== "Not Reviewed").length
    : 0;
  return `${status} \u2014 ${reviewed}/${total} findings reviewed`;
}

// ---------------------------------------------------------------------------
// SpecimenRailMode
// ---------------------------------------------------------------------------

type SpecimenSort = "signal" | "organ" | "severity" | "incidence" | "alpha";

export function SpecimenRailMode() {
  const { studyId } = useParams<{ studyId: string }>();
  const { selection, navigateTo, clearSelection } = useStudySelection();
  const { filters } = useGlobalFilters();
  const { data: lesionData } = useLesionSeveritySummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);
  const { data: annotationsData } = useAnnotations<PathologyReview>(studyId, "pathology_review");
  const { data: studyCtx } = useStudyContext(studyId);

  const { containerRef: listRef, onKeyDown: handleListKeyDown } =
    useRailKeyboard(clearSelection);

  // Specimen-specific filters (local to specimen rail, not global)
  const [sortBy, setSortBy] = useState<SpecimenSort>("signal");
  const [doseTrendFilter, setDoseTrendFilter] = useState<
    "any" | "dose-dependent" | "non-background" | "syndrome"
  >("any");

  // Trend + signal data for pattern classification
  const { data: trendData } = useFindingDoseTrends(studyId);
  const { data: signalData } = useStudySignalSummary(studyId);

  // Syndrome detection
  const syndromeMatches = useMemo(() => {
    if (!lesionData) return [];
    const organMap = new Map<string, LesionSeverityRow[]>();
    for (const r of lesionData) {
      if (!r.specimen) continue;
      const key = r.specimen.toUpperCase();
      const arr = organMap.get(key) ?? [];
      arr.push(r);
      organMap.set(key, arr);
    }
    return detectSyndromes(organMap, signalData ?? null, studyCtx);
  }, [lesionData, signalData, studyCtx]);

  // Pathology reviews — already typed from hook
  const pathReviews = annotationsData && Object.keys(annotationsData).length > 0
    ? annotationsData
    : undefined;

  // Build specimen summaries
  const specimens = useMemo(() => {
    if (!lesionData) return [];
    return deriveSpecimenSummaries(lesionData, ruleResults, trendData, syndromeMatches, signalData);
  }, [lesionData, ruleResults, trendData, syndromeMatches, signalData]);

  // Build finding names by specimen for review status
  const findingNamesBySpecimen = useMemo(() => {
    if (!lesionData) return new Map<string, string[]>();
    const map = new Map<string, Set<string>>();
    for (const row of lesionData) {
      if (!row.specimen) continue;
      let set = map.get(row.specimen);
      if (!set) {
        set = new Set();
        map.set(row.specimen, set);
      }
      set.add(row.finding);
    }
    const result = new Map<string, string[]>();
    for (const [spec, set] of map) {
      result.set(spec, [...set]);
    }
    return result;
  }, [lesionData]);

  // Filter and sort
  const filtered = useMemo(() => {
    let list = specimens;

    // Global filters
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((s) =>
        s.specimen.replace(/_/g, " ").toLowerCase().includes(q),
      );
    }
    if (filters.adverseOnly) {
      list = list.filter((s) => s.adverseCount > 0);
    }
    if (filters.significantOnly) {
      list = list.filter((s) => s.signalScore > 0);
    }

    // Organ filter (from cross-view link or organ mode selection)
    if (selection.organSystem && !selection.specimen) {
      list = list.filter(
        (s) => specimenToOrganSystem(s.specimen) === selection.organSystem,
      );
    }

    // Local filters
    if (filters.minSeverity > 0) {
      list = list.filter((s) => s.maxSeverity >= filters.minSeverity);
    }
    if (doseTrendFilter === "dose-dependent") {
      list = list.filter(
        (s) =>
          ["MONOTONIC_UP", "MONOTONIC_DOWN", "THRESHOLD"].includes(s.pattern.pattern),
      );
    } else if (doseTrendFilter === "non-background") {
      list = list.filter(
        (s) => !["CONTROL_ONLY", "NO_PATTERN"].includes(s.pattern.pattern),
      );
    } else if (doseTrendFilter === "syndrome") {
      list = list.filter((s) => s.pattern.syndrome !== null);
    }

    // Sort
    const sorted = [...list];
    switch (sortBy) {
      case "signal":
        sorted.sort((a, b) => b.signalScore - a.signalScore);
        break;
      case "organ":
        sorted.sort((a, b) => {
          const orgA = specimenToOrganSystem(a.specimen);
          const orgB = specimenToOrganSystem(b.specimen);
          if (orgA !== orgB) return orgA.localeCompare(orgB);
          return b.maxSeverity - a.maxSeverity;
        });
        break;
      case "severity":
        sorted.sort((a, b) => b.maxSeverity - a.maxSeverity);
        break;
      case "incidence":
        sorted.sort((a, b) => b.maxIncidence - a.maxIncidence);
        break;
      case "alpha":
        sorted.sort((a, b) => a.specimen.localeCompare(b.specimen));
        break;
    }
    return sorted;
  }, [
    specimens,
    filters.search,
    filters.adverseOnly,
    filters.significantOnly,
    filters.minSeverity,
    selection.organSystem,
    selection.specimen,
    doseTrendFilter,
    sortBy,
  ]);

  const handleSpecimenClick = (specimen: string) => {
    const organSystem = specimenToOrganSystem(specimen);
    navigateTo({ organSystem, specimen });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with filter controls */}
      <div className="border-b px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Specimens ({specimens.length})
          </span>
        </div>

        <FilterShowingLine
          className="mt-0.5"
          parts={(() => {
            if (
              !filters.minSeverity &&
              !filters.adverseOnly &&
              !filters.significantOnly &&
              !filters.sex &&
              doseTrendFilter === "any" &&
              !filters.search
            )
              return undefined;
            const parts: string[] = [];
            if (filters.search) parts.push(`\u201C${filters.search}\u201D`);
            if (filters.sex) parts.push(filters.sex === "M" ? "Male" : "Female");
            if (filters.minSeverity > 0) parts.push(`Severity ${filters.minSeverity}+`);
            if (filters.adverseOnly) parts.push("Adverse only");
            if (filters.significantOnly) parts.push("Significant only");
            if (doseTrendFilter === "dose-dependent") parts.push("Dose-dependent");
            else if (doseTrendFilter === "non-background") parts.push("Non-background");
            else if (doseTrendFilter === "syndrome") parts.push("Has syndrome");
            parts.push(`${filtered.length}/${specimens.length}`);
            return parts;
          })()}
        />

        {/* Filter row */}
        <div className="mt-2 flex items-center gap-1.5">
          <FilterSelect
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SpecimenSort)}
            title="Sort specimens by"
          >
            <option value="signal">Sort: Signal</option>
            <option value="organ">Sort: Organ</option>
            <option value="severity">Sort: Severity</option>
            <option value="incidence">Sort: Incidence</option>
            <option value="alpha">Sort: A–Z</option>
          </FilterSelect>
          <FilterSelect
            value={doseTrendFilter}
            onChange={(e) =>
              setDoseTrendFilter(
                e.target.value as "any" | "dose-dependent" | "non-background" | "syndrome",
              )
            }
            title="Pattern filter"
          >
            <option value="any">Pattern: all</option>
            <option value="dose-dependent">Dose-dependent</option>
            <option value="non-background">Non-background</option>
            <option value="syndrome">Has syndrome</option>
          </FilterSelect>
        </div>
      </div>

      {/* Organ filter breadcrumb chip */}
      {selection.organSystem && !selection.specimen && (
        <div className="border-b px-2.5 py-1">
          <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
            Filtered to: {titleCase(selection.organSystem)}
            <button
              className="ml-0.5 rounded p-0.5 hover:bg-accent"
              onClick={clearSelection}
              title="Clear organ filter"
            >
              {"\u00D7"}
            </button>
          </span>
        </div>
      )}

      {/* Specimen list */}
      <div ref={listRef} className="flex-1 overflow-y-auto" tabIndex={0} onKeyDown={handleListKeyDown}>
        {sortBy === "organ"
          ? (() => {
              const groups: { system: string; items: typeof filtered }[] = [];
              let currentSystem = "";
              for (const s of filtered) {
                const sys = specimenToOrganSystem(s.specimen);
                if (sys !== currentSystem) {
                  currentSystem = sys;
                  groups.push({ system: sys, items: [] });
                }
                groups[groups.length - 1].items.push(s);
              }
              return groups.map((g) => {
                const advCount = g.items.filter(
                  (s) => s.adverseCount > 0,
                ).length;
                return (
                  <div key={g.system}>
                    <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border/60 bg-muted/40 px-2.5 py-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {titleCase(g.system)}
                      </span>
                      <span className="text-[9px] text-muted-foreground/60">
                        {g.items.length} specimen
                        {g.items.length !== 1 ? "s" : ""}
                        {advCount > 0 && <> &middot; {advCount} adverse</>}
                      </span>
                    </div>
                    {g.items.map((s) => (
                      <SpecimenRailItem
                        key={s.specimen}
                        summary={s}
                        isSelected={selection.specimen === s.specimen}
                        onClick={() => handleSpecimenClick(s.specimen)}
                        reviewStatus={deriveSpecimenReviewStatus(
                          findingNamesBySpecimen.get(s.specimen) ?? [],
                          pathReviews,
                        )}
                        reviewTooltip={buildReviewTooltip(
                          deriveSpecimenReviewStatus(findingNamesBySpecimen.get(s.specimen) ?? [], pathReviews),
                          findingNamesBySpecimen.get(s.specimen) ?? [],
                          pathReviews,
                        )}
                        sortBy={sortBy}
                      />
                    ))}
                  </div>
                );
              });
            })()
          : filtered.map((s) => (
              <SpecimenRailItem
                key={s.specimen}
                summary={s}
                isSelected={selection.specimen === s.specimen}
                onClick={() => handleSpecimenClick(s.specimen)}
                reviewStatus={deriveSpecimenReviewStatus(
                  findingNamesBySpecimen.get(s.specimen) ?? [],
                  pathReviews,
                )}
                reviewTooltip={buildReviewTooltip(
                  deriveSpecimenReviewStatus(findingNamesBySpecimen.get(s.specimen) ?? [], pathReviews),
                  findingNamesBySpecimen.get(s.specimen) ?? [],
                  pathReviews,
                )}
                sortBy={sortBy}
              />
            ))}
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            {filters.search
              ? `No matches for \u201C${filters.search}\u201D`
              : "No specimen data available"}
          </div>
        )}
      </div>
    </div>
  );
}
