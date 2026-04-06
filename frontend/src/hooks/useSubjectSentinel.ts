import { useQuery } from "@tanstack/react-query";
import type { SubjectSentinelData } from "@/types/analysis-views";
import { fetchSubjectSentinel } from "@/lib/analysis-view-api";

export function useSubjectSentinel(studyId: string | undefined) {
  return useQuery<SubjectSentinelData>({
    queryKey: ["subject-sentinel", studyId],
    queryFn: () => fetchSubjectSentinel(studyId!),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}
