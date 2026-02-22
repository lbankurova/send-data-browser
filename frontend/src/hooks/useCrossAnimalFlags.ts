import { useQuery } from "@tanstack/react-query";
import { fetchCrossAnimalFlags } from "@/lib/analysis-view-api";
import type { CrossAnimalFlags } from "@/lib/analysis-view-api";

const EMPTY: CrossAnimalFlags = {
  tissue_battery: {
    reference_batteries: {},
    has_reduced_recovery_battery: false,
    flagged_animals: [],
    study_level_note: null,
  },
  tumor_linkage: {
    tumor_dose_response: [],
    banner_text: null,
  },
  recovery_narratives: [],
};

export function useCrossAnimalFlags(studyId: string | undefined) {
  return useQuery({
    queryKey: ["cross-animal-flags", studyId],
    queryFn: async () => {
      try {
        return await fetchCrossAnimalFlags(studyId!);
      } catch {
        return EMPTY;
      }
    },
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
