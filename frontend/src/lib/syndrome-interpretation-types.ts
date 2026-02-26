/**
 * Syndrome Interpretation Types — shared types, interfaces, and constants
 * extracted from syndrome-interpretation.ts for module splitting.
 */

import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome, EndpointMatch } from "@/lib/cross-domain-syndromes";
import type { LesionSeverityRow } from "@/types/analysis-views";
import type { StudyContext } from "@/types/study-context";
import type { StudyMortality } from "@/types/mortality";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";

// ─── Exported threshold constants (single source of truth) ─────────
// Used by the code logic AND by the packet generator for documentation.

/** Translational tier LR+ bin thresholds */
export const TRANSLATIONAL_BINS = {
  endpoint: { high: 10, moderate: 3 },
  soc: { high: 5, moderate: 2 },
} as const;

/** Statistical significance thresholds for treatment-relatedness A-6 factor */
export const STAT_SIG_THRESHOLDS = {
  significant: 0.05,
  borderline: 0.1,
} as const;

/** Dose-response A-1 factor thresholds */
export const DOSE_RESPONSE_THRESHOLDS = {
  /** p-value for borderline significance in strong pattern path */
  strongPatternP: 0.1,
  /** p-value for highly significant pairwise alternative path */
  pairwiseHighP: 0.01,
  /** minimum |effect size| for pairwise alternative path */
  pairwiseMinEffect: 0.8,
  /** Patterns considered "strong" */
  strongPatterns: ["linear", "monotonic", "threshold", "threshold_increase", "threshold_decrease"],
} as const;

// ─── Output types ──────────────────────────────────────────

export type SyndromeCertainty =
  | "mechanism_confirmed"
  | "mechanism_uncertain"
  | "pattern_only";

export type EnzymeTier = "watchlist" | "concern" | "high";

export interface UpgradeEvidenceItem {
  id: string;
  label: string;
  strength: "strong" | "moderate";
  score: number;
  met: boolean;
  detail: string;
}

export interface UpgradeEvidenceResult {
  items: UpgradeEvidenceItem[];
  totalScore: number;
  levelsLifted: number;
  tier: EnzymeTier;
  cappedCertainty: SyndromeCertainty;
  finalCertainty: SyndromeCertainty;
}

export type OverallSeverity =
  | "S0_Death"
  | "carcinogenic"
  | "proliferative"
  | "S4_Critical"
  | "S3_Adverse"
  | "S2_Concern"
  | "S1_Monitor";

export interface DiscriminatingFinding {
  endpoint: string;
  description: string;
  expectedDirection: "up" | "down";
  actualDirection: "up" | "down" | null;
  status: "supports" | "argues_against" | "not_available";
  weight: "strong" | "moderate";
  source: "LB" | "MI" | "MA" | "OM" | "EG" | "VS";
}

export interface HistopathCrossRef {
  specimen: string;
  examined: boolean;
  expectedFindings: string[];
  observedFindings: HistopathObservation[];
  assessment: "supports" | "argues_against" | "inconclusive" | "not_examined";
}

export interface HistopathObservation {
  finding: string;
  peakSeverity: number;
  peakIncidence: number;
  doseResponse: string;
  relevance: "expected" | "unexpected" | "neutral";
  proxy?: {
    implies: string;
    relationship: string;
    confidence: "strong" | "suggestive";
  };
}

export interface SyndromeRecoveryAssessment {
  status: "recovered" | "partial" | "not_recovered" | "not_examined" | "mixed";
  endpoints: EndpointRecovery[];
  summary: string;
}

export interface EndpointRecovery {
  label: string;
  canonical: string;
  sex: string;
  terminalEffect: number;
  recoveryEffect: number | null;
  recoveryPValue: number | null;
  status: "recovered" | "partial" | "not_recovered" | "not_examined";
  recoveryDay: number | null;
}

export interface ClinicalObservationSupport {
  correlatingObservations: {
    observation: string;
    tier: 1 | 2 | 3;
    expectedForSyndrome: boolean;
    incidenceDoseDependent: boolean;
  }[];
  assessment: "strengthens" | "weakens" | "neutral" | "no_cl_data";
}

// ─── Phase B stub types (10-arg signature) ─────────────────

export interface RecoveryRow {
  endpoint_label: string;
  sex: string;
  recovery_day: number;
  dose_level: number;
  mean: number;
  sd: number;
  p_value: number | null;
  effect_size: number | null;
  terminal_effect: number | null;
}

