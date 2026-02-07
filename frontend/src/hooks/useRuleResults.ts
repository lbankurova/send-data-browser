import { useQuery } from "@tanstack/react-query";
import { fetchRuleResults } from "@/lib/analysis-view-api";

export function useRuleResults(studyId: string | undefined) {
  return useQuery({
    queryKey: ["rule-results", studyId],
    queryFn: () => fetchRuleResults(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
