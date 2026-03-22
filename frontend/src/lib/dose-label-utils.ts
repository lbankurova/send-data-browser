import type { DoseGroup } from "@/types/analysis";

/** Shorten a dose label using DoseGroup metadata when available. */
export function shortDoseLabel(doseLabel: string, doseGroups?: DoseGroup[]): string {
  if (!doseGroups) return doseLabel;
  const dg = doseGroups.find((d) => doseLabel.includes(d.label) || d.label.includes(doseLabel));
  if (dg && dg.dose_value != null && dg.dose_value > 0) {
    return `${dg.dose_value} ${dg.dose_unit ?? ""}`.trim();
  }
  if (doseLabel.toLowerCase().includes("control") || doseLabel.includes("Vehicle")) {
    return "Ctrl";
  }
  return doseLabel.length > 12 ? doseLabel.slice(0, 10) + "\u2026" : doseLabel;
}
