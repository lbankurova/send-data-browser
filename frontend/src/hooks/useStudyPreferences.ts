import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchStudyPreferences,
  renameStudy,
  updateStudyOrder,
  updateTestArticleOverride,
} from "@/lib/api";

export function useStudyPreferences() {
  return useQuery({
    queryKey: ["study-preferences"],
    queryFn: fetchStudyPreferences,
    // Same reason as useStudies: hydrated prefs from IndexedDB may be a stale
    // snapshot from a prior session. Always background-refetch on mount.
    staleTime: 0,
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

export function useUpdateTestArticleOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      studyId,
      testArticle,
    }: {
      studyId: string;
      testArticle: string | null;
    }) => updateTestArticleOverride(studyId, testArticle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["study-preferences"] });
    },
  });
}
