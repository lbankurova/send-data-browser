import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchDoseResponseMetrics } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useDoseResponseMetrics(studyId: string | undefined) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["dose-response-metrics", studyId, params],
    queryFn: () => fetchDoseResponseMetrics(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
