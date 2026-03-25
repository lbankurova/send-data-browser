/**
 * Canonical recovery verdict display labels — SLA-18.
 *
 * Unified vocabulary across all recovery systems:
 *   - Backend incidence (incidence_recovery.py): reversed/partially_reversed/persistent/progressing/anomaly
 *   - Frontend histopath (recovery-assessment.ts): reversed/partially_reversed/persistent/progressing/anomaly
 *   - Frontend continuous (recovery-verdict.ts): reversed/partially_reversed/persistent/progressing/overcorrected
 *
 * All systems now emit canonical verdict values. Old values kept as aliases
 * for backward compatibility with cached backend responses during transition.
 */

/** Canonical display label for any recovery verdict string. */
export const RECOVERY_VERDICT_LABEL: Record<string, string> = {
  // Canonical values
  reversed: "Reversed",
  partially_reversed: "Partially reversed",
  persistent: "Persistent",
  progressing: "Progressing",
  overcorrected: "Overcorrected",
  anomaly: "New in recovery",

  // Guard verdicts
  insufficient_n: "Insufficient N",
  not_examined: "Not examined",
  not_assessed: "Not assessed",
  low_power: "Low power",
  not_observed: "Not observed",
  no_data: "No data",

  // ── Transition aliases (old values from cached backend JSON) ──
  resolved: "Reversed",
  reversing: "Partially reversed",
  improving: "Partially reversed",
  partial: "Partially reversed",
  worsening: "Progressing",
  new_in_recovery: "New in recovery",
};

/** CSS class for verdict display — shared across all recovery renderers. */
export const RECOVERY_VERDICT_CLASS: Record<string, string> = {
  // Positive
  reversed: "text-foreground",
  partially_reversed: "text-foreground",

  // Negative — bold to draw attention
  persistent: "text-foreground font-semibold",
  progressing: "text-foreground font-semibold",
  overcorrected: "text-foreground font-semibold",

  // Anomalous — bold
  anomaly: "text-foreground font-semibold",

  // Guards — muted
  insufficient_n: "text-muted-foreground",
  not_examined: "text-muted-foreground",
  not_assessed: "text-muted-foreground",
  low_power: "text-muted-foreground",
  not_observed: "text-muted-foreground",
  no_data: "text-muted-foreground",

  // ── Transition aliases ──
  resolved: "text-foreground",
  reversing: "text-foreground",
  improving: "text-foreground",
  partial: "text-foreground",
  worsening: "text-foreground font-semibold",
  new_in_recovery: "text-foreground font-semibold",
};

/** Color class for incidence recovery verdicts (RecoveryPane uses colored labels). */
export const RECOVERY_VERDICT_COLOR: Record<string, string> = {
  // Canonical
  reversed: "text-emerald-700",
  partially_reversed: "text-emerald-600",
  persistent: "text-amber-700",
  progressing: "text-red-700",
  overcorrected: "text-amber-700",
  anomaly: "text-red-700",

  // Guards
  insufficient_n: "text-muted-foreground",
  not_examined: "text-muted-foreground",
  not_assessed: "text-muted-foreground",
  low_power: "text-muted-foreground",
  not_observed: "text-muted-foreground",
  no_data: "text-muted-foreground",

  // ── Transition aliases ──
  resolved: "text-emerald-700",
  reversing: "text-emerald-600",
  improving: "text-emerald-600",
  partial: "text-amber-600",
  worsening: "text-red-700",
  new_in_recovery: "text-red-700",
};

/** Look up display label for any verdict string. Falls back to titleCase. */
export function getVerdictLabel(verdict: string): string {
  return RECOVERY_VERDICT_LABEL[verdict] ?? verdict.charAt(0).toUpperCase() + verdict.slice(1).replace(/_/g, " ");
}
