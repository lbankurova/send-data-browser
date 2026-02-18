/**
 * Syndrome Interpretation Layer — post-processing on top of CrossDomainSyndrome.
 * Does NOT modify detection logic. Enriches detected syndromes with:
 *   Phase A: certainty grading, histopath cross-reference, recovery assessment
 *   Phase C: clinical observation (CL) correlation
 *   Phase B: study design notes live; mortality, tumor, food, ECETOC still stubbed
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
 *   Gap 4  DiscriminatingFinding.source: "LB" | "MI" | "MA" | "OM" (no "EG").
 *          Spec had same union; code previously included "EG" speculatively. Removed.
 *
 *   Gap 15 XS01 test expects mechanism_uncertain. Spec expected mechanism_confirmed.
 *          ALP is genuinely significant+up in PointCross → strong argues_against.
 *
 *   Gap 18 resolveCanonical() not implemented. findByCanonical uses CANONICAL_SYNONYMS
 *          map (test codes + label patterns) instead. Covers multi-study variation.
 *
 *   Comp 7 ecgInterpretation dropped (XS10 not in detection engine). See TODO below.
 *          recoveryDuration → recoveryPeriodDays (self-documenting unit).
 *          matchedTerms → matchedEndpoints (richer: dose-response, stats, sex breakdowns).
 */

import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import { getSyndromeDefinition } from "@/lib/cross-domain-syndromes";
import type { LesionSeverityRow } from "@/types/analysis-views";
import type { StudyContext } from "@/types/study-context";
import type { StudyMortality } from "@/types/mortality";

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
  source: "LB" | "MI" | "MA" | "OM";
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

export interface FoodConsumptionSummary {
  doseGroup: number;
  studyDay: number;
  foodConsumption: number;
  foodConsumptionVsControl: number;
  foodEfficiencyRatio: number;
  foodEfficiencyRatioVsControl: number;
  significantVsControl: boolean;
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

  // Phase B stubs (defaults until multi-domain data available)
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
    source: "LB" | "MI" | "MA" | "OM";
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

const DISCRIMINATOR_REGISTRY: Record<string, SyndromeDiscriminators> = {
  XS01: XS01_DISCRIMINATORS,
  XS02: XS02_DISCRIMINATORS,
  XS03: XS03_DISCRIMINATORS,
  XS04: XS04_DISCRIMINATORS,
  XS05: XS05_DISCRIMINATORS,
  XS06: XS06_DISCRIMINATORS,
  XS08: XS08_DISCRIMINATORS,
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

  // TODO: restore ecgInterpretation caveats when XS10 cardiovascular syndrome is added.
  // PointCross has 354 EG rows (QTcB, PR, RR). When XS10 detection lands:
  //   - Rat QTc: "Ito-dominated repolarization, limited translational value" → cap at mechanism_uncertain
  //   - Dog/monkey: correction formula selection (Bazett vs Fridericia vs Van de Water)
  //   - Temperature correction for dogs (~14ms per °C)
  // See spec §Component 7 lines 1845-1856.

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

// ─── Orchestrator ──────────────────────────────────────────

/**
 * Interpret a detected syndrome using all available study data.
 * Phase A uses args 1-4; Phase C uses arg 9; the rest get stub defaults.
 */
export function interpretSyndrome(
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
  histopathData: LesionSeverityRow[],
  recoveryData: RecoveryRow[],
  _organWeightData: OrganWeightRow[],
  _tumorData: TumorFinding[],
  mortalityData: AnimalDisposition[],
  _foodConsumptionData: FoodConsumptionSummary[],
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

  const tumorContext: TumorContext = {
    tumorsPresent: false,
    tumorSummaries: [],
    progressionDetected: false,
    interpretation: "No tumor data available.",
  };

  const foodConsumptionContext: FoodConsumptionContext = {
    available: false,
    bwFwAssessment: "not_applicable",
    foodEfficiencyReduced: null,
    temporalOnset: null,
    fwNarrative: "Food consumption data not available.",
  };

  const treatmentRelatedness: TreatmentRelatednessScore = {
    doseResponse:
      syndrome.confidence === "HIGH"
        ? "strong"
        : syndrome.confidence === "MODERATE"
          ? "weak"
          : "absent",
    crossEndpoint:
      syndrome.domainsCovered.length >= 2 ? "concordant" : "isolated",
    hcdComparison: "no_hcd",
    statisticalSignificance: "significant",
    clinicalObservationSupport: clSupport.assessment === "strengthens",
    overall:
      syndrome.confidence === "HIGH" || syndrome.confidence === "MODERATE"
        ? "treatment_related"
        : "possibly_related",
  };

  const adversity: AdversityAssessment = {
    adaptive: false,
    reversible: recovery.status === "recovered" ? true : recovery.status === "not_recovered" ? false : null,
    magnitudeLevel: "moderate",
    crossDomainSupport: syndrome.domainsCovered.length >= 2,
    precursorToWorse: false,
    secondaryToOther: false,
    overall:
      certaintyResult.certainty === "mechanism_confirmed" &&
      syndrome.domainsCovered.length >= 2
        ? "adverse"
        : "equivocal",
  };

  // Severity — escalate based on mortality
  const overallSeverity: OverallSeverity =
    mortalityContext.deathsInSyndromeOrgans > 0
      ? "S0_Death"
      : mortalityContext.treatmentRelatedDeaths > 0
        ? "S4_Critical"
        : certaintyResult.certainty === "mechanism_confirmed"
          ? "S3_Adverse"
          : "S2_Concern";

  // Narrative
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

  // ── Component 7: Study design notes ──
  const designNotes = assembleStudyDesignNotes(syndrome, studyContext);
  for (const note of designNotes) {
    narrativeParts.push(note);
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
    narrative: narrativeParts.join(" "),
  };
}
