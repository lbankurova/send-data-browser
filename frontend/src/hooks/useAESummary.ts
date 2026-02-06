import { useQuery } from "@tanstack/react-query";
import { fetchAESummary } from "@/lib/analysis-api";

export function useAESummary(studyId: string | undefined) {
  return useQuery({
    queryKey: ["ae-summary", studyId],
    queryFn: () => fetchAESummary(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
