/**
 * Laterality utilities for paired-organ histopathology findings.
 *
 * Paired organs (kidney, adrenal, testis, etc.) can have laterality
 * (LEFT, RIGHT, BILATERAL) recorded in MILAT/MALAT SEND columns.
 */
import type { SubjectHistopathEntry } from "@/types/timecourse";

/** Canonical set of paired organs (uppercase for matching). */
const PAIRED_ORGANS = new Set([
  "KIDNEY",
  "ADRENAL",
  "ADRENAL GLAND",
  "TESTIS",
  "TESTES",
  "OVARY",
  "OVARIES",
  "EYE",
  "EYES",
  "EPIDIDYMIS",
  "EPIDIDYMIDES",
  "LUNG",
  "LUNGS",
  "MAMMARY GLAND",
  "THYROID",
  "THYROID GLAND",
  "PARATHYROID",
  "PARATHYROID GLAND",
  "SALIVARY GLAND",
  "SALIVARY GLANDS",
]);

/** Check if a specimen is a paired organ (laterality is meaningful). */
export function isPairedOrgan(specimen: string): boolean {
  return PAIRED_ORGANS.has(specimen.toUpperCase().replace(/_/g, " "));
}

/** Check if any subject in the dataset has non-null laterality for any finding. */
export function specimenHasLaterality(subjects: SubjectHistopathEntry[]): boolean {
  for (const s of subjects) {
    for (const fData of Object.values(s.findings)) {
      if (fData.laterality) return true;
    }
  }
  return false;
}

export interface LateralityAggregate {
  left: number;
  right: number;
  bilateral: number;
  total: number;
}

/** Aggregate laterality counts across subjects for a specific finding. */
export function aggregateFindingLaterality(
  subjects: SubjectHistopathEntry[],
  finding: string,
): LateralityAggregate {
  let left = 0;
  let right = 0;
  let bilateral = 0;
  let total = 0;

  for (const s of subjects) {
    const fData = s.findings[finding];
    if (!fData) continue;
    total++;
    const lat = fData.laterality?.toUpperCase();
    if (lat === "LEFT") left++;
    else if (lat === "RIGHT") right++;
    else if (lat === "BILATERAL") bilateral++;
  }

  return { left, right, bilateral, total };
}

/** Short label for a laterality value (e.g., "L", "R", "B"). */
export function lateralityShortLabel(lat: string | null | undefined): string {
  if (!lat) return "";
  const u = lat.toUpperCase();
  if (u === "LEFT") return "L";
  if (u === "RIGHT") return "R";
  if (u === "BILATERAL") return "B";
  return u.charAt(0);
}

/** Produce a compact laterality summary string (e.g., "3L 2R 1B"). */
export function lateralitySummary(agg: LateralityAggregate): string {
  const parts: string[] = [];
  if (agg.left > 0) parts.push(`${agg.left}L`);
  if (agg.right > 0) parts.push(`${agg.right}R`);
  if (agg.bilateral > 0) parts.push(`${agg.bilateral}B`);
  return parts.join(" ");
}

/**
 * Laterality signal modifier (IMP-08).
 *
 * Converts laterality distribution into a confidence modifier:
 * - Predominantly bilateral (>60%) → +0.2 (supports treatment-related)
 * - Predominantly unilateral (>60%) → -0.2 (may be incidental)
 * - Mixed or too few affected → 0 (no adjustment)
 */
export function lateralitySignalModifier(
  agg: LateralityAggregate,
): { modifier: number; interpretation: string } {
  if (agg.total < 3) {
    return { modifier: 0, interpretation: "Too few affected to assess laterality pattern" };
  }

  const bilateralFrac = agg.bilateral / agg.total;
  const leftFrac = agg.left / agg.total;
  const rightFrac = agg.right / agg.total;

  if (bilateralFrac > 0.6) {
    return { modifier: 0.2, interpretation: "Predominantly bilateral \u2014 supports treatment-related effect" };
  }
  if (leftFrac > 0.6 || rightFrac > 0.6) {
    return { modifier: -0.2, interpretation: "Predominantly unilateral \u2014 may be incidental" };
  }
  return { modifier: 0, interpretation: "Mixed laterality pattern" };
}
