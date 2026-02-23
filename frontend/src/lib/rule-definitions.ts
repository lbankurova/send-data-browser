/**
 * Static catalog of all rules, thresholds, and pure computation functions.
 * Used by RuleInspectorTab (TRUST-01) and ScoreBreakdown popovers (TRUST-02).
 *
 * All data mirrors the Python backend:
 *   - RULE_CATALOG → backend/generator/scores_and_rules.py RULES (lines 12-79)
 *   - Signal score → backend/generator/view_dataframes.py _compute_signal_score (lines 363-408)
 *   - NOAEL confidence → backend/generator/view_dataframes.py _compute_noael_confidence (lines 313-360)
 */

// ---------------------------------------------------------------------------
// Rule catalog
// ---------------------------------------------------------------------------

export interface RuleDef {
  id: string;
  name: string;
  scope: "endpoint" | "organ" | "study";
  severity: "info" | "warning" | "critical";
  condition: string;
  conditionHuman: string;
  template: string;
  thresholdRefs: string[];
}

export const RULE_CATALOG: RuleDef[] = [
  {
    id: "R01", name: "Treatment-related", scope: "endpoint", severity: "info",
    condition: "treatment_related",
    conditionHuman: "treatment_related == true",
    template: "{endpoint_label}: significant dose-dependent {direction} in {sex} ({pattern}).",
    thresholdRefs: [],
  },
  {
    id: "R02", name: "Significant pairwise", scope: "endpoint", severity: "info",
    condition: "significant_pairwise",
    conditionHuman: "p_value_adj < 0.05",
    template: "Significant pairwise difference at {dose_label} (p={p_value}, d={effect_size}).",
    thresholdRefs: ["p_value_significance"],
  },
  {
    id: "R03", name: "Significant trend", scope: "endpoint", severity: "info",
    condition: "significant_trend",
    conditionHuman: "trend_p < 0.05",
    template: "Significant dose-response trend (p={trend_p}).",
    thresholdRefs: ["p_value_significance"],
  },
  {
    id: "R04", name: "Adverse severity", scope: "endpoint", severity: "warning",
    condition: "adverse_severity",
    conditionHuman: 'severity == "adverse"',
    template: "{endpoint_label} classified as adverse in {sex} (p={p_value}).",
    thresholdRefs: [],
  },
  {
    id: "R05", name: "Monotonic pattern", scope: "endpoint", severity: "info",
    condition: "monotonic_pattern",
    conditionHuman: 'pattern in ("monotonic_increase", "monotonic_decrease")',
    template: "{endpoint_label}: {pattern} across dose groups in {sex}.",
    thresholdRefs: [],
  },
  {
    id: "R06", name: "Threshold pattern", scope: "endpoint", severity: "info",
    condition: "threshold_pattern",
    conditionHuman: 'pattern == "threshold"',
    template: "{endpoint_label}: threshold pattern in {sex}.",
    thresholdRefs: [],
  },
  {
    id: "R07", name: "Non-monotonic", scope: "endpoint", severity: "info",
    condition: "non_monotonic",
    conditionHuman: 'pattern == "non_monotonic"',
    template: "{endpoint_label}: inconsistent dose-response in {sex}.",
    thresholdRefs: [],
  },
  {
    id: "R08", name: "Target organ", scope: "organ", severity: "warning",
    condition: "target_organ",
    conditionHuman: "target_organ_flag == true",
    template: "Convergent evidence from {n_domains} domains ({domains}).",
    thresholdRefs: ["target_organ_evidence", "target_organ_significant"],
  },
  {
    id: "R09", name: "Multi-domain evidence", scope: "organ", severity: "info",
    condition: "multi_domain_evidence",
    conditionHuman: "n_domains >= 2",
    template: "{n_endpoints} endpoints across {domains}.",
    thresholdRefs: [],
  },
  {
    id: "R10", name: "Large effect", scope: "endpoint", severity: "warning",
    condition: "large_effect",
    conditionHuman: "|max_effect_size| >= 1.0",
    template: "{endpoint_label}: Hedges' g = {effect_size} at high dose in {sex}.",
    thresholdRefs: ["large_effect"],
  },
  {
    id: "R11", name: "Moderate effect", scope: "endpoint", severity: "info",
    condition: "moderate_effect",
    conditionHuman: "0.5 <= |max_effect_size| < 1.0",
    template: "{endpoint_label}: Hedges' g = {effect_size} at high dose.",
    thresholdRefs: ["moderate_effect"],
  },
  {
    id: "R12", name: "Histo incidence increase", scope: "endpoint", severity: "warning",
    condition: "histo_incidence_increase",
    conditionHuman: 'domain in ("MI","MA","CL") AND direction=="up" AND severity!="normal"',
    template: "Increased incidence of {finding} in {specimen} at high dose ({sex}).",
    thresholdRefs: [],
  },
  {
    id: "R13", name: "Severity grade increase", scope: "endpoint", severity: "info",
    condition: "severity_grade_increase",
    conditionHuman: 'domain in ("MI","MA","CL") AND pattern in ("monotonic_increase","threshold") AND avg_severity is not null',
    template: "{finding} in {specimen}: dose-dependent severity increase.",
    thresholdRefs: [],
  },
  {
    id: "R14", name: "NOAEL established", scope: "study", severity: "info",
    condition: "noael_established",
    conditionHuman: "noael_dose_level is not null",
    template: "NOAEL at {noael_label} ({noael_dose_value} {noael_dose_unit}) for {sex}.",
    thresholdRefs: [],
  },
  {
    id: "R15", name: "NOAEL not established", scope: "study", severity: "warning",
    condition: "noael_not_established",
    conditionHuman: "noael_dose_level is null",
    template: "NOAEL not established for {sex} \u2014 adverse effects at lowest dose tested.",
    thresholdRefs: [],
  },
  {
    id: "R16", name: "Correlated findings", scope: "organ", severity: "info",
    condition: "correlated_findings",
    conditionHuman: ">= 2 endpoints in same organ",
    template: "{endpoint_labels} show convergent pattern.",
    thresholdRefs: [],
  },
  {
    id: "R17", name: "Mortality signal", scope: "study", severity: "critical",
    condition: "mortality_signal",
    conditionHuman: 'domain == "DS" AND test_code == "MORTALITY" AND count > 0',
    template: "{count} deaths in {sex}, dose-dependent pattern.",
    thresholdRefs: [],
  },
  {
    id: "R18", name: "Incidence decrease (protective)", scope: "endpoint", severity: "info",
    condition: "histo_incidence_decrease",
    conditionHuman: 'domain in ("MI","MA","CL") AND direction=="down" AND ctrl_incidence > high_incidence',
    template: "Decreased incidence of {finding} in {specimen} with treatment ({sex}): {ctrl_pct}% in controls vs {high_pct}% at high dose.",
    thresholdRefs: [],
  },
  {
    id: "R19", name: "Decreased incidence, high baseline", scope: "endpoint", severity: "info",
    condition: "potential_protective_effect",
    conditionHuman: 'R18 conditions AND ctrl_incidence >= 50% AND (monotonic_decrease OR threshold OR large_drop >= 40pp)',
    template: "{finding} in {specimen}: high baseline incidence ({ctrl_pct}%) with dose-related decrease to {high_pct}% at high dose.",
    thresholdRefs: [],
  },
];

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export interface ThresholdDef {
  key: string;
  name: string;
  value: string;
  usedBy: string[];
  description: string;
}

