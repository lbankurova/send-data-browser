import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchSyndromeRollup } from "@/lib/analysis-view-api";

/**
 * Per-study syndrome rollup -- backs GAP-288 NOAEL/LOAEL synthesis page.
 * The endpoint is non-parameterized (no settings cascade), so this hook
 * mirrors the simple shape of useSubjectSyndromes / useRecoveryVerdicts.
 */
export function useSyndromeRollup(studyId: string | undefined) {
  return useQuery({
    queryKey: ["syndrome-rollup", studyId],
    queryFn: () => fetchSyndromeRollup(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
