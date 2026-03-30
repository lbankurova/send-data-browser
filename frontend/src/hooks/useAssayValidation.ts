import { useQuery } from "@tanstack/react-query";
import { fetchAssayValidation } from "@/lib/analysis-view-api";
import type { AssayValidation } from "@/lib/analysis-view-api";

export function useAssayValidation(studyId: string | undefined) {
  return useQuery<AssayValidation | null>({
    queryKey: ["assay-validation", studyId],
    queryFn: async () => {
      try {
        return await fetchAssayValidation(studyId!);
      } catch {
        return null; // 404 = no positive control arms
      }
    },
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}
