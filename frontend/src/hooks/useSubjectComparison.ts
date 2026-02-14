import { useQuery } from "@tanstack/react-query";
import { fetchSubjectComparison } from "@/lib/temporal-api";

export function useSubjectComparison(
  studyId: string | undefined,
  subjectIds: string[],
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["subject-comparison", studyId, ...subjectIds.slice().sort()],
    queryFn: () => fetchSubjectComparison(studyId!, subjectIds),
    enabled: (options?.enabled ?? true) && !!studyId && subjectIds.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