export interface OrganWeightRow {
  specimen: string;
  dose_level: number;
  sex: string;
  mean: number;
  p_value: number | null;
}

export interface TumorFinding {
  organ: string;
  morphology: string;
  behavior: "BENIGN" | "MALIGNANT";
  animalId: string;
  doseGroup: number;
}

export interface AnimalDisposition {
  animalId: string;
  doseGroup: number;
  sex: string;
  dispositionCode: string;
  dispositionDay: number;
  treatmentRelated: boolean;
  causeOfDeath?: string;
  excludeFromTerminalStats: boolean;
  isRecoveryArm?: boolean;
  doseLabel?: string;
}

/** Backend-aligned food consumption summary response. */
export interface FoodConsumptionSummaryResponse {
  available: boolean;
  study_route?: string | null;
  caloric_dilution_risk?: boolean;
  has_water_data?: boolean;
  periods?: {
    start_day: number;
    end_day: number;
    days: number;
    epoch?: string;
    label?: string;
    by_dose_sex: {
      dose_level: number;
      sex: string;
      n: number;
      mean_fw: number;
      mean_bw_gain: number;
      mean_food_efficiency: number;
      food_efficiency_sd: number | null;
      food_efficiency_control: number | null;
      food_efficiency_reduced: boolean | null;
      fe_p_value: number | null;
      fe_cohens_d: number | null;
      fw_pct_change: number | null;
      bw_pct_change: number | null;
    }[];
  }[];
  overall_assessment?: {
    bw_decreased: boolean;
    fw_decreased: boolean;
    fe_reduced: boolean;
    assessment: string;
    temporal_onset: string;
    narrative: string;
  };
  water_consumption: null;
  recovery?: {
    available: boolean;
    fw_recovered: boolean;
    bw_recovered: boolean;
    interpretation: string;
  } | null;
}

export interface ClinicalObservation {
  observation: string;
  doseGroup: number;
  sex: string;
  incidence: number;
  totalN: number;
}

// StudyContext canonical definition lives in @/types/study-context
export type { StudyContext };

// Phase B output stubs
export interface MortalityContext {
  deathsInSyndromeOrgans: number;
  treatmentRelatedDeaths: number;
  doseRelatedMortality: boolean;
  mortalityNarrative: string;
  mortalityNoaelCap: number | null;
  /** true = deaths match syndrome organs, false = unrelated, null = cannot determine automatically */
  mortalityNoaelCapRelevant: boolean | null;
  deathDetails: {
    animalId: string;
    doseGroup: number;
    dispositionCode: string;
    dispositionDay: number;
    causeOfDeath?: string;
    doseLabel?: string;
  }[];
}

export interface HumanNonRelevance {
  mechanism: string;
  applies: boolean;
  rationale: string;
}

export interface TumorContext {
  tumorsPresent: boolean;
  tumorSummaries: { organ: string; morphology: string; count: number }[];
  progressionDetected: boolean;
  progressionSequence?: {
    stages: string[];
    stagesPresent: string[];
    complete: boolean;
  };
  strainContext?: {
    strain: string;
    studyDuration: number;
    expectedBackground: "expected" | "unusual" | "very_rare";
  };
  humanNonRelevance?: HumanNonRelevance[];
  interpretation: string;
}

export interface FoodConsumptionContext {
  available: boolean;
  bwFwAssessment: "primary_weight_loss" | "secondary_to_food" | "malabsorption" | "not_applicable";
  foodEfficiencyReduced: boolean | null;
  temporalOnset: "bw_first" | "fw_first" | "simultaneous" | "unknown" | null;
  fwNarrative: string;
}

export interface TreatmentRelatednessScore {
  doseResponse: "strong" | "weak" | "absent";
  crossEndpoint: "concordant" | "isolated";
  hcdComparison: "outside_range" | "within_range" | "no_hcd";
  statisticalSignificance: "significant" | "borderline" | "not_significant";
  clinicalObservationSupport: boolean;
  overall: "treatment_related" | "possibly_related" | "not_related";
  /** REM-17: Factor-by-factor reasoning trace for transparency. */
  reasoning: TRReasoningFactor[];
}

export interface TRReasoningFactor {
  factor: string;       // e.g. "A-1 Dose-response"
  value: string;        // e.g. "strong"
  score: number;        // numeric contribution to total
  detail: string;       // human-readable explanation
}

