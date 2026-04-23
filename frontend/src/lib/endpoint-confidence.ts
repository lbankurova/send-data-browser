/**
 * Endpoint Confidence Integrity (ECI) — SPEC-ECI-AMD-002.
 *
 * Four mechanisms to prevent low-quality endpoints from anchoring NOAEL:
 *   1. Normalization confidence ceiling (FEMALE_REPRODUCTIVE organs)
 *   2a. Non-monotonic dose-response detection
 *   2b. Trend test variance homogeneity check
 *   3. Integrated confidence + NOAEL contribution weight
 *
 * All pure functions — no backend changes needed. The backend already
 * provides group_stats[], pairwise[], trend_p, and dose_response_pattern
 * on every UnifiedFinding.
 */

import type { GroupStat, PairwiseResult, UnifiedFinding, WilliamsTestResult } from "@/types/analysis";
import type { EndpointSummary } from "./derive-summaries";
import { CONTINUOUS_DOMAINS } from "./domain-types";
import {
  getOrganCorrelationCategory,
  OrganCorrelationCategory,
} from "./organ-weight-normalization";
import { resolveEffectivePattern } from "./onset-dose";

// ─── Types ───────────────────────────────────────────────────

export type ConfidenceLevel = "high" | "moderate" | "low";

export interface NonMonotonicFlag {
  triggered: boolean;
  peakDoseLevel: number | null;
  peakEffect: number | null;
  highestDoseEffect: number | null;
  reversalRatio: number | null;
  highestDosePValue: number | null;
  rationale: string | null;
  consequences: {
    patternReclassified: boolean;
    newPattern: string | null;
    a1Downgrade: boolean;
    confidencePenalty: number;
  };
}

export interface TrendTestCaveat {
  triggered: boolean;
  issue: "variance_heterogeneity" | null;
  sdRatio: number | null;
  cvRatio: number | null;
  affectedDoseLevel: number | null;
  rationale: string | null;
  consequences: {
    trendEvidenceDowngraded: boolean;
    confidencePenalty: number;
    additionalCaveat: boolean;
  };
}

export interface NormalizationCaveat {
  category: string;
  reason: string;
  ceilingOnTR: ConfidenceLevel | null;
  escapeConditions: {
    tsDomainPresent: boolean;
    confirmatoryMIPresent: boolean;
  };
}

export interface TrendConcordanceResult {
  triggered: boolean;
  jtSignificant: boolean;
  jtPValue: number | null;
  williamsSignificant: boolean;
  williamsMinEffectiveDose: string | null;
  williamsHighestDoseTestStat: number | null;
  williamsHighestDoseCritVal: number | null;
  discordanceType: "jt_only" | "williams_only" | "concordant" | null;
  rationale: string | null;
  consequences: {
    trendEvidenceDowngraded: boolean;
    confidencePenalty: number;
    additionalNOAELCaveat: boolean;
  };
}

export interface IntegratedConfidence {
  statistical: ConfidenceLevel;
  biological: ConfidenceLevel;
  doseResponse: ConfidenceLevel;
  trendValidity: ConfidenceLevel;
  trendConcordance: ConfidenceLevel;
  integrated: ConfidenceLevel;
  limitingFactors: string[];
}

export interface NOAELContribution {
  weight: 0.0 | 0.3 | 0.7 | 1.0;
  label: "determining" | "contributing" | "supporting" | "excluded";
  caveats: string[];
  canSetNOAEL: boolean;
  requiresCorroboration: boolean;
}

export interface EndpointConfidenceResult {
  nonMonotonic: NonMonotonicFlag;
  trendCaveat: TrendTestCaveat;
  trendConcordance: TrendConcordanceResult;
  normCaveat: NormalizationCaveat | null;
  integrated: IntegratedConfidence;
  noaelContribution: NOAELContribution;
}

export interface WeightedNOAELEndpoint {
  endpoint: string;
  organ: string;
  domain: string;
  onsetDose: number;
  noaelContribution: NOAELContribution;
}

export interface WeightedNOAELResult {
  noael: number | null;
  loael: number | null;
  determiningEndpoints: WeightedNOAELEndpoint[];
  contributingEndpoints: WeightedNOAELEndpoint[];
  supportingEndpoints: WeightedNOAELEndpoint[];
  rationale: string[];
}

// ─── NOAEL floor — defensive display-layer invariant (F3, hcd-mi-ma-s08-wiring) ──
//
// This field is a display-layer invariant. The active NOAEL gate in
// `view_dataframes.py:_is_loael_driving` uses `finding_class === 'tr_adverse'`
// exclusively. The lint rule at scripts/lint-noael-floor-coread.sh prevents
// future consumers of clinical_confidence/hcd_evidence in NOAEL-gate code
// from omitting co-consultation of this field.
//
// @invariant noael-floor-coread-required
// See docs/_internal/architecture/s08-hcd-wiring.md for the convention.

export interface HcdEvidenceLite {
  // Narrow type -- UI does not need the full record to render the floor chip.
  noael_floor_applied?: boolean;
}

