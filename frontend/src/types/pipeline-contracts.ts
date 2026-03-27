/**
 * Pipeline Contract Types — formal abstraction boundaries.
 *
 * These types define the interfaces between pipeline stages:
 *   - EvidenceBundle: per-endpoint evidence (≈ EndpointSummary)
 *   - StudySummaryRecord: terminal output of single-study analysis
 *   - StudyTypeConfig: declarative study type routing
 *
 * Cross-study intelligence (Pipeline 2) consumes StudySummaryRecord only.
 * Syndrome logic (Pipeline 1, Layer 3) consumes EvidenceBundle only.
 *
 * @see docs/_internal/incoming/scalability-architecture-plan.md
 * @see docs/_internal/incoming/sendex-study-type-expansion-spec.md
 * @see docs/_internal/incoming/sendex-cross-study-spec.md
 */

// ─── EvidenceBundle ─────────────────────────────────────────
// The formal interface between evidence collection (Layer 2) and
// syndrome logic (Layer 3). In practice, EndpointSummary already
// serves this role — this type alias makes the contract explicit.

import type { EndpointSummary } from "@/lib/derive-summaries";

/**
 * A single endpoint's complete evidence package.
 *
 * EndpointSummary already contains: endpoint identity, domain, direction,
 * effect size, p-value, fold change, pattern, sex breakdown, NOAEL tier,
 * control/treated stats, confidence assessment, and qualifier tags.
 *
 * Syndrome logic (detectCrossDomainSyndromes, interpretSyndrome) must
 * consume EvidenceBundle[] — never raw SEND data or UnifiedFinding[].
 */
export type EvidenceBundle = EndpointSummary;

// ─── StudyTypeConfig ────────────────────────────────────────
// Loaded from shared/study-types/*.json at pipeline startup.

export interface StudyTypeConfig {
  /** Schema reference for validation */
  $schema?: string;
  /** Semantic version of this config */
  version: string;
  /** Internal identifier (e.g., "REPEAT_DOSE", "ACUTE") */
  study_type: string;
  /** Human-readable name */
  display_name: string;
  /** Description of what this study type covers */
  description: string;
  /** SEND TS.STYPE values that route to this config */
  ts_stype_values: string[];
  /** SEND domains expected to be present */
  available_domains: string[];
  /** Domains required for syndrome analysis (absence = quality flag) */
  required_domains: string[];
  /** Whether multi-timepoint trajectory analysis applies */
  time_course: boolean;
  /** Statistical unit for this study type */
  statistical_unit: "individual" | "litter";
  /** Statistical comparison mode */
  statistical_mode: "between_group" | "within_animal_crossover";
  /** NOAEL determination type */
  noael_type: "single" | "bifurcated";
  /** Which syndrome groups are evaluated */
  enabled_syndrome_groups: string[];
  /** Which frontend layout to render */
  ui_profile: string;
  /** Standing advisory codes added to output */
  caveats: string[];
}

// ─── SyndromeSummary ────────────────────────────────────────
// Compact syndrome record for StudySummaryRecord (not the full
// SyndromeInterpretation — just what cross-study logic needs).

export interface SyndromeSummary {
  /** Syndrome ID (e.g., "XS01") */
  syndrome_id: string;
  /** Syndrome name */
  name: string;
  /** Certainty level from interpretation */
  certainty: "mechanism_confirmed" | "mechanism_uncertain" | "pattern_only" | "insufficient_data";
  /** Overall severity from interpretation */
  severity: string;
  /** Treatment-relatedness conclusion */
  treatment_relatedness: "treatment_related" | "possibly_related" | "not_related";
  /** Adversity assessment */
  adversity: "adverse" | "non_adverse" | "equivocal";
  /** Primary target organ */
  target_organ: string;
  /** Domains with matched evidence */
  domains_covered: string[];
  /** Affected parameter labels */
  affected_parameters: string[];
  /** NOAEL dose for this syndrome (dose at which NOT present) */
  noael_dose: number | null;
  /** LOAEL dose for this syndrome (dose at which first appears) */
  loael_dose: number | null;
  /** Translational confidence tier */
  translational_tier: "high" | "moderate" | "low" | "insufficient_data";
}

// ─── StudySummaryRecord ─────────────────────────────────────
// Terminal output of the single-study pipeline.
// Cross-study intelligence (Pipeline 2) consumes these ONLY.

export interface StudySummaryRecord {
  /** Schema version for forward compatibility */
  schema_version: "1.0";

  // ── Study identity ──
  study_id: string;
  /** Program/compound this study belongs to (user-assigned) */
  program_id: string | null;

  // ── Study design metadata ──
  species: string;
  strain: string;
  route: string;
  study_type: string;
  duration_weeks: number | null;
  recovery_weeks: number | null;
  dose_levels: number[];
  dose_labels: string[];
  dose_unit: string;
  glp_compliant: boolean;
  sex_population: "BOTH" | "MALE_ONLY" | "FEMALE_ONLY";

  // ── Conclusions from single-study analysis ──

  /** Per-sex NOAEL determination */
  noael_by_sex: Array<{
    sex: string;
    noael_dose_level: number | null;
    noael_dose_value: number | null;
    noael_label: string;
    loael_dose_level: number | null;
    confidence: number;
  }>;

  /** Combined-sex NOAEL (most conservative) */
  combined_noael: {
    dose_level: number | null;
    dose_value: number | null;
    dose_unit: string;
    label: string;
    basis: string;
  } | null;

  /** Ranked target organs with evidence strength */
  target_organs: Array<{
    organ_system: string;
    evidence_score: number;
    n_domains: number;
    domains: string[];
    max_severity: string;
    treatment_related: boolean;
  }>;

  // ── Syndrome summary ──

  /** Detected syndromes with compact interpretation */
  detected_syndromes: SyndromeSummary[];

  // ── Recovery outcomes ──

  /** Recovery status per syndrome/organ */
  recovery_outcomes: Record<string, string>;

  // ── TK data (optional — populated when PC/PP domain available) ──

  /** AUC at NOAEL dose, if TK data available */
  auc_at_noael: number | null;
  /** Cmax at NOAEL dose, if TK data available */
  cmax_at_noael: number | null;
  /** TK data unit (e.g., "ng·h/mL") */
  tk_unit: string | null;

  // ── Study stage (for monitoring watchlist logic) ──

  study_stage: "PLANNED" | "ONGOING" | "SUBMITTED";

  // ── Quality ──

  data_quality_flags: string[];
}

// ─── Program (for cross-study grouping) ─────────────────────

export interface Program {
  program_id: string;
  compound_name: string;
  study_ids: string[];
  /** Optional clinical dose for safety margin computation (Phase 7) */
  clinical_dose?: {
    dose_value: number;
    dose_unit: string;
    route: string;
  } | null;
  /** CAS number or internal compound identifier */
  compound_identifier?: string | null;
}
