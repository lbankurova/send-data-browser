import type {
  FindingsResponse,
  FindingsFilters,
  FindingContext,
  AnalysisSummary,
  OrganCorrelationMatrix,
  SyndromeCorrelationResult,
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
  _filters: FindingsFilters,
  settingsParams?: string,
): Promise<FindingsResponse> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/unified-findings${qs}`
  );
}

export function fetchFindingContext(
  studyId: string,
  findingId: string,
  settingsParams?: string,
): Promise<FindingContext> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analyses/adverse-effects/finding/${encodeURIComponent(findingId)}${qs}`
  );
}

export function fetchOrganCorrelations(
  studyId: string,
  organKey: string,
  settingsParams?: string,
): Promise<OrganCorrelationMatrix> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analyses/adverse-effects/organ/${encodeURIComponent(organKey)}/correlations${qs}`
  );
}

export async function fetchSyndromeCorrelations(
  studyId: string,
  endpointLabels: string[],
  syndromeId: string,
  settingsParams?: string,
): Promise<SyndromeCorrelationResult> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  const res = await fetch(
    `${API_BASE}/studies/${encodeURIComponent(studyId)}/analyses/adverse-effects/syndrome-correlations${qs}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint_labels: endpointLabels,
        syndrome_id: syndromeId,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function fetchAESummary(
  studyId: string,
  settingsParams?: string,
): Promise<AnalysisSummary> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analyses/adverse-effects/summary${qs}`
  );
}
