# Syndrome Interpretation Layer Spec

**Date:** 2026-02-17 (updated 2026-02-18)
**Depends on:** Bug 14 (term match status), per-sex foundation, multi-domain integration spec (Phase 1 minimum)
**Scope:** Post-processing layer on top of `CrossDomainSyndrome`. Does NOT modify detection logic. Enriches detected syndromes with interpretive context from all available SEND domains.

---

## What This Is

The detection engine answers: "Which syndromes are present?"
The interpretation layer answers: "Should the toxicologist believe them?"

Seven components:

1. **Certainty grading** — confirmed / uncertain / pattern_only, based on discriminating evidence
2. **Histopath cross-reference** — pull tissue findings to corroborate or contradict the syndrome
3. **Recovery assessment** — is the effect reversible?
4. **Mortality context** — did animals die, and does that change the severity ceiling?
5. **Tumor context** — are proliferative lesions present, is there a progression sequence?
6. **Food consumption context** — is body weight loss primary or secondary?
7. **Study design context** — species caveats, strain-specific expectations, route considerations

These are not seven separate features. They're one function that takes a detected syndrome plus all available study data and returns an enriched interpretation:

```typescript
function interpretSyndrome(
  // Core inputs (original)
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
  histopathData: LesionSeverityRow[],
  recoveryData: RecoveryRow[],
  organWeightData: OrganWeightRow[],
  // Multi-domain inputs (new)
  tumorData: TumorFinding[],
  mortalityData: AnimalDisposition[],
  foodConsumptionData: FoodConsumptionSummary[],
  clinicalObservations: ClinicalObservation[],
  studyContext: StudyContext,
): SyndromeInterpretation;
```

**Architectural principle:** Syndrome detection rules (XS01-XS10) are species-agnostic pattern matchers. All species/strain/duration/route context is applied here in the interpretation layer via `StudyContext`, never in the rule definitions. The toxicologist always sees the signal, with appropriate caveats to judge its meaning.

**Formal framework:** The interpretation layer implements the ECETOC Technical Report 85 (2002) two-step weight-of-evidence assessment:
- Step 1 (Treatment-related?): automated via dose-response strength, HCD comparison, statistical significance, cross-endpoint concordance
- Step 2 (Adverse?): automated via severity grading, reversibility, adaptive classification, cross-domain correlation, secondary-effect determination

---

## Data Types

```typescript
export interface SyndromeInterpretation {
  syndromeId: string;
  
  // ── Component 1: Certainty (existing) ──
  certainty: SyndromeCertainty;
  certaintyRationale: string;
  discriminatingEvidence: DiscriminatingFinding[];
  
  // ── Component 2: Histopath (existing) ──
  histopathContext: HistopathCrossRef[];
  
  // ── Component 3: Recovery (existing) ──
  recovery: SyndromeRecoveryAssessment;
  
  // ── Component 4: Mortality (new) ──
  mortalityContext: MortalityContext;
  
  // ── Component 5: Tumor (new) ──
  tumorContext: TumorContext;
  
  // ── Component 6: Food consumption (new) ──
  foodConsumptionContext: FoodConsumptionContext;
  
  // ── Component 7: Study design (new) ──
  studyDesignNotes: string[];
  // Examples:
  // XS10 (rat): "Rat QTc has limited translational value (Ito-dominated repolarization)"
  // XS04 (SD): "Sprague-Dawley hematology reference ranges differ from Wistar"
  // XS01 (13-wk): "Hepatocellular tumors at 13 weeks are extremely rare spontaneously"
  
  // ── ECETOC scores (new) ──
  treatmentRelatedness: TreatmentRelatednessScore;
  adversity: AdversityAssessment;
  
  // ── Dual badges (existing, unchanged) ──
  patternConfidence: "HIGH" | "MODERATE" | "LOW";
  mechanismCertainty: SyndromeCertainty;
  
  // ── Severity (new — accounts for mortality, tumors) ──
  overallSeverity: OverallSeverity;
  
  /** Assembled narrative for the context panel */
  narrative: string;
}

export type SyndromeCertainty =
  | "mechanism_confirmed"   // requiredMet AND discriminating evidence confirms this mechanism
  | "mechanism_uncertain"   // requiredMet BUT discriminating evidence is missing or contradicts
  | "pattern_only";         // requiredMet=false, syndrome fired on support count fallback only

export type OverallSeverity =
  | "S0_Death"        // treatment-related mortality in syndrome organs
  | "carcinogenic"    // tumors with dose-response + progression sequence
  | "proliferative"   // proliferative changes without frank carcinoma
  | "S4_Critical"     // Hy's Law, severe clinical rules
  | "S3_Adverse"      // adverse clinical rules
  | "S2_Concern"      // concern-level rules
  | "S1_Monitor"      // monitoring rules
  ;

// ── ECETOC A-factors: Treatment-relatedness ──

export interface TreatmentRelatednessScore {
  /** A-1: dose-response strength from pattern classifier */
  doseResponse: "strong" | "weak" | "absent";
  /** A-2: cross-endpoint concordance from syndrome detection */
  crossEndpoint: "concordant" | "isolated";
  /** A-4: historical control comparison */
  hcdComparison: "outside_range" | "within_range" | "no_hcd";
  /** A-6: statistical significance */
  statisticalSignificance: "significant" | "borderline" | "not_significant";
  /** A-2 extended: CL clinical observations correlate with terminal findings */
  clinicalObservationSupport: boolean;
  overall: "treatment_related" | "possibly_related" | "not_related";
}

// ── ECETOC B-factors: Adversity ──

export interface AdversityAssessment {
  /** B-2: adaptive response (e.g., hypertrophy alone = adaptive, + necrosis = adverse) */
  adaptive: boolean;
  /** B-3: transient vs persistent (from recovery assessment) */
  reversible: boolean | null;
  /** B-4: magnitude of effect */
  magnitudeLevel: "minimal" | "mild" | "moderate" | "marked" | "severe";
  /** B-5: cross-endpoint correlation (from syndrome detection) */
  crossDomainSupport: boolean;
  /** B-6: precursor to more significant effects (proliferative progression) */
  precursorToWorse: boolean;
  /** B-7: secondary to other adverse effects (BW loss from food consumption) */
  secondaryToOther: boolean;
  overall: "adverse" | "non_adverse" | "equivocal";
}

// ── Component 4: Mortality ──

export interface MortalityContext {
  /** Deaths in organs related to this syndrome */
  deathsInSyndromeOrgans: number;
  treatmentRelatedDeaths: number;
  doseRelatedMortality: boolean;
  mortalityNarrative: string;
  /** If mortality present, NOAEL cannot exceed this dose */
  mortalityNoaelCap: number | null;
  /** Animal IDs and disposition for transparency */
  deathDetails: {
    animalId: string;
    doseGroup: number;
    dispositionCode: string;
    dispositionDay: number;
    causeOfDeath?: string;
  }[];
}

// ── Component 5: Tumor ──

export interface TumorContext {
  tumorsPresent: boolean;
  tumorSummaries: TumorSummary[];
  progressionDetected: boolean;
  /** Progression stages present in this syndrome's organ */
  progressionSequence?: {
    stages: string[];           // e.g., ["necrosis", "hyperplasia", "adenoma", "carcinoma"]
    stagesPresent: string[];    // which are found in this study
    complete: boolean;          // all stages present?
  };
  strainContext: {
    strain: string;
    studyDuration: number;
    expectedBackground: "expected" | "unusual" | "very_rare";
    historicalControlRate?: { mean: number; range: [number, number] };
  };
  /** Human non-relevance mechanisms (PPARα, TSH-thyroid, α2u-globulin) */
  humanNonRelevance?: {
    mechanism: string;
    applies: boolean;
    rationale: string;
  };
  interpretation: string;
}

// ── Component 6: Food consumption ──

export interface FoodConsumptionContext {
  available: boolean;
  /** For syndromes involving body weight */
  bwFwAssessment: "primary_weight_loss" | "secondary_to_food" | "malabsorption" | "not_applicable";
  /** Food efficiency ratio vs control */
  foodEfficiencyReduced: boolean | null;
  /** Temporal: which decreased first, BW or FW? */
  temporalOnset: "bw_first" | "fw_first" | "simultaneous" | "unknown" | null;
  fwNarrative: string;
}

// ── CL clinical observation support (feeds into ECETOC A-2) ──

export interface ClinicalObservationSupport {
  /** CL observations that correlate with this syndrome's expected findings */
  correlatingObservations: {
    observation: string;       // e.g., "PALLOR", "JAUNDICE", "TREMORS"
    tier: 1 | 2 | 3;
    expectedForSyndrome: boolean;
    incidenceDoseDependent: boolean;
  }[];
  /** Does CL evidence strengthen or weaken this syndrome? */
  assessment: "strengthens" | "weakens" | "neutral" | "no_cl_data";
}

export interface DiscriminatingFinding {
  endpoint: string;
  description: string;
  expectedDirection: "up" | "down";
  actualDirection: "up" | "down" | null;
  status: "supports" | "argues_against" | "not_available";
  weight: "strong" | "moderate";
  /** Source: which data provided this evidence */
  source: "LB" | "MI" | "MA" | "OM";
}

export interface HistopathCrossRef {
  specimen: string;
  examined: boolean;
  /** What the syndrome predicts should be found */
  expectedFindings: string[];
  /** What was actually observed */
  observedFindings: HistopathObservation[];
  /** Net assessment */
  assessment: "supports" | "argues_against" | "inconclusive" | "not_examined";
}

export interface HistopathObservation {
  finding: string;
  peakSeverity: number;
  peakIncidence: number;
  doseResponse: string;
  relevance: "expected" | "unexpected" | "neutral";
  /** When the observed finding is not a direct match but implies the expected/unexpected finding */
  proxy?: {
    implies: string;          // what this finding suggests (e.g., "increased cellularity")
    relationship: string;     // how (e.g., "decreased fat vacuoles → less adipocyte space → more cellular")
    confidence: "strong" | "suggestive";
  };
}

// ── Histopath Normalization Layer ──────────────────────────────────────

/**
 * Lightweight synonym/proxy dictionary for histopath findings.
 * Not a full NLP system — just the known proxies that come up in tox studies.
 * Keyed by normalized finding text, maps to what it implies.
 */
const HISTOPATH_PROXIES: {
  pattern: RegExp;
  implies: string;
  relationship: string;
  confidence: "strong" | "suggestive";
}[] = [
  // Bone marrow cellularity proxies
  {
    pattern: /fat\s+vacuole/i,
    implies: "CELLULARITY_CHANGE",
    relationship: "Decreased fat vacuoles → reduced adipocyte space → suggests increased cellularity (hypercellularity). "
      + "Increased fat vacuoles → expanded adipocyte space → suggests decreased cellularity (hypocellularity).",
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
  // Splenic proxies
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
  // Hepatic proxies
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

/**
 * Lesion groupings: bidirectional relationships between findings
 * that represent opposite ends of the same spectrum.
 */
const LESION_SPECTRUM: { low: string; high: string; dimension: string }[] = [
  { low: "HYPOCELLULARITY", high: "HYPERCELLULARITY", dimension: "cellularity" },
  { low: "ATROPHY", high: "HYPERTROPHY", dimension: "size" },
  { low: "DECREASED_FAT", high: "INCREASED_FAT", dimension: "adiposity" },
];

function annotateWithProxy(
  observation: HistopathObservation,
): HistopathObservation {
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
 * When checking if an expected finding is present, also check proxies.
 * Example: expecting HYPOCELLULARITY, found FAT VACUOLES with dose-dependent increase
 * → proxy implies cellularity decrease → supports.
 * Expecting HYPOCELLULARITY, found FAT VACUOLES with dose-dependent decrease
 * → proxy implies cellularity increase → argues against.
 */
function checkFindingWithProxies(
  expectedFinding: string,
  observations: HistopathObservation[],
): { found: boolean; direct: boolean; proxyMatch?: HistopathObservation } {
  // Direct match first
  const direct = observations.find(o =>
    o.finding.toUpperCase().includes(expectedFinding.toUpperCase())
  );
  if (direct) return { found: true, direct: true };

  // Proxy match
  for (const obs of observations) {
    if (!obs.proxy) continue;

    // Fat vacuoles case: dose-dependent decrease in fat = increase in cellularity
    if (expectedFinding.toUpperCase().includes("HYPOCELLUL") &&
        obs.proxy.implies === "CELLULARITY_CHANGE" &&
        obs.doseResponse.includes("increase")) {
      // Increased fat → less cellular → supports hypocellularity
      return { found: true, direct: false, proxyMatch: obs };
    }
    if (expectedFinding.toUpperCase().includes("HYPOCELLUL") &&
        obs.proxy.implies === "CELLULARITY_CHANGE" &&
        obs.doseResponse.includes("decrease")) {
      // Decreased fat → more cellular → argues against hypocellularity
      return { found: false, direct: false, proxyMatch: obs };
    }
    if (expectedFinding.toUpperCase().includes("HYPERCELLUL") &&
        obs.proxy.implies === "CELLULARITY_CHANGE" &&
        obs.doseResponse.includes("decrease")) {
      // Decreased fat → more cellular → supports hypercellularity
      return { found: true, direct: false, proxyMatch: obs };
    }
  }

  return { found: false, direct: false };
}

export interface SyndromeRecoveryAssessment {
  status: "recovered" | "partial" | "not_recovered" | "not_examined" | "mixed";
  /** Per-endpoint recovery detail */
  endpoints: EndpointRecovery[];
  /** Summary narrative */
  summary: string;
}

export interface EndpointRecovery {
  label: string;
  canonical: string;
  sex: string;
  terminalEffect: number;       // effect size at terminal sacrifice
  recoveryEffect: number | null; // effect size at recovery timepoint
  recoveryPValue: number | null;
  status: "recovered" | "partial" | "not_recovered" | "not_examined";
  recoveryDay: number | null;
}
```

