/**
 * Fetches histopath subject data for multiple specimens (per organ system)
 * and derives aggregated recovery assessments.
 */
import { useMemo, useRef } from "react";
import { useQueries } from "@tanstack/react-query";
import { fetchHistopathSubjects } from "@/lib/temporal-api";
import {
  deriveRecoveryAssessments,
  worstVerdict,
} from "@/lib/recovery-assessment";
import type { RecoveryVerdict, RecoveryAssessment } from "@/lib/recovery-assessment";

export interface OrganRecoveryResult {
  /** Per-specimen recovery assessments keyed by specimen name */
  bySpecimen: Map<string, RecoveryAssessment[]>;
  /** Lookup: "SPECIMEN — FINDING" → RecoveryVerdict */
  byEndpointLabel: Map<string, RecoveryVerdict>;
  /** Lookup: "SPECIMEN — FINDING" → full RecoveryAssessment (for tooltips) */
  assessmentByLabel: Map<string, RecoveryAssessment>;
  /** Recovery period in days per specimen (for tooltip) */
  recoveryDaysBySpecimen: Map<string, number>;
  /** Overall verdict across all specimens/findings for this organ */
  overall: RecoveryVerdict | null;
  /** Whether any specimen has recovery data */
  hasRecovery: boolean;
  isLoading: boolean;
}

const EMPTY_RESULT: OrganRecoveryResult = {
  bySpecimen: new Map(),
  byEndpointLabel: new Map(),
  assessmentByLabel: new Map(),
  recoveryDaysBySpecimen: new Map(),
  overall: null,
  hasRecovery: false,
  isLoading: false,
};

export function useOrganRecovery(
  studyId: string | undefined,
  specimens: string[],
): OrganRecoveryResult {
  const queries = useQueries({
    queries: specimens.map((specimen) => ({
      queryKey: ["histopath-subjects", studyId, specimen],
      queryFn: () => fetchHistopathSubjects(studyId!, specimen),
      enabled: !!studyId && specimens.length > 0,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const allSettled = queries.length > 0 && queries.every((q) => !q.isLoading);

  // Use a ref to cache the last computed result and avoid recomputing on every render
  const lastRef = useRef<{ key: string; result: OrganRecoveryResult }>({
    key: "",
    result: EMPTY_RESULT,
  });

  return useMemo(() => {
    if (specimens.length === 0) return EMPTY_RESULT;
    if (!allSettled) return { ...EMPTY_RESULT, isLoading: true };

    // Build a cache key from the query data identities
    const cacheKey = specimens.join("|") + ":" + queries.map((q) => q.dataUpdatedAt).join(",");
    if (cacheKey === lastRef.current.key) return lastRef.current.result;

    const bySpecimen = new Map<string, RecoveryAssessment[]>();
    const byEndpointLabel = new Map<string, RecoveryVerdict>();
    const assessmentByLabel = new Map<string, RecoveryAssessment>();
    const recoveryDaysBySpecimen = new Map<string, number>();
    let hasRecovery = false;
    const allVerdicts: RecoveryVerdict[] = [];

    for (let i = 0; i < specimens.length; i++) {
      const data = queries[i]?.data;
      if (!data?.subjects) continue;

      const specimenHasRec = data.subjects.some((s) => s.is_recovery);
      if (!specimenHasRec) continue;
      hasRecovery = true;

      if (data.recovery_days != null) {
        recoveryDaysBySpecimen.set(specimens[i], data.recovery_days);
      }

      const assessments = deriveRecoveryAssessments(data.findings, data.subjects);
      bySpecimen.set(specimens[i], assessments);

      for (const a of assessments) {
        const label = `${specimens[i]} \u2014 ${a.finding}`;
        byEndpointLabel.set(label, a.overall);
        assessmentByLabel.set(label, a);
        if (a.overall !== "not_observed" && a.overall !== "no_data") {
          allVerdicts.push(a.overall);
        }
      }
    }

    const overall = allVerdicts.length > 0 ? worstVerdict(allVerdicts) : null;
    const result: OrganRecoveryResult = {
      bySpecimen, byEndpointLabel, assessmentByLabel, recoveryDaysBySpecimen,
      overall, hasRecovery, isLoading: false,
    };
    lastRef.current = { key: cacheKey, result };
    return result;
  }, [specimens, allSettled, queries, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps
}
