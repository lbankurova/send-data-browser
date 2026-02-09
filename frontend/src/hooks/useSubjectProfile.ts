import { useQuery } from "@tanstack/react-query";
import { fetchSubjectProfile } from "@/lib/temporal-api";

export function useSubjectProfile(
  studyId: string | undefined,
  usubjid: string | null,
) {
  return useQuery({
    queryKey: ["subject-profile", studyId, usubjid],
    queryFn: () => fetchSubjectProfile(studyId!, usubjid!),
    enabled: !!studyId && !!usubjid,
    staleTime: 5 * 60 * 1000,
  });
}
