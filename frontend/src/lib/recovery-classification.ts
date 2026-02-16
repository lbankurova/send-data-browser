/**
 * Recovery classification — interpretive layer.
 * Consumes RecoveryAssessment (mechanical verdicts) and context
 * to produce pathologist-meaningful recovery classifications.
 *
 * This layer is for interpretive surfaces only (Insights pane, Hypotheses tab).
 * Evidence surfaces (findings table, dose charts, heatmaps) use recovery-assessment.ts.
 */

import type { RecoveryAssessment } from "./recovery-assessment";
import type { FindingNatureInfo } from "./finding-nature";

// ─── Types ────────────────────────────────────────────────

export type RecoveryClassificationType =
  | "EXPECTED_REVERSIBILITY"
  | "INCOMPLETE_RECOVERY"
  | "DELAYED_ONSET_POSSIBLE"
  | "INCIDENTAL_RECOVERY_SIGNAL"
  | "PATTERN_ANOMALY"
  | "UNCLASSIFIABLE";

export interface RecoveryClassification {
  classification: RecoveryClassificationType;
  confidence: "High" | "Moderate" | "Low";
  rationale: string;
  qualifiers: string[];
  recommendedAction?: string;
  inputsUsed: string[];
  inputsMissing: string[];
}

export interface RecoveryContext {
  // Available now
  isAdverse: boolean;
  doseConsistency: "Weak" | "Moderate" | "Strong" | "NonMonotonic";
  doseResponsePValue: number | null;
  clinicalClass: string | null;
  signalClass: "adverse" | "warning" | "normal";

  // Finding nature classification (keyword-based)
  findingNature?: FindingNatureInfo;

  // Future (nullable)
  historicalControlIncidence: number | null;
  crossDomainCorroboration: boolean | null;
  recoveryPeriodDays: number | null;
}

// ─── Display constants ───────────────────────────────────

export const CLASSIFICATION_LABELS: Record<RecoveryClassificationType, string> = {
  EXPECTED_REVERSIBILITY: "Expected reversibility",
  INCOMPLETE_RECOVERY: "Incomplete recovery",
  DELAYED_ONSET_POSSIBLE: "Delayed onset possible",
  INCIDENTAL_RECOVERY_SIGNAL: "Incidental recovery signal",
  PATTERN_ANOMALY: "Pattern anomaly",
  UNCLASSIFIABLE: "Recovery data inconclusive",
};

export const CLASSIFICATION_BORDER: Record<RecoveryClassificationType, string> = {
  EXPECTED_REVERSIBILITY: "border-l-2 border-l-emerald-400/40",
  INCOMPLETE_RECOVERY: "border-l-2 border-l-amber-400/60",
  DELAYED_ONSET_POSSIBLE: "border-l-2 border-l-amber-400/60",
  INCIDENTAL_RECOVERY_SIGNAL: "border-l-2 border-l-gray-300/40",
  PATTERN_ANOMALY: "border-l-2 border-l-red-400/40",
  UNCLASSIFIABLE: "border-l-2 border-l-gray-300/40",
};

/** Safety-conservative precedence: lower = more concerning = checked first. */
export const CLASSIFICATION_PRIORITY: Record<RecoveryClassificationType, number> = {
  PATTERN_ANOMALY: 0,
  DELAYED_ONSET_POSSIBLE: 1,
  INCOMPLETE_RECOVERY: 2,
  EXPECTED_REVERSIBILITY: 3,
  INCIDENTAL_RECOVERY_SIGNAL: 4,
  UNCLASSIFIABLE: 5,
};

// ─── Confidence model ────────────────────────────────────

const CONFIDENCE_RANK: Record<"High" | "Moderate" | "Low", number> = {
  High: 2,
  Moderate: 1,
  Low: 0,
};

const CONFIDENCE_ORDER: ("Low" | "Moderate" | "High")[] = ["Low", "Moderate", "High"];

