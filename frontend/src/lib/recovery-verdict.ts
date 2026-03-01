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
  | "resolved"
  | "reversed"
  | "overcorrected"
  | "reversing"
  | "partial"
  | "persistent"
  | "worsening"
  | "below-threshold";

export interface ContinuousVerdictResult {
  verdict: ContinuousVerdictType;
  /** % of terminal effect that resolved. Negative = worsened. */
  pctRecovered: number | null;
}

export function classifyContinuousRecovery(
  terminalG: number | null,
  recoveryG: number | null,
): ContinuousVerdictResult {
  // If dosing-phase effect was too small, recovery assessment is not meaningful
  if (terminalG == null || Math.abs(terminalG) < 0.5) {
    return { verdict: "below-threshold", pctRecovered: null };
  }
  if (recoveryG == null) {
    return { verdict: "below-threshold", pctRecovered: null };
  }

  // Overcorrected: effect reversed direction past control (§4.3)
  if (Math.sign(terminalG) !== Math.sign(recoveryG) && Math.abs(recoveryG) >= 0.5) {
    return { verdict: "overcorrected", pctRecovered: null };
  }

  const pct = (Math.abs(terminalG) - Math.abs(recoveryG)) / Math.abs(terminalG) * 100;

  // Resolved: recovery effect below trivial threshold (|g| < 0.5) AND ≥80% recovered
  if (Math.abs(recoveryG) < 0.5) {
    return { verdict: pct >= 80 ? "resolved" : "reversed", pctRecovered: pct };
  }

  if (pct < 0) return { verdict: "worsening", pctRecovered: pct };
  if (pct >= 80) return { verdict: "reversed", pctRecovered: pct };
  if (pct >= 50) return { verdict: "reversing", pctRecovered: pct };
  if (pct >= 20) return { verdict: "partial", pctRecovered: pct };
  return { verdict: "persistent", pctRecovered: pct };
}

export const CONT_VERDICT_LABEL: Record<ContinuousVerdictType, string> = {
  resolved: "Resolved",
  reversed: "Reversed",
  overcorrected: "Overcorrected",
  reversing: "Reversing",
  partial: "Partial",
  persistent: "Persistent",
  worsening: "Worsening",
  "below-threshold": "Not assessed",
};

export function formatGAbs(g: number): string {
  return Math.abs(g).toFixed(2);
}