/**
 * Read `noael_floor_applied` from a rule-result's params.hcd_evidence. UI
 * consumers (context pane, NOAEL narrative) use this to surface the floor
 * state without re-deriving clinical-class membership.
 */
export function extractNoaelFloorApplied(
  params: { hcd_evidence?: HcdEvidenceLite | null } | null | undefined,
): boolean {
  if (!params) return false;
  const hcd = params.hcd_evidence;
  if (!hcd) return false;
  return Boolean(hcd.noael_floor_applied);
}

// ─── Constants ───────────────────────────────────────────────

const THRESHOLD_PATTERNS = new Set([
  "threshold",
  "threshold_increase",
  "threshold_decrease",
]);

const NOT_TRIGGERED_FLAG: NonMonotonicFlag = {
  triggered: false,
  peakDoseLevel: null,
  peakEffect: null,
  highestDoseEffect: null,
  reversalRatio: null,
  highestDosePValue: null,
  rationale: null,
  consequences: {
    patternReclassified: false,
    newPattern: null,
    a1Downgrade: false,
    confidencePenalty: 0,
  },
};

const NOT_TRIGGERED_TREND: TrendTestCaveat = {
  triggered: false,
  issue: null,
  sdRatio: null,
  cvRatio: null,
  affectedDoseLevel: null,
  rationale: null,
  consequences: {
    trendEvidenceDowngraded: false,
    confidencePenalty: 0,
    additionalCaveat: false,
  },
};

// ─── Helpers ─────────────────────────────────────────────────

const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = {
  high: 2,
  moderate: 1,
  low: 0,
};

function minConfidence(...levels: ConfidenceLevel[]): ConfidenceLevel {
  let min: ConfidenceLevel = "high";
  for (const l of levels) {
    if (CONFIDENCE_ORDER[l] < CONFIDENCE_ORDER[min]) min = l;
  }
  return min;
}

function downgradeConfidence(
  level: ConfidenceLevel,
  penalty: number,
): ConfidenceLevel {
  const order: ConfidenceLevel[] = ["high", "moderate", "low"];
  const idx = order.indexOf(level);
  return order[Math.min(idx + penalty, order.length - 1)];
}

// ─── Mechanism 2a: Non-Monotonic Detection ───────────────────

/**
 * Extract the effect metric from a group stat, handling both continuous
 * (mean-based) and incidence (proportion-based) data.
 * Returns the absolute delta from control, or null if no metric is available.
 */
function getGroupEffect(
  g: GroupStat,
  control: GroupStat,
  isIncidence: boolean,
): number | null {
  if (isIncidence) {
    // Incidence: use proportion difference from control
    const gInc = g.incidence ?? (g.affected != null && g.n > 0 ? g.affected / g.n : null);
    const cInc = control.incidence ?? (control.affected != null && control.n > 0 ? control.affected / control.n : null);
    if (gInc == null || cInc == null) return null;
    return Math.abs(gInc - cInc);
  }
  // Continuous: mean difference
  if (g.mean == null || control.mean == null) return null;
  return Math.abs(g.mean - control.mean);
}

/**
 * Detect non-monotonic dose-response on threshold-classified patterns.
 *
 * Fires when ALL 4 criteria are met:
 *   1. Pattern is threshold-type
 *   2. Peak effect is NOT at the highest dose
 *   3. Highest dose shows <50% of peak effect
 *   4. Highest dose pairwise p > 0.05
 *
 * SLA-09: Works for both continuous (mean-based) and incidence (proportion-based) data.
 */
// @field FIELD-54 — non-monotonic dose-response flag
export function checkNonMonotonic(
  groupStats: GroupStat[],
  pairwise: PairwiseResult[],
  pattern: string,
  isIncidence: boolean = false,
): NonMonotonicFlag {
  // Criterion 1: threshold-type pattern
  if (!THRESHOLD_PATTERNS.has(pattern)) return NOT_TRIGGERED_FLAG;

  // Need at least control + 2 treated to detect non-monotonicity
  const sorted = [...groupStats].sort((a, b) => a.dose_level - b.dose_level);
  const control = sorted.find((g) => g.dose_level === 0);
  const treated = sorted.filter((g) => g.dose_level > 0);
  if (!control || treated.length < 2) return NOT_TRIGGERED_FLAG;

  // SLA-09: Check that control has the required metric
  if (isIncidence) {
    const cInc = control.incidence ?? (control.affected != null && control.n > 0 ? control.affected / control.n : null);
    if (cInc == null) return NOT_TRIGGERED_FLAG;
  } else {
    if (control.mean == null) return NOT_TRIGGERED_FLAG;
  }

  // Compute absolute effects relative to control
  const effects = treated.map((g) => ({
    doseLevel: g.dose_level,
    delta: getGroupEffect(g, control, isIncidence) ?? 0,
  }));

  // Find peak effect
  const peak = effects.reduce((a, b) => (a.delta > b.delta ? a : b));
  const highest = effects[effects.length - 1];

  // Criterion 2: peak is NOT at highest dose
  if (peak.doseLevel === highest.doseLevel) return NOT_TRIGGERED_FLAG;

  // Criterion 3: reversal — highest dose < 50% of peak
  const reversalRatio = peak.delta > 0 ? highest.delta / peak.delta : 1.0;
  if (reversalRatio >= 0.5) return NOT_TRIGGERED_FLAG;

  // Criterion 4: highest dose not significant (p > 0.05)
  const highestPw = pairwise.find((p) => p.dose_level === highest.doseLevel);
  const highestP = highestPw?.p_value_adj ?? highestPw?.p_value ?? 1.0;
  if (highestP <= 0.05) return NOT_TRIGGERED_FLAG;

  const metricLabel = isIncidence ? "incidence" : "Δ";
  return {
    triggered: true,
    peakDoseLevel: peak.doseLevel,
    peakEffect: peak.delta,
    highestDoseEffect: highest.delta,
    reversalRatio,
    highestDosePValue: highestP,
    rationale:
      `Non-monotonic dose-response: peak effect at dose level ${peak.doseLevel} ` +
      `(${metricLabel}${isIncidence ? "=" : ""}${peak.delta.toFixed(3)}), but highest dose (level ${highest.doseLevel}) ` +
      `shows only ${(reversalRatio * 100).toFixed(0)}% of peak effect ` +
      `(p=${highestP.toFixed(3)} vs control).`,
    consequences: {
      patternReclassified: true,
      newPattern: "inconsistent",
      a1Downgrade: true,
      confidencePenalty: 1,
    },
  };
}

