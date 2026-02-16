/**
 * Organ → relevant lab tests mapping for cross-domain correlation.
 *
 * Used by CompareTab and the lab correlates pane to identify which
 * clinical pathology endpoints are scientifically relevant for a given
 * specimen or finding.
 */

/** Specimen (uppercase) → relevant lab test codes. */
export const ORGAN_RELEVANT_TESTS: Record<string, string[]> = {
  LIVER: ["ALT", "AST", "ALP", "GGT", "TBIL", "DBIL", "ALB", "TP", "CHOL", "TRIG", "GLUC"],
  KIDNEY: ["BUN", "CREA", "TP", "ALB", "NA", "K", "CL", "CA", "PHOS", "UA"],
  "BONE MARROW": ["WBC", "RBC", "HGB", "HCT", "PLT", "RETIC", "MCV", "MCH", "MCHC", "NEUT", "LYMPH", "MONO", "EOS", "BASO"],
  SPLEEN: ["WBC", "RBC", "HGB", "HCT", "PLT", "RETIC", "NEUT", "LYMPH"],
  HEART: ["CK", "LDH", "AST", "TROP"],
  ADRENAL: ["NA", "K", "GLUC", "CHOL", "CORT"],
  "ADRENAL GLAND": ["NA", "K", "GLUC", "CHOL", "CORT"],
  THYROID: ["T3", "T4", "TSH", "CHOL", "TRIG"],
  "THYROID GLAND": ["T3", "T4", "TSH", "CHOL", "TRIG"],
  PANCREAS: ["GLUC", "AMY", "LIP", "INS"],
  STOMACH: ["TP", "ALB"],
  TESTIS: ["TEST", "LH", "FSH"],
  TESTES: ["TEST", "LH", "FSH"],
  OVARY: ["ESTRADIOL", "LH", "FSH", "PROG"],
  OVARIES: ["ESTRADIOL", "LH", "FSH", "PROG"],
};

/** Finding (lowercase) → relevant lab test codes for targeted correlation. */
export const FINDING_RELEVANT_TESTS: Record<string, string[]> = {
  necrosis: ["ALT", "AST", "LDH"],
  "hepatocellular necrosis": ["ALT", "AST", "LDH", "TBIL"],
  "hepatocellular hypertrophy": ["ALT", "AST", "ALP", "GGT"],
  cholestasis: ["ALP", "GGT", "TBIL"],
  "bile duct hyperplasia": ["ALP", "GGT", "TBIL"],
  fibrosis: ["ALT", "AST", "ALP"],
  steatosis: ["CHOL", "TRIG", "ALT"],
  "fatty change": ["CHOL", "TRIG", "ALT"],
  "tubular degeneration": ["BUN", "CREA"],
  "tubular necrosis": ["BUN", "CREA", "TP"],
  glomerulonephritis: ["BUN", "CREA", "TP", "ALB"],
  "erythroid hypoplasia": ["RBC", "HGB", "HCT", "RETIC"],
  "myeloid hyperplasia": ["WBC", "NEUT"],
  "lymphoid depletion": ["WBC", "LYMPH"],
  "extramedullary hematopoiesis": ["RBC", "HGB", "PLT", "RETIC"],
  atrophy: ["ALT", "AST"],
  inflammation: ["WBC", "NEUT", "MONO"],
  hyperplasia: ["WBC"],
};

/** Get relevant lab tests for a specimen (case-insensitive). */
export function getOrganRelevantTests(specimen: string): string[] {
  const key = specimen.toUpperCase().replace(/_/g, " ");
  return ORGAN_RELEVANT_TESTS[key] ?? [];
}

/**
 * Get relevant lab tests for a specimen+finding combination.
 * Finding-specific tests take priority, supplemented by organ-level tests.
 */
export function getRelevantTests(specimen: string, finding?: string): string[] {
  const organTests = getOrganRelevantTests(specimen);
  if (!finding) return organTests;

  const findingLower = finding.toLowerCase();
  // Exact match first
  const findingTests = FINDING_RELEVANT_TESTS[findingLower];
  if (findingTests) {
    // Union of finding-specific + organ-level, finding-specific first
    const set = new Set(findingTests);
    for (const t of organTests) set.add(t);
    return [...set];
  }

  // Partial match: check if any key is contained in the finding
  for (const [key, tests] of Object.entries(FINDING_RELEVANT_TESTS)) {
    if (findingLower.includes(key)) {
      const set = new Set(tests);
      for (const t of organTests) set.add(t);
      return [...set];
    }
  }

  return organTests;
}
