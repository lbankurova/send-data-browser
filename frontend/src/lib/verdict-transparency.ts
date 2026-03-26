/**
 * Verdict transparency formatters.
 *
 * Pure functions that produce human-readable explanations of
 * how the auto-verdict was determined, including the numeric
 * values and threshold boundaries used.
 */

import { formatGAbs } from "@/lib/recovery-verdict";

// ── Continuous transparency ─────────────────────────────────

/**
 * Format a one-line transparency string for a continuous recovery verdict.
 *
 * Shows the effect-size trajectory and the threshold that determined
 * the classification:
 *   "g 1.23 -> 0.16, 87% recovered (>=80%)"
 */
export function formatContinuousTransparency(
  terminalG: number | null,
  recoveryG: number | null,
  pctRecovered: number | null,
  verdict: string,
): string {
  // Both null
  if (terminalG == null && recoveryG == null) {
    return "No effect size data available";
  }

  // Null terminal
  if (terminalG == null) {
    return "Terminal effect size not available";
  }

  // Near-zero terminal
  if (Math.abs(terminalG) < 0.01) {
    return "No effect at terminal (|g| < 0.01)";
  }

  // Null recovery
  if (recoveryG == null) {
    return `g ${formatGAbs(terminalG)} at terminal, recovery not assessed`;
  }

  const tAbs = formatGAbs(terminalG);
  const rAbs = formatGAbs(recoveryG);

  switch (verdict) {
    case "reversed":
      if (pctRecovered != null) {
        return `g ${tAbs} \u2192 ${rAbs}, ${Math.round(pctRecovered)}% recovered (\u226580%)`;
      }
      return `g ${tAbs} \u2192 ${rAbs}, reversed`;

    case "partially_reversed":
      if (pctRecovered != null) {
        return `g ${tAbs} \u2192 ${rAbs}, ${Math.round(pctRecovered)}% recovered (20\u201380%)`;
      }
      return `g ${tAbs} \u2192 ${rAbs}, partially reversed`;

    case "persistent":
      if (pctRecovered != null) {
        return `g ${tAbs} \u2192 ${rAbs}, ${Math.round(pctRecovered)}% recovered (<20%)`;
      }
      return `g ${tAbs} \u2192 ${rAbs}, persistent`;

    case "progressing":
      if (pctRecovered != null) {
        return `g ${tAbs} \u2192 ${rAbs}, worsened by ${Math.abs(Math.round(pctRecovered))}%`;
      }
      return `g ${tAbs} \u2192 ${rAbs}, worsened`;

    case "overcorrected":
      return `g ${tAbs} \u2192 ${rAbs}, reversed direction past control`;

    case "not_assessed":
      return `g ${tAbs} at terminal, recovery not assessed`;

    default:
      return `g ${tAbs} \u2192 ${rAbs}`;
  }
}

// ── Incidence transparency ──────────────────────────────────

export interface IncidenceTransparencyRow {
  main_affected: number;
  main_n: number;
  recovery_affected: number;
  recovery_n: number;
  verdict: string | null;
  confidence?: string | null;
  main_avg_severity?: number | null;
  recovery_avg_severity?: number | null;
  main_examined?: number;
  recovery_examined?: number;
}

/**
 * Format a one-line transparency string for an incidence recovery verdict.
 *
 * Shows the incidence trajectory, ratio, and the threshold that
 * determined the classification:
 *   "Incidence 3/5 -> 0/5 (threshold: ratio <= 0.2)"
 */
export function formatIncidenceTransparency(row: IncidenceTransparencyRow): string {
  const { verdict } = row;

  // Guard verdicts
  if (verdict === "not_examined") {
    return "Recovery arm not examined";
  }
  if (verdict === "insufficient_n") {
    return "N < 2 in recovery arm";
  }
  if (verdict === "not_observed") {
    return "Finding not present at terminal";
  }
  if (verdict === "low_power") {
    return "N too small for reliable comparison";
  }

  // Null/unknown verdict
  if (!verdict) {
    return "Verdict not computed";
  }

  // Compute incidence strings
  const mainExamined = row.main_examined ?? row.main_n;
  const recoveryExamined = row.recovery_examined ?? row.recovery_n;
  const mainInc = `${row.main_affected}/${mainExamined}`;
  const recInc = `${row.recovery_affected}/${recoveryExamined}`;

  // Anomaly: not present at terminal, appeared in recovery
  if (verdict === "anomaly") {
    return `Not present at terminal, appeared in recovery (${mainInc} \u2192 ${recInc})`;
  }

  // Compute ratio for ratio-based verdicts
  const mainRate = mainExamined > 0 ? row.main_affected / mainExamined : 0;
  const recoveryRate = recoveryExamined > 0 ? row.recovery_affected / recoveryExamined : 0;
  const ratio = mainRate > 0 ? recoveryRate / mainRate : 0;
  const ratioStr = ratio.toFixed(2);

  // Severity context suffix
  let severitySuffix = "";
  if (
    row.main_avg_severity != null &&
    row.recovery_avg_severity != null &&
    Math.abs(row.main_avg_severity - row.recovery_avg_severity) >= 0.3
  ) {
    severitySuffix = ` (severity ${row.main_avg_severity.toFixed(1)} \u2192 ${row.recovery_avg_severity.toFixed(1)})`;
  }

  switch (verdict) {
    case "reversed":
      return `Incidence ${mainInc} \u2192 ${recInc} (ratio ${ratioStr}, threshold: \u22640.2)${severitySuffix}`;

    case "partially_reversed":
      return `Incidence ${mainInc} \u2192 ${recInc} (ratio ${ratioStr}, threshold: \u22640.5)${severitySuffix}`;

    case "persistent":
      return `Incidence ${mainInc} \u2192 ${recInc} (ratio ${ratioStr}, threshold: >0.5)${severitySuffix}`;

    case "progressing":
      return `Incidence ${mainInc} \u2192 ${recInc} (ratio ${ratioStr}, threshold: >1.1)${severitySuffix}`;

    default:
      return `Incidence ${mainInc} \u2192 ${recInc}${severitySuffix}`;
  }
}
