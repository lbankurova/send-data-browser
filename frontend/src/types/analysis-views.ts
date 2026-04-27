/** TypeScript interfaces for generated analysis view data. */

export interface SignalSummaryRow {
  endpoint_label: string;
  endpoint_type: string;
  domain: string;
  test_code: string;
  organ_system: string;
  organ_name: string;
  dose_level: number;
  dose_label: string;
  dose_value: number | null;
  sex: string;
  signal_score: number;
  direction: "up" | "down" | "none" | null;
  p_value: number | null;
  trend_p: number | null;
  effect_size: number | null;
  severity: "adverse" | "warning" | "normal" | "not_assessed";
  treatment_related: boolean;
  dose_response_pattern: string;
  statistical_flag: boolean;
  dose_response_flag: boolean;
  mean: number | null;
  n: number;
}

export interface TargetOrganRow {
  organ_system: string;
  evidence_score: number;
  n_endpoints: number;
  n_domains: number;
  domains: string[];
  max_signal_score: number;
  n_significant: number;
  n_treatment_related: number;
  target_organ_flag: boolean;
  /** Max numeric severity (1-5 scale) from MI/MA/CL findings, null if no histopath data. */
  max_severity: number | null;
  /** MI corroboration status: positive, examined_normal, not_examined, lb_corroborated, or null (non-OM). */
  mi_status?: string | null;
  /** OM-MI discount factor applied (1.0 = no discount), null when discount logic N/A. */
  om_mi_discount?: number | null;
  /** Evidence quality assessment (read-only synthesis, not a score modifier). */
  evidence_quality?: {
    grade: 'strong' | 'moderate' | 'weak' | 'insufficient';
    dimensions_assessed: number;
    convergence: { groups: number; signal: string };
    corroboration: { status: string | null; signal: string } | null;
    sex_concordance: { fraction: number | null; n_evaluable: number; signal: string } | null;
    limiting_factor: string | null;
  } | null;
}

export interface RuleParams {
  // Endpoint identity (auto-populated from finding)
  endpoint_label?: string;
  domain?: string;
  test_code?: string;
  sex?: string;
  direction?: string;
  specimen?: string | null;
  finding?: string;
  data_type?: string;

  // Statistics (auto-populated)
  p_value?: number | null;
  trend_p?: number | null;
  effect_size?: number | null;
  dose_response_pattern?: string;
  severity_class?: string;
  treatment_related?: boolean;
  n_affected?: number;
  max_n?: number;

  // Rule-specific
  ctrl_pct?: string;          // R18/R19
  high_pct?: string;          // R18/R19
  endpoint_labels?: string[]; // R16
  noael_label?: string;       // R14
  noael_dose_value?: string | number; // R14
  noael_dose_unit?: string;   // R14
  pattern?: string;           // R01/R05
  n_endpoints?: number;       // R09
  n_domains?: number;         // R09
  domains?: string[];         // R09
  count?: number;             // R17

  // Metadata (suppression / dampening)
  suppressed_by?: string;
  dampened?: boolean;
  dampening_reason?: string;

  // Clinical catalog annotations
  clinical_class?: "Sentinel" | "HighConcern" | "ModerateConcern" | "ContextDependent";
  catalog_id?: string;
  clinical_confidence?: "Low" | "Medium" | "High";
  clinical_confidence_pre_gamma?: "Low" | "Medium" | "High"; // F9: pre-γ audit
  protective_excluded?: boolean;
  exclusion_id?: string;

  // F1: HCD evidence record (hcd-mi-ma-s08-wiring).
  //
  // Runtime contract (spec R2 N7, AC-F9-2): when `catalog_id` is set AND
  // `domain` is MI/MA, `hcd_evidence` MUST be present. Inner values may be
  // null to encode explicit "no HCD" (crosswalk miss / species not covered /
  // cell-N too low). Silent absence on a catalog-matched MI/MA finding is a
  // backend defect -- `test_hcd_s08_wiring_end_to_end.py` enforces this at
  // generation time.
  //
  // TypeScript type optionality reflects the UNION shape of rule params
  // across all rule IDs. Non-MI/MA rule results do not carry `hcd_evidence`
  // by design. UI consumers that reach for the field on an MI/MA
  // catalog-matched finding MUST substitute `empty_hcd_evidence()` on miss
  // rather than silently suppress the UI -- AC-F10-3 requires the explicit-
  // miss state to render.
  hcd_evidence?: HcdEvidence;