// ─── Mechanism 2b: Trend Test Validity ───────────────────────

/**
 * Check whether JT trend test assumptions hold (variance homogeneity).
 *
 * For continuous data, fires when EITHER:
 *   - SD ratio: max treated SD / control SD > 2.0
 *   - CV ratio: max group CV / min group CV > 2.0 (groups with n≥3)
 *
 * SLA-09: For incidence data, fires when:
 *   - Small sample: any group has n < 3 (unreliable proportion estimate)
 *   - Floor/ceiling: control incidence < 5% or > 95% (trend test power reduced)
 *   - Extreme range: treated incidence span > 60 percentage points
 *
 * Penalty = 1 when BOTH continuous criteria fire, or small sample for incidence.
 */
// @field FIELD-55 — trend test variance homogeneity caveat
export function checkTrendTestValidity(
  groupStats: GroupStat[],
  trendP: number | null,
  hasValidAncova: boolean = false,
  isIncidence: boolean = false,
): TrendTestCaveat {
  // No trend test → no caveat
  if (trendP == null) return NOT_TRIGGERED_TREND;

  // ANCOVA is the primary analysis — JT variance assumptions are irrelevant
  if (hasValidAncova) return NOT_TRIGGERED_TREND;

  const sorted = [...groupStats].sort((a, b) => a.dose_level - b.dose_level);
  const control = sorted.find((g) => g.dose_level === 0);
  const treated = sorted.filter((g) => g.dose_level > 0);
  if (!control || treated.length === 0) return NOT_TRIGGERED_TREND;

  // SLA-09: Incidence-specific checks — Fisher exact / CMH assumptions
  if (isIncidence) {
    return _checkTrendValidityIncidence(sorted, control, treated);
  }

  // Criterion 1: SD ratio vs control
  let sdRatio: number | null = null;
  let maxSdDoseLevel: number | null = null;
  if (control.sd != null && control.sd > 0) {
    let maxSd = 0;
    for (const g of treated) {
      if (g.sd != null && g.sd > maxSd) {
        maxSd = g.sd;
        maxSdDoseLevel = g.dose_level;
      }
    }
    sdRatio = maxSd / control.sd;
  }

  // Criterion 2: CV ratio across all groups with n≥3 and mean>0
  let cvRatio: number | null = null;
  let maxCvDoseLevel: number | null = null;
  const groupCvs = sorted
    .filter(
      (g) =>
        g.n >= 3 && g.mean != null && g.mean > 0 && g.sd != null && g.sd >= 0,
    )
    .map((g) => ({
      doseLevel: g.dose_level,
      cv: g.sd! / g.mean!,
    }));

  if (groupCvs.length >= 2) {
    const maxCv = groupCvs.reduce((a, b) => (a.cv > b.cv ? a : b));
    const minCv = groupCvs.reduce((a, b) => (a.cv < b.cv ? a : b));
    if (minCv.cv > 0) {
      cvRatio = maxCv.cv / minCv.cv;
      maxCvDoseLevel = maxCv.doseLevel;
    }
  }

  const sdFired = sdRatio != null && sdRatio > 2.0;
  const cvFired = cvRatio != null && cvRatio > 2.0;

  if (!sdFired && !cvFired) {
    return {
      ...NOT_TRIGGERED_TREND,
      sdRatio,
      cvRatio,
    };
  }

  const affectedDoseLevel = sdFired ? maxSdDoseLevel : maxCvDoseLevel;

  const parts: string[] = [];
  if (sdFired) {
    parts.push(`SD ratio ${sdRatio!.toFixed(1)}× (control SD)`);
  }
  if (cvFired) {
    parts.push(`CV ratio ${cvRatio!.toFixed(1)}× (min group CV)`);
  }

  return {
    triggered: true,
    issue: "variance_heterogeneity",
    sdRatio,
    cvRatio,
    affectedDoseLevel,
    rationale:
      `Variance heterogeneity: ${parts.join("; ")}. ` +
      `JT trend test assumes comparable within-group variances; ` +
      `significance may be inflated.`,
    consequences: {
      trendEvidenceDowngraded: true,
      confidencePenalty: sdFired && cvFired ? 1 : 0,
      additionalCaveat: true,
    },
  };
}

