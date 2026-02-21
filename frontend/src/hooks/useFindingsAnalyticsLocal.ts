/**
 * Single source of truth for findings analytics derivation.
 *
 * All findings consumers (FindingsView, FindingsRail, FindingsContextPanel,
 * OrganContextPanel, SyndromeContextPanel) use this hook instead of
 * duplicating the derivation pipeline. React Query's 5-min stale cache
 * ensures the underlying useFindings() call returns the same cached
 * response — no extra API calls.
 */

import { useMemo } from "react";
import { useFindings } from "@/hooks/useFindings";
import { mapFindingsToRows, deriveEndpointSummaries, deriveOrganCoherence, computeEndpointNoaelMap } from "@/lib/derive-summaries";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import { evaluateLabRules, getClinicalFloor } from "@/lib/lab-clinical-catalog";
import { withSignalScores, classifyEndpointConfidence, getConfidenceMultiplier } from "@/lib/findings-rail-engine";
import type { FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import type { FindingsFilters, FindingsResponse } from "@/types/analysis";

const ALL_FILTERS: FindingsFilters = {
  domain: null, sex: null, severity: null, search: "",
  organ_system: null, endpoint_label: null, dose_response_pattern: null,
};

export interface FindingsAnalyticsResult {
  analytics: FindingsAnalytics;
  /** Raw API response — consumers that need UnifiedFinding[] or dose_groups access this. */
  data: FindingsResponse | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useFindingsAnalyticsLocal(studyId: string | undefined): FindingsAnalyticsResult {
  const { data, isLoading, error } = useFindings(studyId, 1, 10000, ALL_FILTERS);

  const endpointSummaries = useMemo(() => {
    if (!data?.findings?.length) return [];
    const rows = mapFindingsToRows(data.findings);
    const summaries = deriveEndpointSummaries(rows);
    if (data.dose_groups) {
      const noaelMap = computeEndpointNoaelMap(data.findings, data.dose_groups);
      for (const ep of summaries) {
        const noael = noaelMap.get(ep.endpoint_label);
        if (noael) {
          ep.noaelTier = noael.combined.tier;
          ep.noaelDoseValue = noael.combined.doseValue;
          ep.noaelDoseUnit = noael.combined.doseUnit;
          if (noael.sexDiffers) ep.noaelBySex = noael.bySex;
        }
      }
    }
    return summaries;
  }, [data]);

  const organCoherence = useMemo(() => deriveOrganCoherence(endpointSummaries), [endpointSummaries]);
  const syndromes = useMemo(() => detectCrossDomainSyndromes(endpointSummaries), [endpointSummaries]);
  const labMatches = useMemo(
    () => evaluateLabRules(endpointSummaries, organCoherence, syndromes),
    [endpointSummaries, organCoherence, syndromes],
  );

  const signalScores = useMemo(() => {
    const boostMap = new Map<string, { syndromeBoost: number; coherenceBoost: number; clinicalFloor: number; confidenceMultiplier: number }>();
    for (const ep of endpointSummaries) {
      let synBoost = 0;
      for (const syn of syndromes) {
        if (syn.matchedEndpoints.some((m) => m.endpoint_label === ep.endpoint_label)) {
          synBoost = syn.confidence === "HIGH" ? 6 : syn.confidence === "MODERATE" ? 3 : 1;
          break;
        }
      }
      const coh = organCoherence.get(ep.organ_system);
      const cohBoost = coh ? Math.min(coh.domainCount - 1, 3) * 2 : 0;
      let floor = 0;
      for (const match of labMatches) {
        if (match.matchedEndpoints.includes(ep.endpoint_label)) {
          floor = Math.max(floor, getClinicalFloor(match.severity));
        }
      }
      const conf = classifyEndpointConfidence(ep);
      const confMult = getConfidenceMultiplier(conf);
      if (cohBoost > 0 || synBoost > 0 || floor > 0 || confMult !== 1) {
        boostMap.set(ep.endpoint_label, { syndromeBoost: synBoost, coherenceBoost: cohBoost, clinicalFloor: floor, confidenceMultiplier: confMult });
      }
    }
    const scored = withSignalScores(endpointSummaries, boostMap);
    const map = new Map<string, number>();
    for (const ep of scored) map.set(ep.endpoint_label, ep.signal);
    return map;
  }, [endpointSummaries, organCoherence, syndromes, labMatches]);

  const endpointSexes = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ep of endpointSummaries) {
      map.set(ep.endpoint_label, ep.sexes);
    }
    return map;
  }, [endpointSummaries]);

  const analytics = useMemo(() => ({
    endpoints: endpointSummaries,
    syndromes,
    organCoherence,
    labMatches,
    signalScores,
    endpointSexes,
  }), [endpointSummaries, syndromes, organCoherence, labMatches, signalScores, endpointSexes]);

  return { analytics, data, isLoading, error: error as Error | null };
}
