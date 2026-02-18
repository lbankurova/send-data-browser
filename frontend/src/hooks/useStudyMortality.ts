import { useQuery } from "@tanstack/react-query";
import { fetchStudyMortality } from "@/lib/analysis-view-api";
import type { StudyMortality } from "@/types/mortality";

const EMPTY_MORTALITY: StudyMortality = {
  has_mortality: false,
  total_deaths: 0,
  total_accidental: 0,
  mortality_loael: null,
  mortality_loael_label: null,
  mortality_noael_cap: null,
  severity_tier: "none",
  deaths: [],
  accidentals: [],
  by_dose: [],
  early_death_subjects: {},
};

export function useStudyMortality(studyId: string | undefined) {
  return useQuery({
    queryKey: ["study-mortality", studyId],
    queryFn: async () => {
      try {
        return await fetchStudyMortality(studyId!);
      } catch {
        // 404 = study has no DD/DS data → graceful empty
        return EMPTY_MORTALITY;
      }
    },
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
  });
}
