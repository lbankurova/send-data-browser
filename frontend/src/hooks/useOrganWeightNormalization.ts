/**
 * Hook: useOrganWeightNormalization
 *
 * Computes organ weight normalization state from existing findings data.
 * On the findings view, findings are already fetched by useFindingsAnalyticsLocal
 * and React Query deduplicates — zero extra API calls.
 *
 * On the study details view, pass `fetchEnabled: false` to read from cache
 * only — no expensive backend call triggered. Data appears once the user
 * visits the findings view (cache populates), then persists for 5 min.
 *
 * Phase 1: Hedges' g from summary stats, tiered decisions.
 * Phase 2: Enriches contexts with ANCOVA effectDecomposition when available.
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchFindings } from "@/lib/analysis-api";
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
import type { EffectSizeMethod } from "@/lib/stat-method-transforms";
import type { FindingsFilters, UnifiedFinding, GroupStat, ANCOVAResult } from "@/types/analysis";

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
 * Pick the BW finding with the peak treatment effect (max |effect_size|),
 * excluding day 1 (pre-dose randomization noise).
 *
 * Rationale: the normalization engine needs worst-case BW confounding, not
 * terminal BW. Terminal underestimates confounding when there's partial
 * recovery or TR deaths (survivorship bias). Peak divergence — typically
 * mid-study — captures all animals before censoring.
 *
 * Ties: latest day first, then males (larger absolute BW effects).
 */
export function extractBwGroupStats(findings: UnifiedFinding[]): GroupStatsTriplet[] {
  // BW domain findings, exclude day 1 (pre-dose)
  const bwFindings = findings.filter(
    f => f.domain === "BW" && f.data_type === "continuous" && (f.day ?? 0) > 1,
  );
  if (bwFindings.length === 0) return [];

  // Sort by max |effect_size| desc, then latest day, then males first
  const sorted = [...bwFindings].sort((a, b) => {
    const aEs = Math.abs(a.max_effect_size ?? 0);
    const bEs = Math.abs(b.max_effect_size ?? 0);
    if (bEs !== aEs) return bEs - aEs;
    // Tie-break: latest day
    const aDay = a.day ?? 0;
    const bDay = b.day ?? 0;
    if (bDay !== aDay) return bDay - aDay;
    // Tie-break: males first (conservative pick)
    const aM = a.sex === "M" ? 1 : 0;
    const bM = b.sex === "M" ? 1 : 0;
    return bM - aM;
  });

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

/**
 * Enrich NormalizationContexts with ANCOVA effectDecomposition from findings.
 * When a finding has precomputed ANCOVA data, map each dose group's
 * decomposition into the matching NormalizationContext.
 */
function enrichWithAncova(
  state: StudyNormalizationState,
  findings: UnifiedFinding[],
): void {
  const omWithAncova = findings.filter(
    (f): f is UnifiedFinding & { ancova: ANCOVAResult } =>
      f.domain === "OM" && f.ancova != null,
  );
  if (omWithAncova.length === 0) return;

  for (const f of omWithAncova) {
    const organ = f.specimen?.toUpperCase();
    if (!organ) continue;

    for (const decomp of f.ancova.effect_decomposition) {
      const doseKey = String(decomp.group);
      const ctx = state.contexts.find(
        (c) => c.organ === organ && c.setcd === doseKey,
      );
      if (!ctx) continue;

      ctx.effectDecomposition = {
        totalEffect: decomp.total_effect,
        directEffect: decomp.direct_effect,
        indirectEffect: decomp.indirect_effect,
        proportionDirect: decomp.proportion_direct,
        directG: decomp.direct_g,
        directP: decomp.direct_p,
      };

      // Update mode to 'ancova' when backend selected it as recommended
      if (f.normalization?.recommended_metric === "ancova") {
        ctx.activeMode = "ancova";
      }
    }
  }
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

/**
 * @param studyId  Study to compute normalization for
 * @param fetchEnabled  When true (default), triggers the findings API call.
 *   When false, reads from React Query cache only — returns data if findings
 *   were previously fetched (e.g., from the findings view), otherwise returns
 *   defaults. Use false on the study details view to avoid the expensive
 *   backend computation.
 */
export function useOrganWeightNormalization(
  studyId: string | undefined,
  fetchEnabled = true,
  effectSizeMethod: EffectSizeMethod = "hedges-g",
): UseOrganWeightNormalizationResult {
  // Use useQuery directly so we can control `enabled` per-caller.
  // Query key matches useFindings(studyId, 1, 10000, ALL_FILTERS) exactly,
  // so React Query deduplicates with useFindingsAnalyticsLocal on the findings view.
  const { data: findingsData, isLoading: findingsLoading } = useQuery({
    queryKey: ["findings", studyId, 1, 10000, ALL_FILTERS],
    queryFn: () => fetchFindings(studyId!, 1, 10000, ALL_FILTERS),
    enabled: fetchEnabled && !!studyId,
    staleTime: 5 * 60 * 1000,
  });
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

    const result = computeStudyNormalization(
      bwStats,
      brainStats,
      organMap,
      controlDoseLevel,
      speciesStrain,
      studyType,
      studyId ?? "",
      effectSizeMethod,
      meta.has_estrous_data ?? false,
    );

    // Enrich NormalizationContexts with ANCOVA effectDecomposition (Phase 2)
    enrichWithAncova(result, findings);

    return result;
  }, [findingsData, meta, studyId, effectSizeMethod]);

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