  // Organ-scoped
  organ_system?: string;
}

export interface HcdEvidenceContributionComponents {
  gt_95th_percentile: 0 | 1;
  gt_99th_percentile: 0 | 2;
  below_5th_down_direction: 0 | -1;
  ultra_rare_any_occurrence: 0 | 1;
  tier_cap_applied: boolean;
  hcd_discordant_protective: 0 | -1;
}

export interface HcdEvidence {
  background_rate: number | null;
  background_n_animals: number | null;
  background_n_studies: number | null;
  source: string | null;
  year_range: [number, number] | null;
  match_tier: 1 | 2 | 3 | null;
  match_confidence: "high" | "medium" | "low" | null;
  percentile_of_observed: number | null;
  fisher_p_vs_hcd: number | null;
  drift_flag: boolean | null;
  confidence_contribution: number;
  contribution_components: HcdEvidenceContributionComponents;
  alpha_applies: boolean;
  reason: string | null;
  alpha_scaled_threshold: number | null;
  noael_floor_applied: boolean;
  cell_n_below_reliability_threshold: boolean;
  // F-CARD: between-study heterogeneity payload
  // (cycle: hcd-between-study-heterogeneity).
  // Always present on emit (per AC-CARD-2: null = neutral placeholder render).
  // Optional in TS to keep older fixtures compatible during the rollout.
  heterogeneity?: HeterogeneityRecord | null;
}

/** Decomposition separability outcome (F-CARD AC-CARD-9).
 * Replaces the prior k=10 cliff with a rank/df identifiability check. */
export type HeterogeneitySeparability =
  | "not_separable"
  | "lab_only"
  | "lab_era"
  | "full";

export interface HeterogeneityDecomposition {
  lab: number | null;
  era: number | null;
  substrain: number | null;
  separability: HeterogeneitySeparability | null;
}

/** F-CARD payload (sole consumer this cycle: HeterogeneityCard.tsx).
 *
 * Schema-additivity contract (AC-CARD-11): the JSON schema deliberately omits
 * `additionalProperties: false` inside this record so the next cycle (Proposal 2)
 * can ADD `borrow_active` / `borrow_method` / `borrowed_sd` without breaking
 * backwards compatibility. */
export interface HeterogeneityRecord {
  k_raw: number | null;
  k_eff: number | null;
  self_excluded: boolean;
  tier: "single_source" | "small_k" | "borrow_eligible" | null;
  tier_reason: string | null;
  tau: number | null;                 // log-SD scale
  tau_estimator: "PM" | "REML" | "DL" | null;
  pi_lower: number | null;            // response scale
  pi_upper: number | null;
  pi_method: "hksj" | "reml_wald" | null;
  ess: number | null;                 // Neuenschwander 2020 PC-ESS
  ess_definition: "neuenschwander_2020" | null;
  prior_contribution_pct: number | null;  // 0-100; F-PCONT continuous
  prior_family: "half_normal" | "half_cauchy" | null;
  prior_scale: number | null;
  decomposition: HeterogeneityDecomposition | null;
}

export interface RuleResult {
  rule_id: string;
  scope: "endpoint" | "organ" | "study";
  severity: "info" | "warning" | "critical";
  context_key: string;
  organ_system: string;
  output_text: string;
  evidence_refs: string[];
  params?: RuleParams;
}

export interface StudySummaryFilters {
  endpoint_type: string | null;
  organ_system: string | null;
  signal_score_min: number;
  sex: string | null;
  significant_only: boolean;
}

export interface SignalSelection {
  endpoint_label: string;
  dose_level: number;
  sex: string;
  domain: string;
  test_code: string;
  organ_system: string;
}

/** Unified selection state for Signals tab — discriminated union. */
export type SignalViewSelection =
  | { level: "none" }
  | { level: "organ"; organSystem: string }
  | { level: "endpoint"; endpoint: SignalSelection };

// --- NOAEL Determination (View 5) ---

/**
 * Closed vocabulary for `NoaelDerivation.method`. Backend source of truth:
 * `backend/generator/view_dataframes.py::_build_noael_for_groups`. Adding a
 * value backend-side requires extending this union so the discriminator
 * comparisons in the frontend stay exhaustively type-checked.
 */
export type NoaelDerivationMethod =
  | "highest_dose_no_adverse"
  | "highest_dose_no_adverse_single_dose"
  | "below_tested_range"
  | "not_established"
  | "single_dose_not_established"
  | "control_mortality_critical"
  | "no_concurrent_control"
  | "noel_framework";

