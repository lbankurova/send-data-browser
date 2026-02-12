import { useQuery } from "@tanstack/react-query";
import { fetchFindingDoseTrends } from "@/lib/analysis-view-api";

export function useFindingDoseTrends(studyId: string | undefined) {
  return useQuery({
    queryKey: ["finding-dose-trends", studyId],
    queryFn: () => fetchFindingDoseTrends(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
