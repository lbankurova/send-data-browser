/**
 * useSyndromeInterpretation — shared hook returning the full
 * SyndromeInterpretation for a given (studyId, syndromeId) pair.
 *
 * Extracted from SyndromeContextPanel.tsx so both the rail context panel
 * and the center-pane ScopeBanner can consume the same interpretation
 * without duplicating the 14-input data-fetch recipe. Fetches share the
 * React Query cache; interpretSyndrome is a pure function so any extra
 * call site is harmless. Returns null when syndromeId is null, when the
 * study context isn't ready, or when the analytics layer hasn't detected
 * the syndrome.
 */

import { useMemo } from "react";
import { useFindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import { useFindings } from "@/hooks/useFindings";
import { useLesionSeveritySummary } from "@/hooks/useLesionSeveritySummary";
import { useStudyContext } from "@/hooks/useStudyContext";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useFoodConsumptionSummary } from "@/hooks/useFoodConsumptionSummary";
import { useCompoundProfile } from "@/hooks/useCompoundProfile";
import { useTumorSummary } from "@/hooks/useTumorSummary";
import { useClinicalObservations } from "@/hooks/useClinicalObservations";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
import { useStatMethods } from "@/hooks/useStatMethods";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { interpretSyndrome, mapDeathRecordsToDispositions } from "@/lib/syndrome-interpretation";
import type {
  SyndromeInterpretation,
  RecoveryRow,
  TumorFinding,
} from "@/lib/syndrome-interpretation-types";
import type { FindingsFilters } from "@/types/analysis";

const ALL_FILTERS: FindingsFilters = {
  domain: null, sex: null, severity: null, search: "",
  organ_system: null, endpoint_label: null, dose_response_pattern: null,
};

export function useSyndromeInterpretation(
  studyId: string | undefined,
  syndromeId: string | null,
): SyndromeInterpretation | null {
  const analytics = useFindingsAnalytics();
  const allEndpoints = analytics.endpoints;

  const { data: rawData } = useFindings(studyId, 1, 10000, ALL_FILTERS);

  const detected = useMemo(
    () => (syndromeId ? analytics.syndromes.find((s) => s.id === syndromeId) ?? null : null),
    [analytics.syndromes, syndromeId],
  );

  const { effectSize } = useStatMethods(studyId);
  const normalization = useOrganWeightNormalization(studyId, true, effectSize);
  const normContexts = normalization.state?.contexts;

  const { data: histopathData } = useLesionSeveritySummary(studyId);
  const { data: studyContext } = useStudyContext(studyId);
  const { data: mortalityRaw } = useStudyMortality(studyId);
  const { data: foodConsumptionSummary } = useFoodConsumptionSummary(studyId);
  const { data: compoundProfile } = useCompoundProfile(studyId);
  const { data: tumorSummary } = useTumorSummary(studyId);
  const { data: clTimecourse } = useClinicalObservations(studyId);
  const { data: recoveryComparison } = useRecoveryComparison(studyId);

  const tumorFindings = useMemo<TumorFinding[]>(() => {
    if (!tumorSummary?.has_tumors) return [];
    const findings: TumorFinding[] = [];
    for (const s of tumorSummary.summaries) {
      for (const byDose of s.by_dose) {
        for (let i = 0; i < byDose.affected; i++) {
          findings.push({
            organ: s.organ,
            morphology: s.morphology,
            behavior: s.behavior === "MALIGNANT" ? "MALIGNANT" : "BENIGN",
            animalId: `${s.organ}-${s.morphology}-${byDose.dose_level}-${i}`,
            doseGroup: byDose.dose_level,
          });
        }
      }
    }
    return findings;
  }, [tumorSummary]);

  const clinicalObservations = useMemo(() => {
    if (!clTimecourse?.timecourse?.length) return [];
    const key = (obs: string, dose: number, sex: string) => `${obs}|${dose}|${sex}`;
    const peaks = new Map<string, { observation: string; doseGroup: number; sex: string; incidence: number; totalN: number }>();
    for (const tp of clTimecourse.timecourse) {
      for (const g of tp.counts) {
        for (const [finding, count] of Object.entries(g.findings)) {
          const k = key(finding, g.dose_level, g.sex);
          const existing = peaks.get(k);
          if (!existing || count > existing.incidence) {
            peaks.set(k, {
              observation: finding,
              doseGroup: g.dose_level,
              sex: g.sex,
              incidence: count,
              totalN: g.total_subjects,
            });
          }
        }
      }
    }
    return [...peaks.values()];
  }, [clTimecourse]);

  const recoveryData = useMemo<RecoveryRow[]>(() => {
    if (!recoveryComparison?.available) return [];
    return recoveryComparison.rows.map((r) => ({
      endpoint_label: r.endpoint_label,
      sex: r.sex,
      recovery_day: r.recovery_day,
      dose_level: r.dose_level,
      mean: r.mean,
      sd: r.sd,
      p_value: r.p_value,
      effect_size: r.effect_size,
      terminal_effect: r.terminal_effect,
    }));
  }, [recoveryComparison]);

  const organWeightRows = useMemo(() => {
    if (!rawData?.findings?.length) return [];
    return rawData.findings
      .filter((f) => f.domain === "OM")
      .flatMap((f) =>
        f.group_stats
          .filter((g) => g.mean != null)
          .map((g) => ({
            specimen: f.specimen ?? f.finding,
            dose_level: g.dose_level,
            sex: f.sex,
            mean: g.mean!,
            p_value: f.pairwise?.find((p) => p.dose_level === g.dose_level)?.p_value ?? null,
          })),
      );
  }, [rawData]);

  return useMemo<SyndromeInterpretation | null>(() => {
    if (!detected || allEndpoints.length === 0 || !studyContext) return null;
    const mortalityDispositions = mortalityRaw
      ? mapDeathRecordsToDispositions(mortalityRaw)
      : [];
    return interpretSyndrome(
      detected,
      allEndpoints,
      histopathData ?? [],
      recoveryData,
      organWeightRows,
      tumorFindings,
      mortalityDispositions,
      foodConsumptionSummary ?? { available: false, water_consumption: null },
      clinicalObservations,
      studyContext,
      mortalityRaw?.mortality_noael_cap,
      analytics.syndromes.map((s) => s.id),
      normContexts,
      compoundProfile?.active_profile,
    );
  }, [detected, allEndpoints, histopathData, studyContext, mortalityRaw, tumorFindings, foodConsumptionSummary, clinicalObservations, recoveryData, organWeightRows, analytics.syndromes, normContexts, compoundProfile]);
}
