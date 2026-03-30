import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchTargetOrganSummary } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useTargetOrganSummary(studyId: string | undefined) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["target-organ-summary", studyId, params],
    queryFn: () => fetchTargetOrganSummary(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