---

## Component 1: Certainty Grading

### Concept

Every syndrome definition has an implicit set of **discriminating findings** that separate it from its differential. These are defined per-syndrome, not discovered at runtime.

```typescript
export interface SyndromeDiscriminators {
  syndromeId: string;
  differential: string;   // what this syndrome is distinguished FROM
  findings: {
    endpoint: string;      // canonical or specimen+finding
    expectedDirection: "up" | "down";
    source: "LB" | "MI" | "MA" | "OM";
    weight: "strong" | "moderate";
    rationale: string;
    /** When true, a non-significant result for a known-sensitive assay
     *  counts as weak argues_against instead of not_available.
     *  Default false — conservative. Only set for discriminators where
     *  absence of signal is itself informative given assay sensitivity. */
    absenceMeaningful?: boolean;
  }[];
}
```

### Discriminator Definitions

#### XS04 Myelosuppression vs XS05 Hemolytic Anemia

The central differential in hematotoxicity. Both show cytopenias (RBC↓, HGB↓). Distinguished by mechanism: production failure vs peripheral destruction.

```typescript
const XS04_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS04",
  differential: "XS05 (Hemolytic anemia)",
  findings: [
    {
      endpoint: "RETIC",
      expectedDirection: "down",
      source: "LB",
      weight: "strong",
      rationale: "Reticulocyte decrease indicates marrow failure to compensate. "
        + "Increase indicates peripheral destruction with compensatory erythropoiesis.",
    },
    {
      endpoint: "BONE MARROW::HYPOCELLULARITY",
      expectedDirection: "up",  // "up" = increased incidence/severity
      source: "MI",
      weight: "strong",
      rationale: "Hypocellular marrow confirms production failure. "
        + "Hypercellular marrow argues against (compensatory response).",
    },
    {
      endpoint: "SPLEEN_WT",
      expectedDirection: "down",
      source: "OM",
      weight: "moderate",
      rationale: "Decreased spleen weight is consistent with reduced hematopoiesis. "
        + "Increased spleen weight suggests extramedullary hematopoiesis or sequestration.",
    },
    {
      endpoint: "SPLEEN::EXTRAMEDULLARY HEMATOPOIESIS",
      expectedDirection: "down",
      source: "MI",
      weight: "moderate",
      rationale: "Absence of extramedullary hematopoiesis supports marrow failure. "
        + "Presence supports peripheral destruction with compensatory production.",
    },
  ],
};
```

#### XS05 Hemolytic Anemia vs XS04 Myelosuppression

Mirror of above, opposite expected directions.

```typescript
const XS05_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS05",
  differential: "XS04 (Myelosuppression)",
  findings: [
    {
      endpoint: "RETIC",
      expectedDirection: "up",
      source: "LB",
      weight: "strong",
      rationale: "Reticulocyte increase confirms compensatory erythropoiesis "
        + "in response to peripheral red cell destruction.",
    },
    {
      endpoint: "BONE MARROW::HYPERCELLULARITY",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Hypercellular marrow confirms compensatory expansion. "
        + "Erythroid hyperplasia specifically points to hemolytic response.",
    },
    {
      endpoint: "SPLEEN_WT",
      expectedDirection: "up",
      source: "OM",
      weight: "moderate",
      rationale: "Splenomegaly suggests splenic sequestration or "
        + "extramedullary hematopoiesis — both support hemolytic process.",
    },
    {
      endpoint: "SPLEEN::PIGMENTATION",
      expectedDirection: "up",
      source: "MI",
      weight: "moderate",
      rationale: "Splenic pigmentation (hemosiderin) indicates iron deposition "
        + "from destroyed red cells.",
    },
    {
      endpoint: "TBILI",
      expectedDirection: "up",
      source: "LB",
      weight: "moderate",
      rationale: "Elevated bilirubin from hemoglobin catabolism. "
        + "Unconjugated fraction specifically indicates hemolysis.",
    },
  ],
};
```

#### XS01 Hepatocellular Injury vs XS02 Cholestatic Injury

```typescript
const XS01_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS01",
  differential: "XS02 (Cholestatic injury)",
  findings: [
    {
      endpoint: "ALP",
      expectedDirection: "down",  // ALP NOT elevated supports hepatocellular
      source: "LB",
      weight: "strong",
      rationale: "ALP within normal limits supports pure hepatocellular injury. "
        + "ALP elevation indicates cholestatic component (mixed or cholestatic pattern).",
      absenceMeaningful: true,  // ALP is always measured, high sensitivity — no elevation IS evidence
    },
    {
      endpoint: "GGT",
      expectedDirection: "down",
      source: "LB",
      weight: "moderate",
      rationale: "GGT within normal limits supports hepatocellular. "
        + "GGT elevation is a sensitive cholestatic marker.",
      absenceMeaningful: true,  // GGT is a sensitive cholestatic marker when measured
    },
    {
      endpoint: "LIVER::NECROSIS",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Hepatocyte necrosis confirms cellular injury consistent with "
        + "hepatocellular pattern.",
    },
    {
      endpoint: "LIVER::BILE DUCT HYPERPLASIA",
      expectedDirection: "down",
      source: "MI",
      weight: "strong",
      rationale: "Absence of bile duct changes supports pure hepatocellular. "
        + "Bile duct hyperplasia/inflammation indicates cholestatic component.",
    },
  ],
};
```

#### XS02 Cholestatic Injury vs XS01 Hepatocellular Injury

```typescript
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
      absenceMeaningful: true,  // ALP always measured — no elevation argues against cholestasis
    },
    {
      endpoint: "GGT",
      expectedDirection: "up",
      source: "LB",
      weight: "strong",
      rationale: "GGT elevation confirms biliary involvement.",
      absenceMeaningful: true,  // when measured, no GGT elevation argues against cholestasis
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
      rationale: "Absence of significant hepatocyte necrosis supports pure cholestatic pattern. "
        + "Presence suggests mixed hepatocellular-cholestatic injury.",
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
```

#### XS09 Nephrotoxicity

```typescript
const XS09_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS09",
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
      rationale: "Decreased urine specific gravity (dilute urine) indicates "
        + "loss of concentrating ability — tubular dysfunction.",
    },
  ],
};
```

#### Syndromes without differentials

XS03 (Mixed hepatic), XS06 (Phospholipidosis), XS07 (Stress response), XS08 (Target organ wasting): these either don't have a primary differential or the differential is straightforward. They get discriminators too, but with fewer entries:

```typescript
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
      rationale: "Lamellar bodies on electron microscopy are pathognomonic. "
        + "Standard light microscopy shows foamy macrophages.",
    },
  ],
};

const XS07_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS07",
  differential: "direct adrenal toxicity",
  findings: [
    {
      endpoint: "GLAND, ADRENAL::HYPERTROPHY",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Adrenal cortical hypertrophy is the classic stress response finding. "
        + "Adrenal necrosis or atrophy would suggest direct toxicity instead.",
    },
    {
      endpoint: "THYMUS_WT",
      expectedDirection: "down",
      source: "OM",
      weight: "moderate",
      rationale: "Thymic involution (weight decrease) is a sensitive stress marker. "
        + "Supports HPA axis activation rather than direct immune toxicity.",
    },
  ],
};

const XS10_DISCRIMINATORS: SyndromeDiscriminators = {
  syndromeId: "XS10",
  differential: "primary rhythm disorder vs secondary hemodynamic effect",
  findings: [
    {
      endpoint: "QTC",
      expectedDirection: "up",
      source: "EG",
      weight: "strong",
      rationale: "QTc prolongation indicates delayed repolarization — "
        + "ion channel effect (hERG, Nav1.5). Most translationally relevant in non-rodent species.",
    },
    {
      endpoint: "HEART::DEGENERATION",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Myocardial degeneration/necrosis confirms structural cardiac damage. "
        + "Fibrosis indicates chronic injury.",
    },
    {
      endpoint: "HEART::NECROSIS",
      expectedDirection: "up",
      source: "MI",
      weight: "strong",
      rationale: "Cardiomyocyte necrosis is direct evidence of cardiac toxicity.",
    },
    {
      endpoint: "HEART_WT",
      expectedDirection: "up",
      source: "OM",
      weight: "moderate",
      rationale: "Cardiomegaly supports chronic cardiac stress. "
        + "May be compensatory hypertrophy or pathological.",
    },
  ],
};
```

#### CL Clinical Observation Cross-Domain Correlation

Clinical observations feed into syndrome interpretation via ECETOC A-2 (consistency across endpoints). Each syndrome can have expected CL correlates:

