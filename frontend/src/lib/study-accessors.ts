import type { StudyMetadata } from "@/hooks/useStudyPortfolio";

/**
 * Resolved accessor utilities for dual-layer (reported/derived) study data.
 *
 * These functions implement the same logic as backend accessors:
 * - Reported layer (from nSDRG) is preferred
 * - Derived layer (from XPT analysis) is fallback
 * - Discrepancy detection when both exist and differ
 */

export interface ResolvedNoael {
  dose: number;
  unit: string;
  source: "reported" | "derived";
  basisOrMethod: string;
}

export interface ResolvedLoael {
  dose: number;
  unit: string;
  source: "reported" | "derived";
}

/**
 * Get resolved target organs: reported preferred, derived fallback.
 */
export function targetOrgans(study: StudyMetadata): string[] {
  if (study.target_organs_reported) return study.target_organs_reported;
  if (study.target_organs_derived) return study.target_organs_derived;
  return [];
}

/**
 * Get resolved NOAEL: reported preferred, derived fallback.
 */
export function noael(study: StudyMetadata): ResolvedNoael | null {
  if (study.noael_reported) {
    return {
      dose: study.noael_reported.dose,
      unit: study.noael_reported.unit,
      source: "reported",
      basisOrMethod: study.noael_reported.basis,
    };
  }
  if (study.noael_derived) {
    return {
      dose: study.noael_derived.dose,
      unit: study.noael_derived.unit,
      source: "derived",
      basisOrMethod: study.noael_derived.method,
    };
  }
  return null;
}

/**
 * Get resolved LOAEL: reported preferred, derived fallback.
 */
export function loael(study: StudyMetadata): ResolvedLoael | null {
  if (study.loael_reported) {
    return {
      dose: study.loael_reported.dose,
      unit: study.loael_reported.unit,
      source: "reported",
    };
  }
  if (study.loael_derived) {
    return {
      dose: study.loael_derived.dose,
      unit: study.loael_derived.unit,
      source: "derived",
    };
  }
  return null;
}

/**
 * Check if reported and derived target organs differ.
 */
export function hasTargetOrganDiscrepancy(study: StudyMetadata): boolean {
  if (!study.target_organs_reported || !study.target_organs_derived) return false;

  const rSet = new Set(study.target_organs_reported);
  const dSet = new Set(study.target_organs_derived);

  // Check if sets are different in size or content
  if (rSet.size !== dSet.size) return true;
  for (const organ of rSet) {
    if (!dSet.has(organ)) return true;
  }
  return false;
}

/**
 * Check if reported and derived NOAEL differ.
 */
export function hasNoaelDiscrepancy(study: StudyMetadata): boolean {
  if (!study.noael_reported || !study.noael_derived) return false;
  return study.noael_reported.dose !== study.noael_derived.dose;
}

/**
 * Check if reported and derived LOAEL differ.
 */
export function hasLoaelDiscrepancy(study: StudyMetadata): boolean {
  if (!study.loael_reported || !study.loael_derived) return false;
  return study.loael_reported.dose !== study.loael_derived.dose;
}

/**
 * Get target organs present in derived but not in reported.
 */
export function getDerivedOnlyOrgans(study: StudyMetadata): string[] {
  if (!study.target_organs_reported || !study.target_organs_derived) return [];

  const rSet = new Set(study.target_organs_reported);
  return study.target_organs_derived.filter((o) => !rSet.has(o));
}

/**
 * Get target organs present in reported but not in derived.
 */
export function getReportedOnlyOrgans(study: StudyMetadata): string[] {
  if (!study.target_organs_reported || !study.target_organs_derived) return [];

  const dSet = new Set(study.target_organs_derived);
  return study.target_organs_reported.filter((o) => !dSet.has(o));
}
