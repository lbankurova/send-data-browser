import { useQuery } from "@tanstack/react-query";
import { fetchAdverseEffectSummary } from "@/lib/analysis-view-api";

export function useAdverseEffectSummary(studyId: string | undefined) {
  return useQuery({
    queryKey: ["adverse-effect-summary", studyId],
    queryFn: () => fetchAdverseEffectSummary(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
