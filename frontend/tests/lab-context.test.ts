import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { buildContext } from "@/lib/lab-clinical-catalog";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const ctx = buildContext(endpoints);

describe("buildContext for PointCross", () => {
  // ── Direction assertions ──

  test("ALT direction is up", () => {
    expect(ctx.endpointDirection.get("ALT")).toBe("up");
  });

  test("NEUT direction is down", () => {
    expect(ctx.endpointDirection.get("NEUT")).toBe("down");
  });

  test("HGB direction is down", () => {
    expect(ctx.endpointDirection.get("HGB")).toBe("down");
  });

  test("ALP direction is up", () => {
    expect(ctx.endpointDirection.get("ALP")).toBe("up");
  });

  // ── Fold change assertions ──

  test("ALT fold change is approximately 1.25-1.34", () => {
    const fc = ctx.foldChanges.get("ALT");
    expect(fc).toBeGreaterThan(1.1);
    expect(fc).toBeLessThan(1.5);
  });

  test("HGB fold change is approximately 1.10", () => {
    const fc = ctx.foldChanges.get("HGB");
    expect(fc).toBeGreaterThan(1.0);
    expect(fc).toBeLessThan(1.3);
  });

  test("ALT fold change is NOT Cohen's d (must be < 2.0)", () => {
    const fc = ctx.foldChanges.get("ALT");
    expect(fc).toBeLessThan(2.0);
  });

  test("HGB fold change is NOT Cohen's d (must be < 2.0)", () => {
    const fc = ctx.foldChanges.get("HGB");
    expect(fc).toBeLessThan(2.0);
  });

  // ── Bilirubin direction — the L03 false trigger ──

  test("TBILI direction should be down (or absent) — not up", () => {
    const dir = ctx.endpointDirection.get("TBILI");
    expect(dir).not.toBe("up");
  });

  // ── No phantom canonicals from false positive matching ──

  test("PANCREAS — INFLAMMATION does not pollute NEUT direction", () => {
    expect(ctx.endpointDirection.get("NEUT")).toBe("down");
  });
});
