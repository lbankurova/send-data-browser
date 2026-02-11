/** Fetch functions for pre-generated analysis view JSON. */

import type {
  SignalSummaryRow,
  TargetOrganRow,
  RuleResult,
  NoaelSummaryRow,
  AdverseEffectSummaryRow,
  DoseResponseRow,
  OrganEvidenceRow,
  LesionSeverityRow,
  ProvenanceMessage,
} from "@/types/analysis-views";

const API_BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function fetchStudySignalSummary(
  studyId: string
): Promise<SignalSummaryRow[]> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/study-signal-summary`
  );
}

export function fetchTargetOrganSummary(
  studyId: string
): Promise<TargetOrganRow[]> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/target-organ-summary`
  );
}

export function fetchRuleResults(studyId: string): Promise<RuleResult[]> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/rule-results`
  );
}

export function fetchNoaelSummary(
  studyId: string
): Promise<NoaelSummaryRow[]> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/noael-summary`
  );
}

export function fetchAdverseEffectSummary(
  studyId: string
): Promise<AdverseEffectSummaryRow[]> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/adverse-effect-summary`
  );
}

export function fetchDoseResponseMetrics(
  studyId: string
): Promise<DoseResponseRow[]> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/dose-response-metrics`
  );
}

export function fetchOrganEvidenceDetail(
  studyId: string
): Promise<OrganEvidenceRow[]> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/organ-evidence-detail`
  );
}

export function fetchLesionSeveritySummary(
  studyId: string
): Promise<LesionSeverityRow[]> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/lesion-severity-summary`
  );
}

export function fetchProvenanceMessages(
  studyId: string
): Promise<ProvenanceMessage[]> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/provenance-messages`
  );
}

export function fetchStaticChart(
  studyId: string,
  chartName: string
): Promise<string> {
  return fetch(
    `${API_BASE}/studies/${encodeURIComponent(studyId)}/analysis/static/${chartName}`
  ).then((res) => {
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.text();
  });
}
