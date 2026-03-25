/**
 * Specimen grouping mode tests for findings-rail-engine.
 *
 * Covers: groupKey → groupEndpoints for specimen mode,
 * including catch-all "_no_specimen", sort order, and
 * filterEndpoints with groupFilter.
 */
import { describe, it, expect } from "vitest";
import {
  groupEndpoints,
  filterEndpoints,
  buildEndpointToGroupIndex,
  EMPTY_RAIL_FILTERS,
} from "@/lib/findings-rail-engine";
import type { EndpointWithSignal, RailFilters } from "@/lib/findings-rail-engine";

// ─── Helpers ─────────────────────────────────────────────

/** Minimal EndpointWithSignal stub. Only fields used by grouping/filtering. */
function ep(overrides: Partial<EndpointWithSignal> & { endpoint_label: string }): EndpointWithSignal {
  return {
    organ_system: "hepatic",
    domain: "MI",
    worstSeverity: "normal",
    treatmentRelated: false,
    maxEffectSize: null,
    minPValue: null,
    direction: null,
    sexes: ["M"],
    pattern: "flat",
    maxFoldChange: null,
    signal: 1,
    ...overrides,
  } as EndpointWithSignal;
}

// ─── Test data ───────────────────────────────────────────

const LIVER_MI = ep({ endpoint_label: "LIVER — HYPERTROPHY", specimen: "LIVER", domain: "MI", organ_system: "hepatic", worstSeverity: "adverse", treatmentRelated: true, signal: 10, maxIncidence: 0.8 });
const LIVER_MA = ep({ endpoint_label: "LIVER — MASS", specimen: "LIVER", domain: "MA", organ_system: "hepatic", worstSeverity: "warning", signal: 5, maxIncidence: 0.3 });
const KIDNEY_MI = ep({ endpoint_label: "KIDNEY — NEPHROPATHY", specimen: "KIDNEY", domain: "MI", organ_system: "renal", worstSeverity: "adverse", treatmentRelated: true, signal: 8, maxIncidence: 0.6 });
const ALT_LB = ep({ endpoint_label: "ALT", specimen: null, domain: "LB", organ_system: "hepatic", worstSeverity: "warning", signal: 6 });
const BW_GAIN = ep({ endpoint_label: "BW Gain", specimen: null, domain: "BW", organ_system: "body weight", worstSeverity: "normal", signal: 2 });

const ALL_ENDPOINTS = [LIVER_MI, LIVER_MA, KIDNEY_MI, ALT_LB, BW_GAIN];

// ─── Tests ───────────────────────────────────────────────

