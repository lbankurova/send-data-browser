/**
 * Reads statistical method preferences from session state.
 *
 * Keys match those already stored by StudyDetailsContextPanel dropdowns.
 * Returns a memoized object to avoid unnecessary re-renders.
 */

import { useMemo } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import type { EffectSizeMethod, MultiplicityMethod } from "@/lib/stat-method-transforms";

export interface StatMethods {
  effectSize: EffectSizeMethod;
  multiplicity: MultiplicityMethod;
}

export function useStatMethods(studyId: string | undefined): StatMethods {
  const [effectSize] = useSessionState<EffectSizeMethod>(
    `pcc.${studyId ?? "__none__"}.effectSize`,
    "hedges-g",
  );
  const [multiplicity] = useSessionState<MultiplicityMethod>(
    `pcc.${studyId ?? "__none__"}.multiplicity`,
    "dunnett-fwer",
  );

  return useMemo(
    () => ({ effectSize, multiplicity }),
    [effectSize, multiplicity],
  );
}
