import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchDoseResponseMetrics } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { buildSettingsParams } from "@/lib/build-settings-params";

export function useDoseResponseMetrics(studyId: string | undefined) {
  const { settings } = useStudySettings();
  const params = buildSettingsParams(settings);
  return useQuery({
    queryKey: ["dose-response-metrics", studyId, params],
    queryFn: () => fetchDoseResponseMetrics(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
