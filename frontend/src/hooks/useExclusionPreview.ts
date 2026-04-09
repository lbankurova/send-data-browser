import { useQuery, keepPreviousData } from "@tanstack/react-query";

export interface ExclusionGroupResult {
  dose_level: number;
  day: number | null;
  before: {
    g: number;
    g_lower: number | null;
    n_ctrl: number;
    n_treated: number;
  };
  after: {
    g: number | null;
    g_lower: number | null;
    n_ctrl: number;
    n_treated: number;
  };
}

export interface ExclusionPreviewResult {
  groups: ExclusionGroupResult[];
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
 * Returns per-dose-group before/after Hedges' g at the worst-case
 * LOO-flagged day for each group. Backend handles day selection and
 * dose-group scoping via the LOO-day filter.
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
