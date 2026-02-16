/**
 * Recovery reversibility assessment — pure derivation logic.
 * Compares main-arm vs recovery-arm histopathology data
 * to determine whether findings reversed after treatment-free recovery.
 *
 * v3: Examination-aware verdicts (recovery-guards-spec.md)
 */

import type { SubjectHistopathEntry } from "@/types/timecourse";
import type { FindingNatureInfo } from "./finding-nature";
import { reversibilityLabel } from "./finding-nature";

// ─── Constants ───────────────────────────────────────────

/** Minimum examined recovery-arm subjects for meaningful comparison. */
export const MIN_RECOVERY_N = 3;

/** Minimum expected affected count for statistical power. */
const LOW_POWER_THRESHOLD = 2;

// ─── Types ────────────────────────────────────────────────

export type RecoveryVerdict =
  | "reversed"
  | "reversing"
  | "persistent"
  | "progressing"
  | "anomaly"
  | "insufficient_n"
  | "not_examined"     // v3: tissue not examined in recovery arm
  | "low_power"        // v3: main incidence too low for recovery N
  | "not_observed"
  | "no_data";

export interface RecoveryDoseAssessment {
  doseLevel: number;
  doseGroupLabel: string;
  main: {
    incidence: number;
    n: number;
    examined: number;
    affected: number;
    avgSeverity: number;
    maxSeverity: number;
  };
  recovery: {
    incidence: number;
    n: number;
    examined: number;
    affected: number;
    avgSeverity: number;
    maxSeverity: number;
    subjectDetails: { id: string; severity: number; mainArmSeverity: number | null; mainArmAvgSeverity: number }[];
  };
  verdict: RecoveryVerdict;
}

export interface RecoveryAssessment {
  finding: string;
  assessments: RecoveryDoseAssessment[];
  overall: RecoveryVerdict;
}

// ─── Verdict computation ──────────────────────────────────

export interface VerdictThresholds {
  /** Incidence ratio ≤ this AND severity ratio ≤ reversedSeverity → "reversed" (default 0.2) */
  reversedIncidence: number;
  /** Severity ratio ≤ this AND incidence ratio ≤ reversedIncidence → "reversed" (default 0.3) */
  reversedSeverity: number;
  /** Incidence ratio ≤ this OR severity ratio ≤ reversingSeverity → "reversing" (default 0.5) */
  reversingIncidence: number;
  /** Severity ratio ≤ this OR incidence ratio ≤ reversingIncidence → "reversing" (default 0.5) */
  reversingSeverity: number;
  /** Incidence ratio > this (with more affected) → "progressing" (default 1.1) */
  progressingIncidence: number;
  /** Severity ratio > this → "progressing" (default 1.2) */
  progressingSeverity: number;
}

export const DEFAULT_VERDICT_THRESHOLDS: VerdictThresholds = {
  reversedIncidence: 0.2,
  reversedSeverity: 0.3,
  reversingIncidence: 0.5,
  reversingSeverity: 0.5,
  progressingIncidence: 1.1,
  progressingSeverity: 1.2,
};

interface ArmStats {
  n: number;
  examined: number;
  affected: number;
  incidence: number;
  avgSeverity: number;
  maxSeverity: number;
}

/**
 * Full guard chain + ratio computation. v3 guard order:
 *  0. recovery.examined === 0              → not_examined
 *  1. recovery.examined < 3               → insufficient_n
 *  2. main incidence=0, recovery>0        → anomaly
 *  3. main.incidence * recovery.examined < 2 → low_power
 *  4. main incidence=0, main affected=0   → not_observed
 *  5. recovery.incidence === 0            → reversed
 *  6-10. Ratio computation
 */
