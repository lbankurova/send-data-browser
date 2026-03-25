/**
 * Continuous recovery verdict classification.
 *
 * Uses terminal effect (end-of-dosing) as denominator, consistent
 * with regulatory convention for repeat-dose recovery assessment.
 * Peak effect surfaced as annotation when materially different.
 *
 * Extracted from RecoveryPane so the dumbbell chart can reuse it.
 */

export type ContinuousVerdictType =
  | "reversed"
  | "partially_reversed"
  | "overcorrected"
  | "persistent"
  | "progressing"
  | "not_assessed"
  // ── Transition aliases (kept until all consumers updated) ──
  | "resolved"
  | "reversing"
  | "partial"
  | "worsening";

/** Minimum group size for adequate statistical confidence in Hedges' g. */
const MIN_ADEQUATE_N = 5;

export interface ContinuousVerdictResult {
  verdict: ContinuousVerdictType;
  /** % of terminal effect that resolved. Negative = worsened. */
  pctRecovered: number | null;
  /** Statistical confidence based on group sizes. Low when n < 5 in either arm. */
  confidence?: "adequate" | "low";
}

export function classifyContinuousRecovery(
  terminalG: number | null,
  recoveryG: number | null,
  treatedN?: number | null,
  controlN?: number | null,
): ContinuousVerdictResult {
  // Confidence: low when either arm has n < 5 (wide CI on Hedges' g)
  const confidence: "adequate" | "low" | undefined =
    (treatedN != null || controlN != null)
      ? ((treatedN != null && treatedN < MIN_ADEQUATE_N) || (controlN != null && controlN < MIN_ADEQUATE_N)
        ? "low"
        : "adequate")
      : undefined;

  // Near-zero terminal: classify based on recovery alone (delayed onset detection)
  if (terminalG == null || Math.abs(terminalG) < 0.01) {
    if (recoveryG == null || Math.abs(recoveryG) < 0.5) {
      return { verdict: "reversed", pctRecovered: null, confidence };
    }
    return { verdict: "progressing", pctRecovered: null, confidence };
  }

  if (recoveryG == null) {
    return { verdict: "not_assessed", pctRecovered: null, confidence };
  }

  // Overcorrected: effect reversed direction past control (§4.3)
  if (Math.sign(terminalG) !== Math.sign(recoveryG) && Math.abs(recoveryG) >= 0.5) {
    return { verdict: "overcorrected", pctRecovered: null, confidence };
  }

  const pct = (Math.abs(terminalG) - Math.abs(recoveryG)) / Math.abs(terminalG) * 100;

  // Recovery effect below trivial threshold (|g| < 0.5)
  if (Math.abs(recoveryG) < 0.5) {
    // Sign flip with sub-threshold residual: the terminal effect was marginal and
    // the parameter crossed zero. The residual is trivial — classify as reversed
    // (BUG-21: avoids misleading verdict when cross-arm control baseline shift
    // inflates terminal g).
    if (Math.sign(terminalG) !== Math.sign(recoveryG)) {
      return { verdict: "reversed", pctRecovered: null, confidence };
    }
    // Effect grew but both below 0.5 — no meaningful effect at either timepoint
    if (pct < 0) return { verdict: "reversed", pctRecovered: null, confidence };
    return { verdict: "reversed", pctRecovered: pct, confidence };
  }

  if (pct < 0) return { verdict: "progressing", pctRecovered: pct, confidence };
  if (pct >= 80) return { verdict: "reversed", pctRecovered: pct, confidence };
  // Keep the 50%/20% threshold branching — pctRecovered carries the precision (decision §7.2)
  if (pct >= 50) return { verdict: "partially_reversed", pctRecovered: pct, confidence };
  if (pct >= 20) return { verdict: "partially_reversed", pctRecovered: pct, confidence };
  return { verdict: "persistent", pctRecovered: pct, confidence };
}

export const CONT_VERDICT_LABEL: Record<ContinuousVerdictType, string> = {
  reversed: "Reversed",
  partially_reversed: "Partially reversed",
  overcorrected: "Reversed (rebound)",
  persistent: "Persistent",
  progressing: "Progressing",
  not_assessed: "Not assessed",
  // Transition aliases
  resolved: "Reversed",
  reversing: "Partially reversed",
  partial: "Partially reversed",
  worsening: "Progressing",
};

/** Format |pct| for display, capping extreme values. */
export function formatPctRecovered(pct: number): string {
  if (Math.abs(pct) > 999) return ">10\u00d7";
  return `${Math.abs(Math.round(pct))}%`;
}

export function formatGAbs(g: number): string {
  return Math.abs(g).toFixed(2);
}

/** Signed g for table display: "+0.78" / "-0.45" / "0.00". */
export function formatGSigned(g: number): string {
  if (Math.abs(g) < 0.005) return "0.00";
  return g > 0 ? `+${g.toFixed(2)}` : g.toFixed(2);
}
