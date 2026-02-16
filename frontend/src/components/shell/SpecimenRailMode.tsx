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
  getDoseConsistencyWeight,
  titleCase,
} from "@/lib/severity-colors";
import { getNeutralHeatColor } from "@/components/analysis/HistopathologyView";
import {
  deriveSpecimenSummaries,
  deriveSpecimenReviewStatus,
} from "@/components/analysis/HistopathologyView";
import type {
  SpecimenSummary,
  SpecimenReviewStatus,
} from "@/components/analysis/HistopathologyView";
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
  sortBy,
}: {
  summary: SpecimenSummary;
  isSelected: boolean;
  onClick: () => void;
  reviewStatus?: SpecimenReviewStatus;
  sortBy?: string;
}) {
  const sevColors = getNeutralHeatColor(summary.maxSeverity);
  const incColors = getNeutralHeatColor01(summary.maxIncidence);
  const incPct = Math.round(summary.maxIncidence * 100);
  const bd = summary.signalScoreBreakdown;
  const scoreTooltip = sortBy === "signal"
    ? `Signal score: ${summary.signalScore.toFixed(1)}\n  Adverse findings (${summary.adverseCount} × 3): ${bd.adverse}\n  Max severity: ${bd.severity.toFixed(1)}\n  Peak incidence (${incPct}% × 5): ${bd.incidence.toFixed(1)}\n  Dose consistency (${summary.doseConsistency}): ${bd.dose}\n  Clinical class (${summary.highestClinicalClass ?? "none"}): ${bd.clinicalFloor}\n  Sentinel boost: ${bd.sentinelBoost}`
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
            title="All findings confirmed"
          >
            {"\u2713"}
          </span>
        )}
        {reviewStatus === "Revised" && (
          <span
            className="shrink-0 text-[9px] text-muted-foreground"
            title="Findings revised"
          >
            {"\u007E"}
          </span>
        )}
        {reviewStatus === "Under dispute" && (
          <span
            className="shrink-0 text-[9px] text-muted-foreground"
            title="Under dispute — unresolved disagreement"
          >
            !
          </span>
        )}
        {reviewStatus === "PWG pending" && (
          <span
            className="shrink-0 text-[9px] text-muted-foreground"
            title="PWG review pending"
          >
            P
          </span>
        )}
        {reviewStatus === "In review" && (
          <span
            className="shrink-0 text-[9px] text-muted-foreground/40"
            title="In review — partially reviewed"
          >
            {"\u00B7"}
          </span>
        )}
        <span
          className={cn(
            "w-5 shrink-0 text-right text-[9px]",
            getDoseConsistencyWeight(summary.doseConsistency),
            summary.doseDirection === "decreasing"
              ? summary.doseConsistency === "Strong"
                ? "text-blue-600/70"
                : summary.doseConsistency === "Moderate"
                  ? "text-blue-600/50"
                  : "text-blue-600/30"
              : summary.doseConsistency === "Strong"
                ? "text-muted-foreground"
                : summary.doseConsistency === "Moderate"
                  ? "text-muted-foreground/60"
                  : summary.doseConsistency === "NonMonotonic"
                    ? "text-muted-foreground/50"
                    : "text-muted-foreground/30",
          )}
          title={`Dose trend: ${summary.doseConsistency} ${summary.doseDirection}`}
        >
          {summary.doseDirection === "decreasing"
            ? summary.doseConsistency === "Strong"
              ? "\u25BC\u25BC\u25BC"
              : summary.doseConsistency === "Moderate"
                ? "\u25BC\u25BC"
                : "\u25BC"
            : summary.doseDirection === "mixed"
              ? "\u25B2\u25BC"
              : summary.doseConsistency === "Strong"
                ? "\u25B2\u25B2\u25B2"
                : summary.doseConsistency === "Moderate"
                  ? "\u25B2\u25B2"
                  : summary.doseConsistency === "NonMonotonic"
                    ? "\u25B2\u25BC"
                    : "\u25B2"}
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

      {/* Line 2: organ system + domains */}
      <div className="mt-0.5 flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground/60">
          {titleCase(specimenToOrganSystem(summary.specimen))}
        </span>
        {summary.domains.map((d) => (
          <DomainLabel key={d} domain={d} />
        ))}
      </div>
    </button>
  );
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

  const { containerRef: listRef, onKeyDown: handleListKeyDown } =
    useRailKeyboard(clearSelection);

  // Specimen-specific filters (local to specimen rail, not global)
  const [sortBy, setSortBy] = useState<SpecimenSort>("signal");
  const [doseTrendFilter, setDoseTrendFilter] = useState<
    "any" | "moderate" | "strong"
  >("any");

  // Pathology reviews — already typed from hook
  const pathReviews = annotationsData && Object.keys(annotationsData).length > 0
    ? annotationsData
    : undefined;

  // Build specimen summaries
  const specimens = useMemo(() => {
    if (!lesionData) return [];
    return deriveSpecimenSummaries(lesionData, ruleResults);
  }, [lesionData, ruleResults]);

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
    if (doseTrendFilter === "moderate") {
      list = list.filter(
        (s) =>
          s.doseConsistency === "Moderate" || s.doseConsistency === "Strong" || s.doseConsistency === "NonMonotonic",
      );
    } else if (doseTrendFilter === "strong") {
      list = list.filter((s) => s.doseConsistency === "Strong");
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
            if (doseTrendFilter === "moderate") parts.push("Moderate+ trend");
            else if (doseTrendFilter === "strong") parts.push("Strong trend");
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
            <option value="alpha">Sort: A\u2013Z</option>
          </FilterSelect>
          <FilterSelect
            value={doseTrendFilter}
            onChange={(e) =>
              setDoseTrendFilter(
                e.target.value as "any" | "moderate" | "strong",
              )
            }
            title="Dose trend filter"
          >
            <option value="any">Trend: all</option>
            <option value="moderate">Moderate+</option>
            <option value="strong">Strong only</option>
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
