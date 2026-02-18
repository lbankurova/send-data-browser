import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { buildContext, resolveCanonical } from "@/lib/lab-clinical-catalog";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const contexts = buildContext(endpoints);

describe("buildContext — structural invariants", () => {
  test("returns at least 1 context", () => {
    expect(contexts.length).toBeGreaterThanOrEqual(1);
  });

  test("every context has a sexFilter (M, F, or undefined for aggregate)", () => {
    for (const ctx of contexts) {
      expect([undefined, "M", "F"]).toContain(ctx.sexFilter);
    }
  });

  test("every direction value is valid (up/down/none)", () => {
    for (const ctx of contexts) {
      for (const [canonical, dir] of ctx.endpointDirection) {
        expect(
          ["up", "down", "none", null].includes(dir),
          `${canonical} in context ${ctx.sexFilter ?? "aggregate"} has invalid direction "${dir}"`,
        ).toBe(true);
      }
    }
  });

  test("every fold change is non-negative and < 10 (not Cohen's d)", () => {
    for (const ctx of contexts) {
      for (const [canonical, fc] of ctx.foldChanges) {
        expect(fc, `${canonical} fold change should be >= 0`).toBeGreaterThanOrEqual(0);
        expect(fc, `${canonical} fold change ${fc} is suspiciously high (Cohen's d?)`).toBeLessThan(10);
      }
    }
  });

  test("every canonical in context exists as a resolvable endpoint label", () => {
    const resolvedCanonicals = new Set<string>();
    for (const ep of endpoints) {
      const c = resolveCanonical(ep.endpoint_label, ep.testCode);
      if (c) resolvedCanonicals.add(c);
    }

    for (const ctx of contexts) {
      for (const [canonical] of ctx.endpointDirection) {
        expect(
          resolvedCanonicals.has(canonical),
          `Context has canonical "${canonical}" that doesn't resolve from any endpoint`,
        ).toBe(true);
      }
    }
  });

  test("divergent endpoints have sex-specific directions in per-sex contexts", () => {
    // Find endpoints that have bySex with different directions
    const divergent = endpoints.filter((ep) => {
      if (!ep.bySex || ep.bySex.size < 2) return false;
      const dirs = [...ep.bySex.values()].map((s) => s.direction);
      return new Set(dirs).size > 1;
    });

    if (divergent.length === 0 || contexts.length < 2) return; // skip if no divergent data

    for (const ep of divergent) {
      const canonical = resolveCanonical(ep.endpoint_label, ep.testCode);
      if (!canonical) continue;

      for (const ctx of contexts) {
        if (!ctx.sexFilter) continue; // skip aggregate
        const sexData = ep.bySex!.get(ctx.sexFilter);
        if (!sexData) continue;
        const ctxDir = ctx.endpointDirection.get(canonical);
        if (ctxDir === undefined) continue;
        expect(
          ctxDir,
          `${canonical} in ${ctx.sexFilter} context: expected ${sexData.direction}, got ${ctxDir}`,
        ).toBe(sexData.direction);
      }
    }
  });
});
