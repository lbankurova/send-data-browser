import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchStudySignalSummary } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useStudySignalSummary(studyId: string | undefined) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["study-signal-summary", studyId, params],
    queryFn: () => fetchStudySignalSummary(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
