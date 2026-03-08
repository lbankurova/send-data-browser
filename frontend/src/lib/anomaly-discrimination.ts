/**
 * Anomaly discrimination — multi-factor classification for findings
 * absent in main arm but present in recovery arm.
 *
 * Replaces the blanket "anomaly" → UNCLASSIFIABLE short-circuit with
 * a decision tree that distinguishes:
 *   - delayed_onset: treatment-related delayed effect (precursor present, dose-response)
 *   - delayed_onset_possible: some evidence, cannot rule out spontaneous
 *   - possible_spontaneous: consistent with background incidence
 *   - anomaly_unresolved: insufficient evidence to classify
 *
 * First-principles implementation. Brief 8 deep research will provide
 * literature-backed precursor maps and propensity tables to refine this.
 */

import type { FindingNature } from "./finding-nature";
import type { RecoveryAssessment, RecoveryDoseAssessment } from "./recovery-assessment";
import type { RecoveryContext } from "./recovery-classification";

// ─── Types ────────────────────────────────────────────────

export type AnomalySubtype =
  | "delayed_onset"
  | "delayed_onset_possible"
  | "possible_spontaneous"
  | "anomaly_unresolved";

export interface AnomalyDiscrimination {
  subtype: AnomalySubtype;
  confidence: "High" | "Moderate" | "Low";
  rationale: string;
  qualifiers: string[];
  recommendedAction: string;
  evidence: {
    doseResponseInRecovery: boolean | null;
    precursorInMain: string[] | null;
    withinHistoricalControl: boolean | null;
    singleAnimalOnly: boolean;
    findingDelayedOnsetPropensity: DelayedOnsetPropensity;
    recoverySeverity: "minimal" | "higher";
  };
}

// ─── Precursor map ───────────────────────────────────────

/**
 * Directed graph: precursor finding → possible delayed sequelae.
 * Keys and values are lowercased substrings — matching uses `includes()`.
 */
export const PRECURSOR_MAP: Record<string, string[]> = {
  // Degenerative sequelae
  "necrosis": ["fibrosis", "scarring", "cirrhosis"],
  "degeneration": ["necrosis", "atrophy", "fibrosis"],
  // Inflammatory → chronic
  "inflammation": ["fibrosis", "granuloma"],
  // Proliferative cascade
  "hyperplasia": ["adenoma"],
  "hypertrophy": ["hyperplasia"],
  // Endocrine feedback
  "follicular cell hypertrophy": ["follicular cell hyperplasia", "colloid alteration"],
  // Immune reconstitution
  "lymphoid depletion": ["lymphoid hyperplasia", "extramedullary hematopoiesis"],
  "cortical atrophy": ["cortical hyperplasia"],
  // Spermatogenic cycle
  "germ cell degeneration": ["decreased spermatogenesis", "tubular atrophy"],
  // Bone marrow
  "myeloid depletion": ["extramedullary hematopoiesis", "increased cellularity"],
  "erythroid depletion": ["reticulocytosis", "extramedullary hematopoiesis"],
};

/**
 * Check if `precursorFinding` is a known precursor of `recoveryFinding`.
 * Both are matched as lowercased substrings against the PRECURSOR_MAP.
 */
export function isPrecursorOf(precursorFinding: string, recoveryFinding: string): boolean {
  const precursorLower = precursorFinding.toLowerCase();
  const recoveryLower = recoveryFinding.toLowerCase();

  for (const [key, sequelae] of Object.entries(PRECURSOR_MAP)) {
    // Check if the precursor finding matches a precursor key
    if (!precursorLower.includes(key)) continue;
    // Check if the recovery finding matches any of the sequelae
    for (const sequel of sequelae) {
      if (recoveryLower.includes(sequel)) return true;
    }
  }
  return false;
}

// ─── Delayed-onset propensity ────────────────────────────

export type DelayedOnsetPropensity = "high" | "moderate" | "low" | "none";

export const DELAYED_ONSET_PROPENSITY: Record<FindingNature, DelayedOnsetPropensity> = {
  degenerative: "high",     // fibrosis, atrophy follow initial injury
  inflammatory: "moderate", // chronic inflammation can develop post-exposure
  adaptive: "low",          // adaptive changes typically present during exposure
  vascular: "low",
  depositional: "low",
  proliferative: "none",    // neoplasia handled separately
  unknown: "low",
};

// ─── Discrimination logic ────────────────────────────────

/**
 * Discriminate an "anomaly" verdict into a specific subtype.
 *
 * @param assessment  The finding with overall === "anomaly"
 * @param allAssessments  All findings for the same specimen (for precursor check)
 * @param context  Classification context
 */
