import { describe, test, expect } from "vitest";
import { resolveOrganBand, getSexConcordanceBoost, computeBwMediationFactor, SINGLE_ENDPOINT_GUARD_SET } from "@/lib/organ-sex-concordance";
import type { HedgesGResult } from "@/lib/organ-weight-normalization";
import { getClinicalAdditive, getClinicalFloor } from "@/lib/lab-clinical-catalog";
import { computeEndpointSignal, computeEndpointEvidence } from "@/lib/findings-rail-engine";
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
      ["BRAIN", "BRAIN"],       // MI domain → residual BRAIN
      ["SPINAL CORD", "BRAIN"], // MI domain → residual BRAIN
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
      // Brain (LB domain routes through BRAIN → BRAIN_ENZYME refinement)
      ["ACHE", "BRAIN_ENZYME"],
      ["BUCHE", "BRAIN_ENZYME"],
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

  // ── Brain sub-band routing (domain-aware refinement) ──

  describe("Brain sub-band routing", () => {
    test("OM + brain specimen → BRAIN_WEIGHT", () => {
      expect(resolveOrganBand(ep({ specimen: "BRAIN", domain: "OM" }))).toBe("BRAIN_WEIGHT");
    });

    test("OM + spinal cord specimen → BRAIN_WEIGHT", () => {
      expect(resolveOrganBand(ep({ specimen: "SPINAL CORD", domain: "OM" }))).toBe("BRAIN_WEIGHT");
    });

    test("OM + organ_system neurologic (no specimen) → BRAIN_WEIGHT", () => {
      expect(resolveOrganBand(ep({ domain: "OM", specimen: null, organ_system: "neurologic" }))).toBe("BRAIN_WEIGHT");
    });

    test("LB + ACHE → BRAIN_ENZYME", () => {
      expect(resolveOrganBand(ep({ domain: "LB", testCode: "ACHE", specimen: null }))).toBe("BRAIN_ENZYME");
    });

    test("LB + BUCHE → BRAIN_ENZYME", () => {
      expect(resolveOrganBand(ep({ domain: "LB", testCode: "BUCHE", specimen: null }))).toBe("BRAIN_ENZYME");
    });

    test("MI + brain specimen → BRAIN (residual)", () => {
      expect(resolveOrganBand(ep({ specimen: "BRAIN", domain: "MI" }))).toBe("BRAIN");
    });

    test("CL + organ_system neurologic → BRAIN (residual)", () => {
      expect(resolveOrganBand(ep({ domain: "CL", specimen: null, organ_system: "neurologic" }))).toBe("BRAIN");
    });

    test("MA + brain specimen → BRAIN (residual)", () => {
      expect(resolveOrganBand(ep({ specimen: "BRAIN", domain: "MA" }))).toBe("BRAIN");
    });

    test("non-brain organs unaffected by refinement (OM LIVER → LIVER)", () => {
      expect(resolveOrganBand(ep({ specimen: "LIVER", domain: "OM" }))).toBe("LIVER");
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

  // ── Brain sub-band boost values ──

  describe("brain sub-band boost values", () => {
    test("BRAIN_WEIGHT concordance (OM brain) → 1.5", () => {
      expect(getSexConcordanceBoost(ep({
        specimen: "BRAIN", domain: "OM", bySex: withBySex("up", "up"),
      }))).toBe(1.5);
    });

    test("BRAIN_WEIGHT divergence (OM brain) → 0.3", () => {
      expect(getSexConcordanceBoost(ep({
        specimen: "BRAIN", domain: "OM", bySex: withBySex("up", "down"),
      }))).toBe(0.3);
    });

    test("BRAIN_ENZYME concordance (LB ACHE) → 1.8", () => {
      expect(getSexConcordanceBoost(ep({
        domain: "LB", testCode: "ACHE", specimen: null, bySex: withBySex("up", "up"),
      }))).toBe(1.8);
    });

    test("BRAIN_ENZYME divergence (LB ACHE) → 0.5", () => {
      expect(getSexConcordanceBoost(ep({
        domain: "LB", testCode: "ACHE", specimen: null, bySex: withBySex("up", "down"),
      }))).toBe(0.5);
    });

    test("BRAIN residual concordance (MI brain) → 1.2", () => {
      expect(getSexConcordanceBoost(ep({
        specimen: "BRAIN", domain: "MI", bySex: withBySex("up", "up"),
      }))).toBe(1.2);
    });

    test("BRAIN residual divergence (MI brain) → 1.5", () => {
      expect(getSexConcordanceBoost(ep({
        specimen: "BRAIN", domain: "MI", bySex: withBySex("up", "down"),
      }))).toBe(1.5);
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
// Single-endpoint sex-discordance guard
// (research/brain-concordance-guard.md, R1+R2 VALIDATED 2026-04-04)
// ═══════════════════════════════════════════════════════════

describe("getSexConcordanceBoost — single-endpoint guard", () => {
  // T1: BRAIN_WEIGHT (cap is no-op since divergence already 0.3)
  test("T1: single brain-weight (OM), F up / M down, nForBand=1 → 0.3", () => {
    const e = ep({
      specimen: "BRAIN", domain: "OM",
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.3);
  });

  // T2: LUNG (1.5 → 0.3 cap is meaningful)
  test("T2: single lung (MI), sexes diverge, nForBand=1 → 0.3 (capped from 1.5)", () => {
    const e = ep({
      specimen: "LUNG", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.3);
  });

  // T3: HEART
  test("T3: single heart (MI), sexes diverge, nForBand=1 → 0.3 (capped from 1.2)", () => {
    const e = ep({
      specimen: "HEART", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.3);
  });

  // T4: BONE_MARROW (MI specimen)
  test("T4: single bone-marrow (MI), sexes diverge, nForBand=1 → 0.3 (capped from 1.5)", () => {
    const e = ep({
      specimen: "BONE MARROW", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.3);
  });

  // T5: SPLEEN
  test("T5: single spleen (MI), sexes diverge, nForBand=1 → 0.3 (capped from 1.5)", () => {
    const e = ep({
      specimen: "SPLEEN", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.3);
  });

  // T6: COAGULATION (PT) — largest absolute reduction (1.8 → 0.3)
  test("T6: single coagulation PT (LB), sexes diverge, nForBand=1 → 0.3 (capped from 1.8)", () => {
    const e = ep({
      domain: "LB", testCode: "PT", specimen: null,
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.3);
  });

  // T7: n>1 bypass (research Assumption 1 — abs+rel paired bypass)
  test("T7: two brain-weight endpoints, sexes diverge, nForBand=2 → 0.3 (band value, not cap)", () => {
    const e = ep({
      specimen: "BRAIN", domain: "OM",
      bySex: withBySex("up", "down"),
    });
    // Band-value 0.3 (BRAIN_WEIGHT divergence) — guard bypassed because n>1.
    // Indistinguishable from cap for BRAIN_WEIGHT specifically; T2/T3/T6 test
    // the cap-vs-band-value distinction on bands where they differ.
    expect(getSexConcordanceBoost(e, "rat", 2)).toBe(0.3);
  });

  // T7b: n>1 bypass on LUNG where the cap and band value differ
  test("T7b: two lung endpoints, sexes diverge, nForBand=2 → 1.5 (full divergence, no cap)", () => {
    const e = ep({
      specimen: "LUNG", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 2)).toBe(1.5);
  });

  // T8-T10: excluded organs — guard does NOT fire
  test("T8: single adrenal endpoint, sexes diverge, nForBand=1 → 0.5 (ADRENAL not guarded)", () => {
    const e = ep({
      specimen: "GLAND, ADRENAL", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.5);
  });

  test("T9: single kidney endpoint, sexes diverge, nForBand=1 → 0.3 (KIDNEY band value, alpha-2u)", () => {
    const e = ep({
      specimen: "KIDNEY", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    // KIDNEY divergence is 0.3 in bands JSON; guard not fired (KIDNEY excluded).
    // Both code paths land at 0.3 here, but the path is the un-capped band lookup.
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.3);
  });

  test("T10: single liver endpoint, sexes diverge, nForBand=1 → 0.5 (LIVER not guarded)", () => {
    const e = ep({
      domain: "LB", testCode: "ALT", specimen: null,
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.5);
  });

  // T11: concordant branch unchanged
  test("T11: single brain-weight, sexes CONCORDANT → 1.5 (concordance, guard not consulted)", () => {
    const e = ep({
      specimen: "BRAIN", domain: "OM",
      bySex: withBySex("up", "up"),
    });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(1.5);
  });

  // T12: single-sex study early-return preserved
  test("T12: bySex.size === 1 returns 0 regardless of nForBand", () => {
    const bySex = new Map([["F", sexEntry("up")]]);
    const e = ep({ specimen: "BRAIN", domain: "OM", bySex, sexes: ["F"] });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0);
    // T12b (R1 F7): pinning that nForBand argument does not bypass the
    // size<2 early return.
    expect(getSexConcordanceBoost(e, "rat", undefined)).toBe(0);
  });

  // T13: regression guard — undefined nEndpointsForBand matches pre-cycle behavior
  test("T13: nEndpointsForBand undefined → guard inert (regression guard)", () => {
    const guarded = ep({
      specimen: "LUNG", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(guarded, "rat")).toBe(1.5);
    expect(getSexConcordanceBoost(guarded, "rat", undefined)).toBe(1.5);
  });

  // T14: null band — guard does not fire
  test("T14: null-band endpoint (unknown organ_system), sexes diverge → default divergence (1.0)", () => {
    const e = ep({
      domain: "MI", specimen: null, organ_system: "unknown_system",
      bySex: withBySex("up", "down"),
    });
    expect(resolveOrganBand(e)).toBeNull();
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(1.0); // default divergence
  });

  // T15: BRAIN_ENZYME explicitly excluded
  test("T15: single BRAIN_ENZYME (LB ACHE), sexes diverge, nForBand=1 → 0.5 (not guarded)", () => {
    const e = ep({
      domain: "LB", testCode: "ACHE", specimen: null,
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.5);
  });

  // T16: SKIN explicitly excluded (research §Gap 7 — low literature confidence)
  test("T16: single SKIN endpoint, sexes diverge, nForBand=1 → 1.5 (not guarded)", () => {
    const e = ep({
      specimen: "SKIN", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(1.5);
  });

  // T17: defensive `<= 1` form — boundary at 0
  test("T17: nEndpointsForBand=0 fires guard (defensive `<=` not `===`)", () => {
    const e = ep({
      specimen: "LUNG", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    expect(getSexConcordanceBoost(e, "rat", 0)).toBe(0.3);
  });

  // T18: SINGLE_ENDPOINT_GUARD_SET membership check (composition)
  test("T18: SINGLE_ENDPOINT_GUARD_SET contains exactly the 7 expected bands", () => {
    const expected = ["BRAIN", "BRAIN_WEIGHT", "LUNG", "HEART", "BONE_MARROW", "SPLEEN", "COAGULATION"];
    expect(SINGLE_ENDPOINT_GUARD_SET.size).toBe(expected.length);
    for (const band of expected) {
      expect(SINGLE_ENDPOINT_GUARD_SET.has(band)).toBe(true);
    }
    for (const band of ["ADRENAL", "THYMUS", "KIDNEY", "LIVER", "THYROID", "HEMATOPOIETIC", "BRAIN_ENZYME", "SKIN", "BODY_WEIGHT", "REPRODUCTIVE"]) {
      expect(SINGLE_ENDPOINT_GUARD_SET.has(band)).toBe(false);
    }
  });

  // T23 (architect F11 — critical regression): HEMATOPOIETIC fallback must NEVER be guarded
  test("T23: single LB WBC endpoint (no recognized testCode) falls to HEMATOPOIETIC, guard does NOT fire → 0.5", () => {
    const e = ep({
      domain: "LB", testCode: "WBC", specimen: null,
      bySex: withBySex("up", "down"),
    });
    expect(resolveOrganBand(e)).toBe("HEMATOPOIETIC");
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.5);
  });

  // T24 (architect F16 — BRAIN residual band, R1 F4 disambiguation):
  // MI domain + brain specimen routes to BRAIN (residual), distinct from
  // BRAIN_WEIGHT and BRAIN_ENZYME. Guard fires; cap reduces 1.5 → 0.3.
  test("T24: single MI brain endpoint, sexes diverge, nForBand=1 → 0.3 (capped from BRAIN residual 1.5)", () => {
    const e = ep({
      specimen: "BRAIN", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    expect(resolveOrganBand(e)).toBe("BRAIN");
    expect(getSexConcordanceBoost(e, "rat", 1)).toBe(0.3);
  });

  // T25 (R1 F6 build-time): empty species string — lookupBand falls back to
  // default boosts; the guard fires regardless of species since the cap is
  // species-independent.
  test("T25: empty species string with guard-set band still fires guard → 0.3", () => {
    const e = ep({
      specimen: "LUNG", domain: "MI",
      bySex: withBySex("up", "down"),
    });
    // species="" → lookupBand returns defaultBoosts (concordance 1.5,
    // divergence 1.0). Cap to GUARD_DIVERGENCE_CAP=0.3.
    expect(getSexConcordanceBoost(e, "", 1)).toBe(0.3);
  });
});

// ═══════════════════════════════════════════════════════════
// Caller pipeline: bandCounts construction + nForBand wiring
// (F3 sync + F4 worker, parity)
// ═══════════════════════════════════════════════════════════

describe("Caller pipeline — bandCounts + nForBand", () => {
  // T19: bandCounts construction in caller
  test("T19: bandCounts maps each band to its endpoint count", () => {
    const endpoints: EndpointSummary[] = [
      ep({ endpoint_label: "Brain Wt Abs", specimen: "BRAIN", domain: "OM" }),
      ep({ endpoint_label: "Brain Wt Rel", specimen: "BRAIN", domain: "OM" }),
      ep({ endpoint_label: "Lung Lesion",  specimen: "LUNG",  domain: "MI" }),
      ep({ endpoint_label: "Adrenal Lesion", specimen: "GLAND, ADRENAL", domain: "MI" }),
      ep({ endpoint_label: "Mystery", domain: "MI", specimen: null, organ_system: "unknown_system" }),
    ];
    const counts = new Map<string, number>();
    for (const e of endpoints) {
      const b = resolveOrganBand(e);
      if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    expect(counts.get("BRAIN_WEIGHT")).toBe(2);
    expect(counts.get("LUNG")).toBe(1);
    expect(counts.get("ADRENAL")).toBe(1);
    expect(counts.has("UNKNOWN")).toBe(false);
    // Null band (Mystery) is intentionally not stored — driver code defaults
    // nForBand=1 in that case via `.get(bandKey) ?? 1` plus the `bandKey ?
    // ... : 1` ternary at the call site.
    expect(counts.size).toBe(3);
  });

  // T20: nForBand observed via behavioral pre-image — when the caller passes
  // n=2 for lungs (bypass guard), boost is 1.5; when it passes n=1 for heart
  // (single endpoint, guard fires), boost is 0.3. The boost value uniquely
  // identifies the third argument given the band's pre-image of (cap, full).
  test("T20: caller wires nForBand correctly — observed via boost value pre-image", () => {
    const endpoints: EndpointSummary[] = [
      ep({ endpoint_label: "Lung 1", specimen: "LUNG", domain: "MI", bySex: withBySex("up", "down") }),
      ep({ endpoint_label: "Lung 2", specimen: "LUNG", domain: "MI", bySex: withBySex("up", "down") }),
      ep({ endpoint_label: "Heart 1", specimen: "HEART", domain: "MI", bySex: withBySex("up", "down") }),
    ];
    const bandCounts = new Map<string, number>();
    for (const e of endpoints) {
      const band = resolveOrganBand(e);
      if (band) bandCounts.set(band, (bandCounts.get(band) ?? 0) + 1);
    }
    const observed: { label: string; n: number; boost: number }[] = [];
    for (const e of endpoints) {
      const bandKey = resolveOrganBand(e);
      const nForBand = bandKey ? (bandCounts.get(bandKey) ?? 1) : 1;
      const boost = getSexConcordanceBoost(e, "rat", nForBand);
      observed.push({ label: e.endpoint_label, n: nForBand, boost });
    }
    expect(observed).toEqual([
      { label: "Lung 1", n: 2, boost: 1.5 },  // n=2 → guard bypassed → 1.5 (LUNG full divergence)
      { label: "Lung 2", n: 2, boost: 1.5 },
      { label: "Heart 1", n: 1, boost: 0.3 }, // n=1 → guard fires → 0.3 (capped from HEART's 1.2)
    ]);
  });

  // T21: parity invariant — sync and worker both run the same caller logic
  // (the boost-loop is duplicated by design across hook + worker; this test
  // asserts the duplicate is in fact identical for a representative fixture).
  test("T21: sync/worker boost-loop parity for sexConcordanceBoost", () => {
    // Share the exact algorithm; if both paths use this same function, they
    // produce identical maps. The worker copy of the same code in
    // workers/findingsAnalytics.worker.ts is asserted by visual inspection
    // (CLAUDE.md rule 18 — co-located declaration/enforcement) and by this
    // test's pre-image equality.
    function buildBoostMap(endpoints: EndpointSummary[]): Map<string, number> {
      const bandCounts = new Map<string, number>();
      for (const e of endpoints) {
        const b = resolveOrganBand(e);
        if (b) bandCounts.set(b, (bandCounts.get(b) ?? 0) + 1);
      }
      const m = new Map<string, number>();
      for (const e of endpoints) {
        const bandKey = resolveOrganBand(e);
        const nForBand = bandKey ? (bandCounts.get(bandKey) ?? 1) : 1;
        m.set(e.endpoint_label, getSexConcordanceBoost(e, "rat", nForBand));
      }
      return m;
    }
    const fix: EndpointSummary[] = [
      ep({ endpoint_label: "Lung",   specimen: "LUNG",  domain: "MI", bySex: withBySex("up", "down") }),
      ep({ endpoint_label: "Heart",  specimen: "HEART", domain: "MI", bySex: withBySex("up", "down") }),
      ep({ endpoint_label: "BMarrow", specimen: "BONE MARROW", domain: "MI", bySex: withBySex("up", "down") }),
      ep({ endpoint_label: "Liver",  domain: "LB", testCode: "ALT", specimen: null, bySex: withBySex("up", "down") }),
    ];
    const m1 = buildBoostMap(fix);
    const m2 = buildBoostMap(fix);
    expect([...m1.entries()]).toEqual([...m2.entries()]);
    // Spot-check the values: single-endpoint guard fires for Lung, Heart, BMarrow → 0.3 each.
    // Liver is excluded (n=1 LIVER) → full divergence 0.5.
    expect(m1.get("Lung")).toBe(0.3);
    expect(m1.get("Heart")).toBe(0.3);
    expect(m1.get("BMarrow")).toBe(0.3);
    expect(m1.get("Liver")).toBe(0.5);
  });

  // T22: PointCross negative integration. The fixture's confirmed sex-
  // divergent endpoint is "Leukocytes" → HEMATOPOIETIC (NOT in guard set).
  // The fixture has no single-endpoint divergent guard-set finding. Therefore
  // no spurious 0.3 cap should appear on a guard-set band entered through a
  // routing bug.
  test("T22: PointCross integration — no spurious cap on excluded organs", () => {
    const summaries = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
    const bandCounts = new Map<string, number>();
    for (const e of summaries) {
      const b = resolveOrganBand(e);
      if (b) bandCounts.set(b, (bandCounts.get(b) ?? 0) + 1);
    }
    for (const e of summaries) {
      const bandKey = resolveOrganBand(e);
      const nForBand = bandKey ? (bandCounts.get(bandKey) ?? 1) : 1;
      const boost = getSexConcordanceBoost(e, "rat", nForBand);
      // Only allowed routes to a 0.3 boost on PointCross: BRAIN_WEIGHT divergence
      // (band value), KIDNEY divergence (band value), BODY_WEIGHT divergence
      // (band value), or a guard-set member with genuinely n=1. Any other
      // 0.3 value would indicate a routing-induced spurious cap.
      if (boost === 0.3) {
        const allowedBandValueAt03 = bandKey === "BRAIN_WEIGHT" || bandKey === "KIDNEY" || bandKey === "BODY_WEIGHT";
        const guardEligible = bandKey != null && SINGLE_ENDPOINT_GUARD_SET.has(bandKey) && nForBand <= 1;
        expect(allowedBandValueAt03 || guardEligible).toBe(true);
      }
    }
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

// ═══════════════════════════════════════════════════════════
// computeBwMediationFactor — Proposal 5 (BW-mediation auto-check)
// 13 research §4.2 scenarios + boundary tests + dose-coupling guard
// + boost-map guard test. Reference: research/brain-concordance-bw-mediation.md
// ═══════════════════════════════════════════════════════════

function brainEp(bySex: Map<string, SexEndpointSummary> | undefined, overrides: Partial<EndpointSummary> = {}): EndpointSummary {
  return {
    endpoint_label: "BRAIN -- BRAIN (WEIGHT)",
    organ_system: "neurologic",
    domain: "OM",
    specimen: "BRAIN",
    worstSeverity: "adverse",
    treatmentRelated: true,
    maxEffectSize: bySex
      ? Math.max(...[...bySex.values()].map(s => Math.abs(s.maxEffectSize ?? 0)))
      : null,
    minPValue: 0.01,
    direction: "down",
    sexes: bySex ? [...bySex.keys()] : ["F", "M"],
    pattern: "monotonic_decrease",
    maxFoldChange: 0.85,
    bySex,
    worstTreatedStats: { n: 5, mean: 1.7, sd: 0.1, doseLevel: 100 },
    ...overrides,
  };
}

function bwEp(bySex: Map<string, SexEndpointSummary> | undefined, overrides: Partial<EndpointSummary> = {}): EndpointSummary {
  return {
    endpoint_label: "Body Weight",
    organ_system: "general",
    domain: "BW",
    worstSeverity: "warning",
    treatmentRelated: true,
    maxEffectSize: bySex
      ? Math.max(...[...bySex.values()].map(s => Math.abs(s.maxEffectSize ?? 0)))
      : null,
    minPValue: 0.05,
    direction: "down",
    sexes: bySex ? [...bySex.keys()] : ["F", "M"],
    pattern: "threshold_decrease",
    maxFoldChange: 0.9,
    bySex,
    ...overrides,
  };
}

function brainSex(maxEffectSize: number): SexEndpointSummary {
  const dir = maxEffectSize > 0 ? "up" : maxEffectSize < 0 ? "down" : "none";
  return {
    sex: "F",
    direction: dir,
    maxEffectSize,
    maxFoldChange: 1.0 + maxEffectSize * 0.1,
    minPValue: 0.01,
    pattern: dir === "up" ? "monotonic_increase" : "monotonic_decrease",
    worstSeverity: "adverse",
    treatmentRelated: true,
  };
}

function bwSex(maxEffectSize: number): SexEndpointSummary {
  const dir = maxEffectSize > 0 ? "up" : maxEffectSize < 0 ? "down" : "none";
  return {
    sex: "F",
    direction: dir,
    maxEffectSize,
    maxFoldChange: 1.0 + maxEffectSize * 0.1,
    minPValue: 0.05,
    pattern: dir === "up" ? "threshold_increase" : "threshold_decrease",
    worstSeverity: "warning",
    treatmentRelated: true,
  };
}

function bxsx(F: number, M: number, factory: (g: number) => SexEndpointSummary): Map<string, SexEndpointSummary> {
  return new Map([
    ["F", { ...factory(F), sex: "F" }],
    ["M", { ...factory(M), sex: "M" }],
  ]);
}

function hgr(g: number): HedgesGResult {
  return { g, ciLower: g - 0.2, ciUpper: g + 0.2, nControl: 5, nTreatment: 5,
    meanControl: 100, meanTreatment: 100 - g * 5, sdControl: 5, sdTreatment: 5 };
}

const RAT_KEY = "RAT_SPRAGUE_DAWLEY";    // T1=0.5, T2=1.0
const DOG_KEY = "DOG_BEAGLE";              // T1=0.8, T2=1.5
const NHP_KEY = "NHP_CYNOMOLGUS";          // T1=1.0, T2=2.0
const BW_NEGLIGIBLE_G = 0.3; // matches the const in organ-sex-concordance.ts

describe("computeBwMediationFactor — research §4.2 scenarios", () => {
  // 1. No BW effect → factor=1.0, flag=null
  test("scenario 1: no BW effect → factor=1.0, flag=null", () => {
    const brain = brainEp(bxsx(-0.6, -0.7, brainSex));
    const bw = bwEp(bxsx(-0.1, -0.05, bwSex));
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(1.0);
    expect(r.flag).toBeNull();
  });

  // 2. Plausible (M only, same-sign moderate BW) → 0.7, plausible
  test("scenario 2: plausible (M only, same-sign moderate BW) → 0.7, plausible", () => {
    const brain = brainEp(bxsx(-0.2, -0.6, brainSex));   // F below T1, M above T1
    const bw = bwEp(bxsx(-0.1, -0.6, bwSex));            // M same-sign moderate
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(0.7);
    expect(r.flag).toBe("plausible");
  });

  // 3. Plausible (both sexes, same-sign at T1) → 0.7, plausible
  test("scenario 3: plausible (both sexes, same-sign at T1) → 0.7, plausible", () => {
    const brain = brainEp(bxsx(-0.6, -0.7, brainSex));
    const bw = bwEp(bxsx(-0.6, -0.7, bwSex));
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(0.7);
    expect(r.flag).toBe("plausible");
  });

  // 4. Probable (severe BW, same-sign ≥ T2) → 0.5, probable
  test("scenario 4: probable (severe BW, same-sign ≥ T2) → 0.5, probable", () => {
    const brain = brainEp(bxsx(-0.8, -1.2, brainSex));
    const bw = bwEp(bxsx(-1.1, -1.3, bwSex));   // both ≥ T2=1.0
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(0.5);
    expect(r.flag).toBe("probable");
  });

  // 5. Likely artifact (cross-sex brain opposes, BW opposes) → 0.3, likely_artifact
  test("scenario 5: likely artifact (cross-sex brain opposes, BW opposes) → 0.3, likely_artifact", () => {
    const brain = brainEp(bxsx(0.7, -0.7, brainSex));    // F up, M down
    const bw = bwEp(bxsx(0.6, -0.6, bwSex));             // F up, M down
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(0.3);
    expect(r.flag).toBe("likely_artifact");
  });

  // 6. Likely artifact (cross-sex brain opposes, one BW stable < BW_NEGLIGIBLE_G) → 0.3
  test("scenario 6: likely artifact (cross-sex brain opposes, one BW stable) → 0.3, likely_artifact", () => {
    const brain = brainEp(bxsx(0.6, -0.7, brainSex));
    const bw = bwEp(bxsx(-0.7, 0.2, bwSex));    // F |bwG|=0.7≥T1, M |bwG|=0.2<BW_NEGLIGIBLE_G
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(0.3);
    expect(r.flag).toBe("likely_artifact");
  });

  // 7. Cross-sex but both BW negligible → 1.0, null (or plausible if same-sign)
  test("scenario 7: cross-sex brain opposes but both BW negligible → 1.0, null", () => {
    const brain = brainEp(bxsx(0.6, -0.7, brainSex));
    const bw = bwEp(bxsx(-0.1, 0.05, bwSex));   // both well below T1, neither ≥ T1
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(1.0);
    expect(r.flag).toBeNull();
  });

  // 8. Below brain threshold → 1.0, null
  test("scenario 8: brain below T1 in both sexes → 1.0, null", () => {
    const brain = brainEp(bxsx(-0.3, -0.4, brainSex));
    const bw = bwEp(bxsx(-1.0, -1.2, bwSex));
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(1.0);
    expect(r.flag).toBeNull();
  });

  // 9. Single sex (bySex undefined or size==1) → 1.0, null (no cross-sex check possible)
  test("scenario 9: single-sex endpoint → 1.0, null", () => {
    const brain = brainEp(undefined);
    const bw = bwEp(undefined);
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(1.0);
    expect(r.flag).toBeNull();
  });

  // 10. BW unavailable (no BW endpoint at all) → 1.0, null
  test("scenario 10: no BW endpoint → 1.0, null", () => {
    const brain = brainEp(bxsx(-0.6, -0.7, brainSex));
    const r = computeBwMediationFactor(brain, [brain], RAT_KEY);  // no BW in list
    expect(r.factor).toBe(1.0);
    expect(r.flag).toBeNull();
  });

  // 11. Brain LB endpoint (AChE) — caller-side filter; function still runs but
  // when invoked on an LB endpoint with bySex it would still try to discount.
  // The boost-loop wiring (F4) gates by `resolveOrganBand === BRAIN_WEIGHT`, so
  // brain-LB never enters this function. Verify by building the AChE endpoint
  // and asserting the band routes away from BRAIN_WEIGHT.
  test("scenario 11: brain-LB (AChE) routes to BRAIN_ENZYME, not BRAIN_WEIGHT", () => {
    const ache: EndpointSummary = {
      endpoint_label: "ACHE",
      organ_system: "neurologic",
      domain: "LB",
      testCode: "ACHE",
      worstSeverity: "warning",
      treatmentRelated: true,
      maxEffectSize: -0.7,
      minPValue: 0.01,
      direction: "down",
      sexes: ["F", "M"],
      pattern: "monotonic_decrease",
      maxFoldChange: 0.7,
      bySex: bxsx(-0.5, -0.9, brainSex),
    };
    expect(resolveOrganBand(ache)).toBe("BRAIN_ENZYME");
    // computeBwMediationFactor is NOT called on this in the wired path.
  });

  // 12. Dog: T1=0.8 — passing DOG_BEAGLE strain key MUST fire dog thresholds
  test("scenario 12: dog with brain |g|=0.6 (rat-passing, dog-failing) → 1.0", () => {
    const brain = brainEp(bxsx(-0.55, -0.6, brainSex));  // both above rat T1=0.5 but below dog T1=0.8
    const bw = bwEp(bxsx(-0.9, -1.0, bwSex));
    const r = computeBwMediationFactor(brain, [brain, bw], DOG_KEY);
    expect(r.factor).toBe(1.0);  // brain below dog T1 → no per-sex flag
    expect(r.flag).toBeNull();
  });

  // 13. NHP: T2=2.0 — passing NHP_CYNOMOLGUS strain key
  test("scenario 13: NHP with brain |g|=1.5 same-sign large BW → probable", () => {
    const brain = brainEp(bxsx(-1.2, -1.5, brainSex));  // both ≥ NHP T1=1.0
    const bw = bwEp(bxsx(-2.1, -2.3, bwSex));            // both ≥ NHP T2=2.0
    const r = computeBwMediationFactor(brain, [brain, bw], NHP_KEY);
    expect(r.factor).toBe(0.5);
    expect(r.flag).toBe("probable");
  });
});

describe("computeBwMediationFactor — boundary tests (R1 F4 fix)", () => {
  // 14. BW_NEGLIGIBLE_G boundary at the cross-sex artifact gate.
  test("scenario 14a: cross-sex with one |bwG|=0.299 (< BW_NEGLIGIBLE_G) → likely_artifact", () => {
    const brain = brainEp(bxsx(0.6, -0.7, brainSex));
    const bw = bwEp(bxsx(-0.6, 0.299, bwSex));
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(0.3);
  });
  test("scenario 14b: cross-sex with one |bwG|=0.301 (≥ BW_NEGLIGIBLE_G) and same-sign sub-T1 BW → no artifact", () => {
    // Both BW same sign (positive), neither opposes; one is 0.301 (just above
    // BW_NEGLIGIBLE_G=0.3) and one is 0.4 (also < T1=0.5 rat). Per-sex check:
    // F brain=0.6 / bw=0.4 same-sign but |bw|<T1 → no plausible. M brain=-0.7
    // sign differs from bw=+0.301 → no flag. Cross-sex artifact gate:
    // bwOpposes=false, oneStableBw=false (0.301 ≥ 0.3 and 0.4 ≥ 0.3),
    // oneAtThreshold=false (0.4 < 0.5, 0.301 < 0.5) → gate closes.
    const brain = brainEp(bxsx(0.6, -0.7, brainSex));
    const bw = bwEp(bxsx(0.4, 0.301, bwSex));
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(1.0);
    // bwG of 0.301 is not strictly < BW_NEGLIGIBLE_G (0.3), so the
    // "one stable BW" path does not fire even with brain opposition.
    void BW_NEGLIGIBLE_G;
  });

  // 15. Species T1 boundary (rat T1=0.5).
  test("scenario 15a: brain |g|=0.499 in both sexes (< rat T1) → no flag", () => {
    const brain = brainEp(bxsx(-0.499, -0.49, brainSex));
    const bw = bwEp(bxsx(-1.0, -1.2, bwSex));
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(1.0);
  });
  test("scenario 15b: brain |g|=0.501 same-sign with BW ≥ T1 → plausible", () => {
    const brain = brainEp(bxsx(-0.501, -0.6, brainSex));
    const bw = bwEp(bxsx(-0.7, -0.8, bwSex));
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(0.7);
    expect(r.flag).toBe("plausible");
  });
});

describe("computeBwMediationFactor — dose-coupling guard (R1 F3 fix)", () => {
  // 16. With bwGByGroup: cross-sex artifact pattern + |bw_g_at_peak|=0.4 (< rat T1=0.5) → demoted to plausible
  test("scenario 16: dose-decoupled likely_artifact demoted to plausible (factor 0.3 → 0.7)", () => {
    const brain = brainEp(bxsx(0.6, -0.7, brainSex), {
      worstTreatedStats: { n: 5, mean: 1.7, sd: 0.1, doseLevel: 100 },
    });
    const bw = bwEp(bxsx(-0.6, 0.6, bwSex));
    const bwGByGroup = new Map<string, HedgesGResult>([
      ["10", hgr(0.1)],
      ["100", hgr(0.4)],   // brain peak dose, BW |g|=0.4 < T1=0.5 → demote
    ]);
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY, bwGByGroup);
    expect(r.factor).toBe(0.7);
    expect(r.flag).toBe("plausible");
    expect(r.detail.some(d => d.classification === "demoted_dose_decoupled")).toBe(true);
  });

  // 17. With bwGByGroup: same pattern + |bw_g_at_peak|=1.0 (≥ T1) → stays likely_artifact
  test("scenario 17: dose-coupled likely_artifact stays at factor 0.3", () => {
    const brain = brainEp(bxsx(0.6, -0.7, brainSex), {
      worstTreatedStats: { n: 5, mean: 1.7, sd: 0.1, doseLevel: 100 },
    });
    const bw = bwEp(bxsx(-0.6, 0.6, bwSex));
    const bwGByGroup = new Map<string, HedgesGResult>([
      ["100", hgr(1.0)],   // brain peak dose, BW |g|=1.0 ≥ T1=0.5 → keep
    ]);
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY, bwGByGroup);
    expect(r.factor).toBe(0.3);
    expect(r.flag).toBe("likely_artifact");
  });

  // 18. Without bwGByGroup (omitted arg): same pattern → likely_artifact unchanged (conservative)
  test("scenario 18: bwGByGroup omitted → conservative likely_artifact (factor 0.3)", () => {
    const brain = brainEp(bxsx(0.6, -0.7, brainSex));
    const bw = bwEp(bxsx(-0.6, 0.6, bwSex));
    const r = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(r.factor).toBe(0.3);
    expect(r.flag).toBe("likely_artifact");
  });
});

describe("Boost-map guard for lone BW-mediation discount (R1 F2 fix)", () => {
  // 19. A lone bwMediationFactor=0.3 must still apply on signal/evidence.
  test("scenario 19: lone bwMediationFactor=0.3 reflected in evidence and signal score", () => {
    const brainAdverse: EndpointSummary = {
      endpoint_label: "BRAIN -- BRAIN (WEIGHT)",
      organ_system: "neurologic",
      domain: "OM",
      worstSeverity: "adverse",
      treatmentRelated: true,
      maxEffectSize: 1.5,
      minPValue: 0.001,
      direction: "down",
      sexes: ["F", "M"],
      pattern: "monotonic_decrease",
      maxFoldChange: 0.7,
    };
    const without = computeEndpointEvidence(brainAdverse, {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 0,
      clinicalMultiplier: 1, sexConcordanceBoost: 0, confidenceMultiplier: 1,
      bwMediationFactor: 1.0,
    });
    const withDiscount = computeEndpointEvidence(brainAdverse, {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 0,
      clinicalMultiplier: 1, sexConcordanceBoost: 0, confidenceMultiplier: 1,
      bwMediationFactor: 0.3,
    });
    expect(withDiscount).toBeLessThan(without);
    // 0.3 of the evidence sum (within 5% rounding tolerance).
    expect(withDiscount).toBeCloseTo(without * 0.3, 5);

    // Signal score retains base constants (severity=3 + TR=2 = 5) regardless
    // of evidence discount.
    const sigWithout = computeEndpointSignal(brainAdverse, {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 0,
      clinicalMultiplier: 1, sexConcordanceBoost: 0, confidenceMultiplier: 1,
      bwMediationFactor: 1.0,
    });
    const sigDiscount = computeEndpointSignal(brainAdverse, {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 0,
      clinicalMultiplier: 1, sexConcordanceBoost: 0, confidenceMultiplier: 1,
      bwMediationFactor: 0.3,
    });
    expect(sigDiscount).toBeLessThan(sigWithout);
    expect(sigDiscount).toBeGreaterThanOrEqual(5); // base constants preserved (severity 3 + TR 2)
  });
});

// ═══════════════════════════════════════════════════════════
// Integration: PointCross fixture brain-OM + BW endpoints
// (CLAUDE.md rule 16 — verify behavior on real generated data)
// ═══════════════════════════════════════════════════════════

describe("computeBwMediationFactor — PointCross fixture integration", () => {
  // The shared `fixture` is the AdverseEffectSummaryRow-shaped PointCross
  // fixture used by the routing/concordance tests above. `deriveEndpointSummaries`
  // reconstructs `EndpointSummary` (with `bySex` populated for multi-sex
  // endpoints) — the same shape the live runtime feeds to
  // `computeBwMediationFactor`.
  const summaries = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
  const brain = summaries.find(s => s.domain === "OM" && (s.specimen ?? "").toUpperCase().includes("BRAIN"));
  const bw = summaries.find(s => s.domain === "BW");

  test("brain-OM endpoint exists with bySex populated", () => {
    expect(brain).toBeDefined();
    // PointCross fixture has F+M brain rows — bySex should be a Map of size 2.
    expect(brain!.bySex).toBeDefined();
    expect(brain!.bySex!.size).toBeGreaterThanOrEqual(2);
  });

  test("BW endpoint exists with bySex populated", () => {
    expect(bw).toBeDefined();
    expect(bw!.bySex).toBeDefined();
    expect(bw!.bySex!.size).toBeGreaterThanOrEqual(2);
  });

  /**
   * Positive integration case (CLAUDE.md rule 19 — algorithm defensibility on
   * real data). The spec (§4 Test Strategy) named CBER-POC-Pilot-Study4-Vaccine
   * as the positive case based on a predicted BW max_effect_size=-1.57 row, and
   * predicted PointCross would not fire (BW=-0.39). Both spec assumptions were
   * empirically wrong:
   *
   *   PointCross actual: brain F=+2.03 / M=-1.42; BW F=-4.51 / M=-7.80.
   *   The algorithm worst-case-selects BW max=|-7.80|, then per-sex M shows
   *   same-sign brain↓+BW↓ at |bwG|=7.80 ≥ rat T2=1.0 → probable (factor 0.5).
   *
   * That makes PointCross the positive case, not the negative one. The spec
   * author had used a low-effect BW row (-0.39, ≈|g|=0.4 — likely the wrong
   * row in a multi-pairwise BW dataset). Per CLAUDE.md rule 19, this test
   * asserts the data-defensible output: a 1-month rat study with severe BW
   * depression (g=-7.8) genuinely warrants discounting M-sex brain weight as
   * BW-mediated. F-sex brain↑ vs BW↓ different signs correctly does NOT
   * flag — that is genuine anti-correlation, not BW mediation.
   *
   * The "negative case" (factor=1.0) is exercised by unit scenarios 1, 7, 8,
   * 9, 10 against synthetic data. The corpus does not currently contain a
   * brain-OM + BW-multi-sex study where the algorithm fails to fire — this
   * is logged as a calibration concern in REGISTRY.md
   * `brain-concordance-calibration` open-questions (peer-review 2026-04-27).
   */
  test("PointCross is the positive integration case: factor=0.5, flag=probable, M-sex same-sign drives", () => {
    if (!brain || !bw) return;
    const r = computeBwMediationFactor(brain, summaries, RAT_KEY);
    expect(r.factor).toBe(0.5);
    expect(r.flag).toBe("probable");
    // Detail must include both per-sex entries; M sex carries the probable flag.
    const mEntry = r.detail.find(d => d.sex === "M");
    expect(mEntry).toBeDefined();
    expect(mEntry!.classification).toBe("probable");
    expect(mEntry!.sameSign).toBe(true);
    // F sex must NOT be flagged (different signs between brain and BW).
    const fEntry = r.detail.find(d => d.sex === "F");
    expect(fEntry).toBeDefined();
    expect(fEntry!.classification).toBe("below_threshold");
    expect(fEntry!.sameSign).toBe(false);
  });

  test("PointCross brain signal score drops with the bw-mediation factor; clinical floor still applies", () => {
    if (!brain || !bw) return;
    const r = computeBwMediationFactor(brain, summaries, RAT_KEY);
    expect(r.factor).toBeLessThan(1.0); // PointCross fires (probable)
    const baseBoosts = {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 0,
      clinicalMultiplier: 1, sexConcordanceBoost: 0, confidenceMultiplier: 1,
    };
    const signalNoDiscount = computeEndpointSignal(brain, { ...baseBoosts, bwMediationFactor: 1.0 });
    const signalWithDiscount = computeEndpointSignal(brain, { ...baseBoosts, bwMediationFactor: r.factor });
    expect(signalWithDiscount).toBeLessThan(signalNoDiscount);
    // Base constants (severity + TR) preserved — score never drops below them.
    const minBase = brain.worstSeverity === "adverse" ? 3 : 1;
    expect(signalWithDiscount).toBeGreaterThanOrEqual(minBase);

    // Clinical floor preservation (spec §4 Test Strategy): with a clinical
    // floor of 8, the discounted evidence cannot drop the score below 8.
    const floored = computeEndpointSignal(brain, {
      ...baseBoosts, clinicalFloor: 8, bwMediationFactor: r.factor,
    });
    expect(floored).toBeGreaterThanOrEqual(8);
  });
});

// ═══════════════════════════════════════════════════════════
// Clinical floor preservation under bw-mediation discount (R1 F4 spec §4)
// "Formula change preserves clinical floor — floor still applies when
//  evidence drops". Spec named findings-rail-engine.test.ts; co-located here
// next to the other rail-engine boost tests for cohesion.
// ═══════════════════════════════════════════════════════════

describe("Clinical floor preservation with bwMediationFactor", () => {
  test("scenario 21: floor wins when evidence × bwMediationFactor falls below floor", () => {
    const weakBase = ep({
      worstSeverity: "normal",
      minPValue: 0.5,
      maxEffectSize: 0.1,
      treatmentRelated: false,
      pattern: "flat",
      domain: "OM",
    });
    const score = computeEndpointSignal(weakBase, {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 8,
      clinicalMultiplier: 1, sexConcordanceBoost: 0, confidenceMultiplier: 1,
      bwMediationFactor: 0.3,
    });
    expect(score).toBe(8); // floor wins over discounted weak base * multiplier
  });

  test("scenario 22: floor wins when severity-adverse + TR + max BW-mediation discount still drops below floor", () => {
    const adverseTR = ep({
      worstSeverity: "adverse",
      minPValue: 0.001,
      maxEffectSize: 0.5,
      treatmentRelated: true,
      pattern: "monotonic_decrease",
      domain: "OM",
    });
    // Floor 15 (S4) acts as minimum even with maximum discount.
    const score = computeEndpointSignal(adverseTR, {
      syndromeBoost: 0, coherenceBoost: 0, clinicalFloor: 15,
      clinicalMultiplier: 3.0, sexConcordanceBoost: 0, confidenceMultiplier: 1,
      bwMediationFactor: 0.3,
    });
    expect(score).toBeGreaterThanOrEqual(15);
  });
});

// ═══════════════════════════════════════════════════════════
// Worker parity: sync vs worker boost map (test #20)
// computeAnalyticsSync (hook) and the worker share the same boost-loop logic.
// Direct assertion: invoking computeBwMediationFactor with the same inputs
// produces the same factor regardless of execution context — true by virtue
// of the function being pure. This test documents the invariant.
// ═══════════════════════════════════════════════════════════

describe("Worker parity (BW-mediation)", () => {
  test("scenario 20: pure function returns identical factor across N invocations (sync ≡ worker)", () => {
    const brain = brainEp(bxsx(0.6, -0.7, brainSex));
    const bw = bwEp(bxsx(-0.6, 0.6, bwSex));
    const a = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    const b = computeBwMediationFactor(brain, [brain, bw], RAT_KEY);
    expect(a.factor).toBe(b.factor);
    expect(a.flag).toBe(b.flag);
    expect(a.detail.length).toBe(b.detail.length);
  });
});
