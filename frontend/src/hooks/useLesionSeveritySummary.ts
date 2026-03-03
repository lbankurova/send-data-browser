import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchLesionSeveritySummary } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { buildSettingsParams } from "@/lib/build-settings-params";

export function useLesionSeveritySummary(studyId: string | undefined) {
  const { settings } = useStudySettings();
  const params = buildSettingsParams(settings);
  return useQuery({
    queryKey: ["lesion-severity-summary", studyId, params],
    queryFn: () => fetchLesionSeveritySummary(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
