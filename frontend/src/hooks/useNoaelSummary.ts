import { useQuery } from "@tanstack/react-query";
import { fetchNoaelSummary } from "@/lib/analysis-view-api";

export function useNoaelSummary(studyId: string | undefined) {
  return useQuery({
    queryKey: ["noael-summary", studyId],
    queryFn: () => fetchNoaelSummary(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