export const THRESHOLDS: ThresholdDef[] = [
  { key: "p_value_significance", name: "P-value significance", value: "p < 0.05", usedBy: ["R02", "R03"], description: "Pairwise and trend significance threshold" },
  { key: "large_effect", name: "Large effect", value: "|d| \u2265 1.0", usedBy: ["R10"], description: "Large Cohen\u2019s d threshold" },
  { key: "moderate_effect", name: "Moderate effect", value: "|d| \u2265 0.5", usedBy: ["R11"], description: "Moderate Cohen\u2019s d threshold" },
  { key: "target_organ_evidence", name: "Target organ evidence", value: "evidence \u2265 0.3", usedBy: ["R08"], description: "Minimum evidence score for target organ flag" },
  { key: "target_organ_significant", name: "Target organ significant", value: "n_significant \u2265 1", usedBy: ["R08"], description: "Minimum significant endpoints for target organ" },
  { key: "p_value_cap", name: "P-value cap", value: "p = 0.0001", usedBy: [], description: "P-value component capped at -log\u2081\u2080(0.0001)/4 = 1.0" },
  { key: "effect_size_cap", name: "Effect size cap", value: "|d| = 2.0", usedBy: [], description: "Effect size component capped at |d|/2.0 = 1.0" },
  { key: "signal_score_p_weight", name: "P-value weight", value: "0.35", usedBy: [], description: "Weight of p-value in signal score" },
  { key: "signal_score_trend_weight", name: "Trend weight", value: "0.20", usedBy: [], description: "Weight of trend p-value in signal score" },
  { key: "signal_score_effect_weight", name: "Effect size weight", value: "0.25", usedBy: [], description: "Weight of effect size in signal score" },
  { key: "signal_score_pattern_weight", name: "Pattern weight", value: "0.20", usedBy: [], description: "Weight of dose-response pattern in signal score" },
  { key: "noael_confidence_penalty", name: "Confidence penalty", value: "\u22120.20 each", usedBy: ["R14", "R15"], description: "Each confidence penalty subtracts 0.20" },
  { key: "convergence_multiplier", name: "Convergence multiplier", value: "1 + 0.2 \u00d7 (n_domains \u2212 1)", usedBy: ["R08", "R09"], description: "Cross-domain evidence boost in evidence score" },
];

