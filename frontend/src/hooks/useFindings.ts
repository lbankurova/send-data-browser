import { useQuery } from "@tanstack/react-query";
import { fetchFindings } from "@/lib/analysis-api";
import type { FindingsFilters } from "@/types/analysis";

export function useFindings(
  studyId: string | undefined,
  page: number,
  pageSize: number,
  filters: FindingsFilters
) {
  return useQuery({
    queryKey: ["findings", studyId, page, pageSize, filters],
    queryFn: () => fetchFindings(studyId!, page, pageSize, filters),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
