/**
 * Reads statistical method preferences from StudySettingsContext.
 *
 * Returns a memoized object to avoid unnecessary re-renders.
 * The `studyId` parameter is kept for API compatibility but is no longer
 * used — settings are read from the centralized StudySettingsContext.
 */

import { useMemo } from "react";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import type { EffectSizeMethod, MultiplicityMethod } from "@/lib/stat-method-transforms";

export interface StatMethods {
  effectSize: EffectSizeMethod;
  multiplicity: MultiplicityMethod;
}

export function useStatMethods(_studyId: string | undefined): StatMethods {
  const { settings } = useStudySettings();
  return useMemo(
    () => ({ effectSize: settings.effectSize, multiplicity: settings.multiplicity }),
    [settings.effectSize, settings.multiplicity],
  );
}
