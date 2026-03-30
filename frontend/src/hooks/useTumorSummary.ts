import { useQuery } from "@tanstack/react-query";
import { fetchTumorSummary } from "@/lib/analysis-view-api";
import type { TumorSummary } from "@/lib/analysis-view-api";

const EMPTY_TUMOR_SUMMARY: TumorSummary = {
  has_tumors: false,
  total_tumor_animals: 0,
  total_tumor_types: 0,
  summaries: [],
  combined_analyses: [],
  progression_sequences: [],
  palpable_masses: [],
};

export function useTumorSummary(studyId: string | undefined) {
  return useQuery({
    queryKey: ["tumor-summary", studyId],
    queryFn: async () => {
      try {
        return await fetchTumorSummary(studyId!);
      } catch {
        // 404 = study has no TF data → graceful empty
        return EMPTY_TUMOR_SUMMARY;
      }
    },
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}