```typescript
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
  XS07: {
    expectedObservations: ["PILOERECTION", "DECREASED ACTIVITY", "CHROMODACRYORRHEA"],
    tier: [3, 3, 2],
  },
  XS09: {
    expectedObservations: ["POLYURIA", "POLYDIPSIA"],
    tier: [3, 3],
  },
  XS10: {
    expectedObservations: ["TREMORS", "CONVULSIONS", "PROSTRATION"],
    tier: [2, 1, 1],
  },
};

function assessClinicalObservationSupport(
  syndromeId: string,
  clinicalObservations: ClinicalObservation[],
): ClinicalObservationSupport {
  const expected = SYNDROME_CL_CORRELATES[syndromeId];
  if (!expected || clinicalObservations.length === 0) {
    return { correlatingObservations: [], assessment: "no_cl_data" };
  }
  
  const correlating = expected.expectedObservations
    .map((obs, i) => {
      const found = clinicalObservations.filter(c =>
        c.observation.toUpperCase().includes(obs)
      );
      return {
        observation: obs,
        tier: expected.tier[i],
        expectedForSyndrome: true,
        incidenceDoseDependent: found.length > 0 && isDoseDependentCL(found),
      };
    })
    .filter(c => c.incidenceDoseDependent);
  
  return {
    correlatingObservations: correlating,
    assessment: correlating.length >= 2 ? "strengthens"
      : correlating.length === 1 ? "strengthens"
      : "neutral",
  };
}
```

```typescript
function assessCertainty(
  syndrome: CrossDomainSyndrome,
  discriminators: SyndromeDiscriminators,
  allEndpoints: EndpointSummary[],
  histopathData: LesionSeverityRow[],
): { certainty: SyndromeCertainty; evidence: DiscriminatingFinding[]; rationale: string } {

  const evidence: DiscriminatingFinding[] = [];

  for (const disc of discriminators.findings) {
    const result = evaluateDiscriminator(disc, allEndpoints, histopathData);
    evidence.push(result);
  }

  const supporting = evidence.filter(e => e.status === "supports");
  const against = evidence.filter(e => e.status === "argues_against");
  const strongSupporting = supporting.filter(e => e.weight === "strong");
  const strongAgainst = against.filter(e => e.weight === "strong");
  const available = evidence.filter(e => e.status !== "not_available");

  let certainty: SyndromeCertainty;
  let rationale: string;

  // First gate: did the syndrome fire through required path or fallback?
  if (!syndrome.requiredMet) {
    // Fired through support-only fallback — always pattern_only
    certainty = "pattern_only";
    rationale = "Syndrome detected through supporting evidence only. "
      + "Required findings not fully met.";
    return { certainty, evidence, rationale };
  }

  // Required IS met — now assess mechanism certainty from discriminators
  if (strongAgainst.length > 0) {
    certainty = "mechanism_uncertain";
    rationale = `Required findings met. But ${strongAgainst.map(e => e.endpoint).join(", ")} `
      + `argue${strongAgainst.length === 1 ? "s" : ""} against this specific mechanism. `
      + `Consider differential (${discriminators.differential}).`;
  } else if (strongSupporting.length > 0) {
    if (against.length === 0) {
      certainty = "mechanism_confirmed";
      rationale = `Required findings met. ${strongSupporting.map(e => e.endpoint).join(", ")} `
        + `confirm${strongSupporting.length === 1 ? "s" : ""} this mechanism. `
        + `No contradicting evidence.`;
    } else {
      // Strong support but some moderate contradiction
      certainty = "mechanism_uncertain";
      rationale = `Required findings met. ${strongSupporting.map(e => e.endpoint).join(", ")} `
        + `support this mechanism, but ${against.map(e => e.endpoint).join(", ")} `
        + `show contradicting signal. Review differential.`;
    }
  } else if (supporting.length > 0 && against.length === 0) {
    certainty = "mechanism_confirmed";
    rationale = `Required findings met. Moderate supporting evidence from `
      + `${supporting.map(e => e.endpoint).join(", ")}. No contradicting evidence.`;
  } else if (available.length === 0) {
    certainty = "mechanism_uncertain";
    rationale = "Required findings met but no discriminating evidence available. "
      + "Cannot confirm specific mechanism.";
  } else {
    certainty = "mechanism_uncertain";
    rationale = against.length > 0
      ? `Required findings met. But ${against.map(e => e.endpoint).join(", ")} argue against. `
        + `Consider differential (${discriminators.differential}).`
      : "Required findings met. Insufficient discriminating evidence to confirm mechanism.";
  }

  return { certainty, evidence, rationale };
}
```

### Evaluating a Single Discriminator

```typescript
function evaluateDiscriminator(
  disc: SyndromeDiscriminators["findings"][0],
  allEndpoints: EndpointSummary[],
  histopathData: LesionSeverityRow[],
): DiscriminatingFinding {

  // Discriminator references a lab/OM endpoint (canonical)
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

    const significant = ep.minPValue != null && ep.minPValue < 0.05;
    if (!significant) {
      // Present but not significant
      // Default: treat as not_available (absence of significance ≠ evidence of absence)
      // Exception: when absenceMeaningful=true AND assay is known-sensitive,
      // "measured and not elevated" is weak evidence against the expected direction
      if (disc.absenceMeaningful && ep.minPValue != null) {
        // The assay ran, had adequate power, and found nothing significant.
        // Direction-aware: what "nothing" means depends on what we expected.
        //   expectedDirection="up" + not significant → argues_against (expected elevation, didn't see it)
        //   expectedDirection="down" + not significant → supports (expected absence confirmed)
        // Example: XS01 expects ALP "down" (normal). ALP not significant = supports hepatocellular.
        return {
          endpoint: disc.endpoint,
          description: disc.rationale,
          expectedDirection: disc.expectedDirection,
          actualDirection: ep.direction,
          status: disc.expectedDirection === "down" ? "supports" : "argues_against",
          weight: "moderate" as const,  // downgrade from original weight — absence is weaker than opposite
          source: disc.source,
        };
      }
      return {
        endpoint: disc.endpoint,
        description: disc.rationale,
        expectedDirection: disc.expectedDirection,
        actualDirection: ep.direction,
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
      actualDirection: ep.direction,
      status: directionMatches ? "supports" : "argues_against",
      weight: disc.weight,
      source: disc.source,
    };
  }

  // Discriminator references a histopath finding (SPECIMEN::FINDING)
  const [specimen, finding] = disc.endpoint.split("::");
  const specimenRows = histopathData.filter(r =>
    r.specimen.toUpperCase().includes(specimen.toUpperCase())
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
  const findingRows = specimenRows.filter(r =>
    r.finding.toUpperCase().includes(finding.toUpperCase())
  );

  if (findingRows.length === 0) {
    // Specimen examined but finding not observed
    // If we expected it UP (present), its absence argues against
    // If we expected it DOWN (absent), its absence supports
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

  // Finding observed — check if it has a dose-dependent pattern
  const maxIncidence = Math.max(...findingRows.map(r =>
    r.n > 0 ? r.affected / r.n : 0
  ));
  const isPresent = maxIncidence > 0;

  return {
    endpoint: disc.endpoint,
    description: disc.rationale,
    expectedDirection: disc.expectedDirection,
    actualDirection: isPresent ? "up" : "down",
    status: isPresent === (disc.expectedDirection === "up") ? "supports" : "argues_against",
    weight: disc.weight,
    source: disc.source,
  };
}
```

### PointCross XS04 Trace

```
Discriminator: RETIC expected ↓
  → Found: Reticulocytes, direction=up, p=0.0032
  → Status: argues_against (strong)

Discriminator: BONE MARROW::HYPOCELLULARITY expected ↑ (present)
  → Specimen BONE MARROW examined (has rows)
  → Finding HYPOCELLULARITY not found in rows
  → Expected up (present), found absent → argues_against (strong)

Discriminator: SPLEEN_WT expected ↓
  → Found: Spleen weight, direction=up, p=0.018
  → Status: argues_against (moderate)

Discriminator: SPLEEN::EXTRAMEDULLARY HEMATOPOIESIS expected ↓ (absent)
  → Need to check if spleen histopath has this finding

Result:
  strongAgainst: [RETIC, BONE MARROW::HYPOCELLULARITY] → 2
  requiredMet: true
  certainty: "mechanism_uncertain"
  rationale: "Required findings met. But Reticulocytes, Bone marrow cellularity
              argue against this specific mechanism.
              Consider differential (XS05 Hemolytic anemia)."
```

```
PointCross XS05 Trace:

Discriminator: RETIC expected ↑
  → Found: Reticulocytes, direction=up, p=0.0032
  → Status: supports (strong)

Discriminator: BONE MARROW::HYPERCELLULARITY expected ↑ (present)
  → Check for hypercellularity finding
  → Fat vacuoles decreasing (100%→20%) suggests hypercellularity
  → But explicit HYPERCELLULARITY finding may not be coded
  → Status: depends on histopath coding

Discriminator: SPLEEN_WT expected ↑
  → Found: Spleen weight, direction=up, p=0.018
  → Status: supports (moderate)

Discriminator: SPLEEN::PIGMENTATION expected ↑ (present)
  → Check spleen histopath for pigmentation
  → Status: depends on histopath data

Discriminator: TBILI expected ↑
  → Found: Bilirubin, direction=down, p=0.87 (not significant)
  → Not significant → status: not_available

Result:
  strongSupporting: [RETIC] → 1
  moderateSupporting: [SPLEEN_WT] → 1
  against: [] → 0
  requiredMet: true
  certainty: "mechanism_confirmed"
  rationale: "Required findings met. Reticulocytes confirm compensatory erythropoiesis.
              Spleen weight increase supports splenic involvement.
              No contradicting evidence."
```

---

## Component 2: Histopath Cross-Reference

### Concept

When a syndrome has MI/MA terms (supporting or discriminating), look up the actual histopath findings for that specimen. Show what was found, not just whether the expected finding matched.

This provides context that "matched/not matched" can't:
- "Bone marrow examined. No hypocellularity. Findings: decreased fat vacuoles (dose-dependent)."
- "Liver examined. Necrosis present (dose-dependent, peak severity 2.0). Also: hypertrophy, inflammation, vacuolization."
- "Spleen examined. No atrophy. Findings: pigmentation (suggests hemosiderin)."

### Implementation

