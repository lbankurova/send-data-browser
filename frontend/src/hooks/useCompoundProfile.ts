import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchCompoundProfile } from "@/lib/api";
import { saveAnnotation, deleteAnnotation } from "@/lib/annotations-api";
import type { CompoundProfileResponse } from "@/types/compound-profile";

export function useCompoundProfile(studyId: string | undefined) {
  return useQuery<CompoundProfileResponse>({
    queryKey: ["compound-profile", studyId],
    queryFn: () => fetchCompoundProfile(studyId!),
    enabled: !!studyId,
    staleTime: 30 * 60 * 1000,
  });
}

export function useSaveCompoundProfile(studyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      compound_class: string;
      original_compound_class: string;
      confirmed_by_sme: boolean;
      expected_findings: Record<string, boolean>;
      confidence?: string;
      inference_method?: string;
      justification?: string;
      note?: string;
      reviewDate: string;
    }) =>
      saveAnnotation(studyId!, "compound-profile", "study", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compound-profile", studyId] });
    },
  });
}

export function useResetCompoundProfile(studyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteAnnotation(studyId!, "compound-profile", "study"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compound-profile", studyId] });
    },
  });
}
