/**
 * Findings Rail Engine — pure functions for signal scoring, grouping, filtering, sorting.
 * Consumed by FindingsRail component.
 */

import type { EndpointSummary } from "@/lib/derive-summaries";

// ─── Types ─────────────────────────────────────────────────

export type GroupingMode = "organ" | "domain" | "pattern";
export type SortMode = "signal" | "pvalue" | "effect" | "az";

export interface EndpointWithSignal extends EndpointSummary {
  signal: number;
}

export interface GroupCard {
  key: string;
  label: string;
  adverseCount: number;
  trCount: number;
  totalEndpoints: number;
  groupSignal: number;
  endpoints: EndpointWithSignal[];
}

export interface SignalSummaryStats {
  adverseCount: number;
  warningCount: number;
  trCount: number;
  totalEndpoints: number;
}

// ─── Signal score ──────────────────────────────────────────

const PATTERN_WEIGHTS: Record<string, number> = {
  monotonic_increase: 2,
  monotonic_decrease: 2,
  threshold: 1.5,
  non_monotonic: 0.5,
  flat: 0,
};

export function computeEndpointSignal(ep: EndpointSummary): number {
  const severityWeight = ep.worstSeverity === "adverse" ? 3 : 1;
  const pValueWeight = ep.minPValue !== null ? Math.max(0, -Math.log10(ep.minPValue)) : 0;
  const effectWeight = ep.maxEffectSize !== null ? Math.min(Math.abs(ep.maxEffectSize), 5) : 0;
  const trBoost = ep.treatmentRelated ? 2 : 0;
  const patternWeight = PATTERN_WEIGHTS[ep.pattern] ?? 0;
  return severityWeight + pValueWeight + effectWeight + trBoost + patternWeight;
}

export function withSignalScores(endpoints: EndpointSummary[]): EndpointWithSignal[] {
  return endpoints.map((ep) => ({ ...ep, signal: computeEndpointSignal(ep) }));
}

// ─── Signal summary (always full dataset, unfiltered) ──────

export function computeSignalSummary(endpoints: EndpointSummary[]): SignalSummaryStats {
  let adverseCount = 0;
  let warningCount = 0;
  let trCount = 0;
  for (const ep of endpoints) {
    if (ep.worstSeverity === "adverse") adverseCount++;
    else if (ep.worstSeverity === "warning") warningCount++;
    if (ep.treatmentRelated) trCount++;
  }
  return { adverseCount, warningCount, trCount, totalEndpoints: endpoints.length };
}

// ─── Grouping ──────────────────────────────────────────────

function groupKey(ep: EndpointWithSignal, mode: GroupingMode): string {
  switch (mode) {
    case "organ": return ep.organ_system;
    case "domain": return ep.domain;
    case "pattern": return ep.pattern;
  }
}

export function groupEndpoints(
  endpoints: EndpointWithSignal[],
  mode: GroupingMode,
): GroupCard[] {
  const groups = new Map<string, EndpointWithSignal[]>();

  for (const ep of endpoints) {
    const key = groupKey(ep, mode);
    let list = groups.get(key);
    if (!list) {
      list = [];
      groups.set(key, list);
    }
    list.push(ep);
  }

  const cards: GroupCard[] = [];
  for (const [key, eps] of groups) {
    let adverseCount = 0;
    let trCount = 0;
    let groupSignal = 0;
    for (const ep of eps) {
      if (ep.worstSeverity === "adverse") adverseCount++;
      if (ep.treatmentRelated) trCount++;
      groupSignal += ep.signal;
    }
    cards.push({
      key,
      label: key,
      adverseCount,
      trCount,
      totalEndpoints: eps.length,
      groupSignal,
      endpoints: eps,
    });
  }

  // Sort cards by group signal descending; tiebreak: adverseCount desc, then name alpha
  cards.sort((a, b) =>
    b.groupSignal - a.groupSignal ||
    b.adverseCount - a.adverseCount ||
    a.key.localeCompare(b.key)
  );

  return cards;
}

// ─── Rail filters ──────────────────────────────────────────

export interface RailFilters {
  search: string;
  trOnly: boolean;
  sigOnly: boolean;
  /** null = all selected (no filter). Set of group keys to include. */
  groupFilter: ReadonlySet<string> | null;
}

export function filterEndpoints(
  endpoints: EndpointWithSignal[],
  filters: RailFilters,
  grouping: GroupingMode,
): EndpointWithSignal[] {
  let result = endpoints;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter((ep) => ep.endpoint_label.toLowerCase().includes(q));
  }
  if (filters.trOnly) {
    result = result.filter((ep) => ep.treatmentRelated);
  }
  if (filters.sigOnly) {
    result = result.filter((ep) => ep.minPValue !== null && ep.minPValue < 0.05);
  }
  if (filters.groupFilter !== null) {
    result = result.filter((ep) => filters.groupFilter!.has(groupKey(ep, grouping)));
  }
  return result;
}

export function isFiltered(filters: RailFilters): boolean {
  return filters.search !== "" || filters.trOnly || filters.sigOnly || filters.groupFilter !== null;
}

// ─── Sort modes ────────────────────────────────────────────

export function sortEndpoints(
  endpoints: EndpointWithSignal[],
  mode: SortMode,
): EndpointWithSignal[] {
  const sorted = [...endpoints];
  switch (mode) {
    case "signal":
      sorted.sort((a, b) => b.signal - a.signal);
      break;
    case "pvalue":
      sorted.sort((a, b) => {
        if (a.minPValue === null && b.minPValue === null) return 0;
        if (a.minPValue === null) return 1;
        if (b.minPValue === null) return -1;
        return a.minPValue - b.minPValue;
      });
      break;
    case "effect":
      sorted.sort((a, b) => {
        const ae = a.maxEffectSize !== null ? Math.abs(a.maxEffectSize) : -1;
        const be = b.maxEffectSize !== null ? Math.abs(b.maxEffectSize) : -1;
        return be - ae;
      });
      break;
    case "az":
      sorted.sort((a, b) => a.endpoint_label.localeCompare(b.endpoint_label));
      break;
  }
  return sorted;
}

// ─── Domain labels ─────────────────────────────────────────

const DOMAIN_FULL_LABELS: Record<string, string> = {
  LB: "Laboratory",
  BW: "Body Weight",
  OM: "Organ Measurement",
  MI: "Microscopic",
  MA: "Macroscopic",
  CL: "Clinical Observation",
};

export function getDomainFullLabel(domain: string): string {
  return DOMAIN_FULL_LABELS[domain.toUpperCase()] ?? domain;
}

// ─── Pattern labels ────────────────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  monotonic_increase: "Monotonic Increase",
  monotonic_decrease: "Monotonic Decrease",
  threshold: "Threshold",
  non_monotonic: "Non-Monotonic",
  flat: "Flat",
};

export function getPatternLabel(pattern: string): string {
  return PATTERN_LABELS[pattern] ?? pattern;
}

// ─── Reverse lookup: endpoint → group key ──────────────────

export function buildEndpointToGroupIndex(
  endpoints: EndpointWithSignal[],
  mode: GroupingMode,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const ep of endpoints) {
    index.set(ep.endpoint_label, groupKey(ep, mode));
  }
  return index;
}
