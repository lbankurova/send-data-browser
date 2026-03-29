/** TypeScript interfaces for compound-class inference and expected-effect profiles. */

export interface CompoundClassInference {
  compound_class: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "DEFAULT";
  inference_method: string;
  suggested_profiles: string[];
}

export interface SeverityThreshold {
  type: "grade" | "magnitude" | "fold_change" | "descriptive";
  max_non_adverse?: number;
  condition?: string;
  never_reclassifiable?: string[];
  text?: string;
}

export interface ExpectedFinding {
  key: string;
  domain: string;
  organs?: string[];
  findings?: string[];
  test_codes?: string[];
  direction: "up" | "down" | "present" | "absent" | "normal";
  description: string;
  severity_threshold: SeverityThreshold | string | null;
  species_applicability?: string[];
  species_note?: string;
  rationale: string;
  typical_magnitude?: string;
  /** Biological provenance: base = Fc-mediated class effect, target = on-target pharmacology */
  layer?: "base" | "target";
}

export interface ExpectedEffectProfile {
  profile_id: string;
  display_name: string;
  modality: string;
  source: string;
  description: string;
  expected_findings: ExpectedFinding[];
  base_profiles?: string[];
  user_selectable?: boolean;
  cross_reactivity_required?: boolean;
}

export interface ProfileSummary {
  profile_id: string;
  display_name: string;
  modality: string;
  finding_count: number;
  base_profiles?: string[];
}

export interface SmeConfirmedProfile {
  compound_class: string;
  original_compound_class?: string;
  confirmed_by_sme: boolean;
  cross_reactivity?: "full" | "partial" | "unknown";
  expected_findings?: Record<string, boolean>;
  confidence?: string;
  inference_method?: string;
  justification?: string;
  note?: string;
  pathologist?: string;
  reviewDate?: string;
}

export interface CompoundProfileResponse {
  study_id: string;
  inference: CompoundClassInference;
  sme_confirmed: SmeConfirmedProfile | null;
  active_profile: ExpectedEffectProfile | null;
  available_profiles: ProfileSummary[];
  cross_reactivity?: "full" | "partial" | "unknown" | null;
}
