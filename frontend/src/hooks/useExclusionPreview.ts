import { useQuery, keepPreviousData } from "@tanstack/react-query";

export interface ExclusionPreviewResult {
  day: number | null;
  before: {
    g: number;
    g_lower: number | null;
    n_ctrl: number;
    n_treated: number;
  } | null;
  after: {
    g: number | null;
    g_lower: number | null;
    n_ctrl: number;
    n_treated: number;
  } | null;
}

async function fetchExclusionPreview(
  studyId: string,
  endpointLabel: string,
  domain: string,
  excludedSubjects: string[],
): Promise<ExclusionPreviewResult> {
  const res = await fetch(`/api/studies/${encodeURIComponent(studyId)}/exclusion-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint_label: endpointLabel,
      domain,
      excluded_subjects: excludedSubjects,
    }),
  });
  if (!res.ok) throw new Error(`Exclusion preview failed: ${res.status}`);
  return res.json();
}

/**
 * Fetch backend-computed exclusion impact preview.
 *
 * Recomputes Hedges' g and gLower across ALL timepoints after removing
 * the specified subjects, returning the worst-case day. Replaces the
 * client-side computeExclusionPreview which was scoped to one timepoint.
 */
export function useExclusionPreview(
  studyId: string | undefined,
  endpointLabel: string | undefined,
  domain: string | undefined,
  excludedSubjects: Set<string>,
) {
  const sorted = [...excludedSubjects].sort();
  return useQuery<ExclusionPreviewResult>({
    queryKey: ["exclusion-preview", studyId, endpointLabel, domain, sorted],
    queryFn: () => fetchExclusionPreview(studyId!, endpointLabel!, domain!, sorted),
    enabled: !!studyId && !!endpointLabel && !!domain && sorted.length > 0,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
