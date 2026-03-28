/**
 * Hook for saved cohort CRUD via the annotations system.
 *
 * Entity key: UUID (stable across renames).
 * Follows the useRecoveryOverrideActions pattern.
 */
import { useCallback } from "react";
import { useAnnotations, useSaveAnnotation, useDeleteAnnotation } from "@/hooks/useAnnotations";
import { serializeFilterState } from "@/lib/comparison-engine";
import type { SavedCohort, CohortPreset, FilterGroup } from "@/types/cohort";

// ── Hook ─────────────────────────────────────────────────────

export function useSavedCohortActions(studyId: string | undefined) {
  const { data: annotations, isPending: isLoading } =
    useAnnotations<SavedCohort>(studyId, "saved-cohorts");
  const saveMutation = useSaveAnnotation<SavedCohort>(studyId, "saved-cohorts");
  const deleteMutation = useDeleteAnnotation(studyId, "saved-cohorts");

  /** All saved cohorts as an array, sorted by creation date. */
  const savedCohorts: SavedCohort[] = annotations
    ? Object.values(annotations).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
    : [];

  const saveCohort = useCallback(
    (
      name: string,
      activePresets: Set<CohortPreset>,
      filterGroup: FilterGroup,
      doseFilter: Set<number> | null,
      sexFilter: Set<string> | null,
      searchQuery: string,
      includeTK: boolean,
    ) => {
      if (!studyId) return;
      const id = crypto.randomUUID();
      const cohort: SavedCohort = {
        id,
        name,
        pinned: false,
        createdAt: new Date().toISOString(),
        filters: serializeFilterState(
          activePresets,
          filterGroup,
          doseFilter,
          sexFilter,
          searchQuery,
          includeTK,
        ),
      };
      saveMutation.mutate({ entityKey: id, data: cohort });
    },
    [studyId, saveMutation],
  );

  const deleteCohort = useCallback(
    (id: string) => {
      if (!studyId) return;
      deleteMutation.mutate(id);
    },
    [studyId, deleteMutation],
  );

  const renameCohort = useCallback(
    (id: string, newName: string) => {
      if (!studyId || !annotations) return;
      const existing = annotations[id];
      if (!existing) return;
      saveMutation.mutate({
        entityKey: id,
        data: { ...existing, name: newName },
      });
    },
    [studyId, saveMutation, annotations],
  );

  const togglePin = useCallback(
    (id: string) => {
      if (!studyId || !annotations) return;
      const existing = annotations[id];
      if (!existing) return;
      saveMutation.mutate({
        entityKey: id,
        data: { ...existing, pinned: !existing.pinned },
      });
    },
    [studyId, saveMutation, annotations],
  );

  return {
    savedCohorts,
    isPending: isLoading || saveMutation.isPending || deleteMutation.isPending,
    saveCohort,
    deleteCohort,
    renameCohort,
    togglePin,
  };
}
