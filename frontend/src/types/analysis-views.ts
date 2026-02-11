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
}

export interface RuleResult {
  rule_id: string;
  scope: "endpoint" | "organ" | "study";
  severity: "info" | "warning" | "critical";
  context_key: string;
  organ_system: string;
  output_text: string;
  evidence_refs: string[];
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

// --- NOAEL & Decision (View 5) ---

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

// --- Histopathology (View 4) ---

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
  severity: "adverse" | "warning" | "normal";
}
