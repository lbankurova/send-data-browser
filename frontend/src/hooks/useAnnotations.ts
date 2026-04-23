import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAnnotations, saveAnnotation, deleteAnnotation } from "@/lib/annotations-api";

export function useAnnotations<T>(studyId: string | undefined, schemaType: string) {
  return useQuery<Record<string, T>>({
    queryKey: ["annotations", studyId, schemaType],
    queryFn: () => fetchAnnotations<T>(studyId!, schemaType),
    enabled: !!studyId,
    // User-mutable + persisted to IndexedDB: must always background-refetch on
    // mount so cross-session edits override the hydrated snapshot.
    staleTime: 0,
  });
}

export function useSaveAnnotation<T>(studyId: string | undefined, schemaType: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ entityKey, data }: { entityKey: string; data: Partial<T> }) =>
      saveAnnotation<T>(studyId!, schemaType, entityKey, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", studyId, schemaType] });
    },
  });
}

export function useDeleteAnnotation(studyId: string | undefined, schemaType: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entityKey: string) =>
      deleteAnnotation(studyId!, schemaType, entityKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["annotations", studyId, schemaType] });
    },
  });
}
