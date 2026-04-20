import { useQuery } from "@tanstack/react-query";
import { type TermCollisionsResponse, fetchTermCollisions } from "@/lib/admin-terms-api";

export function useTermCollisions(
  studyIds: string[],
  opts: { organs?: string[]; minConfidence?: number; includeQualifierDivergence?: boolean } = {},
  enabled = true,
) {
  return useQuery<TermCollisionsResponse>({
    queryKey: ["xstudy", "term-collisions", studyIds.slice().sort(), opts],
    queryFn: () => fetchTermCollisions(studyIds, opts),
    enabled: enabled && studyIds.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}
