import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchOrganEvidenceDetail } from "@/lib/analysis-view-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { buildSettingsParams } from "@/lib/build-settings-params";

export function useOrganEvidenceDetail(studyId: string | undefined) {
  const { settings } = useStudySettings();
  const params = buildSettingsParams(settings);
  return useQuery({
    queryKey: ["organ-evidence-detail", studyId, params],
    queryFn: () => fetchOrganEvidenceDetail(studyId!, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
