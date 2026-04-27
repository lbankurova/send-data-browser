/**
 * Per-study syndrome rollup with dose x phase breakdown.
 * Source: backend/generator/syndrome_rollup.py.
 * Spec: docs/_internal/incoming/gap-288-stage2-noael-synthesis-spec.md Section 3.2.
 */

/** Confidence-bucket counts per syndrome row. */
export interface SyndromeConfidenceDistribution {
  HIGH: number;
  MODERATE: number;
  LOW: number;
}

/** One dose x phase cell within a syndrome row. */
export interface SyndromeDosePhaseCell {
  n_subjects: number;
  n_evaluable: number;
}

/** Modifier flags surfaced as the synthesis page's per-syndrome notes. */
export type SyndromeModifierNote =
  | "sets_loael"
  | "mortality_cap"
  | "likely_background"
  | "persists_in_recovery";

/** LOAEL role assigned to a syndrome row by the rollup. */
export type SyndromeLoaelRole = "sets-loael" | "drives-loael" | null;

/** A single syndrome's per-organ rollup entry. */
export interface SyndromeRollupRow {
  syndrome_id: string;
  syndrome_name: string;
  /** Primary organ_system bucket. Multi-organ rows also surface in `cross_organ_syndromes`. */
  organ_system: string;
  /** Distinct subject count across all dose x phase cells (full matches only). */
  n_subjects_total: number;
  confidence_distribution: SyndromeConfidenceDistribution;
  /** Cells keyed `<dose>:<phase>` (e.g. `"200:Main Study"`). Sorted by dose ascending. */
  by_dose_phase: Record<string, SyndromeDosePhaseCell>;
  loael_role: SyndromeLoaelRole;
  modifier_notes: SyndromeModifierNote[];
}

/** Cross-organ row -- carries the full organ_systems list. */
export interface CrossOrganSyndromeRow extends SyndromeRollupRow {
  organ_systems: string[];
}

export interface SyndromeRollupMeta {
  generated: string;
  syndrome_definitions_version: string;
  study_id: string | null;
  n_syndromes_detected: number;
  n_organs_with_match: number;
}

export interface SyndromeRollup {
  meta: SyndromeRollupMeta;
  cross_organ_syndromes: CrossOrganSyndromeRow[];
  /** Keyed by organ_system (e.g. `"hepatic"`). Each list sorted by n_subjects_total desc. */
  by_organ: Record<string, SyndromeRollupRow[]>;
}
