import { useQuery } from "@tanstack/react-query";
import { fetchNoaelOverlay } from "@/lib/analysis-view-api";
import type { NoaelOverlayResponse } from "@/types/cohort";

const EMPTY: NoaelOverlayResponse = { subjects: {} };

export function useNoaelOverlay(studyId: string | undefined) {
  return useQuery({
    queryKey: ["subject-noael-overlay", studyId],
    queryFn: async () => {
      try {
        return await fetchNoaelOverlay(studyId!);
      } catch {
        return EMPTY;
      }
    },
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}
