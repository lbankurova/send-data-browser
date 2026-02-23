/**
 * Hook: useOrganWeightNormalization
 *
 * Computes organ weight normalization state from existing findings data.
 * Reuses useFindings() via useFindingsAnalyticsLocal — React Query cache
 * ensures zero extra API calls.
 *
 * Phase 1: Hedges' g from summary stats, tiered decisions, no ANCOVA.
 */

import { useMemo } from "react";
import { useFindings } from "@/hooks/useFindings";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import {
  computeStudyNormalization,
  buildSpeciesStrainKey,
  mapStudyType,
} from "@/lib/organ-weight-normalization";
import type {
  StudyNormalizationState,
  NormalizationDecision,
  NormalizationContext,
  GroupStatsTriplet,
} from "@/lib/organ-weight-normalization";
import type { FindingsFilters, UnifiedFinding, GroupStat } from "@/types/analysis";

const ALL_FILTERS: FindingsFilters = {
  domain: null, sex: null, severity: null, search: "",
  organ_system: null, endpoint_label: null, dose_response_pattern: null,
};

/** Extract {doseLevel, n, mean, sd} from group stats, filtering nulls */
function toTriplets(stats: GroupStat[]): GroupStatsTriplet[] {
  const result: GroupStatsTriplet[] = [];
  for (const s of stats) {
    if (s.mean != null && s.sd != null && s.n > 0) {
      result.push({ doseLevel: s.dose_level, n: s.n, mean: s.mean, sd: s.sd });
    }
  }
  return result;
}

/**
 * Aggregate BW findings: picks the "best" BW finding (typically terminal BW
 * or BW gain), preferring the one with the most dose groups and aggregate sex.
 */
function extractBwGroupStats(findings: UnifiedFinding[]): GroupStatsTriplet[] {
  // BW domain findings
  const bwFindings = findings.filter(f => f.domain === "BW" && f.data_type === "continuous");
  if (bwFindings.length === 0) return [];

  // Prefer aggregate sex (often has combined stats), then pick by group count
  const sorted = [...bwFindings].sort((a, b) => {
    // Prefer "Combined" or aggregate
    const aAgg = a.sex === "Combined" || a.sex === "All" ? 1 : 0;
    const bAgg = b.sex === "Combined" || b.sex === "All" ? 1 : 0;
    if (bAgg !== aAgg) return bAgg - aAgg;
    // More dose groups = better coverage
    return b.group_stats.length - a.group_stats.length;
  });

  // Use the first one (best candidate)
  return toTriplets(sorted[0].group_stats);
}

/**
 * Extract brain weight group stats from OM domain findings.
 * Brain is identified by specimen = "BRAIN" (case-insensitive).
 */
function extractBrainGroupStats(findings: UnifiedFinding[]): GroupStatsTriplet[] | null {
  const brainFindings = findings.filter(
    f => f.domain === "OM" && f.data_type === "continuous" &&
    f.specimen?.toUpperCase() === "BRAIN",
  );
  if (brainFindings.length === 0) return null;

  // Prefer aggregate sex, most groups
  const sorted = [...brainFindings].sort((a, b) => {
    const aAgg = a.sex === "Combined" || a.sex === "All" ? 1 : 0;
    const bAgg = b.sex === "Combined" || b.sex === "All" ? 1 : 0;
    if (bAgg !== aAgg) return bAgg - aAgg;
    return b.group_stats.length - a.group_stats.length;
  });

  return toTriplets(sorted[0].group_stats);
}

/**
 * Extract per-organ group stats from OM domain findings.
 * Groups by specimen name (uppercase).
 */
