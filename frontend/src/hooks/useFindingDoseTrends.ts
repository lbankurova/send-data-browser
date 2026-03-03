import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchFindingDoseTrends } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useFindingDoseTrends(studyId: string | undefined) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["finding-dose-trends", studyId, params],
    queryFn: () => fetchFindingDoseTrends(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
