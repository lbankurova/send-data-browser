import { useQuery } from "@tanstack/react-query";
import { fetchHistopathSubjects } from "@/lib/temporal-api";

export function useHistopathSubjects(
  studyId: string | undefined,
  specimen: string | null,
) {
  return useQuery({
    queryKey: ["histopath-subjects", studyId, specimen],
    queryFn: () => fetchHistopathSubjects(studyId!, specimen!),
    enabled: !!studyId && !!specimen,
    staleTime: 5 * 60 * 1000,
  });
}
