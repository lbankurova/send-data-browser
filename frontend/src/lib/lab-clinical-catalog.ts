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
  foldChanges: Map<string, number>;       // canonical -> max |effectSize| as fold proxy
  presentCanonicals: Set<string>;         // canonical names resolved in this study
  endpointDirection: Map<string, string>; // canonical -> "up" | "down"
  endpointSeverity: Map<string, string>;  // canonical -> worst severity
  endpointPattern: Map<string, string>;   // canonical -> dose_response_pattern
  sexes: Map<string, string[]>;           // canonical -> sexes affected
  coherenceDomainCount: number;           // from organCoherence for hepatic
  syndromeMatched: boolean;               // from cross-domain syndromes
}

interface LabRule {
  id: string;
  name: string;
  category: "liver" | "graded" | "governance";
  parameters: { canonical: string; direction: "increase" | "decrease"; role: "required" | "supporting" }[];
  severity: "S1" | "S2" | "S3" | "S4";
  speciesApplicability: "nonclinical" | "clinical" | "both";
  source: string;
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
  confidenceModifiers: ConfidenceModifier[];
  source: string;
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

const LAB_SYNONYMS: Record<string, string[]> = {
  ALT: ["alt", "alanine aminotransferase", "sgpt", "gpt", "alat"],
  AST: ["ast", "aspartate aminotransferase", "sgot", "got", "asat"],
  ALP: ["alp", "alkaline phosphatase"],
  GGT: ["ggt", "gamma-glutamyl", "gamma gt"],
  SDH: ["sdh", "sorbitol dehydrogenase"],
  GDH: ["gldh", "gdh", "glutamate dehydrogenase"],
  "5NT": ["5'nt", "5'-nucleotidase", "5nt"],
  BUN: ["bun", "blood urea nitrogen", "urea nitrogen", "urea"],
  CREAT: ["creatinine", "crea", "creat"],
  TBILI: ["bilirubin", "tbili", "total bilirubin", "bili"],
  HGB: ["hemoglobin", "hgb", "hb"],
  RBC: ["rbc", "red blood cell", "erythrocyte"],
  HCT: ["hematocrit", "hct"],
  PLAT: ["platelet", "plt", "thrombocyte"],
  WBC: ["wbc", "white blood cell", "leukocyte"],
  NEUT: ["neutrophil", "neut", "anc"],
  RETIC: ["reticulocyte", "retic"],
  K: ["potassium"],
  NA: ["sodium"],
  CA: ["calcium"],
  PHOS: ["phosphate", "phosphorus"],
  GLUC: ["glucose", "blood glucose"],
  CHOL: ["cholesterol", "total cholesterol"],
  PT: ["prothrombin time"],
  INR: ["inr", "international normalized ratio"],
};

export function resolveCanonical(endpointLabel: string): string | null {
  const lower = endpointLabel.toLowerCase();
  for (const [canonical, synonyms] of Object.entries(LAB_SYNONYMS)) {
    if (synonyms.some((s) => lower.includes(s))) return canonical;
  }
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
  return (ctx.foldChanges.get(canonical) ?? 0) >= threshold;
}

function countPresent(ctx: RuleContext, canonicals: string[]): number {
  return canonicals.filter((c) => ctx.presentCanonicals.has(c)).length;
}

function hasGradedIncrease(ctx: RuleContext, canonical: string, minFold: number): boolean {
  return hasUp(ctx, canonical) && foldAbove(ctx, canonical, minFold);
}

function hasGradedDecrease(ctx: RuleContext, canonical: string, minFold: number): boolean {
  return hasDown(ctx, canonical) && foldAbove(ctx, canonical, minFold);
}

// ─── Rule Catalog ──────────────────────────────────────────

const LAB_RULES: LabRule[] = [
  // Liver rules L01-L11
  {
    id: "L01", name: "ALT elevation (moderate)", category: "liver",
    parameters: [{ canonical: "ALT", direction: "increase", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "FDA Guidance (2009)",
    evaluate: (ctx) => hasUp(ctx, "ALT") && foldAbove(ctx, "ALT", 2) && !foldAbove(ctx, "ALT", 5),
  },
  {
    id: "L02", name: "ALT elevation (marked)", category: "liver",
    parameters: [{ canonical: "ALT", direction: "increase", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "FDA Guidance (2009)",
    evaluate: (ctx) => hasUp(ctx, "ALT") && foldAbove(ctx, "ALT", 5),
  },
  {
    id: "L03", name: "ALT + Bilirubin concurrent elevation", category: "liver",
    parameters: [
      { canonical: "ALT", direction: "increase", role: "required" },
      { canonical: "TBILI", direction: "increase", role: "required" },
    ],
    severity: "S4", speciesApplicability: "both", source: "FDA Guidance (2009), Hy's Law",
    evaluate: (ctx) => hasUp(ctx, "ALT") && hasUp(ctx, "TBILI"),
  },
  {
    id: "L04", name: "Bilirubin elevation (isolated)", category: "liver",
    parameters: [{ canonical: "TBILI", direction: "increase", role: "required" }],
    severity: "S1", speciesApplicability: "both", source: "Clinical practice",
    evaluate: (ctx) => {
      if (!hasUp(ctx, "TBILI")) return false;
      // Isolated = no other hepatic enzymes elevated
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
    evaluate: (ctx) => countPresent(ctx, ["ALP", "GGT", "5NT", "TBILI"]) < 2,
  },
  {
    id: "L07", name: "Hy's Law pattern", category: "liver",
    parameters: [
      { canonical: "ALT", direction: "increase", role: "required" },
      { canonical: "TBILI", direction: "increase", role: "required" },
      { canonical: "ALP", direction: "increase", role: "supporting" },
    ],
    severity: "S4", speciesApplicability: "both", source: "FDA Hy's Law guidance",
    evaluate: (ctx) =>
      (hasUp(ctx, "ALT") || hasUp(ctx, "AST")) &&
      hasUp(ctx, "TBILI") &&
      !hasUp(ctx, "ALP"),
  },
  {
    id: "L08", name: "Hy's Law-like animal pattern", category: "liver",
    parameters: [
      { canonical: "ALT", direction: "increase", role: "required" },
      { canonical: "TBILI", direction: "increase", role: "required" },
    ],
    severity: "S3", speciesApplicability: "nonclinical", source: "Nonclinical adaptation",
    evaluate: (ctx) =>
      (hasUp(ctx, "ALT") || hasUp(ctx, "AST")) && hasUp(ctx, "TBILI"),
  },
  {
    id: "L09", name: "Excess ALT frequency (program flag)", category: "liver",
    parameters: [{ canonical: "ALT", direction: "increase", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Program monitoring",
    // Fires when ALT has monotonic pattern (dose-dependent)
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
    evaluate: (ctx) => hasUp(ctx, "ALT") && hasUp(ctx, "ALP"),
  },
  {
    id: "L11", name: "ALP in cholestasis (note)", category: "liver",
    parameters: [{ canonical: "ALP", direction: "increase", role: "required" }],
    severity: "S1", speciesApplicability: "both", source: "Clinical practice",
    evaluate: (ctx) => hasUp(ctx, "ALP") && !hasUp(ctx, "ALT") && !hasUp(ctx, "AST"),
  },

  // Graded rules L12-L24 — effect size magnitude -> grade -> severity
  {
    id: "L12", name: "BUN elevation", category: "graded",
    parameters: [{ canonical: "BUN", direction: "increase", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Renal toxicology",
    evaluate: (ctx) => hasGradedIncrease(ctx, "BUN", 2),
  },
  {
    id: "L13", name: "Creatinine elevation", category: "graded",
    parameters: [{ canonical: "CREAT", direction: "increase", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Renal toxicology",
    evaluate: (ctx) => hasGradedIncrease(ctx, "CREAT", 1.5),
  },
  {
    id: "L14", name: "Hemoglobin decrease", category: "graded",
    parameters: [{ canonical: "HGB", direction: "decrease", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Hematology",
    evaluate: (ctx) => hasGradedDecrease(ctx, "HGB", 2),
  },
  {
    id: "L15", name: "RBC decrease", category: "graded",
    parameters: [{ canonical: "RBC", direction: "decrease", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Hematology",
    evaluate: (ctx) => hasGradedDecrease(ctx, "RBC", 2),
  },
  {
    id: "L16", name: "HCT decrease", category: "graded",
    parameters: [{ canonical: "HCT", direction: "decrease", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Hematology",
    evaluate: (ctx) => hasGradedDecrease(ctx, "HCT", 1.5),
  },
  {
    id: "L17", name: "Platelet decrease", category: "graded",
    parameters: [{ canonical: "PLAT", direction: "decrease", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Hematology",
    evaluate: (ctx) => hasGradedDecrease(ctx, "PLAT", 2),
  },
  {
    id: "L18", name: "WBC decrease", category: "graded",
    parameters: [{ canonical: "WBC", direction: "decrease", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Hematology",
    evaluate: (ctx) => hasGradedDecrease(ctx, "WBC", 1.5),
  },
  {
    id: "L19", name: "Neutrophil decrease", category: "graded",
    parameters: [{ canonical: "NEUT", direction: "decrease", role: "required" }],
    severity: "S3", speciesApplicability: "both", source: "Hematology",
    evaluate: (ctx) => hasGradedDecrease(ctx, "NEUT", 2),
  },
  {
    id: "L20", name: "Potassium imbalance", category: "graded",
    parameters: [{ canonical: "K", direction: "increase", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Clinical chemistry",
    evaluate: (ctx) =>
      (hasUp(ctx, "K") && foldAbove(ctx, "K", 1.5)) ||
      (hasDown(ctx, "K") && foldAbove(ctx, "K", 1.5)),
  },
  {
    id: "L21", name: "Glucose imbalance", category: "graded",
    parameters: [{ canonical: "GLUC", direction: "increase", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Clinical chemistry",
    evaluate: (ctx) =>
      (hasUp(ctx, "GLUC") && foldAbove(ctx, "GLUC", 2)) ||
      (hasDown(ctx, "GLUC") && foldAbove(ctx, "GLUC", 2)),
  },
  {
    id: "L22", name: "Cholesterol elevation", category: "graded",
    parameters: [{ canonical: "CHOL", direction: "increase", role: "required" }],
    severity: "S1", speciesApplicability: "both", source: "Clinical chemistry",
    evaluate: (ctx) => hasGradedIncrease(ctx, "CHOL", 1.5),
  },
  {
    id: "L23", name: "Reticulocyte response", category: "graded",
    parameters: [{ canonical: "RETIC", direction: "increase", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Hematology",
    evaluate: (ctx) => hasGradedIncrease(ctx, "RETIC", 2),
  },
  {
    id: "L24", name: "Coagulation prolongation", category: "graded",
    parameters: [{ canonical: "PT", direction: "increase", role: "required" }],
    severity: "S2", speciesApplicability: "both", source: "Coagulation",
    evaluate: (ctx) => hasGradedIncrease(ctx, "PT", 1.5),
  },

  // Governance rules L25-L26 (post-hoc confidence modifiers, not severity triggers)
  {
    id: "L25", name: "Multi-domain convergence bonus", category: "governance",
    parameters: [],
    severity: "S1", speciesApplicability: "both", source: "Internal",
    evaluate: (ctx) => ctx.coherenceDomainCount >= 3,
  },
  {
    id: "L26", name: "Syndrome pattern bonus", category: "governance",
    parameters: [],
    severity: "S1", speciesApplicability: "both", source: "Internal",
    evaluate: (ctx) => ctx.syndromeMatched,
  },
];

// ─── Evaluator ─────────────────────────────────────────────

function buildContext(
  endpoints: EndpointSummary[],
  organCoherence?: Map<string, OrganCoherence>,
  syndromes?: CrossDomainSyndrome[],
): RuleContext {
  const foldChanges = new Map<string, number>();
  const presentCanonicals = new Set<string>();
  const endpointDirection = new Map<string, string>();
  const endpointSeverity = new Map<string, string>();
  const endpointPattern = new Map<string, string>();
  const sexes = new Map<string, string[]>();

  for (const ep of endpoints) {
    const canonical = resolveCanonical(ep.endpoint_label);
    if (!canonical) continue;
    presentCanonicals.add(canonical);

    const absEffect = ep.maxEffectSize != null ? Math.abs(ep.maxEffectSize) : 0;
    const existing = foldChanges.get(canonical) ?? 0;
    if (absEffect > existing) foldChanges.set(canonical, absEffect);

    if (ep.direction === "up" || ep.direction === "down") {
      endpointDirection.set(canonical, ep.direction);
    }

    const currentSev = endpointSeverity.get(canonical);
    if (!currentSev || ep.worstSeverity === "adverse" ||
        (ep.worstSeverity === "warning" && currentSev !== "adverse")) {
      endpointSeverity.set(canonical, ep.worstSeverity);
    }

    endpointPattern.set(canonical, ep.pattern);
    sexes.set(canonical, ep.sexes);
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
  };
}

function computeConfidence(
  rule: LabRule,
  ctx: RuleContext,
): { score: number; modifiers: ConfidenceModifier[] } {
  const modifiers: ConfidenceModifier[] = [];
  let score = 50; // base confidence

  // Dose-response pattern for matched parameters
  for (const param of rule.parameters) {
    const pattern = ctx.endpointPattern.get(param.canonical);
    if (pattern === "monotonic_increase" || pattern === "monotonic_decrease") {
      modifiers.push({ label: "Monotonic", value: 15, reason: `${param.canonical} shows monotonic dose-response` });
      score += 15;
    } else if (pattern === "threshold") {
      modifiers.push({ label: "Threshold", value: 10, reason: `${param.canonical} shows threshold pattern` });
      score += 10;
    }
  }

  // Severity of matched endpoints
  for (const param of rule.parameters) {
    const sev = ctx.endpointSeverity.get(param.canonical);
    if (sev === "adverse") {
      modifiers.push({ label: "Adverse", value: 10, reason: `${param.canonical} classified as adverse` });
      score += 10;
    }
  }

  // Multi-domain convergence (governance L25)
  if (ctx.coherenceDomainCount >= 3) {
    modifiers.push({ label: "Convergence", value: 10, reason: `${ctx.coherenceDomainCount}-domain organ convergence` });
    score += 10;
  }

  // Syndrome match (governance L26)
  if (ctx.syndromeMatched) {
    modifiers.push({ label: "Syndrome", value: 10, reason: "Cross-domain syndrome detected" });
    score += 10;
  }

  return { score: Math.min(score, 100), modifiers };
}

function getMatchedEndpoints(rule: LabRule, endpoints: EndpointSummary[]): string[] {
  const matched: string[] = [];
  for (const param of rule.parameters) {
    for (const ep of endpoints) {
      const canonical = resolveCanonical(ep.endpoint_label);
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

export function evaluateLabRules(
  endpoints: EndpointSummary[],
  organCoherence?: Map<string, OrganCoherence>,
  syndromes?: CrossDomainSyndrome[],
): LabClinicalMatch[] {
  const ctx = buildContext(endpoints, organCoherence, syndromes);
  const matches: LabClinicalMatch[] = [];

  // Evaluate non-governance rules
  for (const rule of LAB_RULES) {
    if (rule.category === "governance") continue;
    if (!rule.evaluate(ctx)) continue;

    const { score, modifiers } = computeConfidence(rule, ctx);
    matches.push({
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      severityLabel: SEVERITY_LABELS[rule.severity],
      category: rule.category,
      matchedEndpoints: getMatchedEndpoints(rule, endpoints),
      foldChanges: getFoldChangesForRule(rule, ctx),
      confidenceScore: score,
      confidenceModifiers: modifiers,
      source: rule.source,
    });
  }

  // Deduplicate: if multiple rules match same primary endpoint, keep highest severity
  const byEndpoint = new Map<string, LabClinicalMatch>();
  const sevOrder: Record<string, number> = { S4: 4, S3: 3, S2: 2, S1: 1 };
  for (const match of matches) {
    const key = match.matchedEndpoints.sort().join("|");
    const existing = byEndpoint.get(key);
    if (!existing || sevOrder[match.severity] > sevOrder[existing.severity]) {
      byEndpoint.set(key, match);
    }
  }

  return [...byEndpoint.values()].sort(
    (a, b) => sevOrder[b.severity] - sevOrder[a.severity]
  );
}