/** Boost confidence by one tier (Low→Moderate, Moderate→High, High stays High). */
function boostConfidence(c: "Low" | "Moderate" | "High"): "Low" | "Moderate" | "High" {
  const idx = CONFIDENCE_RANK[c];
  return CONFIDENCE_ORDER[Math.min(idx + 1, 2)];
}

// ─── Guard verdicts ──────────────────────────────────────

const GUARD_VERDICTS = new Set([
  "not_examined",
  "insufficient_n",
  "low_power",
  "anomaly",
  "no_data",
]);

function buildGuardRationale(verdict: string): string {
  switch (verdict) {
    case "not_examined":
      return "Recovery tissue not examined \u2014 no reversibility assessment possible.";
    case "insufficient_n":
      return "Too few recovery-arm subjects examined for meaningful comparison.";
    case "low_power":
      return "Main-arm incidence too low for recovery sample size \u2014 comparison is not statistically informative.";
    case "anomaly":
      return "Recovery incidence exceeds main-arm incidence \u2014 pattern is biologically implausible and requires pathologist review.";
    case "no_data":
      return "No recovery data available for this finding.";
    default:
      return "Recovery assessment not possible due to data limitations.";
  }
}

function guardAction(verdict: string): string | undefined {
  switch (verdict) {
    case "not_examined":
      return "Confirm whether recovery-arm tissue was collected and evaluated.";
    case "anomaly":
      return "Histopath re-review and data QC recommended.";
    default:
      return undefined;
  }
}

// ─── Classification logic ────────────────────────────────

