/**
 * Organ-scope NOAEL display computation.
 *
 * Extracted from OrganContextPanel.tsx so the same per-organ NOAEL label
 * surfaces in (a) the OrganContextPanel "Organ NOAEL" pane and (b) the
 * center-pane ScopeBanner organ variant. Per radar-forest-cleanup F7 + F12,
 * the organ-NOAEL display moves from the rail context panel to the scope
 * banner; both consumers must produce the same label so they can't drift.
 *
 * The "organ NOAEL" is the lowest per-endpoint NOAEL across endpoints in
 * the organ's scope. Per-endpoint NOAEL: lowest dose with min-p across both
 * sexes, then NOAEL = dose just below the first p<0.05 dose.
 */

import type { UnifiedFinding } from "@/types/analysis";
import type { EndpointSummary } from "@/lib/derive-summaries";
import { getDoseLabel } from "@/lib/dose-label-utils";

export interface EndpointNoaelDisplay {
  endpoint_label: string;
  noaelLabel: string;
  noaelDoseLevel: number; // for sorting: -1 = below range, 0+ = dose level, Infinity = all clear
  isDriving: boolean;
}

export interface OrganNoaelDisplay {
  organNoael: string;
  drivingEndpoint: string;
  endpoints: EndpointNoaelDisplay[];
}

export function computeOrganNoaelDisplay(
  findings: UnifiedFinding[],
  organEndpoints: EndpointSummary[],
  doseGroups?: Array<{ dose_level: number; dose_value: number | null; dose_unit: string | null; label: string }>,
): OrganNoaelDisplay {
  const endpointLabels = new Set(organEndpoints.map(e => e.endpoint_label));

  const byEndpoint = new Map<string, UnifiedFinding[]>();
  for (const f of findings) {
    const label = f.endpoint_label ?? f.finding;
    if (!endpointLabels.has(label)) continue;
    let list = byEndpoint.get(label);
    if (!list) {
      list = [];
      byEndpoint.set(label, list);
    }
    list.push(f);
  }

  const dl = (level: number) => getDoseLabel(level, doseGroups);

  const results: EndpointNoaelDisplay[] = [];
  let minNoaelLevel = Infinity;
  let drivingEndpoint = "";

  for (const epSummary of organEndpoints) {
    const label = epSummary.endpoint_label;
    const epFindings = byEndpoint.get(label);

    if (!epFindings || epFindings.length === 0) {
      results.push({
        endpoint_label: label,
        noaelLabel: "No data",
        noaelDoseLevel: Infinity,
        isDriving: false,
      });
      continue;
    }

    // Aggregate pairwise across ALL findings (both sexes) — take min p-value per dose
    const doseMinP = new Map<number, number>();
    let hasPairwise = false;
    for (const f of epFindings) {
      for (const pw of f.pairwise ?? []) {
        if (pw.dose_level <= 0) continue;
        hasPairwise = true;
        const p = pw.p_value_adj ?? pw.p_value;
        if (p != null) {
          const prev = doseMinP.get(pw.dose_level);
          if (prev == null || p < prev) doseMinP.set(pw.dose_level, p);
        }
      }
    }

    if (!hasPairwise) {
      results.push({
        endpoint_label: label,
        noaelLabel: "No stats",
        noaelDoseLevel: Infinity,
        isDriving: false,
      });
      continue;
    }

    const sorted = [...doseMinP.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([dose_level, p]) => ({ dose_level, p }));

    let loaelIdx = -1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].p < 0.05) {
        loaelIdx = i;
        break;
      }
    }

    let noaelLevel: number;
    let noaelLabel: string;

    if (loaelIdx === -1) {
      const highestLevel = sorted[sorted.length - 1]?.dose_level ?? 0;
      noaelLevel = highestLevel + 1000;
      noaelLabel = `>= ${dl(highestLevel)}`;
    } else if (loaelIdx === 0) {
      noaelLevel = -1;
      noaelLabel = `< ${dl(sorted[0].dose_level)}`;
    } else {
      noaelLevel = sorted[loaelIdx - 1].dose_level;
      noaelLabel = dl(noaelLevel);
    }

    if (noaelLevel < minNoaelLevel) {
      minNoaelLevel = noaelLevel;
      drivingEndpoint = label;
    }

    results.push({
      endpoint_label: label,
      noaelLabel,
      noaelDoseLevel: noaelLevel,
      isDriving: false,
    });
  }

  for (const r of results) {
    r.isDriving = r.endpoint_label === drivingEndpoint;
  }
  results.sort((a, b) => a.noaelDoseLevel - b.noaelDoseLevel);

  let organNoael = "Not established";
  const drivingResult = results.find(r => r.isDriving);
  if (drivingResult) {
    organNoael = drivingResult.noaelLabel;
  }

  return { organNoael, drivingEndpoint, endpoints: results };
}