export interface NoaelDerivation {
  method: NoaelDerivationMethod;
  classification_method: string;
  loael_dose_level: number | null;
  loael_label: string | null;
  adverse_findings_at_loael: Array<{
    finding: string;
    specimen: string;
    domain: string;
    p_value: number | null;
    finding_class: string | null;
    corroboration_status: string | null;
    loo_stability: number | null;
    loo_control_fragile: boolean | null;
    loo_influential_subject: string | null;
  }>;
  n_adverse_at_loael: number;
  confidence: number;
  confidence_penalties: string[];
  loo_fragile: boolean;
  loo_min_stability: number | null;
}

export interface NoaelSummaryRow {
  sex: string;
  /** null when NOAEL is not established (no findings, below tested range, or suppressed). */
  noael_dose_level: number | null;
  noael_label: string;
  /** null when NOAEL is not established. */
  noael_dose_value: number | null;
  /** null when NOAEL is not established. */
  noael_dose_unit: string | null;
  /** null when no LOAEL is identifiable (e.g. no adverse findings at all). */
  loael_dose_level: number | null;
  loael_label: string;
  n_adverse_at_loael: number;
  adverse_domains_at_loael: string[];
  noael_confidence: number;
  noael_derivation?: NoaelDerivation;
  /** True when expert NOAEL override replaced the algorithmic value. */
  _overridden?: boolean;
  /** Algorithmic NOAEL dose level before expert override. */
  _system_dose_level?: number | null;
  /** Algorithmic NOAEL dose value before expert override. */
  _system_dose_value?: number | null;
  /** Expert's rationale for the override. */
  _override_rationale?: string;
  /** True when finding-level overrides (tox/pathology) caused NOAEL recomputation. */
  _recomputed?: boolean;
  /** Original NOAEL dose level before recomputation from finding overrides. */
  _original_noael_dose_level?: number | null;
  /** Original NOAEL dose value before recomputation from finding overrides. */
  _original_noael_dose_value?: number | null;
}

export interface AdverseEffectSummaryRow {
  endpoint_label: string;
  endpoint_type: string;
  domain: string;
  organ_system: string;
  dose_level: number;
  dose_label: string;
  sex: string;
  p_value: number | null;
  effect_size: number | null;
  direction: "up" | "down" | "none" | null;
  severity: "adverse" | "warning" | "normal" | "not_assessed";
  treatment_related: boolean;
  dose_response_pattern: string;
  /** SEND test code (e.g., LBTESTCD) — used for structured syndrome matching */
  test_code?: string;
  /** Specimen name for MI/MA/OM domains */
  specimen?: string | null;
  /** Finding name for MI/MA domains (separate from specimen) */
  finding?: string | null;
  /** Maximum incidence across treated dose groups (0-1) */
  max_incidence?: number | null;
  /** Maximum fold change vs control (always >= 1, continuous endpoints only) */
  max_fold_change?: number | null;
  /** LOO stability ratio from driving pairwise. 1.0 = stable, <1.0 = fragile. */
  loo_stability?: number | null;
  /** True when control-side LOO stability < treated-side (control drives fragility). */
  loo_control_fragile?: boolean | null;
  /** Number of early-death subjects excluded (terminal domains only) */
  n_excluded?: number;
  /** REM-05: Per-dose-group statistics (from scheduled sacrifice timepoint) */
  scheduled_group_stats?: { dose_level: number; n: number; mean: number | null; sd: number | null; median?: number | null }[];
  /** True for derived endpoints (ratios/indices) that create tautological correlations. */
  is_derived?: boolean;
  /** Pre-computed qualifier tag string for MI/MA (e.g. "acute, centrilobular"). */
  qualifier_tags?: string | null;
  /** Compound identity for multi-compound studies. */
  compound_id?: string;
  /**
   * Phase B FCT payload propagation (species-magnitude-thresholds-dog-nhp).
   * Per-finding FCT verdict (5-value) and reliance block shipped so the
   * frontend D4 clinical-boost (endpoint-confidence.ts) can consume the
   * backend-computed bands without recomputing.
   */
  verdict?: "variation" | "concern" | "adverse" | "strong_adverse" | "provisional" | null;
  coverage?: "full" | "partial" | "none" | "catalog_driven" | "n-sufficient" | "n-marginal" | "n-insufficient" | null;
  fct_reliance?: {
    coverage: string;
    fallback_used: boolean;
    provenance: string;
    bands_used: {
      variation_ceiling: number | null;
      concern_floor: number | null;
      adverse_floor: number | null;
      strong_adverse_floor: number | null;
      units: string;
      any_significant: boolean;
    } | null;
  } | null;
}

