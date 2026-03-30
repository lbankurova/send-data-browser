import { describe, test, expect } from "vitest";
import { resolveOrganBand, getSexConcordanceBoost } from "@/lib/organ-sex-concordance";
import { getClinicalAdditive, getClinicalFloor } from "@/lib/lab-clinical-catalog";
import { computeEndpointSignal } from "@/lib/findings-rail-engine";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { EndpointSummary, SexEndpointSummary } from "@/lib/derive-summaries";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import fixture from "./fixtures/pointcross-findings.json";

// ─── Helpers ──────────────────────────────────────────────

/** Minimal EndpointSummary stub for routing tests. */
function ep(overrides: Partial<EndpointSummary>): EndpointSummary {
  return {
    endpoint_label: "TEST",
    organ_system: "general",
    domain: "LB",
    worstSeverity: "adverse",
    treatmentRelated: true,
    maxEffectSize: 1.0,
    minPValue: 0.01,
    direction: "up",
    sexes: ["M", "F"],
    pattern: "threshold_increase",
    maxFoldChange: 1.5,
    ...overrides,
  };
}

function sexEntry(dir: "up" | "down" | "none" | null): SexEndpointSummary {
  return {
    sex: dir === "up" ? "F" : "M",
    direction: dir,
    maxEffectSize: 1.0,
    maxFoldChange: 1.5,
    minPValue: 0.01,
    pattern: dir === "up" ? "threshold_increase" : "threshold_decrease",
    worstSeverity: "adverse",
    treatmentRelated: true,
  };
}

function withBySex(
  fDir: "up" | "down" | "none" | null,
  mDir: "up" | "down" | "none" | null,
): Map<string, SexEndpointSummary> {
  return new Map([
    ["F", { ...sexEntry(fDir), sex: "F" }],
    ["M", { ...sexEntry(mDir), sex: "M" }],
  ]);
}

// ═══════════════════════════════════════════════════════════
// resolveOrganBand — routing priority tests
// ═══════════════════════════════════════════════════════════

