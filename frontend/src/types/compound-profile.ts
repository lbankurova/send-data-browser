/** TypeScript interfaces for compound-class inference and expected-effect profiles. */

export interface CompoundClassInference {
  compound_class: string;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "DEFAULT";
  inference_method: string;
  suggested_profiles: string[];
}

export interface ExpectedFinding {
  key: string;
  domain: string;
  organs?: string[];
  findings?: string[];
  test_codes?: string[];
  direction: "up" | "down";
  description: string;
  severity_threshold: string | null;
  species_applicability?: string[];
  rationale: string;
  typical_magnitude?: string;
}

export interface ExpectedEffectProfile {
  profile_id: string;
  display_name: string;
  modality: string;
  source: string;
  description: string;
  expected_findings: ExpectedFinding[];
}

export interface ProfileSummary {
  profile_id: string;
  display_name: string;
  modality: string;
  finding_count: number;
}

export interface SmeConfirmedProfile {
  compound_class: string;
  confirmed_by_sme: boolean;
  expected_findings?: Record<string, boolean>;
  pathologist?: string;
  reviewDate?: string;
}

export interface CompoundProfileResponse {
  study_id: string;
  inference: CompoundClassInference;
  sme_confirmed: SmeConfirmedProfile | null;
  active_profile: ExpectedEffectProfile | null;
  available_profiles: ProfileSummary[];
}
