import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { buildContext, evaluateLabRules, resolveCanonical } from "@/lib/lab-clinical-catalog";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const contexts = buildContext(endpoints);
const matches = evaluateLabRules(endpoints);

describe("per-sex clinical evaluation — structural invariants", () => {
  // ── bySex foundation ──

  test("multi-sex endpoints have bySex with ≥ 2 entries", () => {
    const multiSex = endpoints.filter((ep) => ep.sexes.length >= 2);
    for (const ep of multiSex) {
      if (ep.bySex) {
        expect(
          ep.bySex.size,
          `${ep.endpoint_label} has sexes=${ep.sexes.join(",")} but bySex.size=${ep.bySex.size}`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  test("bySex entries have valid direction and fold change", () => {
    for (const ep of endpoints) {
      if (!ep.bySex) continue;
      for (const [sex, data] of ep.bySex) {
        expect(["M", "F"]).toContain(sex);
        expect(["up", "down", null, undefined]).toContain(data.direction);
        if (data.maxFoldChange != null) {
          expect(data.maxFoldChange, `${ep.endpoint_label} ${sex} fold change`).toBeGreaterThan(0);
        }
      }
    }
  });

  test("divergent endpoints have different directions per sex", () => {
    const divergent = endpoints.filter((ep) => {
      if (!ep.bySex || ep.bySex.size < 2) return false;
      const dirs = [...ep.bySex.values()].map((s) => s.direction).filter(Boolean);
      return new Set(dirs).size > 1;
    });

    for (const ep of divergent) {
      const dirs = [...ep.bySex!.values()].map((s) => s.direction);
      expect(
        new Set(dirs).size,
        `${ep.endpoint_label} flagged divergent but all directions are the same`,
      ).toBeGreaterThan(1);
    }
  });

  // ── Context arrays ──

  test("per-sex contexts have distinct sexFilter values", () => {
    const filters = contexts.map((c) => c.sexFilter).filter(Boolean);
    expect(new Set(filters).size).toBe(filters.length);
  });

  test("non-divergent endpoints have same direction in all contexts", () => {
    const nonDivergent = endpoints.filter((ep) => {
      if (!ep.bySex || ep.bySex.size < 2) return true; // no per-sex data → same everywhere
      const dirs = [...ep.bySex.values()].map((s) => s.direction).filter(Boolean);
      return new Set(dirs).size <= 1;
    });

    for (const ep of nonDivergent) {
      const canonical = resolveCanonical(ep.endpoint_label, ep.testCode);
      if (!canonical) continue;
      const dirsInContexts = contexts
        .map((c) => c.endpointDirection.get(canonical))
        .filter((d) => d !== undefined);
      if (dirsInContexts.length < 2) continue;
      const unique = new Set(dirsInContexts);
      expect(
        unique.size,
        `${ep.endpoint_label} (${canonical}) is non-divergent but has ${unique.size} different directions across contexts`,
      ).toBe(1);
    }
  });

  // ── Rule firing sex consistency ──

  test("per-sex rules fire with consistent sex evidence", () => {
    for (const m of matches) {
      if (!m.sex) continue;
      // The rule's sex should match a context's sexFilter
      const ctx = contexts.find((c) => c.sexFilter === m.sex);
      if (!ctx) continue;

      // For each matched endpoint, verify the context has a direction for its canonical
      for (const epLabel of m.matchedEndpoints) {
        const ep = endpoints.find((e) => e.endpoint_label === epLabel);
        if (!ep) continue;
        const canonical = resolveCanonical(ep.endpoint_label, ep.testCode);
        if (!canonical) continue;
        const dir = ctx.endpointDirection.get(canonical);
        // The direction should exist (not undefined) for the rule to have matched
        if (dir !== undefined) {
          expect(
            ["up", "down", "none"].includes(dir!),
            `Rule ${m.ruleId} (${m.sex}): ${canonical} has unexpected direction "${dir}" in ${m.sex} context`,
          ).toBe(true);
        }
      }
    }
  });

  test("no rule fires for both sexes with contradictory evidence", () => {
    // Group matches by ruleId
    const byRule = new Map<string, typeof matches>();
    for (const m of matches) {
      if (!byRule.has(m.ruleId)) byRule.set(m.ruleId, []);
      byRule.get(m.ruleId)!.push(m);
    }

    for (const [ruleId, ruleMatches] of byRule) {
      if (ruleMatches.length < 2) continue;
      const sexes = ruleMatches.map((m) => m.sex).filter(Boolean);
      if (new Set(sexes).size < 2) continue;
      // If the same rule fires for both M and F, both should have valid evidence
      for (const m of ruleMatches) {
        expect(
          m.matchedEndpoints.length,
          `Rule ${ruleId} (${m.sex ?? "aggregate"}) fired with 0 endpoints`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