/** SLA-09: Incidence-specific trend test validity checks. */
function _checkTrendValidityIncidence(
  sorted: GroupStat[],
  control: GroupStat,
  treated: GroupStat[],
): TrendTestCaveat {
  // Helper: get incidence proportion from a group
  const getInc = (g: GroupStat): number | null => {
    if (g.incidence != null) return g.incidence;
    if (g.affected != null && g.n > 0) return g.affected / g.n;
    return null;
  };

  // Check 1: Small sample — any group with n < 3 (unreliable proportion)
  const smallSampleGroup = sorted.find((g) => g.n < 3);
  if (smallSampleGroup) {
    return {
      triggered: true,
      issue: "variance_heterogeneity",
      sdRatio: null,
      cvRatio: null,
      affectedDoseLevel: smallSampleGroup.dose_level,
      rationale:
        `Small group size: dose level ${smallSampleGroup.dose_level} has n=${smallSampleGroup.n}. ` +
        `Proportions from groups with fewer than 3 subjects are unreliable; ` +
        `trend test significance should be interpreted with caution.`,
      consequences: {
        trendEvidenceDowngraded: true,
        confidencePenalty: 1,
        additionalCaveat: true,
      },
    };
  }

  // Check 2: Control floor/ceiling (incidence < 5% or > 95%)
  const controlInc = getInc(control);
  if (controlInc != null && (controlInc < 0.05 || controlInc > 0.95)) {
    const pctLabel = (controlInc * 100).toFixed(1);
    const issue = controlInc < 0.05 ? "floor" : "ceiling";
    return {
      triggered: true,
      issue: "variance_heterogeneity",
      sdRatio: null,
      cvRatio: null,
      affectedDoseLevel: control.dose_level,
      rationale:
        `Control incidence at ${issue} (${pctLabel}%). ` +
        `Trend test power is reduced when baseline rates are near 0% or 100%; ` +
        `treatment effects may be difficult to detect.`,
      consequences: {
        trendEvidenceDowngraded: true,
        confidencePenalty: 0,
        additionalCaveat: true,
      },
    };
  }

  // Check 3: Extreme incidence range across treated groups (span > 60pp)
  const treatedIncs = treated.map(getInc).filter((v): v is number => v != null);
  if (treatedIncs.length >= 2) {
    const maxInc = Math.max(...treatedIncs);
    const minInc = Math.min(...treatedIncs);
    const span = maxInc - minInc;
    if (span > 0.60) {
      return {
        triggered: true,
        issue: "variance_heterogeneity",
        sdRatio: null,
        cvRatio: null,
        affectedDoseLevel: null,
        rationale:
          `Incidence range ${(minInc * 100).toFixed(0)}%–${(maxInc * 100).toFixed(0)}% ` +
          `across treated groups (${(span * 100).toFixed(0)} percentage point span). ` +
          `High variability may compromise trend test robustness.`,
        consequences: {
          trendEvidenceDowngraded: true,
          confidencePenalty: 0,
          additionalCaveat: true,
        },
      };
    }
  }

  return NOT_TRIGGERED_TREND;
}

// ─── Mechanism 2c: Trend Test Concordance ─────────────────────

const NOT_TRIGGERED_CONCORDANCE: TrendConcordanceResult = {
  triggered: false,
  jtSignificant: false,
  jtPValue: null,
  williamsSignificant: false,
  williamsMinEffectiveDose: null,
  williamsHighestDoseTestStat: null,
  williamsHighestDoseCritVal: null,
  discordanceType: null,
  rationale: null,
  consequences: {
    trendEvidenceDowngraded: false,
    confidencePenalty: 0,
    additionalNOAELCaveat: false,
  },
};

/**
 * Check concordance between JT trend test and Williams' step-down test.
 *
 * Fires when JT is significant but Williams' finds no minimum effective dose.
 * This pattern indicates JT may be inflated by variance heterogeneity or
 * non-monotonic dose-response.
 */
