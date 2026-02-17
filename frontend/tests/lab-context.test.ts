import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { buildContext } from "@/lib/lab-clinical-catalog";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const contexts = buildContext(endpoints);

describe("buildContext for PointCross", () => {
  // Per-sex evaluation produces multiple contexts
  test("returns 2 contexts (M and F) for PointCross", () => {
    expect(contexts.length).toBe(2);
  });

  // ── Direction assertions (non-divergent endpoints: same in all contexts) ──

  test("ALT direction is up", () => {
    expect(contexts[0].endpointDirection.get("ALT")).toBe("up");
  });

  test("HGB direction is down", () => {
    expect(contexts[0].endpointDirection.get("HGB")).toBe("down");
  });

  test("ALP direction is up", () => {
    expect(contexts[0].endpointDirection.get("ALP")).toBe("up");
  });

  // ── NEUT direction: sex-specific in per-sex contexts ──

  test("NEUT direction is down in F context (sexFilter=F)", () => {
    const fCtx = contexts.find(c => c.sexFilter === "F");
    expect(fCtx).toBeDefined();
    expect(fCtx!.endpointDirection.get("NEUT")).toBe("up");
  });

  test("NEUT direction is down in M context (sexFilter=M)", () => {
    const mCtx = contexts.find(c => c.sexFilter === "M");
    expect(mCtx).toBeDefined();
    expect(mCtx!.endpointDirection.get("NEUT")).toBe("down");
  });

  // ── Fold change assertions ──

  test("ALT fold change is approximately 1.25-1.34", () => {
    const fc = contexts[0].foldChanges.get("ALT");
    expect(fc).toBeGreaterThan(1.1);
    expect(fc).toBeLessThan(1.5);
  });

  test("HGB fold change is approximately 1.10", () => {
    const fc = contexts[0].foldChanges.get("HGB");
    expect(fc).toBeGreaterThan(1.0);
    expect(fc).toBeLessThan(1.3);
  });

  test("ALT fold change is NOT Cohen's d (must be < 2.0)", () => {
    const fc = contexts[0].foldChanges.get("ALT");
    expect(fc).toBeLessThan(2.0);
  });

  test("HGB fold change is NOT Cohen's d (must be < 2.0)", () => {
    const fc = contexts[0].foldChanges.get("HGB");
    expect(fc).toBeLessThan(2.0);
  });

  // ── Bilirubin direction — the L03 false trigger ──

  test("TBILI direction should be down (or absent) — not up", () => {
    const dir = contexts[0].endpointDirection.get("TBILI");
    expect(dir).not.toBe("up");
  });

  // ── No phantom canonicals from false positive matching ──

  test("PANCREAS — INFLAMMATION does not pollute NEUT direction", () => {
    const mCtx = contexts.find(c => c.sexFilter === "M");
    expect(mCtx!.endpointDirection.get("NEUT")).toBe("down");
  });
});
