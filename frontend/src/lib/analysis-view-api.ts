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
  AnimalInfluenceData,
  SubjectSentinelData,
  SubjectSimilarityData,
  HcdReferencesData,
} from "@/types/analysis-views";
import type { StudyMortality } from "@/types/mortality";
import type { SubjectSyndromesResponse, OnsetDaysResponse, RecoveryVerdictsResponse, NoaelOverlayResponse } from "@/types/cohort";

const API_BASE = "/api";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export function fetchStudySignalSummary(
  studyId: string, settingsParams?: string
): Promise<SignalSummaryRow[]> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/study-signal-summary${qs}`
  );
}

export function fetchTargetOrganSummary(
  studyId: string, settingsParams?: string
): Promise<TargetOrganRow[]> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/target-organ-summary${qs}`
  );
}

export function fetchRuleResults(studyId: string, settingsParams?: string): Promise<RuleResult[]> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/rule-results${qs}`
  );
}

export function fetchNoaelSummary(
  studyId: string, settingsParams?: string
): Promise<NoaelSummaryRow[]> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/noael-summary${qs}`
  );
}

export function fetchAdverseEffectSummary(
  studyId: string, settingsParams?: string
): Promise<AdverseEffectSummaryRow[]> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/adverse-effect-summary${qs}`
  );
}

export function fetchDoseResponseMetrics(
  studyId: string, settingsParams?: string
): Promise<DoseResponseRow[]> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/dose-response-metrics${qs}`
  );
}

export function fetchOrganEvidenceDetail(
  studyId: string, settingsParams?: string
): Promise<OrganEvidenceRow[]> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/organ-evidence-detail${qs}`
  );
}

export function fetchLesionSeveritySummary(
  studyId: string, settingsParams?: string
): Promise<LesionSeverityRow[]> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/lesion-severity-summary${qs}`
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
  studyId: string, settingsParams?: string
): Promise<FindingDoseTrend[]> {
  const qs = settingsParams ? `?${settingsParams}` : "";
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/finding-dose-trends${qs}`
  );
}

export function fetchStudyMortality(
  studyId: string,
): Promise<StudyMortality> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/study-mortality`,
  );
}

// ── Control comparison (dual-control studies) ──────────────────

export interface ControlComparisonEndpoint {
  domain: string;
  test_code: string;
  endpoint_label: string;
  sex: string;
  vehicle_mean: number;
  vehicle_sd: number;
  vehicle_n: number;
  negative_mean: number;
  negative_sd: number;
  negative_n: number;
  p_value: number | null;
  cohens_d: number;
  significant: boolean;
}

export interface ControlComparison {
  vehicle_label: string;
  negative_label: string;
  n_endpoints: number;
  n_significant: number;
  summary: string;
  endpoints: ControlComparisonEndpoint[];
}

export function fetchControlComparison(studyId: string): Promise<ControlComparison> {
  return fetchJson(`/studies/${encodeURIComponent(studyId)}/analysis/control-comparison`);
}

// ── Assay validation (positive control studies) ────────────────

export interface AssayValidationEndpoint {
  domain: string;
  test_code: string;
  endpoint_label: string;
  sex: string;
  vehicle_mean: number;
  vehicle_n: number;
  pc_mean: number;
  pc_n: number;
  p_value: number | null;
  cohens_d: number;
  direction: string;
  response_adequate: boolean;
}

export interface AssayValidation {
  pc_arm_label: string;
  pc_compound: string | null;
  pc_dose: number | null;
  vehicle_label: string;
  n_endpoints: number;
  n_significant: number;
  n_adequate: number;
  validity_concern: boolean;
  endpoints: AssayValidationEndpoint[];
}

export function fetchAssayValidation(studyId: string): Promise<AssayValidation> {
  return fetchJson(`/studies/${encodeURIComponent(studyId)}/analysis/assay-validation`);
}