// @field FIELD-60 — JT/Williams' trend concordance check (Mechanism 2c)
export function checkTrendConcordance(
  trendP: number | null,
  williams: WilliamsTestResult | null | undefined,
  alpha: number = 0.05,
): TrendConcordanceResult {
  if (trendP == null || !williams) return NOT_TRIGGERED_CONCORDANCE;

  const jtSig = trendP < alpha;
  const williamsSig = williams.minimum_effective_dose != null;

  // Only fire on JT-significant / Williams-not-significant
  if (jtSig && !williamsSig) {
    const highestDose = williams.step_down_results[0];
    return {
      triggered: true,
      jtSignificant: true,
      jtPValue: trendP,
      williamsSignificant: false,
      williamsMinEffectiveDose: null,
      williamsHighestDoseTestStat: highestDose?.test_statistic ?? null,
      williamsHighestDoseCritVal: highestDose?.critical_value ?? null,
      discordanceType: "jt_only",
      rationale:
        `Trend test discordance: Jonckheere-Terpstra is significant ` +
        `(p=${trendP.toExponential(2)}) but Williams' test ` +
        `is not significant at the highest dose` +
        (highestDose
          ? ` (t\u0303=${highestDose.test_statistic.toFixed(2)}, ` +
            `cv=${highestDose.critical_value.toFixed(2)})`
          : "") +
        `. This pattern indicates the JT result may be driven by ` +
        `rank inflation from variance heterogeneity ` +
        `or non-monotonic dose-response.`,
      consequences: {
        trendEvidenceDowngraded: true,
        confidencePenalty: 1,
        additionalNOAELCaveat: true,
      },
    };
  }

  // Williams-only significant (unusual — flag for review but no caveat)
  if (!jtSig && williamsSig) {
    const highestDose = williams.step_down_results[0];
    return {
      triggered: false,
      jtSignificant: false,
      jtPValue: trendP,
      williamsSignificant: true,
      williamsMinEffectiveDose: williams.minimum_effective_dose,
      williamsHighestDoseTestStat: highestDose?.test_statistic ?? null,
      williamsHighestDoseCritVal: highestDose?.critical_value ?? null,
      discordanceType: "williams_only",
      rationale:
        "Williams' significant without JT — unusual; review for floor/ceiling effects.",
      consequences: {
        trendEvidenceDowngraded: false,
        confidencePenalty: 0,
        additionalNOAELCaveat: false,
      },
    };
  }

  // Concordant (both sig or both not sig)
  const highestDose = williams.step_down_results[0];
  return {
    triggered: false,
    jtSignificant: jtSig,
    jtPValue: trendP,
    williamsSignificant: williamsSig,
    williamsMinEffectiveDose: williams.minimum_effective_dose,
    williamsHighestDoseTestStat: highestDose?.test_statistic ?? null,
    williamsHighestDoseCritVal: highestDose?.critical_value ?? null,
    discordanceType: "concordant",
    rationale: null,
    consequences: {
      trendEvidenceDowngraded: false,
      confidencePenalty: 0,
      additionalNOAELCaveat: false,
    },
  };
}

// ─── Mechanism 1: Normalization Confidence Ceiling ───────────

/**
 * Check if organ's normalization confidence should cap TR confidence.
 *
 * Only fires for FEMALE_REPRODUCTIVE organs without escape conditions
 * (estrous staging or confirmatory microscopic findings).
 */
// @field FIELD-56 — normalization confidence ceiling (FEMALE_REPRODUCTIVE)
export function getNormalizationCaveat(
  organ: string,
  hasEstrousData: boolean,
  miFindings: EndpointSummary[],
): NormalizationCaveat | null {
  const category = getOrganCorrelationCategory(organ);
  if (category !== OrganCorrelationCategory.FEMALE_REPRODUCTIVE) return null;

  // Check escape: confirmatory MI for this organ
  const confirmatoryMI = miFindings.some(
    (ep) =>
      ep.domain === "MI" &&
      ep.specimen != null &&
      ep.specimen.toUpperCase() === organ.toUpperCase() &&
      ep.treatmentRelated &&
      ep.minPValue != null &&
      ep.minPValue <= 0.05,
  );

  if (hasEstrousData && confirmatoryMI) {
    return {
      category,
      reason:
        "Estrous cycle staging and histopathology both available.",
      ceilingOnTR: null,
      escapeConditions: {
        tsDomainPresent: true,
        confirmatoryMIPresent: true,
      },
    };
  }

  if (hasEstrousData || confirmatoryMI) {
    return {
      category,
      reason: hasEstrousData
        ? "Cycle staging available; histopathology would strengthen confidence."
        : "Histopathology confirms finding; cycle staging would strengthen.",
      ceilingOnTR: null,
      escapeConditions: {
        tsDomainPresent: hasEstrousData,
        confirmatoryMIPresent: confirmatoryMI,
      },
    };
  }

  return {
    category,
    reason:
      "Estrous cycle not controlled (CV 25–50%). No histopathology confirmation.",
    ceilingOnTR: "moderate",
    escapeConditions: {
      tsDomainPresent: false,
      confirmatoryMIPresent: false,
    },
  };
}

// ─── Mechanism 3: Integrated Confidence ──────────────────────

/**
 * Derive statistical confidence from endpoint metrics.
 * This is a standalone endpoint-level assessment (DP-5), not from syndrome TR.
 *
 * SLA-04: Branch on CONTINUOUS_DOMAINS — non-continuous endpoints have no Cohen's d
 * for magnitude gating; MI severity grade is not comparable.
 */