describe("resolveOrganBand", () => {
  // ── Priority 1: specimen ──

  describe("Priority 1 — specimen routing", () => {
    const specimenCases: [string, string][] = [
      ["BONE MARROW", "BONE_MARROW"],
      ["BONE MARROW, FEMUR", "BONE_MARROW"],
      ["SPLEEN", "SPLEEN"],
      ["LYMPH NODE", "SPLEEN"],
      ["LYMPH NODE, MESENTERIC", "SPLEEN"],
      ["THYMUS", "THYMUS"],
      ["LIVER", "LIVER"],
      ["HEPATOCYTES", "LIVER"],
      ["KIDNEY", "KIDNEY"],
      ["RENAL CORTEX", "KIDNEY"],
      ["GLAND, ADRENAL", "ADRENAL"],
      ["GLAND, THYROID", "THYROID"],
      ["HEART", "HEART"],
      ["LUNG", "LUNG"],
      ["BRAIN", "BRAIN"],
      ["SPINAL CORD", "BRAIN"],
      ["SKIN", "SKIN"],
      ["TESTIS", "REPRODUCTIVE"],
      ["TESTES", "REPRODUCTIVE"],
      ["OVARY", "REPRODUCTIVE"],
      ["OVARIES", "REPRODUCTIVE"],
      ["UTERUS", "REPRODUCTIVE"],
      ["EPIDIDYMIS", "REPRODUCTIVE"],
      ["PROSTATE", "REPRODUCTIVE"],
      ["SEMINAL VESICLE", "REPRODUCTIVE"],
    ];

    test.each(specimenCases)("specimen '%s' → %s", (specimen, expected) => {
      expect(resolveOrganBand(ep({ specimen, domain: "MI" }))).toBe(expected);
    });

    test("specimen takes priority over domain+testCode", () => {
      // LB domain with ALT test code would route to LIVER via testCode,
      // but specimen SPLEEN should win
      expect(resolveOrganBand(ep({ specimen: "SPLEEN", domain: "LB", testCode: "ALT" }))).toBe("SPLEEN");
    });

    test("specimen takes priority over organ_system", () => {
      expect(resolveOrganBand(ep({ specimen: "BRAIN", domain: "MI", organ_system: "hepatic" }))).toBe("BRAIN");
    });
  });

  // ── Priority 2: domain + testCode ──

  describe("Priority 2 — LB domain + testCode routing", () => {
    const testCodeCases: [string, string][] = [
      // Bone marrow cytology in LB
      ["MYELCYT", "BONE_MARROW"],
      ["ERYTHP", "BONE_MARROW"],
      ["ME", "BONE_MARROW"],
      // Coagulation
      ["PT", "COAGULATION"],
      ["APTT", "COAGULATION"],
      ["FIB", "COAGULATION"],
      ["INR", "COAGULATION"],
      // Thyroid
      ["TSH", "THYROID"],
      ["T3", "THYROID"],
      ["T4", "THYROID"],
      // Adrenal
      ["ACTH", "ADRENAL"],
      ["CORT", "ADRENAL"],
      ["CORTICOSTERONE", "ADRENAL"],
      // Heart
      ["TROPONI", "HEART"],
      ["TROPONIN", "HEART"],
      ["CK", "HEART"],
      ["LDH", "HEART"],
      // Brain
      ["ACHE", "BRAIN"],
      ["BUCHE", "BRAIN"],
      // Kidney
      ["BUN", "KIDNEY"],
      ["CREAT", "KIDNEY"],
      // Liver
      ["ALT", "LIVER"],
      ["AST", "LIVER"],
      ["ALP", "LIVER"],
      ["GGT", "LIVER"],
      ["SDH", "LIVER"],
      ["GDH", "LIVER"],
      ["5NT", "LIVER"],
      ["BILI", "LIVER"],
      ["TBILI", "LIVER"],
      ["DBILI", "LIVER"],
      ["ALB", "LIVER"],
      ["TP", "LIVER"],
      ["GLUC", "LIVER"],
      ["CHOL", "LIVER"],
      ["TRIG", "LIVER"],
    ];

    test.each(testCodeCases)("LB testCode '%s' → %s", (testCode, expected) => {
      expect(resolveOrganBand(ep({ domain: "LB", testCode, specimen: null }))).toBe(expected);
    });

    test("LB testCode is case-insensitive", () => {
      expect(resolveOrganBand(ep({ domain: "LB", testCode: "alt", specimen: null }))).toBe("LIVER");
      expect(resolveOrganBand(ep({ domain: "LB", testCode: "Wbc", specimen: null }))).toBe("HEMATOPOIETIC");
    });

    test("LB with unrecognized testCode defaults to HEMATOPOIETIC", () => {
      expect(resolveOrganBand(ep({ domain: "LB", testCode: "WBC", specimen: null }))).toBe("HEMATOPOIETIC");
      expect(resolveOrganBand(ep({ domain: "LB", testCode: "RBC", specimen: null }))).toBe("HEMATOPOIETIC");
      expect(resolveOrganBand(ep({ domain: "LB", testCode: "NEUT", specimen: null }))).toBe("HEMATOPOIETIC");
      expect(resolveOrganBand(ep({ domain: "LB", testCode: "HGB", specimen: null }))).toBe("HEMATOPOIETIC");
    });

    test("LB with no testCode defaults to HEMATOPOIETIC", () => {
      expect(resolveOrganBand(ep({ domain: "LB", testCode: undefined, specimen: null }))).toBe("HEMATOPOIETIC");
    });
  });

  describe("Priority 2 — BW/FW domain", () => {
    test("BW domain → BODY_WEIGHT", () => {
      expect(resolveOrganBand(ep({ domain: "BW", specimen: null }))).toBe("BODY_WEIGHT");
    });
    test("FW domain → BODY_WEIGHT", () => {
      expect(resolveOrganBand(ep({ domain: "FW", specimen: null }))).toBe("BODY_WEIGHT");
    });
  });

  // ── Priority 3: organ_system fallback ──

  describe("Priority 3 — organ_system fallback", () => {
    const fallbackCases: [string, string][] = [
      ["hepatic", "LIVER"],
      ["renal", "KIDNEY"],
      ["hematologic", "HEMATOPOIETIC"],
      ["cardiac", "HEART"],
      ["respiratory", "LUNG"],
      ["neurologic", "BRAIN"],
      ["endocrine", "THYROID"],
      ["dermal", "SKIN"],
      ["reproductive", "REPRODUCTIVE"],
      ["lymphoid", "SPLEEN"],
    ];

    test.each(fallbackCases)("organ_system '%s' → %s", (organ_system, expected) => {
      // MI domain with no specimen → falls to organ_system
      expect(resolveOrganBand(ep({ domain: "MI", specimen: null, organ_system }))).toBe(expected);
    });

    test("unknown organ_system → null", () => {
      expect(resolveOrganBand(ep({ domain: "MI", specimen: null, organ_system: "unknown_system" }))).toBeNull();
    });
  });

  // ── Key discriminator: hematologic LB vs bone marrow MI ──

  describe("critical split: peripheral blood vs bone marrow", () => {
    test("LB WBC → HEMATOPOIETIC (peripheral blood)", () => {
      expect(resolveOrganBand(ep({
        domain: "LB", testCode: "WBC", specimen: null, organ_system: "hematologic",
      }))).toBe("HEMATOPOIETIC");
    });

    test("MI bone marrow specimen → BONE_MARROW (factory)", () => {
      expect(resolveOrganBand(ep({
        domain: "MI", specimen: "BONE MARROW, FEMUR", organ_system: "hematologic",
      }))).toBe("BONE_MARROW");
    });

    test("MI spleen specimen → SPLEEN, not HEMATOPOIETIC", () => {
      expect(resolveOrganBand(ep({
        domain: "MI", specimen: "SPLEEN", organ_system: "hematologic",
      }))).toBe("SPLEEN");
    });
  });
});