export interface TumorAnalysis {
  count: number;
  by_dose: { dose_level: number; n: number; affected: number; incidence: number }[];
  trend_p: number | null;
  trend_p_one_sided: number | null;
  trend_direction: string;
  poly3_trend_p: number | null;
  poly3_pairwise_p: Record<string, number | null> | null;
  poly3_adjusted_rates: Record<string, number> | null;
  haseman_threshold: number;
  haseman_class: string;
  meets_haseman: boolean | null;
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
  parallel_analyses: {
    organ: string;
    cell_type: string;
    sex: string;
    adenoma: TumorAnalysis;
    carcinoma: TumorAnalysis;
    combined: TumorAnalysis;
    discordance: string | null;
    discordance_interpretation: string | null;
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

// ── Cross-animal flags ──────────────────────────────────────

export interface CrossAnimalFlags {
  tissue_battery: {
    reference_batteries: Record<string, {
      expected_count: number;
      specimens: string[];
      source: string;
    }>;
    has_reduced_recovery_battery: boolean;
    flagged_animals: {
      animal_id: string;
      sex: string;
      sacrifice_group: string;
      examined_count: number;
      expected_count: number;
      completion_pct: number;
      missing_specimens: string[];
      missing_target_organs: string[];
      flag: boolean;
      reference_source: string;
    }[];
    study_level_note: string | null;
  };
  tumor_linkage: {
    tumor_dose_response: {
      specimen: string;
      finding: string;
      behavior: string;
      incidence_by_dose: {
        dose_level: number;
        dose_label: string;
        males: { affected: number; total: number };
        females: { affected: number; total: number };
      }[];
      animal_ids: string[];
      animal_details: {
        id: string;
        sex: string;
        arm: string;
        death_day: number | null;
        scheduled: boolean;
      }[];
      flags: string[];
      denominator_note: string;
    }[];
    banner_text: string | null;
  };
  recovery_narratives: {
    animal_id: string;
    sex: string;
    dose_label: string;
    recovery_start_day: number;
    death_day: number | null;
    days_in_recovery: number | null;
    bw_trend: string;
    bw_change_pct: number;
    bw_start: number | null;
    bw_last: number | null;
    cod_finding: string | null;
    cod_specimen: string | null;
    cod_wasting_related: boolean;
    narrative: string;
  }[];
}

export function fetchCrossAnimalFlags(
  studyId: string,
): Promise<CrossAnimalFlags> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/cross-animal-flags`,
  );
}

export interface StudyMetadataEnriched {
  species: string | null;
  strain: string | null;
  route: string | null;
  study_start: string | null;
  study_end: string | null;
  study_type: string | null;
  study_design: string | null;
  vehicle: string | null;
  sponsor: string | null;
  test_article: string | null;
  last_dosing_day: number | null;
  auto_detected_last_dosing_day: number | null;
  last_dosing_day_override: number | null;
  /** BP-C1: Design adapter type (parallel_between_group, within_animal_crossover, within_animal_escalation). */
  design_type?: string | null;
  /** BP-C1: Human-readable design label (Parallel, Latin Square Crossover, Dose Escalation). */
  design_type_label?: string | null;
  /** BP-C1: True for crossover/escalation studies. */
  is_crossover?: boolean;
  /** BP-C4: Escalation caveat text (null for non-escalation studies). */
  design_caveat?: string | null;
  /** Multi-compound study flag. */
  is_multi_compound?: boolean;
  /** Compound names (multi-compound studies). */
  compounds?: string[];
}

export function fetchStudyMetadataEnriched(
  studyId: string,
): Promise<StudyMetadataEnriched> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/study-metadata-enriched`,
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

// ── Subject syndromes ───────────────────────────────────────

export function fetchSubjectSyndromes(
  studyId: string,
): Promise<SubjectSyndromesResponse> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/subject-syndromes`,
  );
}

// ── Onset days ──────────────────────────────────────────────

export function fetchOnsetDays(
  studyId: string,
): Promise<OnsetDaysResponse> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/subject-onset-days`,
  );
}

// ── Recovery verdicts ───────────────────────────────────────

export function fetchRecoveryVerdicts(
  studyId: string,
): Promise<RecoveryVerdictsResponse> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/recovery-verdicts`,
  );
}

// ── NOAEL overlay ──────────────────────────────────────────

export function fetchNoaelOverlay(
  studyId: string,
): Promise<NoaelOverlayResponse> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/subject-noael-overlay`,
  );
}

// ── Animal influence ──────────────────────────────────────────

export function fetchAnimalInfluence(
  studyId: string,
): Promise<AnimalInfluenceData> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/animal-influence`,
  );
}

// ── Subject sentinel ─────────────────────────────────────────

export function fetchSubjectSentinel(
  studyId: string,
): Promise<SubjectSentinelData> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/subject-sentinel`,
  );
}

export function fetchSubjectSimilarity(
  studyId: string,
): Promise<SubjectSimilarityData> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/analysis/subject-similarity`,
  );
}

// ── HCD references ──────────────────────────────────────────

export function fetchHcdReferences(
  studyId: string,
): Promise<HcdReferencesData> {
  return fetchJson(
    `/studies/${encodeURIComponent(studyId)}/hcd-references`,
  );
}

export async function uploadHcdUser(
  studyId: string,
  entries: Array<{ test_code: string; sex: string; mean?: number; sd?: number; values?: number[]; unit?: string }>,
): Promise<{ uploaded: number; entries: string[] }> {
  const resp = await fetch(
    `${API_BASE}/studies/${encodeURIComponent(studyId)}/annotations/hcd-user/upload`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }) },
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail));
  }
  return resp.json();
}

export async function deleteHcdUser(studyId: string): Promise<{ deleted: boolean }> {
  const resp = await fetch(
    `${API_BASE}/studies/${encodeURIComponent(studyId)}/annotations/hcd-user`,
    { method: "DELETE" },
  );
  if (!resp.ok) throw new Error(resp.statusText);
  return resp.json();
}
