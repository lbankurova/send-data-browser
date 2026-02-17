import { describe, test, expect } from "vitest";
import { resolveCanonical, evaluateLabRules } from "@/lib/lab-clinical-catalog";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const summaries = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const byLabel = new Map(summaries.map((s) => [s.endpoint_label, s]));
const matches = evaluateLabRules(summaries);
const firedRules = new Set(matches.map((m) => m.ruleId));

describe("regression guards", () => {
  // Bug C1: resolveCanonical substring false positive
  test("PANCREAS does not resolve to NEUT (Bug C1)", () => {
    expect(resolveCanonical("PANCREAS \u2014 INFLAMMATION")).not.toBe("NEUT");
  });

  // Bug C4: fold change vs Cohen's d
  test("HGB fold change < 2.0 (Bug C4 — was 2.64 from Cohen's d)", () => {
    const ep = byLabel.get("Hemoglobin");
    expect(ep?.maxFoldChange).toBeLessThan(2.0);
  });

  // Bug 9: organ mapping
  test("Neutrophils in hematologic, not general (Bug 9)", () => {
    expect(byLabel.get("Neutrophils")?.organ_system).toBe("hematologic");
  });

  // Bug 13: L14 false trigger
  test("L14 does not fire for HGB 1.10× (Bug 13)", () => {
    expect(firedRules.has("L14")).toBe(false);
  });

  // L03 Bilirubin direction
  test("L03 does not fire when Bilirubin is down (Bilirubin direction bug)", () => {
    expect(firedRules.has("L03")).toBe(false);
  });

  // Pattern classifier: Neutrophils noise tolerance
  test("Neutrophils not classified as non_monotonic (noise tolerance)", () => {
    const ep = byLabel.get("Neutrophils");
    expect(ep?.pattern).not.toBe("non_monotonic");
  });

  // ALT fold change is real fold change, not Cohen's d
  test("ALT fold change is realistic (~1.25, not ~2.23 Cohen's d)", () => {
    const ep = byLabel.get("Alanine Aminotransferase");
    expect(ep?.maxFoldChange).toBeGreaterThan(1.0);
    expect(ep?.maxFoldChange).toBeLessThan(2.0);
  });
});
