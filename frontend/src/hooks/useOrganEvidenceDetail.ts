import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchOrganEvidenceDetail } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useOrganEvidenceDetail(studyId: string | undefined) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["organ-evidence-detail", studyId, params],
    queryFn: () => fetchOrganEvidenceDetail(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