// ---------------------------------------------------------------------------
// Signal score weights & pattern scores
// ---------------------------------------------------------------------------

export const SIGNAL_SCORE_WEIGHTS = {
  pValue: 0.35,
  trend: 0.20,
  effectSize: 0.25,
  pattern: 0.20,
} as const;

export const PATTERN_SCORES: Record<string, number> = {
  monotonic_increase: 1.0,
  monotonic_decrease: 1.0,
  threshold: 0.7,
  non_monotonic: 0.3,
  flat: 0.0,
  insufficient_data: 0.0,
};

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

export const TIER_CLASSIFICATION = [
  { tier: "Critical", condition: "R08, or R04 + R10 + \u2265 2 warning endpoints" },
  { tier: "Notable", condition: "R04 or R10, or R01 in \u2265 2 endpoints" },
  { tier: "Observed", condition: "Everything else" },
] as const;

// ---------------------------------------------------------------------------
// Priority bands
// ---------------------------------------------------------------------------

export const PRIORITY_BANDS = [
  { range: "990\u20131000", section: "Decision", description: "NOAEL statement, critical mortality" },
  { range: "900\u2013989", section: "Finding", description: "Adverse classifications, target organ flags" },
  { range: "800\u2013899", section: "Qualifier", description: "Dose-response patterns, effect magnitudes" },
  { range: "600\u2013799", section: "Caveat", description: "Review flags, sex differences, low power" },
  { range: "400\u2013599", section: "Evidence", description: "Individual rule firings, domain counts" },
  { range: "200\u2013399", section: "Context", description: "Background, non-significant findings" },
] as const;

// ---------------------------------------------------------------------------
// NOAEL confidence penalties
// ---------------------------------------------------------------------------

export const NOAEL_CONFIDENCE_PENALTIES = [
  { key: "single_endpoint", name: "Single endpoint", penalty: -0.20, condition: "\u2264 1 adverse at LOAEL" },
  { key: "sex_inconsistency", name: "Sex inconsistency", penalty: -0.20, condition: "M and F NOAEL differ" },
  { key: "pathology_disagreement", name: "Pathology disagreement", penalty: -0.00, condition: "Reserved (annotation data unavailable)" },
  { key: "large_effect_non_sig", name: "Large effect non-significant", penalty: -0.20, condition: "|d| \u2265 1.0 AND p \u2265 0.05" },
] as const;

// ---------------------------------------------------------------------------
// Signal score breakdown computation
// ---------------------------------------------------------------------------

export interface SignalScoreBreakdown {
  pValueRaw: number | null;
  pValueComponent: number;
  trendRaw: number | null;
  trendComponent: number;
  effectSizeRaw: number | null;
  effectSizeComponent: number;
  patternRaw: string | null;
  patternComponent: number;
  total: number;
}

export function computeSignalScoreBreakdown(row: {
  p_value: number | null;
  trend_p: number | null;
  effect_size: number | null;
  dose_response_pattern: string | null;
}): SignalScoreBreakdown {
  let pValueComponent = 0;
  if (row.p_value != null && row.p_value > 0) {
    pValueComponent = SIGNAL_SCORE_WEIGHTS.pValue * Math.min(-Math.log10(row.p_value) / 4.0, 1.0);
  }

  let trendComponent = 0;
  if (row.trend_p != null && row.trend_p > 0) {
    trendComponent = SIGNAL_SCORE_WEIGHTS.trend * Math.min(-Math.log10(row.trend_p) / 4.0, 1.0);
  }

  let effectSizeComponent = 0;
  if (row.effect_size != null) {
    effectSizeComponent = SIGNAL_SCORE_WEIGHTS.effectSize * Math.min(Math.abs(row.effect_size) / 2.0, 1.0);
  }

  const patternScore = row.dose_response_pattern ? (PATTERN_SCORES[row.dose_response_pattern] ?? 0) : 0;
  const patternComponent = SIGNAL_SCORE_WEIGHTS.pattern * patternScore;

  const total = Math.min(pValueComponent + trendComponent + effectSizeComponent + patternComponent, 1.0);

  return {
    pValueRaw: row.p_value,
    pValueComponent,
    trendRaw: row.trend_p,
    trendComponent,
    effectSizeRaw: row.effect_size,
    effectSizeComponent,
    patternRaw: row.dose_response_pattern,
    patternComponent,
    total,
  };
}

// ---------------------------------------------------------------------------
// Evidence score breakdown computation
// ---------------------------------------------------------------------------