function deriveStatisticalConfidence(ep: EndpointSummary): ConfidenceLevel {
  const p = ep.minPValue;
  const informativePattern =
    ep.pattern !== "flat" &&
    ep.pattern !== "insufficient_data" &&
    ep.pattern !== "no_pattern";

  if (!CONTINUOUS_DOMAINS.has(ep.domain)) {
    // Non-continuous (MI, MA, CL, TF, DS): confidence from statistical significance + pattern only.
    if (p != null && p < 0.01 && informativePattern) return "high";
    if (p != null && p < 0.05) return "moderate";
    return "low";
  }

  // Continuous D4 clinical-boost path.
  //
  // F4 rewire (species-magnitude-thresholds-dog-nhp Phase B, AC-F4-2): when
  // the backend shipped an FCT reliance block with populated bands, the
  // moderate-grade boost consumes the FCT `concern_floor` / `adverse_floor`
  // as the native-scale moderate/high anchors. The |g|-ladder remains the
  // fallback for endpoints without an FCT entry (coverage='none' sends us
  // down the legacy path).
  const g = ep.maxEffectSize != null ? Math.abs(ep.maxEffectSize) : 0;
  const fct = ep.fctReliance;
  const bandsUsed = fct?.bands_used ?? null;
  const verdict = ep.verdict;

  if (fct && fct.coverage !== "none" && bandsUsed) {
    // Verdict-driven boost: a backend-emitted verdict of strong_adverse /
    // adverse / concern anchors the frontend assessment; p-value still
    // gates HIGH vs MODERATE to preserve the statistical-strength axis.
    if (p != null && p < 0.01 && informativePattern
        && (verdict === "strong_adverse" || verdict === "adverse")) {
      return "high";
    }
    if (p != null && p < 0.05
        && (verdict === "strong_adverse" || verdict === "adverse" || verdict === "concern")) {
      return "moderate";
    }
    // No verdict boost AND no legacy-g signal -> low.
    return "low";
  }

  // Legacy continuous path (no FCT entry resolved for this endpoint).
  if (p != null && p < 0.01 && g >= 0.8 && informativePattern) return "high";
  if (p != null && p < 0.05 && g >= 0.5) return "moderate";
  return "low";
}

/**
 * Combine all 5 confidence dimensions into an integrated assessment.
 * Integrated = min(statistical, biological, doseResponse, trendValidity, trendConcordance).
 */
// @field FIELD-57 — 5-dimension integrated confidence
export function integrateConfidence(
  nonMonoFlag: NonMonotonicFlag,
  trendCaveat: TrendTestCaveat,
  concordance: TrendConcordanceResult,
  normCaveat: NormalizationCaveat | null,
  ep: EndpointSummary,
  pattern: string,
): IntegratedConfidence {
  const statistical = deriveStatisticalConfidence(ep);

  // Biological: from normalization caveat
  const biological: ConfidenceLevel = normCaveat?.ceilingOnTR ?? "high";

  // Dose-response: penalty from non-monotonic flag or backend non-monotonic pattern
  let doseResponse: ConfidenceLevel;
  if (nonMonoFlag.triggered) {
    // Hidden reversal in threshold pattern — full penalty
    doseResponse = downgradeConfidence(
      statistical,
      nonMonoFlag.consequences.confidencePenalty,
    );
  } else if (pattern === "non_monotonic" || pattern === "u_shaped") {
    // Backend already classified as non-monotonic/u-shaped — JT trend test is less
    // informative for non-monotonic data, cap at moderate
    doseResponse = "moderate";
  } else {
    doseResponse = "high";
  }

  // Trend validity: from variance check
  let trendValidity: ConfidenceLevel = "high";
  if (trendCaveat.triggered) {
    trendValidity =
      trendCaveat.consequences.confidencePenalty > 0 ? "low" : "moderate";
  }

  // Trend concordance: from JT/Williams' concordance check
  const trendConcordance: ConfidenceLevel = concordance.triggered
    ? "moderate"
    : "high";

  const integrated = minConfidence(
    statistical,
    biological,
    doseResponse,
    trendValidity,
    trendConcordance,
  );

  // Determine limiting factors — all non-statistical dimensions at the integrated level
  const dims: { name: string; level: ConfidenceLevel }[] = [
    { name: "Statistical evidence", level: statistical },
    { name: "Biological plausibility", level: biological },
    { name: "Dose-response quality", level: doseResponse },
    { name: "Trend test validity", level: trendValidity },
    { name: "Trend concordance", level: trendConcordance },
  ];

  let limitingFactors: string[];
  if (integrated === "high" && statistical === "high") {
    limitingFactors = [];
  } else {
    // Dimensions at the integrated (worst) level, excluding "Statistical evidence"
    limitingFactors = dims
      .filter((d) => d.level === integrated && d.name !== "Statistical evidence")
      .map((d) => d.name);
    // If no non-statistical limiter, include statistical
    if (limitingFactors.length === 0) {
      limitingFactors = dims
        .filter((d) => d.level === integrated)
        .map((d) => d.name);
    }
  }

  return {
    statistical,
    biological,
    doseResponse,
    trendValidity,
    trendConcordance,
    integrated,
    limitingFactors,
  };
}

