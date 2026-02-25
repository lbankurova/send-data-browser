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
  severity: "adverse" | "warning" | "normal";
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
  protective_excluded?: boolean;
  exclusion_id?: string;

  // Organ-scoped
  organ_system?: string;
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

export interface NoaelSummaryRow {
  sex: string;
  noael_dose_level: number;
  noael_label: string;
  noael_dose_value: number;
  noael_dose_unit: string;
  loael_dose_level: number;
  loael_label: string;
  n_adverse_at_loael: number;
  adverse_domains_at_loael: string[];
  noael_confidence: number;
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
  severity: "adverse" | "warning" | "normal";
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
  /** Number of early-death subjects excluded (terminal domains only) */
  n_excluded?: number;
  /** REM-05: Per-dose-group statistics (from scheduled sacrifice timepoint) */
  scheduled_group_stats?: { dose_level: number; n: number; mean: number | null; sd: number | null; median?: number | null }[];
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
  severity: "adverse" | "warning" | "normal";
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
  severity: "adverse" | "warning" | "normal";
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
