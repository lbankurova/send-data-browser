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

export interface TimeCourse {
  onset_hours?: number;
  peak_hours?: number;
  expected_resolution_days?: number;
  self_limiting: boolean;
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
  /** Temporal kinetics — critical for LNP/mRNA adversity classification */
  time_course?: TimeCourse;
  /** Which molecular component drives this finding (e.g., ionizable_lipid, PEG_lipid, mRNA) */
  component_attribution?: string;
  /** Which administration routes produce this finding (e.g., ["IV", "IM"]) */
  route_applicability?: string[];
  /** Scientific mechanism (distinct from rationale) */
  mechanism?: string;
  /** Gene editing tool specificity */
  editing_modality?: "nuclease" | "base_editor" | "prime_editor";
  /** Confirmatory negatives — "expected absent" */
  negative_finding?: boolean;
  /** ADC: how linker stability modulates the finding */
  linker_note?: string;
  /** ADC: which PK analyte drives the finding */
  pk_correlate?: string;
  /** Reversible / partially reversible / irreversible */
  reversibility?: string;
  /** Known preclinical-to-clinical disconnect */
  translation_gap?: string;
  /** ADC: when finding differs between payload subtypes */
  payload_subclass_note?: string;
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
  vector_class?: string;
}

export interface ProfileSummary {
  profile_id: string;
  display_name: string;
  modality: string;
  finding_count: number;
  base_profiles?: string[];
}

/**
 * Optional compound identity record — for small-molecule studies only (pre-Datagrok).
 * Strings-only storage: no validation, no rendering, no physchem. Post-Datagrok
 * the stored SMILES lights up structure rendering + similarity + physchem.
 * See `.lattice/spike-study-details-ux.md` decision 6 and TODO.md GAP-268.
 */
export interface CompoundIdentity {
  id?: string;
  smiles?: string;
  smarts?: string;
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
  /** List shape from day 1 — single-compound studies have one element, multi-compound studies have N. */
  compound_identity?: CompoundIdentity[];
  /**
   * Free-text class label the user entered when no catalog match was found.
   * Persisted so the scientist's knowledge isn't lost; no expected-effect filtering
   * applies (the catalog is authoritative for that). Mutually exclusive in intent
   * with a catalog `compound_class`: when this is set, `compound_class` typically
   * stays at the inferred value.
   */
  compound_class_freetext?: string;
}

export interface CompoundProfileResponse {
  study_id: string;
  inference: CompoundClassInference;
  sme_confirmed: SmeConfirmedProfile | null;
  active_profile: ExpectedEffectProfile | null;
  available_profiles: ProfileSummary[];
  cross_reactivity?: "full" | "partial" | "unknown" | null;
}