export function computeVerdict(
  main: ArmStats,
  recovery: ArmStats,
  thresholds: VerdictThresholds = DEFAULT_VERDICT_THRESHOLDS,
): RecoveryVerdict {
  // v3 Guard 0: tissue not examined in recovery arm
  if (recovery.examined === 0) return "not_examined";

  // Guard 1 (v3 amended): insufficient examined subjects
  if (recovery.examined < MIN_RECOVERY_N) return "insufficient_n";

  // Guard 2: anomaly — recovery has findings where main arm had none
  if (main.incidence === 0 && main.affected === 0 && recovery.affected > 0) return "anomaly";

  // v3 Guard 3: low statistical power
  if (main.incidence * recovery.examined < LOW_POWER_THRESHOLD) return "low_power";

  // Guard 4: main arm had no findings at this dose level
  if (main.incidence === 0 && main.affected === 0) return "not_observed";

  // Guard 5: recovery has zero affected (tissue was examined — guard 0 passed)
  if (recovery.incidence === 0) return "reversed";

  // Steps 6-10: compute ratios
  const incidenceRatio = recovery.incidence / main.incidence;
  const sevRatio = main.avgSeverity > 0
    ? recovery.avgSeverity / main.avgSeverity
    : 1;

  // Progressing: incidence or severity increased
  if (incidenceRatio > thresholds.progressingIncidence && recovery.affected > main.affected) return "progressing";
  if (main.avgSeverity > 0 && sevRatio > thresholds.progressingSeverity) return "progressing";

  // Reversed: both incidence and severity substantially decreased
  if (incidenceRatio <= thresholds.reversedIncidence && sevRatio <= thresholds.reversedSeverity) return "reversed";

  // Reversing: clear decrease in at least one metric
  if (incidenceRatio <= thresholds.reversingIncidence || sevRatio <= thresholds.reversingSeverity) return "reversing";

  // Otherwise persistent
  return "persistent";
}

// v3: Priority order — not_examined and low_power inserted
const VERDICT_PRIORITY: RecoveryVerdict[] = [
  "anomaly",
  "not_examined",
  "low_power",
  "progressing",
  "persistent",
  "reversing",
  "reversed",
  "insufficient_n",
  "not_observed",
  "no_data",
];

export function worstVerdict(verdicts: RecoveryVerdict[]): RecoveryVerdict {
  for (const v of VERDICT_PRIORITY) {
    if (verdicts.includes(v)) return v;
  }
  return "no_data";
}

export function verdictPriority(verdict: RecoveryVerdict | undefined): number {
  if (!verdict) return VERDICT_PRIORITY.length;
  const idx = VERDICT_PRIORITY.indexOf(verdict);
  return idx >= 0 ? idx : VERDICT_PRIORITY.length;
}

const VERDICT_ARROWS: Record<RecoveryVerdict, string> = {
  reversed: "\u2193",       // ↓
  reversing: "\u2198",      // ↘
  persistent: "\u2192",     // →
  progressing: "\u2191",    // ↑
  anomaly: "\u26A0",        // ⚠
  not_examined: "\u2205",   // ∅
  low_power: "~",
  insufficient_n: "\u2020", // †
  not_observed: "\u2014",   // —
  no_data: "\u2014",        // —
};

export function verdictArrow(verdict: RecoveryVerdict): string {
  return VERDICT_ARROWS[verdict] ?? "";
}

export function verdictLabel(verdict: RecoveryVerdict): string {
  const display = verdict === "insufficient_n" ? "insufficient N"
    : verdict === "not_examined" ? "not examined"
    : verdict === "low_power" ? "low power"
    : verdict;
  const arrow = VERDICT_ARROWS[verdict];
  return arrow ? `${arrow} ${display}` : display;
}

// ─── Fraction formatting ────────────────────────────────

/**
 * Format incidence fraction with examination-aware denominator.
 * - examined === n → "2/30 (7%)" (standard)
 * - examined < n  → "2/25 (8%) [of 30]"
 * - examined === 0 → "—/10 (not examined)"
 */
export function formatRecoveryFraction(affected: number, examined: number, n: number): string {
  if (examined === 0) return `\u2014/${n} (not examined)`;
  const pct = Math.round((affected / examined) * 100);
  const fraction = `${affected}/${examined} (${pct}%)`;
  return examined < n ? `${fraction} [of ${n}]` : fraction;
}

