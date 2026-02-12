import { useQuery } from "@tanstack/react-query";

export interface Insight {
  priority: number; // 0=critical, 1=high, 2=medium, 3=low
  rule: string; // e.g., "discrepancy", "dose_selection", etc.
  title: string;
  detail: string;
  ref_study: string | null; // null for self-referencing insights
}

export function useInsights(studyId: string | undefined) {
  return useQuery<Insight[]>({
    queryKey: ["insights", studyId],
    queryFn: async () => {
      if (!studyId) return [];

      const response = await fetch(
        `http://localhost:8000/api/portfolio/insights/${studyId}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch insights");
      }

      return response.json();
    },
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