export interface AdversityAssessment {
  adaptive: boolean;
  /** REM-10: true when all syndrome evidence overlaps with stress endpoints (XS08) */
  stressConfound: boolean;
  reversible: boolean | null;
  magnitudeLevel: "minimal" | "mild" | "moderate" | "marked" | "severe";
  crossDomainSupport: boolean;
  precursorToWorse: boolean;
  secondaryToOther: boolean;
  /** BW confounding secondary assessment (tier >= 3 in Phase 1) */
  secondaryToBW: { isSecondary: boolean; confidence: string; bwG: number } | null;
  overall: "adverse" | "non_adverse" | "equivocal";
}

// ─── Translational confidence types ───────────────────────

export interface TranslationalConfidence {
  tier: "high" | "moderate" | "low" | "insufficient_data";
  species: string;
  primarySOC: string;
  socLRPlus: number | null;
  endpointLRPlus: { endpoint: string; lrPlus: number; species: string }[];
  absenceCaveat: string | null;
  summary: string;
  dataVersion: string;
}

// ─── Full interpretation output ────────────────────────────

export interface SyndromeInterpretation {
  syndromeId: string;

  // Component 1: Certainty
  certainty: SyndromeCertainty;
  certaintyRationale: string;
  discriminatingEvidence: DiscriminatingFinding[];

  // Component 2: Histopath
  histopathContext: HistopathCrossRef[];

  // Component 3: Recovery
  recovery: SyndromeRecoveryAssessment;

  // Phase C: CL
  clinicalObservationSupport: ClinicalObservationSupport;

  // Phase B: Multi-domain context
  mortalityContext: MortalityContext;
  tumorContext: TumorContext;
  foodConsumptionContext: FoodConsumptionContext;
  studyDesignNotes: string[];
  treatmentRelatedness: TreatmentRelatednessScore;
  adversity: AdversityAssessment;

  // Dual badges
  patternConfidence: "HIGH" | "MODERATE" | "LOW";
  mechanismCertainty: SyndromeCertainty;

  // Severity
  overallSeverity: OverallSeverity;

  /** REM-21: Max histopathologic severity grade from MI data (pathologist's grading),
   *  separate from the regulatory severity tier (S0-S4) and statistical magnitude. */
  histopathSeverityGrade: "none" | "minimal" | "mild" | "moderate" | "marked" | "severe" | null;

  // Translational confidence
  translationalConfidence: TranslationalConfidence;

  /** REM-11: Species-specific preferred marker annotations */
  speciesMarkers: {
    present: string[];
    absent: string[];
    narrative: string | null;
    certaintyBoost: boolean;
  };

  /** v0.3.0 PATCH-04: Upgrade evidence evaluation for liver enzyme tier cap */
  upgradeEvidence?: UpgradeEvidenceResult | null;

  /** Assembled narrative */
  narrative: string;
}

// ─── Discriminator definitions ─────────────────────────────

export interface SyndromeDiscriminators {
  syndromeId: string;
  differential: string;
  findings: {
    endpoint: string;
    expectedDirection: "up" | "down";
    source: "LB" | "MI" | "MA" | "OM" | "EG" | "VS";
    weight: "strong" | "moderate";
    rationale: string;
    absenceMeaningful?: boolean;
  }[];
}

const XS01_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS01",
  differential: "XS02 (Cholestatic injury)",
  findings: [
    {
      endpoint: "ALP",
      expectedDirection: "down",
      source: "LB",
      weight: "strong",
      rationale: "ALP within normal limits supports pure hepatocellular injury. ALP elevation indicates cholestatic component.",
      absenceMeaningful: true,
    },
    {
      endpoint: "GGT",
      expectedDirection: "down",
      source: "LB",
      weight: "moderate",
      rationale: "GGT within normal limits supports hepatocellular. GGT elevation is a sensitive cholestatic marker.",
      absenceMeaningful: true,
    },
    {
      endpoint: "LIVER::NECROSIS",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Hepatocyte necrosis confirms cellular injury consistent with hepatocellular pattern.",
    },
    {
      endpoint: "LIVER::BILE DUCT HYPERPLASIA",
      expectedDirection: "down",
      source: "MI",
      weight: "strong",
      rationale: "Absence of bile duct changes supports pure hepatocellular. Bile duct hyperplasia indicates cholestatic component.",
    },
  ],
};

