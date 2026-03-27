/**
 * Hook for recovery verdict override CRUD via the annotations system.
 *
 * Override key format: `findingId:sex` — each sex gets its own override,
 * aligning with regulatory requirements for independent per-sex assessment.
 */

import { useCallback } from "react";
import { useAnnotations, useSaveAnnotation, useDeleteAnnotation } from "@/hooks/useAnnotations";
import { RECOVERY_VERDICT_LABEL } from "@/lib/recovery-labels";

// ── Types ────────────────────────────────────────────────────

export interface RecoveryOverrideAnnotation {
  verdict: string;
  original_verdict: string;
  data_type: "continuous" | "incidence";
  note?: string;
  pathologist?: string;
  reviewDate?: string;
}

// ── Constants ────────────────────────────────────────────────

/** Override options for recovery verdict dropdown. Labels sourced from recovery-labels.ts. */
export const RECOVERY_OVERRIDE_OPTIONS = [
  { value: "reversed", label: RECOVERY_VERDICT_LABEL["reversed"] },
  { value: "partially_reversed", label: RECOVERY_VERDICT_LABEL["partially_reversed"] },
  { value: "persistent", label: RECOVERY_VERDICT_LABEL["persistent"] },
  { value: "progressing", label: RECOVERY_VERDICT_LABEL["progressing"] },
  { value: "not_assessed", label: RECOVERY_VERDICT_LABEL["not_assessed"] },
] as const;

/** Build the per-sex annotation entity key. */
export function recoveryOverrideKey(findingId: string, sex: string): string {
  return `${findingId}:${sex}`;
}

// ── Hook ─────────────────────────────────────────────────────

export function useRecoveryOverrideActions(studyId: string | undefined) {
  const { data: annotations, isPending: isLoading } =
    useAnnotations<RecoveryOverrideAnnotation>(studyId, "recovery-overrides");
  const saveMutation = useSaveAnnotation<RecoveryOverrideAnnotation>(studyId, "recovery-overrides");
  const deleteMutation = useDeleteAnnotation(studyId, "recovery-overrides");

  /**
   * Set or update the override verdict for a finding+sex.
   * If newVerdict matches originalVerdict, treats as a reset (deletes override).
   */
  const selectVerdict = useCallback(
    (findingId: string, sex: string, originalVerdict: string, dataType: "continuous" | "incidence", newVerdict: string) => {
      if (!studyId) return;
      const key = recoveryOverrideKey(findingId, sex);

      if (newVerdict === originalVerdict) {
        resetVerdict(findingId, sex);
        return;
      }

      saveMutation.mutate({
        entityKey: key,
        data: {
          verdict: newVerdict,
          original_verdict: originalVerdict,
          data_type: dataType,
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [studyId, saveMutation],
  );

  /** Remove an override, reverting to the auto-computed verdict. */
  const resetVerdict = useCallback(
    (findingId: string, sex: string) => {
      if (!studyId) return;
      deleteMutation.mutate(recoveryOverrideKey(findingId, sex));
    },
    [studyId, deleteMutation],
  );

  /** Save or update a note on an existing override. Creates the override if needed. */
  const saveNote = useCallback(
    (findingId: string, sex: string, originalVerdict: string, dataType: "continuous" | "incidence", text: string) => {
      if (!studyId) return;
      const key = recoveryOverrideKey(findingId, sex);

      const existing = annotations?.[key];
      saveMutation.mutate({
        entityKey: key,
        data: {
          verdict: existing?.verdict ?? originalVerdict,
          original_verdict: existing?.original_verdict ?? originalVerdict,
          data_type: existing?.data_type ?? dataType,
          note: text,
        },
      });
    },
    [studyId, saveMutation, annotations],
  );

  return {
    annotations,
    isPending: isLoading || saveMutation.isPending || deleteMutation.isPending,
    selectVerdict,
    resetVerdict,
    saveNote,
  };
}
