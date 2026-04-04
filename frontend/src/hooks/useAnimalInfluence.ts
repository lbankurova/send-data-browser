import { useQuery } from "@tanstack/react-query";
import type { AnimalInfluenceData } from "@/types/analysis-views";
import { fetchAnimalInfluence } from "@/lib/analysis-view-api";

export function useAnimalInfluence(studyId: string | undefined) {
  return useQuery<AnimalInfluenceData>({
    queryKey: ["animal-influence", studyId],
    queryFn: () => fetchAnimalInfluence(studyId!),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}
