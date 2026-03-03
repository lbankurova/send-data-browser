/**
 * Statistical method types, labels, and utility functions.
 *
 * Phase 2b: Effect size and multiplicity transforms are now applied
 * server-side by the parameterized pipeline. This module retains:
 * - Type exports (EffectSizeMethod, MultiplicityMethod)
 * - Label/symbol maps for UI display
 * - hasWelchPValues() for UI dropdown enablement
 * - computeEffectSize() for organ weight normalization computations
 */

import type { UnifiedFinding } from "@/types/analysis";

// ── Types ────────────────────────────────────────────────────

export type EffectSizeMethod = "hedges-g" | "cohens-d" | "glass-delta";
export type MultiplicityMethod = "dunnett-fwer" | "bonferroni";

// ── Effect Size Computation ──────────────────────────────────

// @field FIELD-49 — effect size (transformed by selected method)
/**
 * Compute effect size for a single treated vs control comparison.
 * Returns null if inputs are insufficient (n < 2, sd = 0).
 *
 * Used by organ weight normalization (computeStudyNormalization).
 */
export function computeEffectSize(
  method: EffectSizeMethod,
  controlMean: number | null,
  controlSd: number | null,
  controlN: number,
  treatedMean: number | null,
  treatedSd: number | null,
  treatedN: number,
): number | null {
  if (
    controlMean == null || controlSd == null ||
    treatedMean == null || treatedSd == null ||
    controlN < 2 || treatedN < 2
  ) {
    return null;
  }

  const diff = treatedMean - controlMean;

  if (method === "glass-delta") {
    // Glass's Δ: uses control SD only
    if (controlSd === 0) return null;
    return diff / controlSd;
  }

  // Pooled SD (used by both Cohen's d and Hedges' g)
  const pooledVar =
    ((controlN - 1) * controlSd * controlSd +
      (treatedN - 1) * treatedSd * treatedSd) /
    (controlN + treatedN - 2);
  const pooledSd = Math.sqrt(pooledVar);
  if (pooledSd === 0) return null;

  const d = diff / pooledSd;

  if (method === "cohens-d") {
    return d;
  }

  // Hedges' g: bias-corrected Cohen's d
  const df = controlN + treatedN - 2;
  const j = 1 - 3 / (4 * df - 1);
  return d * j;
}

// ── Labels ───────────────────────────────────────────────────

const EFFECT_SIZE_LABELS: Record<EffectSizeMethod, string> = {
  "hedges-g": "Hedges\u2019 g",
  "cohens-d": "Cohen\u2019s d",
  "glass-delta": "Glass\u2019s \u0394",
};

const EFFECT_SIZE_SYMBOLS: Record<EffectSizeMethod, string> = {
  "hedges-g": "g",
  "cohens-d": "d",
  "glass-delta": "\u0394",
};

export function getEffectSizeLabel(method: EffectSizeMethod): string {
  return EFFECT_SIZE_LABELS[method];
}

export function getEffectSizeSymbol(method: EffectSizeMethod): string {
  return EFFECT_SIZE_SYMBOLS[method];
}

// ── Utility: Detect Welch p-value availability ───────────────

/**
 * Check if any finding in the dataset has p_value_welch populated.
 * Used to enable/disable the Bonferroni dropdown.
 */
export function hasWelchPValues(findings: UnifiedFinding[]): boolean {
  return findings.some(
    (f) =>
      f.data_type === "continuous" &&
      f.pairwise.some((pw) => pw.p_value_welch != null),
  );
}
