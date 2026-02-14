import { useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useOrganEvidenceDetail } from "@/hooks/useOrganEvidenceDetail";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { useGlobalFilters } from "@/contexts/GlobalFilterContext";
import { EvidenceBar } from "@/components/ui/EvidenceBar";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { EvidenceScorePopover } from "@/components/analysis/ScoreBreakdown";
import { FilterSearch } from "@/components/ui/FilterBar";
import {
  formatPValue,
  getDoseConsistencyWeight,
  titleCase,
} from "@/lib/severity-colors";
import { computeOrganStats } from "@/lib/organ-analytics";
import type { OrganStats } from "@/lib/organ-analytics";
import { rail } from "@/lib/design-tokens";
import type { TargetOrganRow, SignalSummaryRow } from "@/types/analysis-views";

// ---------------------------------------------------------------------------
// Per-organ rail stats from signal data
// ---------------------------------------------------------------------------

interface OrganRailStats {
  maxAbsEffectSize: number;
  minTrendP: number | null;
  dominantDirection: "\u2191" | "\u2193" | "\u2195" | null;
}

function computeOrganRailStats(signals: SignalSummaryRow[]): OrganRailStats {
  let maxAbs = 0;
  let minTP: number | null = null;
  let upCount = 0;
  let downCount = 0;

  for (const s of signals) {
    const absEs = Math.abs(s.effect_size ?? 0);
    if (absEs > maxAbs) maxAbs = absEs;
    if (s.trend_p != null && (minTP === null || s.trend_p < minTP))
      minTP = s.trend_p;
    if (s.p_value != null && s.p_value < 0.05) {
      if (s.direction === "up") upCount++;
      else if (s.direction === "down") downCount++;
    }
  }

  let dominantDirection: "\u2191" | "\u2193" | "\u2195" | null = null;
  if (upCount > 0 || downCount > 0) {
    if (upCount > 0 && downCount > 0) dominantDirection = "\u2195";
    else if (upCount > downCount) dominantDirection = "\u2191";
    else dominantDirection = "\u2193";
  }

  return { maxAbsEffectSize: maxAbs, minTrendP: minTP, dominantDirection };
}

// ---------------------------------------------------------------------------
// Sort modes
// ---------------------------------------------------------------------------

type OrganSortMode = "evidence" | "adverse" | "effect" | "alpha";

// ---------------------------------------------------------------------------
// OrganRailItem
// ---------------------------------------------------------------------------

