import { useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchFindings } from "@/lib/analysis-api";
import type { FindingsFilters, UnifiedFinding } from "@/types/analysis";

const ALL_FILTERS: FindingsFilters = {
  domain: null,
  sex: null,
  severity: null,
  search: "",
  organ_system: null,
  endpoint_label: null,
  dose_response_pattern: null,
};

export interface LooFragilityCounts {
  fragileCount: number;
  looTested: number;
  totalFindings: number;
}

/**
 * Pure aggregation. Exported for unit testing against PointCross fixture
 * data (CLAUDE.md rule 16). Counts are independent of React.
 */
export function aggregateLooFragility(
  findings: UnifiedFinding[] | undefined,
): LooFragilityCounts {
  if (!findings) return { fragileCount: 0, looTested: 0, totalFindings: 0 };
  let fragileCount = 0;
  let looTested = 0;
  for (const f of findings) {
    if (f.loo_stability != null) looTested += 1;
    if (f.loo_control_fragile === true) fragileCount += 1;
  }
  return { fragileCount, looTested, totalFindings: findings.length };
}

/**
 * Aggregate counts for the Overview "control-fragile on LOO" attention flag.
 *
 * - `looTested` is the denominator: findings where the driving-pairwise LOO
 *   test was actually run (`loo_stability` is non-null on the
 *   `UnifiedFinding`). Findings that didn't get LOO testing (insufficient N,
 *   continuous-only edge cases, etc.) are excluded from both numerator and
 *   denominator so the rendered fraction is honest about coverage.
 * - `fragileCount` is the numerator: findings where `loo_control_fragile ===
 *   true`, i.e., the driving pairwise was control-side-dominant on LOO.
 *
 * Cache-shares with `useFindings(studyId, 1, 10000, ALL_FILTERS)` and the
 * StudySummaryView prefetch — heavy `unified_findings.json` iteration is
 * amortized to a single fetch across the Overview, Findings, and any other
 * surface that asks for the full corpus.
 */
export function useLooFragilitySummary(studyId: string | undefined): LooFragilityCounts & { isLoading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["findings", studyId, 1, 10000, ALL_FILTERS, ""],
    queryFn: () => fetchFindings(studyId!, 1, 10000, ALL_FILTERS),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  return useMemo(
    () => ({ ...aggregateLooFragility(data?.findings), isLoading }),
    [data, isLoading],
  );
}