const XS02_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS02",
  differential: "XS01 (Hepatocellular injury)",
  findings: [
    {
      endpoint: "ALP",
      expectedDirection: "up",
      source: "LB",
      weight: "strong",
      rationale: "ALP elevation is the primary cholestatic marker.",
      absenceMeaningful: true,
    },
    {
      endpoint: "GGT",
      expectedDirection: "up",
      source: "LB",
      weight: "strong",
      rationale: "GGT elevation confirms biliary involvement.",
      absenceMeaningful: true,
    },
    {
      endpoint: "LIVER::BILE DUCT HYPERPLASIA",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Bile duct hyperplasia is the histopathologic hallmark of cholestasis.",
    },
    {
      endpoint: "LIVER::NECROSIS",
      expectedDirection: "down",
      source: "MI",
      weight: "moderate",
      rationale: "Absence of significant hepatocyte necrosis supports pure cholestatic pattern.",
    },
    {
      endpoint: "TBILI",
      expectedDirection: "up",
      source: "LB",
      weight: "moderate",
      rationale: "Elevated bilirubin (especially conjugated fraction) supports cholestasis.",
    },
  ],
};

// XS03 = Nephrotoxicity (spec calls it XS09 but code uses XS03)
const XS03_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS03",
  differential: "pre-renal azotemia",
  findings: [
    {
      endpoint: "KIDNEY::TUBULAR DEGENERATION",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Tubular degeneration/necrosis confirms intrinsic renal injury.",
    },
    {
      endpoint: "KIDNEY::CAST",
      expectedDirection: "up",
      source: "MI",
      weight: "moderate",
      rationale: "Tubular casts indicate active tubular damage and protein leakage.",
    },
    {
      endpoint: "KIDNEY_WT",
      expectedDirection: "up",
      source: "OM",
      weight: "moderate",
      rationale: "Increased kidney weight suggests inflammation or compensatory hypertrophy.",
    },
    {
      endpoint: "URINE_SG",
      expectedDirection: "down",
      source: "LB",
      weight: "moderate",
      rationale: "Decreased urine specific gravity indicates loss of concentrating ability — tubular dysfunction.",
    },
  ],
};

const XS04_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS04",
  differential: "XS05 (Hemolytic anemia)",
  findings: [
    {
      endpoint: "RETIC",
      expectedDirection: "down",
      source: "LB",
      weight: "strong",
      rationale: "Reticulocyte decrease indicates marrow failure to compensate. Increase indicates peripheral destruction with compensatory erythropoiesis.",
    },
    {
      endpoint: "BONE MARROW::HYPOCELLULARITY",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Hypocellular marrow confirms production failure. Hypercellular marrow argues against (compensatory response).",
    },
    {
      endpoint: "SPLEEN_WT",
      expectedDirection: "down",
      source: "OM",
      weight: "moderate",
      rationale: "Decreased spleen weight is consistent with reduced hematopoiesis. Increased spleen weight suggests extramedullary hematopoiesis or sequestration.",
    },
    {
      endpoint: "SPLEEN::EXTRAMEDULLARY HEMATOPOIESIS",
      expectedDirection: "down",
      source: "MI",
      weight: "moderate",
      rationale: "Absence of extramedullary hematopoiesis supports marrow failure. Presence supports peripheral destruction with compensatory production.",
    },
  ],
};

const XS05_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS05",
  differential: "XS04 (Myelosuppression)",
  findings: [
    {
      endpoint: "RETIC",
      expectedDirection: "up",
      source: "LB",
      weight: "strong",
      rationale: "Reticulocyte increase confirms compensatory erythropoiesis in response to peripheral red cell destruction.",
    },
    {
      endpoint: "BONE MARROW::HYPERCELLULARITY",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Hypercellular marrow confirms compensatory expansion. Erythroid hyperplasia specifically points to hemolytic response.",
    },
    {
      endpoint: "SPLEEN_WT",
      expectedDirection: "up",
      source: "OM",
      weight: "moderate",
      rationale: "Splenomegaly suggests splenic sequestration or extramedullary hematopoiesis — both support hemolytic process.",
    },
    {
      endpoint: "SPLEEN::PIGMENTATION",
      expectedDirection: "up",
      source: "MI",
      weight: "moderate",
      rationale: "Splenic pigmentation (hemosiderin) indicates iron deposition from destroyed red cells.",
    },
    {
      endpoint: "TBILI",
      expectedDirection: "up",
      source: "LB",
      weight: "moderate",
      rationale: "Elevated bilirubin from hemoglobin catabolism. Unconjugated fraction specifically indicates hemolysis.",
    },
  ],
};