function OrganRailItem({
  organ,
  isSelected,
  maxEvidenceScore,
  stats,
  signalStats,
  onClick,
}: {
  organ: TargetOrganRow;
  isSelected: boolean;
  maxEvidenceScore: number;
  stats: OrganStats | undefined;
  signalStats: OrganRailStats | null;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        rail.itemBase,
        "px-3 py-2",
        isSelected ? rail.itemSelected : rail.itemIdle,
      )}
      onClick={onClick}
    >
      {/* Row 1: organ name + direction + TARGET */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">
          {titleCase(organ.organ_system)}
        </span>
        {signalStats?.dominantDirection && (
          <span className="text-[10px] text-muted-foreground/60">
            {signalStats.dominantDirection}
          </span>
        )}
        {organ.target_organ_flag && (
          <span className="text-[9px] font-semibold uppercase text-[#DC2626]">
            TARGET
          </span>
        )}
      </div>

      {/* Row 2: evidence bar */}
      <div className="flex items-center gap-1">
        <div className="flex-1">
          <EvidenceBar
            value={organ.evidence_score}
            max={maxEvidenceScore}
            label={organ.evidence_score.toFixed(2)}
            labelClassName={
              organ.evidence_score >= 0.5
                ? "font-semibold"
                : organ.evidence_score >= 0.3
                  ? "font-medium"
                  : ""
            }
          />
        </div>
        <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <EvidenceScorePopover organ={organ}>
            <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] text-muted-foreground hover:bg-accent">
              ?
            </span>
          </EvidenceScorePopover>
        </span>
      </div>

      {/* Row 3: signal metrics */}
      {stats && (
        <div className="mt-1 flex items-center gap-2 text-[10px]">
          {stats.minPValue !== null && (
            <span
              className={cn(
                "font-mono text-muted-foreground",
                stats.minPValue < 0.001
                  ? "font-semibold"
                  : stats.minPValue < 0.01
                    ? "font-medium"
                    : "",
              )}
            >
              p={formatPValue(stats.minPValue)}
            </span>
          )}
          {stats.maxEffectSize !== null && (
            <span
              className={cn(
                "font-mono text-muted-foreground",
                stats.maxEffectSize >= 0.8
                  ? "font-semibold"
                  : stats.maxEffectSize >= 0.5
                    ? "font-medium"
                    : "",
              )}
            >
              |d|={stats.maxEffectSize.toFixed(2)}
            </span>
          )}
          <span
            className={cn(
              "text-[9px] text-muted-foreground",
              getDoseConsistencyWeight(stats.doseConsistency),
            )}
          >
            {stats.doseConsistency}
          </span>
        </div>
      )}

      {/* Row 4: stats + domain labels */}
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
        <span>{organ.n_significant} sig</span>
        <span>&middot;</span>
        <span>{organ.n_treatment_related} TR</span>
        <span>&middot;</span>
        <span>
          {organ.n_domains} domain{organ.n_domains !== 1 ? "s" : ""}
        </span>
        {organ.domains.map((d) => (
          <DomainLabel key={d} domain={d} />
        ))}
      </div>

      {/* Row 5: max |d| and trend p from signal data */}
      {signalStats && (
        <div className="mt-0.5 flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
          <span
            className={cn(
              "font-mono",
              signalStats.maxAbsEffectSize >= 0.8 && "font-semibold",
            )}
          >
            |d|={signalStats.maxAbsEffectSize.toFixed(2)}
          </span>
          {signalStats.minTrendP != null && (
            <span
              className={cn(
                "font-mono",
                signalStats.minTrendP < 0.01 && "font-semibold",
              )}
            >
              trend p={formatPValue(signalStats.minTrendP)}
            </span>
          )}
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// OrganRailMode
// ---------------------------------------------------------------------------

export function OrganRailMode() {
  const { studyId } = useParams<{ studyId: string }>();
  const { selection, navigateTo } = useStudySelection();
  const { filters, setFilters } = useGlobalFilters();
  const { data: targetOrgans } = useTargetOrganSummary(studyId);
  const { data: signalData } = useStudySignalSummary(studyId);
  const { data: evidenceData } = useOrganEvidenceDetail(studyId);

  const [sortBy, setSortBy] = useState<OrganSortMode>("evidence");

  // Sorted organs (targets first, then by evidence_score desc)
  const sortedOrgans = useMemo(() => {
    if (!targetOrgans) return [];
    let list = [...targetOrgans];

    // Apply global filters
    if (filters.search) {
      const q = filters.search.toLowerCase();
      list = list.filter((o) =>
        o.organ_system.replace(/_/g, " ").toLowerCase().includes(q),
      );
    }
    if (filters.adverseOnly) {
      list = list.filter((o) => o.n_treatment_related > 0);
    }
    if (filters.significantOnly) {
      list = list.filter((o) => o.n_significant > 0);
    }

    // Sort
    switch (sortBy) {
      case "evidence":
        list.sort((a, b) => {
          if (a.target_organ_flag !== b.target_organ_flag)
            return a.target_organ_flag ? -1 : 1;
          return b.evidence_score - a.evidence_score;
        });
        break;
      case "adverse":
        list.sort((a, b) => b.n_treatment_related - a.n_treatment_related);
        break;
      case "effect":
        // Sort by max signal score
        list.sort((a, b) => b.max_signal_score - a.max_signal_score);
        break;
      case "alpha":
        list.sort((a, b) => a.organ_system.localeCompare(b.organ_system));
        break;
    }
    return list;
  }, [targetOrgans, filters.search, filters.adverseOnly, filters.significantOnly, sortBy]);

  // Evidence stats per organ
  const organStatsMap = useMemo(() => {
    const map = new Map<string, OrganStats>();
    if (!evidenceData) return map;
    const grouped = new Map<string, typeof evidenceData>();
    for (const r of evidenceData) {
      let arr = grouped.get(r.organ_system);
      if (!arr) {
        arr = [];
        grouped.set(r.organ_system, arr);
      }
      arr.push(r);
    }
    for (const [key, rows] of grouped) {
      map.set(key, computeOrganStats(rows));
    }
    return map;
  }, [evidenceData]);

  // Signal-level rail stats
  const signalStatsMap = useMemo(() => {
    const map = new Map<string, OrganRailStats>();
    if (!signalData) return map;
    const grouped = new Map<string, SignalSummaryRow[]>();
    for (const s of signalData) {
      let arr = grouped.get(s.organ_system);
      if (!arr) {
        arr = [];
        grouped.set(s.organ_system, arr);
      }
      arr.push(s);
    }
    for (const [key, signals] of grouped) {
      map.set(key, computeOrganRailStats(signals));
    }
    return map;
  }, [signalData]);

  const maxEvidenceScore = useMemo(
    () =>
      sortedOrgans.length > 0
        ? Math.max(...sortedOrgans.map((o) => o.evidence_score))
        : 1,
    [sortedOrgans],
  );

  // Separator between targets and non-targets
  const separatorIdx = useMemo(() => {
    if (sortBy !== "evidence") return -1;
    for (let i = 0; i < sortedOrgans.length - 1; i++) {
      if (sortedOrgans[i].target_organ_flag && !sortedOrgans[i + 1].target_organ_flag)
        return i;
    }
    return -1;
  }, [sortedOrgans, sortBy]);

  const handleOrganClick = (organ: string) => {
    navigateTo({ organSystem: organ });
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header + sort controls */}
      <div className="border-b px-2.5 py-1.5">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Organs ({sortedOrgans.length})
          </span>
          <FilterSearch
            value={filters.search}
            onChange={(v) => setFilters({ search: v })}
            placeholder="Type to search..."
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as OrganSortMode)}
          className="h-5 w-full rounded border bg-background px-1 text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="evidence">Sort: Evidence (default)</option>
          <option value="adverse">Sort: Adverse count</option>
          <option value="effect">Sort: Effect size</option>
          <option value="alpha">Sort: A\u2013Z</option>
        </select>
      </div>

      {/* Organ list */}
      <div className="flex-1 overflow-y-auto">
        {sortedOrgans.map((organ, i) => (
          <div key={organ.organ_system}>
            {i === separatorIdx + 1 && separatorIdx >= 0 && (
              <div className="border-b px-3 py-1.5 text-[9px] uppercase tracking-wider text-muted-foreground/50">
                Other organs
              </div>
            )}
            <OrganRailItem
              organ={organ}
              isSelected={selection.organSystem === organ.organ_system}
              maxEvidenceScore={maxEvidenceScore}
              stats={organStatsMap.get(organ.organ_system)}
              signalStats={signalStatsMap.get(organ.organ_system) ?? null}
              onClick={() => handleOrganClick(organ.organ_system)}
            />
          </div>
        ))}
        {sortedOrgans.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
            {filters.search
              ? `No matches for \u201C${filters.search}\u201D`
              : "No organ data available"}
          </div>
        )}
      </div>
    </div>
  );
}
