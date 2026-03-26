import { useQuery } from "@tanstack/react-query";
import { fetchSubjectSyndromes } from "@/lib/analysis-view-api";
import type { SubjectSyndromesResponse } from "@/types/cohort";

const EMPTY: SubjectSyndromesResponse = {
  meta: { generated: "", study_id: "", syndrome_definitions_version: "" },
  subjects: {},
};

export function useSubjectSyndromes(studyId: string | undefined) {
  return useQuery({
    queryKey: ["subject-syndromes", studyId],
    queryFn: async () => {
      try {
        return await fetchSubjectSyndromes(studyId!);
      } catch {
        return EMPTY;
      }
    },
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
