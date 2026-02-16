/**
 * Protective signal classification — three-tier categorization for
 * decreased-incidence histopathology findings.
 *
 * Replaces the binary repurposing flag with scientifically grounded
 * classification: pharmacological, treatment-decrease, or background.
 */

import { classifyFindingNature } from "@/lib/finding-nature";

// ─── Types ────────────────────────────────────────────────

export type ProtectiveClassification = "pharmacological" | "treatment-decrease" | "background";

export interface ProtectiveSignalResult {
  classification: ProtectiveClassification;
  qualifier?: "elevated-control" | "consequence";
  decreaseMagnitude: number;
  direction: "decreasing";
}

// ─── Pharmacological exclusion list ───────────────────────

/**
 * Findings that should never be classified as pharmacological.
 * These are artifacts, incidental, or secondary to other pathology.
 */
export const PHARMACOLOGICAL_EXCLUSIONS: string[] = [
  // Artifacts and processing-related
  "autolysis",
  "artifact",
  "postmortem",
  // Age-related degenerative findings
  "basophilic tubules",
  "chronic progressive nephropathy",
  "lipofuscin",
  "brown discoloration",
  // Additional incidental/secondary findings
  "pigment",
  "mineralization",
  "cyst",
  "dilatation",
  "ectasia",
  "congestion",
  "hemorrhage",
  "thrombus",
  "foreign body",
  "parasite",
];

// ─── Classification logic ─────────────────────────────────

export interface ClassifyProtectiveInput {
  finding: string;
  controlIncidence: number;
  highDoseIncidence: number;
  doseConsistency: "Weak" | "Moderate" | "Strong" | "NonMonotonic";
  direction: "increasing" | "decreasing" | "mixed" | "flat";
  crossDomainCorrelateCount: number;
  historicalControlRate?: number | null;
}

/**
 * Classify a decreased-incidence finding into one of three tiers.
 *
 * Step 1: Directionality gate — only "decreasing" enters.
 * Step 2: Magnitude check — <15pp decrease or control <10% → background.
 * Step 3: Dose consistency + cross-domain correlates → pharmacological / treatment-decrease / background.
 * Step 4: Historical control override (stub — fires when data provided).
 */
export function classifyProtectiveSignal(input: ClassifyProtectiveInput): ProtectiveSignalResult | null {
  // Step 1: directionality gate
  if (input.direction !== "decreasing") return null;

  const decreaseMagnitude = input.controlIncidence - input.highDoseIncidence;
  const base: Omit<ProtectiveSignalResult, "classification"> = {
    decreaseMagnitude,
    direction: "decreasing",
  };

  // Step 2: magnitude check
  if (decreaseMagnitude < 0.15 || input.controlIncidence < 0.10) {
    return { ...base, classification: "background" };
  }

  // Check pharmacological exclusions
  const findingLower = input.finding.toLowerCase();
  const isExcluded = PHARMACOLOGICAL_EXCLUSIONS.some((ex) => findingLower.includes(ex));
  if (isExcluded) {
    return { ...base, classification: "treatment-decrease" };
  }

  // Step 3: dose consistency + correlates
  // Spec: Strong + ≥2 correlates → pharmacological (with consequence check)
  //        Strong OR (Moderate + ≥1 correlate) → treatment-decrease
  //        Otherwise → background
  const isStrong = input.doseConsistency === "Strong";
  const isModerate = input.doseConsistency === "Moderate";

  let classification: ProtectiveClassification;
  let qualifier: ProtectiveSignalResult["qualifier"];

  if (isStrong && input.crossDomainCorrelateCount >= 2) {
    // Check for consequence finding (downgrades pharmacological → treatment-decrease)
    if (isConsequenceFinding(input.finding, input.crossDomainCorrelateCount)) {
      classification = "treatment-decrease";
      qualifier = "consequence";
    } else {
      classification = "pharmacological";
    }
  } else if (isStrong || (isModerate && input.crossDomainCorrelateCount >= 1)) {
    classification = "treatment-decrease";
  } else {
    classification = "background";
  }

  // Step 4: historical control override (stub — fires when data provided)
  if (input.historicalControlRate != null) {
    // Elevated control: control incidence far above historical rate → may be regression to mean
    if (input.controlIncidence > input.historicalControlRate * 1.5) {
      // Only downgrade if we classified above background
      if (classification !== "background") {
        return { ...base, classification: "background", qualifier: "elevated-control" };
      }
    }
    // Below historical floor: high-dose pushed below normal range → upgrade to at least treatment-decrease
    if (input.highDoseIncidence < input.historicalControlRate * 0.5 && classification === "background") {
      classification = "treatment-decrease";
    }
  }

  return { ...base, classification, qualifier };
}

// ─── Consequence finding heuristic ────────────────────────

/**
 * Heuristic: a finding is likely a "consequence" (secondary to another
 * primary pathology) rather than a direct pharmacological effect when:
 * - Its nature is structural/compositional (degenerative, proliferative,
 *   or adaptive-compositional like fat vacuoles, pigmentation)
 * - AND it has ≥2 cross-domain correlates (suggesting a systemic primary effect)
 */
export function isConsequenceFinding(finding: string, crossDomainCorrelateCount: number): boolean {
  const nature = classifyFindingNature(finding);
  // Structural/compositional: degenerative, proliferative, AND adaptive findings
  // that represent compositional changes (vacuolation = fat displacement,
  // pigmentation = pigment deposition). These are downstream morphological
  // consequences rather than direct pharmacological effects.
  const isStructural = nature.nature === "degenerative"
    || nature.nature === "proliferative"
    || isCompositionalAdaptive(finding);
  return isStructural && crossDomainCorrelateCount >= 2;
}

/**
 * Subset of "adaptive" findings that represent compositional/structural
 * changes rather than functional adaptations. Fat vacuoles, pigmentation,
 * and similar findings decrease because something else changed (e.g., marrow
 * cellularity increased, displacing fat).
 */
function isCompositionalAdaptive(finding: string): boolean {
  const lower = finding.toLowerCase();
  return lower.includes("vacuol") // fat vacuoles, vacuolation
    || lower.includes("pigment") // pigmentation
    || lower.includes("fat ")   // fat deposition
    || lower.includes("lipid"); // lipid accumulation
}

// ─── Badge styling ────────────────────────────────────────

const BADGE_STYLES: Record<ProtectiveClassification, string> = {
  pharmacological: "bg-blue-100 text-blue-700 text-[9px] font-medium",
  "treatment-decrease": "bg-slate-100 text-slate-600 text-[9px] font-medium",
  background: "bg-gray-100 text-gray-500 text-[9px] font-medium",
};

export function getProtectiveBadgeStyle(classification: ProtectiveClassification): string {
  return BADGE_STYLES[classification];
}