// ─── Mechanism 4: NOAEL Contribution Weight ──────────────────

/**
 * Compute how much weight an endpoint carries for NOAEL derivation.
 *
 * Gate: must be treatment-related AND adverse.
 * Weight: 1.0 (determining), 0.7 (contributing), 0.3 (supporting), 0.0 (excluded).
 */
// @field FIELD-58 — NOAEL contribution weight + label
export function computeNOAELContribution(
  integrated: IntegratedConfidence,
  nonMonoFlag: NonMonotonicFlag,
  normCaveat: NormalizationCaveat | null,
  trendCaveat: TrendTestCaveat,
  concordance: TrendConcordanceResult,
  treatmentRelated: boolean,
  isAdverse: boolean,
): NOAELContribution {
  if (!treatmentRelated || !isAdverse) {
    return {
      weight: 0.0,
      label: "excluded",
      caveats: [],
      canSetNOAEL: false,
      requiresCorroboration: false,
    };
  }

  const caveats: string[] = [];
  if (normCaveat?.ceilingOnTR) caveats.push(normCaveat.reason);
  if (nonMonoFlag.triggered && nonMonoFlag.rationale)
    caveats.push(nonMonoFlag.rationale);
  if (trendCaveat.triggered && trendCaveat.rationale)
    caveats.push(trendCaveat.rationale);
  if (concordance.triggered && concordance.rationale)
    caveats.push(concordance.rationale);

  let weight: 0.3 | 0.7 | 1.0;
  let label: "determining" | "contributing" | "supporting";

  if (
    integrated.integrated === "low" ||
    nonMonoFlag.triggered ||
    caveats.length >= 2
  ) {
    weight = 0.3;
    label = "supporting";
  } else if (integrated.integrated === "moderate" || caveats.length === 1) {
    weight = 0.7;
    label = "contributing";
  } else {
    weight = 1.0;
    label = "determining";
  }

  return {
    weight,
    label,
    caveats,
    canSetNOAEL: weight >= 0.7,
    requiresCorroboration: weight === 0.7,
  };
}

// ─── Full ECI Pipeline ───────────────────────────────────────

/**
 * Run all 4 ECI mechanisms for a single endpoint.
 * This is the main entry point wired into deriveEndpointSummaries().
 */
// @field FIELD-53 — endpoint confidence integrity assessment (4 mechanisms + NOAEL weight)
export function computeEndpointConfidence(
  groupStats: GroupStat[],
  pairwise: PairwiseResult[],
  pattern: string,
  trendP: number | null,
  organ: string,
  hasEstrousData: boolean,
  miFindings: EndpointSummary[],
  ep: EndpointSummary,
  williams?: WilliamsTestResult | null,
  hasValidAncova: boolean = false,
): EndpointConfidenceResult {
  const isIncidence = !CONTINUOUS_DOMAINS.has(ep.domain);
  const nonMonotonic = checkNonMonotonic(groupStats, pairwise, pattern, isIncidence);
  const trendCaveat = checkTrendTestValidity(groupStats, trendP, hasValidAncova, isIncidence);
  const concordance = checkTrendConcordance(trendP, williams);
  const normCaveat = getNormalizationCaveat(organ, hasEstrousData, miFindings);
  const integrated = integrateConfidence(
    nonMonotonic,
    trendCaveat,
    concordance,
    normCaveat,
    ep,
    pattern,
  );
  const noaelContribution = computeNOAELContribution(
    integrated,
    nonMonotonic,
    normCaveat,
    trendCaveat,
    concordance,
    ep.treatmentRelated,
    ep.worstSeverity === "adverse",
  );

  return {
    nonMonotonic,
    trendCaveat,
    trendConcordance: concordance,
    normCaveat,
    integrated,
    noaelContribution,
  };
}

// ─── Attach ECI to EndpointSummary[] ─────────────────────────

/**
 * Attach endpoint confidence results to pre-built EndpointSummary[].
 * Called in useFindingsAnalyticsLocal after deriveEndpointSummaries().
 *
 * @param summaries  EndpointSummary[] already enriched with NOAEL tiers
 * @param findings   Source UnifiedFinding[] (for group_stats, pairwise, trend_p)
 * @param hasEstrousData  Whether the study has estrous cycle staging data
 */
