/**
 * Cross-Domain Syndrome Detection Engine (Layer B).
 * Matches endpoints against 9 predefined cross-domain patterns (XS01-XS09)
 * using structured term dictionaries with test codes, canonical labels,
 * specimen+finding matching, and compound required logic.
 *
 * Replaces the old substring matching approach to eliminate false positives
 * (e.g., "BONE MARROW, FEMUR - FIBROSIS" matching myelosuppression).
 */

import type { EndpointSummary } from "@/lib/derive-summaries";

// ─── Types ─────────────────────────────────────────────────

/** Structured term match definition — replaces substring matching. */
interface SyndromeTermMatch {
  /** LBTESTCD values for LB domain matching (OR logic) */
  testCodes?: string[];
  /** Exact match after normalization (OR logic) */
  canonicalLabels?: string[];
  /** MI/MA: must match BOTH specimen AND finding */
  specimenTerms?: {
    specimen: string[];   // empty = any specimen
    finding: string[];
  };
  /** OM: specimen + direction */
  organWeightTerms?: {
    specimen: string[];   // empty = any specimen
  };

  /** Required domain match */
  domain: string;
  /** Required direction match */
  direction: "up" | "down" | "any";
  /** Role in syndrome detection */
  role: "required" | "supporting";
  /** Optional tag for compound logic grouping */
  tag?: string;
}

/** Compound required logic for syndrome definitions. */
type RequiredLogic =
  | { type: "any" }                           // >=1 required term matches
  | { type: "all" }                           // ALL required terms must match
  | { type: "compound"; expression: string }; // custom: "ALP AND (GGT OR 5NT)"

interface SyndromeDefinition {
  id: string;
  name: string;
  requiredLogic: RequiredLogic;
  terms: SyndromeTermMatch[];
  minDomains: number;
}

export interface EndpointMatch {
  endpoint_label: string;
  domain: string;
  role: "required" | "supporting";
  direction: string;
  severity: string;
}

export interface CrossDomainSyndrome {
  id: string;
  name: string;
  matchedEndpoints: EndpointMatch[];
  requiredMet: boolean;
  domainsCovered: string[];
  confidence: "HIGH" | "MODERATE" | "LOW";
  supportScore: number;
}

// ─── Normalization & parsing helpers ───────────────────────

