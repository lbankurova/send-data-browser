/**
 * Lab Clinical Significance Catalog (Layer D).
 * Criteria-as-data rule engine per admiral grading patterns.
 * Evaluates endpoint summaries against 26 rules (L01-L26) to detect
 * clinically significant lab patterns.
 */

import type { EndpointSummary, OrganCoherence } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";

// ─── Types ─────────────────────────────────────────────────

interface RuleContext {
  foldChanges: Map<string, number>;       // canonical -> max fold change vs control
  presentCanonicals: Set<string>;         // canonical names resolved in this study
  endpointDirection: Map<string, string>; // canonical -> "up" | "down"
  endpointSeverity: Map<string, string>;  // canonical -> worst severity
  endpointPattern: Map<string, string>;   // canonical -> dose_response_pattern
  sexes: Map<string, string[]>;           // canonical -> sexes affected
  coherenceDomainCount: number;           // from organCoherence for hepatic
  syndromeMatched: boolean;               // from cross-domain syndromes
  sexFilter: string | null;               // "M" | "F" | null (aggregate)
}

interface LabRuleThreshold {
  /** Fold-change threshold (effect size magnitude). */
  value: number;
  /** Comparison direction: gte = "at or above", lte = "at or below". */
  comparison: "gte" | "lte";
}

interface LabRule {
  id: string;
  name: string;
  category: "liver" | "graded" | "governance";
  parameters: { canonical: string; direction: "increase" | "decrease"; role: "required" | "supporting" }[];
  severity: "S1" | "S2" | "S3" | "S4";
  speciesApplicability: "nonclinical" | "clinical" | "both";
  source: string;
  /** Declarative threshold per primary parameter — documents trigger levels for inspection/export.
   *  Maps canonical → threshold. Used by evaluateThreshold() for generic evaluation. */
  thresholds?: Record<string, LabRuleThreshold>;
  /** When true, the rule compares treated vs control (fold-change is baseline-relative).
   *  All current rules use baseline-relative fold-change proxy from |effectSize|. */
  baselineAware?: boolean;
  evaluate: (ctx: RuleContext) => boolean;
}

export interface ConfidenceModifier {
  label: string;
  value: number;
  reason: string;
}

export interface LabClinicalMatch {
  ruleId: string;
  ruleName: string;
  severity: "S1" | "S2" | "S3" | "S4";
  severityLabel: string;
  category: "liver" | "graded" | "governance";
  matchedEndpoints: string[];
  foldChanges: Record<string, number>;
  confidenceScore: number;
  confidence: "HIGH" | "MODERATE" | "LOW";
  confidenceModifiers: ConfidenceModifier[];
  source: string;
  sex: string | null;  // "M" | "F" | null (aggregate)
}

// ─── Constants ─────────────────────────────────────────────

const SEVERITY_LABELS: Record<string, string> = {
  S1: "Monitor",
  S2: "Concern",
  S3: "Adverse",
  S4: "Critical",
};

const CLINICAL_FLOOR: Record<string, number> = {
  S4: 15,
  S3: 8,
  S2: 4,
  S1: 0,
};

export function getClinicalFloor(severity: "S1" | "S2" | "S3" | "S4"): number {
  return CLINICAL_FLOOR[severity];
}

// ─── Synonym Lookup ────────────────────────────────────────

// Exact-label architecture (following finding-term-map.ts pattern).
// Each canonical maps to: [testCode aliases..., exact normalized endpoint labels...]
// No substring matching, no regex — O(1) Map lookups only.
const LAB_SYNONYMS: Record<string, string[]> = {
  ALT: ["alt", "alat", "alanine aminotransferase", "sgpt", "gpt"],
  AST: ["ast", "asat", "aspartate aminotransferase", "sgot", "got"],
  ALP: ["alp", "alkp", "alkaline phosphatase"],
  GGT: ["ggt", "gamma-glutamyl transferase", "gamma-glutamyl", "gamma gt"],
  SDH: ["sdh", "sorbitol dehydrogenase"],
  GDH: ["gldh", "gdh", "glutamate dehydrogenase"],
  "5NT": ["5'nt", "5'-nucleotidase", "5nt"],
  BUN: ["bun", "blood urea nitrogen", "urea nitrogen", "urea"],
  CREAT: ["creatinine", "crea", "creat"],
  TBILI: ["bilirubin", "tbili", "total bilirubin", "bili", "dbili"],
  HGB: ["hemoglobin", "hgb", "hb"],
  RBC: ["rbc", "red blood cell", "red blood cells", "erythrocyte", "erythrocytes"],
  HCT: ["hematocrit", "hct"],
  PLAT: ["platelet", "platelets", "platelet count", "plt", "thrombocyte", "thrombocytes"],
  WBC: ["wbc", "white blood cell", "white blood cells", "leukocyte", "leukocytes", "total leukocytes"],
  NEUT: ["neutrophil", "neutrophils", "neutrophil count", "absolute neutrophil count",
         "neutrophil absolute count", "neut", "anc"],
  LYMPH: ["lymphocyte", "lymphocytes", "lymphocyte count", "lymph", "lym"],
  MONO: ["monocyte", "monocytes", "monocyte count", "mono"],
  EOS: ["eosinophil", "eosinophils", "eosinophil count", "eos"],
  BASO: ["basophil", "basophils", "basophil count", "baso"],
  RETIC: ["reticulocyte", "reticulocytes", "reticulocyte count", "retic", "ret"],
  MCV: ["mean corpuscular volume", "mcv"],
  MCH: ["mean corpuscular hemoglobin", "mch"],
  MCHC: ["mchc"],
  K: ["potassium"],
  NA: ["sodium"],
  CA: ["calcium"],
  PHOS: ["phosphate", "phosphorus", "inorganic phosphorus"],
  GLUC: ["glucose", "blood glucose"],
  CHOL: ["cholesterol", "total cholesterol"],
  TRIG: ["triglycerides", "triglyceride", "trig"],
  ALB: ["albumin", "alb"],
  GLOBUL: ["globulin", "globul"],
  PROT: ["total protein", "protein", "prot"],
  PT: ["prothrombin time"],
  INR: ["inr", "international normalized ratio"],
  APTT: ["aptt", "activated partial thromboplastin time", "activated partial thromboplastin", "ptt"],
  FIBRINO: ["fibrinogen", "fibrino", "fib"],
  MG: ["magnesium"],
  CL: ["chloride"],
  URINE_VOL: ["urine volume", "urine output", "volume"],
  URINE_SG: ["specific gravity", "urine specific gravity", "spgrav"],
};

