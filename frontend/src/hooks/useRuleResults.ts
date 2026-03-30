import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchRuleResults } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useRuleResults(studyId: string | undefined) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["rule-results", studyId, params],
    queryFn: () => fetchRuleResults(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
