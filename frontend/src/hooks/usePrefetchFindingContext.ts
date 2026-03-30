import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchFindingContext } from "@/lib/analysis-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

/**
 * Returns a callback that prefetches finding context data on hover.
 *
 * Call `prefetch(findingId)` in onMouseEnter to warm the React Query
 * cache before the user clicks. The 5-min staleTime means
 * useFindingContext() will hit the warm cache on click.
 */
export function usePrefetchFindingContext(studyId: string | undefined) {
  const queryClient = useQueryClient();
  const { queryParams: params } = useStudySettings();

  return useCallback(
    (findingId: string) => {
      if (!studyId) return;
      queryClient.prefetchQuery({
        queryKey: ["finding-context", studyId, findingId, params],
        queryFn: () => fetchFindingContext(studyId, findingId, params || undefined),
        staleTime: 30 * 60 * 1000,
      });
    },
    [queryClient, studyId, params],
  );
}
