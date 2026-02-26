/**
 * Single source of truth for findings analytics derivation.
 *
 * All findings consumers (FindingsView, FindingsRail, FindingsContextPanel,
 * OrganContextPanel, SyndromeContextPanel) use this hook instead of
 * duplicating the derivation pipeline. React Query's 5-min stale cache
 * ensures the underlying useFindings() call returns the same cached
 * response — no extra API calls.
 *
 * Scheduled-only aware: when the mortality toggle excludes early-death
 * subjects, the derivation pipeline uses scheduled stats and filters out
 * findings that vanish entirely. This propagates through ALL downstream
 * analytics (endpoint summaries, syndromes, signal scores, etc.).
 */

import { useMemo } from "react";
import { useFindings } from "@/hooks/useFindings";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useStatMethods } from "@/hooks/useStatMethods";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { mapFindingsToRows, deriveEndpointSummaries, deriveOrganCoherence, computeEndpointNoaelMap } from "@/lib/derive-summaries";
import { attachEndpointConfidence } from "@/lib/endpoint-confidence";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import { evaluateLabRules, getClinicalFloor } from "@/lib/lab-clinical-catalog";
import { withSignalScores, classifyEndpointConfidence, getConfidenceMultiplier } from "@/lib/findings-rail-engine";
import { applyEffectSizeMethod, applyMultiplicityMethod, hasWelchPValues as checkWelchPValues } from "@/lib/stat-method-transforms";
import type { FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import type { FindingsFilters, FindingsResponse, UnifiedFinding } from "@/types/analysis";

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

/**
 * When scheduled-only mode is active, swap each finding's group_stats with
 * its scheduled_group_stats and filter out findings that vanish entirely
 * (empty scheduled_group_stats means all subjects were early deaths).
 */
function applyScheduledFilter(findings: UnifiedFinding[]): UnifiedFinding[] {
  const result: UnifiedFinding[] = [];
  for (const f of findings) {
    // Findings with empty scheduled_group_stats vanish under scheduled-only
    if (f.scheduled_group_stats && f.scheduled_group_stats.length === 0) continue;
    // Findings with scheduled alternatives: swap stats in a shallow copy
    if (f.scheduled_group_stats) {
      result.push({
        ...f,
        group_stats: f.scheduled_group_stats,
        pairwise: f.scheduled_pairwise ?? f.pairwise,
        direction: f.scheduled_direction ?? f.direction,
      });
    } else {
      // Longitudinal domains (BW, CL, FW) have no scheduled stats — pass through
      result.push(f);
    }
  }
  return result;
}

export function useFindingsAnalyticsLocal(studyId: string | undefined): FindingsAnalyticsResult {
  const { data, isLoading, error } = useFindings(studyId, 1, 10000, ALL_FILTERS);
  const { useScheduledOnly: isScheduledOnly } = useScheduledOnly();
  const statMethods = useStatMethods(studyId);
  const { data: studyMeta } = useStudyMetadata(studyId ?? "");

  // Active findings: swapped when scheduled-only is active
  const scheduledFindings = useMemo(() => {
    if (!data?.findings?.length) return [];
    return isScheduledOnly ? applyScheduledFilter(data.findings) : data.findings;
  }, [data, isScheduledOnly]);

  // Apply statistical method transforms: effect size → multiplicity
  const activeFindings = useMemo(() => {
    if (!scheduledFindings.length) return [];
    const afterEffect = applyEffectSizeMethod(scheduledFindings, statMethods.effectSize);
    return applyMultiplicityMethod(afterEffect, statMethods.multiplicity);
  }, [scheduledFindings, statMethods.effectSize, statMethods.multiplicity]);

  // Detect Welch p-value availability for dropdown enablement
  const welchAvailable = useMemo(
    () => checkWelchPValues(scheduledFindings),
    [scheduledFindings],
  );

  const endpointSummaries = useMemo(() => {
    if (!activeFindings.length) return [];
    const rows = mapFindingsToRows(activeFindings);
    const summaries = deriveEndpointSummaries(rows);
    if (data?.dose_groups) {
      const noaelMap = computeEndpointNoaelMap(activeFindings, data.dose_groups);
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
    // ECI: attach endpoint confidence integrity assessment
    attachEndpointConfidence(summaries, activeFindings, studyMeta?.has_estrous_data ?? false);
    return summaries;
  }, [activeFindings, data?.dose_groups, studyMeta?.has_estrous_data]);

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
    activeEffectSizeMethod: statMethods.effectSize,
    activeMultiplicityMethod: statMethods.multiplicity,
    hasWelchPValues: welchAvailable,
  }), [endpointSummaries, syndromes, organCoherence, labMatches, signalScores, endpointSexes, statMethods.effectSize, statMethods.multiplicity, welchAvailable]);

  return { analytics, data, isLoading, error: error as Error | null };
}
