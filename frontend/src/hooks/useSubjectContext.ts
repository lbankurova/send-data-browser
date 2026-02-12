/**
 * Fetches subject_context.json — maps USUBJID to dose group, arm, species, etc.
 * Used by TRUST-07p1 source records expander.
 */
import { useQuery } from "@tanstack/react-query";

export interface SubjectContextRow {
  USUBJID: string;
  STUDYID: string;
  ARM: string;
  ARMCD: string;
  SETCD: string;
  SPECIES: string;
  STRAIN: string;
  DOSE: number;
  DOSE_UNIT: string;
  DOSE_LEVEL: string;
  DOSE_GROUP_ORDER: number;
  IS_CONTROL: boolean;
  ROUTE: string;
  FREQUENCY: string | null;
  STUDY_PHASE: string;
  HAS_RECOVERY: boolean;
  IS_TK: boolean;
  TREATMENT_START_DY: number | null;
  TREATMENT_END_DY: number | null;
  RECOVERY_START_DY: number | null;
  SACRIFICE_DY: number | null;
  DOSE_VARIES: boolean;
}

export function useSubjectContext(studyId: string | undefined) {
  return useQuery<SubjectContextRow[]>({
    queryKey: ["subject-context", studyId],
    queryFn: async () => {
      const res = await fetch(
        `/api/studies/${encodeURIComponent(studyId!)}/analysis/subject-context`,
      );
      if (!res.ok) throw new Error(`Subject context fetch failed: ${res.status}`);
      return res.json();
    },
    enabled: !!studyId,
    staleTime: 10 * 60 * 1000,
  });
}
