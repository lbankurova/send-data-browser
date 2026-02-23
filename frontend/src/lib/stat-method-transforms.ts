/**
 * Pure statistical method transforms for live method switching.
 *
 * Effect size and multiplicity transforms operate on UnifiedFinding[] arrays,
 * matching the applyScheduledFilter() pattern in useFindingsAnalyticsLocal.ts.
 * All downstream derivations (endpoints, syndromes, signal scores, NOAEL)
 * automatically use recomputed values — zero consumer changes needed.
 */

import type { UnifiedFinding, PairwiseResult } from "@/types/analysis";

// ── Types ────────────────────────────────────────────────────

export type EffectSizeMethod = "hedges-g" | "cohens-d" | "glass-delta";
export type MultiplicityMethod = "dunnett-fwer" | "bonferroni";

// ── Effect Size Computation ──────────────────────────────────

/**
 * Compute effect size for a single treated vs control comparison.
 * Returns null if inputs are insufficient (n < 2, sd = 0).
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

/**
 * Apply an effect size method to a findings array.
 *
 * Fast path: "hedges-g" returns input by reference (backend default, no-op).
 * For other methods: recomputes pairwise[].cohens_d and max_effect_size
 * from group_stats for continuous findings. Incidence findings pass through.
 */
export function applyEffectSizeMethod(
  findings: UnifiedFinding[],
  method: EffectSizeMethod,
): UnifiedFinding[] {
  // Fast path — hedges-g is the backend default, no recomputation needed
  if (method === "hedges-g") return findings;

  return findings.map((f) => {
    // Incidence findings have no effect size — pass through
    if (f.data_type !== "continuous") return f;

    // Find control stats (dose_level === 0)
    const controlStat = f.group_stats.find((gs) => gs.dose_level === 0);
    if (!controlStat || controlStat.mean == null || controlStat.sd == null) {
      return f;
    }

    // Recompute pairwise effect sizes
    const newPairwise: PairwiseResult[] = f.pairwise.map((pw) => {
      const treatedStat = f.group_stats.find(
        (gs) => gs.dose_level === pw.dose_level,
      );
      if (!treatedStat) return pw;

      const newD = computeEffectSize(
        method,
        controlStat.mean,
        controlStat.sd,
        controlStat.n,
        treatedStat.mean,
        treatedStat.sd,
        treatedStat.n,
      );

      return { ...pw, cohens_d: newD };
    });

    // Recompute max_effect_size preserving sign direction
    const effectSizes = newPairwise
      .map((pw) => pw.cohens_d)
      .filter((d): d is number => d != null);

    let newMaxEffect = f.max_effect_size;
    if (effectSizes.length > 0) {
      // Pick the value with the largest absolute magnitude, preserving sign
      newMaxEffect = effectSizes.reduce((best, cur) =>
        Math.abs(cur) > Math.abs(best) ? cur : best,
      );
    }

    return {
      ...f,
      pairwise: newPairwise,
      max_effect_size: newMaxEffect,
    };
  });
}

// ── Multiplicity Correction ──────────────────────────────────

/**
 * Apply a multiplicity correction method to a findings array.
 *
 * "dunnett-fwer": no-op (return by reference, backend default).
 * "bonferroni": for each continuous finding, apply min(p_value_welch × k, 1.0)
 * where k = number of treated groups. Recomputes p_value_adj and min_p_adj.
 * Incidence findings unchanged.
 *
 * Falls back gracefully if p_value_welch is not present in the data.
 */
export function applyMultiplicityMethod(
  findings: UnifiedFinding[],
  method: MultiplicityMethod,
): UnifiedFinding[] {
  if (method === "dunnett-fwer") return findings;

  return findings.map((f) => {
    if (f.data_type !== "continuous") return f;

    // Count treated groups (pairwise entries)
    const nComparisons = f.pairwise.length;
    if (nComparisons === 0) return f;

    // Check if any pairwise has Welch p-values
    const hasWelch = f.pairwise.some((pw) => pw.p_value_welch != null);
    if (!hasWelch) return f;

    const newPairwise: PairwiseResult[] = f.pairwise.map((pw) => {
      const welchP = pw.p_value_welch;
      if (welchP == null) return pw;

      const corrected = Math.min(welchP * nComparisons, 1.0);
      return {
        ...pw,
        p_value_adj: corrected,
        // Keep raw p_value as the Welch uncorrected value
        p_value: welchP,
      };
    });

    // Recompute min_p_adj
    const adjPValues = newPairwise
      .map((pw) => pw.p_value_adj)
      .filter((p): p is number => p != null);
    const newMinPAdj =
      adjPValues.length > 0 ? Math.min(...adjPValues) : f.min_p_adj;

    return {
      ...f,
      pairwise: newPairwise,
      min_p_adj: newMinPAdj,
    };
  });
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