```typescript
function crossReferenceHistopath(
  syndrome: CrossDomainSyndrome,
  discriminators: SyndromeDiscriminators,
  histopathData: LesionSeverityRow[],
): HistopathCrossRef[] {

  // Collect all specimens referenced by this syndrome
  // (from supporting terms + discriminators)
  const specimens = new Set<string>();

  for (const term of syndrome.definition.supportingTerms) {
    if (term.domain === "MI" || term.domain === "MA") {
      specimens.add(term.specimen.toUpperCase());
    }
  }
  for (const disc of discriminators.findings) {
    if (disc.source === "MI" || disc.source === "MA") {
      const specimen = disc.endpoint.split("::")[0];
      specimens.add(specimen.toUpperCase());
    }
  }

  const results: HistopathCrossRef[] = [];

  for (const specimen of specimens) {
    const specimenRows = histopathData.filter(r =>
      r.specimen.toUpperCase().includes(specimen)
    );

    if (specimenRows.length === 0) {
      results.push({
        specimen,
        examined: false,
        expectedFindings: getExpectedFindings(syndrome, discriminators, specimen),
        observedFindings: [],
        assessment: "not_examined",
      });
      continue;
    }

    // Catalog all findings for this specimen
    const findingNames = [...new Set(specimenRows.map(r => r.finding))];
    const observations: HistopathObservation[] = findingNames.map(finding => {
      const rows = specimenRows.filter(r => r.finding === finding);
      const maxSev = Math.max(...rows.map(r => r.avg_severity ?? 0));
      const maxInc = Math.max(...rows.map(r => r.n > 0 ? r.affected / r.n : 0));

      // Determine if this finding is expected, unexpected, or neutral
      const expected = getExpectedFindings(syndrome, discriminators, specimen);
      const isExpected = expected.some(e =>
        finding.toUpperCase().includes(e.toUpperCase())
      );
      // "Unexpected" = a finding that the DIFFERENTIAL syndrome would predict
      const differential = getDifferentialExpected(discriminators, specimen);
      const isUnexpected = differential.some(e =>
        finding.toUpperCase().includes(e.toUpperCase())
      );

      const obs: HistopathObservation = {
        finding,
        peakSeverity: maxSev,
        peakIncidence: maxInc,
        doseResponse: classifyFindingDoseResponse(rows),
        relevance: isExpected ? "expected" as const
          : isUnexpected ? "unexpected" as const
          : "neutral" as const,
      };

      // Annotate with proxy evidence
      return annotateWithProxy(obs);
    });

    // Assess: do the histopath findings support this syndrome?
    // Use proxy matching to handle coding variations
    const expectedFindings = getExpectedFindings(syndrome, discriminators, specimen);
    let directSupport = 0;
    let proxySupport = 0;
    let directAgainst = 0;
    let proxyAgainst = 0;

    for (const expectedFinding of expectedFindings) {
      const result = checkFindingWithProxies(expectedFinding, observations);
      if (result.found && result.direct) directSupport++;
      else if (result.found && !result.direct) proxySupport++;
      else if (!result.found && result.proxyMatch) proxyAgainst++;
      // else: not found at all, neutral
    }

    const unexpectedPresent = observations.filter(o => o.relevance === "unexpected" && o.peakIncidence > 0);

    let assessment: HistopathCrossRef["assessment"];
    if ((directSupport + proxySupport) > 0 && unexpectedPresent.length === 0 && proxyAgainst === 0) {
      assessment = "supports";
    } else if (unexpectedPresent.length > 0 || proxyAgainst > 0) {
      if ((directSupport + proxySupport) > 0) {
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
      expectedFindings: getExpectedFindings(syndrome, discriminators, specimen),
      observedFindings: observations,
      assessment,
    });
  }

  return results;
}

function classifyFindingDoseResponse(rows: LesionSeverityRow[]): string {
  // Simple classification for display purposes
  const byDose = new Map<number, number>();
  for (const r of rows) {
    const inc = r.n > 0 ? r.affected / r.n : 0;
    byDose.set(r.dose_level, Math.max(byDose.get(r.dose_level) ?? 0, inc));
  }
  const sorted = [...byDose.entries()].sort((a, b) => a[0] - b[0]);
  if (sorted.length < 2) return "insufficient data";
  const incidences = sorted.map(s => s[1]);
  const increasing = incidences.every((v, i) => i === 0 || v >= incidences[i - 1] - 0.05);
  const decreasing = incidences.every((v, i) => i === 0 || v <= incidences[i - 1] + 0.05);
  if (increasing) return "dose-dependent increase";
  if (decreasing) return "dose-dependent decrease";
  return "non-monotonic";
}
```

### PointCross XS04 Histopath Output

```
HISTOPATHOLOGY CONTEXT

BONE MARROW (examined)
  Expected: hypocellularity
  Observed:
    Fat vacuoles — peak incidence 100% (control), dose-dependent decrease
      Relevance: unexpected (decreased fat = more cellular, opposite of myelosuppression)
  Assessment: argues against myelosuppression

SPLEEN (examined)
  Expected: atrophy
  Observed:
    [list actual spleen findings from histopath data]
  Assessment: [depends on findings]

LIVER — not referenced by XS04 (not shown)
```

### PointCross XS01 Histopath Output

```
HISTOPATHOLOGY CONTEXT

LIVER (examined)
  Expected: necrosis, hepatocyte degeneration
  Observed:
    Necrosis — peak severity 2.0, peak incidence 27%, dose-dependent increase ← expected
    Hypertrophy — peak severity 2.6, peak incidence 60%, dose-dependent increase ← expected
    Inflammation — peak severity 2.0, peak incidence 13%, dose-dependent increase ← expected
    Vacuolization — peak severity 3.0, peak incidence 28%, dose-dependent increase ← neutral
    Hepatocellular carcinoma — 1 animal in high dose ← sentinel
    Adenoma, hepatocellular — 1 animal in control ← neutral
  Assessment: supports (necrosis + hypertrophy + inflammation = classic hepatotoxicity pattern)
```

---

## Component 3: Recovery Assessment

### Data Source

Recovery data exists in the API response as rows with dose labels containing "recovery." Currently discarded by `pattern-classification.ts` line 113 and by `deriveEndpointSummaries()`.

```typescript
interface RecoveryRow {
  endpoint_label: string;
  sex: string;
  recovery_day: number;
  dose_level: number;
  mean: number;
  sd: number;
  p_value: number | null;
  effect_size: number | null;
  /** The terminal (pre-recovery) effect for comparison */
  terminal_effect: number | null;
}
```

Recovery rows need to be extracted separately during derivation:

```typescript
// In deriveEndpointSummaries() or a parallel function
function extractRecoveryData(rows: AdverseEffectSummaryRow[]): RecoveryRow[] {
  return rows
    .filter(r => r.dose_label.toLowerCase().includes("recovery"))
    .map(r => ({
      endpoint_label: r.endpoint_label,
      sex: r.sex,
      recovery_day: r.day,
      dose_level: r.dose_level,
      mean: r.mean_treated,
      sd: r.sd_treated,
      p_value: r.p_value_adj,
      effect_size: r.effect_size,
      terminal_effect: null, // linked in a second pass
    }));
}
```

### Recovery Assessment Logic

```typescript
function assessSyndromeRecovery(
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
    const canonical = resolveCanonical(ep.endpoint_label);
    const terminal = terminalEndpoints.find(e => e.endpoint_label === ep.endpoint_label);
    if (!terminal) continue;

    // Find recovery rows for this endpoint at the highest affected dose
    const recoveryRows = recoveryData.filter(r =>
      r.endpoint_label === ep.endpoint_label
    );

    if (recoveryRows.length === 0) {
      endpointRecoveries.push({
        label: ep.endpoint_label,
        canonical: canonical ?? ep.endpoint_label,
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
    const sexes = [...new Set(recoveryRows.map(r => r.sex))];
    for (const sex of sexes) {
      const sexRecoveryRows = recoveryRows.filter(r => r.sex === sex);
      // Use highest dose recovery row
      const highDoseRecovery = sexRecoveryRows.reduce((best, r) =>
        r.dose_level > best.dose_level ? r : best
      );

      const terminalEffect = terminal.maxEffectSize ?? 0;
      const recoveryEffect = highDoseRecovery.effect_size;
      const recoveryP = highDoseRecovery.p_value;

      let status: EndpointRecovery["status"];
      if (recoveryP == null) {
        status = "not_examined";
      } else if (recoveryP >= 0.05) {
        // Statistically no longer significant — but check for residual effect
        // A large residual effect that fails significance due to small N is NOT "recovered"
        if (recoveryEffect != null &&
            terminalEffect !== 0 &&
            Math.abs(recoveryEffect) > Math.abs(terminalEffect) * 0.33) {
          // Effect reduced but still >33% of terminal — underpowered, not truly recovered
          status = "partial";
        } else {
          status = "recovered";
        }
      } else if (recoveryEffect != null && Math.abs(recoveryEffect) < Math.abs(terminalEffect) * 0.5) {
        // Still significant but effect reduced by >50%
        status = "partial";
      } else {
        status = "not_recovered";
      }

      endpointRecoveries.push({
        label: ep.endpoint_label,
        canonical: canonical ?? ep.endpoint_label,
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
  const statuses = endpointRecoveries.map(r => r.status);
  const uniqueStatuses = new Set(statuses.filter(s => s !== "not_examined"));

  let overallStatus: SyndromeRecoveryAssessment["status"];
  if (uniqueStatuses.size === 0) {
    overallStatus = "not_examined";
  } else if (uniqueStatuses.size === 1) {
    overallStatus = [...uniqueStatuses][0] as any;
  } else {
    overallStatus = "mixed";
  }

  // Summary narrative
  const recovered = endpointRecoveries.filter(r => r.status === "recovered");
  const partial = endpointRecoveries.filter(r => r.status === "partial");
  const notRecovered = endpointRecoveries.filter(r => r.status === "not_recovered");

  let summary: string;
  if (overallStatus === "recovered") {
    summary = `All syndrome endpoints recovered by Day ${endpointRecoveries[0]?.recoveryDay}.`;
  } else if (overallStatus === "not_examined") {
    summary = "Recovery not examined in this study.";
  } else if (overallStatus === "not_recovered") {
    summary = `Effects persisted at recovery timepoint (Day ${endpointRecoveries[0]?.recoveryDay}). `
      + `Irreversible or longer recovery period needed.`;
  } else {
    const parts: string[] = [];
    if (recovered.length > 0) {
      parts.push(`${recovered.map(r => r.canonical).join(", ")} recovered`);
    }
    if (partial.length > 0) {
      parts.push(`${partial.map(r => r.canonical).join(", ")} partially recovered`);
    }
    if (notRecovered.length > 0) {
      parts.push(`${notRecovered.map(r => r.canonical).join(", ")} did not recover`);
    }
    summary = parts.join(". ") + ".";
  }

  return { status: overallStatus, endpoints: endpointRecoveries, summary };
}
```

### Recovery Status Definitions

| Status | Criterion | Regulatory implication |
|--------|-----------|----------------------|
| recovered | p ≥ 0.05 AND \|d_recovery\| < 33% of \|d_terminal\| | Reversible. Favorable for risk assessment. |
| partial | p < 0.05 but \|d_recovery\| < 50% of \|d_terminal\|, OR p ≥ 0.05 but \|d_recovery\| ≥ 33% of \|d_terminal\| (underpowered) | Trend toward recovery. May need longer recovery period. |
| not_recovered | p < 0.05 and \|d_recovery\| ≥ 50% of \|d_terminal\| | Persistent. Unfavorable. Consider for NOAEL determination. |
| not_examined | No recovery group in study, or this endpoint not measured at recovery | Cannot assess reversibility. Flag for pathologist. |
| mixed | Different endpoints within syndrome have different statuses | Report per-endpoint. |

Note on "recovered" gate: p ≥ 0.05 alone is insufficient because small recovery groups (n=5 per sex is common) lose statistical power. An endpoint can have a biologically meaningful residual effect (e.g., hemoglobin still 10% below control) that fails to reach p < 0.05 simply due to N. The 33% residual gate catches this: if more than a third of the terminal effect persists, the endpoint is "partial" regardless of p-value.

---

## Component 4: Mortality Context

### Concept

Death is the severity ceiling. If animals died from organ toxicity that a syndrome describes, the syndrome interpretation must say so. Currently the interpretation layer has no visibility into mortality.

### Implementation

