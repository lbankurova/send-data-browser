import { useQuery } from "@tanstack/react-query";
import { fetchProvenanceMessages } from "@/lib/analysis-view-api";

export function useProvenanceMessages(studyId: string | undefined) {
  return useQuery({
    queryKey: ["provenance-messages", studyId],
    queryFn: () => fetchProvenanceMessages(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
