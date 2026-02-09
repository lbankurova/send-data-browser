import { useQuery } from "@tanstack/react-query";
import { fetchCLTimecourse } from "@/lib/temporal-api";

export function useClinicalObservations(
  studyId: string | undefined,
  finding?: string,
  category?: string,
) {
  return useQuery({
    queryKey: ["cl-timecourse", studyId, finding, category],
    queryFn: () => fetchCLTimecourse(studyId!, finding, category),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
