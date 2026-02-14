/**
 * Organ-level analytics extracted from TargetOrgansView for shell rail reuse.
 */
import type { TargetOrganRow, OrganEvidenceRow, RuleResult } from "@/types/analysis-views";

// ---------------------------------------------------------------------------
// Per-organ signal stats
// ---------------------------------------------------------------------------

export interface OrganStats {
  minPValue: number | null;
  maxEffectSize: number | null;
  doseConsistency: "Weak" | "Moderate" | "Strong";
}

export function computeOrganStats(rows: OrganEvidenceRow[]): OrganStats {
  let minP: number | null = null;
  let maxD: number | null = null;
  for (const r of rows) {
    if (r.p_value !== null && (minP === null || r.p_value < minP)) minP = r.p_value;
    if (r.effect_size !== null && (maxD === null || Math.abs(r.effect_size) > maxD))
      maxD = Math.abs(r.effect_size);
  }
  return {
    minPValue: minP,
    maxEffectSize: maxD,
    doseConsistency: getDoseConsistencyFromEvidence(rows),
  };
}

// ---------------------------------------------------------------------------
// Dose consistency (organ evidence data)
// ---------------------------------------------------------------------------

export function getDoseConsistencyFromEvidence(
  rows: OrganEvidenceRow[],
): "Weak" | "Moderate" | "Strong" {
  const byEndpoint = new Map<
    string,
    Map<number, { sigCount: number; total: number }>
  >();
  for (const r of rows) {
    let endpointMap = byEndpoint.get(r.endpoint_label);
    if (!endpointMap) {
      endpointMap = new Map();
      byEndpoint.set(r.endpoint_label, endpointMap);
    }
    const existing = endpointMap.get(r.dose_level);
    if (existing) {
      if (r.p_value !== null && r.p_value < 0.05) existing.sigCount++;
      existing.total++;
    } else {
      endpointMap.set(r.dose_level, {
        sigCount: r.p_value !== null && r.p_value < 0.05 ? 1 : 0,
        total: 1,
      });
    }
  }

  let monotonic = 0;
  const doseGroupsAffected = new Set<number>();
  for (const [, doseMap] of byEndpoint) {
    const sorted = [...doseMap.entries()].sort((a, b) => a[0] - b[0]);
    const rates = sorted.map(([, v]) =>
      v.total > 0 ? v.sigCount / v.total : 0,
    );
    let isMonotonic = true;
    for (let i = 1; i < rates.length; i++) {
      if (rates[i] < rates[i - 1] - 0.001) {
        isMonotonic = false;
        break;
      }
    }
    if (isMonotonic && rates.length > 1) monotonic++;
    for (const [dl, v] of sorted) {
      if (v.sigCount > 0) doseGroupsAffected.add(dl);
    }
  }

  const totalEndpoints = byEndpoint.size;
  if (totalEndpoints === 0) return "Weak";
  const monotonePct = monotonic / totalEndpoints;
  if (monotonePct > 0.5 && doseGroupsAffected.size >= 3) return "Strong";
  if (monotonePct > 0 || doseGroupsAffected.size >= 2) return "Moderate";
  return "Weak";
}

// ---------------------------------------------------------------------------
// Sex label derivation
// ---------------------------------------------------------------------------

export function deriveSexLabel(rows: OrganEvidenceRow[]): string {
  const sexes = new Set(rows.map((r) => r.sex));
  if (sexes.size === 1) {
    const s = [...sexes][0];
    return s === "M" ? "Male only" : s === "F" ? "Female only" : `${s} only`;
  }
  return "Both sexes";
}

// ---------------------------------------------------------------------------
// Organ conclusion text
// ---------------------------------------------------------------------------

export function deriveOrganConclusion(
  organ: TargetOrganRow,
  evidenceRows: OrganEvidenceRow[],
  organRules: RuleResult[],
): string {
  const significantPct =
    organ.n_endpoints > 0
      ? ((organ.n_significant / organ.n_endpoints) * 100).toFixed(0)
      : "0";

  const convergenceDesc = organ.target_organ_flag
    ? "Convergent evidence"
    : "Evidence";
  const domainDesc =
    organ.n_domains === 1 ? "1 domain" : `${organ.n_domains} domains`;
  const sigDesc = `${organ.n_significant}/${organ.n_endpoints} significant (${significantPct}%)`;
  const sexDesc = deriveSexLabel(evidenceRows).toLowerCase();

  const hasDoseRule = organRules.some(
    (r) => r.rule_id === "R01" || r.rule_id === "R04",
  );
  let doseDesc: string;
  if (hasDoseRule) {
    doseDesc = "dose-dependent";
  } else {
    const consistency = getDoseConsistencyFromEvidence(evidenceRows);
    doseDesc =
      consistency === "Strong"
        ? "dose-trending"
        : consistency === "Moderate"
          ? "some dose pattern"
          : "no clear dose pattern";
  }

  return `${convergenceDesc} across ${domainDesc}, ${sigDesc}, ${sexDesc}, ${doseDesc}.`;
}
