import { describe, test, expect } from "vitest";
import { resolveCanonical } from "@/lib/lab-clinical-catalog";
import fixture from "./fixtures/pointcross-findings.json";

describe("resolveCanonical", () => {
  // ── Positive matches ──

  test("Alanine Aminotransferase → ALT", () => {
    expect(resolveCanonical("Alanine Aminotransferase")).toBe("ALT");
  });

  test("Aspartate Aminotransferase → AST", () => {
    expect(resolveCanonical("Aspartate Aminotransferase")).toBe("AST");
  });

  test("Neutrophils → NEUT", () => {
    expect(resolveCanonical("Neutrophils")).toBe("NEUT");
  });

  test("Alkaline Phosphatase → ALP", () => {
    expect(resolveCanonical("Alkaline Phosphatase")).toBe("ALP");
  });

  test("Hemoglobin → HGB", () => {
    expect(resolveCanonical("Hemoglobin")).toBe("HGB");
  });

  test("Reticulocytes → RETIC", () => {
    expect(resolveCanonical("Reticulocytes")).toBe("RETIC");
  });

  test("Activated Partial Thromboplastin Time → APTT", () => {
    expect(resolveCanonical("Activated Partial Thromboplastin Time")).toBe("APTT");
  });

  // ── Negative matches ──

  test("PANCREAS — INFLAMMATION must not resolve to NEUT", () => {
    expect(resolveCanonical("PANCREAS \u2014 INFLAMMATION")).not.toBe("NEUT");
  });

  test("KIDNEY — CAST must not resolve to AST", () => {
    expect(resolveCanonical("KIDNEY \u2014 CAST")).not.toBe("AST");
  });

  test("Activated Partial Thromboplastin Time must not resolve to AST", () => {
    expect(resolveCanonical("Activated Partial Thromboplastin Time")).not.toBe("AST");
  });

  // ── Exhaustive: known expected mappings ──

  test("every expected canonical resolves correctly from PointCross labels", () => {
    const rows = fixture as { endpoint_label: string }[];
    const labels = [...new Set(rows.map((r) => r.endpoint_label))];

    const expected: Record<string, string | null> = {
      "Alanine Aminotransferase": "ALT",
      "Aspartate Aminotransferase": "AST",
      "Alkaline Phosphatase": "ALP",
      "Neutrophils": "NEUT",
      "Hemoglobin": "HGB",
      "Hematocrit": "HCT",
      "Erythrocytes": "RBC",
      "Reticulocytes": "RETIC",
      "Platelets": "PLAT",
      "Bilirubin": "TBILI",
      "Creatinine": "CREAT",
      "Glucose": "GLUC",
      "Cholesterol": "CHOL",
      "Potassium": "K",
      "Albumin": "ALB",
      "Globulin": "GLOBUL",
    };

    for (const [label, expectedCanonical] of Object.entries(expected)) {
      if (labels.includes(label)) {
        expect(resolveCanonical(label)).toBe(expectedCanonical);
      }
    }
  });

  // ── Collision check ──

  test("no false canonical sharing in PointCross dataset", () => {
    const rows = fixture as { endpoint_label: string }[];
    const labels = [...new Set(rows.map((r) => r.endpoint_label))];

    const canonicalToLabels = new Map<string, string[]>();
    for (const label of labels) {
      const canonical = resolveCanonical(label);
      if (canonical) {
        if (!canonicalToLabels.has(canonical)) canonicalToLabels.set(canonical, []);
        canonicalToLabels.get(canonical)!.push(label);
      }
    }

    // Flag unexpected collisions — same canonical from unrelated labels
    for (const [, matchedLabels] of canonicalToLabels) {
      // More than 2 labels for same canonical is suspicious
      expect(matchedLabels.length).toBeLessThanOrEqual(2);
    }
  });
});
