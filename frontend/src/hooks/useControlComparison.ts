import { useQuery } from "@tanstack/react-query";
import { fetchControlComparison } from "@/lib/analysis-view-api";
import type { ControlComparison } from "@/lib/analysis-view-api";

export function useControlComparison(studyId: string | undefined) {
  return useQuery<ControlComparison | null>({
    queryKey: ["control-comparison", studyId],
    queryFn: async () => {
      try {
        return await fetchControlComparison(studyId!);
      } catch {
        return null; // 404 = not a dual-control study
      }
    },
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}
