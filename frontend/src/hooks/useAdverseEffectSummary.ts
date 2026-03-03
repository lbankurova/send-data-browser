import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchAdverseEffectSummary } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { buildSettingsParams } from "@/lib/build-settings-params";

export function useAdverseEffectSummary(studyId: string | undefined) {
  const { settings } = useStudySettings();
  const params = buildSettingsParams(settings);
  return useQuery({
    queryKey: ["adverse-effect-summary", studyId, params],
    queryFn: () => fetchAdverseEffectSummary(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