// --- Dose-Response (View 2) ---

export interface DoseResponseRow {
  endpoint_label: string;
  domain: string;
  test_code: string;
  organ_system: string;
  dose_level: number;
  dose_label: string;
  sex: string;
  day: number | null;
  mean: number | null;
  sd: number | null;
  n: number | null;
  incidence: number | null;
  affected: number | null;
  p_value: number | null;
  effect_size: number | null;
  dose_response_pattern: string;
  trend_p: number | null;
  data_type: "continuous" | "categorical";
}

// --- Target Organs (View 3) --- (TargetOrganRow already defined above)

export interface OrganEvidenceRow {
  organ_system: string;
  organ_name: string;
  endpoint_label: string;
  domain: string;
  test_code: string;
  dose_level: number;
  dose_label: string;
  sex: string;
  p_value: number | null;
  effect_size: number | null;
  direction: "up" | "down" | "none" | null;
  severity: "adverse" | "warning" | "normal" | "not_assessed";
  treatment_related: boolean;
}

// --- Provenance Messages (Study Summary enrichment) ---

export interface ProvenanceMessage {
  rule_id: string;
  icon: "info" | "warning";
  message: string;
  link_to_rule: string | null;
}

// --- Histopathology: per-finding dose trend statistics ---

export interface FindingDoseTrend {
  specimen: string;
  finding: string;
  ca_trend_p: number | null;
  severity_trend_rho: number | null;
  severity_trend_p: number | null;
  /** Backend-authoritative dose-response pattern (aggregate across sexes). */
  dose_response_pattern?: string | null;
  /** Onset dose level for threshold patterns. */
  onset_dose_level?: number | null;
  /** Per-sex pattern breakdown. */
  pattern_by_sex?: Record<string, { pattern: string; onset_dose_level: number | null }>;
}

// --- Histopathology (View 4) ---

export type SeverityStatus = "absent" | "present_ungraded" | "graded";

export interface LesionSeverityRow {
  endpoint_label: string;
  specimen: string;
  finding: string;
  domain: string;
  dose_level: number;
  dose_label: string;
  sex: string;
  n: number;
  affected: number;
  incidence: number;
  avg_severity: number | null;
  severity_status: SeverityStatus;
  severity: "adverse" | "warning" | "normal" | "not_assessed";
  /** Dominant distribution qualifier from SUPP domain: focal, diffuse, mixed, etc. */
  dominant_distribution?: string | null;
  /** Dominant temporality qualifier: acute, subacute, chronic */
  dominant_temporality?: string | null;
  /** Raw QVAL modifier strings (unique values across subjects) */
  modifier_raw?: string[];
  /** Number of affected subjects with modifiers */
  n_with_modifiers?: number;
  /** Per-dose distribution counts: {focal: 2, diffuse: 1} */
  modifier_counts?: Record<string, number>;
  /** Whether the specimen has recovery-phase subjects in the study (computed from unfiltered subject list). */
  has_recovery_subjects?: boolean;
  /** Number of early-death subjects excluded (0 for longitudinal domains). */
  n_excluded?: number;
  /** Scheduled-sacrifice stats per dose level (early-death subjects excluded). */
  scheduled_group_stats?: {
    dose_level: number; n: number; affected: number; incidence: number;
    avg_severity?: number | null; modifier_counts?: Record<string, number>;
  }[];
  /** Scheduled-sacrifice pairwise comparison results. */
  scheduled_pairwise?: { dose_level: number; p_value: number | null; p_value_adj: number | null; odds_ratio?: number | null; risk_ratio?: number | null }[];
  /** Direction under scheduled-sacrifice data. */
  scheduled_direction?: string;
}

/**
 * Derive severity state from row data.
 * Use this as a fallback if severity_status isn't available from the backend.
 */
export function getSeverityState(
  affected: number,
  avgSeverity: number | null
): SeverityStatus {
  if (affected === 0) return "absent";
  if (avgSeverity == null) return "present_ungraded";
  return "graded";
}

// --- PK Integration (Phase 6) ---

export interface PkParameterStats {
  mean: number | null;
  sd: number | null;
  median: number | null;
  n: number;
  unit: string;
  values?: number[];
}

