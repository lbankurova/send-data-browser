/**
 * Dose column builder shared across NoaelSynthesisSection, DomainDoseRollup,
 * MemberRolesByDoseTable, and any other consumer that renders treated-only
 * dose columns aligned via the `organ-tbl` colgroup.
 *
 * Distinct treated dose values; controls and recovery satellites excluded;
 * sorted ascending. `is_loael` highlights the column matching
 * `noael_summary.combined.loael_dose_level`.
 */

import type { DoseGroup } from "@/types";
import type { DoseColumn } from "@/types/syndrome-rollup";

/**
 * Map dose_value → dose_level for the current dose-group set, excluding
 * recovery satellites and null doses. Shared by DomainDoseRollup and
 * MemberRolesByDoseTable so the two panels never diverge on which doses
 * map to which levels.
 */
export function buildDoseLevelMap(doseGroups: DoseGroup[] | null | undefined): Map<number, number> {
  const m = new Map<number, number>();
  if (!doseGroups) return m;
  for (const dg of doseGroups) {
    if (dg.is_recovery) continue;
    if (dg.dose_value == null) continue;
    if (!m.has(dg.dose_value)) m.set(dg.dose_value, dg.dose_level);
  }
  return m;
}

export function buildDoseColumns(
  doseGroups: DoseGroup[] | null | undefined,
  noaelData: { sex: string; loael_dose_level: number | null }[] | undefined,
): DoseColumn[] {
  if (!doseGroups || doseGroups.length === 0) return [];

  const seen = new Set<number>();
  const treated: { dose_level: number; dose_value: number }[] = [];
  for (const dg of doseGroups) {
    if (dg.is_control) continue;
    if (dg.is_recovery) continue;
    if (dg.dose_value == null || dg.dose_value === 0) continue;
    if (seen.has(dg.dose_value)) continue;
    seen.add(dg.dose_value);
    treated.push({ dose_level: dg.dose_level, dose_value: dg.dose_value });
  }
  treated.sort((a, b) => a.dose_value - b.dose_value);

  const combined = noaelData?.find((r) => r.sex === "Combined");
  const loaelLevel = combined?.loael_dose_level ?? null;
  const loaelValue = loaelLevel != null
    ? doseGroups.find((dg) => dg.dose_level === loaelLevel && !dg.is_recovery)?.dose_value ?? null
    : null;

  return treated.map((t) => ({
    dose_value: t.dose_value,
    label: String(t.dose_value),
    is_loael: loaelValue != null && Math.abs(t.dose_value - loaelValue) < 1e-9,
  }));
}
