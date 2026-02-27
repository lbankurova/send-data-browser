/**
 * Cross-Domain Syndrome Detection — Static Data.
 *
 * Term dictionaries (XS01–XS10), syndrome definitions, directional gates,
 * and magnitude floor reference tables. Extracted from cross-domain-syndromes.ts
 * for module clarity. All exports are re-exported from cross-domain-syndromes.ts.
 */

import type {
  SyndromeTermMatch,
  SyndromeDefinition,
  DirectionalGateConfig,
  MagnitudeFloor,
} from "./cross-domain-syndrome-types";

// ─── Term dictionaries per syndrome (XS01-XS10) ──────────

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
    domain: "OM", direction: "up", role: "supporting", tag: "LIVER_WT",
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
    testCodes: ["CREAT", "CREA"],
    canonicalLabels: ["creatinine"],
    domain: "LB", direction: "up", role: "required", tag: "CREAT",
  },
  {
    testCodes: ["BUN", "UREA"],
    canonicalLabels: ["blood urea nitrogen", "urea nitrogen", "urea"],
    domain: "LB", direction: "up", role: "required", tag: "BUN",
  },
  // === SUPPORTING (each tagged for compound expression reference) ===
  {
    organWeightTerms: { specimen: ["kidney"] },
    domain: "OM", direction: "any", role: "supporting", tag: "KIDNEY_WT",
  },
  {
    testCodes: ["SPGRAV", "SG", "UOSMO"],
    canonicalLabels: ["specific gravity", "urine osmolality"],
    domain: "LB", direction: "down", role: "supporting", tag: "URINE_SG",
  },
  {
    specimenTerms: {
      specimen: ["kidney"],
      finding: ["tubular degeneration", "tubular necrosis", "tubular basophilia",
                "tubular dilatation", "cast", "casts", "mineralization",
                "regeneration", "papillary necrosis"],
    },
    domain: "MI", direction: "any", role: "supporting", tag: "MI_KIDNEY",
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
    domain: "LB", direction: "down", role: "supporting", tag: "RETIC",
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
    domain: "OM", direction: "down", role: "supporting", tag: "SPLEEN_WT",
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
    domain: "OM", direction: "up", role: "supporting", tag: "SPLEEN_WT",
  },
  // REM-13: Split into two distinct terms — EMH and hemosiderin/pigment
  {
    specimenTerms: {
      specimen: ["spleen"],
      finding: ["extramedullary hematopoiesis", "increased hematopoiesis", "congestion"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
  {
    specimenTerms: {
      specimen: ["spleen"],
      finding: ["pigmentation", "hemosiderin", "hemosiderosis"],
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
    testCodes: ["PL", "PLIPID", "PHOSLPD"],
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
  // === REQUIRED (REM-14: ANY of WBC↓, LYMPH↓, THYMUS_WT↓ per ICH S8) ===
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
  // REM-14: Thymus weight raised to required
  {
    organWeightTerms: { specimen: ["thymus"] },
    domain: "OM", direction: "down", role: "required", tag: "THYMUS_WT",
  },
  // === SUPPORTING ===
  {
    organWeightTerms: { specimen: ["spleen"] },
    domain: "OM", direction: "down", role: "supporting", tag: "SPLEEN_WT",
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
  // === REQUIRED (REM-12: ADRENAL_WT + at least one corroborating finding) ===
  {
    organWeightTerms: { specimen: ["adrenal"] },
    domain: "OM", direction: "up", role: "required", tag: "ADRENAL_WT",
  },
  {
    organWeightTerms: { specimen: ["thymus"] },
    domain: "OM", direction: "down", role: "required", tag: "THYMUS_WT",
  },
  {
    testCodes: ["LYMPH", "LYM"],
    canonicalLabels: ["lymphocytes", "lymphocyte count"],
    domain: "LB", direction: "down", role: "required", tag: "LYMPH",
  },
  {
    canonicalLabels: ["body weight"],
    domain: "BW", direction: "down", role: "required", tag: "BW",
  },
  // === SUPPORTING ===
  {
    testCodes: ["CORT"],
    canonicalLabels: ["corticosterone", "cortisol"],
    domain: "LB", direction: "up", role: "supporting",
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
    domain: "OM", direction: "down", role: "supporting", tag: "OM_WT",
  },
  {
    specimenTerms: {
      specimen: [],  // any specimen
      finding: ["atrophy", "wasting", "decreased size"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
];

const XS10_TERMS: SyndromeTermMatch[] = [
  // === REQUIRED (ANY: at least one ECG or VS finding) ===
  {
    testCodes: ["QTCBAG", "QTCFAG", "QTCVAG", "QTCAG"],
    canonicalLabels: ["qtcb interval", "qtcf interval", "qtcv interval", "qtc interval"],
    domain: "EG", direction: "any", role: "required", tag: "QTC",
  },
  {
    testCodes: ["PRAG"],
    canonicalLabels: ["pr interval"],
    domain: "EG", direction: "any", role: "required", tag: "PR",
  },
  {
    testCodes: ["RRAG"],
    canonicalLabels: ["rr interval"],
    domain: "EG", direction: "any", role: "required", tag: "RR",
  },
  {
    testCodes: ["HR"],
    canonicalLabels: ["heart rate"],
    domain: "VS", direction: "any", role: "required", tag: "HR",
  },
  // === SUPPORTING ===
  {
    organWeightTerms: { specimen: ["heart"] },
    domain: "OM", direction: "up", role: "supporting",
  },
  {
    specimenTerms: {
      specimen: ["heart"],
      finding: ["cardiomyopathy", "myocyte degeneration", "necrosis",
                "myocardial degeneration", "fibrosis", "vacuolation",
                "myocardial necrosis", "inflammation"],
    },
    domain: "MI", direction: "any", role: "supporting",
  },
  {
    testCodes: ["CTNI", "CTNT", "TNNI", "TNNT"],
    canonicalLabels: ["troponin i", "troponin t", "cardiac troponin"],
    domain: "LB", direction: "up", role: "supporting",
  },
];

// ─── Syndrome definitions ─────────────────────────────────

/** @internal Exported for reference generator. */
export const SYNDROME_DEFINITIONS: SyndromeDefinition[] = [
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
    requiredLogic: { type: "compound", expression: "ANY((CREAT AND BUN), (CREAT AND KIDNEY_WT), (CREAT AND URINE_SG), (CREAT AND MI_KIDNEY))" },
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
    requiredLogic: { type: "compound", expression: "ADRENAL_WT AND (BW OR THYMUS_WT OR LYMPH)" },
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
  {
    id: "XS10",
    name: "Cardiovascular",
    requiredLogic: { type: "any" },
    terms: XS10_TERMS,
    minDomains: 1,
  },
];

// ─── REM-09: Directional gate definitions ─────────────────

/** @internal Exported for reference generator. */
export const DIRECTIONAL_GATES: Record<string, DirectionalGateConfig[]> = {
  XS04: [
    {
      term: "RETIC", expectedDirection: "down", action: "reject",
      overrideCondition: "MI_MARROW_HYPOCELLULARITY",
    },
  ],
  XS05: [
    { term: "SPLEEN_WT", expectedDirection: "up", action: "weak_against", domain: "OM" },
  ],
  XS07: [
    { term: "LYMPH", expectedDirection: "down", action: "strong_against" },
  ],
  XS08: [
    { term: "LYMPH", expectedDirection: "down", action: "weak_against" },
    { term: "ADRENAL_WT", expectedDirection: "up", action: "weak_against", domain: "OM" },
    { term: "THYMUS_WT", expectedDirection: "down", action: "weak_against", domain: "OM" },
  ],
  XS09: [
    { term: "OM_WT", expectedDirection: "down", action: "weak_against", domain: "OM" },
  ],
};

// ─── REM-27: Magnitude floors per endpoint class ──────────

/**
 * Endpoint class floor definitions. Test codes map to exactly one class.
 * v0.2.0: Split hematology into 5 subclasses, literature-backed thresholds.
 * Source: magnitude-floors-config.json + magnitude-floors-research-summary.md
 */
/** @internal Exported for reference generator. */
export const ENDPOINT_CLASS_FLOORS: { class: string; floor: MagnitudeFloor; testCodes: string[] }[] = [
  // Hematology — erythroid (de Kort & Weber 2020: ≤10% = no histopath effect)
  { class: "hematology_erythroid",      floor: { minG: 0.8, minFcDelta: 0.10 }, testCodes: ["RBC", "HGB", "HB", "HCT"] },
  // Hematology — primary leukocytes (moderate CV ~15-25%)
  { class: "hematology_leukocyte",      floor: { minG: 0.8, minFcDelta: 0.15 }, testCodes: ["WBC", "NEUT", "ANC", "LYMPH", "LYM"] },
  // Hematology — rare leukocytes (high variance; concordance checked separately)
  { class: "hematology_leukocyte_rare", floor: { minG: 0.8, minFcDelta: 0.30 }, testCodes: ["MONO", "EOS", "BASO"] },
  // RBC indices (very tight CVs 2-4%; higher g threshold compensates)
  { class: "hematology_indices",        floor: { minG: 1.0, minFcDelta: 0.05 }, testCodes: ["MCV", "MCH", "MCHC", "RDW"] },
  // Platelets
  { class: "platelets",                 floor: { minG: 0.8, minFcDelta: 0.15 }, testCodes: ["PLAT", "PLT"] },
  // Reticulocytes (base floor; conditional override in checkMagnitudeFloor)
  { class: "reticulocytes",             floor: { minG: 0.8, minFcDelta: 0.25 }, testCodes: ["RETIC", "RET", "RETI"] },
  // Coagulation (moderate variability; preanalytical factors)
  { class: "coagulation",              floor: { minG: 0.8, minFcDelta: 0.15 }, testCodes: ["PT", "APTT", "INR", "FIB", "FIBRINO"] },
  // Liver enzymes (high inter-animal variability; 1.5x = screening threshold)
  { class: "liver_enzymes",             floor: { minG: 0.5, minFcDelta: 0.50 }, testCodes: ["ALT", "ALAT", "AST", "ASAT", "ALP", "ALKP", "GGT", "SDH", "GLDH", "GDH", "5NT", "LDH"] },
  // Renal markers
  { class: "renal_markers",             floor: { minG: 0.5, minFcDelta: 0.20 }, testCodes: ["BUN", "UREA", "UREAN", "CREAT", "CREA"] },
  // Clinical chemistry general
  { class: "clinical_chemistry",        floor: { minG: 0.5, minFcDelta: 0.25 }, testCodes: ["GLUC", "CHOL", "BILI", "TBILI", "TRIG", "ALB", "GLOBUL", "PROT", "ALBGLOB", "TP"] },
  // Electrolytes (homeostatically regulated, tight CVs)
  { class: "electrolytes",              floor: { minG: 0.8, minFcDelta: 0.10 }, testCodes: ["SODIUM", "NA", "K", "CA", "PHOS", "CL", "MG"] },
  // Body weight
  { class: "body_weight",               floor: { minG: 0.5, minFcDelta: 0.05 }, testCodes: ["BW", "BWGAIN"] },
  // Food consumption (own class — do NOT proxy with BW)
  { class: "food_consumption",          floor: { minG: 0.5, minFcDelta: 0.10 }, testCodes: ["FOOD", "FC"] },
];