export function classifyRecovery(
  assessment: RecoveryAssessment,
  context: RecoveryContext,
): RecoveryClassification {
  const inputsUsed: string[] = [];
  const inputsMissing: string[] = [];

  // Track inputs
  inputsUsed.push("mechanical_verdict");
  if (context.isAdverse) inputsUsed.push("adverse_classification");
  if (context.doseConsistency !== "Weak") inputsUsed.push("dose_consistency");
  if (context.doseResponsePValue !== null) inputsUsed.push("dose_response_pvalue");
  else inputsMissing.push("dose_response_pvalue");
  if (context.clinicalClass) inputsUsed.push("clinical_catalog");
  if (context.historicalControlIncidence !== null) inputsUsed.push("historical_controls");
  else inputsMissing.push("historical_controls");
  if (context.crossDomainCorroboration !== null) inputsUsed.push("cross_domain_corroboration");
  else inputsMissing.push("cross_domain_corroboration");
  if (context.recoveryPeriodDays !== null) inputsUsed.push("recovery_period_days");
  else inputsMissing.push("recovery_period_days");

  // Step 0: Guard short-circuit
  if (GUARD_VERDICTS.has(assessment.overall)) {
    return {
      classification: "UNCLASSIFIABLE",
      confidence: "Low",
      rationale: buildGuardRationale(assessment.overall),
      qualifiers: [],
      recommendedAction: guardAction(assessment.overall),
      inputsUsed: ["mechanical_verdict"],
      inputsMissing: [],
    };
  }

  // Step 0b: Proliferative short-circuit — neoplastic findings are not expected to reverse
  if (context.findingNature?.nature === "proliferative") {
    return {
      classification: "UNCLASSIFIABLE",
      confidence: "High",
      rationale: "Neoplastic findings are not expected to reverse.",
      qualifiers: [],
      inputsUsed: ["mechanical_verdict", "finding_nature"],
      inputsMissing: [],
    };
  }

  // Track finding nature if available
  if (context.findingNature) inputsUsed.push("finding_nature");

  // Step 1: PATTERN_ANOMALY
  const isPatternAnomaly =
    assessment.assessments.some(
      (d) =>
        d.verdict !== "not_observed" &&
        d.recovery.incidence > d.main.incidence * 1.5 &&
        d.recovery.affected > d.main.affected,
    ) &&
    context.doseConsistency === "Weak" &&
    !context.isAdverse;

  if (isPatternAnomaly) {
    return {
      classification: "PATTERN_ANOMALY",
      confidence: computeConfidence("PATTERN_ANOMALY", assessment, context, inputsMissing),
      rationale:
        "Recovery incidence exceeds treatment-phase incidence without dose-response support. Pattern inconsistent with typical toxicologic progression.",
      qualifiers: [],
      recommendedAction: "Histopath re-review and data QC recommended.",
      inputsUsed,
      inputsMissing,
    };
  }

  // Step 2: DELAYED_ONSET_POSSIBLE
  const hasDelayedOnsetPattern = assessment.assessments.some(
    (d) =>
      d.main.incidence <= 0.10 &&
      d.recovery.incidence >= 0.20 &&
      d.recovery.affected >= 2,
  );
  let isDelayedOnset = hasDelayedOnsetPattern && !context.isAdverse;

  // Downgrade to INCIDENTAL if historical controls show background rate
  if (
    isDelayedOnset &&
    context.historicalControlIncidence !== null
  ) {
    const maxRecoveryInc = Math.max(
      ...assessment.assessments.map((d) => d.recovery.incidence),
    );
    if (maxRecoveryInc <= context.historicalControlIncidence * 1.5) {
      isDelayedOnset = false; // falls through to later checks
    }
  }

  if (isDelayedOnset) {
    const example = assessment.assessments.find(
      (d) =>
        d.main.incidence <= 0.10 &&
        d.recovery.incidence >= 0.20 &&
        d.recovery.affected >= 2,
    );
    const mainPct = example ? Math.round(example.main.incidence * 100) : 0;
    const recPct = example ? Math.round(example.recovery.incidence * 100) : 0;
    const qualifiers: string[] = [];
    if (context.historicalControlIncidence === null) {
      qualifiers.push(
        "Historical control data not available \u2014 cannot assess whether recovery incidence is within background range.",
      );
    }
    return {
      classification: "DELAYED_ONSET_POSSIBLE",
      confidence: computeConfidence("DELAYED_ONSET_POSSIBLE", assessment, context, inputsMissing),
      rationale: `Finding absent or minimal during treatment phase (${mainPct}%) but present during recovery (${recPct}%). May indicate delayed onset of treatment-related effect.`,
      qualifiers,
      recommendedAction:
        "Pathologist assessment required \u2014 evaluate whether finding is treatment-related with delayed manifestation.",
      inputsUsed,
      inputsMissing,
    };
  }

  // Step 3: INCOMPLETE_RECOVERY
  const hasMainSignal = assessment.assessments.some(
    (d) => d.main.incidence > 0.10 && d.main.affected >= 2,
  );
  const isMarginalReversing =
    assessment.overall === "reversing" &&
    assessment.assessments.some(
      (d) =>
        d.main.incidence > 0 && d.recovery.incidence / d.main.incidence > 0.60,
    );
  const isIncomplete =
    hasMainSignal &&
    (assessment.overall === "persistent" ||
      assessment.overall === "progressing" ||
      isMarginalReversing);

  if (isIncomplete) {
    let verdictDetail: string;
    if (assessment.overall === "persistent") {
      verdictDetail =
        "Incidence and severity remained at treatment-phase levels.";
    } else if (assessment.overall === "progressing") {
      verdictDetail =
        "Incidence or severity increased during recovery, suggesting ongoing progression.";
    } else {
      verdictDetail =
        "Partial reduction observed but finding remains in \u226560% of affected dose levels.";
    }
    const qualifiers: string[] = [];
    if (context.isAdverse) {
      qualifiers.push(
        "Finding was classified as treatment-related (adverse).",
      );
    }
    if (assessment.overall === "progressing") {
      qualifiers.push(
        "Finding shows progression \u2014 regulatory significance may be elevated.",
      );
    }
    // Finding nature qualifiers for INCOMPLETE_RECOVERY
    if (context.findingNature?.nature === "adaptive") {
      qualifiers.push(
        "Adaptive finding unexpectedly persistent \u2014 may indicate ongoing pharmacological activity.",
      );
    }
    if (context.findingNature?.nature === "degenerative" && context.findingNature.expected_reversibility === "none") {
      qualifiers.push(
        "Fibrotic changes are generally considered irreversible.",
      );
    }
    return {
      classification: "INCOMPLETE_RECOVERY",
      confidence: computeConfidence("INCOMPLETE_RECOVERY", assessment, context, inputsMissing),
      rationale: `Treatment-related finding persists during recovery phase. ${verdictDetail}`,
      qualifiers,
      inputsUsed,
      inputsMissing,
    };
  }

  // Step 4: EXPECTED_REVERSIBILITY
  const isExpectedReversibility =
    (assessment.overall === "reversed" || assessment.overall === "reversing") &&
    (context.isAdverse || context.doseConsistency !== "Weak");

  if (isExpectedReversibility) {
    const resolution =
      assessment.overall === "reversed"
        ? "complete resolution \u2014 no affected recovery subjects."
        : "partial resolution \u2014 incidence and/or severity reduced.";
    const qualifiers: string[] = [];
    if (context.doseConsistency === "Moderate") {
      qualifiers.push(
        "Dose-response in treatment phase was moderate \u2014 treatment-relatedness should be confirmed.",
      );
    }
    // Adaptive finding nature boost: increase confidence by one tier
    let confidence = computeConfidence("EXPECTED_REVERSIBILITY", assessment, context, inputsMissing);
    if (context.findingNature?.nature === "adaptive") {
      confidence = boostConfidence(confidence);
    }
    return {
      classification: "EXPECTED_REVERSIBILITY",
      confidence,
      rationale: `Treatment-related finding shows ${resolution}`,
      qualifiers,
      inputsUsed,
      inputsMissing,
    };
  }

  // Step 5: INCIDENTAL_RECOVERY_SIGNAL
  const isIncidentalRecoverySignal =
    !context.isAdverse &&
    context.doseConsistency === "Weak" &&
    (assessment.overall === "reversed" ||
      assessment.overall === "reversing" ||
      assessment.overall === "not_observed");

  if (isIncidentalRecoverySignal) {
    const qualifiers: string[] = [];
    if (context.historicalControlIncidence === null) {
      qualifiers.push(
        "Historical control data not available \u2014 cannot confirm background rate.",
      );
    }
    return {
      classification: "INCIDENTAL_RECOVERY_SIGNAL",
      confidence: computeConfidence("INCIDENTAL_RECOVERY_SIGNAL", assessment, context, inputsMissing),
      rationale:
        "Finding observed during recovery without supporting treatment-phase evidence. Likely incidental or background fluctuation.",
      qualifiers,
      inputsUsed,
      inputsMissing,
    };
  }

  // Step 6: Fallback
  return {
    classification: "UNCLASSIFIABLE",
    confidence: "Low",
    rationale:
      "Recovery pattern does not match any expected classification. Manual review recommended.",
    qualifiers: [],
    inputsUsed,
    inputsMissing,
  };
}

