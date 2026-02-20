/**
 * Pure logic for the SubjectProfilePanel — COD detection, lab flagging, helpers.
 * Extracted for testability (no React dependencies).
 */

import type { SubjectMeasurement, SubjectFinding } from "@/types/timecourse";

// ─── Constants ───────────────────────────────────────────

const NORMAL_TERMS = ["NORMAL", "UNREMARKABLE", "WITHIN NORMAL LIMITS"];

/** Analytes that increase with toxicity — flag when > 2× control mean */
const INCREASE_ANALYTES = new Set(["ALT", "AST", "ALP", "BILI", "BUN", "CREA", "GGT"]);
/** Analytes that decrease with toxicity — flag when < 0.5× control mean */
const DECREASE_ANALYTES = new Set(["ALB", "RBC", "HGB", "HCT", "PLT", "WBC"]);

/** Death-indicating disposition strings (case-insensitive substring match) */
const DEATH_INDICATORS = ["DEAD", "MORIBUND", "EUTHANIZED", "FOUND DEAD"];

// ─── Helpers ─────────────────────────────────────────────

export function isNormalFinding(text: string): boolean {
  return NORMAL_TERMS.includes(text.toUpperCase());
}

export function isUnscheduledDeath(disposition: string | null): boolean {
  if (!disposition) return false;
  const upper = disposition.toUpperCase();
  return DEATH_INDICATORS.some((d) => upper.includes(d));
}

const SEV_NUM: Record<string, number> = {
  MINIMAL: 1, MILD: 2, MODERATE: 3, MARKED: 4, SEVERE: 5,
};

export function severityNum(sev?: string | null): number {
  if (!sev) return 0;
  return SEV_NUM[sev.toUpperCase()] ?? 0;
}

// ─── COD detection ───────────────────────────────────────

export interface ClassifiedFinding extends SubjectFinding {
  /** Sort tier: 0 = COD, 1 = presumptive COD, 2 = malignant, 3 = benign,
   *  4 = non-neoplastic grade>=2, 5 = grade 1, 6 = normal */
  tier: number;
  isCOD: boolean;
  isPresumptiveCOD: boolean;
}

export function classifyFindings(
  findings: SubjectFinding[],
  disposition: string | null,
  isAccidental: boolean,
): { classified: ClassifiedFinding[]; codFinding: ClassifiedFinding | null } {
  const isDeath = isUnscheduledDeath(disposition);
  // Skip COD attribution for accidental deaths — cause is procedural, not pathological
  const doCOD = isDeath && !isAccidental;

  // Separate normal from non-normal
  const nonNormal: SubjectFinding[] = [];
  for (const f of findings) {
    if (!isNormalFinding(f.finding)) nonNormal.push(f);
  }

  // Find malignant findings
  const malignant = nonNormal.filter(
    (f) => f.result_category?.toUpperCase() === "MALIGNANT"
  );

  // Find highest-severity finding (for presumptive COD)
  let maxSev = 0;
  for (const f of nonNormal) {
    const sn = severityNum(f.severity);
    if (sn > maxSev) maxSev = sn;
  }

  let codFinding: ClassifiedFinding | null = null;

  const classified: ClassifiedFinding[] = nonNormal.map((f) => {
    const sn = severityNum(f.severity);
    const isMalignant = f.result_category?.toUpperCase() === "MALIGNANT";
    const isBenign = f.result_category?.toUpperCase() === "BENIGN";

    // COD logic — only for non-accidental deaths
    let isCOD = false;
    let isPresumptiveCOD = false;
    if (doCOD) {
      if (malignant.length > 0 && isMalignant) {
        isCOD = true;
      } else if (malignant.length === 0 && sn === maxSev && maxSev > 0) {
        isPresumptiveCOD = true;
      }
    }

    // Assign tier
    let tier: number;
    if (isCOD) tier = 0;
    else if (isPresumptiveCOD) tier = 1;
    else if (isMalignant) tier = 2;
    else if (isBenign) tier = 3;
    else if (sn >= 2) tier = 4;
    else if (sn >= 1) tier = 5;
    else tier = 4; // non-neoplastic without severity → group with grade>=2

    const cf: ClassifiedFinding = { ...f, tier, isCOD, isPresumptiveCOD };
    if (isCOD && !codFinding) codFinding = cf;
    if (isPresumptiveCOD && !codFinding) codFinding = cf;
    return cf;
  });

  // Sort: tier asc, then severity desc within tier, then specimen alpha
  classified.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const sa = severityNum(a.severity);
    const sb = severityNum(b.severity);
    if (sa !== sb) return sb - sa;
    return a.specimen.localeCompare(b.specimen);
  });

  return { classified, codFinding };
}

// ─── Lab flagging ────────────────────────────────────────

export interface FlaggedLab {
  testCode: string;
  day: number;
  value: number;
  unit: string;
  flag: "up" | "down" | null;
  ratio: number | null;
}

export function flagLabValues(
  measurements: SubjectMeasurement[],
  controlStats?: Record<string, { mean: number; sd: number; unit: string; n: number }> | null,
): FlaggedLab[] {
  // Group by test_code, take terminal (max day) value
  const byTest = new Map<string, SubjectMeasurement[]>();
  for (const m of measurements) {
    const arr = byTest.get(m.test_code) ?? [];
    arr.push(m);
    byTest.set(m.test_code, arr);
  }

  const result: FlaggedLab[] = [];
  for (const [testCode, rows] of byTest) {
    // Take the latest measurement for each test
    const sorted = [...rows].sort((a, b) => b.day - a.day);
    const latest = sorted[0];

    let flag: "up" | "down" | null = null;
    let ratio: number | null = null;

    if (controlStats) {
      const ctrl = controlStats[testCode];
      if (ctrl && ctrl.mean > 0) {
        const r = latest.value / ctrl.mean;
        if (INCREASE_ANALYTES.has(testCode) && r > 2) {
          flag = "up";
          ratio = Math.round(r * 10) / 10;
        } else if (DECREASE_ANALYTES.has(testCode) && r < 0.5) {
          flag = "down";
          ratio = Math.round(r * 10) / 10;
        }
      }
    }

    result.push({
      testCode,
      day: latest.day,
      value: latest.value,
      unit: latest.unit,
      flag,
      ratio,
    });
  }

  // Sort: flagged first, then alphabetical
  result.sort((a, b) => {
    if (a.flag && !b.flag) return -1;
    if (!a.flag && b.flag) return 1;
    return a.testCode.localeCompare(b.testCode);
  });

  return result;
}
