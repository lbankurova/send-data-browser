/**
 * Recovery verdict map builder for FindingsTable.
 *
 * Produces a Map<findingId, FindingVerdictInfo> that gives the worst-case
 * recovery verdict across dose groups for each finding. Used by the Recovery
 * column in FindingsTable to show verdict badges.
 *
 * Logic mirrors RecoveryPane's verdict computation but operates in bulk
 * across all findings, avoiding per-row hooks.
 */

import { classifyContinuousRecovery } from "@/lib/recovery-verdict";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";
import type { UnifiedFinding } from "@/types/analysis";
import type { RecoveryOverrideAnnotation } from "@/hooks/useRecoveryOverrideActions";

// ── Types ────────────────────────────────────────────────────

export interface FindingVerdictInfo {
  /** Worst-case auto verdict across dose groups. */
  verdict: string;
  /** Whether an override annotation exists for this finding. */
  isOverridden: boolean;
  /** Override verdict if overridden, else auto verdict. */
  effectiveVerdict: string;
}

// ── Verdict priority (same as RecoveryPane) ──────────────────
// Higher index = more concerning.

export const VERDICT_PRIORITY: Record<string, number> = {
  not_assessed: 0,
  reversed: 1,
  overcorrected: 2,
  partially_reversed: 3,
  persistent: 4,
  progressing: 5,
  anomaly: 5,
};

function verdictPriority(v: string): number {
  return VERDICT_PRIORITY[v] ?? 0;
}

// ── Main builder ─────────────────────────────────────────────

export function buildFindingVerdictMap(
  findings: UnifiedFinding[],
  recoveryData: RecoveryComparisonResponse | undefined,
  overrides: Record<string, RecoveryOverrideAnnotation> | undefined,
): Map<string, FindingVerdictInfo> {
  const result = new Map<string, FindingVerdictInfo>();

  if (!recoveryData?.available) return result;

  for (const finding of findings) {
    let worstVerdict: string | null = null;

    if (finding.data_type === "continuous") {
      worstVerdict = computeContinuousVerdict(finding, recoveryData);
    } else {
      worstVerdict = computeIncidenceVerdict(finding, recoveryData);
    }

    if (worstVerdict == null) continue;

    const override = overrides?.[finding.id];
    const isOverridden = !!override;
    const effectiveVerdict = isOverridden ? override.verdict : worstVerdict;

    result.set(finding.id, {
      verdict: worstVerdict,
      isOverridden,
      effectiveVerdict,
    });
  }

  return result;
}

// ── Continuous verdict computation ───────────────────────────

function computeContinuousVerdict(
  finding: UnifiedFinding,
  recoveryData: RecoveryComparisonResponse,
): string | null {
  // Match rows by test_code, or by specimen for OM domain
  const matched = recoveryData.rows.filter((r) => {
    if (finding.specimen) {
      return r.test_code.toUpperCase() === finding.specimen.toUpperCase();
    }
    return r.test_code.toUpperCase() === finding.test_code.toUpperCase();
  });

  // Filter by sex
  const sexFiltered = matched.filter((r) => r.sex === finding.sex);

  // Keep only max-day row per dose_level (terminal recovery day)
  const best = new Map<number, (typeof sexFiltered)[number]>();
  for (const r of sexFiltered) {
    const prev = best.get(r.dose_level);
    if (!prev || (r.day ?? 0) > (prev.day ?? 0)) {
      best.set(r.dose_level, r);
    }
  }
  const terminalRows = [...best.values()];

  // Skip rows with insufficient_n or no_concurrent_control, then classify
  let worstVerdict: string | null = null;

  for (const r of terminalRows) {
    if (r.insufficient_n || r.no_concurrent_control) continue;

    const { verdict } = classifyContinuousRecovery(
      r.terminal_effect_same_arm ?? r.terminal_effect,
      r.effect_size,
      r.treated_n,
      r.control_n,
    );

    if (worstVerdict == null || verdictPriority(verdict) > verdictPriority(worstVerdict)) {
      worstVerdict = verdict;
    }
  }

  return worstVerdict;
}

// ── Incidence verdict computation ────────────────────────────

function computeIncidenceVerdict(
  finding: UnifiedFinding,
  recoveryData: RecoveryComparisonResponse,
): string | null {
  const incidenceRows = recoveryData.incidence_rows;
  if (!incidenceRows?.length) return null;

  const matched = incidenceRows.filter((r) => {
    if (r.domain !== finding.domain) return false;
    if (r.finding.toUpperCase() !== finding.finding.toUpperCase()) return false;
    // Match by specimen if finding has one
    if (finding.specimen) {
      if (r.specimen?.toUpperCase() !== finding.specimen.toUpperCase()) return false;
    }
    if (r.sex !== finding.sex) return false;
    return true;
  });

  let worstVerdict: string | null = null;

  for (const r of matched) {
    if (r.verdict == null) continue;
    if (worstVerdict == null || verdictPriority(r.verdict) > verdictPriority(worstVerdict)) {
      worstVerdict = r.verdict;
    }
  }

  return worstVerdict;
}
