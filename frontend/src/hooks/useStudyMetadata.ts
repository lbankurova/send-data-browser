import { useQuery } from "@tanstack/react-query";
import { fetchStudyMetadata } from "@/lib/api";

export function useStudyMetadata(studyId: string) {
  return useQuery({
    queryKey: ["studyMetadata", studyId],
    queryFn: () => fetchStudyMetadata(studyId),
    enabled: !!studyId,
  });
}