// ─── Confidence computation ──────────────────────────────

function computeConfidence(
  classification: RecoveryClassificationType,
  assessment: RecoveryAssessment,
  context: RecoveryContext,
  inputsMissing: string[],
): "High" | "Moderate" | "Low" {
  // Evaluate caps
  let maxAllowed = CONFIDENCE_RANK["High"];

  // Cap: any missing inputs that could change classification → Moderate
  if (inputsMissing.length > 0) {
    maxAllowed = Math.min(maxAllowed, CONFIDENCE_RANK["Moderate"]);
  }

  // Cap: weak dose-response on non-incidental classification
  if (
    context.doseConsistency === "Weak" &&
    classification !== "INCIDENTAL_RECOVERY_SIGNAL"
  ) {
    maxAllowed = Math.min(maxAllowed, CONFIDENCE_RANK["Moderate"]);
  }

  // Cap: examined < 5 at any dose level
  const minExamined = Math.min(
    ...assessment.assessments.map((d) => d.recovery.examined),
  );
  if (minExamined < 5) {
    maxAllowed = Math.min(maxAllowed, CONFIDENCE_RANK["Low"]);
  }

  // Cap: normal signal with no clinical match
  if (context.signalClass === "normal" && !context.clinicalClass) {
    maxAllowed = Math.min(maxAllowed, CONFIDENCE_RANK["Moderate"]);
  }

  // Compute base score
  let score = 0;

  // Sample size
  if (minExamined >= 10) score += 2;
  else if (minExamined >= 5) score += 1;

  // Effect size (incidence change)
  const maxIncidenceDelta = Math.max(
    ...assessment.assessments.map((d) =>
      Math.abs(d.recovery.incidence - d.main.incidence),
    ),
  );
  if (maxIncidenceDelta >= 0.30) score += 2;
  else if (maxIncidenceDelta >= 0.15) score += 1;

  // Severity change
  const maxSevDelta = Math.max(
    ...assessment.assessments.map((d) =>
      Math.abs(d.recovery.avgSeverity - d.main.avgSeverity),
    ),
  );
  if (maxSevDelta >= 1.0) score += 1;

  // Dose-response support
  if (context.doseConsistency === "Strong") score += 1;
  if (context.doseResponsePValue !== null && context.doseResponsePValue < 0.05)
    score += 1;

  // Cross-domain corroboration (future)
  if (context.crossDomainCorroboration === true) score += 1;

  // Map score to tier
  const base = score >= 5 ? "High" : score >= 3 ? "Moderate" : "Low";

  // Apply cap
  return CONFIDENCE_ORDER[Math.min(CONFIDENCE_RANK[base], maxAllowed)];
}

