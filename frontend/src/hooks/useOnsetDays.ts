import { useQuery } from "@tanstack/react-query";
import { fetchOnsetDays } from "@/lib/analysis-view-api";
import type { OnsetDaysResponse } from "@/types/cohort";

const EMPTY: OnsetDaysResponse = {
  meta: { generated: "", study_id: "" },
  subjects: {},
};

export function useOnsetDays(studyId: string | undefined) {
  return useQuery({
    queryKey: ["subject-onset-days", studyId],
    queryFn: async () => {
      try {
        return await fetchOnsetDays(studyId!);
      } catch {
        return EMPTY;
      }
    },
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}