export interface PkConcentrationTimePoint {
  timepoint: string;
  tptnum: number;
  elapsed_h: number | null;
  mean: number;
  sd: number;
  n: number;
  n_bql: number;
}

export interface PkDoseGroup {
  dose_level: number;
  dose_value: number;
  dose_unit: string;
  dose_label: string;
  n_subjects: number;
  parameters: Record<string, PkParameterStats>;
  concentration_time: PkConcentrationTimePoint[];
}

export interface TKDesign {
  has_satellite_groups: boolean;
  satellite_set_codes: string[];
  main_study_set_codes: string[];
  n_tk_subjects: number;
  individual_correlation_possible: boolean;
}

export interface DoseProportionality {
  parameter: string;
  slope: number | null;
  r_squared: number | null;
  assessment: "linear" | "supralinear" | "sublinear" | "insufficient_data";
  dose_levels_used: number[];
  non_monotonic?: boolean;
  interpretation?: string | null;
}

export interface PkExposureSummary {
  dose_level: number;
  dose_value: number;
  cmax: { mean: number; sd: number | null; unit: string } | null;
  auc: { mean: number; sd: number | null; unit: string } | null;
  tmax: { mean: number; unit: string } | null;
}

export interface PkIntegration {
  available: boolean;
  species?: string;
  km_factor?: number;
  hed_conversion_factor?: number;
  tk_design?: TKDesign;
  analyte?: string;
  specimen?: string;
  lloq?: number;
  lloq_unit?: string;
  visit_days?: number[];
  multi_visit?: boolean;
  pp_parameters_available?: string[];
  by_dose_group?: PkDoseGroup[];
  dose_proportionality?: DoseProportionality;
  accumulation?: {
    available: boolean;
    ratio: number | null;
    assessment: "accumulation" | "autoinduction" | "stable" | "unknown";
    reason?: string;
  };
  noael_exposure?: PkExposureSummary;
  loael_exposure?: PkExposureSummary;
  hed?: {
    noael_mg_kg: number;
    hed_mg_kg: number;
    mrsd_mg_kg: number;
    safety_factor: number;
    method: string;
    noael_status: "established" | "at_control";
  };
}

// ── Animal Influence Explorer ───────────────────────────────────

export interface AnimalInfluenceData {
  min_group_n: number;
  loo_confidence: "adequate" | "low" | "insufficient";
  thresholds: {
    instability: number;
    bio_extremity_z: number;
  };
  animals: AnimalInfluenceSummary[];
  endpoint_details: Record<string, AnimalEndpointDetail[]>;
}

export interface AnimalInfluenceSummary {
  subject_id: string;
  group_id: string;
  dose_level: number;
  sex: string;
  terminal_bw: number | null;
  is_control: boolean;
  /** Mean instability across all pairwise LOO comparisons (0-1). Null when loo_confidence === "insufficient". */
  mean_instability: number | null;
  /** Max single-endpoint instability (0-1) for dot-size encoding. Null when loo_confidence === "insufficient". */
  max_endpoint_instability: number | null;
  /** Number of distinct dose-level comparisons this animal participates in. */
  n_pairwise_k: number;
  mean_bio_z: number;
  n_endpoints_total: number;
  /** Null when loo_confidence === "insufficient". */
  n_endpoints_with_loo: number | null;
  is_alarm: boolean;
  instability_by_dose: Record<number, { mean_ratio: number; n_endpoints: number }>;
  worst_dose_level: number | null;
  endpoint_coverage_flag: boolean;
}

export interface AnimalEndpointDetail {
  endpoint_id: string;
  endpoint_name: string;
  endpoint_type: "continuous" | "semiquant" | "incidence";
  domain: string;
  bio_z_raw: number | null;
  bio_norm: number | null;
  instability: number | null;
  loo_ratios_by_dose: Record<number, number>;
  mean_ratio: number | null;
  worst_ratio: number | null;
  worst_dose_level: number | null;
  loo_dose_group: string | null;
  is_control_side: boolean;
  alarm_score: number;
}

// ── Detection Metadata ──────────────────────────────────────

export interface DetectionGroupMeta {
  dose_level: number;
  n: number;
  median: number;
  /** Robust dispersion (Qn or MAD*1.4826). In log-space when parent log_transformed is true. */
  scale: number;
  cv_pct: number | null;
  window_lo: number;
  window_hi: number;
  window_lo_concordance: number;
  window_hi_concordance: number;
}