function extractOrganGroupStatsMap(findings: UnifiedFinding[]): Map<string, GroupStatsTriplet[]> {
  const map = new Map<string, GroupStatsTriplet[]>();
  const omFindings = findings.filter(
    f => f.domain === "OM" && f.data_type === "continuous" && f.specimen,
  );

  // Group by specimen; for each specimen, pick best sex aggregate
  const bySpecimen = new Map<string, UnifiedFinding[]>();
  for (const f of omFindings) {
    const key = f.specimen!.toUpperCase();
    let list = bySpecimen.get(key);
    if (!list) {
      list = [];
      bySpecimen.set(key, list);
    }
    list.push(f);
  }

  for (const [specimen, specFindings] of bySpecimen) {
    // Prefer aggregate sex
    const sorted = [...specFindings].sort((a, b) => {
      const aAgg = a.sex === "Combined" || a.sex === "All" ? 1 : 0;
      const bAgg = b.sex === "Combined" || b.sex === "All" ? 1 : 0;
      if (bAgg !== aAgg) return bAgg - aAgg;
      return b.group_stats.length - a.group_stats.length;
    });
    const triplets = toTriplets(sorted[0].group_stats);
    if (triplets.length > 0) {
      map.set(specimen, triplets);
    }
  }

  return map;
}

export interface UseOrganWeightNormalizationResult {
  state: StudyNormalizationState | null;
  isLoading: boolean;
  highestTier: number;
  worstBwG: number;
  worstBrainG: number | null;
  getDecision: (organ: string, doseKey?: string) => NormalizationDecision | null;
  getContext: (organ: string, doseKey?: string) => NormalizationContext | null;
  /** Get worst-case decision across all dose groups for an organ */
  getWorstDecision: (organ: string) => NormalizationDecision | null;
}

export function useOrganWeightNormalization(
  studyId: string | undefined,
): UseOrganWeightNormalizationResult {
  const { data: findingsData, isLoading: findingsLoading } = useFindings(studyId, 1, 10000, ALL_FILTERS);
  const { data: meta } = useStudyMetadata(studyId ?? "");

  const state = useMemo(() => {
    if (!findingsData?.findings?.length || !meta) return null;

    const findings = findingsData.findings;
    const bwStats = extractBwGroupStats(findings);
    if (bwStats.length < 2) return null; // Need at least control + 1 treated

    const brainStats = extractBrainGroupStats(findings);
    const organMap = extractOrganGroupStatsMap(findings);
    if (organMap.size === 0) return null; // No OM data

    const speciesStrain = buildSpeciesStrainKey(meta.species, meta.strain);
    const studyType = mapStudyType(meta.study_type);
    const controlDoseLevel = 0; // Standard SEND convention

    return computeStudyNormalization(
      bwStats,
      brainStats,
      organMap,
      controlDoseLevel,
      speciesStrain,
      studyType,
      studyId ?? "",
    );
  }, [findingsData, meta, studyId]);

  const getDecision = useMemo(() => {
    return (organ: string, doseKey?: string): NormalizationDecision | null => {
      if (!state) return null;
      const organDecisions = state.decisions.get(organ.toUpperCase());
      if (!organDecisions) return null;
      if (doseKey) return organDecisions.get(doseKey) ?? null;
      // Return worst-case across groups
      let worst: NormalizationDecision | null = null;
      for (const d of organDecisions.values()) {
        if (!worst || d.tier > worst.tier) worst = d;
      }
      return worst;
    };
  }, [state]);

  const getWorstDecision = useMemo(() => {
    return (organ: string): NormalizationDecision | null => {
      return getDecision(organ);
    };
  }, [getDecision]);

  const getContext = useMemo(() => {
    return (organ: string, doseKey?: string): NormalizationContext | null => {
      if (!state) return null;
      const organUpper = organ.toUpperCase();
      if (doseKey) {
        return state.contexts.find(c => c.organ === organUpper && c.setcd === doseKey) ?? null;
      }
      // Return worst-tier context
      let worst: NormalizationContext | null = null;
      for (const c of state.contexts) {
        if (c.organ === organUpper && (!worst || c.tier > worst.tier)) worst = c;
      }
      return worst;
    };
  }, [state]);

  return {
    state,
    isLoading: findingsLoading,
    highestTier: state?.highestTier ?? 1,
    worstBwG: state?.worstBwG ?? 0,
    worstBrainG: state?.worstBrainG ?? null,
    getDecision,
    getContext,
    getWorstDecision,
  };
}