// ─── Tooltip ──────────────────────────────────────────────

export function buildRecoveryTooltip(
  assessment: RecoveryAssessment | undefined,
  recoveryDays?: number | null,
  findingNature?: FindingNatureInfo | null,
): string {
  if (!assessment) return "";
  const lines = ["Recovery assessment:"];
  for (const a of assessment.assessments) {
    if (a.verdict === "not_examined") {
      lines.push(`  ${a.doseGroupLabel}: \u2205 not examined (0/${a.recovery.n} examined)`);
      continue;
    }
    if (a.verdict === "insufficient_n") {
      lines.push(`  ${a.doseGroupLabel}: \u2020 N=${a.recovery.examined} examined, too few for comparison`);
      continue;
    }
    if (a.verdict === "not_observed") {
      lines.push(`  ${a.doseGroupLabel}: not observed`);
      continue;
    }
    if (a.verdict === "anomaly") {
      const recPct = `${Math.round(a.recovery.incidence * 100)}%`;
      lines.push(`  ${a.doseGroupLabel}: 0% \u2192 ${recPct} \u2014 \u26A0 anomaly`);
      lines.push("    Finding present in recovery but not in main arm.");
      lines.push("    May indicate delayed onset or data quality issue.");
      continue;
    }
    if (a.verdict === "low_power") {
      const mainPct = `${Math.round(a.main.incidence * 100)}%`;
      const expected = (a.main.incidence * a.recovery.examined).toFixed(1);
      lines.push(`  ${a.doseGroupLabel}: ~ low power (main ${mainPct}, expected \u2248${expected} affected in ${a.recovery.examined} examined)`);
      continue;
    }
    const mainFrac = a.main.examined < a.main.n
      ? `${Math.round(a.main.incidence * 100)}% [${a.main.examined} examined]`
      : `${Math.round(a.main.incidence * 100)}%`;
    const recFrac = a.recovery.examined < a.recovery.n
      ? `${Math.round(a.recovery.incidence * 100)}% [${a.recovery.examined} examined]`
      : `${Math.round(a.recovery.incidence * 100)}%`;
    const mainSev = a.main.avgSeverity.toFixed(1);
    const recSev = a.recovery.avgSeverity.toFixed(1);
    lines.push(
      `  ${a.doseGroupLabel}: ${mainFrac} \u2192 ${recFrac}, sev ${mainSev} \u2192 ${recSev} \u2014 ${a.verdict}`
    );
  }
  lines.push(`  Overall: ${assessment.overall} (worst case)`);
  if (recoveryDays != null) {
    const label = recoveryDays >= 7
      ? `${Math.round(recoveryDays / 7)} week${Math.round(recoveryDays / 7) !== 1 ? "s" : ""}`
      : `${recoveryDays} day${recoveryDays !== 1 ? "s" : ""}`;
    lines.push(`  Recovery period: ${label}`);
  }
  if (findingNature && findingNature.nature !== "other") {
    lines.push(`  Finding type: ${findingNature.nature} (${reversibilityLabel(findingNature)})`);
  }
  return lines.join("\n");
}

// ─── Main derivation ─────────────────────────────────────

