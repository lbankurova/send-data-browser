/**
 * Data converters: UnifiedFinding → histopathology chart builder input types.
 *
 * Bridges the findings view's data model (UnifiedFinding with group_stats)
 * to the ECharts builders in histopathology-charts.ts (DoseIncidenceGroup,
 * DoseSeverityGroup).
 */
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import type { DoseIncidenceGroup, DoseSeverityGroup } from "@/components/analysis/charts/histopathology-charts";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";

type IncidenceRow = NonNullable<RecoveryComparisonResponse["incidence_rows"]>[number];

// ── Main arm: from UnifiedFinding.group_stats ──────────────

/**
 * Build DoseIncidenceGroup[] from findings for one endpoint.
 * Findings arrive pre-filtered to the endpoint. Multiple findings per sex
 * (one UnifiedFinding per sex per day) — we pick the one matching selectedDay.
 */
export function buildMainIncidenceGroups(
  findings: UnifiedFinding[],
  doseGroups: DoseGroup[],
  selectedDay: number | null,
): { groups: DoseIncidenceGroup[]; sexKeys: string[] } {
  // Collect per-sex findings for this endpoint+day
  const bySex = new Map<string, UnifiedFinding>();
  for (const f of findings) {
    if (f.data_type !== "incidence") continue;
    if (selectedDay != null && f.day !== selectedDay) continue;
    // Keep first match per sex (findings are already unique per sex+day+endpoint)
    if (!bySex.has(f.sex)) bySex.set(f.sex, f);
  }

  const sexKeys = [...bySex.keys()].sort(); // F before M
  if (sexKeys.length === 0) return { groups: [], sexKeys: [] };

  // Build groups for ALL dose levels (even when no data — keeps charts aligned)
  const groups: DoseIncidenceGroup[] = [];
  for (const dg of doseGroups) {
    const bySexData: Record<string, { affected: number; n: number }> = {};
    for (const sex of sexKeys) {
      const f = bySex.get(sex);
      const gs = f?.group_stats.find((g) => g.dose_level === dg.dose_level);
      bySexData[sex] = { affected: gs?.affected ?? 0, n: gs?.n ?? 0 };
    }
    groups.push({
      doseLevel: dg.dose_level,
      doseLabel: dg.label,
      bySex: bySexData,
    });
  }

  return { groups, sexKeys };
}

/**
 * Build DoseSeverityGroup[] from findings for one endpoint (MI only).
 * Uses severity_grade_counts from group_stats to compute totalSeverity and count.
 */
export function buildMainSeverityGroups(
  findings: UnifiedFinding[],
  doseGroups: DoseGroup[],
  selectedDay: number | null,
): DoseSeverityGroup[] {
  const bySex = new Map<string, UnifiedFinding>();
  for (const f of findings) {
    if (f.data_type !== "incidence") continue;
    if (selectedDay != null && f.day !== selectedDay) continue;
    if (!bySex.has(f.sex)) bySex.set(f.sex, f);
  }

  const sexKeys = [...bySex.keys()].sort();
  if (sexKeys.length === 0) return [];

  const groups: DoseSeverityGroup[] = [];
  for (const dg of doseGroups) {
    const bySexData: Record<string, { totalSeverity: number; count: number }> = {};
    for (const sex of sexKeys) {
      const f = bySex.get(sex);
      const gs = f?.group_stats.find((g) => g.dose_level === dg.dose_level);
      if (gs?.severity_grade_counts) {
        let total = 0;
        let count = 0;
        for (const [grade, n] of Object.entries(gs.severity_grade_counts)) {
          const g = Number(grade);
          if (g > 0 && n > 0) {
            total += g * n;
            count += n;
          }
        }
        if (count > 0) bySexData[sex] = { totalSeverity: total, count };
      } else if (gs?.avg_severity != null && gs.affected != null && gs.affected > 0) {
        bySexData[sex] = { totalSeverity: gs.avg_severity * gs.affected, count: gs.affected };
      }
    }
    if (Object.keys(bySexData).length > 0) {
      groups.push({
        doseLevel: dg.dose_level,
        doseLabel: dg.label,
        bySex: bySexData,
      });
    }
  }

  return groups;
}