export interface DetectionEndpointMeta {
  endpoint_name: string;
  domain: string;
  sex: string;
  log_transformed: boolean;
  groups: DetectionGroupMeta[];
}

// ── Subject Sentinel ────────────────────────────────────────

export interface SubjectSentinelData {
  thresholds: {
    outlier_z: number;
    concordance_z: number;
    poc_domains: number;
    coc_organs: number;
  };
  stress_heuristic_mode: "flag" | "annotate";
  animals: SentinelAnimal[];
  endpoint_details: Record<string, SentinelEndpointDetail[]>;
  detection_metadata?: Record<string, DetectionEndpointMeta>;
}

export interface SentinelAnimal {
  subject_id: string;
  dose_level: number;
  sex: string;
  group_id: string;
  n_outlier_flags: number;
  max_z: number | null;
  outlier_organs: string[];
  poc: Record<string, number>;
  coc: number;
  stress_flag: boolean;
  stress_flag_pharmacological: boolean;
  stress_heuristic_mode: "flag" | "annotate" | null;
  n_sole_findings: number;
  sole_finding_organs: string[];
  n_non_responder: number;
  disposition: string | null;
  is_control: boolean;
}

export interface SentinelEndpointDetail {
  endpoint_id: string;
  endpoint_name: string;
  domain: string;
  organ_system: string;
  z_score: number | null;
  hamada_residual: number | null;
  is_outlier: boolean;
  log_transformed: boolean;
  is_sole_finding: boolean;
  is_non_responder: boolean;
  bw_confound_suppressed: boolean;
}

// ── Subject Similarity ──────────────────────────────────────

export interface SubjectSimilarityData {
  meta: {
    n_subjects_eligible: number;
    n_excluded: number;
    excluded_reasons: Record<string, number>;
    n_features: number;
    similarity_suppressed: boolean;
    mds_stress: number | null;
    method: {
      distance: string;
      range_normalization: string;
      embedding: string;
      clustering: string;
    };
  };
  feature_definitions: SimilarityFeatureDef[];
  subjects: Record<string, SimilaritySubject>;
  interpretability: {
    control_calibration: Record<string, { p90: number; mean: number; n_control_pairs: number }>;
    boundary_subjects: BoundarySubjectDetail[];
  };
  validation: {
    by_k: Record<string, { ari: number; ari_perm_p: number; n_boundary: number; boundary_perm_p: number }>;
    silhouette_mean: number;
    silhouette_label: string;
    n_permutations: number;
    n_low_overlap_subjects: number;
  };
}

export interface SimilarityFeatureDef {
  name: string;
  type: "continuous" | "ordinal" | "binary";
  organ_system: string;
  domain: string;
  description: string;
  max_rank?: number;
}

export interface SimilaritySubject {
  features: Record<string, number | null>;
  mds_x: number | null;
  mds_y: number | null;
  cluster_ids: Record<string, number>;
  is_boundary: Record<string, boolean>;
  low_overlap: boolean;
  feature_overlap_pct: number | null;
  dose_group_order: number;
  sex: string;
  is_recovery: boolean;
  is_early_death: boolean;
}

export interface BoundarySubjectDetail {
  subject: string;
  own_dose_group: number;
  cluster_dominant_dose_group: number;
  top_contributing_features: {
    feature: string;
    contribution: number;
    exceeds_control_p90: boolean;
  }[];
}

// ── HCD References ──────────────────────────────────────────

export interface HcdReference {
  test_code: string;
  sex: string;
  source: string;
  source_type: "user" | "system";
  n: number | null;
  isLognormal: boolean;
  lower: number;
  upper: number;
  unit: string | null;
  confidence: string | null;
  mean: number | null;
  sd: number | null;
  geom_mean: number | null;
  values: number[] | null;
}

export interface HcdReferencesData {
  species: string;
  strain: string;
  duration_category: string | null;
  duration_status: "known" | "unknown";
  references: Record<string, HcdReference>;
}

// ── Subject Correlations ────────────────────────────────────

export interface SubjectCorrelationPair {
  ep_a: string;
  ep_b: string;
  sex: string;
  rho: number;
  p: number;
  n: number;
}

export interface SubjectCorrelationsData {
  pairs: SubjectCorrelationPair[];
  meta: {
    n_endpoints_analyzed: number;
    n_pairs_tested: number;
    n_significant_pairs: number;
    min_overlap: number;
    min_rho: number;
    max_p: number;
  };
}
