import { useQuery } from "@tanstack/react-query";
import { fetchLesionSeveritySummary } from "@/lib/analysis-view-api";

export function useLesionSeveritySummary(studyId: string | undefined) {
  return useQuery({
    queryKey: ["lesion-severity-summary", studyId],
    queryFn: () => fetchLesionSeveritySummary(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
