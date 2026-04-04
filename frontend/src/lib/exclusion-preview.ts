/**
 * Client-side preview engine for animal exclusion "what-if" analysis.
 *
 * Computes approximate metrics (|g|, gLower, group means/Ns) after filtering
 * out excluded subjects. Consumed by StripPlotChart (stats overlay) and
 * LooSensitivityPane (impact preview table).
 *
 * Does NOT compute per-subject LOO ratios — those come from the backend
 * (single source of truth for statistics).
 *
 * Variance estimator: pooled SD with Hedges' correction factor,
 * matching backend compute_effect_size(). For endpoints with domain-specific
 * preprocessing (log transform, ANCOVA for BW-confounded OM), the preview
 * may diverge from backend values — this is documented in the UI tooltip.
 */

import { hedgesGFromStats } from "@/lib/organ-weight-normalization";
import { computeGLower } from "@/lib/g-lower";

export interface ExclusionPreview {
  g: number | null;
  gLower: number | null;
  meanCtrl: number;
  meanTreated: number;
  nCtrl: number;
  nTreated: number;
}

interface ValueWithId {
  usubjid: string;
  value: number;
}

function groupStats(values: ValueWithId[]): { mean: number; sd: number; n: number } {
  const n = values.length;
  if (n === 0) return { mean: 0, sd: 0, n: 0 };
  const sum = values.reduce((a, v) => a + v.value, 0);
  const mean = sum / n;
  if (n === 1) return { mean, sd: 0, n: 1 };
  const variance = values.reduce((a, v) => a + (v.value - mean) ** 2, 0) / (n - 1);
  return { mean, sd: Math.sqrt(variance), n };
}

/**
 * Compute effect size metrics after excluding specified subjects.
 *
 * @param treatedValues - All treated-group subjects (pre-filter)
 * @param controlValues - All control-group subjects (pre-filter)
 * @param excludedIds - USUBJIDs to exclude from both groups
 * @param confidenceLevel - CI level for gLower (default 0.80)
 */
export function computeExclusionPreview(
  treatedValues: ValueWithId[],
  controlValues: ValueWithId[],
  excludedIds: Set<string>,
  confidenceLevel: number = 0.80,
): ExclusionPreview {
  const filteredTreated = treatedValues.filter((v) => !excludedIds.has(v.usubjid));
  const filteredControl = controlValues.filter((v) => !excludedIds.has(v.usubjid));

  const ctrl = groupStats(filteredControl);
  const treat = groupStats(filteredTreated);

  if (ctrl.n < 2 || treat.n < 2) {
    return {
      g: null,
      gLower: null,
      meanCtrl: ctrl.mean,
      meanTreated: treat.mean,
      nCtrl: ctrl.n,
      nTreated: treat.n,
    };
  }

  const result = hedgesGFromStats(ctrl.mean, ctrl.sd, ctrl.n, treat.mean, treat.sd, treat.n);
  const g = result.g;
  const gLower = g != null ? computeGLower(g, ctrl.n, treat.n, confidenceLevel) : null;

  return {
    g: g != null ? Math.abs(g) : null,
    gLower,
    meanCtrl: ctrl.mean,
    meanTreated: treat.mean,
    nCtrl: ctrl.n,
    nTreated: treat.n,
  };
}