export function discriminateAnomaly(
  assessment: RecoveryAssessment,
  allAssessments: RecoveryAssessment[],
  context: RecoveryContext,
): AnomalyDiscrimination {
  const nature = context.findingNature?.nature ?? "unknown";
  const propensity = DELAYED_ONSET_PROPENSITY[nature];
  const anomalyDoses = assessment.assessments.filter((d) => d.verdict === "anomaly");
  const totalRecoveryAffected = anomalyDoses.reduce((sum, d) => sum + d.recovery.affected, 0);
  const maxRecoverySeverity = Math.max(0, ...anomalyDoses.map((d) => d.recovery.maxSeverity));
  const recoverySeverity: "minimal" | "higher" = maxRecoverySeverity <= 1 ? "minimal" : "higher";

  // ── Step 1: Precursor check ──
  const precursorsFound = findPrecursorsInMain(assessment.finding, allAssessments);
  if (precursorsFound.length > 0) {
    // Check if any precursor is dose-related (appears at >1 dose level)
    const precursorDoseRelated = precursorsFound.some((pf) => {
      const precursorAssessment = allAssessments.find((a) => a.finding === pf);
      if (!precursorAssessment) return false;
      const mainDosesWithFinding = precursorAssessment.assessments.filter(
        (d) => d.main.affected > 0,
      );
      return mainDosesWithFinding.length >= 2;
    });

    return {
      subtype: "delayed_onset",
      confidence: precursorDoseRelated ? "High" : "Moderate",
      rationale: `Precursor finding${precursorsFound.length > 1 ? "s" : ""} (${precursorsFound.join(", ")}) observed in main arm — consistent with delayed manifestation of treatment-related effect.`,
      qualifiers: precursorDoseRelated
        ? ["Precursor shows dose-response in treatment phase."]
        : ["Precursor not clearly dose-related — delayed onset interpretation is less certain."],
      recommendedAction: "Evaluate whether recovery finding represents progression of main-arm pathology. Consider safety margin implications.",
      evidence: {
        doseResponseInRecovery: null,
        precursorInMain: precursorsFound,
        withinHistoricalControl: null,
        singleAnimalOnly: totalRecoveryAffected <= 1,
        findingDelayedOnsetPropensity: propensity,
        recoverySeverity,
      },
    };
  }

  // ── Step 2: Dose-response in recovery arm ──
  const doseResponseInRecovery = checkDoseResponseInRecovery(anomalyDoses);
  if (doseResponseInRecovery && anomalyDoses.length >= 2) {
    const subtype: AnomalySubtype = propensity === "high" ? "delayed_onset" : "delayed_onset_possible";
    const confidence: "High" | "Moderate" | "Low" = propensity === "high" ? "Moderate" : "Low";
    return {
      subtype,
      confidence,
      rationale: `Recovery incidence increases with dose level — dose-response pattern suggests treatment-related delayed effect.`,
      qualifiers: propensity === "high"
        ? [`Finding type (${nature}) has high delayed-onset propensity.`]
        : [`Finding type (${nature}) does not typically show delayed onset — exercise caution.`],
      recommendedAction: "Pathologist assessment required — evaluate whether finding is treatment-related with delayed manifestation.",
      evidence: {
        doseResponseInRecovery: true,
        precursorInMain: null,
        withinHistoricalControl: null,
        singleAnimalOnly: totalRecoveryAffected <= 1,
        findingDelayedOnsetPropensity: propensity,
        recoverySeverity,
      },
    };
  }

  // ── Step 3: Historical control check ──
  if (context.historicalControlIncidence != null) {
    const maxRecoveryIncidence = Math.max(0, ...anomalyDoses.map((d) => d.recovery.incidence));
    if (maxRecoveryIncidence <= context.historicalControlIncidence * 1.5) {
      return {
        subtype: "possible_spontaneous",
        confidence: "Moderate",
        rationale: `Recovery incidence (${Math.round(maxRecoveryIncidence * 100)}%) is within 1.5× historical control range — consistent with background variation.`,
        qualifiers: [],
        recommendedAction: "No action required unless other evidence suggests treatment relationship.",
        evidence: {
          doseResponseInRecovery: doseResponseInRecovery,
          precursorInMain: null,
          withinHistoricalControl: true,
          singleAnimalOnly: totalRecoveryAffected <= 1,
          findingDelayedOnsetPropensity: propensity,
          recoverySeverity,
        },
      };
    }
  }

  // ── Step 3b: Same finding treatment-related at higher doses ──
  // If this exact finding is present in the main arm at higher doses, the anomaly
  // at lower doses likely reflects sub-threshold delayed expression — not spontaneous.
  // Biological rationale: dose-dependent adaptive/degenerative changes can manifest
  // below the histological detection threshold during dosing but appear in recovery
  // as the biological process completes (e.g., enzyme induction → hypertrophy).
  const sameFindingAtHigherDose = checkSameFindingAtHigherDose(assessment);
  if (sameFindingAtHigherDose) {
    return {
      subtype: "delayed_onset_possible",
      confidence: "Low",
      rationale: `Same finding is treatment-related at higher dose(s) in main arm. Recovery-only occurrence at lower dose is consistent with sub-threshold delayed expression rather than spontaneous incidence.`,
      qualifiers: [
        `Finding type (${nature}) — sub-threshold effects may manifest after continued low-level exposure or during recovery.`,
      ],
      recommendedAction: "Consider whether the dose-response continuum extends to this dose level. Pathologist assessment recommended.",
      evidence: {
        doseResponseInRecovery: doseResponseInRecovery,
        precursorInMain: null,
        withinHistoricalControl: context.historicalControlIncidence != null ? false : null,
        singleAnimalOnly: totalRecoveryAffected <= 1,
        findingDelayedOnsetPropensity: propensity,
        recoverySeverity,
      },
    };
  }

  // ── Step 4: Single-animal check ──
  if (totalRecoveryAffected <= 1 && (propensity === "low" || propensity === "none")) {
    return {
      subtype: "possible_spontaneous",
      confidence: "Low",
      rationale: `Single animal affected in recovery with no main-arm signal. Finding type (${nature}) has low delayed-onset propensity — likely incidental.`,
      qualifiers: [
        "Low confidence — cannot fully exclude treatment relationship with one affected animal.",
      ],
      recommendedAction: "No specific action unless finding is of particular toxicological concern.",
      evidence: {
        doseResponseInRecovery: doseResponseInRecovery,
        precursorInMain: null,
        withinHistoricalControl: context.historicalControlIncidence != null ? false : null,
        singleAnimalOnly: true,
        findingDelayedOnsetPropensity: propensity,
        recoverySeverity,
      },
    };
  }

  // ── Step 5: Fallback ──
  return {
    subtype: "anomaly_unresolved",
    confidence: "Low",
    rationale: "Finding present in recovery but absent in main arm. Insufficient evidence to determine whether this represents delayed onset, spontaneous occurrence, or data quality issue.",
    qualifiers: context.historicalControlIncidence == null
      ? ["Historical control data not available — cannot assess background rate."]
      : [],
    recommendedAction: "Histopath re-review and data QC recommended. Pathologist adjudication required.",
    evidence: {
      doseResponseInRecovery: doseResponseInRecovery,
      precursorInMain: null,
      withinHistoricalControl: context.historicalControlIncidence != null ? false : null,
      singleAnimalOnly: totalRecoveryAffected <= 1,
      findingDelayedOnsetPropensity: propensity,
      recoverySeverity,
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────

/**
 * Find other findings in `allAssessments` that are known precursors
 * of `targetFinding` and have main-arm incidence > 0 at any dose.
 */
function findPrecursorsInMain(
  targetFinding: string,
  allAssessments: RecoveryAssessment[],
): string[] {
  const precursors: string[] = [];
  for (const other of allAssessments) {
    if (other.finding === targetFinding) continue;
    // Does the other finding have main-arm presence?
    const hasMainPresence = other.assessments.some((d) => d.main.affected > 0);
    if (!hasMainPresence) continue;
    // Is the other finding a known precursor of the target?
    if (isPrecursorOf(other.finding, targetFinding)) {
      precursors.push(other.finding);
    }
  }
  return precursors;
}

/**
 * Check if recovery incidence increases with dose level among anomaly doses.
 * Simple monotonicity check: highest dose has highest (or tied) recovery incidence.
 */
function checkDoseResponseInRecovery(anomalyDoses: RecoveryDoseAssessment[]): boolean {
  if (anomalyDoses.length < 2) return false;
  const sorted = [...anomalyDoses].sort((a, b) => a.doseLevel - b.doseLevel);
  const lowestIncidence = sorted[0].recovery.incidence;
  const highestIncidence = sorted[sorted.length - 1].recovery.incidence;
  return highestIncidence > lowestIncidence;
}

/**
 * Check if the SAME finding is present in the main arm at any higher dose level.
 * When a finding is treatment-related at high dose but shows 0% main → >0% recovery
 * at a lower dose, the recovery occurrence likely reflects sub-threshold delayed
 * expression rather than spontaneous incidence.
 *
 * @method CLASS-20b — Same-finding dose extrapolation
 */
function checkSameFindingAtHigherDose(assessment: RecoveryAssessment): boolean {
  const anomalyDoses = assessment.assessments.filter((d) => d.verdict === "anomaly");
  const nonAnomalyDoses = assessment.assessments.filter(
    (d) => d.verdict !== "anomaly" && d.main.affected > 0,
  );
  if (nonAnomalyDoses.length === 0) return false;

  // Is there any non-anomaly dose level HIGHER than any anomaly dose level?
  const maxAnomalyDose = Math.max(...anomalyDoses.map((d) => d.doseLevel));
  return nonAnomalyDoses.some((d) => d.doseLevel > maxAnomalyDose);
}
