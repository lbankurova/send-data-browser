/**
 * Syndrome Interpretation Layer — post-processing on top of CrossDomainSyndrome.
 * Does NOT modify detection logic. Enriches detected syndromes with:
 *   Phase A: certainty grading, histopath cross-reference, recovery assessment
 *   Phase C: clinical observation (CL) correlation
 *   Phase B: mortality, tumor, food consumption, study design, ECETOC treatment-relatedness + adversity
 *
 * Approved deviations from syndrome-interpretation-layer-spec.md:
 *
 *   Gap 1  assessCertainty: strong support + moderate-only against → mechanism_confirmed.
 *          Spec returns uncertain. Rationale: weight asymmetry — a strong reticulocyte
 *          increase is definitive, a moderate spleen weight change is softer. XS04 is
 *          unaffected (RETIC is strong against, hits the strongAgainst gate first).
 *
 *   Gap 2  evaluateDiscriminator: absenceMeaningful is direction-aware.
 *          expectedDirection="down" + not significant → supports (expected absence confirmed).
 *          Spec unconditionally returns argues_against. Fixes XS01 ALP/GGT logic.
 *
 *   Gap 3  evaluateDiscriminator: histopath path uses proxy matching before returning
 *          argues_against. Spec falls through directly. Enhancement.
 *
 *   Gap 4  DiscriminatingFinding.source now includes "EG" | "VS" (XS10 cardiovascular).
 *          Spec had same union; code previously included "EG" speculatively. Removed.
 *
 *   Gap 15 XS01 test expects mechanism_uncertain. Spec expected mechanism_confirmed.
 *          ALP is genuinely significant+up in PointCross → strong argues_against.
 *
 *   Gap 18 resolveCanonical() not implemented. findByCanonical uses CANONICAL_SYNONYMS
 *          map (test codes + label patterns) instead. Covers multi-study variation.
 *
 *   Comp 7 ecgInterpretation restored — XS10 cardiovascular syndrome now in detection engine.
 *          recoveryDuration → recoveryPeriodDays (self-documenting unit).
 *          matchedTerms → matchedEndpoints (richer: dose-response, stats, sex breakdowns).
 *
 *   Step 14 ECETOC A-factors: hcdComparison always "no_hcd" (no historical control database).
 *          Overall uses weighted factor scoring (strong DR=2, concordant=1, significant=1, CL=1).
 *
 *   Step 15 ECETOC B-factors: adaptive always false (no adaptive classification in syndrome
 *          definitions). magnitudeLevel uses Cohen's d thresholds (0.5/1.0/1.5/2.0).
 *          precursorToWorse and secondaryToOther wired to tumorContext and foodConsumptionContext.
 */

import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import { getSyndromeDefinition } from "@/lib/cross-domain-syndromes";
import type { LesionSeverityRow } from "@/types/analysis-views";
import type { StudyContext } from "@/types/study-context";
import type { StudyMortality } from "@/types/mortality";
import meddraMapping from "@/data/send-to-meddra-v3.json";

// ─── Output types ──────────────────────────────────────────

export type SyndromeCertainty =
  | "mechanism_confirmed"
  | "mechanism_uncertain"
  | "pattern_only";

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
  deathDetails: {
    animalId: string;
    doseGroup: number;
    dispositionCode: string;
    dispositionDay: number;
    causeOfDeath?: string;
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
}

export interface AdversityAssessment {
  adaptive: boolean;
  reversible: boolean | null;
  magnitudeLevel: "minimal" | "mild" | "moderate" | "marked" | "severe";
  crossDomainSupport: boolean;
  precursorToWorse: boolean;
  secondaryToOther: boolean;
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

