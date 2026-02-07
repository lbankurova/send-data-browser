import { useQuery } from "@tanstack/react-query";
import { fetchStudySignalSummary } from "@/lib/analysis-view-api";

export function useStudySignalSummary(studyId: string | undefined) {
  return useQuery({
    queryKey: ["study-signal-summary", studyId],
    queryFn: () => fetchStudySignalSummary(studyId!),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
