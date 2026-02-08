import { useMutation, useQueryClient } from "@tanstack/react-query";

interface ValidationSummary {
  total_issues: number;
  errors: number;
  warnings: number;
  info: number;
  domains_affected: string[];
}

export function useRunValidation(studyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<ValidationSummary>({
    mutationFn: async () => {
      const res = await fetch(`/api/studies/${studyId}/validate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Validation failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["validation-results", studyId] });
      queryClient.invalidateQueries({ queryKey: ["affected-records", studyId] });
    },
  });
}
