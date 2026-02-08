import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAnnotations, saveAnnotation } from "@/lib/annotations-api";

export function useAnnotations<T>(studyId: string | undefined, schemaType: string) {
  return useQuery<Record<string, T>>({
    queryKey: ["annotations", studyId, schemaType],
    queryFn: () => fetchAnnotations<T>(studyId!, schemaType),
    enabled: !!studyId,
    staleTime: 5 * 60 * 1000,
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
