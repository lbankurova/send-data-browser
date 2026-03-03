import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchStudySignalSummary } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { buildSettingsParams } from "@/lib/build-settings-params";

export function useStudySignalSummary(studyId: string | undefined) {
  const { settings } = useStudySettings();
  const params = buildSettingsParams(settings);
  return useQuery({
    queryKey: ["study-signal-summary", studyId, params],
    queryFn: () => fetchStudySignalSummary(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
