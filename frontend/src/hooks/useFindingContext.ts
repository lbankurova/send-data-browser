import { useQuery } from "@tanstack/react-query";
import { fetchFindingContext } from "@/lib/analysis-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useFindingContext(
  studyId: string | undefined,
  findingId: string | null
) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["finding-context", studyId, findingId, params],
    queryFn: () => fetchFindingContext(studyId!, findingId!, params || undefined),
    enabled: !!studyId && !!findingId,
    staleTime: 5 * 60 * 1000,
    // NOTE: keepPreviousData removed — it caused stale data from the previous
    // finding to render in the context panel (wrong statistics, duplicated group
    // labels) while the new finding's context loaded.
  });
}