export interface EvidenceScoreBreakdown {
  avgSignalPerEndpoint: number;
  nEndpoints: number;
  nDomains: number;
  domains: string[];
  convergenceMultiplier: number;
  evidenceScore: number;
  meetsEvidenceThreshold: boolean;
  meetsSignificantThreshold: boolean;
}

export function computeEvidenceScoreBreakdown(organ: {
  evidence_score: number;
  n_endpoints: number;
  n_domains: number;
  domains: string[];
  n_significant: number;
}): EvidenceScoreBreakdown {
  const convergenceMultiplier = 1 + 0.2 * (organ.n_domains - 1);
  // Reverse-engineer: evidence = (total_signal / n_endpoints) * multiplier
  // So avgSignal = evidence / multiplier
  const avgSignalPerEndpoint = convergenceMultiplier > 0
    ? organ.evidence_score / convergenceMultiplier
    : 0;

  return {
    avgSignalPerEndpoint,
    nEndpoints: organ.n_endpoints,
    nDomains: organ.n_domains,
    domains: organ.domains,
    convergenceMultiplier,
    evidenceScore: organ.evidence_score,
    meetsEvidenceThreshold: organ.evidence_score >= 0.3,
    meetsSignificantThreshold: organ.n_significant >= 1,
  };
}

// ---------------------------------------------------------------------------
// NOAEL confidence breakdown computation
// ---------------------------------------------------------------------------

export interface ConfidenceBreakdown {
  base: number;
  singleEndpointPenalty: number;
  singleEndpointDetail: string;
  sexInconsistencyPenalty: number;
  sexInconsistencyDetail: string;
  pathologyPenalty: number;
  pathologyDetail: string;
  largeEffectPenalty: number;
  largeEffectDetail: string;
  total: number;
}

export function computeConfidenceBreakdown(
  row: {
    sex: string;
    noael_dose_level: number;
    noael_label: string;
    noael_confidence: number;
    n_adverse_at_loael: number;
  },
  allNoael: Array<{
    sex: string;
    noael_dose_level: number;
    noael_label: string;
    noael_confidence: number;
  }>,
): ConfidenceBreakdown {
  // Infer which penalties applied based on the stored confidence
  const base = 1.0;
  let remaining = base - row.noael_confidence;

  // Penalty 1: single endpoint
  const isSingleEndpoint = row.n_adverse_at_loael <= 1;
  const singleEndpointPenalty = isSingleEndpoint ? -0.20 : 0;
  if (isSingleEndpoint) remaining = Math.max(remaining - 0.2, 0);

  // Penalty 2: sex inconsistency
  let sexInconsistencyPenalty = 0;
  let sexInconsistencyDetail = "Same NOAEL for M and F";
  if (row.sex === "M" || row.sex === "F") {
    const opposite = row.sex === "M" ? "F" : "M";
    const oppRow = allNoael.find((r) => r.sex === opposite);
    if (oppRow && oppRow.noael_dose_level !== row.noael_dose_level) {
      // Check if remaining penalty budget allows it
      if (remaining >= 0.19) {
        sexInconsistencyPenalty = -0.20;
        remaining = Math.max(remaining - 0.2, 0);
        sexInconsistencyDetail = `${row.sex}: ${row.noael_label}, ${opposite}: ${oppRow.noael_label}`;
      }
    }
  } else if (row.sex === "Combined") {
    // For Combined, check if M and F differ
    const mRow = allNoael.find((r) => r.sex === "M");
    const fRow = allNoael.find((r) => r.sex === "F");
    if (mRow && fRow && mRow.noael_dose_level !== fRow.noael_dose_level) {
      if (remaining >= 0.19) {
        sexInconsistencyPenalty = -0.20;
        remaining = Math.max(remaining - 0.2, 0);
        sexInconsistencyDetail = `M: ${mRow.noael_label}, F: ${fRow.noael_label}`;
      }
    }
  }

  // Penalty 3: pathology disagreement (always 0)
  const pathologyPenalty = 0;

  // Penalty 4: large effect non-significant (whatever remains)
  const largeEffectPenalty = remaining >= 0.19 ? -0.20 : 0;

  return {
    base,
    singleEndpointPenalty,
    singleEndpointDetail: isSingleEndpoint
      ? `${row.n_adverse_at_loael} adverse at LOAEL`
      : `${row.n_adverse_at_loael} adverse at LOAEL`,
    sexInconsistencyPenalty,
    sexInconsistencyDetail,
    pathologyPenalty,
    pathologyDetail: "Reserved",
    largeEffectPenalty,
    largeEffectDetail: largeEffectPenalty < 0 ? "|d| \u2265 1.0, p \u2265 0.05 found" : "Not triggered",
    total: row.noael_confidence,
  };
}
