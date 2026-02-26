import type {
  FindingsResponse,
  FindingsFilters,
  FindingContext,
  AnalysisSummary,
} from "@/types/analysis";

const API_BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function fetchFindings(
  studyId: string,
  _page: number,
  _pageSize: number,
  _filters: FindingsFilters
): Promise<FindingsResponse> {
  // Pre-generated: all findings served at once from static JSON.
  // Filtering and pagination are handled client-side by useFindingsAnalyticsLocal.
  // Parameters kept for API compatibility but ignored — the pre-generated file
  // contains all findings in FindingsResponse format.
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/unified-findings`
  );
}

export function fetchFindingContext(
  studyId: string,
  findingId: string
): Promise<FindingContext> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analyses/adverse-effects/finding/${encodeURIComponent(findingId)}`
  );
}

export function fetchAESummary(
  studyId: string
): Promise<AnalysisSummary> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analyses/adverse-effects/summary`
  );
}
