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
  "autolysis",
  "artifact",
  "basophilic tubules",
  "lipofuscin",
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

  // Step 4: historical control override (stub)
  if (input.historicalControlRate != null && input.controlIncidence > input.historicalControlRate * 1.5) {
    return { ...base, classification: "background", qualifier: "elevated-control" };
  }

  // Check pharmacological exclusions
  const findingLower = input.finding.toLowerCase();
  const isExcluded = PHARMACOLOGICAL_EXCLUSIONS.some((ex) => findingLower.includes(ex));
  if (isExcluded) {
    return { ...base, classification: "treatment-decrease" };
  }

  // Step 3: dose consistency + correlates
  const hasStrongDose = input.doseConsistency === "Strong" || input.doseConsistency === "Moderate";
  const hasCorrelates = input.crossDomainCorrelateCount >= 2;

  if (hasStrongDose && hasCorrelates) {
    // Check for consequence finding (downgrades pharmacological → treatment-decrease)
    if (isConsequenceFinding(input.finding, input.crossDomainCorrelateCount)) {
      return { ...base, classification: "treatment-decrease", qualifier: "consequence" };
    }
    return { ...base, classification: "pharmacological" };
  }

  if (hasStrongDose || hasCorrelates) {
    return { ...base, classification: "treatment-decrease" };
  }

  return { ...base, classification: "background" };
}

// ─── Consequence finding heuristic ────────────────────────

/**
 * Heuristic: a finding is likely a "consequence" (secondary to another
 * primary pathology) rather than a direct pharmacological effect when:
 * - Its nature is structural/compositional (degenerative, proliferative)
 * - AND it has ≥2 cross-domain correlates (suggesting a systemic primary effect)
 */
export function isConsequenceFinding(finding: string, crossDomainCorrelateCount: number): boolean {
  const nature = classifyFindingNature(finding);
  const isStructural = nature.nature === "degenerative" || nature.nature === "proliferative";
  return isStructural && crossDomainCorrelateCount >= 2;
}

// ─── Badge styling ────────────────────────────────────────

const BADGE_STYLES: Record<ProtectiveClassification, string> = {
  pharmacological: "bg-blue-100 text-blue-700 text-[9px]",
  "treatment-decrease": "bg-slate-100 text-slate-600 text-[9px]",
  background: "bg-gray-100 text-gray-500 text-[9px]",
};

export function getProtectiveBadgeStyle(classification: ProtectiveClassification): string {
  return BADGE_STYLES[classification];
}
