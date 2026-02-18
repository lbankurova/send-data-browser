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
  FindingDoseTrend,
  PkIntegration,
} from "@/types/analysis-views";
import type { StudyMortality } from "@/types/mortality";

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

export function fetchFindingDoseTrends(
  studyId: string
): Promise<FindingDoseTrend[]> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/finding-dose-trends`
  );
}

export function fetchStudyMortality(
  studyId: string,
): Promise<StudyMortality> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/study-mortality`,
  );
}

export interface TumorSummary {
  has_tumors: boolean;
  total_tumor_animals: number;
  total_tumor_types: number;
  summaries: {
    organ: string;
    morphology: string;
    behavior: string;
    cell_type: string;
    sex: string;
    count: number;
    by_dose: { dose_level: number; n: number; affected: number; incidence: number }[];
    trend_p: number | null;
  }[];
  combined_analyses: {
    organ: string;
    cell_type: string;
    sex: string;
    adenoma_count: number;
    carcinoma_count: number;
    combined_by_dose: { dose_level: number; n: number; affected: number; incidence: number }[];
    combined_trend_p: number | null;
  }[];
  progression_sequences: {
    organ: string;
    cell_type: string;
    stages: string[];
    stages_present: string[];
    complete: boolean;
    mi_precursors: { finding: string; stages_matched: string[]; specimen: string }[];
    has_mi_precursor: boolean;
    has_tf_tumor: boolean;
  }[];
  palpable_masses: { animal_id: string; location: string; finding: string }[];
}

export function fetchTumorSummary(
  studyId: string,
): Promise<TumorSummary> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/tumor-summary`,
  );
}

export function fetchPkIntegration(
  studyId: string,
): Promise<PkIntegration> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/pk-integration`,
  );
}

export function fetchFoodConsumptionSummary(
  studyId: string,
): Promise<import("@/lib/syndrome-interpretation").FoodConsumptionSummaryResponse> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/food-consumption-summary`,
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
