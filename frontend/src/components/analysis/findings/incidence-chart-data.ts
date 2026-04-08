/**
 * Data converters: UnifiedFinding → StackedSeverityIncidenceChart input.
 *
 * Bridges the findings view's data model (UnifiedFinding with group_stats,
 * RecoveryComparisonResponse incidence_rows) to the ClusterData shape consumed
 * by StackedSeverityIncidenceChart.
 */
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import type { ClusterData, DoseGroupData, SexBarData } from "@/components/analysis/charts/StackedSeverityIncidenceChart";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";
import type { SubjectHistopathEntry } from "@/types/timecourse";
import { getDoseLabel as getDoseLabelFull, shortDoseLabel, getDoseDisplayColor, doseAbbrev } from "@/lib/dose-label-utils";

type IncidenceRow = NonNullable<RecoveryComparisonResponse["incidence_rows"]>[number];

// ── Main arm: from UnifiedFinding.group_stats ──────────────

/**
 * Build ClusterData from findings for one endpoint (main arm).
 *
 * Findings arrive pre-filtered to the endpoint. Multiple findings per sex
 * (one UnifiedFinding per sex per day) — we pick the one matching selectedDay.
 *
 * Emits all dose levels even when empty to preserve spatial anchoring (A-11).
 * `severityCounts` passes through verbatim from `group_stats[].severity_grade_counts`;
 * the chart computes `ungraded = max(0, affected - sum(severityCounts))` itself.
 */
export function buildClusterData(
  findings: UnifiedFinding[],
  doseGroups: DoseGroup[],
  selectedDay: number | null,
  /** When provided, these sexes are always included even if no findings exist. */
  forceSexes?: string[],
): ClusterData {
  // Collect per-sex findings for this endpoint+day
  const bySex = new Map<string, UnifiedFinding>();
  for (const f of findings) {
    if (f.data_type !== "incidence") continue;
    if (selectedDay != null && f.day !== selectedDay) continue;
    if (!bySex.has(f.sex)) bySex.set(f.sex, f);
  }

  const sexSet = new Set([...bySex.keys(), ...(forceSexes ?? [])]);
  const sexes = [...sexSet].sort(); // F before M
  if (sexes.length === 0) return { groups: [], sexes: [] };

  // Build groups for ALL dose levels (even when no data — A-11 spatial anchoring)
  const groups: DoseGroupData[] = doseGroups.map((dg) => {
    const bySexData: Record<string, SexBarData> = {};
    for (const sex of sexes) {
      const f = bySex.get(sex);
      const gs = f?.group_stats.find((g) => g.dose_level === dg.dose_level);
      bySexData[sex] = {
        affected: gs?.affected ?? 0,
        n: gs?.n ?? 0,
        severityCounts: gs?.severity_grade_counts ?? null,
      };
    }
    return {
      doseLevel: dg.dose_level,
      doseLabel: getDoseLabelFull(dg.dose_level, doseGroups),
      doseAbbrev: doseAbbrev(dg),
      doseColor: getDoseDisplayColor(dg),
      bySex: bySexData,
    };
  });

  return { groups, sexes };
}

// ── Recovery arm: from subject-level histopath data ──────────

/**
 * Build ClusterData for the recovery arm from subject-level histopath data.
 *
 * Single source of truth: uses the same SubjectHistopathEntry[] that SeverityMatrix
 * uses for its recovery cells. This ensures NE/zero encoding is consistent across
 * the matrix and the stacked bar chart.
 *
 * A subject is considered "examined" if their findings dict is non-empty or
 * ma_examined is true. "Affected" means the specific finding exists with
 * severity_num > 0.
 */
