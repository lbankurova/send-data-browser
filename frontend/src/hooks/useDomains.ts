import { useQuery } from "@tanstack/react-query";
import { fetchDomains } from "@/lib/api";

export function useDomains(studyId: string) {
  return useQuery({
    queryKey: ["domains", studyId],
    queryFn: () => fetchDomains(studyId),
    enabled: !!studyId,
  });
}