const XS06_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS06",
  differential: "simple lipidosis",
  findings: [
    {
      endpoint: "PHOSPHOLIPID",
      expectedDirection: "up",
      source: "LB",
      weight: "strong",
      rationale: "Elevated serum phospholipids are the biochemical hallmark.",
    },
    {
      endpoint: "::LAMELLAR BODIES",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Lamellar bodies on electron microscopy are pathognomonic. Standard light microscopy shows foamy macrophages.",
    },
  ],
};

// XS08 = Stress response (spec calls it XS07 but code uses XS08)
const XS08_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS08",
  differential: "direct adrenal toxicity",
  findings: [
    {
      endpoint: "GLAND, ADRENAL::HYPERTROPHY",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Adrenal cortical hypertrophy is the classic stress response finding. Adrenal necrosis or atrophy would suggest direct toxicity instead.",
    },
    {
      endpoint: "THYMUS_WT",
      expectedDirection: "down",
      source: "OM",
      weight: "moderate",
      rationale: "Thymic involution (weight decrease) is a sensitive stress marker. Supports HPA axis activation rather than direct immune toxicity.",
    },
  ],
};

const XS10_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS10",
  differential: "functional (rate change) vs structural cardiovascular toxicity",
  findings: [
    {
      endpoint: "QTCBAG",
      expectedDirection: "up",
      source: "EG",
      weight: "strong",
      rationale: "QTc prolongation indicates repolarization delay — a direct proarrhythmic risk independent of rate changes.",
    },
    {
      endpoint: "HEART::CARDIOMYOPATHY",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Cardiomyopathy confirms structural myocardial damage beyond functional rate changes.",
    },
    {
      endpoint: "HEART_WT",
      expectedDirection: "up",
      source: "OM",
      weight: "moderate",
      rationale: "Increased heart weight suggests cardiac hypertrophy — a structural adaptation or pathological response.",
    },
    {
      endpoint: "CTNI",
      expectedDirection: "up",
      source: "LB",
      weight: "strong",
      rationale: "Elevated cardiac troponin confirms active myocardial injury. Absence supports functional change without structural damage.",
      absenceMeaningful: true,
    },
  ],
};

/** @internal Exported for reference generator. */
export const DISCRIMINATOR_REGISTRY: Record<string, SyndromeDiscriminators> = {
  XS01: XS01_DISCRIMINATORS,
  XS02: XS02_DISCRIMINATORS,
  XS03: XS03_DISCRIMINATORS,
  XS04: XS04_DISCRIMINATORS,
  XS05: XS05_DISCRIMINATORS,
  XS06: XS06_DISCRIMINATORS,
  XS08: XS08_DISCRIMINATORS,
  XS10: XS10_DISCRIMINATORS,
};

// ─── CL clinical observation correlates (Phase C) ──────────

/** @internal Exported for reference generator. */
export const SYNDROME_CL_CORRELATES: Record<string, {
  expectedObservations: string[];
  tier: (1 | 2 | 3)[];
}> = {
  XS01: {
    expectedObservations: ["JAUNDICE", "DARK URINE"],
    tier: [2, 3],
  },
  XS04: {
    expectedObservations: ["PALLOR", "PETECHIAE"],
    tier: [2, 3],
  },
  XS05: {
    expectedObservations: ["PALLOR", "DARK URINE"],
    tier: [2, 3],
  },
  XS08: { // @species SPECIES-01 — chromodacryorrhea is rat-specific (Harderian gland porphyrin secretion)
    expectedObservations: ["PILOERECTION", "DECREASED ACTIVITY", "CHROMODACRYORRHEA"],
    tier: [3, 3, 2],
  },
  XS03: {
    expectedObservations: ["POLYURIA", "POLYDIPSIA"],
    tier: [3, 3],
  },
  XS09: {
    expectedObservations: ["EMACIATION", "THIN", "DECREASED ACTIVITY", "HUNCHED POSTURE"],
    tier: [2, 3, 3, 3],
  },
  XS10: {
    expectedObservations: ["BRADYCARDIA", "TACHYCARDIA", "ARRHYTHMIA", "DYSPNEA"],
    tier: [2, 2, 2, 3],
  },
};

// ─── Histopath proxy dictionaries ──────────────────────────