  // Translational confidence
  translationalConfidence: TranslationalConfidence;

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

const DISCRIMINATOR_REGISTRY: Record<string, SyndromeDiscriminators> = {
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

const SYNDROME_CL_CORRELATES: Record<string, {
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
  XS08: {
    expectedObservations: ["PILOERECTION", "DECREASED ACTIVITY", "CHROMODACRYORRHEA"],
    tier: [3, 3, 2],
  },
  XS03: {
    expectedObservations: ["POLYURIA", "POLYDIPSIA"],
    tier: [3, 3],
  },
  XS10: {
    expectedObservations: ["BRADYCARDIA", "TACHYCARDIA", "ARRHYTHMIA", "DYSPNEA"],
    tier: [2, 2, 2, 3],
  },
};

// ─── Histopath proxy dictionaries ──────────────────────────

const HISTOPATH_PROXIES: {
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
const CANONICAL_SYNONYMS: Record<string, {
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

// ─── Helper functions ──────────────────────────────────────

/**
 * Find an endpoint by canonical name using synonym-aware matching.
 *
 * Resolution order:
 *   1. Exact test code match against all known synonyms
 *   2. _WT suffix → OM domain specimen match
 *   3. Label pattern match against known synonym labels
 *   4. Bare label substring fallback (last resort)
 */
function findByCanonical(
  endpoints: EndpointSummary[],
  canonical: string,
): EndpointSummary | null {
  const upper = canonical.toUpperCase();
  const synonyms = CANONICAL_SYNONYMS[upper];

  // 1. Test code match — try all synonym codes
  const codesToTry = synonyms ? synonyms.testCodes : [upper];
  for (const code of codesToTry) {
    const match = endpoints.find(
      (e) => e.testCode?.toUpperCase() === code.toUpperCase(),
    );
    if (match) return match;
  }

  // 2. For _WT suffix (organ weights), match OM domain by specimen
  if (upper.endsWith("_WT")) {
    const organ = upper.replace("_WT", "").replace(/_/g, " ");
    return (
      endpoints.find(
        (e) =>
          e.domain.toUpperCase() === "OM" &&
          e.endpoint_label.toUpperCase().includes(organ),
      ) ?? null
    );
  }

  // 3. Label pattern match — try all known label patterns
  if (synonyms) {
    for (const pattern of synonyms.labelPatterns) {
      const match = endpoints.find((e) =>
        e.endpoint_label.toUpperCase().includes(pattern.toUpperCase()),
      );
      if (match) return match;
    }
  }

  // 4. Bare label substring fallback
  const byLabel = endpoints.find((e) =>
    e.endpoint_label.toUpperCase().includes(upper),
  );
  return byLabel ?? null;
}

function annotateWithProxy(observation: HistopathObservation): HistopathObservation {
  for (const proxy of HISTOPATH_PROXIES) {
    if (proxy.pattern.test(observation.finding)) {
      return {
        ...observation,
        proxy: {
          implies: proxy.implies,
          relationship: proxy.relationship,
          confidence: proxy.confidence,
        },
      };
    }
  }
  return observation;
}

/**
 * Check if an expected finding is present, using proxy matching for coding variations.
 */
function checkFindingWithProxies(
  expectedFinding: string,
  observations: HistopathObservation[],
): { found: boolean; direct: boolean; proxyMatch?: HistopathObservation } {
  // Direct match first
  const direct = observations.find((o) =>
    o.finding.toUpperCase().includes(expectedFinding.toUpperCase()),
  );
  if (direct) return { found: true, direct: true };

  // Proxy match
  for (const obs of observations) {
    if (!obs.proxy) continue;

    if (
      expectedFinding.toUpperCase().includes("HYPOCELLUL") &&
      obs.proxy.implies === "CELLULARITY_CHANGE" &&
      obs.doseResponse.includes("increase")
    ) {
      return { found: true, direct: false, proxyMatch: obs };
    }
    if (
      expectedFinding.toUpperCase().includes("HYPOCELLUL") &&
      obs.proxy.implies === "CELLULARITY_CHANGE" &&
      obs.doseResponse.includes("decrease")
    ) {
      return { found: false, direct: false, proxyMatch: obs };
    }
    if (
      expectedFinding.toUpperCase().includes("HYPERCELLUL") &&
      obs.proxy.implies === "CELLULARITY_CHANGE" &&
      obs.doseResponse.includes("decrease")
    ) {
      return { found: true, direct: false, proxyMatch: obs };
    }
  }

  return { found: false, direct: false };
}

/**
 * Classify finding dose-response from lesion severity rows.
 */
function classifyFindingDoseResponse(rows: LesionSeverityRow[]): string {
  const byDose = new Map<number, number>();
  for (const r of rows) {
    const inc = r.n > 0 ? r.affected / r.n : 0;
    byDose.set(r.dose_level, Math.max(byDose.get(r.dose_level) ?? 0, inc));
  }
  const sorted = [...byDose.entries()].sort((a, b) => a[0] - b[0]);
  if (sorted.length < 2) return "insufficient data";
  const incidences = sorted.map((s) => s[1]);
  const increasing = incidences.every(
    (v, i) => i === 0 || v >= incidences[i - 1] - 0.05,
  );
  const decreasing = incidences.every(
    (v, i) => i === 0 || v <= incidences[i - 1] + 0.05,
  );
  if (increasing) return "dose-dependent increase";
  if (decreasing) return "dose-dependent decrease";
  return "non-monotonic";
}

/**
 * Get expected histopath findings for a specimen from discriminators.
 */
function getExpectedFindings(
  discriminators: SyndromeDiscriminators,
  specimen: string,
): string[] {
  const findings: string[] = [];
  for (const disc of discriminators.findings) {
    if ((disc.source === "MI" || disc.source === "MA") && disc.endpoint.includes("::")) {
      const [spec, finding] = disc.endpoint.split("::");
      if (
        spec.toUpperCase() === specimen.toUpperCase() ||
        specimen.toUpperCase().includes(spec.toUpperCase())
      ) {
        if (disc.expectedDirection === "up") {
          findings.push(finding.trim());
        }
      }
    }
  }
  return findings;
}

/**
 * Get findings that the differential syndrome would expect (opposite expectations).
 */
function getDifferentialExpected(
  discriminators: SyndromeDiscriminators,
  specimen: string,
): string[] {
  const findings: string[] = [];
  for (const disc of discriminators.findings) {
    if ((disc.source === "MI" || disc.source === "MA") && disc.endpoint.includes("::")) {
      const [spec, finding] = disc.endpoint.split("::");
      if (
        spec.toUpperCase() === specimen.toUpperCase() ||
        specimen.toUpperCase().includes(spec.toUpperCase())
      ) {
        // If we expect it DOWN (absent), the differential expects it UP (present)
        if (disc.expectedDirection === "down") {
          findings.push(finding.trim());
        }
      }
    }
  }
  return findings;
}

/**
 * Check if CL observations show dose-dependent incidence.
 */
function isDoseDependentCL(observations: ClinicalObservation[]): boolean {
  if (observations.length < 2) return false;
  const byDose = new Map<number, number>();
  for (const obs of observations) {
    const rate = obs.totalN > 0 ? obs.incidence / obs.totalN : 0;
    byDose.set(obs.doseGroup, Math.max(byDose.get(obs.doseGroup) ?? 0, rate));
  }
  const sorted = [...byDose.entries()].sort((a, b) => a[0] - b[0]);
  if (sorted.length < 2) return false;
  // Simple: higher doses have higher incidence
  return sorted[sorted.length - 1][1] > sorted[0][1];
}

// ─── Component 1: Certainty grading ───────────────────────

/**
 * Evaluate a single discriminating finding against available data.
 */
export function evaluateDiscriminator(
  disc: SyndromeDiscriminators["findings"][0],
  allEndpoints: EndpointSummary[],
  histopathData: LesionSeverityRow[],
): DiscriminatingFinding {
  // Lab/OM endpoint (no "::" in name)
  if (!disc.endpoint.includes("::")) {
    const ep = findByCanonical(allEndpoints, disc.endpoint);
    if (!ep) {
      return {
        endpoint: disc.endpoint,
        description: disc.rationale,
        expectedDirection: disc.expectedDirection,
        actualDirection: null,
        status: "not_available",
        weight: disc.weight,
        source: disc.source,
      };
    }

    const actualDir: "up" | "down" | null =
      ep.direction === "up" || ep.direction === "down" ? ep.direction : null;
    const significant = ep.minPValue != null && ep.minPValue < 0.05;
    if (!significant) {
      if (disc.absenceMeaningful && ep.minPValue != null) {
        // Direction-aware absence logic:
        // expectedDirection="down" + not significant → supports (expected absence confirmed)
        // expectedDirection="up" + not significant → argues_against (expected to see it, didn't)
        return {
          endpoint: disc.endpoint,
          description: disc.rationale,
          expectedDirection: disc.expectedDirection,
          actualDirection: actualDir,
          status: disc.expectedDirection === "down" ? "supports" : "argues_against",
          weight: "moderate",
          source: disc.source,
        };
      }
      return {
        endpoint: disc.endpoint,
        description: disc.rationale,
        expectedDirection: disc.expectedDirection,
        actualDirection: actualDir,
        status: "not_available",
        weight: disc.weight,
        source: disc.source,
      };
    }

    const directionMatches = ep.direction === disc.expectedDirection;
    return {
      endpoint: disc.endpoint,
      description: disc.rationale,
      expectedDirection: disc.expectedDirection,
      actualDirection: actualDir,
      status: directionMatches ? "supports" : "argues_against",
      weight: disc.weight,
      source: disc.source,
    };
  }

  // Histopath finding (SPECIMEN::FINDING)
  const [specimen, finding] = disc.endpoint.split("::");
  const specimenRows = histopathData.filter((r) =>
    r.specimen.toUpperCase().includes(specimen.toUpperCase()),
  );

  if (specimenRows.length === 0) {
    return {
      endpoint: disc.endpoint,
      description: disc.rationale,
      expectedDirection: disc.expectedDirection,
      actualDirection: null,
      status: "not_available",
      weight: disc.weight,
      source: disc.source,
    };
  }

  // Specimen examined — check for finding
  const findingRows = specimenRows.filter((r) =>
    r.finding.toUpperCase().includes(finding.toUpperCase()),
  );

  if (findingRows.length === 0) {
    // No direct finding — try proxy matching before giving up
    const allFindings = [...new Set(specimenRows.map((r) => r.finding))];
    const observations: HistopathObservation[] = allFindings.map((f) => {
      const rows = specimenRows.filter((r) => r.finding === f);
      const maxInc = Math.max(...rows.map((r) => (r.n > 0 ? r.affected / r.n : 0)));
      return annotateWithProxy({
        finding: f,
        peakSeverity: Math.max(...rows.map((r) => r.avg_severity ?? 0)),
        peakIncidence: maxInc,
        doseResponse: classifyFindingDoseResponse(rows),
        relevance: "neutral",
      });
    });

    const proxyResult = checkFindingWithProxies(finding, observations);
    if (proxyResult.found) {
      return {
        endpoint: disc.endpoint,
        description: disc.rationale,
        expectedDirection: disc.expectedDirection,
        actualDirection: disc.expectedDirection === "up" ? "up" : "down",
        status: "supports",
        weight: disc.weight,
        source: disc.source,
      };
    }

    return {
      endpoint: disc.endpoint,
      description: disc.rationale,
      expectedDirection: disc.expectedDirection,
      actualDirection: null,
      status: disc.expectedDirection === "up" ? "argues_against" : "supports",
      weight: disc.weight,
      source: disc.source,
    };
  }

  // Finding observed
  const maxIncidence = Math.max(
    ...findingRows.map((r) => (r.n > 0 ? r.affected / r.n : 0)),
  );
  const isPresent = maxIncidence > 0;

  return {
    endpoint: disc.endpoint,
    description: disc.rationale,
    expectedDirection: disc.expectedDirection,
    actualDirection: isPresent ? "up" : "down",
    status:
      isPresent === (disc.expectedDirection === "up")
        ? "supports"
        : "argues_against",
    weight: disc.weight,
    source: disc.source,
  };
}

/**
 * Assess certainty of a detected syndrome using discriminating evidence.
 */
export function assessCertainty(
  syndrome: CrossDomainSyndrome,
  discriminators: SyndromeDiscriminators,
  allEndpoints: EndpointSummary[],
  histopathData: LesionSeverityRow[],
): {
  certainty: SyndromeCertainty;
  evidence: DiscriminatingFinding[];
  rationale: string;
} {
  const evidence: DiscriminatingFinding[] = [];
  for (const disc of discriminators.findings) {
    evidence.push(evaluateDiscriminator(disc, allEndpoints, histopathData));
  }

  const supporting = evidence.filter((e) => e.status === "supports");
  const against = evidence.filter((e) => e.status === "argues_against");
  const strongSupporting = supporting.filter((e) => e.weight === "strong");
  const strongAgainst = against.filter((e) => e.weight === "strong");
  const available = evidence.filter((e) => e.status !== "not_available");

  // First gate: did the syndrome fire through required path or fallback?
  if (!syndrome.requiredMet) {
    return {
      certainty: "pattern_only",
      evidence,
      rationale:
        "Syndrome detected through supporting evidence only. Required findings not fully met.",
    };
  }

  // Required IS met — assess mechanism certainty from discriminators
  let certainty: SyndromeCertainty;
  let rationale: string;

  if (strongAgainst.length > 0) {
    certainty = "mechanism_uncertain";
    rationale =
      `Required findings met. But ${strongAgainst.map((e) => e.endpoint).join(", ")} ` +
      `argue${strongAgainst.length === 1 ? "s" : ""} against this specific mechanism. ` +
      `Consider differential (${discriminators.differential}).`;
  } else if (strongSupporting.length > 0) {
    if (against.length === 0) {
      certainty = "mechanism_confirmed";
      rationale =
        `Required findings met. ${strongSupporting.map((e) => e.endpoint).join(", ")} ` +
        `confirm${strongSupporting.length === 1 ? "s" : ""} this mechanism. No contradicting evidence.`;
    } else {
      // Only moderate contradictions remain (strong already excluded above).
      // Strong supporting + moderate-only against = confirmed with caveat.
      certainty = "mechanism_confirmed";
      rationale =
        `Required findings met. ${strongSupporting.map((e) => e.endpoint).join(", ")} ` +
        `confirm${strongSupporting.length === 1 ? "s" : ""} this mechanism. ` +
        `Minor contradicting signal from ${against.map((e) => e.endpoint).join(", ")} ` +
        `(moderate weight) does not override strong evidence.`;
    }
  } else if (supporting.length > 0 && against.length === 0) {
    certainty = "mechanism_confirmed";
    rationale =
      `Required findings met. Moderate supporting evidence from ` +
      `${supporting.map((e) => e.endpoint).join(", ")}. No contradicting evidence.`;
  } else if (available.length === 0) {
    certainty = "mechanism_uncertain";
    rationale =
      "Required findings met but no discriminating evidence available. Cannot confirm specific mechanism.";
  } else {
    certainty = "mechanism_uncertain";
    rationale =
      against.length > 0
        ? `Required findings met. But ${against.map((e) => e.endpoint).join(", ")} argue against. ` +
          `Consider differential (${discriminators.differential}).`
        : "Required findings met. Insufficient discriminating evidence to confirm mechanism.";
  }

  return { certainty, evidence, rationale };
}

// ─── Component 2: Histopath cross-reference ────────────────

/**
 * Cross-reference histopath findings for specimens related to a syndrome.
 */
export function crossReferenceHistopath(
  syndrome: CrossDomainSyndrome,
  discriminators: SyndromeDiscriminators,
  histopathData: LesionSeverityRow[],
): HistopathCrossRef[] {
  // Collect specimens from discriminators (MI/MA sources)
  const specimens = new Set<string>();

  for (const disc of discriminators.findings) {
    if (disc.source === "MI" || disc.source === "MA") {
      if (disc.endpoint.includes("::")) {
        const specimen = disc.endpoint.split("::")[0];
        specimens.add(specimen.toUpperCase());
      }
    }
  }

  // Also add specimens from the syndrome's MI/MA matched endpoints
  const synDef = getSyndromeDefinition(syndrome.id);
  if (synDef) {
    for (const term of synDef.terms) {
      if (
        (term.domain === "MI" || term.domain === "MA") &&
        term.specimenTerms
      ) {
        for (const spec of term.specimenTerms.specimen) {
          specimens.add(spec.toUpperCase());
        }
      }
    }
  }

  if (specimens.size === 0) return [];

  const results: HistopathCrossRef[] = [];

  for (const specimen of specimens) {
    const specimenRows = histopathData.filter((r) =>
      r.specimen.toUpperCase().includes(specimen),
    );

    const expectedFindings = getExpectedFindings(discriminators, specimen);

    if (specimenRows.length === 0) {
      results.push({
        specimen,
        examined: false,
        expectedFindings,
        observedFindings: [],
        assessment: "not_examined",
      });
      continue;
    }

    // Catalog all findings for this specimen
    const findingNames = [...new Set(specimenRows.map((r) => r.finding))];
    const differentialExpected = getDifferentialExpected(
      discriminators,
      specimen,
    );

    const observations: HistopathObservation[] = findingNames.map((finding) => {
      const rows = specimenRows.filter((r) => r.finding === finding);
      const maxSev = Math.max(...rows.map((r) => r.avg_severity ?? 0));
      const maxInc = Math.max(
        ...rows.map((r) => (r.n > 0 ? r.affected / r.n : 0)),
      );

      const isExpected = expectedFindings.some((e) =>
        finding.toUpperCase().includes(e.toUpperCase()),
      );
      const isUnexpected = differentialExpected.some((e) =>
        finding.toUpperCase().includes(e.toUpperCase()),
      );

      const obs: HistopathObservation = {
        finding,
        peakSeverity: maxSev,
        peakIncidence: maxInc,
        doseResponse: classifyFindingDoseResponse(rows),
        relevance: isExpected
          ? "expected"
          : isUnexpected
            ? "unexpected"
            : "neutral",
      };

      return annotateWithProxy(obs);
    });

    // Assess: do the histopath findings support this syndrome?
    let directSupport = 0;
    let proxySupport = 0;
    let proxyAgainst = 0;

    for (const ef of expectedFindings) {
      const result = checkFindingWithProxies(ef, observations);
      if (result.found && result.direct) directSupport++;
      else if (result.found && !result.direct) proxySupport++;
      else if (!result.found && result.proxyMatch) proxyAgainst++;
    }

    const unexpectedPresent = observations.filter(
      (o) => o.relevance === "unexpected" && o.peakIncidence > 0,
    );

    let assessment: HistopathCrossRef["assessment"];
    if (
      directSupport + proxySupport > 0 &&
      unexpectedPresent.length === 0 &&
      proxyAgainst === 0
    ) {
      assessment = "supports";
    } else if (unexpectedPresent.length > 0 || proxyAgainst > 0) {
      if (directSupport + proxySupport > 0) {
        assessment = "inconclusive";
      } else {
        assessment = "argues_against";
      }
    } else {
      assessment = "inconclusive";
    }

    results.push({
      specimen,
      examined: true,
      expectedFindings,
      observedFindings: observations,
      assessment,
    });
  }

  return results;
}

// ─── Component 3: Recovery assessment ──────────────────────

/**
 * Assess recovery status for a syndrome's matched endpoints.
 */
export function assessSyndromeRecovery(
  syndrome: CrossDomainSyndrome,
  recoveryData: RecoveryRow[],
  terminalEndpoints: EndpointSummary[],
): SyndromeRecoveryAssessment {
  if (recoveryData.length === 0) {
    return {
      status: "not_examined",
      endpoints: [],
      summary: "Recovery not examined in this study.",
    };
  }

  const endpointRecoveries: EndpointRecovery[] = [];

  for (const ep of syndrome.matchedEndpoints) {
    const terminal = terminalEndpoints.find(
      (e) => e.endpoint_label === ep.endpoint_label,
    );
    if (!terminal) continue;

    const recoveryRows = recoveryData.filter(
      (r) => r.endpoint_label === ep.endpoint_label,
    );

    if (recoveryRows.length === 0) {
      endpointRecoveries.push({
        label: ep.endpoint_label,
        canonical: ep.endpoint_label,
        sex: "Both",
        terminalEffect: terminal.maxEffectSize ?? 0,
        recoveryEffect: null,
        recoveryPValue: null,
        status: "not_examined",
        recoveryDay: null,
      });
      continue;
    }

    // Per-sex recovery assessment
    const sexes = [...new Set(recoveryRows.map((r) => r.sex))];
    for (const sex of sexes) {
      const sexRecoveryRows = recoveryRows.filter((r) => r.sex === sex);
      const highDoseRecovery = sexRecoveryRows.reduce((best, r) =>
        r.dose_level > best.dose_level ? r : best,
      );

      const terminalEffect = terminal.maxEffectSize ?? 0;
      const recoveryEffect = highDoseRecovery.effect_size;
      const recoveryP = highDoseRecovery.p_value;

      let status: EndpointRecovery["status"];
      if (recoveryP == null) {
        status = "not_examined";
      } else if (recoveryP >= 0.05) {
        if (
          recoveryEffect != null &&
          terminalEffect !== 0 &&
          Math.abs(recoveryEffect) > Math.abs(terminalEffect) * 0.33
        ) {
          status = "partial";
        } else {
          status = "recovered";
        }
      } else if (
        recoveryEffect != null &&
        Math.abs(recoveryEffect) < Math.abs(terminalEffect) * 0.5
      ) {
        status = "partial";
      } else {
        status = "not_recovered";
      }

      endpointRecoveries.push({
        label: ep.endpoint_label,
        canonical: ep.endpoint_label,
        sex,
        terminalEffect,
        recoveryEffect,
        recoveryPValue: recoveryP,
        status,
        recoveryDay: highDoseRecovery.recovery_day,
      });
    }
  }

  // Overall syndrome recovery status
  const statuses = endpointRecoveries.map((r) => r.status);
  const uniqueStatuses = new Set(statuses.filter((s) => s !== "not_examined"));

  let overallStatus: SyndromeRecoveryAssessment["status"];
  if (uniqueStatuses.size === 0) {
    overallStatus = "not_examined";
  } else if (uniqueStatuses.size === 1) {
    overallStatus = [...uniqueStatuses][0] as SyndromeRecoveryAssessment["status"];
  } else {
    overallStatus = "mixed";
  }

  const recovered = endpointRecoveries.filter((r) => r.status === "recovered");
  const partial = endpointRecoveries.filter((r) => r.status === "partial");
  const notRecovered = endpointRecoveries.filter(
    (r) => r.status === "not_recovered",
  );

  let summary: string;
  if (overallStatus === "recovered") {
    summary = `All syndrome endpoints recovered by Day ${endpointRecoveries[0]?.recoveryDay}.`;
  } else if (overallStatus === "not_examined") {
    summary = "Recovery not examined in this study.";
  } else if (overallStatus === "not_recovered") {
    summary =
      `Effects persisted at recovery timepoint (Day ${endpointRecoveries[0]?.recoveryDay}). ` +
      `Irreversible or longer recovery period needed.`;
  } else {
    const parts: string[] = [];
    if (recovered.length > 0) {
      parts.push(
        `${recovered.map((r) => r.canonical).join(", ")} recovered`,
      );
    }
    if (partial.length > 0) {
      parts.push(
        `${partial.map((r) => r.canonical).join(", ")} partially recovered`,
      );
    }
    if (notRecovered.length > 0) {
      parts.push(
        `${notRecovered.map((r) => r.canonical).join(", ")} did not recover`,
      );
    }
    summary = parts.join(". ") + ".";
  }

  return { status: overallStatus, endpoints: endpointRecoveries, summary };
}

// ─── Phase C: CL clinical observation support ──────────────

/**
 * Assess whether clinical observations correlate with syndrome expectations.
 */
export function assessClinicalObservationSupport(
  syndromeId: string,
  clinicalObservations: ClinicalObservation[],
): ClinicalObservationSupport {
  const expected = SYNDROME_CL_CORRELATES[syndromeId];
  if (!expected || clinicalObservations.length === 0) {
    return { correlatingObservations: [], assessment: "no_cl_data" };
  }

  const correlating = expected.expectedObservations
    .map((obs, i) => {
      const found = clinicalObservations.filter((c) =>
        c.observation.toUpperCase().includes(obs),
      );
      return {
        observation: obs,
        tier: expected.tier[i],
        expectedForSyndrome: true,
        incidenceDoseDependent: found.length > 0 && isDoseDependentCL(found),
      };
    })
    .filter((c) => c.incidenceDoseDependent);

  return {
    correlatingObservations: correlating,
    assessment: correlating.length >= 1 ? "strengthens" : "neutral",
  };
}

// ─── Component 7: Study design notes ────────────────────────

/**
 * Assemble study-design caveats relevant to a specific syndrome.
 * Rules are species-agnostic; interpretation is species-aware.
 */
export function assembleStudyDesignNotes(
  syndrome: CrossDomainSyndrome,
  studyContext: StudyContext,
): string[] {
  const notes: string[] = [];

  // ECG interpretation caveats — species-aware QTc relevance
  if (syndrome.id === "XS10") {
    const ecg = studyContext.ecgInterpretation;
    if (!ecg.qtcTranslational) {
      notes.push(
        `${studyContext.species || "This species"} has Ito-dominated cardiac repolarization — ` +
        `QTc changes have limited translational value to human arrhythmia risk. ` +
        `Interpret ECG findings as mechanistic signals, not direct safety predictors.`,
      );
    } else {
      if (ecg.preferredCorrection) {
        notes.push(
          `QTc correction: ${ecg.preferredCorrection} formula is preferred for ` +
          `${studyContext.species?.toLowerCase() || "this species"}. ${ecg.rationale}`,
        );
      }
      const species = (studyContext.species ?? "").toUpperCase();
      if (species === "DOG" || species === "BEAGLE") {
        notes.push(
          "Dog ECG: body temperature affects QTc (~14 ms per \u00B0C). " +
          "Verify temperature-corrected intervals if animals were under anesthesia.",
        );
      }
    }
  }

  // ── Strain-specific ──

  // Fischer 344 rats have high background mononuclear cell leukemia
  if (["XS04", "XS05"].includes(syndrome.id)) {
    const strain = studyContext.strain.toUpperCase();
    if (strain.includes("FISCHER") || strain.includes("F344")) {
      notes.push(
        "Fischer 344 rats have high background mononuclear cell leukemia (~38% males). " +
        "Interpret hematology findings in context of strain predisposition.",
      );
    }
  }

  // ── Duration-specific ──

  // Short studies (≤13 weeks): any neoplastic findings in MI domain are very unusual
  const duration = studyContext.dosingDurationWeeks;
  if (duration != null && duration <= 13) {
    const hasMiFindings = syndrome.matchedEndpoints.some(
      (ep) => ep.domain === "MI",
    );
    if (hasMiFindings) {
      // Check if any MI findings look neoplastic (carcinoma, adenoma, tumor, neoplasm)
      const neoTerms = /carcinom|adenom|tumor|neoplas/i;
      const hasNeo = syndrome.matchedEndpoints.some(
        (ep) => ep.domain === "MI" && neoTerms.test(ep.endpoint_label),
      );
      if (hasNeo) {
        notes.push(
          `Neoplastic findings at ${duration} weeks are extremely rare ` +
          `spontaneously in ${studyContext.strain || studyContext.species}. ` +
          `Any tumors are likely treatment-related.`,
        );
      }
    }
  }

  // ── Route-specific ──

  // Oral gavage GI findings may be route-related
  if (studyContext.route?.toUpperCase().includes("GAVAGE")) {
    // XS08 (stress response) may include secondary GI effects
    if (syndrome.id === "XS08") {
      notes.push(
        "Oral gavage route: GI tract findings may include route-related irritation. " +
        "Distinguish local (esophagus, forestomach) from systemic (small intestine, colon) effects.",
      );
    }
  }

  // ── Recovery arm ──

  if (studyContext.recoveryPeriodDays != null && studyContext.recoveryPeriodDays > 0) {
    const weeks = Math.round(studyContext.recoveryPeriodDays / 7);
    notes.push(
      `Recovery period: ${weeks > 0 ? `${weeks} week${weeks !== 1 ? "s" : ""}` : `${studyContext.recoveryPeriodDays} days`}. ` +
      `Reversibility data available — see Recovery section.`,
    );
  }

  return notes;
}

// ─── Phase B: Mortality context ─────────────────────────────

/**
 * Extract target organ terms from a syndrome definition.
 * Uses specimenTerms + organWeightTerms from the syndrome's term definitions.
 * E.g. XS01 → ["LIVER", "HEPAT"] (from MI/MA specimenTerms + OM organWeightTerms).
 */
export function getSyndromeOrgans(syndromeId: string): string[] {
  const def = getSyndromeDefinition(syndromeId);
  if (!def) return [];
  const organs = new Set<string>();
  for (const term of def.terms) {
    if (term.specimenTerms) {
      for (const spec of term.specimenTerms.specimen) {
        organs.add(spec.toUpperCase());
      }
    }
    if (term.organWeightTerms) {
      for (const spec of term.organWeightTerms.specimen) {
        organs.add(spec.toUpperCase());
      }
    }
  }
  return [...organs];
}

/**
 * Simple dose-related mortality check: deaths at higher dose groups than control.
 */
export function isDoseRelatedMortality(deathsByDose: Map<number, number>): boolean {
  if (deathsByDose.size === 0) return false;
  const controlDeaths = deathsByDose.get(0) ?? 0;
  for (const [dose, count] of deathsByDose) {
    if (dose > 0 && count > controlDeaths) return true;
  }
  return false;
}

/**
 * Bridge API StudyMortality type to interpretation layer AnimalDisposition[].
 * - mortality.deaths[] → treatmentRelated: true
 * - mortality.accidentals[] → treatmentRelated: false
 * - All mapped entries get excludeFromTerminalStats: true
 */
export function mapDeathRecordsToDispositions(mortality: StudyMortality): AnimalDisposition[] {
  const dispositions: AnimalDisposition[] = [];
  for (const d of mortality.deaths) {
    dispositions.push({
      animalId: d.USUBJID,
      doseGroup: d.dose_level,
      sex: d.sex,
      dispositionCode: d.disposition,
      dispositionDay: d.study_day ?? 0,
      treatmentRelated: true,
      causeOfDeath: d.cause ?? undefined,
      excludeFromTerminalStats: true,
    });
  }
  for (const a of mortality.accidentals) {
    dispositions.push({
      animalId: a.USUBJID,
      doseGroup: a.dose_level,
      sex: a.sex,
      dispositionCode: a.disposition,
      dispositionDay: a.study_day ?? 0,
      treatmentRelated: false,
      causeOfDeath: a.cause ?? undefined,
      excludeFromTerminalStats: true,
    });
  }
  return dispositions;
}

/**
 * Assess mortality context for a syndrome.
 * Matches cause-of-death text against syndrome organ terms,
 * computes dose-related mortality pattern, and builds narrative.
 */
export function assessMortalityContext(
  syndrome: CrossDomainSyndrome,
  mortalityData: AnimalDisposition[],
  _studyContext: StudyContext,
  mortalityNoaelCap?: number | null,
): MortalityContext {
  if (mortalityData.length === 0) {
    return {
      deathsInSyndromeOrgans: 0,
      treatmentRelatedDeaths: 0,
      doseRelatedMortality: false,
      mortalityNarrative: "No mortality data available.",
      mortalityNoaelCap: null,
      deathDetails: [],
    };
  }

  const treatmentRelated = mortalityData.filter((d) => d.treatmentRelated);
  const syndromeOrgans = getSyndromeOrgans(syndrome.id);

  // Match cause-of-death against syndrome organs
  let deathsInOrgans = 0;
  const matchedOrgans = new Set<string>();
  for (const d of treatmentRelated) {
    if (d.causeOfDeath) {
      const causeUpper = d.causeOfDeath.toUpperCase();
      for (const organ of syndromeOrgans) {
        if (causeUpper.includes(organ)) {
          deathsInOrgans++;
          matchedOrgans.add(organ);
          break;
        }
      }
    }
  }

  // Dose-related mortality
  const deathsByDose = new Map<number, number>();
  for (const d of treatmentRelated) {
    deathsByDose.set(d.doseGroup, (deathsByDose.get(d.doseGroup) ?? 0) + 1);
  }
  const doseRelated = isDoseRelatedMortality(deathsByDose);

  // Build narrative
  const parts: string[] = [];
  parts.push(`${treatmentRelated.length} treatment-related death${treatmentRelated.length !== 1 ? "s" : ""}.`);
  if (deathsInOrgans > 0) {
    const organList = [...matchedOrgans].join(", ").toLowerCase();
    parts.push(
      `${deathsInOrgans} attributed to ${organList} — directly relevant to this syndrome.`,
    );
  }
  if (doseRelated) {
    parts.push("Dose-related mortality pattern detected.");
  }
  if (mortalityNoaelCap != null) {
    parts.push(`Mortality caps NOAEL at dose level ${mortalityNoaelCap}.`);
  }

  return {
    deathsInSyndromeOrgans: deathsInOrgans,
    treatmentRelatedDeaths: treatmentRelated.length,
    doseRelatedMortality: doseRelated,
    mortalityNarrative: parts.join(" "),
    mortalityNoaelCap: mortalityNoaelCap ?? null,
    deathDetails: treatmentRelated.map((d) => ({
      animalId: d.animalId,
      doseGroup: d.doseGroup,
      dispositionCode: d.dispositionCode,
      dispositionDay: d.dispositionDay,
      causeOfDeath: d.causeOfDeath,
    })),
  };
}

// ─── Tumor context ────────────────────────────────────────

/** MI precursor terms that indicate proliferative progression */
const MI_PRECURSOR_TERMS: Record<string, string[]> = {
  necrosis: ["NECROSIS", "NECROS"],
  hypertrophy: ["HYPERTROPHY", "HYPERTROP"],
  hyperplasia: ["HYPERPLASIA", "HYPERPLASI"],
};

/** TF tumor stage terms */
const TF_TUMOR_STAGES: Record<string, string[]> = {
  adenoma: ["ADENOMA"],
  carcinoma: ["CARCINOMA"],
  papilloma: ["PAPILLOMA"],
  leiomyoma: ["LEIOMYOMA"],
};

/**
 * Assess known non-human-relevant tumor mechanisms.
 * Three well-established mechanisms that produce tumors in rodents
 * but are not considered relevant to human risk assessment:
 *   1. PPARα agonism → hepatocellular tumors in rodents (rodent-specific receptor density)
 *   2. TSH-mediated thyroid tumors → follicular cell tumors from sustained TSH elevation
 *   3. α2u-globulin nephropathy → kidney tumors in male rats only (protein absent in humans)
 */
function assessHumanNonRelevance(
  tumors: TumorFinding[],
  studyContext: StudyContext,
): HumanNonRelevance[] {
  const species = studyContext.species.toUpperCase();
  const isRodent = species.includes("RAT") || species.includes("MOUSE");
  const isMaleRat = species.includes("RAT"); // α2u only applies to male rats
  const results: HumanNonRelevance[] = [];

  const hasLiverTumor = tumors.some((t) =>
    t.organ.toUpperCase().includes("LIVER"),
  );
  const hasThyroidTumor = tumors.some((t) =>
    t.organ.toUpperCase().includes("THYROID"),
  );
  const hasKidneyTumor = tumors.some((t) =>
    t.organ.toUpperCase().includes("KIDNEY"),
  );

  // PPARα agonism — liver tumors in rodents
  results.push({
    mechanism: "PPARα agonism",
    applies: isRodent && hasLiverTumor,
    rationale: isRodent && hasLiverTumor
      ? "Rodent hepatocellular tumors may arise from PPARα-mediated peroxisome proliferation, a pathway with minimal human relevance due to lower receptor density in human liver."
      : "Not applicable — no liver tumors in rodent species.",
  });

  // TSH-mediated thyroid follicular tumors
  results.push({
    mechanism: "TSH-mediated thyroid",
    applies: isRodent && hasThyroidTumor,
    rationale: isRodent && hasThyroidTumor
      ? "Rodent thyroid follicular cell tumors often result from sustained TSH elevation via hepatic enzyme induction. Rats are highly susceptible; human thyroid is less responsive to this mechanism."
      : "Not applicable — no thyroid tumors in rodent species.",
  });

  // α2u-globulin nephropathy — male rats only
  results.push({
    mechanism: "α2u-globulin nephropathy",
    applies: isMaleRat && hasKidneyTumor,
    rationale: isMaleRat && hasKidneyTumor
      ? "Male rat kidney tumors may arise from α2u-globulin accumulation. This protein is absent in humans, making this mechanism non-relevant to human risk."
      : "Not applicable — α2u-globulin is specific to male rats with kidney tumors.",
  });

  return results;
}

/**
 * Assess tumor context for a syndrome.
 * Filters TF tumor data to organs related to the syndrome, detects
 * proliferative progression by cross-referencing MI histopath findings,
 * and assesses rarity based on strain + study duration.
 */
export function assessTumorContext(
  syndrome: CrossDomainSyndrome,
  tumorData: TumorFinding[],
  histopathData: LesionSeverityRow[],
  studyContext: StudyContext,
): TumorContext {
  if (!tumorData || tumorData.length === 0) {
    return {
      tumorsPresent: false,
      tumorSummaries: [],
      progressionDetected: false,
      interpretation: "No tumor data available.",
    };
  }

  // Filter tumors to organs related to this syndrome
  const syndromeOrgans = getSyndromeOrgans(syndrome.id);
  const relevantTumors = syndromeOrgans.length > 0
    ? tumorData.filter((t) => {
        const tumorOrgan = t.organ.toUpperCase();
        return syndromeOrgans.some(
          (so) => tumorOrgan.includes(so) || so.includes(tumorOrgan),
        );
      })
    : tumorData; // No organ mapping → include all tumors for context

  if (relevantTumors.length === 0) {
    return {
      tumorsPresent: false,
      tumorSummaries: [],
      progressionDetected: false,
      interpretation: "No tumors found in organs related to this syndrome.",
    };
  }

  // Summarize by organ + morphology
  const summaryMap = new Map<string, { organ: string; morphology: string; count: number }>();
  for (const t of relevantTumors) {
    const key = `${t.organ}::${t.morphology}`;
    const existing = summaryMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      summaryMap.set(key, { organ: t.organ, morphology: t.morphology, count: 1 });
    }
  }
  const tumorSummaries = [...summaryMap.values()];

  // Detect progression: check MI histopath for precursors in tumor organs
  const tumorOrgans = new Set(relevantTumors.map((t) => t.organ.toUpperCase()));
  const miPrecursorsFound: string[] = [];
  const tfStagesFound: string[] = [];

  // Scan MI findings for precursor terms
  for (const row of histopathData) {
    const specimen = row.specimen?.toUpperCase() ?? "";
    if (!tumorOrgans.has(specimen)) continue;

    const finding = row.finding?.toUpperCase() ?? "";
    for (const [stage, terms] of Object.entries(MI_PRECURSOR_TERMS)) {
      if (terms.some((term) => finding.includes(term))) {
        if (!miPrecursorsFound.includes(stage)) miPrecursorsFound.push(stage);
      }
    }
  }

  // Scan tumor morphology for TF stages
  for (const t of relevantTumors) {
    const morph = t.morphology.toUpperCase();
    for (const [stage, terms] of Object.entries(TF_TUMOR_STAGES)) {
      if (terms.some((term) => morph.includes(term))) {
        if (!tfStagesFound.includes(stage)) tfStagesFound.push(stage);
      }
    }
  }

  const progressionDetected = miPrecursorsFound.length > 0 && tfStagesFound.length > 0;
  const allStages = [...miPrecursorsFound, ...tfStagesFound];

  // Strain/duration rarity context
  const durationWeeks = studyContext.dosingDurationWeeks;
  let expectedBackground: "expected" | "unusual" | "very_rare" = "expected";
  if (durationWeeks != null && durationWeeks <= 13) {
    // Any tumor in a ≤13-week study is extremely rare spontaneously
    expectedBackground = "very_rare";
  } else if (durationWeeks != null && durationWeeks <= 26) {
    expectedBackground = "unusual";
  }

  // Build interpretation narrative
  const organNames = [...tumorOrgans].map((o) => o.charAt(0) + o.slice(1).toLowerCase());
  const parts: string[] = [];

  parts.push(
    `${relevantTumors.length} tumor${relevantTumors.length !== 1 ? "s" : ""} detected in ${organNames.join(", ")}.`,
  );

  if (progressionDetected) {
    parts.push(
      `Proliferative progression detected: MI precursors (${miPrecursorsFound.join(", ")}) → TF tumors (${tfStagesFound.join(", ")}).`,
    );
  }

  if (expectedBackground === "very_rare") {
    parts.push(
      `For a ${durationWeeks}-week study, any tumor occurrence is very rare spontaneously — strongly suggests treatment-related etiology.`,
    );
  } else if (expectedBackground === "unusual") {
    parts.push(
      `Tumor occurrence is unusual for a ${durationWeeks}-week study duration.`,
    );
  }

  const malignantCount = relevantTumors.filter((t) => t.behavior === "MALIGNANT").length;
  if (malignantCount > 0) {
    parts.push(`${malignantCount} malignant tumor${malignantCount !== 1 ? "s" : ""}.`);
  }

  // Assess known non-human-relevant tumor mechanisms
  const humanNonRelevance = assessHumanNonRelevance(
    relevantTumors,
    studyContext,
  );
  if (humanNonRelevance.some((h) => h.applies)) {
    const applicable = humanNonRelevance.filter((h) => h.applies);
    parts.push(
      `Non-human-relevant mechanism${applicable.length !== 1 ? "s" : ""}: ${applicable.map((h) => h.mechanism).join(", ")}.`,
    );
  }

  return {
    tumorsPresent: true,
    tumorSummaries,
    progressionDetected,
    progressionSequence: progressionDetected
      ? {
          stages: allStages,
          stagesPresent: allStages,
          complete: miPrecursorsFound.length >= 2 && tfStagesFound.length >= 2,
        }
      : undefined,
    strainContext: {
      strain: studyContext.strain,
      studyDuration: durationWeeks ?? 0,
      expectedBackground,
    },
    humanNonRelevance,
    interpretation: parts.join(" "),
  };
}

// ─── Food Consumption Context ──────────────────────────────

/** BW-relevant syndromes that benefit from food consumption context. */
const BW_RELEVANT_SYNDROMES = new Set(["XS07", "XS08", "XS09"]);

/**
 * Assess food consumption context for a syndrome.
 * Returns food efficiency assessment if FW data is available and the syndrome
 * involves body weight. Otherwise returns a "not_applicable" stub.
 */
export function assessFoodConsumptionContext(
  syndrome: CrossDomainSyndrome,
  foodData: FoodConsumptionSummaryResponse,
  _studyContext: StudyContext,
): FoodConsumptionContext {
  if (!foodData.available) {
    return {
      available: false,
      bwFwAssessment: "not_applicable",
      foodEfficiencyReduced: null,
      temporalOnset: null,
      fwNarrative: "Food consumption data not available.",
    };
  }

  // Check if this syndrome involves BW
  const isBwRelevant =
    BW_RELEVANT_SYNDROMES.has(syndrome.id) ||
    syndrome.matchedEndpoints.some(
      (ep) => ep.domain === "BW" || ep.domain === "FW",
    );

  if (!isBwRelevant) {
    return {
      available: true,
      bwFwAssessment: "not_applicable",
      foodEfficiencyReduced: null,
      temporalOnset: null,
      fwNarrative: "Food consumption data available but not relevant to this syndrome.",
    };
  }

  // Pass through the backend's assessment
  const overall = foodData.overall_assessment;
  if (!overall) {
    return {
      available: true,
      bwFwAssessment: "not_applicable",
      foodEfficiencyReduced: null,
      temporalOnset: null,
      fwNarrative: "Food consumption data available but assessment not computed.",
    };
  }

  return {
    available: true,
    bwFwAssessment: (overall.assessment === "primary_weight_loss"
      || overall.assessment === "secondary_to_food"
      || overall.assessment === "malabsorption")
      ? overall.assessment as FoodConsumptionContext["bwFwAssessment"]
      : "not_applicable",
    foodEfficiencyReduced: overall.fe_reduced,
    temporalOnset: (overall.temporal_onset === "bw_first"
      || overall.temporal_onset === "fw_first"
      || overall.temporal_onset === "simultaneous"
      || overall.temporal_onset === "unknown")
      ? overall.temporal_onset as FoodConsumptionContext["temporalOnset"]
      : "unknown",
    fwNarrative: overall.narrative,
  };
}

// ─── Orchestrator ──────────────────────────────────────────

// ─── Step 14: ECETOC Treatment-Relatedness ──────────────────

/**
 * Compute ECETOC A-factor treatment-relatedness score.
 *
 * - A-1 (doseResponse): from syndrome confidence (HIGH → strong, MODERATE → weak)
 * - A-2 (crossEndpoint): concordant when ≥2 domains covered
 * - A-4 (hcdComparison): no historical control data → "no_hcd"
 * - A-6 (statisticalSignificance): derived from matched endpoints' p-values
 * - A-2 ext (clinicalObservationSupport): from CL correlation assessment
 */
export function computeTreatmentRelatedness(
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
  clSupport: ClinicalObservationSupport,
): TreatmentRelatednessScore {
  // A-1: dose-response strength
  const doseResponse: TreatmentRelatednessScore["doseResponse"] =
    syndrome.confidence === "HIGH"
      ? "strong"
      : syndrome.confidence === "MODERATE"
        ? "weak"
        : "absent";

  // A-2: cross-endpoint concordance
  const crossEndpoint: TreatmentRelatednessScore["crossEndpoint"] =
    syndrome.domainsCovered.length >= 2 ? "concordant" : "isolated";

  // A-6: statistical significance — derive from matched endpoints
  const matchedLabels = new Set(syndrome.matchedEndpoints.map((m) => m.endpoint_label));
  const matchedEps = allEndpoints.filter((ep) => matchedLabels.has(ep.endpoint_label));
  const minP = matchedEps.reduce<number | null>((min, ep) => {
    if (ep.minPValue == null) return min;
    return min == null ? ep.minPValue : Math.min(min, ep.minPValue);
  }, null);

  const statisticalSignificance: TreatmentRelatednessScore["statisticalSignificance"] =
    minP != null && minP < 0.05
      ? "significant"
      : minP != null && minP < 0.1
        ? "borderline"
        : "not_significant";

  // Overall: combine A-factors
  const clinicalObs = clSupport.assessment === "strengthens";
  const positiveFactors =
    (doseResponse === "strong" ? 2 : doseResponse === "weak" ? 1 : 0) +
    (crossEndpoint === "concordant" ? 1 : 0) +
    (statisticalSignificance === "significant" ? 1 : statisticalSignificance === "borderline" ? 0.5 : 0) +
    (clinicalObs ? 1 : 0);

  const overall: TreatmentRelatednessScore["overall"] =
    positiveFactors >= 3
      ? "treatment_related"
      : positiveFactors >= 1.5
        ? "possibly_related"
        : "not_related";

  return {
    doseResponse,
    crossEndpoint,
    hcdComparison: "no_hcd",
    statisticalSignificance,
    clinicalObservationSupport: clinicalObs,
    overall,
  };
}

// ─── Step 15: ECETOC Adversity Assessment ───────────────────

/**
 * Derive magnitude level from the maximum effect size of matched endpoints.
 * Uses Cohen's d thresholds adapted for tox:
 *   |d| < 0.5 → minimal, < 1.0 → mild, < 1.5 → moderate, < 2.0 → marked, ≥ 2.0 → severe
 */
function deriveMagnitudeLevel(
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
): AdversityAssessment["magnitudeLevel"] {
  const matchedLabels = new Set(syndrome.matchedEndpoints.map((m) => m.endpoint_label));
  const matchedEps = allEndpoints.filter((ep) => matchedLabels.has(ep.endpoint_label));
  const maxD = matchedEps.reduce<number>(
    (max, ep) => Math.max(max, Math.abs(ep.maxEffectSize ?? 0)),
    0,
  );

  if (maxD >= 2.0) return "severe";
  if (maxD >= 1.5) return "marked";
  if (maxD >= 1.0) return "moderate";
  if (maxD >= 0.5) return "mild";
  return "minimal";
}

/**
 * Compute ECETOC B-factor adversity assessment.
 *
 * - B-2 (adaptive): not determinable from current data model → false
 * - B-3 (reversible): from recovery assessment
 * - B-4 (magnitudeLevel): from matched endpoints' max effect size
 * - B-5 (crossDomainSupport): from domain coverage
 * - B-6 (precursorToWorse): from tumor context progression detection
 * - B-7 (secondaryToOther): from food consumption context
 */
export function computeAdversity(
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
  recovery: SyndromeRecoveryAssessment,
  certainty: SyndromeCertainty,
  tumorContext: TumorContext,
  foodConsumptionContext: FoodConsumptionContext,
): AdversityAssessment {
  const reversible =
    recovery.status === "recovered" ? true
    : recovery.status === "not_recovered" ? false
    : null;

  const magnitudeLevel = deriveMagnitudeLevel(syndrome, allEndpoints);

  const crossDomainSupport = syndrome.domainsCovered.length >= 2;

  const precursorToWorse = tumorContext.progressionDetected;

  const secondaryToOther =
    foodConsumptionContext.bwFwAssessment === "secondary_to_food";

  // Overall adversity decision tree
  // Adverse if: mechanism confirmed + cross-domain, OR precursor to worse, OR severe magnitude
  // Non-adverse if: recovered + minimal magnitude + no progression
  // Equivocal otherwise
  let overall: AdversityAssessment["overall"];
  if (precursorToWorse) {
    overall = "adverse";
  } else if (certainty === "mechanism_confirmed" && crossDomainSupport) {
    overall = "adverse";
  } else if (magnitudeLevel === "severe" || magnitudeLevel === "marked") {
    overall = "adverse";
  } else if (
    reversible === true &&
    (magnitudeLevel === "minimal" || magnitudeLevel === "mild") &&
    !precursorToWorse
  ) {
    overall = "non_adverse";
  } else {
    overall = "equivocal";
  }

  return {
    adaptive: false,
    reversible,
    magnitudeLevel,
    crossDomainSupport,
    precursorToWorse,
    secondaryToOther,
    overall,
  };
}

// ─── Step 15b: Overall Severity Cascade ─────────────────────

/**
 * Derive overall severity from mortality, tumor, and adversity context.
 *
 * Cascade:
 *   S0_Death → carcinogenic → proliferative → S4_Critical → S3_Adverse → S2_Concern → S1_Monitor
 */
export function deriveOverallSeverity(
  mortalityContext: MortalityContext,
  tumorContext: TumorContext,
  adversity: AdversityAssessment,
  certainty: SyndromeCertainty,
): OverallSeverity {
  // Deaths in syndrome organs → S0
  if (mortalityContext.deathsInSyndromeOrgans > 0) return "S0_Death";

  // Tumors with progression → carcinogenic
  if (tumorContext.tumorsPresent && tumorContext.progressionDetected) return "carcinogenic";

  // Tumors without progression → proliferative
  if (tumorContext.tumorsPresent) return "proliferative";

  // Treatment-related deaths in non-syndrome organs → S4
  if (mortalityContext.treatmentRelatedDeaths > 0) return "S4_Critical";

  // Mechanism confirmed + adverse → S3
  if (certainty === "mechanism_confirmed" && adversity.overall === "adverse") return "S3_Adverse";

  // Any adverse signal → S2
  if (adversity.overall === "adverse") return "S2_Concern";

  // Non-adverse with confirmed mechanism → S1
  if (adversity.overall === "non_adverse") return "S1_Monitor";

  // Default
  return "S2_Concern";
}

// ─── Translational Confidence Scoring ─────────────────────
// Data: concordance-v0 — Liu & Fan 2026 paper text, 2026-02-18

const CONCORDANCE_DATA_VERSION = "concordance-v0";

/** SOC-level LR+ by species. Midpoints of approximate ranges from Liu & Fan Fig. 3C. */
const SOC_CONCORDANCE: Record<string, Record<string, number>> = {
  rat: {
    "hepatobiliary disorders": 3.5, "blood and lymphatic system disorders": 3.5,
    "gastrointestinal disorders": 2.5, "renal and urinary disorders": 4.0,
    "immune system disorders": 2.5, "metabolism and nutrition disorders": 2.5,
    "cardiac disorders": 2.5, "nervous system disorders": 1.5, "investigations": 1.5,
  },
  dog: {
    "hepatobiliary disorders": 3.5, "blood and lymphatic system disorders": 4.5,
    "gastrointestinal disorders": 4.5, "renal and urinary disorders": 3.5,
    "immune system disorders": 2.5, "metabolism and nutrition disorders": 3.5,
    "cardiac disorders": 3.5, "nervous system disorders": 2.5, "investigations": 1.5,
  },
  monkey: {
    "hepatobiliary disorders": 4.5, "blood and lymphatic system disorders": 5.5,
    "gastrointestinal disorders": 4.5, "renal and urinary disorders": 4.5,
    "immune system disorders": 6.0, "metabolism and nutrition disorders": 4.5,
    "cardiac disorders": 3.5, "nervous system disorders": 2.5, "investigations": 2.5,
  },
  mouse: {
    "hepatobiliary disorders": 5.0, "blood and lymphatic system disorders": 2.5,
    "gastrointestinal disorders": 2.5, "renal and urinary disorders": 2.5,
    "immune system disorders": 4.0, "metabolism and nutrition disorders": 2.5,
    "cardiac disorders": 1.5, "nervous system disorders": 1.5, "investigations": 1.5,
  },
  rabbit: {
    "hepatobiliary disorders": 1.5, "blood and lymphatic system disorders": 2.5,
    "gastrointestinal disorders": 1.5, "renal and urinary disorders": 2.5,
    "immune system disorders": 1.5, "metabolism and nutrition disorders": 1.5,
    "cardiac disorders": 1.5, "nervous system disorders": 1.5, "investigations": 1.5,
  },
};

/** PT-level LR+ for specific endpoints. Seeded from Liu & Fan paper text. */
const KNOWN_PT_CONCORDANCE: Record<string, { species: string; lrPlus: number }[]> = {
  // Hepatobiliary
  "immune-mediated hepatitis": [{ species: "mouse", lrPlus: 462.4 }],
  "hepatic necrosis": [{ species: "rat", lrPlus: 8.7 }, { species: "dog", lrPlus: 12.3 }],
  "cholestasis": [{ species: "rat", lrPlus: 6.1 }],
  "hepatotoxicity": [{ species: "all", lrPlus: 2.2 }],
  "hepatic function abnormal": [{ species: "all", lrPlus: 4.2 }],
  "liver disorder": [{ species: "all", lrPlus: 3.2 }],
  // Hematological
  "neutropenia": [{ species: "all", lrPlus: 16.1 }],
  "anemia": [{ species: "all", lrPlus: 10.1 }],
  "thrombocytopenia": [{ species: "all", lrPlus: 8.4 }],
  // Metabolic
  "hypertriglyceridemia": [{ species: "rat", lrPlus: 112.7 }],
  "hyperglycemia": [{ species: "all", lrPlus: 34.4 }],
  "hyperphagia": [{ species: "dog", lrPlus: 230.8 }],
  "hyperinsulinemia": [{ species: "all", lrPlus: 217.7 }],
  "diabetes mellitus": [{ species: "all", lrPlus: 106.3 }],
  "lactic acidosis": [{ species: "all", lrPlus: 89 }],
  // Other
  "constipation": [{ species: "all", lrPlus: 21.5 }],
  "rash": [{ species: "all", lrPlus: 20 }],
  "infection": [{ species: "all", lrPlus: 116 }],
  "hypercalcemia": [{ species: "dog", lrPlus: 98.2 }],
  "metabolic disorder": [{ species: "monkey", lrPlus: 217.4 }],
};

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

// ─── MedDRA dictionary index (built from send-to-meddra-v3.json) ──

/** Normalize MedDRA British spelling to American for concordance matching. */
function normalizePT(pt: string): string {
  return pt.toLowerCase()
    .replace(/aemia/g, "emia")    // anaemia → anemia, hypertriglyceridaemia → hypertriglyceridemia
    .replace(/aemia/g, "emia")    // catch doubles
    .replace(/oedema/g, "edema")  // oedema → edema
    .replace(/haem/g, "hem")      // haemolytic → hemolytic
    .replace(/oestr/g, "estr");   // oestradiol → estradiol
}

/** MedDRA mapping index: dictionary key → normalized American-spelling PT strings. */
const MEDDRA_INDEX: Map<string, string[]> = new Map();
{
  const mapping = meddraMapping.mapping as Record<string, { direction: string; pts: { pt: string; soc: string }[] }>;
  for (const [key, entry] of Object.entries(mapping)) {
    MEDDRA_INDEX.set(key, entry.pts.map(p => normalizePT(p.pt)));
  }
}

/** Normalize species strings to concordance lookup keys. */
export function normalizeSpecies(species: string): string {
  const s = species.toLowerCase().trim();
  if (s.includes("sprague") || s.includes("wistar") || s === "rat") return "rat";
  if (s.includes("beagle") || s === "dog") return "dog";
  if (s.includes("cynomolgus") || s.includes("rhesus") || s === "monkey") return "monkey";
  if (s.includes("mouse") || s.includes("cd-1") || s.includes("c57bl")) return "mouse";
  if (s.includes("rabbit") || s.includes("new zealand")) return "rabbit";
  return s;
}

/** Look up SOC-level LR+ for a species × SOC combination. */
export function lookupSOCLRPlus(species: string, soc: string | undefined): number | null {
  if (!soc) return null;
  const normalized = normalizeSpecies(species);
  const speciesData = SOC_CONCORDANCE[normalized];
  if (!speciesData) return null;
  return speciesData[soc.toLowerCase()] ?? null;
}

/** Assign translational tier from PT matches (preferred) or SOC fallback. */
export function assignTranslationalTier(
  species: string,
  primarySOC: string | undefined,
  endpointLRPlus: { lrPlus: number }[],
): "high" | "moderate" | "low" | "insufficient_data" {
  if (endpointLRPlus.length > 0) {
    const maxLR = Math.max(...endpointLRPlus.map(e => e.lrPlus));
    if (maxLR >= 10) return "high";
    if (maxLR >= 3) return "moderate";
    return "low";
  }
  const socLR = lookupSOCLRPlus(species, primarySOC);
  if (socLR === null) return "insufficient_data";
  if (socLR >= 5) return "high";
  if (socLR >= 3) return "moderate";
  return "low";
}

/** Build one-sentence summary with citation. */
function buildTranslationalSummary(
  tier: "high" | "moderate" | "low" | "insufficient_data",
  species: string,
  soc: string | undefined,
  ptMatches: { endpoint: string; lrPlus: number }[],
  socLR: number | null,
): string {
  const speciesName = normalizeSpecies(species);
  const capSpecies = speciesName.charAt(0).toUpperCase() + speciesName.slice(1);
  const socLabel = soc ? soc.toLowerCase() : "unknown";

  if (ptMatches.length > 0) {
    const best = ptMatches.reduce((a, b) => (a.lrPlus > b.lrPlus ? a : b));
    return `${capSpecies} ${socLabel} findings have ${tier} translational ` +
      `confidence (${best.endpoint}: LR+ ${best.lrPlus}, ` +
      `Liu & Fan 2026, n=7,565 drugs).`;
  }

  if (socLR !== null) {
    return `${capSpecies} ${socLabel} findings have ${tier} translational ` +
      `confidence at SOC level (LR+ ≈${socLR}, Liu & Fan 2026).`;
  }

  return `Translational confidence data not available for ${capSpecies} ` +
    `${socLabel}.`;
}

/**
 * Build dictionary lookup keys for an endpoint. Returns keys to try in MEDDRA_INDEX.
 * Uses structured fields from the full EndpointSummary when available.
 */
function buildDictionaryKeys(ep: EndpointSummary): string[] {
  const keys: string[] = [];
  const domain = ep.domain.toUpperCase();

  if (domain === "LB" || domain === "CL") {
    // LB: primary key is testCode (e.g., "ALT"), fallback to label
    if (ep.testCode) keys.push(ep.testCode.toUpperCase());
    // Also try raw label as key (some entries use label-based keys)
    keys.push(ep.endpoint_label.toUpperCase());
  } else if (domain === "MI" || domain === "MA") {
    // MI: key is "MI:FINDING:SPECIMEN" — normalize to upper-case underscored
    const specimen = (ep.specimen ?? "").toUpperCase().replace(/[\s,]+/g, "_");
    const finding = (ep.finding ?? "").toUpperCase().replace(/[\s,]+/g, " ");
    if (specimen && finding) {
      keys.push(`MI:${finding}:${specimen}`);
      // Try shorter specimen (e.g., "BONE MARROW, FEMUR" → "BONE_MARROW")
      const shortSpecimen = specimen.split("_")[0] === "BONE" ? "BONE_MARROW" : specimen.split("_")[0];
      if (shortSpecimen !== specimen) keys.push(`MI:${finding}:${shortSpecimen}`);
    }
  } else if (domain === "OM") {
    // OM: key is "OM:WEIGHT:SPECIMEN:UP|DOWN"
    const specimen = (ep.specimen ?? ep.endpoint_label).toUpperCase().replace(/[\s,]+/g, "_");
    const dir = ep.direction === "up" ? "UP" : ep.direction === "down" ? "DOWN" : null;
    if (specimen && dir) {
      keys.push(`OM:WEIGHT:${specimen}:${dir}`);
      const shortSpecimen = specimen.split("_")[0] === "BONE" ? "BONE_MARROW" : specimen.split("_")[0];
      if (shortSpecimen !== specimen) keys.push(`OM:WEIGHT:${shortSpecimen}:${dir}`);
    }
  }
  return keys;
}

/**
 * Resolve matched endpoints to MedDRA PTs via the v3.0 dictionary.
 * Uses structured EndpointSummary fields for precise key building.
 */
function resolveObservedPTs(
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
): Set<string> {
  const pts = new Set<string>();
  // Build index of full EndpointSummary by label for fast lookup
  const epByLabel = new Map<string, EndpointSummary>();
  for (const ep of allEndpoints) epByLabel.set(ep.endpoint_label, ep);

  for (const match of syndrome.matchedEndpoints) {
    const fullEp = epByLabel.get(match.endpoint_label);
    if (!fullEp) continue;

    const keys = buildDictionaryKeys(fullEp);
    for (const key of keys) {
      const ptList = MEDDRA_INDEX.get(key);
      if (ptList) {
        for (const pt of ptList) pts.add(pt);
        break; // first matching key wins
      }
    }
  }
  return pts;
}

/**
 * Assess translational confidence for a detected syndrome.
 * Uses the v3.0 MedDRA dictionary to resolve observed endpoints to PTs,
 * then matches against concordance data.
 */
export function assessTranslationalConfidence(
  syndrome: CrossDomainSyndrome,
  species: string,
  hasAbsenceMeaningful: boolean,
  allEndpoints?: EndpointSummary[],
): TranslationalConfidence {
  const primarySOC = SYNDROME_SOC_MAP[syndrome.id];
  const socLR = lookupSOCLRPlus(species, primarySOC);
  const normalizedSpecies = normalizeSpecies(species);

  // Resolve which PTs the syndrome's actual matched endpoints map to
  const observedPTs = allEndpoints
    ? resolveObservedPTs(syndrome, allEndpoints)
    : new Set<string>(); // no endpoints → SOC fallback only

  // Look up concordance data for observed PTs only
  const ptMatches: { endpoint: string; lrPlus: number; species: string }[] = [];
  for (const pt of observedPTs) {
    const known = KNOWN_PT_CONCORDANCE[pt];
    if (!known) continue;
    for (const entry of known) {
      if (entry.species === normalizedSpecies || entry.species === "all") {
        ptMatches.push({ endpoint: pt, lrPlus: entry.lrPlus, species: entry.species });
      }
    }
  }

  const tier = assignTranslationalTier(species, primarySOC, ptMatches);

  const absenceCaveat = hasAbsenceMeaningful
    ? "Negative predictivity for most preclinical endpoints is low (iLR⁻ <3). " +
      "Absence of a specific marker within an active syndrome has discriminating " +
      "value, but absence alone should not drive human risk exclusion."
    : null;

  const summary = buildTranslationalSummary(tier, species, primarySOC, ptMatches, socLR);

  return {
    tier,
    species: normalizedSpecies,
    primarySOC: primarySOC ?? "",
    socLRPlus: socLR,
    endpointLRPlus: ptMatches,
    absenceCaveat,
    summary,
    dataVersion: CONCORDANCE_DATA_VERSION,
  };
}

/**
 * Interpret a detected syndrome using all available study data.
 * Phase A uses args 1-4; Phase B uses tumor context; Phase C uses arg 9.
 */
export function interpretSyndrome(
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
  histopathData: LesionSeverityRow[],
  recoveryData: RecoveryRow[],
  _organWeightData: OrganWeightRow[],
  tumorData: TumorFinding[],
  mortalityData: AnimalDisposition[],
  foodConsumptionData: FoodConsumptionSummaryResponse,
  clinicalObservations: ClinicalObservation[],
  studyContext: StudyContext,
  mortalityNoaelCap?: number | null,
): SyndromeInterpretation {
  const discriminators = DISCRIMINATOR_REGISTRY[syndrome.id];

  // ── Component 1: Certainty ──
  let certaintyResult: {
    certainty: SyndromeCertainty;
    evidence: DiscriminatingFinding[];
    rationale: string;
  };

  if (discriminators) {
    certaintyResult = assessCertainty(
      syndrome,
      discriminators,
      allEndpoints,
      histopathData,
    );
  } else {
    // No discriminators defined for this syndrome
    certaintyResult = {
      certainty: syndrome.requiredMet ? "mechanism_uncertain" : "pattern_only",
      evidence: [],
      rationale: syndrome.requiredMet
        ? "Required findings met. No discriminating evidence defined for this syndrome."
        : "Syndrome detected through supporting evidence only.",
    };
  }

  // ── Component 2: Histopath cross-reference ──
  const histopathContext = discriminators
    ? crossReferenceHistopath(syndrome, discriminators, histopathData)
    : [];

  // ── Component 3: Recovery ──
  const recovery = assessSyndromeRecovery(
    syndrome,
    recoveryData,
    allEndpoints,
  );

  // ── Phase C: CL correlation ──
  const clSupport = assessClinicalObservationSupport(
    syndrome.id,
    clinicalObservations,
  );

  // ── Phase B: Mortality ──
  const mortalityContext = assessMortalityContext(
    syndrome,
    mortalityData,
    studyContext,
    mortalityNoaelCap,
  );

  const tumorContext = assessTumorContext(
    syndrome,
    tumorData,
    histopathData,
    studyContext,
  );

  const foodConsumptionContext = assessFoodConsumptionContext(
    syndrome,
    foodConsumptionData,
    studyContext,
  );

  // ── Step 14: Treatment-relatedness ──
  const treatmentRelatedness = computeTreatmentRelatedness(
    syndrome,
    allEndpoints,
    clSupport,
  );

  // ── Step 15: Adversity ──
  const adversity = computeAdversity(
    syndrome,
    allEndpoints,
    recovery,
    certaintyResult.certainty,
    tumorContext,
    foodConsumptionContext,
  );

  // ── Step 15b: Severity cascade ──
  const overallSeverity = deriveOverallSeverity(
    mortalityContext,
    tumorContext,
    adversity,
    certaintyResult.certainty,
  );

  // ── Component 7: Study design notes ──
  const designNotes = assembleStudyDesignNotes(syndrome, studyContext);

  // ── Step 16: Narrative assembly ──
  const narrativeParts: string[] = [];
  narrativeParts.push(certaintyResult.rationale);

  if (histopathContext.length > 0) {
    const supporting = histopathContext.filter((h) => h.assessment === "supports");
    const arguing = histopathContext.filter((h) => h.assessment === "argues_against");
    if (supporting.length > 0) {
      narrativeParts.push(
        `Histopathology supports: ${supporting.map((h) => h.specimen).join(", ")}.`,
      );
    }
    if (arguing.length > 0) {
      narrativeParts.push(
        `Histopathology argues against: ${arguing.map((h) => h.specimen).join(", ")}.`,
      );
    }
  }

  if (recovery.status !== "not_examined") {
    narrativeParts.push(recovery.summary);
  }

  if (clSupport.assessment === "strengthens") {
    narrativeParts.push(
      `Clinical observations strengthen: ${clSupport.correlatingObservations.map((c) => c.observation).join(", ")}.`,
    );
  }

  if (mortalityContext.treatmentRelatedDeaths > 0) {
    narrativeParts.push(mortalityContext.mortalityNarrative);
  }

  if (tumorContext.tumorsPresent) {
    narrativeParts.push(tumorContext.interpretation);
  }

  if (foodConsumptionContext.available && foodConsumptionContext.bwFwAssessment !== "not_applicable") {
    narrativeParts.push(foodConsumptionContext.fwNarrative);
  }

  for (const note of designNotes) {
    narrativeParts.push(note);
  }

  // ECETOC assessment summary
  const trLabel = treatmentRelatedness.overall === "treatment_related" ? "YES"
    : treatmentRelatedness.overall === "possibly_related" ? "POSSIBLY" : "NO";
  const trFactors: string[] = [];
  if (treatmentRelatedness.doseResponse !== "absent") trFactors.push(`${treatmentRelatedness.doseResponse} dose-response`);
  if (treatmentRelatedness.statisticalSignificance === "significant") trFactors.push("significant");
  if (treatmentRelatedness.crossEndpoint === "concordant") trFactors.push(`concordant across ${syndrome.domainsCovered.join("+")}`);
  if (treatmentRelatedness.clinicalObservationSupport) trFactors.push("CL support");

  const advLabel = adversity.overall === "adverse" ? "YES"
    : adversity.overall === "non_adverse" ? "NO" : "EQUIVOCAL";
  const advFactors: string[] = [];
  if (adversity.magnitudeLevel === "severe" || adversity.magnitudeLevel === "marked") advFactors.push(`${adversity.magnitudeLevel} severity`);
  if (adversity.precursorToWorse) advFactors.push("precursor to worse");
  if (adversity.reversible === true) advFactors.push("reversible");
  if (adversity.reversible === false) advFactors.push("irreversible");
  if (adversity.secondaryToOther) advFactors.push("secondary to food consumption");
  if (adversity.crossDomainSupport) advFactors.push("cross-domain support");

  narrativeParts.push(
    `Treatment-related: ${trLabel}${trFactors.length > 0 ? ` (${trFactors.join(", ")})` : ""}.`,
  );
  narrativeParts.push(
    `Adverse: ${advLabel}${advFactors.length > 0 ? ` (${advFactors.join(", ")})` : ""}.`,
  );

  // ── Step 17: Translational confidence ──
  const hasAbsenceMeaningful = certaintyResult.evidence.some(
    e => e.status === "supports" && discriminators?.findings.some(
      f => f.endpoint === e.endpoint && f.absenceMeaningful,
    ),
  );
  const translationalConfidence = assessTranslationalConfidence(
    syndrome, studyContext.species, hasAbsenceMeaningful, allEndpoints,
  );
  if (translationalConfidence.tier !== "insufficient_data") {
    narrativeParts.push(translationalConfidence.summary);
  }

  return {
    syndromeId: syndrome.id,
    certainty: certaintyResult.certainty,
    certaintyRationale: certaintyResult.rationale,
    discriminatingEvidence: certaintyResult.evidence,
    histopathContext,
    recovery,
    clinicalObservationSupport: clSupport,
    mortalityContext,
    tumorContext,
    foodConsumptionContext,
    studyDesignNotes: designNotes,
    treatmentRelatedness,
    adversity,
    patternConfidence: syndrome.confidence,
    mechanismCertainty: certaintyResult.certainty,
    overallSeverity,
    translationalConfidence,
    narrative: narrativeParts.join(" "),
  };
}
