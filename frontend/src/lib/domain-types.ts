/**
 * Domain effect-type registry — canonical definitions for SEND domain classification.
 *
 * Resolves SLA-17 (duplicate INCIDENCE_DOMAINS) and SLA-19 (max_effect_size overloading).
 * All consumers should use typed accessors instead of reading maxEffectSize directly.
 */

/** Domains with binary/proportion incidence data (no magnitude scalar). */
export const INCIDENCE_DOMAINS = new Set(["MA", "CL", "TF", "DS"]);

// Add a domain here if and only if it produces a continuous effect size scalar
// (Cohen's d, Hedges' g, or equivalent). Domains absent from this set are
// assumed to lack a magnitude scalar — signal weights, confidence thresholds,
// and volcano filtering all depend on this assumption. When in doubt, omit
// rather than include: the failure mode of a missing entry is "no effect size
// displayed," which is visible and correctable.
/** Domains where max_effect_size represents Cohen's d / Hedges' g. */
export const CONTINUOUS_DOMAINS = new Set(["LB", "BW", "OM", "EG", "VS", "BG", "FW"]);

/** Extract Cohen's d only for continuous domains. Returns null for incidence/ordinal. */
export function getEffectSize(f: { data_type?: string; max_effect_size?: number | null }): number | null {
  return f.data_type === "continuous" ? (f.max_effect_size ?? null) : null;
}

/** Extract Cohen's d from EndpointSummary-shaped objects (uses domain instead of data_type). */
export function getEffectSizeByDomain(f: { domain?: string; maxEffectSize?: number | null }): number | null {
  const domain = f.domain ?? "";
  return CONTINUOUS_DOMAINS.has(domain) ? (f.maxEffectSize ?? null) : null;
}

/** Extract INHAND avg severity grade (1-5) for MI only. Returns null for all others. */
export function getSeverityGrade(f: { domain?: string; max_effect_size?: number | null }): number | null {
  return f.domain === "MI" ? (f.max_effect_size ?? null) : null;
}

/** Extract INHAND avg severity grade from EndpointSummary-shaped objects. */
export function getSeverityGradeFromSummary(f: { domain?: string; maxEffectSize?: number | null }): number | null {
  return f.domain === "MI" ? (f.maxEffectSize ?? null) : null;
}

/** Return human-readable label for the effect-size metric of a given domain. */
export function effectSizeLabel(domain: string): string {
  if (domain === "MI") return "avg severity";
  if (INCIDENCE_DOMAINS.has(domain)) return "odds ratio";
  // Default effect size method is Hedges' g (small-sample-corrected Cohen's d).
  // The cohens_d field name is a legacy misnomer — values are Hedges' g.
  // For settings-aware labels, use getEffectSizeLabel/getEffectSizeSymbol
  // from stat-method-transforms.ts instead.
  return "|g|";
}
