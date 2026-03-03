import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchFindings } from "@/lib/analysis-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import type { FindingsFilters } from "@/types/analysis";

export function useFindings(
  studyId: string | undefined,
  page: number,
  pageSize: number,
  filters: FindingsFilters,
) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["findings", studyId, page, pageSize, filters, params],
    queryFn: () => fetchFindings(studyId!, page, pageSize, filters, params || undefined),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
