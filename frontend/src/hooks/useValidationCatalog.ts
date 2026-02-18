import { useQuery } from "@tanstack/react-query";
import type { ValidationResultsData } from "./useValidationResults";

/**
 * Fetches the full validation catalog (triggered + clean + disabled rules)
 * via the `?include_catalog=true` query parameter.
 */
export function useValidationCatalog(studyId: string | undefined) {
  return useQuery<ValidationResultsData>({
    queryKey: ["validation-catalog", studyId],
    queryFn: async () => {
      const res = await fetch(
        `/api/studies/${studyId}/validation/results?include_catalog=true`
      );
      if (res.status === 404) return null;
      if (!res.ok)
        throw new Error(`Validation catalog fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
