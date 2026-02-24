import { useMutation, useQueryClient } from "@tanstack/react-query";

interface RegenerateResult {
  status: string;
  last_dosing_day: number | null;
  last_dosing_day_override: number | null;
  findings_count: number;
}

export function useRegenerate(studyId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<RegenerateResult>({
    mutationFn: async () => {
      const res = await fetch(`/api/studies/${studyId}/regenerate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Regeneration failed: ${res.status}`);
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all generated-data query keys so views refresh
      const keys = [
        "study-signal-summary",
        "target-organ-summary",
        "dose-response-metrics",
        "organ-evidence-detail",
        "lesion-severity-summary",
        "adverse-effect-summary",
        "noael-summary",
        "rule-results",
        "finding-dose-trends",
        "study-mortality",
        "tumor-summary",
        "food-consumption-summary",
        "pk-integration",
        "cross-animal-flags",
        "subject-context",
        "provenance-messages",
        "insights",
        "studyMetadata",
        "timecourse",
        "recovery-comparison",
        "study-metadata-enriched",
        "histopath-subjects",
        "ae-summary",
        "dose-response-metrics",
      ];
      for (const key of keys) {
        queryClient.invalidateQueries({ queryKey: [key, studyId] });
      }
      // Timecourse has extra segments in the key — invalidate by prefix
      queryClient.invalidateQueries({
        queryKey: ["timecourse", studyId],
      });
    },
  });
}
