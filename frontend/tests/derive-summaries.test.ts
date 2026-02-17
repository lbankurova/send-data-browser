import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

const summaries = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const byLabel = new Map(summaries.map((s) => [s.endpoint_label, s]));

describe("deriveEndpointSummaries for PointCross", () => {
  // ── Organ system mapping ──

  test("Neutrophils is in hematologic", () => {
    expect(byLabel.get("Neutrophils")?.organ_system).toBe("hematologic");
  });

  test("Platelets is in hematologic", () => {
    expect(byLabel.get("Platelets")?.organ_system).toBe("hematologic");
  });

  test("Reticulocytes is in hematologic", () => {
    expect(byLabel.get("Reticulocytes")?.organ_system).toBe("hematologic");
  });

  test("Hemoglobin is in hematologic", () => {
    expect(byLabel.get("Hemoglobin")?.organ_system).toBe("hematologic");
  });

  test("Alanine Aminotransferase is in hepatic", () => {
    expect(byLabel.get("Alanine Aminotransferase")?.organ_system).toBe("hepatic");
  });

  test("Creatinine is in renal", () => {
    expect(byLabel.get("Creatinine")?.organ_system).toBe("renal");
  });

  // ── Direction ──

  test("Neutrophils direction is down", () => {
    expect(byLabel.get("Neutrophils")?.direction).toBe("down");
  });

  test("ALT direction is up", () => {
    expect(byLabel.get("Alanine Aminotransferase")?.direction).toBe("up");
  });

  // ── Both sexes ──

  test("Neutrophils has both sexes", () => {
    const sexes = byLabel.get("Neutrophils")?.sexes;
    expect(sexes).toContain("F");
    expect(sexes).toContain("M");
  });

  // ── Fold change ──

  test("ALT maxFoldChange is approximately 1.25-1.34", () => {
    const fc = byLabel.get("Alanine Aminotransferase")?.maxFoldChange;
    expect(fc).toBeGreaterThan(1.1);
    expect(fc).toBeLessThan(1.5);
  });

  test("ALT maxFoldChange is not Cohen's d", () => {
    const fc = byLabel.get("Alanine Aminotransferase")?.maxFoldChange;
    // Cohen's d for ALT is ~2.23 — fold change must be much lower
    expect(fc).toBeLessThan(2.0);
  });

  // ── Pattern ──

  test("Neutrophils pattern is threshold or monotonic decrease", () => {
    const pattern = byLabel.get("Neutrophils")?.pattern;
    expect(["threshold_decrease", "monotonic_decrease"]).toContain(pattern);
  });

  // ── Count sanity ──

  test("total unique endpoints is roughly 170-190", () => {
    expect(summaries.length).toBeGreaterThan(160);
    expect(summaries.length).toBeLessThan(200);
  });
});
