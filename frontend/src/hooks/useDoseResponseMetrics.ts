import { useQuery } from "@tanstack/react-query";
import { fetchDoseResponseMetrics } from "@/lib/analysis-view-api";

export function useDoseResponseMetrics(studyId: string | undefined) {
  return useQuery({
    queryKey: ["dose-response-metrics", studyId],
    queryFn: () => fetchDoseResponseMetrics(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