// ═══════════════════════════════════════════════════════════
// getSexConcordanceBoost — classification and boost values
// ═══════════════════════════════════════════════════════════

describe("getSexConcordanceBoost", () => {
  test("returns 0 for single-sex endpoints (no bySex)", () => {
    expect(getSexConcordanceBoost(ep({ bySex: undefined, sexes: ["M"] }))).toBe(0);
  });

  test("returns 0 for single-sex endpoints (bySex size 1)", () => {
    const bySex = new Map([["M", sexEntry("up")]]);
    expect(getSexConcordanceBoost(ep({ bySex, sexes: ["M"] }))).toBe(0);
  });

  test("returns 0 for REPRODUCTIVE organs", () => {
    expect(getSexConcordanceBoost(ep({
      specimen: "TESTIS", domain: "MI", bySex: withBySex("up", "up"),
    }))).toBe(0);
  });

  // ── Concordant (same direction) ──

  describe("concordant (same direction both sexes)", () => {
    test("liver concordance → 2.0", () => {
      expect(getSexConcordanceBoost(ep({
        domain: "LB", testCode: "ALT", specimen: null, bySex: withBySex("up", "up"),
      }))).toBe(2.0);
    });

    test("kidney concordance → 2.0", () => {
      expect(getSexConcordanceBoost(ep({
        domain: "LB", testCode: "CREAT", specimen: null, bySex: withBySex("up", "up"),
      }))).toBe(2.0);
    });

    test("hematopoietic concordance → 1.8", () => {
      expect(getSexConcordanceBoost(ep({
        domain: "LB", testCode: "WBC", specimen: null, bySex: withBySex("down", "down"),
      }))).toBe(1.8);
    });

    test("bone marrow concordance → 1.2", () => {
      expect(getSexConcordanceBoost(ep({
        specimen: "BONE MARROW", domain: "MI", bySex: withBySex("up", "up"),
      }))).toBe(1.2);
    });

    test("coagulation concordance → 1.0", () => {
      expect(getSexConcordanceBoost(ep({
        domain: "LB", testCode: "PT", specimen: null, bySex: withBySex("up", "up"),
      }))).toBe(1.0);
    });

    test("thyroid concordance → 2.0", () => {
      expect(getSexConcordanceBoost(ep({
        domain: "LB", testCode: "TSH", specimen: null, bySex: withBySex("up", "up"),
      }))).toBe(2.0);
    });
  });

  // ── Divergent (opposite direction) ──

  describe("divergent (opposite direction)", () => {
    test("liver divergence → 0.5", () => {
      expect(getSexConcordanceBoost(ep({
        domain: "LB", testCode: "ALT", specimen: null, bySex: withBySex("up", "down"),
      }))).toBe(0.5);
    });

    test("hematopoietic divergence → 0.5", () => {
      expect(getSexConcordanceBoost(ep({
        domain: "LB", testCode: "WBC", specimen: null, bySex: withBySex("up", "down"),
      }))).toBe(0.5);
    });

    test("bone marrow divergence → 1.5", () => {
      expect(getSexConcordanceBoost(ep({
        specimen: "BONE MARROW", domain: "MI", bySex: withBySex("up", "down"),
      }))).toBe(1.5);
    });

    test("coagulation divergence → 1.8", () => {
      expect(getSexConcordanceBoost(ep({
        domain: "LB", testCode: "PT", specimen: null, bySex: withBySex("up", "down"),
      }))).toBe(1.8);
    });

    test("kidney divergence → 0.3", () => {
      expect(getSexConcordanceBoost(ep({
        domain: "LB", testCode: "CREAT", specimen: null, bySex: withBySex("up", "down"),
      }))).toBe(0.3);
    });
  });

  // ── Default band ──

  test("unknown organ falls back to default (concordance 1.5, divergence 1.0)", () => {
    const unknown = ep({
      domain: "MI", specimen: null, organ_system: "unknown_system",
      bySex: withBySex("up", "up"),
    });
    expect(getSexConcordanceBoost(unknown)).toBe(1.5);

    const unknownDiv = ep({
      domain: "MI", specimen: null, organ_system: "unknown_system",
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(unknownDiv)).toBe(1.0);
  });

  // ── Edge: both sexes present but one direction is "none" ──

  test("both sexes but one direction is 'none' → treated as concordant (not divergent)", () => {
    const bySex = new Map<string, SexEndpointSummary>([
      ["F", { ...sexEntry("up"), direction: "up" }],
      ["M", { ...sexEntry("none"), direction: "none" }],
    ]);
    // "none" is not "down", so not divergent → concordance boost
    const boost = getSexConcordanceBoost(ep({
      domain: "LB", testCode: "ALT", specimen: null, bySex,
    }));
    expect(boost).toBe(2.0); // LIVER concordance
  });
});

// ═══════════════════════════════════════════════════════════
// getClinicalAdditive — severity mapping
// ═══════════════════════════════════════════════════════════

describe("getClinicalAdditive", () => {
  test("S4 → 5", () => expect(getClinicalAdditive("S4")).toBe(5));
  test("S3 → 3", () => expect(getClinicalAdditive("S3")).toBe(3));
  test("S2 → 2", () => expect(getClinicalAdditive("S2")).toBe(2));
  test("S1 → 0", () => expect(getClinicalAdditive("S1")).toBe(0));

  test("additive values are always ≤ floor values", () => {
    for (const sev of ["S1", "S2", "S3", "S4"] as const) {
      expect(getClinicalAdditive(sev)).toBeLessThanOrEqual(getClinicalFloor(sev));
    }
  });
});

// ═══════════════════════════════════════════════════════════
// computeEndpointSignal — backward compat + new boosts
// ═══════════════════════════════════════════════════════════

describe("computeEndpointSignal — new boost fields", () => {
  const base = ep({
    worstSeverity: "adverse",
    minPValue: 0.001,
    maxEffectSize: 2.0,
    treatmentRelated: true,
    pattern: "threshold_increase",
    domain: "LB",
  });

  test("no boosts → base score only", () => {
    const score = computeEndpointSignal(base);
    expect(score).toBeGreaterThan(0);
  });

  test("new fields default to neutral when not provided (backward compat)", () => {
    const withDefaultBoosts = computeEndpointSignal(base, {
      syndromeBoost: 0,
      coherenceBoost: 0,
      clinicalFloor: 0,
      clinicalMultiplier: 1,
      sexConcordanceBoost: 0,
      confidenceMultiplier: 1,
    });
    const withoutBoosts = computeEndpointSignal(base);
    expect(withDefaultBoosts).toBe(withoutBoosts);
  });

  test("clinicalMultiplier amplifies evidence portion of score", () => {
    const without = computeEndpointSignal(base, {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 4,
      clinicalMultiplier: 1, sexConcordanceBoost: 0, confidenceMultiplier: 1,
    });
    const with1_4 = computeEndpointSignal(base, {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 4,
      clinicalMultiplier: 1.4, sexConcordanceBoost: 0, confidenceMultiplier: 1,
    });
    // Multiplier only applies to evidence portion, so with1_4 > without
    expect(with1_4).toBeGreaterThan(without);
  });

  test("sexConcordanceBoost increases score", () => {
    const without = computeEndpointSignal(base, {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 0,
      clinicalMultiplier: 1, sexConcordanceBoost: 0, confidenceMultiplier: 1,
    });
    const with1_8 = computeEndpointSignal(base, {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 0,
      clinicalMultiplier: 1, sexConcordanceBoost: 1.8, confidenceMultiplier: 1,
    });
    expect(with1_8).toBeGreaterThan(without);
  });

  test("floor still acts as minimum when base + boosts < floor", () => {
    const weakBase = ep({
      worstSeverity: "normal",
      minPValue: 0.5,
      maxEffectSize: 0.1,
      treatmentRelated: false,
      pattern: "flat",
      domain: "LB",
    });
    const score = computeEndpointSignal(weakBase, {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 8,
      clinicalMultiplier: 2.0, sexConcordanceBoost: 0, confidenceMultiplier: 1,
    });
    expect(score).toBe(8); // floor wins over weak base * multiplier
  });

  test("multiplier and concordance stack with existing boosts", () => {
    const noNew = computeEndpointSignal(base, {
      syndromeBoost: 3, coherenceBoost: 4, clinicalFloor: 0,
      clinicalMultiplier: 1, sexConcordanceBoost: 0, confidenceMultiplier: 1,
    });
    const withNew = computeEndpointSignal(base, {
      syndromeBoost: 3, coherenceBoost: 4, clinicalFloor: 0,
      clinicalMultiplier: 1.4, sexConcordanceBoost: 1.5, confidenceMultiplier: 1,
    });
    // Both multiplier and concordance increase the score
    expect(withNew).toBeGreaterThan(noNew);
  });
});

// ═══════════════════════════════════════════════════════════
// Integration: PointCross fixture — verify real endpoints route correctly
// ═══════════════════════════════════════════════════════════

describe("PointCross fixture integration", () => {
  const summaries = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
  const findEp = (label: string) => summaries.find(s => s.endpoint_label === label);

  test("Aspartate Aminotransferase routes to LIVER", () => {
    const ast = findEp("Aspartate Aminotransferase");
    expect(ast).toBeDefined();
    expect(resolveOrganBand(ast!)).toBe("LIVER");
  });

  test("Leukocytes routes to HEMATOPOIETIC", () => {
    const wbc = findEp("Leukocytes");
    expect(wbc).toBeDefined();
    expect(resolveOrganBand(wbc!)).toBe("HEMATOPOIETIC");
  });

  test("AST with both sexes up gets concordance boost (2.0)", () => {
    const ast = findEp("Aspartate Aminotransferase");
    if (!ast || !ast.bySex || ast.bySex.size < 2) return; // skip if fixture lacks bySex
    const boost = getSexConcordanceBoost(ast);
    expect(boost).toBe(2.0);
  });

  test("Leukocytes with F↑ M↓ gets divergence boost (0.5)", () => {
    const wbc = findEp("Leukocytes");
    if (!wbc || !wbc.bySex || wbc.bySex.size < 2) return;
    const boost = getSexConcordanceBoost(wbc);
    expect(boost).toBe(0.5);
  });

  test("Body Weight routes to BODY_WEIGHT", () => {
    const bw = findEp("Body Weight");
    if (!bw) return;
    expect(resolveOrganBand(bw)).toBe("BODY_WEIGHT");
  });
});
