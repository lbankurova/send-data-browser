import { useQuery } from "@tanstack/react-query";
import { fetchOrganEvidenceDetail } from "@/lib/analysis-view-api";

export function useOrganEvidenceDetail(studyId: string | undefined) {
  return useQuery({
    queryKey: ["organ-evidence-detail", studyId],
    queryFn: () => fetchOrganEvidenceDetail(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
