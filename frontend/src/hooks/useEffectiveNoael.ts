import { useMemo } from "react";
import { useNoaelSummary } from "./useNoaelSummary";
import { useAnnotations } from "./useAnnotations";
import type { NoaelOverride } from "@/types/annotations";
import type { NoaelSummaryRow } from "@/types/analysis-views";

export interface EffectiveNoaelRow extends NoaelSummaryRow {
  _overridden?: boolean;
  _override_rationale?: string;
  _system_dose_value?: number;
  _system_dose_level?: number;
}

/**
 * Merges computed NOAEL data with any expert override annotations.
 * Returns the same shape as useNoaelSummary but with override fields.
 */
export function useEffectiveNoael(studyId: string | undefined) {
  const computed = useNoaelSummary(studyId);
  const { data: overrides } = useAnnotations<NoaelOverride>(studyId, "noael-override");

  const data = useMemo((): EffectiveNoaelRow[] | undefined => {
    if (!computed.data) return undefined;
    if (!overrides) return computed.data;

    return computed.data.map((entry) => {
      const override = overrides[`noael:${entry.sex}`];
      if (override) {
        return {
          ...entry,
          noael_dose_value: override.override_dose_level != null
            ? parseFloat(override.override_dose_value) || entry.noael_dose_value
            : entry.noael_dose_value,
          noael_dose_level: override.override_dose_level ?? entry.noael_dose_level,
          _overridden: true,
          _override_rationale: override.rationale,
          _system_dose_value: entry.noael_dose_value,
          _system_dose_level: entry.noael_dose_level,
        };
      }
      return entry;
    });
  }, [computed.data, overrides]);

  return {
    ...computed,
    data,
  };
}
