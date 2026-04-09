import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { HcdReference, HcdReferencesData } from "@/types/analysis-views";
import { fetchHcdReferences } from "@/lib/analysis-view-api";

export function useHcdReferences(studyId: string | undefined) {
  return useQuery<HcdReferencesData>({
    queryKey: ["hcd-references", studyId],
    queryFn: () => fetchHcdReferences(studyId!),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}

/** Derive per-sex HCD reference map for a specific test_code from the cached query. */
export function useHcdBySex(studyId: string | undefined, testCode: string | undefined, sexes: string[]) {
  const { data: hcdData } = useHcdReferences(studyId);
  return useMemo((): Partial<Record<string, HcdReference>> | undefined => {
    if (!hcdData?.references) return undefined;
    const tc = testCode?.toUpperCase();
    if (!tc) return undefined;
    const result: Partial<Record<string, HcdReference>> = {};
    for (const sex of sexes) {
      const ref = hcdData.references[`${tc}:${sex}`];
      if (ref) result[sex] = ref;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }, [hcdData, testCode, sexes]);
}