/** Normalize a label for comparison: lowercase, collapse separators & whitespace. */
function normalizeLabel(label: string): string {
  return label.toLowerCase().trim()
    .replace(/[_\-:,]/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Parse "SPECIMEN — FINDING" or "SPECIMEN, LOCATION — FINDING" from endpoint_label.
 * Returns null if the label doesn't match the specimen:finding format.
 */
function parseSpecimenFinding(label: string): { specimen: string; finding: string } | null {
  // Pattern: "SPECIMEN — FINDING" or "SPECIMEN - FINDING" or "SPECIMEN: FINDING"
  const match = label.match(/^(.+?)\s*[—:\u2014]\s*(.+)$/);
  if (match) return { specimen: match[1].trim(), finding: match[2].trim() };
  // Fallback: try simple dash separator (but not within compound words)
  const dashMatch = label.match(/^(.+?)\s+-\s+(.+)$/);
  if (dashMatch) return { specimen: dashMatch[1].trim(), finding: dashMatch[2].trim() };
  return null;
}

// ─── Matching logic ────────────────────────────────────────

/** Check if an endpoint matches a single term definition. */
function matchEndpoint(ep: EndpointSummary, term: SyndromeTermMatch): boolean {
  // 1. Domain must match
  if (ep.domain.toUpperCase() !== term.domain) return false;

  // 2. Direction must match (if specified)
  if (term.direction !== "any") {
    if (ep.direction !== term.direction) return false;
  }

  // 3. Match by test code (LB domain, highest priority)
  if (term.testCodes) {
    const epTestCode = ep.testCode?.toUpperCase();
    if (epTestCode && term.testCodes.includes(epTestCode)) return true;
  }

  // 4. Match by canonical label (exact after normalization)
  if (term.canonicalLabels) {
    const normalized = normalizeLabel(ep.endpoint_label);
    if (term.canonicalLabels.some((cl) => normalized === cl)) return true;
  }

  // 5. Match by specimen + finding (MI/MA domain)
  if (term.specimenTerms) {
    // Get specimen and finding — prefer structured fields, fall back to parsing endpoint_label
    let specimen = ep.specimen;
    let finding = ep.finding;
    if (!specimen || !finding) {
      const parsed = parseSpecimenFinding(ep.endpoint_label);
      if (parsed) {
        specimen = specimen ?? parsed.specimen;
        finding = finding ?? parsed.finding;
      }
    }
    if (specimen && finding) {
      const normSpecimen = normalizeLabel(specimen);
      const normFinding = normalizeLabel(finding);
      // Empty specimen array = match any specimen
      const specimenMatch = term.specimenTerms.specimen.length === 0 ||
        term.specimenTerms.specimen.some((s) => normSpecimen.includes(s));
      const findingMatch = term.specimenTerms.finding.some((f) => normFinding.includes(f));
      if (specimenMatch && findingMatch) return true;
    }
  }

  // 6. Match by organ weight specimen (OM domain)
  if (term.organWeightTerms) {
    // For OM domain, try structured specimen first, then parse from endpoint_label
    let specimen = ep.specimen;
    if (!specimen) {
      const parsed = parseSpecimenFinding(ep.endpoint_label);
      specimen = parsed?.specimen ?? ep.endpoint_label;
    }
    const normSpecimen = normalizeLabel(specimen);
    // Empty specimen array = match any organ weight
    if (term.organWeightTerms.specimen.length === 0 ||
        term.organWeightTerms.specimen.some((s) => normSpecimen.includes(s))) {
      return true;
    }
  }

  return false;
}

/** Supporting finding gate: must show SOME evidence of being real. */
function passesSupportingGate(ep: EndpointSummary): boolean {
  return (
    ep.worstSeverity === "adverse" ||
    ep.worstSeverity === "warning" ||
    (ep.minPValue !== null && ep.minPValue < 0.1) ||
    (ep.maxIncidence !== undefined && ep.maxIncidence !== null && ep.maxIncidence >= 0.2)
  );
}

// ─── Term dictionaries per syndrome (XS01-XS09) ──────────

const XS01_TERMS: SyndromeTermMatch[] = [
  // === REQUIRED (need >=1) ===
  {
    testCodes: ["ALT", "ALAT"],
    canonicalLabels: ["alanine aminotransferase"],
    domain: "LB", direction: "up", role: "required", tag: "ALT",
  },
  {
    testCodes: ["AST", "ASAT"],
    canonicalLabels: ["aspartate aminotransferase"],
    domain: "LB", direction: "up", role: "required", tag: "AST",
  },
  // === SUPPORTING ===
  {
    testCodes: ["SDH", "GLDH", "GDH"],
    canonicalLabels: ["sorbitol dehydrogenase", "glutamate dehydrogenase"],
    domain: "LB", direction: "up", role: "supporting",
  },
  {
    testCodes: ["BILI", "TBILI"],
    canonicalLabels: ["bilirubin", "total bilirubin"],
    domain: "LB", direction: "up", role: "supporting",
  },
  {
    organWeightTerms: { specimen: ["liver"] },
    domain: "OM", direction: "any", role: "supporting",
  },
  {
    specimenTerms: {
      specimen: ["liver", "hepat"],
      finding: ["necrosis", "apoptosis", "degeneration",
                "single cell necrosis", "hepatocellular necrosis"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
  {
    specimenTerms: {
      specimen: ["liver", "hepat"],
      finding: ["hypertrophy", "hepatocellular hypertrophy",
                "centrilobular hypertrophy"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
];

const XS02_TERMS: SyndromeTermMatch[] = [
  // === REQUIRED (ALP AND (GGT OR 5NT)) ===
  {
    testCodes: ["ALP", "ALKP"],
    canonicalLabels: ["alkaline phosphatase"],
    domain: "LB", direction: "up", role: "required", tag: "ALP",
  },
  {
    testCodes: ["GGT"],
    canonicalLabels: ["gamma glutamyltransferase", "gamma gt"],
    domain: "LB", direction: "up", role: "required", tag: "GGT",
  },
  {
    testCodes: ["5NT"],
    canonicalLabels: ["5 nucleotidase", "5' nucleotidase"],
    domain: "LB", direction: "up", role: "required", tag: "5NT",
  },
  // === SUPPORTING ===
  {
    testCodes: ["BILI", "TBILI"],
    canonicalLabels: ["bilirubin", "total bilirubin"],
    domain: "LB", direction: "up", role: "supporting",
  },
  {
    testCodes: ["CHOL"],
    canonicalLabels: ["cholesterol", "total cholesterol"],
    domain: "LB", direction: "up", role: "supporting",
  },
  {
    organWeightTerms: { specimen: ["liver"] },
    domain: "OM", direction: "up", role: "supporting",
  },
  {
    specimenTerms: {
      specimen: ["liver", "hepat"],
      finding: ["bile duct hyperplasia", "cholangitis", "bile duct proliferation",
                "bile plugs", "cholestasis", "bile duct"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
];

const XS03_TERMS: SyndromeTermMatch[] = [
  // === REQUIRED ===
  {
    testCodes: ["BUN", "UREA"],
    canonicalLabels: ["blood urea nitrogen", "urea nitrogen", "urea"],
    domain: "LB", direction: "up", role: "required", tag: "BUN",
  },
  {
    testCodes: ["CREAT", "CREA"],
    canonicalLabels: ["creatinine"],
    domain: "LB", direction: "up", role: "required", tag: "CREAT",
  },
  // === SUPPORTING ===
  {
    organWeightTerms: { specimen: ["kidney"] },
    domain: "OM", direction: "any", role: "supporting",
  },
  {
    testCodes: ["SPGRAV", "SG", "UOSMO"],
    canonicalLabels: ["specific gravity", "urine osmolality"],
    domain: "LB", direction: "down", role: "supporting",
  },
  {
    specimenTerms: {
      specimen: ["kidney"],
      finding: ["tubular degeneration", "tubular necrosis", "tubular basophilia",
                "tubular dilatation", "cast", "casts", "mineralization",
                "regeneration", "papillary necrosis"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
];

const XS04_TERMS: SyndromeTermMatch[] = [
  // === REQUIRED (ANY(Neutrophils, Platelets, (RBC AND HGB))) ===
  {
    testCodes: ["NEUT", "ANC"],
    canonicalLabels: ["neutrophils", "neutrophil count", "absolute neutrophil count"],
    domain: "LB", direction: "down", role: "required", tag: "NEUT",
  },
  {
    testCodes: ["PLAT", "PLT"],
    canonicalLabels: ["platelets", "platelet count"],
    domain: "LB", direction: "down", role: "required", tag: "PLAT",
  },
  {
    testCodes: ["RBC"],
    canonicalLabels: ["erythrocytes", "erythrocyte count", "red blood cells", "red blood cell count"],
    domain: "LB", direction: "down", role: "required", tag: "RBC",
  },
  {
    testCodes: ["HGB", "HB"],
    canonicalLabels: ["hemoglobin"],
    domain: "LB", direction: "down", role: "required", tag: "HGB",
  },
  // === SUPPORTING ===
  {
    specimenTerms: {
      specimen: ["bone marrow"],
      finding: ["hypocellularity", "hypocellular", "decreased cellularity",
                "aplasia", "hypoplasia", "atrophy"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
  {
    testCodes: ["RETIC", "RET"],
    canonicalLabels: ["reticulocytes", "reticulocyte count"],
    domain: "LB", direction: "down", role: "supporting",
  },
  {
    specimenTerms: {
      specimen: ["spleen"],
      finding: ["atrophy", "decreased extramedullary", "hypoplasia",
                "lymphoid depletion"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
  {
    organWeightTerms: { specimen: ["spleen"] },
    domain: "OM", direction: "down", role: "supporting",
  },
];

const XS05_TERMS: SyndromeTermMatch[] = [
  // === REQUIRED (ALL: RBC down AND Reticulocytes up) ===
  {
    testCodes: ["RBC"],
    canonicalLabels: ["erythrocytes", "erythrocyte count", "red blood cells"],
    domain: "LB", direction: "down", role: "required", tag: "RBC",
  },
  {
    testCodes: ["RETIC", "RET"],
    canonicalLabels: ["reticulocytes", "reticulocyte count"],
    domain: "LB", direction: "up", role: "required", tag: "RETIC",
  },
  // === SUPPORTING ===
  {
    testCodes: ["BILI", "TBILI"],
    canonicalLabels: ["bilirubin", "total bilirubin"],
    domain: "LB", direction: "up", role: "supporting",
  },
  {
    organWeightTerms: { specimen: ["spleen"] },
    domain: "OM", direction: "up", role: "supporting",
  },
  {
    specimenTerms: {
      specimen: ["spleen"],
      finding: ["extramedullary hematopoiesis", "congestion",
                "pigmentation", "hemosiderin", "hemosiderosis",
                "increased hematopoiesis"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
  {
    testCodes: ["HAPTO", "HPT"],
    canonicalLabels: ["haptoglobin"],
    domain: "LB", direction: "down", role: "supporting",
  },
];

const XS06_TERMS: SyndromeTermMatch[] = [
  // === REQUIRED ===
  {
    testCodes: ["PHOS", "PL"],
    canonicalLabels: ["phospholipids"],
    domain: "LB", direction: "up", role: "required", tag: "PHOS",
  },
  // === SUPPORTING ===
  {
    specimenTerms: {
      specimen: [],  // any specimen
      finding: ["foamy macrophage", "foamy macrophages", "vacuolation",
                "lamellar bodies", "phospholipidosis"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
  {
    organWeightTerms: { specimen: ["liver", "lung", "kidney", "spleen"] },
    domain: "OM", direction: "up", role: "supporting",
  },
];

const XS07_TERMS: SyndromeTermMatch[] = [
  // === REQUIRED ===
  {
    testCodes: ["WBC"],
    canonicalLabels: ["white blood cells", "white blood cell count", "leukocytes"],
    domain: "LB", direction: "down", role: "required", tag: "WBC",
  },
  {
    testCodes: ["LYMPH", "LYM"],
    canonicalLabels: ["lymphocytes", "lymphocyte count"],
    domain: "LB", direction: "down", role: "required", tag: "LYMPH",
  },
  // === SUPPORTING ===
  {
    organWeightTerms: { specimen: ["spleen"] },
    domain: "OM", direction: "down", role: "supporting",
  },
  {
    organWeightTerms: { specimen: ["thymus"] },
    domain: "OM", direction: "down", role: "supporting",
  },
  {
    specimenTerms: {
      specimen: ["spleen", "thymus", "lymph node"],
      finding: ["lymphoid depletion", "atrophy", "decreased cellularity",
                "lymphocytolysis", "necrosis", "apoptosis"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
];

const XS08_TERMS: SyndromeTermMatch[] = [
  // === REQUIRED ===
  {
    organWeightTerms: { specimen: ["adrenal"] },
    domain: "OM", direction: "up", role: "required", tag: "ADRENAL_WT",
  },
  // === SUPPORTING ===
  {
    testCodes: ["CORT"],
    canonicalLabels: ["corticosterone", "cortisol"],
    domain: "LB", direction: "up", role: "supporting",
  },
  {
    organWeightTerms: { specimen: ["thymus"] },
    domain: "OM", direction: "down", role: "supporting",
  },
  {
    testCodes: ["LYMPH", "LYM"],
    canonicalLabels: ["lymphocytes", "lymphocyte count"],
    domain: "LB", direction: "down", role: "supporting",
  },
  {
    canonicalLabels: ["body weight"],
    domain: "BW", direction: "down", role: "supporting",
  },
];

const XS09_TERMS: SyndromeTermMatch[] = [
  // === REQUIRED ===
  {
    canonicalLabels: ["body weight"],
    domain: "BW", direction: "down", role: "required", tag: "BW",
  },
  // === SUPPORTING ===
  {
    canonicalLabels: ["food consumption", "food intake"],
    domain: "BW", direction: "down", role: "supporting",
  },
  {
    organWeightTerms: { specimen: [] },  // any specimen
    domain: "OM", direction: "down", role: "supporting",
  },
  {
    specimenTerms: {
      specimen: [],  // any specimen
      finding: ["atrophy", "wasting", "decreased size"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
];

// ─── Syndrome definitions ─────────────────────────────────

const SYNDROME_DEFINITIONS: SyndromeDefinition[] = [
  {
    id: "XS01",
    name: "Hepatocellular injury",
    requiredLogic: { type: "any" },
    terms: XS01_TERMS,
    minDomains: 2,
  },
  {
    id: "XS02",
    name: "Hepatobiliary / Cholestatic",
    requiredLogic: { type: "compound", expression: "ALP AND (GGT OR 5NT)" },
    terms: XS02_TERMS,
    minDomains: 2,
  },
  {
    id: "XS03",
    name: "Nephrotoxicity",
    requiredLogic: { type: "any" },
    terms: XS03_TERMS,
    minDomains: 2,
  },
  {
    id: "XS04",
    name: "Myelosuppression",
    requiredLogic: { type: "compound", expression: "ANY(NEUT, PLAT, (RBC AND HGB))" },
    terms: XS04_TERMS,
    minDomains: 1,
  },
  {
    id: "XS05",
    name: "Hemolytic anemia",
    requiredLogic: { type: "all" },
    terms: XS05_TERMS,
    minDomains: 1,
  },
  {
    id: "XS06",
    name: "Phospholipidosis",
    requiredLogic: { type: "any" },
    terms: XS06_TERMS,
    minDomains: 2,
  },
  {
    id: "XS07",
    name: "Immunotoxicity",
    requiredLogic: { type: "any" },
    terms: XS07_TERMS,
    minDomains: 2,
  },
  {
    id: "XS08",
    name: "Stress response",
    requiredLogic: { type: "any" },
    terms: XS08_TERMS,
    minDomains: 2,
  },
  {
    id: "XS09",
    name: "Target organ wasting",
    requiredLogic: { type: "any" },
    terms: XS09_TERMS,
    minDomains: 2,
  },
];

// ─── Compound required logic evaluator ────────────────────

/**
 * Evaluate compound required logic against a set of matched tags.
 * Tags are assigned to each required term in the term dictionary.
 */
function evaluateRequiredLogic(
  logic: RequiredLogic,
  matchedTags: Set<string>,
): boolean {
  switch (logic.type) {
    case "any":
      // At least one required term must match
      return matchedTags.size > 0;

    case "all":
      // All required terms must match — checked by caller
      // (caller passes all required tags; if all are in matchedTags, it's met)
      return true; // "all" is checked differently: caller verifies all tags are present

    case "compound":
      return evaluateCompoundExpression(logic.expression, matchedTags);
  }
}

/**
 * Evaluate a compound expression like "ALP AND (GGT OR 5NT)"
 * or "ANY(NEUT, PLAT, (RBC AND HGB))".
 */
function evaluateCompoundExpression(expr: string, matchedTags: Set<string>): boolean {
  const normalized = expr.trim();

  // ANY(a, b, (c AND d)) — at least one of the items must be true
  const anyMatch = normalized.match(/^ANY\((.+)\)$/);
  if (anyMatch) {
    const items = splitTopLevel(anyMatch[1]);
    return items.some((item) => evaluateCompoundExpression(item.trim(), matchedTags));
  }

  // (X AND Y) — parenthesized sub-expression
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    return evaluateCompoundExpression(normalized.slice(1, -1).trim(), matchedTags);
  }

  // X AND Y
  if (normalized.includes(" AND ")) {
    const parts = normalized.split(" AND ").map((p) => p.trim());
    return parts.every((p) => evaluateCompoundExpression(p, matchedTags));
  }

  // X OR Y
  if (normalized.includes(" OR ")) {
    const parts = normalized.split(" OR ").map((p) => p.trim());
    return parts.some((p) => evaluateCompoundExpression(p, matchedTags));
  }

  // Simple tag name
  return matchedTags.has(normalized);
}

/**
 * Split a comma-separated list at the top level (respecting parentheses).
 * "NEUT, PLAT, (RBC AND HGB)" => ["NEUT", "PLAT", "(RBC AND HGB)"]
 */
function splitTopLevel(str: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

// ─── Confidence assignment ────────────────────────────────

function assignConfidence(
  requiredMet: boolean,
  supportCount: number,
  domainCount: number,
): "HIGH" | "MODERATE" | "LOW" {
  if (requiredMet && supportCount >= 3 && domainCount >= 3) return "HIGH";
  if (requiredMet && supportCount >= 1 && domainCount >= 2) return "MODERATE";
  return "LOW";
}

// ─── Main detection function ──────────────────────────────

export function detectCrossDomainSyndromes(
  endpoints: EndpointSummary[],
): CrossDomainSyndrome[] {
  const results: CrossDomainSyndrome[] = [];

  for (const syndrome of SYNDROME_DEFINITIONS) {
    const matchedEndpoints: EndpointMatch[] = [];
    const matchedRequiredTags = new Set<string>();
    let supportCount = 0;

    // Separate required and supporting terms
    const requiredTerms = syndrome.terms.filter((t) => t.role === "required");
    const supportingTerms = syndrome.terms.filter((t) => t.role === "supporting");

    // Collect all required tags for "all" logic validation
    const allRequiredTags = new Set(
      requiredTerms.map((t) => t.tag).filter((t): t is string => t !== undefined)
    );

    // Match required terms — only adverse/warning endpoints
    const adverseWarning = endpoints.filter(
      (ep) => ep.worstSeverity === "adverse" || ep.worstSeverity === "warning"
    );
    for (const term of requiredTerms) {
      for (const ep of adverseWarning) {
        if (matchEndpoint(ep, term)) {
          if (term.tag) matchedRequiredTags.add(term.tag);
          // Avoid duplicating an endpoint already in the match list
          const alreadyMatched = matchedEndpoints.some(
            (m) => m.endpoint_label === ep.endpoint_label && m.role === "required"
          );
          if (!alreadyMatched) {
            matchedEndpoints.push({
              endpoint_label: ep.endpoint_label,
              domain: ep.domain,
              role: "required",
              direction: ep.direction ?? "none",
              severity: ep.worstSeverity,
            });
          }
          break; // one match per term is enough
        }
      }
    }

    // Evaluate required logic
    let requiredMet = false;
    if (syndrome.requiredLogic.type === "all") {
      // ALL: every required tag must be matched
      requiredMet = allRequiredTags.size > 0 &&
        [...allRequiredTags].every((tag) => matchedRequiredTags.has(tag));
    } else {
      requiredMet = evaluateRequiredLogic(syndrome.requiredLogic, matchedRequiredTags);
    }

    // Match supporting terms — apply supporting gate
    for (const term of supportingTerms) {
      for (const ep of endpoints) {
        if (matchEndpoint(ep, term) && passesSupportingGate(ep)) {
          // Avoid duplicating an endpoint already matched as required
          const alreadyRequired = matchedEndpoints.some(
            (m) => m.endpoint_label === ep.endpoint_label && m.role === "required"
          );
          if (!alreadyRequired) {
            // Avoid duplicating an endpoint already matched as supporting
            const alreadySupporting = matchedEndpoints.some(
              (m) => m.endpoint_label === ep.endpoint_label && m.role === "supporting"
            );
            if (!alreadySupporting) {
              supportCount++;
              matchedEndpoints.push({
                endpoint_label: ep.endpoint_label,
                domain: ep.domain,
                role: "supporting",
                direction: ep.direction ?? "none",
                severity: ep.worstSeverity,
              });
            }
          }
          break; // one match per term
        }
      }
    }

    // Check if syndrome fires
    const domainsCovered = [...new Set(matchedEndpoints.map((m) => m.domain))].sort();
    const meetsMinDomains = domainsCovered.length >= syndrome.minDomains;

    if ((requiredMet && meetsMinDomains) || (!requiredMet && supportCount >= 3)) {
      results.push({
        id: syndrome.id,
        name: syndrome.name,
        matchedEndpoints,
        requiredMet,
        domainsCovered,
        confidence: assignConfidence(requiredMet, supportCount, domainsCovered.length),
        supportScore: supportCount,
      });
    }
  }

  return results;
}
