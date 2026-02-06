import { useQuery } from "@tanstack/react-query";
import { fetchDomainData } from "@/lib/api";

export function useDomainData(
  studyId: string,
  domainName: string,
  page: number,
  pageSize: number
) {
  return useQuery({
    queryKey: ["domainData", studyId, domainName, page, pageSize],
    queryFn: () => fetchDomainData(studyId, domainName, page, pageSize),
    enabled: !!studyId && !!domainName,
  });
}
