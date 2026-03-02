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
  | "worsening";

export interface ContinuousVerdictResult {
  verdict: ContinuousVerdictType;
  /** % of terminal effect that resolved. Negative = worsened. */
  pctRecovered: number | null;
}

export function classifyContinuousRecovery(
  terminalG: number | null,
  recoveryG: number | null,
): ContinuousVerdictResult {
  // Near-zero terminal: classify based on recovery alone (delayed onset detection)
  if (terminalG == null || Math.abs(terminalG) < 0.01) {
    if (recoveryG == null || Math.abs(recoveryG) < 0.5) {
      return { verdict: "resolved", pctRecovered: null };
    }
    return { verdict: "worsening", pctRecovered: null };
  }

  if (recoveryG == null) {
    return { verdict: "resolved", pctRecovered: null };
  }

  // Overcorrected: effect reversed direction past control (§4.3)
  if (Math.sign(terminalG) !== Math.sign(recoveryG) && Math.abs(recoveryG) >= 0.5) {
    return { verdict: "overcorrected", pctRecovered: null };
  }

  const pct = (Math.abs(terminalG) - Math.abs(recoveryG)) / Math.abs(terminalG) * 100;

  // Recovery effect below trivial threshold (|g| < 0.5)
  if (Math.abs(recoveryG) < 0.5) {
    // Effect grew but both below 0.5 — no meaningful effect at either timepoint
    if (pct < 0) return { verdict: "resolved", pctRecovered: null };
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
};

/** Format |pct| for display, capping extreme values. */
export function formatPctRecovered(pct: number): string {
  if (Math.abs(pct) > 999) return ">10\u00d7";
  return `${Math.abs(Math.round(pct))}%`;
}

export function formatGAbs(g: number): string {
  return Math.abs(g).toFixed(2);
}
