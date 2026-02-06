import { useQuery } from "@tanstack/react-query";
import { fetchAdverseEffects } from "@/lib/analysis-api";
import type { AdverseEffectsFilters } from "@/types/analysis";

export function useAdverseEffects(
  studyId: string | undefined,
  page: number,
  pageSize: number,
  filters: AdverseEffectsFilters
) {
  return useQuery({
    queryKey: ["adverse-effects", studyId, page, pageSize, filters],
    queryFn: () => fetchAdverseEffects(studyId!, page, pageSize, filters),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
