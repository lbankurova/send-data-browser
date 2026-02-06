import { useQuery } from "@tanstack/react-query";
import { fetchFindingContext } from "@/lib/analysis-api";

export function useFindingContext(
  studyId: string | undefined,
  findingId: string | null
) {
  return useQuery({
    queryKey: ["finding-context", studyId, findingId],
    queryFn: () => fetchFindingContext(studyId!, findingId!),
    enabled: !!studyId && !!findingId,
    staleTime: 5 * 60 * 1000,
  });
}
