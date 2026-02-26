/**
 * Syndrome ECETOC Assessment Module
 *
 * Mortality context, tumor context, food consumption context,
 * ECETOC A-factor treatment-relatedness, B-factor adversity assessment,
 * and overall severity cascade.
 *
 * Extracted from syndrome-interpretation.ts for module ergonomics.
 * OWN §10.4 (B-7 secondary-to-BW) integrates here via computeAdversity().
 */

import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome, EndpointMatch } from "@/lib/cross-domain-syndromes";
import { getSyndromeDefinition } from "@/lib/cross-domain-syndromes";
import type { LesionSeverityRow } from "@/types/analysis-views";
import type { StudyContext } from "@/types/study-context";
import type { StudyMortality } from "@/types/mortality";
import { assessSecondaryToBodyWeight } from "@/lib/organ-weight-normalization";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";
import {
  STAT_SIG_THRESHOLDS,
  DOSE_RESPONSE_THRESHOLDS,
} from "@/lib/syndrome-interpretation-types";
import type {
  SyndromeCertainty,
  OverallSeverity,
  MortalityContext,
  AnimalDisposition,
  TumorContext,
  TumorFinding,
  HumanNonRelevance,
  FoodConsumptionContext,
  FoodConsumptionSummaryResponse,
  TreatmentRelatednessScore,
  TRReasoningFactor,
  AdversityAssessment,
  ClinicalObservationSupport,
  SyndromeRecoveryAssessment,
  SyndromeInterpretation,
} from "@/lib/syndrome-interpretation-types";

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
      isRecoveryArm: d.is_recovery,
      doseLabel: d.dose_label,
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
      isRecoveryArm: a.is_recovery,
      doseLabel: a.dose_label,
    });
  }
  return dispositions;
}

/**
 * Assess mortality context for a syndrome.
 * Matches cause-of-death text against syndrome organ terms,
 * computes dose-related mortality pattern, and builds narrative.
 */
