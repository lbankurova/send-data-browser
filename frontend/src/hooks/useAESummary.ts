import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchAESummary } from "@/lib/analysis-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useAESummary(studyId: string | undefined) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["ae-summary", studyId, params],
    queryFn: () => fetchAESummary(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
