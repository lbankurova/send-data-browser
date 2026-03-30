import { useNoaelSummary } from "./useNoaelSummary";
import type { NoaelSummaryRow } from "@/types/analysis-views";

export type EffectiveNoaelRow = NoaelSummaryRow;

/**
 * Returns NOAEL data with expert overrides already applied by the backend.
 *
 * Previously this hook fetched noael-overrides annotations and merged them
 * client-side. The backend now applies NOAEL overrides (Level 4) and
 * finding-level recomputation at serve time in _apply_overrides(), so this
 * hook is a thin wrapper around useNoaelSummary.
 *
 * Override provenance fields on each row (when applicable):
 *   _overridden, _system_dose_level, _system_dose_value, _override_rationale
 *   _recomputed, _original_noael_dose_level, _original_noael_dose_value
 */
export function useEffectiveNoael(studyId: string | undefined) {
  return useNoaelSummary(studyId);
}
