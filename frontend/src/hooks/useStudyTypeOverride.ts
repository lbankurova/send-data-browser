import { useAnnotations, useSaveAnnotation, useDeleteAnnotation } from "@/hooks/useAnnotations";
import type { StudyTypeOverride } from "@/types/annotations";

const SCHEMA = "study-type-override";
const ENTITY_KEY = "study_type";

export function useStudyTypeOverride(studyId: string | undefined) {
  const { data: annotations } = useAnnotations<StudyTypeOverride>(studyId, SCHEMA);
  const saveMutation = useSaveAnnotation<StudyTypeOverride>(studyId, SCHEMA);
  const deleteMutation = useDeleteAnnotation(studyId, SCHEMA);

  const override = annotations?.[ENTITY_KEY] ?? null;

  function save(studyType: string, rationale: string) {
    return saveMutation.mutateAsync({
      entityKey: ENTITY_KEY,
      data: {
        study_type: studyType,
        rationale,
        timestamp: new Date().toISOString(),
      },
    });
  }

  function clear() {
    return deleteMutation.mutateAsync(ENTITY_KEY);
  }

  return { override, save, clear, isSaving: saveMutation.isPending };
}