```typescript
function assessMortalityContext(
  syndrome: CrossDomainSyndrome,
  mortalityData: AnimalDisposition[],
  studyContext: StudyContext,
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

  // Find treatment-related deaths
  const earlyDeaths = mortalityData.filter(d =>
    d.dispositionCode === "FOUND DEAD" ||
    d.dispositionCode === "MORIBUND SACRIFICE" ||
    d.dispositionCode === "UNSCHEDULED SACRIFICE"
  );

  const treatmentRelated = earlyDeaths.filter(d => d.treatmentRelated);

  // Check if deaths are in dose groups relevant to this syndrome
  // Deaths at high dose + syndrome fires at high dose = mortality context is relevant
  const syndromeOrgans = getSyndromeOrgans(syndrome);
  const deathsInOrgans = treatmentRelated.filter(d =>
    d.causeOfDeath && syndromeOrgans.some(o =>
      d.causeOfDeath!.toUpperCase().includes(o.toUpperCase())
    )
  );

  // Dose-related mortality: higher dose groups have more deaths
  const deathsByDose = new Map<number, number>();
  treatmentRelated.forEach(d => {
    deathsByDose.set(d.doseGroup, (deathsByDose.get(d.doseGroup) || 0) + 1);
  });
  const doseRelated = isDoseRelatedMortality(deathsByDose);

  // NOAEL cap: lowest dose with treatment-related death
  const doseWithDeath = [...deathsByDose.keys()].sort((a, b) => a - b);
  const mortalityNoaelCap = doseWithDeath.length > 0
    ? doseWithDeath[0] - 1  // dose below lowest fatal dose, or 0 if lowest dose
    : null;

  const narrative = treatmentRelated.length === 0
    ? "No treatment-related mortality."
    : `${treatmentRelated.length} treatment-related death(s). ` +
      (deathsInOrgans.length > 0
        ? `${deathsInOrgans.length} attributed to ${syndromeOrgans.join("/")} — ` +
          `directly relevant to this syndrome.`
        : `Cause of death not directly linked to syndrome organs.`);

  return {
    deathsInSyndromeOrgans: deathsInOrgans.length,
    treatmentRelatedDeaths: treatmentRelated.length,
    doseRelatedMortality: doseRelated,
    mortalityNarrative: narrative,
    mortalityNoaelCap,
    deathDetails: treatmentRelated.map(d => ({
      animalId: d.animalId,
      doseGroup: d.doseGroup,
      dispositionCode: d.dispositionCode,
      dispositionDay: d.dispositionDay,
      causeOfDeath: d.causeOfDeath,
    })),
  };
}
```

**Impact on overallSeverity:** If `mortalityContext.deathsInSyndromeOrgans > 0`, severity is `S0_Death` regardless of any other assessment. If `treatmentRelatedDeaths > 0` but not in syndrome organs, severity is at least `S4_Critical`.

---

## Component 5: Tumor Context

### Concept

Tumors in the same organ system as a syndrome transform the interpretation. XS01 (hepatocellular injury) with liver adenomas/carcinomas goes from "liver injury" to "hepatocarcinogenic potential." The syndrome provides the mechanism; the tumors provide the consequence.

### Implementation

```typescript
function assessTumorContext(
  syndrome: CrossDomainSyndrome,
  tumorData: TumorFinding[],
  studyContext: StudyContext,
): TumorContext {

  if (tumorData.length === 0) {
    return {
      tumorsPresent: false,
      tumorSummaries: [],
      progressionDetected: false,
      interpretation: "No tumor data available or no tumors found.",
    };
  }

  const syndromeOrgans = getSyndromeOrgans(syndrome);
  const relevantTumors = tumorData.filter(t =>
    syndromeOrgans.some(o => t.organ.toUpperCase().includes(o.toUpperCase()))
  );

  if (relevantTumors.length === 0) {
    return {
      tumorsPresent: false,
      tumorSummaries: [],
      progressionDetected: false,
      interpretation: "Tumors found in study but not in organs related to this syndrome.",
    };
  }

  // Check for progression sequence
  const progressionSequence = detectProgressionSequence(
    relevantTumors,
    syndrome,
    studyContext,
  );

  // Strain/duration context
  const strainExpectation = assessStrainExpectation(
    relevantTumors[0].organ,
    relevantTumors[0].morphology,
    studyContext,
  );

  // Human non-relevance check
  const humanNonRelevance = checkHumanNonRelevance(
    relevantTumors,
    syndrome,
  );

  const interpretation = buildTumorNarrative(
    relevantTumors,
    progressionSequence,
    strainExpectation,
    humanNonRelevance,
  );

  return {
    tumorsPresent: true,
    tumorSummaries: summarizeTumors(relevantTumors),
    progressionDetected: progressionSequence !== undefined,
    progressionSequence,
    strainContext: strainExpectation,
    humanNonRelevance,
    interpretation,
  };
}

/** Detect proliferative continuum: normal → hyperplasia → adenoma → carcinoma */
function detectProgressionSequence(
  tumors: TumorFinding[],
  syndrome: CrossDomainSyndrome,
  studyContext: StudyContext,
): TumorContext["progressionSequence"] | undefined {

  // Known organ progressions
  const PROGRESSIONS: Record<string, string[]> = {
    LIVER:          ["foci of cellular alteration", "hyperplasia", "adenoma", "carcinoma"],
    "THYROID GLAND":["hyperplasia", "adenoma", "carcinoma"],
    "MAMMARY GLAND":["hyperplasia", "fibroadenoma", "adenocarcinoma"],
    KIDNEY:         ["hyperplasia", "adenoma", "carcinoma"],
  };

  const organ = tumors[0]?.organ?.toUpperCase();
  const stages = PROGRESSIONS[organ];
  if (!stages) return undefined;

  // Check which stages are present — tumors + MI findings from syndrome
  const tumorMorphologies = tumors.map(t => t.morphology.toLowerCase());
  const syndromeFindings = syndrome.matchedTerms
    .filter(t => t.domain === "MI")
    .map(t => t.finding?.toLowerCase() || "");

  const allFindings = [...tumorMorphologies, ...syndromeFindings];
  const stagesPresent = stages.filter(stage =>
    allFindings.some(f => f.includes(stage))
  );

  if (stagesPresent.length < 2) return undefined;

  return {
    stages,
    stagesPresent,
    complete: stagesPresent.length === stages.length,
  };
}

/** Strain-specific background expectation */
function assessStrainExpectation(
  organ: string,
  morphology: string,
  studyContext: StudyContext,
): TumorContext["strainContext"] {
  // At 13 weeks: virtually all spontaneous tumors are "very_rare"
  // At 26 weeks: some become "unusual"
  // At 104 weeks: use strain-specific HCD rates
  const expectedBackground = studyContext.studyDuration <= 13 ? "very_rare"
    : studyContext.studyDuration <= 26 ? "unusual"
    : "expected";  // would need HCD lookup for 2-year studies

  return {
    strain: studyContext.strain,
    studyDuration: studyContext.studyDuration,
    expectedBackground,
    // historicalControlRate populated from HCD library for 2-year studies
  };
}

/** Known human non-relevance mechanisms */
const HUMAN_NON_RELEVANCE: {
  mechanism: string;
  organs: string[];
  rationale: string;
}[] = [
  {
    mechanism: "PPARα",
    organs: ["LIVER"],
    rationale: "PPARα-mediated hepatocellular tumors in rodents — "
      + "not predictive of human risk per STP/IARC/EPA/FDA consensus.",
  },
  {
    mechanism: "TSH-thyroid",
    organs: ["THYROID GLAND"],
    rationale: "TSH-mediated thyroid follicular tumors at pharmacological doses — "
      + "rodent-specific threshold mechanism. Requires UDGT induction evidence.",
  },
  {
    mechanism: "α2u-globulin",
    organs: ["KIDNEY"],
    rationale: "α2u-globulin nephropathy — male rat-specific protein, no human homologue. "
      + "Only applies to male rats.",
  },
];
```

**Impact on overallSeverity:** If `progressionDetected && strainContext.expectedBackground === "very_rare"`, severity is `carcinogenic`. If proliferative changes without frank carcinoma, severity is `proliferative`.

---

## Component 6: Food Consumption Context

### Concept

Body weight syndromes (XS07 Stress response, XS08 Target organ wasting) need food consumption data to determine whether weight loss is primary (direct toxicity) or secondary (palatability/taste aversion). This is ECETOC B-7 (secondary to other adverse effects).

### Implementation

```typescript
function assessFoodConsumptionContext(
  syndrome: CrossDomainSyndrome,
  foodConsumptionData: FoodConsumptionSummary[],
  allEndpoints: EndpointSummary[],
): FoodConsumptionContext {

  // Only relevant for syndromes involving body weight
  const bwInvolved = syndrome.matchedTerms.some(t =>
    t.canonical === "BW" || t.canonical === "BWG"
  );

  if (!bwInvolved || foodConsumptionData.length === 0) {
    return {
      available: foodConsumptionData.length > 0,
      bwFwAssessment: "not_applicable",
      foodEfficiencyReduced: null,
      temporalOnset: null,
      fwNarrative: bwInvolved
        ? "Food consumption data not available — cannot distinguish primary vs secondary weight loss."
        : "Not applicable (syndrome does not involve body weight).",
    };
  }

  // Food efficiency ratio: BW gain / food consumed
  // If FER unchanged despite BW decrease → secondary (palatability)
  // If FER decreased → primary (metabolic toxicity)
  const ferReduced = foodConsumptionData.some(f =>
    f.foodEfficiencyRatio !== null &&
    f.foodEfficiencyRatioVsControl !== null &&
    f.foodEfficiencyRatioVsControl < -0.10  // >10% reduction in FER
  );

  // Temporal: which decreased first?
  const fwOnsetDay = foodConsumptionData
    .filter(f => f.significantVsControl)
    .sort((a, b) => a.studyDay - b.studyDay)[0]?.studyDay ?? null;

  const bwEndpoint = allEndpoints.find(e =>
    e.endpoint_label.toUpperCase().includes("BODY WEIGHT")
  );
  const bwOnsetDay = bwEndpoint?.firstSignificantDay ?? null;

  let temporalOnset: FoodConsumptionContext["temporalOnset"] = "unknown";
  if (fwOnsetDay !== null && bwOnsetDay !== null) {
    if (fwOnsetDay < bwOnsetDay - 3) temporalOnset = "fw_first";
    else if (bwOnsetDay < fwOnsetDay - 3) temporalOnset = "bw_first";
    else temporalOnset = "simultaneous";
  }

  // Assessment
  let assessment: FoodConsumptionContext["bwFwAssessment"];
  if (!ferReduced && temporalOnset === "fw_first") {
    assessment = "secondary_to_food";  // FER normal + FW decreased first → palatability
  } else if (ferReduced && temporalOnset === "bw_first") {
    assessment = "primary_weight_loss";  // FER impaired + BW first → direct toxicity
  } else if (ferReduced) {
    assessment = "malabsorption";  // FER impaired regardless of timing
  } else {
    assessment = "secondary_to_food";  // default when FER is normal
  }

  const fwNarrative = assessment === "secondary_to_food"
    ? "Body weight decrease is likely secondary to reduced food consumption (palatability). "
      + "Food efficiency ratio is unchanged — animals consume less but utilize normally."
    : assessment === "primary_weight_loss"
    ? "Body weight decrease appears to be primary toxic effect. "
      + "Food efficiency ratio is impaired — animals cannot maintain weight despite adequate intake."
    : assessment === "malabsorption"
    ? "Food efficiency ratio is reduced — suggests metabolic impairment or malabsorption."
    : "";

  return {
    available: true,
    bwFwAssessment: assessment,
    foodEfficiencyReduced: ferReduced,
    temporalOnset,
    fwNarrative,
  };
}
```

**Impact on adversity (ECETOC B-7):** If `bwFwAssessment === "secondary_to_food"`, the BW finding itself may be classified as non-adverse (B-7: secondary to other effects). The palatability issue is the primary finding; BW loss is its consequence.

---

## Component 7: Study Design Context

### Concept

Species, strain, duration, and route all affect interpretation. Rather than embedding this knowledge in syndrome rules (which would make them brittle), `StudyContext` carries it and interpretation adds notes. This implements the architectural principle: **rules are species-agnostic, interpretation is species-aware.**

### Implementation

