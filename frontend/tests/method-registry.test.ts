/**
 * Method Registry — tests for method registration, lookup, and filtering.
 */
import { describe, test, expect } from "vitest";
import {
  getMethod,
  getMethodsByCategory,
  getMethodsForStudyType,
  getAllMethodIds,
  registerMethod,
} from "@/lib/method-registry";
import type { RegisteredMethod } from "@/lib/method-registry";

describe("Method Registry", () => {
  test("all built-in methods registered", () => {
    const ids = getAllMethodIds();
    expect(ids.length).toBeGreaterThanOrEqual(11);
    expect(ids).toContain("hedges-g");
    expect(ids).toContain("cohens-d");
    expect(ids).toContain("glass-delta");
    expect(ids).toContain("dunnett");
    expect(ids).toContain("williams");
    expect(ids).toContain("steel");
    expect(ids).toContain("jonckheere");
    expect(ids).toContain("cochran-armitage");
    expect(ids).toContain("dunnett-fwer");
    expect(ids).toContain("bonferroni");
    expect(ids).toContain("hcd-json");
    expect(ids).toContain("hcd-sqlite");
  });

  test("getMethod returns correct method", () => {
    const hg = getMethod("hedges-g")!;
    expect(hg.name).toBe("Hedges' g");
    expect(hg.category).toBe("effect_size");
    expect(hg.symbol).toBe("g");
  });

  test("getMethodsByCategory filters correctly", () => {
    const effectSize = getMethodsByCategory("effect_size");
    expect(effectSize.length).toBe(3);
    expect(effectSize.map((m) => m.id).sort()).toEqual(["cohens-d", "glass-delta", "hedges-g"]);

    const pairwise = getMethodsByCategory("pairwise");
    expect(pairwise.length).toBe(3);

    const trend = getMethodsByCategory("trend");
    expect(trend.length).toBe(2);

    const hcd = getMethodsByCategory("hcd_source");
    expect(hcd.length).toBe(2);
  });

  test("getMethodsForStudyType: Williams not applicable to safety pharm", () => {
    const pairwiseSafetyPharm = getMethodsForStudyType("pairwise", "SAFETY_PHARM_CARDIOVASCULAR");
    expect(pairwiseSafetyPharm.map((m) => m.id)).toContain("dunnett");
    expect(pairwiseSafetyPharm.map((m) => m.id)).toContain("steel");
    expect(pairwiseSafetyPharm.map((m) => m.id)).not.toContain("williams");
  });

  test("getMethodsForStudyType: wildcard matching works", () => {
    const effectSizeRD = getMethodsForStudyType("effect_size", "REPEAT_DOSE_SUBCHRONIC");
    expect(effectSizeRD.length).toBe(3); // all 3 match REPEAT_DOSE_*
  });

  test("every method has provenance", () => {
    const ids = getAllMethodIds();
    for (const id of ids) {
      const m = getMethod(id)!;
      expect(m.provenance.source).toBeTruthy();
      expect(m.provenance.reference).toBeTruthy();
    }
  });

  test("custom method can be registered at runtime", () => {
    const custom: RegisteredMethod = {
      id: "custom-es",
      name: "Custom Effect Size",
      version: "0.1.0",
      category: "effect_size",
      description: "Customer-provided effect size metric",
      applicable_study_types: ["REPEAT_DOSE_*"],
      applicable_stat_units: ["individual"],
      inputs: [],
      outputs: [{ name: "effectSize", type: "number", description: "Custom ES", required: true }],
      provenance: { source: "Customer internal", reference: "internal" },
      label: "Custom ES",
      symbol: "ES*",
    };

    registerMethod(custom);
    expect(getMethod("custom-es")).toBeDefined();
    expect(getMethodsByCategory("effect_size").length).toBe(4);
  });
});
