import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import { evaluateLabRules } from "@/lib/lab-clinical-catalog";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const matches = evaluateLabRules(endpoints);
const firedRules = new Set(matches.map((m) => m.ruleId));

describe("evaluateLabRules for PointCross", () => {
  // ── Rules that MUST NOT fire ──

  test("L01 does not fire (ALT fold < 2×)", () => {
    expect(firedRules.has("L01")).toBe(false);
  });

  test("L02 does not fire (ALT fold < 5×)", () => {
    expect(firedRules.has("L02")).toBe(false);
  });

  test("L14 does not fire (HGB fold ≈ 1.10×, threshold 2×)", () => {
    expect(firedRules.has("L14")).toBe(false);
  });

  test("L03 does not fire (Bilirubin is not elevated)", () => {
    expect(firedRules.has("L03")).toBe(false);
  });

  test("L07 does not fire (ALP elevated blocks Hy's Law)", () => {
    expect(firedRules.has("L07")).toBe(false);
  });

  // ── Rules that SHOULD fire ──

  test("L10 fires (ALP R-ratio — ALP is elevated)", () => {
    expect(firedRules.has("L10")).toBe(true);
  });

  // ── Per-sex rules that SHOULD fire ──

  test("L28 fires for NEUT increase (F sex)", () => {
    const l28 = matches.find(m => m.ruleId === "L28");
    expect(l28).toBeDefined();
    expect(l28!.sex).toBe("F");
  });

  // ── Severity sanity checks ──

  test("no S3/S4 match has fold change < 1.5× for all its parameters", () => {
    for (const match of matches) {
      if (match.severity === "S3" || match.severity === "S4") {
        const foldValues = Object.values(match.foldChanges);
        if (foldValues.length > 0) {
          const maxFold = Math.max(...foldValues);
          // A fold change < 1.5 triggering S3/S4 is suspicious
          // Multi-parameter rules can have lower individual folds
          if (maxFold < 1.5 && match.matchedEndpoints.length < 2) {
            expect.soft(maxFold).toBeGreaterThanOrEqual(1.5);
          }
        }
      }
    }
  });
});