```typescript
function assembleStudyDesignNotes(
  syndrome: CrossDomainSyndrome,
  studyContext: StudyContext,
): string[] {
  const notes: string[] = [];

  // ── Species-specific ──
  
  // XS10 cardiovascular: rat QTc has limited translational value
  if (syndrome.id === "XS10" && !studyContext.ecgInterpretation.qtTranslational) {
    notes.push(studyContext.ecgInterpretation.qtCaveat!);
  }
  // QTc correction mismatch
  if (syndrome.id === "XS10" && studyContext.ecgInterpretation.correctionMismatch) {
    notes.push(studyContext.ecgInterpretation.correctionNote!);
  }
  // Temperature correction for dogs
  if (syndrome.id === "XS10" && studyContext.ecgInterpretation.temperatureCorrectionRelevant) {
    notes.push("QTc changes ~14ms per °C in dogs. Verify core body temperature was measured.");
  }

  // ── Strain-specific ──
  
  // Hematology reference ranges differ by strain
  if (["XS04", "XS05"].includes(syndrome.id)) {
    if (studyContext.strain.toUpperCase().includes("FISCHER") ||
        studyContext.strain.toUpperCase().includes("F344")) {
      notes.push(
        "Fischer 344 rats have high background mononuclear cell leukemia (~38% males). " +
        "Interpret hematology findings in context of strain predisposition."
      );
    }
  }

  // ── Duration-specific ──

  // Tumors at 13 weeks are very unusual
  if (studyContext.studyDuration <= 13) {
    const hasTumorTerms = syndrome.matchedTerms.some(t => t.domain === "TF");
    if (hasTumorTerms) {
      notes.push(
        `Neoplastic findings at ${studyContext.studyDuration} weeks are extremely rare ` +
        `spontaneously in ${studyContext.strain}. Any tumors are likely treatment-related.`
      );
    }
  }

  // ── Route-specific ──

  // Oral gavage GI findings may be route-related
  if (studyContext.route?.toUpperCase().includes("GAVAGE")) {
    const giSyndrome = ["XS08"].includes(syndrome.id); // target organ wasting may include GI
    if (giSyndrome) {
      notes.push(
        "Oral gavage route: GI tract findings may include route-related irritation. " +
        "Distinguish local (esophagus, forestomach) from systemic (small intestine, colon) effects."
      );
    }
  }

  // ── Recovery arm ──
  
  if (studyContext.recoveryDuration === undefined || studyContext.recoveryDuration === 0) {
    // No note needed — recovery component says "not examined"
  } else {
    notes.push(
      `Recovery period: ${studyContext.recoveryDuration} weeks. ` +
      `Reversibility data available — see Recovery section.`
    );
  }

  return notes;
}
```

**Impact on mechanismCertainty:** When `!studyContext.ecgInterpretation.qtTranslational` for XS10, certainty is capped at `mechanism_uncertain` regardless of discriminating evidence. The ion channel biology limitation trumps statistical evidence.

---

## Assembled Output: Syndrome Context Panel

All seven components render into one panel:

```
MYELOSUPPRESSION (XS04)
3 endpoints · 3 domains · MECHANISM UNCERTAIN
Pattern HIGH · Mechanism UNCERTAIN

⚠  MECHANISM UNCERTAIN — discriminating evidence argues against myelosuppression
   Required findings are met. Cytopenias are real.
   But evidence points to peripheral destruction (XS05), not marrow failure.

ECETOC ASSESSMENT
  Treatment-related: YES (strong dose-response, significant, concordant across LB+OM)
  Adverse: YES (marked severity, cross-domain support, not secondary)

CERTAINTY ASSESSMENT
  vs Hemolytic anemia (XS05):
  ⊘ Reticulocytes: expected ↓, found ↑ (STRONG — argues against)
  ⊘ Bone marrow: expected hypocellular, not observed (STRONG — argues against)
  ⊘ Spleen weight: expected ↓, found ↑ (moderate — argues against)
  — Splenic EMH: not examined

CLINICAL OBSERVATIONS
  ✓ PALLOR observed — dose-dependent (Tier 2, strengthens)

HISTOPATHOLOGY CONTEXT
  BONE MARROW (examined):
    Fat vacuoles — 100%→67%→20%→20% (dose-dep decrease)
    Note: decreased fat vacuoles may indicate hypercellularity
    Assessment: argues against myelosuppression

MORTALITY
  No treatment-related deaths attributable to hematological findings.

TUMOR CONTEXT
  No tumors in hematological organs.

FOOD CONSUMPTION
  Not applicable (syndrome does not involve body weight).

RECOVERY
  Not examined in this study.

STUDY DESIGN
  (no species/strain/route notes for this syndrome)

EVIDENCE SUMMARY
  Required: MET (2 of 3 arms)
    ✓ NEUT ↓              LB  p=0.0003  adverse
    ✗ PLAT ↓              LB  not significant
    ✓ RBC ↓ AND HGB ↓     LB  p=0.040 / p<0.0001  adverse

  Supporting: 0 of 4 (2 argue against)
    ⊘ RETIC ↓             LB  found ↑ (argues against)
    ✗ Bone marrow hypo    MI  not observed (examined)
    ✗ Spleen atrophy      MI  not measured
    ⊘ Spleen weight ↓     OM  found ↑ (argues against)
```

For XS01 Hepatocellular Injury (with PointCross data), the panel would include:

```
HEPATOCELLULAR INJURY (XS01)
5 endpoints · 3 domains · MECHANISM CONFIRMED
Pattern HIGH · Mechanism CONFIRMED · Severity: CARCINOGENIC

✓  MECHANISM CONFIRMED — liver necrosis present, no cholestatic features.

ECETOC ASSESSMENT
  Treatment-related: YES (strong dose-response, outside HCD, significant, concordant across LB+MI+OM)
  Adverse: YES (severe — progression to carcinoma, irreversible structural damage)

CERTAINTY ASSESSMENT
  vs Cholestatic injury (XS02):
  ✓ ALP: expected normal, is normal (moderate — supports hepatocellular)
  ✓ GGT: expected normal, is normal (moderate — supports)
  ✓ Liver necrosis: expected present, found (STRONG — supports)
  ✓ Bile duct hyperplasia: expected absent, absent (STRONG — supports)

MORTALITY
  ⚠ 2 treatment-related deaths (found dead Day 67, moribund Day 78)
  Both at 200 mg/kg. Cause: hepatic failure.
  Severity: S0_Death. NOAEL cannot exceed 20 mg/kg.

TUMOR CONTEXT
  ⚠ HEPATOCARCINOGENIC POTENTIAL
  Hepatocellular findings:
    Adenoma, benign: 2 animals
    Carcinoma, malignant: 2 animals
  
  Progression sequence detected:
    ✓ Necrosis (MI) → ✓ Hypertrophy (MI) → ✓ Adenoma (TF) → ✓ Carcinoma (TF)
    Complete hepatocarcinogenesis sequence.
  
  Strain context: Sprague-Dawley, 13-week study.
  Background expectation: VERY RARE.
  At 13 weeks, hepatocellular tumors are essentially absent from published HCD
  (survey of 2,249 SD rats age 12-18 weeks: only 4 total tumors, none hepatocellular).

FOOD CONSUMPTION
  Not applicable.

RECOVERY
  Not examined in this study.

STUDY DESIGN
  Neoplastic findings at 13 weeks are extremely rare spontaneously in Sprague-Dawley.
  Any tumors are likely treatment-related.

EVIDENCE SUMMARY
  Required: MET
    ✓ ALT ↑    LB  p<0.0001  adverse
    ✓ AST ↑    LB  p<0.0001  adverse
    ...
```

For XS10 Cardiovascular (in PointCross, a rat study):

```
CARDIOVASCULAR RISK (XS10)
2 endpoints · 1 domain · MECHANISM UNCERTAIN
Pattern MODERATE · Mechanism UNCERTAIN

⚠  SPECIES CAVEAT: Rat ventricular repolarization is Ito-dominated,
   not IKr/IKs. QTc changes have limited predictive value for human
   QT prolongation risk. Confirmatory assessment in a non-rodent
   species is recommended per ICH S7B.

⚠  Correction: Sponsor applied Bazett (QTcB). Less consequential
   in rodents due to different repolarization physiology.

ECETOC ASSESSMENT
  Treatment-related: POSSIBLY (dose-response present, but species caveat)
  Adverse: EQUIVOCAL (limited translational value in rodents)

CERTAINTY ASSESSMENT
  Mechanism certainty capped at UNCERTAIN due to species limitation.
  ✓ QTcB increase: dose-dependent
  — Heart histopath: no degeneration or necrosis observed
  — Heart weight: no significant change

MORTALITY
  No treatment-related deaths attributable to cardiovascular effects.

TUMOR CONTEXT
  Not applicable.

RECOVERY
  Not examined.

STUDY DESIGN
  ⚠ Rat QTc has limited translational value (Ito-dominated repolarization).
  ⚠ Correction formula (Bazett) moot for rodent interpretation.
```

Note: domain count is now 3 (LB, MI, OM) because domains are counted from all *checked* terms, not just matched ones. See "Domain Counting Fix" below.

### Dual Badges: Pattern Confidence vs Mechanism Certainty

These are two independent assessments shown as separate badges:

**Pattern confidence** answers: "Are the cytopenias / enzyme elevations / etc. real?"
Based on: `requiredMet`, domain coverage breadth, statistical evidence, trend tests.

**Mechanism certainty** answers: "Is it specifically this mechanism (e.g., marrow failure vs peripheral destruction)?"
Based on: discriminating evidence polarity from `assessCertainty()`.

```
XS04 Myelosuppression
  Pattern: HIGH (required met, 3 domains checked, strong statistics)
  Mechanism: UNCERTAIN (RETIC↑ and spleen weight↑ argue against marrow failure)

XS05 Hemolytic anemia
  Pattern: MODERATE (required met, 3 domains, supporting evidence)
  Mechanism: CONFIRMED (RETIC↑ confirms compensatory response)

XS01 Hepatocellular injury
  Pattern: HIGH (required met, 4 domains, adverse severity)
  Mechanism: CONFIRMED (liver necrosis present, no bile duct changes)
```

This separation matters because a toxicologist needs both dimensions. XS04 with high pattern confidence but uncertain mechanism says: "The blood picture is real and concerning, but the cause might not be marrow failure — investigate hemolytic anemia." Collapsing both into a single confidence score loses this nuance.

UI rendering:

```
┌──────────────────────────────────────────┐
│ MYELOSUPPRESSION (XS04)                  │
│ Pattern HIGH · Mechanism UNCERTAIN       │
│ 3 endpoints · 3 domains                  │
│                                          │
│ ⚠ Discriminating evidence argues against │
│   marrow failure — see differential      │
└──────────────────────────────────────────┘
```

The pattern badge uses the existing confidence color scheme (green/amber/gray for HIGH/MODERATE/LOW). The mechanism badge uses a separate scheme: green check for CONFIRMED, amber question for UNCERTAIN, gray dash for PATTERN_ONLY (requiredMet=false).

Compare to XS05 (abbreviated — same structure, different interpretation):

