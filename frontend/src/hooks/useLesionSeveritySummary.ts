import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchLesionSeveritySummary } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useLesionSeveritySummary(studyId: string | undefined) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["lesion-severity-summary", studyId, params],
    queryFn: () => fetchLesionSeveritySummary(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