// ── Recovery arm: from incidence_rows API ──────────────────

/**
 * Build DoseIncidenceGroup[] from recovery-comparison incidence_rows.
 * Filters to the specified finding+domain, uses recovery arm counts.
 */
export function buildRecoveryIncidenceGroups(
  rows: IncidenceRow[],
  finding: string,
  domain: string,
): DoseIncidenceGroup[] {
  const findingUpper = finding.toUpperCase();
  const matched = rows.filter(
    (r) => r.finding === findingUpper && r.domain === domain,
  );

  // No meaningful recovery if no treated dose has recovery subjects
  const hasTreatedRecovery = matched.some((r) => r.dose_level > 0 && r.recovery_n > 0);
  if (!hasTreatedRecovery) return [];

  // Group by dose_level
  const byDose = new Map<number, Map<string, { affected: number; n: number }>>();
  const doseLabels = new Map<number, string>();
  for (const r of matched) {
    if (!byDose.has(r.dose_level)) byDose.set(r.dose_level, new Map());
    byDose.get(r.dose_level)!.set(r.sex, {
      affected: r.recovery_affected,
      n: r.recovery_n,
    });
    if (!doseLabels.has(r.dose_level)) doseLabels.set(r.dose_level, r.dose_label);
  }

  return [...byDose.entries()]
    .sort(([a], [b]) => a - b)
    .map(([doseLevel, sexMap]) => ({
      doseLevel,
      doseLabel: doseLabels.get(doseLevel) ?? `Dose ${doseLevel}`,
      bySex: Object.fromEntries(sexMap),
    }));
}

/**
 * Build DoseSeverityGroup[] from recovery-comparison incidence_rows (MI only).
 * Uses recovery_severity_counts to compute totalSeverity and count.
 */
export function buildRecoverySeverityGroups(
  rows: IncidenceRow[],
  finding: string,
  domain: string,
): DoseSeverityGroup[] {
  const findingUpper = finding.toUpperCase();
  const allForFinding = rows.filter((r) => r.finding === findingUpper && r.domain === domain);
  if (!allForFinding.some((r) => r.dose_level > 0 && r.recovery_n > 0)) return [];

  const matched = allForFinding.filter((r) => r.recovery_severity_counts);
  if (matched.length === 0) return [];

  const byDose = new Map<number, Map<string, { totalSeverity: number; count: number }>>();
  const doseLabels = new Map<number, string>();
  for (const r of matched) {
    if (!r.recovery_severity_counts) continue;
    let total = 0;
    let count = 0;
    for (const [grade, n] of Object.entries(r.recovery_severity_counts)) {
      const g = Number(grade);
      if (g > 0 && n > 0) { total += g * n; count += n; }
    }
    if (count === 0) continue;
    if (!byDose.has(r.dose_level)) byDose.set(r.dose_level, new Map());
    byDose.get(r.dose_level)!.set(r.sex, { totalSeverity: total, count });
    if (!doseLabels.has(r.dose_level)) doseLabels.set(r.dose_level, r.dose_label);
  }

  return [...byDose.entries()]
    .sort(([a], [b]) => a - b)
    .map(([doseLevel, sexMap]) => ({
      doseLevel,
      doseLabel: doseLabels.get(doseLevel) ?? `Dose ${doseLevel}`,
      bySex: Object.fromEntries(sexMap),
    }));
}

/**
 * Extract verdicts from incidence_rows for verdict summary line (CL/MA).
 * Returns one verdict per dose (or per dose+sex if they differ).
 */
export function extractVerdicts(
  rows: IncidenceRow[],
  finding: string,
  domain: string,
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
      const m = r.dose_label.match(/\(([^)]+)\)/);
      byDose.set(r.dose_level, { label: m ? m[1] : r.dose_label, verdicts: new Map() });
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