```
HEMOLYTIC ANEMIA (XS05)
3 endpoints · 3 domains · MECHANISM CONFIRMED
Pattern MODERATE · Mechanism CONFIRMED · Severity: S3_Adverse

✓  MECHANISM CONFIRMED — discriminating evidence supports hemolytic process
   Required findings met. Compensatory markers confirm peripheral destruction.

ECETOC ASSESSMENT
  Treatment-related: YES
  Adverse: YES (confirmed mechanism, cross-domain concordance)

CERTAINTY ASSESSMENT
  vs Myelosuppression (XS04):
  ✓ Reticulocytes: expected ↑, found ↑ (STRONG — supports)
  — Bone marrow cellularity: not explicitly coded
  ✓ Spleen weight: expected ↑, found ↑ (moderate — supports)
  ? Spleen pigmentation: check histopath
  — Bilirubin: not significant (p=0.87)

CLINICAL OBSERVATIONS
  ✓ PALLOR observed — dose-dependent (Tier 2, strengthens)

HISTOPATHOLOGY CONTEXT
  SPLEEN (examined):
    [actual spleen findings listed]
    
  BONE MARROW (examined):
    Fat vacuoles — dose-dependent decrease (suggests hypercellularity)
    Assessment: consistent with compensatory marrow expansion

MORTALITY
  No treatment-related deaths.

RECOVERY
  Not examined in this study.

EVIDENCE SUMMARY
  Required: MET
    ...
  Supporting: ...
```

---

## Domain Counting Fix (Bug 15)

The current confidence computation only counts domains from *matched* terms. This produces artificially low domain counts when supporting terms are present but in opposite direction or not significant.

**Current behavior:** XS04 shows 1 domain (LB) because RETIC is mislabeled as MI and "not found," spleen weight is "not found" (Bug 14).

**After Bug 14 + M3 fixes:** RETIC correctly labeled LB (already counted), Spleen weight found as opposite in OM, bone marrow examined in MI. But if confidence only counts *matched* domains, it's still 1 (only LB has matched terms).

**Fix:** Count domains from any term with status other than "not_measured":

```typescript
// In syndrome confidence computation
function countDomainsCovered(
  termResults: TermMatchResult[],
): string[] {
  return [...new Set(
    termResults
      .filter(t => t.status !== "not_measured")
      .map(t => t.domainLabel)
  )];
}
```

Domain count measures breadth of evidence evaluation, not breadth of positive evidence. If we checked OM and found the opposite direction, we still *checked* OM. The breadth is 3 domains.

**Impact on confidence:**

| Before fixes | After fixes |
|-------------|-------------|
| 1 domain (LB only) → LOW | 3 domains (LB, MI, OM) → MODERATE or HIGH |

Combined with `requiredMet=true`, 3 checked domains should yield at least MODERATE confidence. The certainty label "mechanism_uncertain" then correctly tells the toxicologist: "We're confident cytopenias are real (3 domains, required met) but the mechanism evidence points to hemolytic anemia, not myelosuppression."

**Also fix Evidence Summary display (Bug 15b):**

The "3 of 4 met" flat count misrepresents compound ANY-logic. Display must reflect the actual logical structure:

```typescript
function renderRequiredSummary(
  syndrome: CrossDomainSyndrome,
  termResults: TermMatchResult[],
): string {
  // Check if required logic is compound (ANY/AND arms)
  if (syndrome.definition.requiredLogic.type === "ANY") {
    const arms = syndrome.definition.requiredLogic.arms;
    const metArms = arms.filter(arm => isArmMet(arm, termResults));
    return `Required: MET (${metArms.length} of ${arms.length} arms)`;
  }
  // Simple flat list
  const met = termResults.filter(t =>
    t.term.role === "required" && t.status === "matched"
  );
  const total = termResults.filter(t => t.term.role === "required");
  return `Required: ${met.length} of ${total.length} met`;
}
```
```

---

## Tests

```typescript
// Shared test fixtures
const emptyMortality: AnimalDisposition[] = [];
const emptyTumors: TumorFinding[] = [];
const emptyFood: FoodConsumptionSummary[] = [];
const emptyCL: ClinicalObservation[] = [];
const ratContext: StudyContext = {
  species: "RAT", strain: "SPRAGUE-DAWLEY", studyDuration: 13,
  studyType: "SUBCHRONIC", route: "ORAL GAVAGE", glpCompliant: true,
  ecgInterpretation: deriveECGInterpretation("RAT", null),
};
const dogContext: StudyContext = {
  species: "DOG", strain: "BEAGLE", studyDuration: 13,
  studyType: "SUBCHRONIC", route: "ORAL CAPSULE", glpCompliant: true,
  ecgInterpretation: deriveECGInterpretation("DOG", null),
};

/** Helper: full 10-argument call with defaults for unused inputs */
function interp(
  syndrome: CrossDomainSyndrome,
  overrides?: Partial<{
    endpoints: EndpointSummary[];
    histopath: LesionSeverityRow[];
    recovery: RecoveryRow[];
    organWeights: OrganWeightRow[];
    tumors: TumorFinding[];
    mortality: AnimalDisposition[];
    food: FoodConsumptionSummary[];
    cl: ClinicalObservation[];
    context: StudyContext;
  }>,
) {
  return interpretSyndrome(
    syndrome,
    overrides?.endpoints ?? endpoints,
    overrides?.histopath ?? histopath,
    overrides?.recovery ?? [],
    overrides?.organWeights ?? [],
    overrides?.tumors ?? emptyTumors,
    overrides?.mortality ?? emptyMortality,
    overrides?.food ?? emptyFood,
    overrides?.cl ?? emptyCL,
    overrides?.context ?? ratContext,
  );
}

