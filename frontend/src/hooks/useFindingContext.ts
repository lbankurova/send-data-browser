import { useQuery } from "@tanstack/react-query";
import { fetchFindingContext } from "@/lib/analysis-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { buildSettingsParams } from "@/lib/build-settings-params";

export function useFindingContext(
  studyId: string | undefined,
  findingId: string | null
) {
  const { settings } = useStudySettings();
  const params = buildSettingsParams(settings);
  return useQuery({
    queryKey: ["finding-context", studyId, findingId, params],
    queryFn: () => fetchFindingContext(studyId!, findingId!, params || undefined),
    enabled: !!studyId && !!findingId,
    staleTime: 5 * 60 * 1000,
  });
}
