import { useQuery } from "@tanstack/react-query";
import { fetchTimecourseGroup, fetchTimecourseSubject } from "@/lib/temporal-api";

export function useTimecourseGroup(
  studyId: string | undefined,
  domain: string | undefined,
  testCode: string | undefined,
  sex?: "M" | "F",
  includeRecovery?: boolean,
) {
  return useQuery({
    queryKey: ["timecourse", studyId, domain, testCode, "group", sex, includeRecovery],
    queryFn: () => fetchTimecourseGroup(studyId!, domain!, testCode!, sex, includeRecovery),
    enabled: !!studyId && !!domain && !!testCode,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTimecourseSubject(
  studyId: string | undefined,
  domain: string | undefined,
  testCode: string | undefined,
  sex?: "M" | "F",
  includeRecovery?: boolean,
) {
  return useQuery({
    queryKey: ["timecourse", studyId, domain, testCode, "subject", sex, includeRecovery],
    queryFn: () => fetchTimecourseSubject(studyId!, domain!, testCode!, sex, includeRecovery),
    enabled: !!studyId && !!domain && !!testCode,
    staleTime: 5 * 60 * 1000,
  });
}