describe("syndrome interpretation layer", () => {

  // ── Component 1: Certainty ──

  test("XS04 certainty is mechanism_uncertain when RETIC is up", () => {
    const result = interp(xs04);
    expect(result.certainty).toBe("mechanism_uncertain");
  });

  test("XS05 certainty is mechanism_confirmed when RETIC is up and spleen weight is up", () => {
    const result = interp(xs05);
    expect(result.certainty).toBe("mechanism_confirmed");
  });

  test("XS01 certainty is mechanism_uncertain — ALP significantly elevated argues against pure hepatocellular", () => {
    // In PointCross, ALP is significant and UP — strong argues_against for XS01
    // (hepatocellular expects ALP normal/down). Necrosis supports, but the strong
    // contradicting evidence prevents confirmation.
    const result = interp(xs01);
    expect(result.certainty).toBe("mechanism_uncertain");
  });

  test("certainty rationale mentions the discriminating endpoints", () => {
    const result = interp(xs04);
    expect(result.certaintyRationale).toContain("Reticulocytes");
  });

  // ── absenceMeaningful ──

  test("ALP not significant counts as weak argues_against for XS01 (absenceMeaningful=true)", () => {
    const alpNotSig = makeEndpoint({ label: "Alkaline Phosphatase", direction: null, minPValue: 0.35 });
    const testEndpoints = [...endpoints.filter(e => e.endpoint_label !== "Alkaline Phosphatase"), alpNotSig];
    const result = interp(xs01, { endpoints: testEndpoints });
    const alpDisc = result.discriminatingEvidence.find(e => e.endpoint === "ALP");
    expect(alpDisc?.status).not.toBe("not_available");
  });

  test("TBILI not significant is not_available (absenceMeaningful=false by default)", () => {
    const result = interp(xs05);
    const tbiliDisc = result.discriminatingEvidence.find(e => e.endpoint === "TBILI");
    expect(tbiliDisc?.status).toBe("not_available");
  });

  // ── Component 2: Histopath proxy matching ──

  test("fat vacuoles decrease recognized as proxy for hypercellularity", () => {
    const result = interp(xs04);
    const bmRef = result.histopathContext.find(h => h.specimen === "BONE MARROW");
    expect(bmRef).toBeDefined();
    const fatVac = bmRef!.observedFindings.find(f =>
      f.finding.toUpperCase().includes("FAT VACUOLE")
    );
    expect(fatVac?.proxy).toBeDefined();
    expect(fatVac?.proxy?.implies).toBe("CELLULARITY_CHANGE");
  });

  test("bone marrow with decreasing fat vacuoles argues against XS04 hypocellularity", () => {
    const result = interp(xs04);
    const bmRef = result.histopathContext.find(h => h.specimen === "BONE MARROW");
    expect(bmRef?.assessment).toBe("argues_against");
  });

  test("bone marrow cross-ref shows fat vacuoles for XS04", () => {
    const result = interp(xs04);
    const bmRef = result.histopathContext.find(h => h.specimen === "BONE MARROW");
    expect(bmRef).toBeDefined();
    expect(bmRef!.examined).toBe(true);
    expect(bmRef!.observedFindings.some(f =>
      f.finding.toUpperCase().includes("FAT VACUOLE")
    )).toBe(true);
  });

  test("liver cross-ref shows necrosis for XS01", () => {
    const result = interp(xs01);
    const liverRef = result.histopathContext.find(h =>
      h.specimen.includes("LIVER")
    );
    expect(liverRef).toBeDefined();
    expect(liverRef!.observedFindings.some(f =>
      f.finding.toUpperCase().includes("NECROSIS")
    )).toBe(true);
    expect(liverRef!.assessment).toBe("supports");
  });

  test("not-examined specimen is marked as such", () => {
    const noMarrow = histopath.filter(r =>
      !r.specimen.toUpperCase().includes("BONE MARROW")
    );
    const result = interp(xs04, { histopath: noMarrow });
    const bmRef = result.histopathContext.find(h => h.specimen === "BONE MARROW");
    expect(bmRef?.examined).toBe(false);
    expect(bmRef?.assessment).toBe("not_examined");
  });

  // ── Component 3: Recovery with effect size gate ──

  test("recovered requires both p>=0.05 AND small residual effect", () => {
    const mockRecovery: RecoveryRow[] = [{
      endpoint_label: "Neutrophils",
      sex: "M",
      recovery_day: 120,
      dose_level: 3,
      mean: 1.02,
      sd: 0.15,
      p_value: 0.45,
      effect_size: -0.3,
      terminal_effect: -2.45,
    }];
    const result = interp(xs04, { recovery: mockRecovery });
    const neutRecovery = result.recovery.endpoints.find(e => e.label === "Neutrophils");
    expect(neutRecovery?.status).toBe("recovered");
  });

  test("large residual effect with p>=0.05 is partial, not recovered (underpowered)", () => {
    const mockRecovery: RecoveryRow[] = [{
      endpoint_label: "Neutrophils",
      sex: "M",
      recovery_day: 120,
      dose_level: 3,
      mean: 0.85,
      sd: 0.20,
      p_value: 0.08,
      effect_size: -1.5,
      terminal_effect: -2.45,
    }];
    const result = interp(xs04, { recovery: mockRecovery });
    const neutRecovery = result.recovery.endpoints.find(e => e.label === "Neutrophils");
    expect(neutRecovery?.status).toBe("partial");
  });

  test("recovery not_examined when no recovery data", () => {
    const result = interp(xs04);
    expect(result.recovery.status).toBe("not_examined");
  });

  test("not_recovered status when recovery p < 0.05 and effect persists", () => {
    const mockRecovery: RecoveryRow[] = [{
      endpoint_label: "Neutrophils",
      sex: "M",
      recovery_day: 120,
      dose_level: 3,
      mean: 0.75,
      sd: 0.18,
      p_value: 0.002,
      effect_size: -2.10,
      terminal_effect: -2.45,
    }];
    const result = interp(xs04, { recovery: mockRecovery });
    const neutRecovery = result.recovery.endpoints.find(e => e.label === "Neutrophils");
    expect(neutRecovery?.status).toBe("not_recovered");
  });

  // ── Component 4: Mortality ──

  test("mortality context shows no deaths when mortality data is empty", () => {
    const result = interp(xs01);
    expect(result.mortalityContext.treatmentRelatedDeaths).toBe(0);
    expect(result.overallSeverity).not.toBe("S0_Death");
  });

  test("treatment-related deaths elevate severity to S0_Death", () => {
    const deaths: AnimalDisposition[] = [
      {
        animalId: "PC201708-4003",
        doseGroup: 3,
        sex: "M",
        dispositionCode: "FOUND DEAD",
        dispositionDay: 67,
        treatmentRelated: true,
        causeOfDeath: "LIVER FAILURE",
        excludeFromTerminalStats: true,
      },
    ];
    const result = interp(xs01, { mortality: deaths });
    expect(result.mortalityContext.treatmentRelatedDeaths).toBe(1);
    expect(result.mortalityContext.deathsInSyndromeOrgans).toBe(1);
    expect(result.overallSeverity).toBe("S0_Death");
  });

  test("deaths in unrelated organs don't count as syndrome-organ deaths", () => {
    const deaths: AnimalDisposition[] = [
      {
        animalId: "PC201708-5001",
        doseGroup: 3,
        sex: "M",
        dispositionCode: "FOUND DEAD",
        dispositionDay: 80,
        treatmentRelated: true,
        causeOfDeath: "RENAL FAILURE",
        excludeFromTerminalStats: true,
      },
    ];
    // XS01 is hepatocellular — renal death is not in syndrome organs
    const result = interp(xs01, { mortality: deaths });
    expect(result.mortalityContext.treatmentRelatedDeaths).toBe(1);
    expect(result.mortalityContext.deathsInSyndromeOrgans).toBe(0);
  });

  // ── Component 5: Tumor ──

  test("tumor progression sequence detected for XS01 with hepatocellular tumors", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "hepatocellular adenoma", behavior: "BENIGN", animalId: "4005", doseGroup: 3 },
      { organ: "LIVER", morphology: "hepatocellular carcinoma", behavior: "MALIGNANT", animalId: "4003", doseGroup: 3 },
    ];
    const result = interp(xs01, { tumors });
    expect(result.tumorContext.tumorsPresent).toBe(true);
    expect(result.tumorContext.progressionDetected).toBe(true);
    expect(result.tumorContext.progressionSequence?.stagesPresent).toContain("adenoma");
    expect(result.tumorContext.progressionSequence?.stagesPresent).toContain("carcinoma");
  });

  test("13-week hepatocellular tumors are VERY RARE for SD rats", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "hepatocellular adenoma", behavior: "BENIGN", animalId: "4005", doseGroup: 3 },
    ];
    const result = interp(xs01, { tumors });
    expect(result.tumorContext.strainContext?.expectedBackground).toBe("very_rare");
  });

  test("tumors in unrelated organs don't appear in syndrome tumor context", () => {
    const tumors: TumorFinding[] = [
      { organ: "KIDNEY", morphology: "tubular adenoma", behavior: "BENIGN", animalId: "5001", doseGroup: 3 },
    ];
    const result = interp(xs01, { tumors }); // XS01 is liver
    expect(result.tumorContext.tumorsPresent).toBe(false);
  });

  test("severity elevated to carcinogenic when progression + very_rare background", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "hepatocellular adenoma", behavior: "BENIGN", animalId: "4005", doseGroup: 3 },
      { organ: "LIVER", morphology: "hepatocellular carcinoma", behavior: "MALIGNANT", animalId: "4003", doseGroup: 3 },
    ];
    const result = interp(xs01, { tumors });
    expect(result.overallSeverity).toBe("carcinogenic");
  });

  // ── Component 6: Food consumption ──

  test("secondary_to_food when FER normal and FW decreased first", () => {
    const food: FoodConsumptionSummary[] = [{
      doseGroup: 3,
      studyDay: 7,
      foodConsumption: 12.5,
      foodConsumptionVsControl: -0.25,
      foodEfficiencyRatio: 0.18,
      foodEfficiencyRatioVsControl: -0.02,  // < 10% reduction → FER normal
      significantVsControl: true,
    }];
    const bwEndpoints = endpoints.map(e =>
      e.endpoint_label.includes("Body Weight")
        ? { ...e, firstSignificantDay: 14 }  // BW significant later
        : e
    );
    const result = interp(xs07, { food, endpoints: bwEndpoints });
    expect(result.foodConsumptionContext.bwFwAssessment).toBe("secondary_to_food");
    expect(result.adversity.secondaryToOther).toBe(true);
  });

  test("primary_weight_loss when FER impaired and BW decreased first", () => {
    const food: FoodConsumptionSummary[] = [{
      doseGroup: 3,
      studyDay: 14,
      foodConsumption: 15.0,
      foodConsumptionVsControl: -0.05,
      foodEfficiencyRatio: 0.10,
      foodEfficiencyRatioVsControl: -0.35,  // >10% reduction → FER impaired
      significantVsControl: true,
    }];
    const bwEndpoints = endpoints.map(e =>
      e.endpoint_label.includes("Body Weight")
        ? { ...e, firstSignificantDay: 7 }  // BW significant first
        : e
    );
    const result = interp(xs07, { food, endpoints: bwEndpoints });
    expect(result.foodConsumptionContext.bwFwAssessment).toBe("primary_weight_loss");
  });

  test("not_applicable when syndrome doesn't involve body weight", () => {
    const result = interp(xs01); // liver, no BW involvement
    expect(result.foodConsumptionContext.bwFwAssessment).toBe("not_applicable");
  });

  // ── Component 7: Study design context ──

  test("XS10 in rat study gets species caveat", () => {
    const result = interp(xs10, { context: ratContext });
    expect(result.studyDesignNotes).toContainEqual(
      expect.stringContaining("Ito-dominated")
    );
    expect(result.mechanismCertainty).toBe("mechanism_uncertain");
  });

  test("XS10 in dog study gets no species caveat", () => {
    const result = interp(xs10, { context: dogContext });
    expect(result.studyDesignNotes).not.toContainEqual(
      expect.stringContaining("Ito-dominated")
    );
    // Mechanism certainty determined by actual evidence, not capped
    expect(result.mechanismCertainty).not.toBe("mechanism_uncertain");
  });

  test("13-week tumor note added when TF terms are present", () => {
    const tumors: TumorFinding[] = [
      { organ: "LIVER", morphology: "hepatocellular adenoma", behavior: "BENIGN", animalId: "4005", doseGroup: 3 },
    ];
    const result = interp(xs01, { tumors });
    expect(result.studyDesignNotes).toContainEqual(
      expect.stringContaining("extremely rare")
    );
  });

  // ── ECETOC scores ──

  test("treatment-relatedness is treatment_related for strong dose-response + significant", () => {
    const result = interp(xs01);
    expect(result.treatmentRelatedness.doseResponse).toBe("strong");
    expect(result.treatmentRelatedness.statisticalSignificance).toBe("significant");
    expect(result.treatmentRelatedness.overall).toBe("treatment_related");
  });

  test("adversity is adverse for cross-domain syndrome with confirmed mechanism", () => {
    const result = interp(xs01);
    expect(result.adversity.crossDomainSupport).toBe(true);
    expect(result.adversity.overall).toBe("adverse");
  });

  // ── Dual badges ──

  test("XS04 has HIGH pattern but UNCERTAIN mechanism", () => {
    const result = interp(xs04);
    expect(result.patternConfidence).toBe("HIGH");
    expect(result.mechanismCertainty).toBe("mechanism_uncertain");
  });

  test("XS05 has CONFIRMED mechanism", () => {
    const result = interp(xs05);
    expect(result.mechanismCertainty).toBe("mechanism_confirmed");
  });

  // ── Narrative ──

  test("narrative is non-empty", () => {
    const result = interp(xs04);
    expect(result.narrative.length).toBeGreaterThan(50);
  });

  test("narrative mentions mortality when deaths present", () => {
    const deaths: AnimalDisposition[] = [{
      animalId: "PC201708-4003", doseGroup: 3, sex: "M",
      dispositionCode: "FOUND DEAD", dispositionDay: 67,
      treatmentRelated: true, causeOfDeath: "LIVER FAILURE",
      excludeFromTerminalStats: true,
    }];
    const result = interp(xs01, { mortality: deaths });
    expect(result.narrative).toContain("death");
  });
});
```

---

## Implementation Order

```
Phase A: Core interpretation (Components 1-3, original scope)
  1. Discriminator definitions (pure data — XS01-XS10)
  2. assessCertainty() function
  3. evaluateDiscriminator() function  
  4. crossReferenceHistopath() function
  5. assessSyndromeRecovery() function
  6. interpretSyndrome() orchestrator (5-arg version first)
  7. Syndrome context panel UI updates (certainty + histopath + recovery)
  8. Tests for Components 1-3

Phase B: Multi-domain enrichment (Components 4-7, requires multi-domain integration)
  9.  Expand interpretSyndrome() to 10-arg version
  10. assessMortalityContext() (requires DD/DS parsed — Phase 2 of multi-domain spec)
  11. assessTumorContext() + detectProgressionSequence() (requires TF parsed — Phase 3)
  12. assessFoodConsumptionContext() (requires FW parsed — Phase 4)
  13. assembleStudyDesignNotes() (requires TS parsed — Phase 1)
  14. Compute ECETOC treatmentRelatedness and adversity scores
  15. Compute overallSeverity
  16. Update syndrome context panel UI with new sections
  17. Tests for Components 4-7

Phase C: CL integration
  18. assessClinicalObservationSupport() (requires CL processing)
  19. Add CL section to context panel
  20. Tests for CL correlation
```

Phase A ships standalone — it's the original spec and depends only on Bug 14 + per-sex foundation. Steps 1-5 deliver certainty grading + histopath + recovery. Step 6 wires them together. Step 7 renders. Can be shipped incrementally — certainty alone is valuable.

Phase B ships with the multi-domain integration phases. Each component becomes available as its data source comes online. The 10-arg signature accepts nulls/empty arrays gracefully, so partial data is fine. Step 13 (study design notes) can ship as soon as TS is parsed (Phase 1 of multi-domain). Step 10 (mortality) ships with Phase 2. Step 11 (tumors) with Phase 3. Step 12 (food consumption) with Phase 4.

Phase C ships independently — CL data processing is a separate concern.

---

## Dependencies

| Component | Requires |
|-----------|----------|
| **Phase A** | |
| Certainty grading | Bug 14 fix (term match status), `CrossDomainSyndrome` detection working |
| Histopath cross-ref | `LesionSeverityRow[]` accessible from Findings view (may need prop threading) |
| Recovery assessment | Recovery rows extracted from API response (currently discarded) |
| **Phase B** | |
| Mortality context | DD/DS parsed and `AnimalDisposition[]` available (multi-domain Phase 2) |
| Tumor context | TF parsed and `TumorFinding[]` available (multi-domain Phase 3) |
| Food consumption | FW parsed and `FoodConsumptionSummary[]` available (multi-domain Phase 4) |
| Study design notes | TS parsed and `StudyContext` available (multi-domain Phase 1) |
| ECETOC scores | Components 1-6 all contributing inputs |
| Overall severity | Mortality + tumor context both available |
| **Phase C** | |
| CL correlation | CL domain processed with observation tiers and dose-response |
| **Cross-cutting** | |
| Per-sex interpretation | Per-sex foundation (`bySex` on EndpointSummary) |

**Critical path:** Phase A can ship immediately after Bug 14. Phase B depends on multi-domain integration phases shipping in order (Phase 1 → 2 → 3 → 4). Study design notes (Phase B, step 13) has the lightest dependency — only needs TS parse — and should ship first within Phase B.

**Graceful degradation:** The 10-arg signature accepts empty arrays for any data source not yet available. Components 4-7 return sensible defaults ("No mortality data available", "Not applicable", etc.) when their data is absent. This means the agent can ship the expanded signature before all multi-domain phases are complete — the interpretation just gets richer as more data comes online.
