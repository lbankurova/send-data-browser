import { useQuery } from "@tanstack/react-query";
import { fetchAESummary } from "@/lib/analysis-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { buildSettingsParams } from "@/lib/build-settings-params";

export function useAESummary(studyId: string | undefined) {
  const { settings } = useStudySettings();
  const params = buildSettingsParams(settings);
  return useQuery({
    queryKey: ["ae-summary", studyId, params],
    queryFn: () => fetchAESummary(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