// @field FIELD-07 — mortalityNoaelCap assignment
// @field FIELD-30 — mortalityNoaelCapRelevant tri-state
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
      mortalityNoaelCapRelevant: false,
      deathDetails: [],
    };
  }

  const treatmentRelated = mortalityData.filter((d) => d.treatmentRelated && !d.isRecoveryArm);
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
  // Determine NOAEL cap relevance
  let capRelevant: boolean | null = false;
  if (mortalityNoaelCap == null) {
    capRelevant = false;
  } else if (syndromeOrgans.length === 0) {
    capRelevant = null;
  } else {
    capRelevant = deathsInOrgans > 0;
  }

  if (mortalityNoaelCap != null) {
    if (capRelevant === true) {
      parts.push(`Mortality caps NOAEL at dose level ${mortalityNoaelCap}.`);
    } else if (capRelevant === false) {
      parts.push(`Study-level mortality NOAEL cap (dose level ${mortalityNoaelCap}) — deaths not attributed to this syndrome's target organs.`);
    } else {
      parts.push(`Study-level mortality NOAEL cap (dose level ${mortalityNoaelCap}) — relevance to this syndrome cannot be determined automatically. Review death circumstances.`);
    }
  }

  return {
    deathsInSyndromeOrgans: deathsInOrgans,
    treatmentRelatedDeaths: treatmentRelated.length,
    doseRelatedMortality: doseRelated,
    mortalityNarrative: parts.join(" "),
    mortalityNoaelCap: mortalityNoaelCap ?? null,
    mortalityNoaelCapRelevant: capRelevant,
    deathDetails: treatmentRelated.map((d) => ({
      animalId: d.animalId,
      doseGroup: d.doseGroup,
      dispositionCode: d.dispositionCode,
      dispositionDay: d.dispositionDay,
      causeOfDeath: d.causeOfDeath,
      doseLabel: d.doseLabel,
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
// @species SPECIES-01, SPECIES-04 — rodent-specific tumor mechanisms (PPARα, TSH-mediated, α2u-globulin)
function assessHumanNonRelevance(
  tumors: TumorFinding[],
  studyContext: StudyContext,
): HumanNonRelevance[] {
  const species = studyContext.species.toUpperCase();
  const isRodent = species.includes("RAT") || species.includes("MOUSE");
  const isMaleRat = species.includes("RAT");
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

  results.push({
    mechanism: "PPARα agonism",
    applies: isRodent && hasLiverTumor,
    rationale: isRodent && hasLiverTumor
      ? "Rodent hepatocellular tumors may arise from PPARα-mediated peroxisome proliferation, a pathway with minimal human relevance due to lower receptor density in human liver."
      : "Not applicable — no liver tumors in rodent species.",
  });

  results.push({
    mechanism: "TSH-mediated thyroid",
    applies: isRodent && hasThyroidTumor,
    rationale: isRodent && hasThyroidTumor
      ? "Rodent thyroid follicular cell tumors often result from sustained TSH elevation via hepatic enzyme induction. Rats are highly susceptible; human thyroid is less responsive to this mechanism."
      : "Not applicable — no thyroid tumors in rodent species.",
  });

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

  const syndromeOrgans = getSyndromeOrgans(syndrome.id);
  if (syndromeOrgans.length === 0) {
    return {
      tumorsPresent: false,
      tumorSummaries: [],
      progressionDetected: false,
      interpretation: "Tumor context not applicable — syndrome has no organ-specific terms.",
    };
  }
  const relevantTumors = tumorData.filter((t) => {
    const tumorOrgan = t.organ.toUpperCase();
    return syndromeOrgans.some(
      (so) => tumorOrgan.includes(so) || so.includes(tumorOrgan),
    );
  });

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
// @field FIELD-29 — food consumption context (bwFwAssessment)
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
// @field FIELD-04 — treatment-relatedness A-factor scoring and overall verdict
// @field FIELD-21 — doseResponse sub-field (strong/weak/absent)
// @field FIELD-22 — statisticalSignificance sub-field
// @field FIELD-23 — hcdComparison sub-field (always "no_hcd")
export function computeTreatmentRelatedness(
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
  clSupport: ClinicalObservationSupport,
): TreatmentRelatednessScore {
  // A-1: dose-response strength
  const matchedLabelsA1 = new Set(syndrome.matchedEndpoints.map((m) => m.endpoint_label));
  const matchedEpsA1 = allEndpoints.filter((ep) => matchedLabelsA1.has(ep.endpoint_label));

  const STRONG_PATTERNS = new Set<string>(DOSE_RESPONSE_THRESHOLDS.strongPatterns);
  const hasStrongPattern = matchedEpsA1.some((ep) =>
    (STRONG_PATTERNS.has(ep.pattern) && ep.minPValue != null && ep.minPValue < DOSE_RESPONSE_THRESHOLDS.strongPatternP) ||
    (ep.minPValue != null && ep.minPValue < DOSE_RESPONSE_THRESHOLDS.pairwiseHighP && Math.abs(ep.maxEffectSize ?? 0) >= DOSE_RESPONSE_THRESHOLDS.pairwiseMinEffect)
  );
  const hasAnyPattern = matchedEpsA1.some((ep) =>
    ep.pattern !== "flat" && ep.pattern !== "insufficient_data"
  );

  const doseResponse: TreatmentRelatednessScore["doseResponse"] =
    hasStrongPattern ? "strong"
    : hasAnyPattern ? "weak"
    : "absent";

  // A-2: cross-endpoint concordance
  const crossEndpoint: TreatmentRelatednessScore["crossEndpoint"] =
    syndrome.domainsCovered.length >= 2 ? "concordant" : "isolated";

  // A-6: statistical significance
  const matchedLabels = new Set(syndrome.matchedEndpoints.map((m) => m.endpoint_label));
  const matchedEps = allEndpoints.filter((ep) => matchedLabels.has(ep.endpoint_label));
  const minP = matchedEps.reduce<number | null>((min, ep) => {
    if (ep.minPValue == null) return min;
    return min == null ? ep.minPValue : Math.min(min, ep.minPValue);
  }, null);

  const statisticalSignificance: TreatmentRelatednessScore["statisticalSignificance"] =
    minP != null && minP < STAT_SIG_THRESHOLDS.significant
      ? "significant"
      : minP != null && minP < STAT_SIG_THRESHOLDS.borderline
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

  // REM-17: Build factor-by-factor reasoning trace
  const drScore = doseResponse === "strong" ? 2 : doseResponse === "weak" ? 1 : 0;
  const ceScore = crossEndpoint === "concordant" ? 1 : 0;
  const ssScore = statisticalSignificance === "significant" ? 1 : statisticalSignificance === "borderline" ? 0.5 : 0;
  const clScore = clinicalObs ? 1 : 0;
  const reasoning: TRReasoningFactor[] = [
    {
      factor: "A-1 Dose-response",
      value: doseResponse,
      score: drScore,
      detail: doseResponse === "strong"
        ? `Strong pattern in ≥1 matched endpoint (p < 0.1 or pairwise p < 0.01 with |g| ≥ 0.8)`
        : doseResponse === "weak"
          ? `Non-flat pattern but no endpoint meets strength criteria`
          : `No dose-response pattern detected`,
    },
    {
      factor: "A-2 Cross-endpoint concordance",
      value: crossEndpoint,
      score: ceScore,
      detail: crossEndpoint === "concordant"
        ? `Concordant across ${syndrome.domainsCovered.join(", ")} (${syndrome.domainsCovered.length} domains)`
        : `Isolated to single domain`,
    },
    {
      factor: "A-3 HCD comparison",
      value: "no_hcd",
      score: 0,
      detail: `Historical control data not available`,
    },
    {
      factor: "A-6 Statistical significance",
      value: statisticalSignificance,
      score: ssScore,
      detail: minP != null
        ? `Min p-value: ${minP.toFixed(4)} → ${statisticalSignificance}`
        : `No p-values available`,
    },
    {
      factor: "A-7 Clinical observation support",
      value: clinicalObs ? "yes" : "no",
      score: clScore,
      detail: clinicalObs
        ? `Clinical observations strengthen the signal`
        : `No supporting clinical observations`,
    },
  ];

  return {
    doseResponse,
    crossEndpoint,
    hcdComparison: "no_hcd",
    statisticalSignificance,
    clinicalObservationSupport: clinicalObs,
    overall,
    reasoning,
  };
}

// ─── Step 15: ECETOC Adversity Assessment ───────────────────

/**
 * Derive magnitude level from the maximum effect size of matched endpoints.
 * Uses Cohen's d thresholds adapted for tox:
 *   |d| < 0.5 → minimal, < 1.0 → mild, < 1.5 → moderate, < 2.0 → marked, ≥ 2.0 → severe
 */
// @field FIELD-24 — magnitudeLevel derivation from max |Cohen's d|
// @species SPECIES-01 — thresholds are rat-derived; proxied for dog, NHP, mouse, rabbit
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

/** REM-21: Extract max histopathologic severity grade from actual MI data.
 *  This is the pathologist's tissue grading, separate from statistical magnitude.
 *  avg_severity scale: 1=minimal, 2=mild, 3=moderate, 4=marked, 5=severe. */
// @field FIELD-11 — histopathSeverityGrade (pathologist grading, not regulatory tier)
export function deriveHistopathSeverityGrade(
  histopathData: LesionSeverityRow[],
): SyndromeInterpretation["histopathSeverityGrade"] {
  if (histopathData.length === 0) return null;
  const maxSev = Math.max(...histopathData.map((r) => r.avg_severity ?? 0));
  if (maxSev >= 4.5) return "severe";
  if (maxSev >= 3.5) return "marked";
  if (maxSev >= 2.5) return "moderate";
  if (maxSev >= 1.5) return "mild";
  if (maxSev > 0) return "minimal";
  return "none";
}

// REM-10: Stress endpoint labels
const STRESS_ENDPOINT_LABELS = new Set([
  "lymphocytes", "lymphocyte count",
  "leukocytes", "white blood cells", "white blood cell count",
  "body weight",
]);
function isStressEndpoint(ep: EndpointMatch): boolean {
  const label = ep.endpoint_label.toLowerCase();
  if (STRESS_ENDPOINT_LABELS.has(label)) return true;
  if (ep.domain === "OM") {
    const lbl = label.toLowerCase();
    if (lbl.includes("thymus") || lbl.includes("spleen") || lbl.includes("adrenal")) return true;
  }
  if (ep.domain === "BW") return true;
  return false;
}

// REM-16: Adaptive response patterns
const ADAPTIVE_FOLD_THRESHOLD = 5.0;

// @field FIELD-25 — adaptive pattern check (XS01 enzyme induction)
function checkAdaptivePattern(
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
  histopathData: LesionSeverityRow[],
): boolean {
  if (syndrome.id !== "XS01") return false;

  const matchedLabels = new Set(syndrome.matchedEndpoints.map((m) => m.endpoint_label));
  const matchedEps = allEndpoints.filter((ep) => matchedLabels.has(ep.endpoint_label));

  const hasLiverWeight = matchedEps.some(
    (ep) => ep.domain === "OM" && ep.specimen?.toLowerCase().includes("liver") && ep.direction === "up",
  );
  if (!hasLiverWeight) return false;

  const miHypertrophy = matchedEps.some(
    (ep) => ep.domain === "MI" && ep.finding?.toLowerCase().includes("hypertrophy"),
  );
  const histoHypertrophy = histopathData.some(
    (r) => r.specimen?.toLowerCase().includes("liver") && r.finding?.toLowerCase().includes("hypertrophy"),
  );
  if (!miHypertrophy && !histoHypertrophy) return false;

  const miNecrosis = matchedEps.some((ep) => {
    if (ep.domain !== "MI") return false;
    const f = ep.finding?.toLowerCase() ?? "";
    return f.includes("necrosis") || f.includes("degeneration");
  });
  const histoNecrosis = histopathData.some((r) => {
    if (!r.specimen?.toLowerCase().includes("liver")) return false;
    const f = r.finding?.toLowerCase() ?? "";
    return f.includes("necrosis") || f.includes("degeneration");
  });
  if (miNecrosis || histoNecrosis) return false;

  const liverEnzymes = matchedEps.filter(
    (ep) => ep.domain === "LB" && ep.direction === "up" &&
    (ep.testCode === "ALT" || ep.testCode === "AST" ||
     ep.endpoint_label.toLowerCase().includes("aminotransferase")),
  );
  const maxFold = liverEnzymes.reduce<number>(
    (max, ep) => Math.max(max, Math.abs(ep.maxFoldChange ?? 1)),
    1,
  );
  if (maxFold >= ADAPTIVE_FOLD_THRESHOLD) return false;

  return true;
}

/**
 * Compute ECETOC B-factor adversity assessment.
 *
 * - B-2 (adaptive): REM-16 enzyme induction check for XS01
 * - B-3 (reversible): from recovery assessment
 * - B-4 (magnitudeLevel): from matched endpoints' max effect size
 * - B-5 (crossDomainSupport): from domain coverage
 * - B-6 (precursorToWorse): from tumor context progression detection
 * - B-7 (secondaryToOther): from food consumption context
 * - REM-10: stress confound check when XS08 is co-detected
 */
// @field FIELD-05 — adversity overall verdict (priority-ordered decision tree)
// @field FIELD-24 — magnitudeLevel sub-field (Cohen's d thresholds)
// @field FIELD-25 — adaptive sub-field (XS01 enzyme induction)
// @field FIELD-26 — stressConfound sub-field (XS08 overlap check)
export function computeAdversity(
  syndrome: CrossDomainSyndrome,
  allEndpoints: EndpointSummary[],
  recovery: SyndromeRecoveryAssessment,
  certainty: SyndromeCertainty,
  tumorContext: TumorContext,
  foodConsumptionContext: FoodConsumptionContext,
  histopathData: LesionSeverityRow[],
  allDetectedSyndromeIds: string[],
  normalizationContexts?: NormalizationContext[],
): AdversityAssessment {
  const reversible =
    recovery.status === "recovered" ? true
    : recovery.status === "not_recovered" ? false
    : recovery.status === "partial" ? false
    : null;

  const magnitudeLevel = deriveMagnitudeLevel(syndrome, allEndpoints);

  const crossDomainSupport = syndrome.domainsCovered.length >= 2;

  const precursorToWorse = tumorContext.progressionDetected;

  const secondaryToFood =
    foodConsumptionContext.bwFwAssessment === "secondary_to_food";

  // B-7: BW confounding
  const worstNormCtx = normalizationContexts
    ? normalizationContexts.reduce<NormalizationContext | undefined>(
        (worst, ctx) => (!worst || ctx.tier > worst.tier ? ctx : worst),
        undefined,
      )
    : undefined;
  const secondaryToBWResult = worstNormCtx
    ? assessSecondaryToBodyWeight(worstNormCtx, allDetectedSyndromeIds)
    : null;
  const secondaryToBW = secondaryToBWResult && secondaryToBWResult.isSecondary
    ? { ...secondaryToBWResult, bwG: worstNormCtx!.bwG } : null;

  const secondaryToOther = secondaryToFood || (secondaryToBW?.isSecondary ?? false);

  // REM-16: Check adaptive response pattern (XS01 enzyme induction)
  const adaptive = checkAdaptivePattern(syndrome, allEndpoints, histopathData);

  // REM-10: Stress confound
  const xs08Detected = allDetectedSyndromeIds.includes("XS08");
  let stressConfound = false;
  if (xs08Detected && (syndrome.id === "XS07" || syndrome.id === "XS04")) {
    const nonStressEvidence = syndrome.matchedEndpoints.filter(
      (ep) => !isStressEndpoint(ep),
    );
    stressConfound = nonStressEvidence.length === 0;
  }

  // Overall adversity decision tree
  let overall: AdversityAssessment["overall"];
  if (precursorToWorse) {
    overall = "adverse";
  } else if (adaptive) {
    overall = "equivocal";
  } else if (stressConfound) {
    overall = "equivocal";
  } else if (secondaryToOther) {
    // B-7: BW confounding or secondary-to-food demotes to equivocal —
    // the organ weight change may be explained by body weight loss,
    // not direct drug action. Conservative: equivocal, not non_adverse.
    overall = "equivocal";
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
    adaptive,
    stressConfound,
    reversible,
    magnitudeLevel,
    crossDomainSupport,
    precursorToWorse,
    secondaryToOther,
    secondaryToBW: secondaryToBW ? {
      isSecondary: secondaryToBW.isSecondary,
      confidence: secondaryToBW.confidence,
      bwG: secondaryToBW.bwG,
    } : null,
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
// @field FIELD-01 — overall severity cascade assignment
export function deriveOverallSeverity(
  mortalityContext: MortalityContext,
  tumorContext: TumorContext,
  adversity: AdversityAssessment,
  certainty: SyndromeCertainty,
): OverallSeverity {
  if (mortalityContext.deathsInSyndromeOrgans > 0) return "S0_Death";
  if (tumorContext.tumorsPresent && tumorContext.progressionDetected) return "carcinogenic";
  if (tumorContext.tumorsPresent) return "proliferative";
  if (mortalityContext.treatmentRelatedDeaths > 0) return "S4_Critical";
  if ((certainty === "mechanism_confirmed" || certainty === "mechanism_uncertain") && adversity.overall === "adverse") return "S3_Adverse";
  if (adversity.overall === "adverse") return "S2_Concern";
  if (adversity.overall === "non_adverse") return "S1_Monitor";
  return "S2_Concern";
}
