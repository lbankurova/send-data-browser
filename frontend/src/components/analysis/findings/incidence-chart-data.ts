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
import { shortDoseLabel } from "@/lib/dose-label-utils";

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
): ClusterData {
  // Collect per-sex findings for this endpoint+day
  const bySex = new Map<string, UnifiedFinding>();
  for (const f of findings) {
    if (f.data_type !== "incidence") continue;
    if (selectedDay != null && f.day !== selectedDay) continue;
    if (!bySex.has(f.sex)) bySex.set(f.sex, f);
  }

  const sexes = [...bySex.keys()].sort(); // F before M
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
      doseLabel: shortDoseLabel(dg.label, doseGroups),
      bySex: bySexData,
    };
  });

  return { groups, sexes };
}

// ── Recovery arm: from incidence_rows API ──────────────────

/**
 * Build ClusterData for the recovery arm of one endpoint.
 *
 * Filters `incidence_rows` to the specified finding+domain, uses the
 * `recovery_*` columns. Emits all reference dose levels even when no
 * recovery data exists (A-11). Returns an empty cluster (no groups) when
 * no treated dose has any recovery subjects, signalling the caller to omit
 * the recovery cluster entirely.
 */
export function buildRecoveryClusterData(
  rows: IncidenceRow[],
  finding: string,
  domain: string,
  referenceDoseGroups: DoseGroup[],
): ClusterData {
  const findingUpper = finding.toUpperCase();
  const matched = rows.filter(
    (r) => r.finding === findingUpper && r.domain === domain,
  );

  // No meaningful recovery if no treated dose has recovery subjects
  const hasTreatedRecovery = matched.some((r) => r.dose_level > 0 && r.recovery_n > 0);
  if (!hasTreatedRecovery) return { groups: [], sexes: [] };

  // Index rows: dose_level -> sex -> SexBarData
  const byDose = new Map<number, Map<string, SexBarData>>();
  const sexSet = new Set<string>();
  const doseLabelsFromRows = new Map<number, string>();
  for (const r of matched) {
    if (!byDose.has(r.dose_level)) byDose.set(r.dose_level, new Map());
    byDose.get(r.dose_level)!.set(r.sex, {
      affected: r.recovery_affected,
      n: r.recovery_n,
      severityCounts: r.recovery_severity_counts ?? null,
    });
    sexSet.add(r.sex);
    if (!doseLabelsFromRows.has(r.dose_level)) {
      doseLabelsFromRows.set(r.dose_level, shortDoseLabel(r.dose_label, referenceDoseGroups));
    }
  }

  const sexes = [...sexSet].sort();

  // Walk all reference dose levels (A-11). Missing dose levels render as empty bars
  // (n=0 envelope-less NE markers per the chart's not-examined branch).
  const groups: DoseGroupData[] = referenceDoseGroups.map((dg) => {
    const sexMap = byDose.get(dg.dose_level);
    const bySexData: Record<string, SexBarData> = {};
    for (const sex of sexes) {
      bySexData[sex] = sexMap?.get(sex) ?? { affected: 0, n: 0, severityCounts: null };
    }
    return {
      doseLevel: dg.dose_level,
      doseLabel: doseLabelsFromRows.get(dg.dose_level) ?? shortDoseLabel(dg.label, referenceDoseGroups),
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
