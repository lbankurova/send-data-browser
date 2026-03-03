import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchNoaelSummary } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useNoaelSummary(studyId: string | undefined) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["noael-summary", studyId, params],
    queryFn: () => fetchNoaelSummary(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
