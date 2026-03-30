import { useQuery } from "@tanstack/react-query";
import { fetchRecoveryVerdicts } from "@/lib/analysis-view-api";
import type { RecoveryVerdictsResponse } from "@/types/cohort";

const EMPTY: RecoveryVerdictsResponse = {
  meta: { generated: "", study_id: "" },
  per_subject: {},
  per_finding: {},
};

export function useRecoveryVerdicts(studyId: string | undefined) {
  return useQuery({
    queryKey: ["recovery-verdicts", studyId],
    queryFn: async () => {
      try {
        return await fetchRecoveryVerdicts(studyId!);
      } catch {
        return EMPTY;
      }
    },
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}
