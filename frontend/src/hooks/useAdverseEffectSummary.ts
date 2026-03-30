import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchAdverseEffectSummary } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useAdverseEffectSummary(studyId: string | undefined) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["adverse-effect-summary", studyId, params],
    queryFn: () => fetchAdverseEffectSummary(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
