import { useQuery } from "@tanstack/react-query";
import { fetchFoodConsumptionSummary } from "@/lib/analysis-view-api";
import type { FoodConsumptionSummaryResponse } from "@/lib/syndrome-interpretation-types";

const EMPTY: FoodConsumptionSummaryResponse = {
  available: false,
  water_consumption: null,
};

export function useFoodConsumptionSummary(studyId: string | undefined) {
  return useQuery({
    queryKey: ["food-consumption-summary", studyId],
    queryFn: async () => {
      try {
        return await fetchFoodConsumptionSummary(studyId!);
      } catch {
        // 404 = study has no FW data → graceful empty
        return EMPTY;
      }
    },
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
