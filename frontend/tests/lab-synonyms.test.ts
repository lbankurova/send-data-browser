import { describe, test, expect } from "vitest";
import { resolveCanonical } from "@/lib/lab-clinical-catalog";
import fixture from "./fixtures/pointcross-findings.json";

// ── Known canonical mappings (function behavior, not study-specific) ──

const KNOWN_MAPPINGS: Record<string, string> = {
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
  "Activated Partial Thromboplastin Time": "APTT",
};

describe("resolveCanonical — mapping correctness", () => {
  // Pure function tests: these verify the mapping dictionary, not study data
  for (const [label, expected] of Object.entries(KNOWN_MAPPINGS)) {
    test(`"${label}" → ${expected}`, () => {
      expect(resolveCanonical(label)).toBe(expected);
    });
  }
});

describe("resolveCanonical — false positive guards", () => {
  // Substring containment must not cause false matches
  test("PANCREAS — INFLAMMATION must not resolve to NEUT", () => {
    expect(resolveCanonical("PANCREAS \u2014 INFLAMMATION")).not.toBe("NEUT");
  });

  test("KIDNEY — CAST must not resolve to AST", () => {
    expect(resolveCanonical("KIDNEY \u2014 CAST")).not.toBe("AST");
  });

  test("Activated Partial Thromboplastin Time must not resolve to AST", () => {
    expect(resolveCanonical("Activated Partial Thromboplastin Time")).not.toBe("AST");
  });
});

describe("resolveCanonical — collision check against fixture", () => {
  const rows = fixture as { endpoint_label: string }[];
  const labels = [...new Set(rows.map((r) => r.endpoint_label))];

  test("known mappings resolve correctly for any labels present in the fixture", () => {
    for (const [label, expected] of Object.entries(KNOWN_MAPPINGS)) {
      if (labels.includes(label)) {
        expect(resolveCanonical(label)).toBe(expected);
      }
    }
  });

  test("no canonical code is shared by more than 2 endpoint labels", () => {
    const canonicalToLabels = new Map<string, string[]>();
    for (const label of labels) {
      const canonical = resolveCanonical(label);
      if (canonical) {
        if (!canonicalToLabels.has(canonical)) canonicalToLabels.set(canonical, []);
        canonicalToLabels.get(canonical)!.push(label);
      }
    }

    for (const [canonical, matchedLabels] of canonicalToLabels) {
      expect(
        matchedLabels.length,
        `Canonical "${canonical}" matched by ${matchedLabels.length} labels: ${matchedLabels.join(", ")}`,
      ).toBeLessThanOrEqual(2);
    }
  });
});
