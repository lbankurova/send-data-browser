/**
 * Canonical recovery verdict display labels — SLA-18.
 *
 * Harmonizes vocabulary across three recovery systems:
 *   - Backend incidence (incidence_recovery.py): resolved/improving/worsening/persistent/new_in_recovery
 *   - Frontend histopath (recovery-assessment.ts): reversed/reversing/persistent/progressing/anomaly
 *   - Frontend continuous (recovery-verdict.ts): resolved/reversed/reversing/partial/persistent/worsening
 *
 * Each system keeps its own verdict values (embedded in backend JSON and tests),
 * but all renderers use these canonical display labels for consistency.
 */

/** Canonical display label for any recovery verdict string. */
export const RECOVERY_VERDICT_LABEL: Record<string, string> = {
  // Positive outcomes (fully or partially reversed)
  reversed: "Reversed",
  resolved: "Reversed",        // backend incidence synonym → same display label
  reversing: "Reversing",
  improving: "Reversing",      // backend incidence synonym → same display label
  partial: "Partial",          // continuous only (20–50% recovery)

  // Negative outcomes
  persistent: "Persistent",
  progressing: "Worsening",    // histopath synonym → same display label as continuous
  worsening: "Worsening",
  overcorrected: "Overcorrected",

  // Anomalous
  anomaly: "New in recovery",  // histopath synonym → same display label as incidence
  new_in_recovery: "New in recovery",

  // Guard verdicts (no data / insufficient)
  insufficient_n: "Insufficient N",
  not_examined: "Not examined",
  not_assessed: "Not assessed",
  low_power: "Low power",
  not_observed: "Not observed",
  no_data: "No data",
};

/** CSS class for verdict display — shared across all recovery renderers. */
export const RECOVERY_VERDICT_CLASS: Record<string, string> = {
  // Positive
  reversed: "text-foreground",
  resolved: "text-foreground",
  reversing: "text-foreground",
  improving: "text-foreground",
  partial: "text-foreground",

  // Negative — bold to draw attention
  persistent: "text-foreground font-semibold",
  progressing: "text-foreground font-semibold",
  worsening: "text-foreground font-semibold",
  overcorrected: "text-foreground font-semibold",

  // Anomalous — bold
  anomaly: "text-foreground font-semibold",
  new_in_recovery: "text-foreground font-semibold",

  // Guards — muted
  insufficient_n: "text-muted-foreground",
  not_examined: "text-muted-foreground",
  not_assessed: "text-muted-foreground",
  low_power: "text-muted-foreground",
  not_observed: "text-muted-foreground",
  no_data: "text-muted-foreground",
};

/** Color class for incidence recovery verdicts (RecoveryPane uses colored labels). */
export const RECOVERY_VERDICT_COLOR: Record<string, string> = {
  reversed: "text-emerald-700",
  resolved: "text-emerald-700",
  reversing: "text-emerald-600",
  improving: "text-emerald-600",
  partial: "text-amber-600",
  persistent: "text-amber-700",
  progressing: "text-red-700",
  worsening: "text-red-700",
  overcorrected: "text-amber-700",
  anomaly: "text-red-700",
  new_in_recovery: "text-red-700",
  insufficient_n: "text-muted-foreground",
  not_examined: "text-muted-foreground",
  not_assessed: "text-muted-foreground",
  low_power: "text-muted-foreground",
  not_observed: "text-muted-foreground",
  no_data: "text-muted-foreground",
};

/** Look up display label for any verdict string. Falls back to titleCase. */
export function getVerdictLabel(verdict: string): string {
  return RECOVERY_VERDICT_LABEL[verdict] ?? verdict.charAt(0).toUpperCase() + verdict.slice(1).replace(/_/g, " ");
}
