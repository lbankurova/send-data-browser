/**
 * Hook: useNormalizationOverrides
 *
 * Fetches and persists user overrides for organ weight normalization mode.
 * Overrides are stored via the annotations API (schema: normalization-overrides)
 * keyed by organ name (uppercase). Each override replaces the auto-selected
 * normalization mode for that organ across all dose groups.
 *
 * The audit trail is handled server-side by the annotations router.
 */

import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import type { NormalizationOverride } from "@/types/analysis";

const SCHEMA = "normalization-overrides";

export function useNormalizationOverrides(studyId: string | undefined) {
  const { data: overrides, isLoading } = useAnnotations<NormalizationOverride>(studyId, SCHEMA);
  const saveMutation = useSaveAnnotation<NormalizationOverride>(studyId, SCHEMA);

  const getOverride = (organ: string): NormalizationOverride | null => {
    if (!overrides) return null;
    return overrides[organ.toUpperCase()] ?? null;
  };

  const saveOverride = (organ: string, mode: NormalizationOverride["mode"], reason: string) => {
    const entityKey = organ.toUpperCase();
    return saveMutation.mutateAsync({
      entityKey,
      data: { organ: entityKey, mode, reason },
    });
  };

  const removeOverride = (organ: string) => {
    // Save with the auto mode marker — effectively a no-op override
    // The backend merges, so we save an explicit "cleared" state
    const entityKey = organ.toUpperCase();
    return saveMutation.mutateAsync({
      entityKey,
      data: { organ: entityKey, mode: "absolute", reason: "__cleared__" },
    });
  };

  return {
    overrides: overrides ?? {},
    isLoading,
    isSaving: saveMutation.isPending,
    getOverride,
    saveOverride,
    removeOverride,
  };
}
