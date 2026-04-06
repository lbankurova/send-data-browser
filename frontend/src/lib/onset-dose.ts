/**
 * Onset dose resolution logic.
 *
 * Determines the onset dose (first dose level showing an effect) using:
 * 1. Pattern override annotation (highest priority — user-specified)
 * 2. Backend classifier's onset_dose_level (algorithmic, set for threshold patterns)
 * 3. First dose with pairwise p < 0.05 (statistical fallback)
 *
 * Returns { doseLevel, source } or null if no onset detected.
 */
import type { DoseGroup, UnifiedFinding } from "@/types/analysis";

export interface OnsetResult {
  doseLevel: number;
  source: "override" | "algorithm" | "pvalue";
}

/**
 * Resolve onset dose for a finding, considering overrides and algorithmic values.
 */
export function resolveOnsetDose(finding: UnifiedFinding): OnsetResult | null {
  // 1. User override (highest priority)
  const override = finding._pattern_override;
  if (override && override.pattern !== "no_change" && override.onset_dose_level != null) {
    return { doseLevel: override.onset_dose_level, source: "override" };
  }

  // 2. Backend classifier onset_dose_level (threshold/non-monotonic patterns)
  if (finding.onset_dose_level != null) {
    return { doseLevel: finding.onset_dose_level, source: "algorithm" };
  }

  // 3. First pairwise p < 0.05 (statistical fallback)
  const pw = finding.pairwise;
  if (pw && pw.length > 0) {
    const sorted = [...pw].sort((a, b) => a.dose_level - b.dose_level);
    for (const p of sorted) {
      const pv = p.p_value_adj ?? p.p_value;
      if (pv != null && pv < 0.05) {
        return { doseLevel: p.dose_level, source: "pvalue" };
      }
    }
  }

  return null;
}

/**
 * Resolve the effective dose-response pattern, considering user overrides.
 *
 * - If override exists and pattern is not "no_change", use override pattern
 * - If override is "no_change", map to "flat" (user says no treatment effect)
 * - Otherwise, fall back to backend's dose_response_pattern
 *
 * Returns null when no pattern is available (caller decides fallback).
 */
export function resolveEffectivePattern(finding: UnifiedFinding): string | null {
  const override = finding._pattern_override;
  if (override) {
    return override.pattern === "no_change" ? "flat" : override.pattern;
  }
  return finding.dose_response_pattern ?? null;
}

/**
 * Format an onset dose level into a display label using dose groups.
 */
export function formatOnsetDose(
  doseLevel: number,
  doseGroups: DoseGroup[],
): string {
  const dg = doseGroups.find(g => g.dose_level === doseLevel);
  if (!dg) return `Level ${doseLevel}`;
  return dg.dose_value != null
    ? `${dg.dose_value} ${dg.dose_unit ?? "mg/kg"}`.trim()
    : dg.label;
}

/**
 * Determine the default onset dose level for a given pattern override.
 *
 * - monotonic → lowest treatment dose (dose_level 1)
 * - threshold / non_monotonic / u_shaped → null (user must specify)
 * - no_change → null (no onset for flat pattern)
 */
export function defaultOnsetForPattern(pattern: string): number | null {
  if (pattern === "monotonic") return 1;
  return null;
}

/**
 * Check if onset dose needs attention (muted border hint).
 *
 * Returns true when a directional pattern has no onset set yet (pending user selection).
 */
export function onsetNeedsAttention(
  pattern: string,
  onsetDoseLevel: number | null,
): boolean {
  if (pattern === "no_change" || pattern === "flat") return false;
  if (onsetDoseLevel == null) return true;
  return false;
}