// Pre-built exact-match indexes (constructed once at module load, O(1) lookups).
// Follows the finding-term-map.ts pattern: no includes(), no regex.
const BY_TEST_CODE = new Map<string, string>();
const BY_LABEL = new Map<string, string>();

for (const [canonical, synonyms] of Object.entries(LAB_SYNONYMS)) {
  BY_TEST_CODE.set(canonical, canonical);
  BY_LABEL.set(canonical.toLowerCase(), canonical);
  for (const syn of synonyms) {
    BY_TEST_CODE.set(syn.toUpperCase(), canonical);
    BY_LABEL.set(syn.toLowerCase(), canonical);
  }
}

export function resolveCanonical(endpointLabel: string, testCode?: string): string | null {
  // Priority 1: test code (exact, O(1))
  if (testCode) {
    const hit = BY_TEST_CODE.get(testCode.toUpperCase());
    if (hit) return hit;
  }
  // Priority 2: normalized label (exact, O(1))
  const hit = BY_LABEL.get(endpointLabel.trim().toLowerCase());
  if (hit) return hit;
  // No fallback — if the label doesn't match, return null.
  return null;
}

// ─── Rule helpers ──────────────────────────────────────────

function hasUp(ctx: RuleContext, canonical: string): boolean {
  return ctx.presentCanonicals.has(canonical) && ctx.endpointDirection.get(canonical) === "up";
}

function hasDown(ctx: RuleContext, canonical: string): boolean {
  return ctx.presentCanonicals.has(canonical) && ctx.endpointDirection.get(canonical) === "down";
}

function foldAbove(ctx: RuleContext, canonical: string, threshold: number): boolean {
  // REM-01B: fold changes are now directional (< 1.0 for decreases).
  // For threshold comparison, use absolute deviation from 1.0 mapped back to ratio.
  // E.g., threshold 2 means ≥2× control. For FC=0.4 (decrease), |1/0.4|=2.5 → meets threshold.
  const fc = ctx.foldChanges.get(canonical) ?? 0;
  const magnitude = fc > 0 && fc < 1.0 ? 1.0 / fc : fc;
  return magnitude >= threshold;
}

function countPresent(ctx: RuleContext, canonicals: string[]): number {
  return canonicals.filter((c) => ctx.presentCanonicals.has(c)).length;
}

/** Check that two canonicals share at least one common sex. */
function shareSex(ctx: RuleContext, a: string, b: string): boolean {
  const sa = ctx.sexes.get(a);
  const sb = ctx.sexes.get(b);
  if (!sa || !sb) return true; // missing sex data → don't block
  return sa.some((s) => sb.includes(s));
}

function hasGradedIncrease(ctx: RuleContext, canonical: string, minFold: number): boolean {
  return hasUp(ctx, canonical) && foldAbove(ctx, canonical, minFold);
}

function hasGradedDecrease(ctx: RuleContext, canonical: string, minFold: number): boolean {
  return hasDown(ctx, canonical) && foldAbove(ctx, canonical, minFold);
}

/** Generic threshold evaluator: checks all required parameters against their declarative thresholds.
 *  Returns true if ANY required parameter meets its threshold (OR semantics for graded rules). */
export function evaluateThreshold(rule: LabRule, ctx: RuleContext): boolean {
  if (!rule.thresholds) return false;
  for (const param of rule.parameters) {
    if (param.role !== "required") continue;
    const threshold = rule.thresholds[param.canonical];
    if (!threshold) continue;
    const fc = ctx.foldChanges.get(param.canonical) ?? 0;
    const present = ctx.presentCanonicals.has(param.canonical);
    if (!present) continue;
    const dir = ctx.endpointDirection.get(param.canonical);
    const dirMatch = param.direction === "increase" ? dir === "up" : dir === "down";
    if (!dirMatch) continue;
    // REM-01: fold changes are directional. For threshold comparison, use magnitude.
    const magnitude = fc > 0 && fc < 1.0 ? 1.0 / fc : fc;
    if (threshold.comparison === "gte" && magnitude >= threshold.value) return true;
    if (threshold.comparison === "lte" && magnitude <= threshold.value) return true;
  }
  return false;
}

// ─── Rule Catalog ──────────────────────────────────────────

