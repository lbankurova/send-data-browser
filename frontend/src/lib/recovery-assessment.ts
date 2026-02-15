/**
 * Recovery reversibility assessment — pure derivation logic.
 * Compares main-arm vs recovery-arm histopathology data
 * to determine whether findings reversed after treatment-free recovery.
 */

import type { SubjectHistopathEntry } from "@/types/timecourse";

// ─── Constants ───────────────────────────────────────────

/** Minimum recovery-arm subjects for meaningful comparison. */
export const MIN_RECOVERY_N = 3;

// ─── Types ────────────────────────────────────────────────

export type RecoveryVerdict =
  | "reversed"
  | "reversing"
  | "persistent"
  | "progressing"
  | "anomaly"
  | "insufficient_n"
  | "not_observed"
  | "no_data";

export interface RecoveryDoseAssessment {
  doseLevel: number;
  doseGroupLabel: string;
  main: {
    incidence: number;
    n: number;
    affected: number;
    avgSeverity: number;
    maxSeverity: number;
  };
  recovery: {
    incidence: number;
    n: number;
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
  incidence: number;
  avgSeverity: number;
  affected: number;
}

export function computeVerdict(
  main: ArmStats,
  recovery: ArmStats,
  thresholds: VerdictThresholds = DEFAULT_VERDICT_THRESHOLDS,
): RecoveryVerdict {
  // Recovery incidence exactly 0 → fully reversed
  if (recovery.incidence === 0) return "reversed";

  const incidenceRatio = recovery.incidence / Math.max(main.incidence, 0.01);
  const severityRatio = recovery.avgSeverity / Math.max(main.avgSeverity, 0.01);

  // Progressing: incidence or severity increased
  if (incidenceRatio > thresholds.progressingIncidence && recovery.affected > main.affected) return "progressing";
  if (severityRatio > thresholds.progressingSeverity) return "progressing";

  // Reversed: both incidence and severity substantially decreased
  if (incidenceRatio <= thresholds.reversedIncidence && severityRatio <= thresholds.reversedSeverity) return "reversed";

  // Reversing: clear decrease in at least one metric
  if (incidenceRatio <= thresholds.reversingIncidence || severityRatio <= thresholds.reversingSeverity) return "reversing";

  // Otherwise persistent
  return "persistent";
}

// Worst = most conservative for reporting. Anomaly at top per §3.3.
const VERDICT_PRIORITY: RecoveryVerdict[] = [
  "anomaly",
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
  reversed: "\u2193",      // ↓
  reversing: "\u2198",     // ↘
  persistent: "\u2192",    // →
  progressing: "\u2191",   // ↑
  anomaly: "?",
  insufficient_n: "\u2014", // —
  not_observed: "\u2014",   // —
  no_data: "\u2014",        // —
};

export function verdictArrow(verdict: RecoveryVerdict): string {
  return VERDICT_ARROWS[verdict] ?? "";
}

export function verdictLabel(verdict: RecoveryVerdict): string {
  const arrow = VERDICT_ARROWS[verdict];
  return arrow ? `${arrow} ${verdict}` : verdict;
}

// ─── Tooltip ──────────────────────────────────────────────

export function buildRecoveryTooltip(
  assessment: RecoveryAssessment | undefined,
  recoveryDays?: number | null,
): string {
  if (!assessment) return "";
  const lines = ["Recovery assessment:"];
  for (const a of assessment.assessments) {
    if (a.verdict === "insufficient_n") {
      lines.push(`  ${a.doseGroupLabel}: N=${a.recovery.n}, too few subjects for comparison`);
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
    const mainPct = `${Math.round(a.main.incidence * 100)}%`;
    const recPct = `${Math.round(a.recovery.incidence * 100)}%`;
    const mainSev = a.main.avgSeverity.toFixed(1);
    const recSev = a.recovery.avgSeverity.toFixed(1);
    lines.push(
      `  ${a.doseGroupLabel}: ${mainPct} \u2192 ${recPct}, sev ${mainSev} \u2192 ${recSev} \u2014 ${a.verdict}`
    );
  }
  lines.push(`  Overall: ${assessment.overall} (worst case)`);
  if (recoveryDays != null) {
    const label = recoveryDays >= 7
      ? `${Math.round(recoveryDays / 7)} week${Math.round(recoveryDays / 7) !== 1 ? "s" : ""}`
      : `${recoveryDays} day${recoveryDays !== 1 ? "s" : ""}`;
    lines.push(`  Recovery period: ${label}`);
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

      // Guard 1: recovery N too small for meaningful comparison
      let verdict: RecoveryVerdict;
      if (recStats.n < MIN_RECOVERY_N) {
        verdict = "insufficient_n";
      // Guard 2: main arm has zero incidence
      } else if (mainStats.incidence === 0 && mainStats.affected === 0) {
        if (recStats.incidence > 0) {
          verdict = "anomaly";
        } else {
          verdict = "not_observed";
        }
      } else {
        // Normal comparison
        verdict = computeVerdict(mainStats, recStats, thresholds);
      }

      assessments.push({
        doseLevel: dl,
        doseGroupLabel: mainGroup[0]?.dose_label
          ? formatDoseGroupLabel(mainGroup[0].dose_label)
          : `Dose ${dl}`,
        main: {
          incidence: mainStats.incidence,
          n: mainStats.n,
          affected: mainStats.affected,
          avgSeverity: mainStats.avgSeverity,
          maxSeverity: mainStats.maxSeverity,
        },
        recovery: {
          incidence: recStats.incidence,
          n: recStats.n,
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
        main: { incidence: 0, n: 0, affected: 0, avgSeverity: 0, maxSeverity: 0 },
        recovery: {
          incidence: recStats.incidence, n: recStats.n, affected: recStats.affected,
          avgSeverity: recStats.avgSeverity, maxSeverity: recStats.maxSeverity, subjectDetails,
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

function computeGroupStats(
  finding: string,
  subjects: SubjectHistopathEntry[],
): ArmStats & { n: number; maxSeverity: number } {
  const n = subjects.length;
  let affected = 0;
  let totalSev = 0;
  let maxSev = 0;

  for (const s of subjects) {
    const f = s.findings[finding];
    if (f) {
      affected++;
      totalSev += f.severity_num;
      if (f.severity_num > maxSev) maxSev = f.severity_num;
    }
  }

  const incidence = n > 0 ? affected / n : 0;
  const avgSeverity = affected > 0 ? totalSev / affected : 0;

  return { incidence, affected, avgSeverity, maxSeverity: maxSev, n };
}

// ─── Specimen-level summary ───────────────────────────────

/**
 * Compute the overall recovery label for a specimen.
 * "reversed" if all reversed, "partial" if mixed, else worst verdict.
 * Spec §7.2: values = reversed, partial, persistent, progressing.
 */
export function specimenRecoveryLabel(
  assessments: RecoveryAssessment[],
): string | null {
  const verdicts = assessments
    .flatMap((a) => a.assessments)
    .map((d) => d.verdict)
    .filter((v) => v !== "not_observed" && v !== "no_data" && v !== "insufficient_n");

  if (verdicts.length === 0) return null;

  const unique = new Set(verdicts);
  if (unique.size === 1) {
    const sole = [...unique][0];
    // Map 'reversing' → 'partial' per spec §7.2 allowed values
    return sole === "reversing" ? "partial" : sole;
  }

  // Mix of verdicts → "partial" if any reversed, else worst
  if (unique.has("reversed") && unique.size > 1) return "partial";

  const worst = worstVerdict(verdicts);
  // Map 'reversing' → 'partial' at specimen level
  return worst === "reversing" ? "partial" : worst;
}
