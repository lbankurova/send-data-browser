import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { evaluateLabRules } from "@/lib/lab-clinical-catalog";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const matches = evaluateLabRules(endpoints);

describe("evaluateLabRules — structural invariants", () => {
  test("returns an array (possibly empty if no rules fire)", () => {
    expect(Array.isArray(matches)).toBe(true);
  });

  test("every match has a valid ruleId (starts with L)", () => {
    for (const m of matches) {
      expect(m.ruleId, `unexpected ruleId format: ${m.ruleId}`).toMatch(/^L\d+/);
    }
  });

  test("every match has at least 1 matched endpoint", () => {
    for (const m of matches) {
      expect(
        m.matchedEndpoints.length,
        `Rule ${m.ruleId} fired with 0 matched endpoints`,
      ).toBeGreaterThan(0);
    }
  });

  test("every matched endpoint exists in endpoint summaries", () => {
    const epLabels = new Set(endpoints.map((e) => e.endpoint_label));
    for (const m of matches) {
      for (const label of m.matchedEndpoints) {
        expect(
          epLabels.has(label),
          `Rule ${m.ruleId} references "${label}" not in summaries`,
        ).toBe(true);
      }
    }
  });

  test("every match has a valid severity (S1-S4)", () => {
    for (const m of matches) {
      expect(["S1", "S2", "S3", "S4"]).toContain(m.severity);
    }
  });

  test("S3/S4 rules have adequate evidence (fold > 1.5 or multi-parameter)", () => {
    for (const m of matches) {
      if (m.severity !== "S3" && m.severity !== "S4") continue;
      const foldValues = Object.values(m.foldChanges);
      const maxFold = foldValues.length > 0 ? Math.max(...foldValues) : 0;
      const isMultiParam = m.matchedEndpoints.length >= 2;
      expect(
        maxFold > 1.5 || isMultiParam,
        `Rule ${m.ruleId} (${m.severity}) has max fold ${maxFold.toFixed(2)} and ${m.matchedEndpoints.length} endpoint(s)`,
      ).toBe(true);
    }
  });

  test("per-sex rules have a sex field matching M or F", () => {
    for (const m of matches) {
      if (m.sex) {
        expect(["M", "F"]).toContain(m.sex);
      }
    }
  });

  test("fold changes in matches are positive", () => {
    for (const m of matches) {
      for (const [key, fc] of Object.entries(m.foldChanges)) {
        expect(fc, `Rule ${m.ruleId}: ${key} fold change should be > 0`).toBeGreaterThan(0);
      }
    }
  });
});