export const HISTOPATH_PROXIES: {
  pattern: RegExp;
  implies: string;
  relationship: string;
  confidence: "strong" | "suggestive";
}[] = [
  {
    pattern: /fat\s+vacuole/i,
    implies: "CELLULARITY_CHANGE",
    relationship: "Decreased fat vacuoles \u2192 reduced adipocyte space \u2192 suggests increased cellularity. Increased fat vacuoles \u2192 suggests decreased cellularity.",
    confidence: "suggestive",
  },
  {
    pattern: /hypocellul/i,
    implies: "HYPOCELLULARITY",
    relationship: "Direct observation of decreased cellularity.",
    confidence: "strong",
  },
  {
    pattern: /hypercellul/i,
    implies: "HYPERCELLULARITY",
    relationship: "Direct observation of increased cellularity.",
    confidence: "strong",
  },
  {
    pattern: /extramedullary\s+hematopoiesis|emh/i,
    implies: "EXTRAMEDULLARY_HEMATOPOIESIS",
    relationship: "Direct observation of blood cell production outside marrow.",
    confidence: "strong",
  },
  {
    pattern: /pigment/i,
    implies: "HEMOSIDERIN_DEPOSITION",
    relationship: "Pigmentation in spleen/liver often represents hemosiderin from red cell breakdown.",
    confidence: "suggestive",
  },
  {
    pattern: /congestion/i,
    implies: "VASCULAR_CONGESTION",
    relationship: "Splenic congestion may indicate sequestration of blood cells.",
    confidence: "suggestive",
  },
  {
    pattern: /bile\s+duct\s+(hyperplasia|proliferation)/i,
    implies: "CHOLESTATIC_RESPONSE",
    relationship: "Bile duct changes indicate cholestatic injury pattern.",
    confidence: "strong",
  },
  {
    pattern: /cholestasis|bile\s+stasis/i,
    implies: "CHOLESTATIC_RESPONSE",
    relationship: "Direct observation of impaired bile flow.",
    confidence: "strong",
  },
  {
    pattern: /oval\s+cell|ductular\s+reaction/i,
    implies: "CHOLESTATIC_RESPONSE",
    relationship: "Oval cell proliferation / ductular reaction associated with cholestatic injury.",
    confidence: "suggestive",
  },
];

// ─── Canonical synonym resolution ────────────────────────────

/**
 * Maps discriminator endpoint short-names to known test codes and label patterns.
 * Mirrors the testCodes/canonicalLabels in cross-domain-syndromes.ts so the
 * discriminator evaluation can find endpoints regardless of how a study codes them.
 */
export const CANONICAL_SYNONYMS: Record<string, {
  testCodes: string[];
  labelPatterns: string[];
}> = {
  RETIC:        { testCodes: ["RETIC", "RET"],           labelPatterns: ["RETICULOCYTE"] },
  ALP:          { testCodes: ["ALP", "ALKP"],            labelPatterns: ["ALKALINE PHOSPHATASE"] },
  GGT:          { testCodes: ["GGT"],                    labelPatterns: ["GAMMA GLUTAMYL", "GAMMA-GLUTAMYL"] },
  TBILI:        { testCodes: ["TBILI", "BILI", "BILIR"], labelPatterns: ["BILIRUBIN"] },
  PHOSPHOLIPID: { testCodes: ["PHOSPHOLIPID", "PL"],     labelPatterns: ["PHOSPHOLIPID"] },
  URINE_SG:     { testCodes: ["SPGRAV", "SG", "UOSMO"], labelPatterns: ["SPECIFIC GRAVITY", "URINE OSMOLALITY"] },
};

// ─── SOC mapping ───────────────────────────────────────────

/** Maps syndrome ID → primary SOC for concordance lookup. */
export const SYNDROME_SOC_MAP: Record<string, string> = {
  XS01: "hepatobiliary disorders",
  XS02: "hepatobiliary disorders",
  XS03: "renal and urinary disorders",
  XS04: "blood and lymphatic system disorders",
  XS05: "blood and lymphatic system disorders",
  XS07: "immune system disorders",
  XS09: "metabolism and nutrition disorders",
  XS10: "cardiac disorders",
};

// ─── Re-exported external types used by consumers ──────────
// These are imported as type-only and re-exported for convenience
// so consumers can import from this single types module.

export type { EndpointSummary, CrossDomainSyndrome, EndpointMatch, LesionSeverityRow, StudyMortality, NormalizationContext };
