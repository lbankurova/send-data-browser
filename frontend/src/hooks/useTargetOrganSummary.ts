import { useQuery } from "@tanstack/react-query";
import { fetchTargetOrganSummary } from "@/lib/analysis-view-api";

export function useTargetOrganSummary(studyId: string | undefined) {
  return useQuery({
    queryKey: ["target-organ-summary", studyId],
    queryFn: () => fetchTargetOrganSummary(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
