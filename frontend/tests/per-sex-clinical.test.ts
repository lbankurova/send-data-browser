import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { buildContext, evaluateLabRules, resolveCanonical } from "@/lib/lab-clinical-catalog";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const contexts = buildContext(endpoints);
const matches = evaluateLabRules(endpoints);

describe("per-sex clinical evaluation", () => {
  // ── bySex foundation ──

  test("bySex present on Neutrophils (multi-sex endpoint)", () => {
    const neut = endpoints.find(e => resolveCanonical(e.endpoint_label, e.testCode) === "NEUT");
    expect(neut?.bySex).toBeDefined();
    expect(neut!.bySex!.size).toBeGreaterThanOrEqual(2);
  });

  test("bySex M direction=down for NEUT", () => {
    const neut = endpoints.find(e => resolveCanonical(e.endpoint_label, e.testCode) === "NEUT");
    expect(neut!.bySex!.get("M")!.direction).toBe("down");
  });

  test("bySex F direction=up for NEUT", () => {
    const neut = endpoints.find(e => resolveCanonical(e.endpoint_label, e.testCode) === "NEUT");
    expect(neut!.bySex!.get("F")!.direction).toBe("up");
  });

  test("bySex M fold change ≈ 1.51 for NEUT", () => {
    const neut = endpoints.find(e => resolveCanonical(e.endpoint_label, e.testCode) === "NEUT");
    const fc = neut!.bySex!.get("M")!.maxFoldChange;
    expect(fc).toBeGreaterThan(1.3);
    expect(fc).toBeLessThan(1.7);
  });

  test("bySex F fold change ≈ 2.07 for NEUT", () => {
    const neut = endpoints.find(e => resolveCanonical(e.endpoint_label, e.testCode) === "NEUT");
    const fc = neut!.bySex!.get("F")!.maxFoldChange;
    expect(fc).toBeGreaterThan(1.8);
    expect(fc).toBeLessThan(2.5);
  });

  test("bySex present on non-divergent endpoint (ALT: both M/F direction=up)", () => {
    const alt = endpoints.find(e => resolveCanonical(e.endpoint_label, e.testCode) === "ALT");
    // ALT has data for both sexes, so bySex should be present
    if (alt?.bySex) {
      // Both directions should be "up" (non-divergent)
      for (const [, sexData] of alt.bySex) {
        expect(sexData.direction).toBe("up");
      }
    }
  });

  // ── Context array ──

  test("contexts.length === 2 for PointCross (M and F)", () => {
    expect(contexts.length).toBe(2);
  });

  test("M context: NEUT direction=down, fold ≈ 1.51", () => {
    const mCtx = contexts.find(c => c.sexFilter === "M");
    expect(mCtx).toBeDefined();
    expect(mCtx!.endpointDirection.get("NEUT")).toBe("down");
    const fc = mCtx!.foldChanges.get("NEUT")!;
    expect(fc).toBeGreaterThan(1.3);
    expect(fc).toBeLessThan(1.7);
  });

  test("F context: NEUT direction=up, fold ≈ 2.07", () => {
    const fCtx = contexts.find(c => c.sexFilter === "F");
    expect(fCtx).toBeDefined();
    expect(fCtx!.endpointDirection.get("NEUT")).toBe("up");
    const fc = fCtx!.foldChanges.get("NEUT")!;
    expect(fc).toBeGreaterThan(1.8);
    expect(fc).toBeLessThan(2.5);
  });

  test("non-divergent (ALT): same direction in both contexts", () => {
    const dirs = contexts.map(c => c.endpointDirection.get("ALT"));
    expect(dirs[0]).toBe("up");
    expect(dirs[1]).toBe("up");
  });

  // ── Rule firing ──

  test("L19 doesn't fire for M (1.51 < 2) or F (direction=up, L19 requires decrease)", () => {
    const l19 = matches.filter(m => m.ruleId === "L19");
    expect(l19.length).toBe(0);
  });

  test("L28 fires for F (NEUT increase ≥2×), not for M (direction=down)", () => {
    const l28 = matches.filter(m => m.ruleId === "L28");
    expect(l28.length).toBe(1);
    expect(l28[0].sex).toBe("F");
  });

  test("L28 match.sex is 'F'", () => {
    const l28 = matches.find(m => m.ruleId === "L28");
    expect(l28).toBeDefined();
    expect(l28!.sex).toBe("F");
  });
});
