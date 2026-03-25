import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchStudyPreferences,
  renameStudy,
  updateStudyOrder,
} from "@/lib/api";

export function useStudyPreferences() {
  return useQuery({
    queryKey: ["study-preferences"],
    queryFn: fetchStudyPreferences,
  });
}

export function useRenameStudy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      studyId,
      displayName,
    }: {
      studyId: string;
      displayName: string | null;
    }) => renameStudy(studyId, displayName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studies"] });
      queryClient.invalidateQueries({ queryKey: ["study-preferences"] });
    },
  });
}

export function useUpdateStudyOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (order: string[]) => updateStudyOrder(order),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study-preferences"] });
    },
  });
}
