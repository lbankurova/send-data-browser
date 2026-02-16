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
