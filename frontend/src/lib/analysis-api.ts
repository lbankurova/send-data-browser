import type {
  AdverseEffectsResponse,
  AdverseEffectsFilters,
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

export function fetchAdverseEffects(
  studyId: string,
  page: number,
  pageSize: number,
  filters: AdverseEffectsFilters
): Promise<AdverseEffectsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });
  if (filters.domain) params.set("domain", filters.domain);
  if (filters.sex) params.set("sex", filters.sex);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.search) params.set("search", filters.search);

  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analyses/adverse-effects?${params}`
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
