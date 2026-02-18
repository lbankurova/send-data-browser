import { useQuery } from "@tanstack/react-query";
import { fetchRecoveryComparison } from "@/lib/temporal-api";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";

const EMPTY: RecoveryComparisonResponse = {
  available: false,
  recovery_day: null,
  rows: [],
};

export function useRecoveryComparison(studyId: string | undefined) {
  return useQuery({
    queryKey: ["recovery-comparison", studyId],
    queryFn: async () => {
      try {
        return await fetchRecoveryComparison(studyId!);
      } catch {
        // 404 = study has no recovery arm → graceful empty
        return EMPTY;
      }
    },
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
