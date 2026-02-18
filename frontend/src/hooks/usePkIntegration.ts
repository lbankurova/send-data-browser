import { useQuery } from "@tanstack/react-query";
import { fetchPkIntegration } from "@/lib/analysis-view-api";
import type { PkIntegration } from "@/types/analysis-views";

export function usePkIntegration(studyId: string | undefined) {
  return useQuery<PkIntegration>({
    queryKey: ["pk-integration", studyId],
    queryFn: () => fetchPkIntegration(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