const LAB_RULES: LabRule[] = [
  // Liver rules L01-L11
  {
    id: "L01", name: "ALT elevation (moderate)", category: "liver",
    parameters: [{ canonical: "ALT", direction: "increase", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "FDA Guidance (2009)",
    thresholds: { ALT: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasUp(ctx, "ALT") && foldAbove(ctx, "ALT", 2) && !foldAbove(ctx, "ALT", 5),
  },
  {
    id: "L02", name: "ALT elevation (marked)", category: "liver",
    parameters: [{ canonical: "ALT", direction: "increase", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "FDA Guidance (2009)",
    thresholds: { ALT: { value: 5, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasUp(ctx, "ALT") && foldAbove(ctx, "ALT", 5),
  },
  {
    id: "L03", name: "ALT + Bilirubin concurrent elevation", category: "liver",
    parameters: [
      { canonical: "ALT", direction: "increase", role: "required" },
      { canonical: "TBILI", direction: "increase", role: "required" },
    ],
    severity: "S4", speciesApplicability: "both", source: "FDA Guidance (2009), Hy's Law",
    baselineAware: true,
    evaluate: (ctx) => hasUp(ctx, "ALT") && hasUp(ctx, "TBILI") && shareSex(ctx, "ALT", "TBILI"),
  },
  {
    id: "L04", name: "Bilirubin elevation (isolated)", category: "liver",
    parameters: [{ canonical: "TBILI", direction: "increase", role: "required" }],
    severity: "S1", speciesApplicability: "both", source: "Clinical practice",
    baselineAware: true,
    evaluate: (ctx) => {
      if (!hasUp(ctx, "TBILI")) return false;
      return !hasUp(ctx, "ALT") && !hasUp(ctx, "AST") && !hasUp(ctx, "ALP") && !hasUp(ctx, "GGT");
    },
  },
  {
    id: "L05", name: "Hepatocellular panel coverage (QC)", category: "liver",
    parameters: [
      { canonical: "ALT", direction: "increase", role: "supporting" },
      { canonical: "AST", direction: "increase", role: "supporting" },
      { canonical: "SDH", direction: "increase", role: "supporting" },
      { canonical: "GDH", direction: "increase", role: "supporting" },
    ],
    severity: "S1", speciesApplicability: "nonclinical", source: "Best practice",
    baselineAware: false,
    evaluate: (ctx) => countPresent(ctx, ["ALT", "AST", "SDH", "GDH"]) < 2,
  },
  {
    id: "L06", name: "Cholestatic panel coverage (QC)", category: "liver",
    parameters: [
      { canonical: "ALP", direction: "increase", role: "supporting" },
      { canonical: "GGT", direction: "increase", role: "supporting" },
      { canonical: "5NT", direction: "increase", role: "supporting" },
      { canonical: "TBILI", direction: "increase", role: "supporting" },
    ],
    severity: "S1", speciesApplicability: "nonclinical", source: "Best practice",
    baselineAware: false,
    evaluate: (ctx) => countPresent(ctx, ["ALP", "GGT", "5NT", "TBILI"]) < 2,
  },
  {
    // REM-18: Renamed from "Hy's Law pattern" — clinical concept adaptation
    id: "L07", name: "Concurrent transaminase + bilirubin elevation (adapted from clinical Hy's Law)", category: "liver",
    parameters: [
      { canonical: "ALT", direction: "increase", role: "required" },
      { canonical: "TBILI", direction: "increase", role: "required" },
      { canonical: "ALP", direction: "increase", role: "supporting" },
    ],
    severity: "S4", speciesApplicability: "both", source: "Adapted from FDA Hy's Law guidance (clinical concept)",
    baselineAware: true,
    evaluate: (ctx) => {
      const altOrAst = hasUp(ctx, "ALT") ? "ALT" : hasUp(ctx, "AST") ? "AST" : null;
      if (!altOrAst) return false;
      return hasUp(ctx, "TBILI") && !hasUp(ctx, "ALP") && shareSex(ctx, altOrAst, "TBILI");
    },
  },
  {
    // REM-18: Renamed from "Hy's Law-like animal pattern" — clinical concept adaptation
    id: "L08", name: "Concurrent transaminase + bilirubin elevation (nonclinical adaptation)", category: "liver",
    parameters: [
      { canonical: "ALT", direction: "increase", role: "required" },
      { canonical: "TBILI", direction: "increase", role: "required" },
    ],
    severity: "S3", speciesApplicability: "nonclinical", source: "Adapted from clinical Hy's Law concept",
    baselineAware: true,
    evaluate: (ctx) => {
      const altOrAst = hasUp(ctx, "ALT") ? "ALT" : hasUp(ctx, "AST") ? "AST" : null;
      if (!altOrAst) return false;
      return hasUp(ctx, "TBILI") && shareSex(ctx, altOrAst, "TBILI");
    },
  },
  {
    id: "L09", name: "Excess ALT frequency (program flag)", category: "liver",
    parameters: [{ canonical: "ALT", direction: "increase", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Program monitoring",
    baselineAware: true,
    evaluate: (ctx) =>
      hasUp(ctx, "ALT") &&
      (ctx.endpointPattern.get("ALT") === "monotonic_increase" ||
       ctx.endpointPattern.get("ALT") === "threshold"),
  },
  {
    id: "L10", name: "R-ratio classification", category: "liver",
    parameters: [
      { canonical: "ALT", direction: "increase", role: "required" },
      { canonical: "ALP", direction: "increase", role: "supporting" },
    ],
    severity: "S2", speciesApplicability: "both", source: "R-ratio hepatic phenotype",
    baselineAware: true,
    evaluate: (ctx) => hasUp(ctx, "ALT") && hasUp(ctx, "ALP") && shareSex(ctx, "ALT", "ALP"),
  },
  {
    id: "L11", name: "ALP in cholestasis (note)", category: "liver",
    parameters: [{ canonical: "ALP", direction: "increase", role: "required" }],
    severity: "S1", speciesApplicability: "both", source: "Clinical practice",
    baselineAware: true,
    evaluate: (ctx) => hasUp(ctx, "ALP") && !hasUp(ctx, "ALT") && !hasUp(ctx, "AST"),
  },

  // Graded rules L12-L24 — effect size magnitude -> grade -> severity
  {
    id: "L12", name: "BUN elevation", category: "graded",
    parameters: [{ canonical: "BUN", direction: "increase", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Renal toxicology",
    thresholds: { BUN: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedIncrease(ctx, "BUN", 2),
  },
  {
    id: "L13", name: "Creatinine elevation", category: "graded",
    parameters: [{ canonical: "CREAT", direction: "increase", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Renal toxicology",
    thresholds: { CREAT: { value: 1.5, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedIncrease(ctx, "CREAT", 1.5),
  },
  {
    id: "L14", name: "Hemoglobin decrease", category: "graded",
    parameters: [{ canonical: "HGB", direction: "decrease", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Hematology",
    thresholds: { HGB: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedDecrease(ctx, "HGB", 2),
  },
  {
    id: "L15", name: "RBC decrease", category: "graded",
    parameters: [{ canonical: "RBC", direction: "decrease", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Hematology",
    thresholds: { RBC: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedDecrease(ctx, "RBC", 2),
  },
  {
    id: "L16", name: "HCT decrease", category: "graded",
    parameters: [{ canonical: "HCT", direction: "decrease", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Hematology",
    thresholds: { HCT: { value: 1.5, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedDecrease(ctx, "HCT", 1.5),
  },
  {
    id: "L17", name: "Platelet decrease", category: "graded",
    parameters: [{ canonical: "PLAT", direction: "decrease", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Hematology",
    thresholds: { PLAT: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedDecrease(ctx, "PLAT", 2),
  },
  {
    id: "L18", name: "WBC decrease", category: "graded",
    parameters: [{ canonical: "WBC", direction: "decrease", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Hematology",
    thresholds: { WBC: { value: 1.5, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedDecrease(ctx, "WBC", 1.5),
  },
  {
    id: "L19", name: "Neutrophil decrease", category: "graded",
    parameters: [{ canonical: "NEUT", direction: "decrease", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Hematology",
    thresholds: { NEUT: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedDecrease(ctx, "NEUT", 2),
  },
  {
    id: "L20", name: "Potassium imbalance", category: "graded",
    parameters: [{ canonical: "K", direction: "increase", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Clinical chemistry",
    thresholds: { K: { value: 1.5, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) =>
      (hasUp(ctx, "K") && foldAbove(ctx, "K", 1.5)) ||
      (hasDown(ctx, "K") && foldAbove(ctx, "K", 1.5)),
  },
  {
    id: "L21", name: "Glucose imbalance", category: "graded",
    parameters: [{ canonical: "GLUC", direction: "increase", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Clinical chemistry",
    thresholds: { GLUC: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) =>
      (hasUp(ctx, "GLUC") && foldAbove(ctx, "GLUC", 2)) ||
      (hasDown(ctx, "GLUC") && foldAbove(ctx, "GLUC", 2)),
  },
  {
    id: "L22", name: "Cholesterol elevation", category: "graded",
    parameters: [{ canonical: "CHOL", direction: "increase", role: "required" }],
    severity: "S1", speciesApplicability: "both", source: "Clinical chemistry",
    thresholds: { CHOL: { value: 1.5, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedIncrease(ctx, "CHOL", 1.5),
  },
  {
    id: "L23", name: "Reticulocyte response", category: "graded",
    parameters: [{ canonical: "RETIC", direction: "increase", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Hematology",
    thresholds: { RETIC: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedIncrease(ctx, "RETIC", 2),
  },
  {
    id: "L24", name: "Coagulation prolongation", category: "graded",
    parameters: [
      { canonical: "PT", direction: "increase", role: "required" },
      { canonical: "INR", direction: "increase", role: "supporting" },
      { canonical: "APTT", direction: "increase", role: "supporting" },
    ],
    severity: "S2", speciesApplicability: "both", source: "Coagulation",
    thresholds: { PT: { value: 1.5, comparison: "gte" }, INR: { value: 1.3, comparison: "gte" }, APTT: { value: 1.5, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) =>
      hasGradedIncrease(ctx, "PT", 1.5) ||
      hasGradedIncrease(ctx, "INR", 1.3) ||
      hasGradedIncrease(ctx, "APTT", 1.5),
  },
  {
    id: "L25a", name: "Sodium imbalance", category: "graded",
    parameters: [{ canonical: "NA", direction: "increase", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Clinical chemistry",
    thresholds: { NA: { value: 1.2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) =>
      (hasUp(ctx, "NA") && foldAbove(ctx, "NA", 1.2)) ||
      (hasDown(ctx, "NA") && foldAbove(ctx, "NA", 1.2)),
  },
  {
    id: "L25b", name: "Calcium/Phosphate imbalance", category: "graded",
    parameters: [
      { canonical: "CA", direction: "increase", role: "required" },
      { canonical: "PHOS", direction: "increase", role: "supporting" },
      { canonical: "MG", direction: "increase", role: "supporting" },
    ],
    severity: "S2", speciesApplicability: "both", source: "Clinical chemistry",
    thresholds: { CA: { value: 1.5, comparison: "gte" }, PHOS: { value: 1.5, comparison: "gte" }, MG: { value: 1.5, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) =>
      (hasUp(ctx, "CA") && foldAbove(ctx, "CA", 1.5)) ||
      (hasDown(ctx, "CA") && foldAbove(ctx, "CA", 1.5)) ||
      (hasUp(ctx, "PHOS") && foldAbove(ctx, "PHOS", 1.5)) ||
      (hasDown(ctx, "PHOS") && foldAbove(ctx, "PHOS", 1.5)) ||
      (hasUp(ctx, "MG") && foldAbove(ctx, "MG", 1.5)) ||
      (hasDown(ctx, "MG") && foldAbove(ctx, "MG", 1.5)),
  },
  {
    id: "L25c", name: "Urinalysis abnormality", category: "graded",
    parameters: [
      { canonical: "URINE_VOL", direction: "increase", role: "required" },
      { canonical: "URINE_SG", direction: "decrease", role: "supporting" },
    ],
    severity: "S1", speciesApplicability: "both", source: "Urinalysis",
    thresholds: { URINE_VOL: { value: 1.5, comparison: "gte" }, URINE_SG: { value: 1.3, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) =>
      hasGradedIncrease(ctx, "URINE_VOL", 1.5) ||
      hasGradedDecrease(ctx, "URINE_SG", 1.3),
  },

  // Graded rules L28-L31 — additional hematology thresholds
  {
    id: "L28", name: "Neutrophil increase", category: "graded",
    parameters: [{ canonical: "NEUT", direction: "increase", role: "required" }],
    severity: "S1", speciesApplicability: "both", source: "Hematology",
    thresholds: { NEUT: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedIncrease(ctx, "NEUT", 2),
  },
  {
    id: "L29", name: "WBC increase", category: "graded",
    parameters: [{ canonical: "WBC", direction: "increase", role: "required" }],
    severity: "S1", speciesApplicability: "both", source: "Hematology",
    thresholds: { WBC: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedIncrease(ctx, "WBC", 2),
  },
  {
    id: "L30", name: "Platelet increase", category: "graded",
    parameters: [{ canonical: "PLAT", direction: "increase", role: "required" }],
    severity: "S1", speciesApplicability: "both", source: "Hematology",
    thresholds: { PLAT: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedIncrease(ctx, "PLAT", 2),
  },
  {
    id: "L31", name: "Reticulocyte decrease", category: "graded",
    parameters: [{ canonical: "RETIC", direction: "decrease", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Hematology",
    thresholds: { RETIC: { value: 2, comparison: "gte" } }, baselineAware: true,
    evaluate: (ctx) => hasGradedDecrease(ctx, "RETIC", 2),
  },

  // Governance rules L26-L27 (post-hoc confidence modifiers, not severity triggers)
  {
    id: "L26", name: "Multi-domain convergence bonus", category: "governance",
    parameters: [],
    severity: "S1", speciesApplicability: "both", source: "Internal",
    baselineAware: false,
    evaluate: (ctx) => ctx.coherenceDomainCount >= 3,
  },
  {
    id: "L27", name: "Syndrome pattern bonus", category: "governance",
    parameters: [],
    severity: "S1", speciesApplicability: "both", source: "Internal",
    baselineAware: false,
    evaluate: (ctx) => ctx.syndromeMatched,
  },
];

// ─── Evaluator ─────────────────────────────────────────────

/** Check if sexes show opposite directions for an endpoint. */
export function sexesDisagree(ep: EndpointSummary): boolean {
  if (!ep.bySex || ep.bySex.size < 2) return false;
  const dirs = new Set([...ep.bySex.values()].map(s => s.direction));
  return dirs.has("up") && dirs.has("down");
}

function buildSingleContext(
  endpoints: EndpointSummary[],
  organCoherence: Map<string, OrganCoherence> | undefined,
  syndromes: CrossDomainSyndrome[] | undefined,
  sexFilter: string | null,
): RuleContext {
  const foldChanges = new Map<string, number>();
  const presentCanonicals = new Set<string>();
  const endpointDirection = new Map<string, string>();
  const endpointSeverity = new Map<string, string>();
  const endpointPattern = new Map<string, string>();
  const sexes = new Map<string, string[]>();

  for (const ep of endpoints) {
    const canonical = resolveCanonical(ep.endpoint_label, ep.testCode);
    if (!canonical) continue;
    presentCanonicals.add(canonical);

    // Determine which values to use: per-sex override or aggregate
    let fc: number;
    let dir: string | null;
    let pat: string;
    let epSexes: string[];

    if (sexFilter && sexesDisagree(ep) && ep.bySex?.has(sexFilter)) {
      const sexData = ep.bySex.get(sexFilter)!;
      fc = sexData.maxFoldChange ?? 0;
      dir = sexData.direction;
      pat = sexData.pattern;
      epSexes = [sexFilter];
    } else {
      fc = ep.maxFoldChange ?? 0;
      dir = ep.direction;
      pat = ep.pattern;
      epSexes = ep.sexes;
    }

    // Atomic update: all fields follow the strongest endpoint (by fold change).
    const existing = foldChanges.get(canonical);
    if (existing == null || fc > existing) {
      foldChanges.set(canonical, fc);
      if (dir === "up" || dir === "down") {
        endpointDirection.set(canonical, dir);
      }
      endpointPattern.set(canonical, pat);
      sexes.set(canonical, epSexes);
    }

    // Severity always takes worst (independent of effect magnitude)
    const currentSev = endpointSeverity.get(canonical);
    if (!currentSev || ep.worstSeverity === "adverse" ||
        (ep.worstSeverity === "warning" && currentSev !== "adverse")) {
      endpointSeverity.set(canonical, ep.worstSeverity);
    }
  }

  // Hepatic coherence
  const hepaticCoherence = organCoherence?.get("hepatic");
  const coherenceDomainCount = hepaticCoherence?.domainCount ?? 0;

  // Any syndrome matched
  const syndromeMatched = (syndromes?.length ?? 0) > 0;

  return {
    foldChanges,
    presentCanonicals,
    endpointDirection,
    endpointSeverity,
    endpointPattern,
    sexes,
    coherenceDomainCount,
    syndromeMatched,
    sexFilter,
  };
}

export function buildContext(
  endpoints: EndpointSummary[],
  organCoherence?: Map<string, OrganCoherence>,
  syndromes?: CrossDomainSyndrome[],
): RuleContext[] {
  // Check if any endpoint has sex-divergent directions
  const hasDivergent = endpoints.some(ep => sexesDisagree(ep));

  if (!hasDivergent) {
    return [buildSingleContext(endpoints, organCoherence, syndromes, null)];
  }

  // Collect unique sexes from bySex entries of divergent endpoints
  const allSexes = new Set<string>();
  for (const ep of endpoints) {
    if (sexesDisagree(ep) && ep.bySex) {
      for (const sex of ep.bySex.keys()) allSexes.add(sex);
    }
  }

  return [...allSexes].sort().map(sex =>
    buildSingleContext(endpoints, organCoherence, syndromes, sex)
  );
}

/** Additive confidence scoring per spec (-5..+10 scale, base 0).
 *  Interpretation: >=4 HIGH, 1-3 MODERATE, <=0 LOW. */
function computeConfidence(
  rule: LabRule,
  ctx: RuleContext,
): { score: number; confidence: "HIGH" | "MODERATE" | "LOW"; modifiers: ConfidenceModifier[] } {
  const modifiers: ConfidenceModifier[] = [];
  let score = 0;

  // Dose-response present: +2
  let hasDoseResponse = false;
  for (const param of rule.parameters) {
    const pattern = ctx.endpointPattern.get(param.canonical);
    if (pattern === "monotonic_increase" || pattern === "monotonic_decrease" || pattern === "threshold") {
      if (!hasDoseResponse) {
        modifiers.push({ label: "Dose-response", value: 2, reason: `${param.canonical} shows ${pattern} dose-response` });
        score += 2;
        hasDoseResponse = true;
      }
    }
  }

  // No dose-response: -1
  if (!hasDoseResponse && rule.parameters.length > 0) {
    modifiers.push({ label: "No dose-response", value: -1, reason: "No dose-response pattern detected" });
    score -= 1;
  }

  // Same-organ corroboration: +2
  const ruleCanonicals = new Set(rule.parameters.map((p) => p.canonical));
  const otherOrgans = [...ctx.endpointSeverity.entries()]
    .filter(([c, sev]) => !ruleCanonicals.has(c) && (sev === "adverse" || sev === "warning"));
  if (otherOrgans.length > 0) {
    modifiers.push({ label: "Corroboration", value: 2, reason: "Other endpoints in same organ flagged" });
    score += 2;
  }

  // Multi-domain convergence: +2
  if (ctx.coherenceDomainCount >= 3) {
    modifiers.push({ label: "Convergence", value: 2, reason: `${ctx.coherenceDomainCount}-domain organ convergence` });
    score += 2;
  }

  // Syndrome: +2
  if (ctx.syndromeMatched) {
    modifiers.push({ label: "Syndrome", value: 2, reason: "Cross-domain syndrome detected" });
    score += 2;
  }

  // Multiple sexes: +1
  for (const param of rule.parameters) {
    const s = ctx.sexes.get(param.canonical);
    if (s && s.length >= 2) {
      modifiers.push({ label: "Both sexes", value: 1, reason: "Both sexes show same direction" });
      score += 1;
      break;
    }
  }

  // Single sex only: -1
  const allSingle = rule.parameters.every((p) => {
    const s = ctx.sexes.get(p.canonical);
    return s && s.length === 1;
  });
  if (allSingle && rule.parameters.length > 0) {
    modifiers.push({ label: "Single sex", value: -1, reason: "Only one sex affected" });
    score -= 1;
  }

  // Fold-change well above threshold: +1
  for (const param of rule.parameters) {
    const fc = ctx.foldChanges.get(param.canonical) ?? 0;
    if (fc >= 5) {
      modifiers.push({ label: "High fold", value: 1, reason: `${param.canonical} ${fc.toFixed(1)}x above control` });
      score += 1;
      break;
    }
  }

  const confidence: "HIGH" | "MODERATE" | "LOW" = score >= 4 ? "HIGH" : score >= 1 ? "MODERATE" : "LOW";
  return { score, confidence, modifiers };
}

function getMatchedEndpoints(rule: LabRule, endpoints: EndpointSummary[]): string[] {
  const matched: string[] = [];
  for (const param of rule.parameters) {
    for (const ep of endpoints) {
      const canonical = resolveCanonical(ep.endpoint_label, ep.testCode);
      if (canonical === param.canonical) {
        matched.push(ep.endpoint_label);
        break;
      }
    }
  }
  return matched;
}

function getFoldChangesForRule(rule: LabRule, ctx: RuleContext): Record<string, number> {
  const result: Record<string, number> = {};
  for (const param of rule.parameters) {
    const fc = ctx.foldChanges.get(param.canonical);
    if (fc != null) result[param.canonical] = fc;
  }
  return result;
}

// @field FIELD-43 — lab clinical significance match
export function evaluateLabRules(
  endpoints: EndpointSummary[],
  organCoherence?: Map<string, OrganCoherence>,
  syndromes?: CrossDomainSyndrome[],
): LabClinicalMatch[] {
  const contexts = buildContext(endpoints, organCoherence, syndromes);
  const matches: LabClinicalMatch[] = [];

  for (const ctx of contexts) {
    // Evaluate non-governance rules
    for (const rule of LAB_RULES) {
      if (rule.category === "governance") continue;
      if (!rule.evaluate(ctx)) continue;

      const { score, confidence, modifiers } = computeConfidence(rule, ctx);
      matches.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        severityLabel: SEVERITY_LABELS[rule.severity],
        category: rule.category,
        matchedEndpoints: getMatchedEndpoints(rule, endpoints),
        foldChanges: getFoldChangesForRule(rule, ctx),
        confidenceScore: score,
        confidence,
        confidenceModifiers: modifiers,
        source: rule.source,
        sex: ctx.sexFilter,
      });
    }
  }

  // Deduplicate: if multiple rules match same primary endpoint + sex, keep highest severity
  const byEndpoint = new Map<string, LabClinicalMatch>();
  const sevOrder: Record<string, number> = { S4: 4, S3: 3, S2: 2, S1: 1 };
  for (const match of matches) {
    const key = match.matchedEndpoints.sort().join("|") + "::" + (match.sex ?? "ALL");
    const existing = byEndpoint.get(key);
    if (!existing || sevOrder[match.severity] > sevOrder[existing.severity]) {
      byEndpoint.set(key, match);
    }
  }

  return [...byEndpoint.values()].sort(
    (a, b) => sevOrder[b.severity] - sevOrder[a.severity]
  );
}

// ─── Clinical Tier UI Utilities ─────────────────────────────

/** Tailwind classes for clinical severity badge (background + text + border). */
export function getClinicalTierBadgeClasses(_tier: string): string {
  // All clinical tier badges use neutral gray — tier is categorical identity.
  // The text label (S1/S2/S3/S4) communicates the tier.
  return "bg-gray-100 text-gray-600 border-gray-200";
}

/** Tailwind text color class for clinical severity tier. */
export function getClinicalTierTextClass(tier: string): string {
  switch (tier) {
    case "S1": return "text-blue-700";
    case "S2": return "text-yellow-700";
    case "S3": return "text-amber-700";
    case "S4": return "text-red-700";
    default:   return "text-gray-700";
  }
}

/** Tailwind border class for clinical rule citation card left border. */
export function getClinicalTierCardBorderClass(tier: string): string {
  switch (tier) {
    case "S1": return "border-l-2 border-blue-400";
    case "S2": return "border-l-2 border-yellow-400";
    case "S3": return "border-l-2 border-amber-500";
    case "S4": return "border-l-2 border-red-500";
    default:   return "border-l-2 border-gray-400";
  }
}

/** Tailwind background tint for rule citation card. */
export function getClinicalTierCardBgClass(tier: string): string {
  switch (tier) {
    case "S1": return "bg-blue-50/50";
    case "S2": return "bg-yellow-50/50";
    case "S3": return "bg-amber-50/50";
    case "S4": return "bg-red-50/50";
    default:   return "bg-gray-50/50";
  }
}

/** Short source label for display in compact spaces (verdict line, etc.). */
export function getRuleSourceShortLabel(source: string): string {
  const lower = source.toLowerCase();
  if (lower.includes("ema") || lower.includes("dili")) return "EMA DILI";
  if (lower.includes("fda") && lower.includes("hy")) return "FDA Hy's Law";
  if (lower.includes("fda")) return "FDA Guidance";
  if (lower.includes("stp") || lower.includes("estp")) return "STP/ESTP";
  if (lower.includes("renal")) return "Renal toxicology";
  if (lower.includes("hematology")) return "Hematology";
  if (lower.includes("coagulation")) return "Coagulation";
  if (lower.includes("clinical chemistry")) return "Clinical chemistry";
  if (lower.includes("urinalysis")) return "Urinalysis";
  if (lower.includes("r-ratio")) return "R-ratio";
  if (lower.includes("nonclinical")) return "Nonclinical";
  if (lower.includes("internal")) return "Internal";
  return source;
}

/** Get the severity label for a tier. */
export function getClinicalSeverityLabel(tier: string): string {
  return SEVERITY_LABELS[tier] ?? "Unknown";
}

/** Look up a clinical match for a specific endpoint label from labMatches array.
 *  Returns the highest-severity match for this endpoint. */
export function findClinicalMatchForEndpoint(
  endpointLabel: string,
  labMatches: LabClinicalMatch[],
  testCode?: string,
): LabClinicalMatch | null {
  const canonical = resolveCanonical(endpointLabel, testCode);
  if (!canonical) return null;

  const sevOrder: Record<string, number> = { S4: 4, S3: 3, S2: 2, S1: 1 };
  let best: LabClinicalMatch | null = null;

  for (const match of labMatches) {
    if (!match.matchedEndpoints.some((e) => resolveCanonical(e) === canonical)) continue;
    if (!best || (sevOrder[match.severity] ?? 0) > (sevOrder[best.severity] ?? 0)) {
      best = match;
    }
  }

  return best;
}

/** Get the rule definition for a given rule ID.
 *  Exposes threshold and other metadata for display. */
export function getRuleDefinition(ruleId: string): {
  id: string;
  name: string;
  category: string;
  severity: string;
  source: string;
  parameters: { canonical: string; direction: string; role: string }[];
  thresholds?: Record<string, LabRuleThreshold>;
} | null {
  const rule = LAB_RULES.find((r) => r.id === ruleId);
  if (!rule) return null;
  return {
    id: rule.id,
    name: rule.name,
    category: rule.category,
    severity: rule.severity,
    source: rule.source,
    parameters: rule.parameters,
    thresholds: rule.thresholds,
  };
}

/** Describe a rule's threshold for a given canonical parameter in human-readable form.
 *  REM-04: Decrease rules now show reciprocal notation (e.g., ≤0.50× control = ≥50% decrease). */
export function describeThreshold(ruleId: string, canonical: string): string | null {
  const rule = LAB_RULES.find((r) => r.id === ruleId);
  if (!rule?.thresholds?.[canonical]) return null;
  const t = rule.thresholds[canonical];
  const sevLabel = SEVERITY_LABELS[rule.severity] ?? rule.severity;
  // Check if this parameter is a decrease rule
  const param = rule.parameters.find((p) => p.canonical === canonical);
  if (param?.direction === "decrease") {
    const reciprocal = (1 / t.value).toFixed(2);
    const pctDecrease = Math.round((1 - 1 / t.value) * 100);
    return `\u2264${reciprocal}\u00d7 control (\u2265${pctDecrease}% decrease) \u2192 ${rule.severity} ${sevLabel}`;
  }
  const op = t.comparison === "gte" ? "\u2265" : "\u2264";
  return `${op}${t.value}\u00d7 control \u2192 ${rule.severity} ${sevLabel}`;
}

/** Find the next higher threshold for a parameter across all rules.
 *  Returns null if already at S4 or no higher threshold exists. */
export function findNextThreshold(currentRuleId: string, canonical: string): {
  ruleId: string;
  severity: string;
  severityLabel: string;
  threshold: string;
} | null {
  const currentRule = LAB_RULES.find((r) => r.id === currentRuleId);
  if (!currentRule) return null;

  const sevOrder: Record<string, number> = { S4: 4, S3: 3, S2: 2, S1: 1 };
  const currentSevOrder = sevOrder[currentRule.severity] ?? 0;

  let bestNext: { ruleId: string; severity: string; severityLabel: string; threshold: string; sevOrd: number } | null = null;

  for (const rule of LAB_RULES) {
    if (rule.category === "governance") continue;
    if ((sevOrder[rule.severity] ?? 0) <= currentSevOrder) continue;
    // Must involve the same canonical parameter
    if (!rule.parameters.some((p) => p.canonical === canonical)) continue;
    const t = rule.thresholds?.[canonical];
    if (!t) continue;

    const sevOrd = sevOrder[rule.severity] ?? 0;
    if (!bestNext || sevOrd < bestNext.sevOrd) {
      const op = t.comparison === "gte" ? ">" : "<";
      bestNext = {
        ruleId: rule.id,
        severity: rule.severity,
        severityLabel: SEVERITY_LABELS[rule.severity] ?? rule.severity,
        threshold: `${op}${t.value}\u00d7 control`,
        sevOrd,
      };
    }
  }

  return bestNext ? { ruleId: bestNext.ruleId, severity: bestNext.severity, severityLabel: bestNext.severityLabel, threshold: bestNext.threshold } : null;
}

/** Get all rules relevant to a canonical parameter (for "related rules" / "evaluated" display). */
export function getRelatedRules(canonical: string): {
  id: string;
  name: string;
  severity: string;
  severityLabel: string;
  category: string;
}[] {
  return LAB_RULES
    .filter((r) => r.category !== "governance" && r.parameters.some((p) => p.canonical === canonical))
    .map((r) => ({
      id: r.id,
      name: r.name,
      severity: r.severity,
      severityLabel: SEVERITY_LABELS[r.severity] ?? r.severity,
      category: r.category,
    }));
}

/** Check if a canonical parameter is a liver-related parameter. */
export function isLiverParameter(canonical: string): boolean {
  const liverParams = new Set(["ALT", "AST", "ALP", "GGT", "SDH", "GDH", "5NT", "TBILI"]);
  return liverParams.has(canonical);
}

/** Get the numeric threshold value for a rule + canonical parameter. */
export function getThresholdNumericValue(
  ruleId: string,
  canonical: string,
): { value: number; comparison: string } | null {
  const rule = LAB_RULES.find((r) => r.id === ruleId);
  if (!rule) return null;
  const t = rule.thresholds?.[canonical];
  if (!t) return null;
  return { value: t.value, comparison: t.comparison };
}

/** Explain WHY a specific rule didn't fire, checking actual conditions against study data.
 *  Returns a short human-readable reason, or null for rules without custom logic. */
export function explainRuleNotTriggered(
  ruleId: string,
  endpoints: EndpointSummary[],
  organCoherence?: Map<string, OrganCoherence>,
  syndromes?: CrossDomainSyndrome[],
): string | null {
  const contexts = buildContext(endpoints, organCoherence, syndromes);
  // Liver-specific checks use first context (liver endpoints don't diverge by sex in practice)
  const ctx = contexts[0];
  const altUp = hasUp(ctx, "ALT");
  const astUp = hasUp(ctx, "AST");
  const tbiliUp = hasUp(ctx, "TBILI");
  const alpUp = hasUp(ctx, "ALP");

  if (ruleId === "L03") {
    if (!altUp) return "ALT not elevated";
    if (!tbiliUp) return "Bilirubin not elevated";
    if (!shareSex(ctx, "ALT", "TBILI")) return "ALT and bilirubin affected in different sexes";
  } else if (ruleId === "L07") {
    if (!altUp && !astUp) return "ALT/AST not elevated";
    if (!tbiliUp) return "Bilirubin not elevated";
    if (alpUp) return "ALP elevated \u2014 cholestatic component present, not pure hepatocellular";
    const altOrAst = altUp ? "ALT" : "AST";
    if (!shareSex(ctx, altOrAst, "TBILI")) return `${altOrAst} and bilirubin affected in different sexes`;
  } else if (ruleId === "L08") {
    if (!altUp && !astUp) return "ALT/AST not elevated";
    if (!tbiliUp) return "Bilirubin not elevated";
    const altOrAst = altUp ? "ALT" : "AST";
    if (!shareSex(ctx, altOrAst, "TBILI")) return `${altOrAst} and bilirubin affected in different sexes`;
  }

  // Fallback: check if rule fires in ANY context (superseding check)
  const rule = LAB_RULES.find((r) => r.id === ruleId);
  if (rule && contexts.some(c => rule.evaluate(c))) {
    const sevOrder: Record<string, number> = { S4: 4, S3: 3, S2: 2, S1: 1 };
    const superseder = LAB_RULES.find(
      (r) => r.id !== ruleId
        && r.category !== "governance"
        && (sevOrder[r.severity] ?? 0) > (sevOrder[rule.severity] ?? 0)
        && contexts.some(c => r.evaluate(c))
        && r.parameters.some((p) => rule.parameters.some((rp) => rp.canonical === p.canonical)),
    );
    if (superseder) {
      return `Conditions met \u2014 subsumed by ${superseder.id} (${SEVERITY_LABELS[superseder.severity]}, ${superseder.severity})`;
    }
  }

  return null;
}
