import { useQuery } from "@tanstack/react-query";
import { fetchOrganCorrelations } from "@/lib/analysis-api";
import { useStudySettings } from "@/contexts/StudySettingsContext";

export function useOrganCorrelations(
  studyId: string | undefined,
  organKey: string | null,
) {
  const { queryParams: params } = useStudySettings();
  return useQuery({
    queryKey: ["organ-correlations", studyId, organKey, params],
    queryFn: () => fetchOrganCorrelations(studyId!, organKey!, params || undefined),
    enabled: !!studyId && !!organKey,
    staleTime: 5 * 60 * 1000,
  });
}
