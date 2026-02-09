import { useQuery } from "@tanstack/react-query";
import { fetchTimecourseGroup, fetchTimecourseSubject } from "@/lib/temporal-api";

export function useTimecourseGroup(
  studyId: string | undefined,
  domain: string | undefined,
  testCode: string | undefined,
  sex?: "M" | "F",
) {
  return useQuery({
    queryKey: ["timecourse", studyId, domain, testCode, "group", sex],
    queryFn: () => fetchTimecourseGroup(studyId!, domain!, testCode!, sex),
    enabled: !!studyId && !!domain && !!testCode,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTimecourseSubject(
  studyId: string | undefined,
  domain: string | undefined,
  testCode: string | undefined,
  sex?: "M" | "F",
) {
  return useQuery({
    queryKey: ["timecourse", studyId, domain, testCode, "subject", sex],
    queryFn: () => fetchTimecourseSubject(studyId!, domain!, testCode!, sex),
    enabled: !!studyId && !!domain && !!testCode,
    staleTime: 5 * 60 * 1000,
  });
}