export function buildRecoveryClusterFromSubjects(
  subjects: SubjectHistopathEntry[],
  finding: string,
  doseGroups: DoseGroup[],
  /** When provided, these sexes are always included even if no recovery subjects exist for them. */
  forceSexes?: string[],
): ClusterData {
  const recSubjects = subjects.filter(s => s.is_recovery);
  if (recSubjects.length === 0) return { groups: [], sexes: [] };

  // Check if any treated dose has recovery subjects
  const hasTreatedRecovery = recSubjects.some(s => s.dose_level > 0);
  if (!hasTreatedRecovery) return { groups: [], sexes: [] };

  // Collect all sexes present in recovery + forced sexes
  const sexSet = new Set<string>(forceSexes ?? []);
  for (const s of recSubjects) sexSet.add(s.sex);
  const sexes = [...sexSet].sort();

  // Collect recovery dose levels
  const recoveryDoseLevels = new Set<number>();
  for (const s of recSubjects) recoveryDoseLevels.add(s.dose_level);

  // Only emit groups for dose levels that have recovery subjects
  const groups: DoseGroupData[] = doseGroups
    .filter(dg => recoveryDoseLevels.has(dg.dose_level))
    .map(dg => {
      const bySexData: Record<string, SexBarData> = {};

      for (const sex of sexes) {
        const doseSubjects = recSubjects.filter(
          s => s.dose_level === dg.dose_level && s.sex === sex,
        );

        // Examined = has findings recorded or MA confirms examination
        const examined = doseSubjects.filter(s =>
          Object.keys(s.findings).length > 0 || s.ma_examined === true,
        );

        if (examined.length === 0) {
          // No examined subjects at this dose+sex → NE
          bySexData[sex] = { affected: 0, n: 0, severityCounts: null };
          continue;
        }

        // Count affected + build severity grade counts
        let affected = 0;
        const severityCounts: Record<string, number> = {};
        for (const s of examined) {
          const fd = s.findings[finding];
          if (fd && fd.severity_num > 0) {
            affected++;
            const grade = String(Math.min(fd.severity_num, 5));
            severityCounts[grade] = (severityCounts[grade] ?? 0) + 1;
          }
        }

        bySexData[sex] = {
          affected,
          n: examined.length,
          severityCounts: Object.keys(severityCounts).length > 0 ? severityCounts : null,
        };
      }

      return {
        doseLevel: dg.dose_level,
        doseLabel: getDoseLabelFull(dg.dose_level, doseGroups),
        doseAbbrev: doseAbbrev(dg),
        doseColor: getDoseDisplayColor(dg),
        bySex: bySexData,
      };
    });

  return { groups, sexes };
}

/**
 * Extract verdicts from incidence_rows for verdict summary line (CL/MA).
 * Returns one verdict per dose (or per dose+sex if they differ).
 *
 * Labels prefer the canonical `shortDoseLabel(label, doseGroups)` (e.g. "20 mg/kg")
 * over the verbose raw `r.dose_label` ("Group 3,20 mg/kg PCDRUG").
 */
export function extractVerdicts(
  rows: IncidenceRow[],
  finding: string,
  domain: string,
  doseGroups?: DoseGroup[],
): { label: string; verdict: string }[] {
  const findingUpper = finding.toUpperCase();
  const matched = rows.filter(
    (r) => r.finding === findingUpper && r.domain === domain && r.dose_level > 0,
  );
  if (matched.length === 0) return [];

  // Group by dose
  const byDose = new Map<number, { label: string; verdicts: Map<string, string> }>();
  for (const r of matched) {
    if (!r.verdict) continue;
    if (!byDose.has(r.dose_level)) {
      // Prefer the shared canonical short label keyed off dose_level so verdict
      // labels match the X-axis labels in the chart above.
      const dgMatch = doseGroups?.find((dg) => dg.dose_level === r.dose_level);
      const cleanLabel = dgMatch
        ? shortDoseLabel(dgMatch.label, doseGroups)
        : (r.dose_label.match(/\(([^)]+)\)/)?.[1] ?? r.dose_label);
      byDose.set(r.dose_level, { label: cleanLabel, verdicts: new Map() });
    }
    byDose.get(r.dose_level)!.verdicts.set(r.sex, r.verdict);
  }

  const entries: { label: string; verdict: string }[] = [];
  for (const [, { label, verdicts }] of [...byDose.entries()].sort(([a], [b]) => a - b)) {
    const unique = new Set(verdicts.values());
    if (unique.size <= 1) {
      const v = [...verdicts.values()][0];
      if (v) entries.push({ label, verdict: v });
    } else {
      for (const [sex, v] of [...verdicts.entries()].sort()) {
        entries.push({ label: `${label} ${sex}`, verdict: v });
      }
    }
  }
  return entries;
}