export function attachEndpointConfidence(
  summaries: EndpointSummary[],
  findings: UnifiedFinding[],
  hasEstrousData: boolean,
): void {
  // Build a lookup: endpoint_label → best UnifiedFinding (strongest signal)
  const findingsByLabel = new Map<string, UnifiedFinding>();
  // Also build per-sex lookup: endpoint_label → Map<sex, best UnifiedFinding>
  const findingsBySex = new Map<string, Map<string, UnifiedFinding>>();
  for (const f of findings) {
    const label = f.endpoint_label ?? f.finding;
    // Overall best (aggregated across sexes)
    const existing = findingsByLabel.get(label);
    if (
      !existing ||
      Math.abs(f.max_effect_size ?? 0) > Math.abs(existing.max_effect_size ?? 0)
    ) {
      findingsByLabel.set(label, f);
    }
    // Per-sex best
    const sex = f.sex ?? "Unknown";
    if (!findingsBySex.has(label)) findingsBySex.set(label, new Map());
    const sexMap = findingsBySex.get(label)!;
    const existingSex = sexMap.get(sex);
    if (
      !existingSex ||
      Math.abs(f.max_effect_size ?? 0) > Math.abs(existingSex.max_effect_size ?? 0)
    ) {
      sexMap.set(sex, f);
    }
  }

  // Collect MI findings from summaries (for normalization caveat escape)
  const miSummaries = summaries.filter((ep) => ep.domain === "MI");

  for (const ep of summaries) {
    const f = findingsByLabel.get(ep.endpoint_label);
    if (!f) continue;

    const organ = ep.specimen ?? ep.organ_system;

    // Compute ECI for a single finding
    const computeForFinding = (finding: UnifiedFinding) => {
      const hasValidAncova = finding.ancova != null
        && finding.ancova.adjusted_means.length > 0
        && finding.ancova.model_r_squared > 0;
      return computeEndpointConfidence(
        finding.group_stats ?? [],
        finding.pairwise ?? [],
        resolveEffectivePattern(finding) ?? ep.pattern,
        finding.trend_p,
        organ,
        hasEstrousData,
        miSummaries,
        ep,
        finding.williams,
        hasValidAncova,
      );
    };

    // Aggregated ECI (best signal across sexes)
    ep.endpointConfidence = computeForFinding(f);

    // Per-sex ECI
    const sexMap = findingsBySex.get(ep.endpoint_label);
    if (sexMap && sexMap.size >= 2) {
      const perSex = new Map<string, EndpointConfidenceResult>();
      for (const [sex, sexFinding] of sexMap) {
        perSex.set(sex, computeForFinding(sexFinding));
      }
      ep.eciPerSex = perSex;
    }
  }
}

// ─── NOAEL Derivation ────────────────────────────────────────

/**
 * Derive study-level weighted NOAEL from endpoint contributions.
 *
 * - Determining (1.0): onset dose directly constrains NOAEL
 * - Contributing (0.7): constrains only if corroborated by another ≥0.7 at same/lower dose
 * - Supporting (0.3): documented but does not constrain
 * - Excluded (0.0): not included
 */
// @field FIELD-59 — study-level weighted NOAEL from ECI
export function deriveWeightedNOAEL(
  endpoints: WeightedNOAELEndpoint[],
  doseLevels: number[],
): WeightedNOAELResult {
  const sorted = [...doseLevels].sort((a, b) => a - b);
  const eligible = endpoints.filter((ep) => ep.noaelContribution.weight > 0);

  const determining = eligible.filter(
    (ep) => ep.noaelContribution.label === "determining",
  );
  const contributing = eligible.filter(
    (ep) => ep.noaelContribution.label === "contributing",
  );
  const supporting = eligible.filter(
    (ep) => ep.noaelContribution.label === "supporting",
  );

  const constraints: { dose: number; endpoint: string }[] = [];

  // Determining endpoints: direct constraints
  for (const ep of determining) {
    constraints.push({ dose: ep.onsetDose, endpoint: ep.endpoint });
  }

  // Contributing endpoints: corroboration check
  for (const ep of contributing) {
    const corroborated = eligible.some(
      (other) =>
        other.endpoint !== ep.endpoint &&
        other.onsetDose <= ep.onsetDose &&
        other.noaelContribution.weight >= 0.7,
    );
    if (corroborated) {
      constraints.push({ dose: ep.onsetDose, endpoint: ep.endpoint });
    }
  }

  if (constraints.length === 0) {
    const highestDose = sorted.length > 0 ? sorted[sorted.length - 1] : null;
    return {
      noael: highestDose,
      loael: null,
      determiningEndpoints: [],
      contributingEndpoints: contributing,
      supportingEndpoints: supporting,
      rationale: [
        "No determining or corroborated contributing endpoints. NOAEL at highest tested dose.",
      ],
    };
  }

  const lowestConstraint = constraints.reduce((a, b) =>
    a.dose < b.dose ? a : b,
  );
  const noael =
    sorted.filter((d) => d < lowestConstraint.dose).pop() ?? null;

  const constrainedContributing = contributing.filter((ep) =>
    constraints.some((c) => c.endpoint === ep.endpoint),
  );

  const rationale: string[] = [];
  if (determining.length > 0) {
    rationale.push(
      `NOAEL constrained by ${determining.length} determining endpoint(s).`,
    );
  }
  if (constrainedContributing.length > 0) {
    rationale.push(
      `${constrainedContributing.length} contributing endpoint(s) corroborated.`,
    );
  }
  if (supporting.length > 0) {
    rationale.push(
      `${supporting.length} supporting endpoint(s) documented but did not constrain NOAEL.`,
    );
  }

  return {
    noael,
    loael: lowestConstraint.dose,
    determiningEndpoints: determining,
    contributingEndpoints: contributing,
    supportingEndpoints: supporting,
    rationale,
  };
}
