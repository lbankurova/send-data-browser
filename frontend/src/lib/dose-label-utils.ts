import type { DoseGroup } from "@/types/analysis";
import { getDoseGroupColor } from "@/lib/severity-colors";

/** Shorten a dose label using DoseGroup metadata when available.
 *
 *  Prefers `short_label` from backend-computed display config.
 *  Falls back to dose_value extraction, then truncation.
 */
export function shortDoseLabel(doseLabel: string, doseGroups?: DoseGroup[]): string {
  if (!doseGroups) return doseLabel;
  const dg = doseGroups.find((d) => doseLabel.includes(d.label) || d.label.includes(doseLabel));
  // Prefer pre-computed short_label
  if (dg?.short_label) return dg.short_label;
  if (dg && dg.dose_value != null && dg.dose_value > 0) {
    return `${dg.dose_value} ${dg.dose_unit ?? ""}`.trim();
  }
  if (doseLabel.toLowerCase().includes("control") || doseLabel.includes("Vehicle")) {
    return "Ctrl";
  }
  return doseLabel.length > 12 ? doseLabel.slice(0, 10) + "\u2026" : doseLabel;
}

/** Get the display color for a dose group, using backend-computed positional color.
 *  Falls back to legacy level-based color.
 */
export function getDoseDisplayColor(dg: DoseGroup): string {
  return dg.display_color ?? (dg.is_control ? "#6b7280" : "#3b82f6");
}

/**
 * Build a dose_level -> display_color lookup map from DoseGroup metadata.
 * For chart builders that work with raw dose_level numbers instead of DoseGroup objects.
 * Falls back to legacy getDoseGroupColor() for levels not in the map.
 */
export function buildDoseColorMap(doseGroups: DoseGroup[] | undefined): (level: number) => string {
  if (!doseGroups?.length) return getDoseGroupColor;
  const map = new Map<number, string>();
  for (const dg of doseGroups) {
    if (dg.display_color) map.set(dg.dose_level, dg.display_color);
  }
  return (level: number) => map.get(level) ?? getDoseGroupColor(level);
}

/**
 * Build a dose_level -> short_label lookup map from DoseGroup metadata.
 * For chart builders that need short labels by dose_level number.
 */
export function buildDoseShortLabelMap(doseGroups: DoseGroup[] | undefined): Map<number, string> {
  const map = new Map<number, string>();
  if (!doseGroups) return map;
  for (const dg of doseGroups) {
    if (dg.short_label) map.set(dg.dose_level, dg.short_label);
  }
  return map;
}