export function deriveRecoveryAssessments(
  findingNames: string[],
  subjects: SubjectHistopathEntry[],
  thresholds: VerdictThresholds = DEFAULT_VERDICT_THRESHOLDS,
): RecoveryAssessment[] {
  // Split subjects into main and recovery arms
  const mainSubjects = subjects.filter((s) => !s.is_recovery);
  const recoverySubjects = subjects.filter((s) => s.is_recovery);

  if (recoverySubjects.length === 0) return [];

  // Get all dose levels that have both main and recovery subjects
  const mainByDose = groupByDoseLevel(mainSubjects);
  const recoveryByDose = groupByDoseLevel(recoverySubjects);

  // Shared dose levels (both main + recovery)
  const sharedDoseLevels = [...mainByDose.keys()].filter((dl) =>
    recoveryByDose.has(dl),
  );
  // Recovery-only dose levels (no matching main arm → no_data)
  const recoveryOnlyDoseLevels = [...recoveryByDose.keys()].filter((dl) =>
    !mainByDose.has(dl),
  );
  if (sharedDoseLevels.length === 0 && recoveryOnlyDoseLevels.length === 0) return [];
  sharedDoseLevels.sort((a, b) => a - b);
  recoveryOnlyDoseLevels.sort((a, b) => a - b);

  return findingNames.map((finding) => {
    const assessments: RecoveryDoseAssessment[] = [];

    for (const dl of sharedDoseLevels) {
      const mainGroup = mainByDose.get(dl)!;
      const recGroup = recoveryByDose.get(dl)!;

      const mainStats = computeGroupStats(finding, mainGroup);
      const recStats = computeGroupStats(finding, recGroup);

      // Recovery subject details (E-3: include main-arm severity for trajectory)
      const mainSubjectSevMap = new Map<string, number>();
      for (const s of mainGroup) {
        const f = s.findings[finding];
        if (f) mainSubjectSevMap.set(s.usubjid, f.severity_num);
      }
      const mainAvgSev = mainStats.avgSeverity;

      const subjectDetails: { id: string; severity: number; mainArmSeverity: number | null; mainArmAvgSeverity: number }[] = [];
      for (const s of recGroup) {
        const f = s.findings[finding];
        if (f) {
          subjectDetails.push({
            id: s.usubjid,
            severity: f.severity_num,
            mainArmSeverity: mainSubjectSevMap.get(s.usubjid) ?? null,
            mainArmAvgSeverity: mainAvgSev,
          });
        }
      }

      // All guards handled inside computeVerdict (v3)
      const verdict = computeVerdict(mainStats, recStats, thresholds);

      assessments.push({
        doseLevel: dl,
        doseGroupLabel: mainGroup[0]?.dose_label
          ? formatDoseGroupLabel(mainGroup[0].dose_label)
          : `Dose ${dl}`,
        main: {
          incidence: mainStats.incidence,
          n: mainStats.n,
          examined: mainStats.examined,
          affected: mainStats.affected,
          avgSeverity: mainStats.avgSeverity,
          maxSeverity: mainStats.maxSeverity,
        },
        recovery: {
          incidence: recStats.incidence,
          n: recStats.n,
          examined: recStats.examined,
          affected: recStats.affected,
          avgSeverity: recStats.avgSeverity,
          maxSeverity: recStats.maxSeverity,
          subjectDetails,
        },
        verdict,
      });
    }

    // Recovery-only dose levels: no main arm match → no_data
    for (const dl of recoveryOnlyDoseLevels) {
      const recGroup = recoveryByDose.get(dl)!;
      const recStats = computeGroupStats(finding, recGroup);
      const subjectDetails: { id: string; severity: number; mainArmSeverity: number | null; mainArmAvgSeverity: number }[] = [];
      for (const s of recGroup) {
        const f = s.findings[finding];
        if (f) subjectDetails.push({ id: s.usubjid, severity: f.severity_num, mainArmSeverity: null, mainArmAvgSeverity: 0 });
      }
      assessments.push({
        doseLevel: dl,
        doseGroupLabel: recGroup[0]?.dose_label
          ? formatDoseGroupLabel(recGroup[0].dose_label)
          : `Dose ${dl}`,
        main: { incidence: 0, n: 0, examined: 0, affected: 0, avgSeverity: 0, maxSeverity: 0 },
        recovery: {
          incidence: recStats.incidence, n: recStats.n, examined: recStats.examined,
          affected: recStats.affected, avgSeverity: recStats.avgSeverity,
          maxSeverity: recStats.maxSeverity, subjectDetails,
        },
        verdict: "no_data",
      });
    }

    const overall = worstVerdict(assessments.map((a) => a.verdict));
    return { finding, assessments, overall };
  });
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Format dose_label into "Group N (dose unit)" for tooltip display.
 * Input format varies: "Group 2,2 mg/kg PCDRUG", "Group 1, Control", etc.
 * Output: "Group 2 (2 mg/kg)", "Group 1 (Control)", etc.
 */
function formatDoseGroupLabel(doseLabel: string): string {
  const commaIdx = doseLabel.indexOf(",");
  if (commaIdx < 0) return doseLabel;

  const groupPart = doseLabel.slice(0, commaIdx).trim();
  const dosePart = doseLabel.slice(commaIdx + 1).trim();

  // Extract numeric dose value + unit (e.g., "2 mg/kg" from "2 mg/kg PCDRUG")
  const doseMatch = dosePart.match(/^(\d+\.?\d*\s*\S+)/);
  const doseStr = doseMatch ? doseMatch[1] : dosePart;

  return `${groupPart} (${doseStr})`;
}

function groupByDoseLevel(
  subjects: SubjectHistopathEntry[],
): Map<number, SubjectHistopathEntry[]> {
  const map = new Map<number, SubjectHistopathEntry[]>();
  for (const s of subjects) {
    const list = map.get(s.dose_level);
    if (list) list.push(s);
    else map.set(s.dose_level, [s]);
  }
  return map;
}

/**
 * Compute group stats with examination-aware incidence.
 *
 * Examination heuristic (fallback — backend doesn't provide explicit examination status):
 * - If ANY subject in the dose group has ANY finding for the specimen → examined = n
 *   (standard protocol: if tissue was collected, all subjects in the group were examined)
 * - If ZERO subjects have any findings → examined = 0 (tissue likely not examined)
 *
 * Incidence = affected / examined (not affected / n).
 */
function computeGroupStats(
  finding: string,
  subjects: SubjectHistopathEntry[],
): ArmStats {
  const n = subjects.length;
  let affected = 0;
  let totalSev = 0;
  let maxSev = 0;

  // Check if any subject in the group has any findings for this specimen
  let anyExamined = false;
  for (const s of subjects) {
    if (Object.keys(s.findings).length > 0) {
      anyExamined = true;
    }
    const f = s.findings[finding];
    if (f) {
      affected++;
      totalSev += f.severity_num;
      if (f.severity_num > maxSev) maxSev = f.severity_num;
    }
  }

  // Examination heuristic: if any subject has any finding → all examined
  const examined = anyExamined ? n : 0;
  const incidence = examined > 0 ? affected / examined : 0;
  const avgSeverity = affected > 0 ? totalSev / affected : 0;

  return { incidence, affected, avgSeverity, maxSeverity: maxSev, n, examined };
}

// ─── Specimen-level summary ───────────────────────────────

/**
 * Compute the overall recovery label for a specimen.
 * v3: handles not_examined, low_power, incomplete.
 */
export function specimenRecoveryLabel(
  assessments: RecoveryAssessment[],
): string | null {
  const verdicts = assessments
    .flatMap((a) => a.assessments)
    .map((d) => d.verdict)
    .filter((v) => v !== "not_observed" && v !== "no_data");

  if (verdicts.length === 0) return null;

  // v3: special specimen-level labels
  const allNotExamined = verdicts.every((v) => v === "not_examined");
  if (allNotExamined) return "not examined";

  const anyNotExamined = verdicts.some((v) => v === "not_examined");
  const allInconclusive = verdicts.every(
    (v) => v === "low_power" || v === "not_examined" || v === "insufficient_n",
  );
  if (allInconclusive) return "inconclusive";
  if (anyNotExamined) return "incomplete";

  // Filter out informational verdicts for standard logic
  const substantive = verdicts.filter(
    (v) => v !== "insufficient_n" && v !== "not_examined" && v !== "low_power",
  );
  if (substantive.length === 0) return null;

  const unique = new Set(substantive);
  if (unique.size === 1) {
    const sole = [...unique][0];
    return sole === "reversing" ? "partial" : sole;
  }

  // Mix of verdicts → "partial" if any reversed, else worst
  if (unique.has("reversed") && unique.size > 1) return "partial";

  const worst = worstVerdict(substantive);
  return worst === "reversing" ? "partial" : worst;
}
