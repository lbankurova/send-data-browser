import { useMemo } from "react";
import { useDomains } from "./useDomains";
import { categorizeDomains } from "@/lib/send-categories";
import type { CategorizedDomains } from "@/lib/send-categories";

export function useCategorizedDomains(studyId: string | undefined) {
  const { data: domains, isLoading, error } = useDomains(studyId ?? "");

  const categories: CategorizedDomains[] = useMemo(() => {
    if (!domains) return [];
    return categorizeDomains(domains);
  }, [domains]);

  return { categories, isLoading, error };
}