describe("specimen grouping mode", () => {
  it("groups endpoints by specimen, non-specimen into _no_specimen", () => {
    const cards = groupEndpoints(ALL_ENDPOINTS, "specimen");
    const keys = cards.map((c) => c.key);

    // Three groups: LIVER, KIDNEY, _no_specimen
    expect(keys).toContain("LIVER");
    expect(keys).toContain("KIDNEY");
    expect(keys).toContain("_no_specimen");
    expect(cards).toHaveLength(3);
  });

  it("LIVER card contains both MI and MA endpoints", () => {
    const cards = groupEndpoints(ALL_ENDPOINTS, "specimen");
    const liver = cards.find((c) => c.key === "LIVER")!;

    expect(liver.endpoints).toHaveLength(2);
    expect(liver.endpoints.map((e) => e.endpoint_label).sort()).toEqual([
      "LIVER — HYPERTROPHY",
      "LIVER — MASS",
    ]);
  });

  it("_no_specimen card contains LB and BW endpoints", () => {
    const cards = groupEndpoints(ALL_ENDPOINTS, "specimen");
    const noSpec = cards.find((c) => c.key === "_no_specimen")!;

    expect(noSpec.endpoints).toHaveLength(2);
    expect(noSpec.endpoints.map((e) => e.endpoint_label).sort()).toEqual([
      "ALT",
      "BW Gain",
    ]);
  });

  it("_no_specimen card always sorts last", () => {
    const cards = groupEndpoints(ALL_ENDPOINTS, "specimen");
    const lastCard = cards[cards.length - 1];

    expect(lastCard.key).toBe("_no_specimen");
  });

  it("_no_specimen sorts last even when it has higher signal", () => {
    const highSignalNonSpecimen = ep({ endpoint_label: "HIGH_SIGNAL", specimen: null, domain: "LB", organ_system: "hepatic", signal: 999 });
    const lowSignalSpecimen = ep({ endpoint_label: "SPLEEN — ATROPHY", specimen: "SPLEEN", domain: "MI", organ_system: "lymphoid", signal: 1 });
    const cards = groupEndpoints([highSignalNonSpecimen, lowSignalSpecimen], "specimen");

    expect(cards[0].key).toBe("SPLEEN");
    expect(cards[1].key).toBe("_no_specimen");
  });

  it("cards sort by groupSignal descending (excluding _no_specimen)", () => {
    const cards = groupEndpoints(ALL_ENDPOINTS, "specimen");
    const specimenCards = cards.filter((c) => c.key !== "_no_specimen");

    // LIVER: signal 10 + 5 = 15, KIDNEY: signal 8
    expect(specimenCards[0].key).toBe("LIVER");
    expect(specimenCards[0].groupSignal).toBe(15);
    expect(specimenCards[1].key).toBe("KIDNEY");
    expect(specimenCards[1].groupSignal).toBe(8);
  });

  it("aggregates adverseCount and trCount per specimen", () => {
    const cards = groupEndpoints(ALL_ENDPOINTS, "specimen");
    const liver = cards.find((c) => c.key === "LIVER")!;
    const kidney = cards.find((c) => c.key === "KIDNEY")!;

    expect(liver.adverseCount).toBe(1); // HYPERTROPHY is adverse
    expect(liver.trCount).toBe(1);      // HYPERTROPHY is TR
    expect(kidney.adverseCount).toBe(1);
    expect(kidney.trCount).toBe(1);
  });

  it("buildEndpointToGroupIndex maps endpoints to specimen keys", () => {
    const index = buildEndpointToGroupIndex(ALL_ENDPOINTS as any, "specimen");

    expect(index.get("LIVER — HYPERTROPHY")).toBe("LIVER");
    expect(index.get("LIVER — MASS")).toBe("LIVER");
    expect(index.get("KIDNEY — NEPHROPATHY")).toBe("KIDNEY");
    expect(index.get("ALT")).toBe("_no_specimen");
    expect(index.get("BW Gain")).toBe("_no_specimen");
  });

  it("filterEndpoints with groupFilter filters by specimen key", () => {
    const filters: RailFilters = { ...EMPTY_RAIL_FILTERS, groupFilter: new Set(["LIVER"]) };
    const result = filterEndpoints(ALL_ENDPOINTS as any, filters, "specimen");

    expect(result).toHaveLength(2);
    expect(result.every((e) => e.specimen === "LIVER")).toBe(true);
  });

  it("filterEndpoints with _no_specimen groupFilter returns non-specimen endpoints", () => {
    const filters: RailFilters = { ...EMPTY_RAIL_FILTERS, groupFilter: new Set(["_no_specimen"]) };
    const result = filterEndpoints(ALL_ENDPOINTS as any, filters, "specimen");

    expect(result).toHaveLength(2);
    expect(result.every((e) => e.specimen == null)).toBe(true);
  });
});

describe("specimen grouping does not affect other modes", () => {
  it("organ mode still groups by organ_system", () => {
    const cards = groupEndpoints(ALL_ENDPOINTS, "organ");
    const keys = cards.map((c) => c.key);

    expect(keys).toContain("hepatic");
    expect(keys).toContain("renal");
    expect(keys).toContain("body weight");
    // LIVER MI + LIVER MA + ALT all in "hepatic"
    const hepatic = cards.find((c) => c.key === "hepatic")!;
    expect(hepatic.endpoints).toHaveLength(3);
  });

  it("finding mode groups all into _all", () => {
    const cards = groupEndpoints(ALL_ENDPOINTS, "finding");
    expect(cards).toHaveLength(1);
    expect(cards[0].key).toBe("_all");
    expect(cards[0].endpoints).toHaveLength(5);
  });
});
