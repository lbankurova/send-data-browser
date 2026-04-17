import { useQuery } from "@tanstack/react-query";
import type { SubjectCorrelationsData } from "@/types/analysis-views";
import { fetchSubjectCorrelations } from "@/lib/analysis-view-api";

export function useSubjectCorrelations(studyId: string | undefined) {
  return useQuery<SubjectCorrelationsData>({
    queryKey: ["subject-correlations", studyId],
    queryFn: () => fetchSubjectCorrelations(studyId!),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}