// ─── Specimen-level summary ──────────────────────────────

export function classifySpecimenRecovery(
  classifications: RecoveryClassification[],
): RecoveryClassification {
  // Filter out UNCLASSIFIABLE with no qualifiers
  const meaningful = classifications.filter(
    (c) =>
      c.classification !== "UNCLASSIFIABLE" || c.qualifiers.length > 0,
  );

  if (meaningful.length === 0) {
    return {
      classification: "UNCLASSIFIABLE",
      confidence: "Low",
      rationale: "No classifiable recovery patterns found across specimen findings.",
      qualifiers: [],
      inputsUsed: [],
      inputsMissing: [],
    };
  }

  // Worst classification by precedence
  const worst = meaningful.reduce((a, b) =>
    CLASSIFICATION_PRIORITY[a.classification] <
    CLASSIFICATION_PRIORITY[b.classification]
      ? a
      : b,
  );

  // Minimum confidence across meaningful
  const minConfidence = meaningful.reduce((a, b) =>
    CONFIDENCE_RANK[a.confidence] < CONFIDENCE_RANK[b.confidence] ? a : b,
  ).confidence;

  // Build specimen rationale
  const classificationCounts = new Map<RecoveryClassificationType, number>();
  for (const c of meaningful) {
    classificationCounts.set(
      c.classification,
      (classificationCounts.get(c.classification) ?? 0) + 1,
    );
  }
  const parts: string[] = [];
  for (const [type, count] of classificationCounts) {
    if (type !== "UNCLASSIFIABLE") {
      parts.push(`${count} ${CLASSIFICATION_LABELS[type].toLowerCase()}`);
    }
  }
  const rationale =
    parts.length > 0
      ? `Specimen-level assessment based on ${meaningful.length} findings: ${parts.join(", ")}.`
      : worst.rationale;

  // Deduplicate qualifiers
  const allQualifiers = meaningful.flatMap((c) => c.qualifiers);
  const uniqueQualifiers = [...new Set(allQualifiers)];

  return {
    classification: worst.classification,
    confidence: minConfidence,
    rationale,
    qualifiers: uniqueQualifiers,
    inputsUsed: [...new Set(meaningful.flatMap((c) => c.inputsUsed))],
    inputsMissing: [...new Set(meaningful.flatMap((c) => c.inputsMissing))],
  };
}
