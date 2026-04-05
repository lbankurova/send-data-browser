import { useQuery } from "@tanstack/react-query";
import type { SubjectSimilarityData } from "@/types/analysis-views";
import { fetchSubjectSimilarity } from "@/lib/analysis-view-api";

export function useSubjectSimilarity(studyId: string | undefined) {
  return useQuery<SubjectSimilarityData>({
    queryKey: ["subject-similarity", studyId],
    queryFn: () => fetchSubjectSimilarity(studyId!),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}
