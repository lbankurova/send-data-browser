/**
 * Syndrome Translational Confidence + Orchestrator Module
 *
 * MedDRA dictionary lookup, concordance-based translational confidence scoring,
 * and the main `interpretSyndrome()` orchestrator that coordinates all modules.
 *
 * Extracted from syndrome-interpretation.ts for module ergonomics.
 */

import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { LesionSeverityRow } from "@/types/analysis-views";
import type { StudyContext } from "@/types/study-context";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";
import meddraMapping from "@/data/send-to-meddra-v3.json";
import {
  TRANSLATIONAL_BINS,
  DISCRIMINATOR_REGISTRY,
  SYNDROME_SOC_MAP,
} from "@/lib/syndrome-interpretation-types";
import type {
  SyndromeCertainty,
  DiscriminatingFinding,
  UpgradeEvidenceResult,
  TranslationalConfidence,
  SyndromeInterpretation,
  RecoveryRow,
  OrganWeightRow,
  TumorFinding,
  AnimalDisposition,
  FoodConsumptionSummaryResponse,
  ClinicalObservation,
} from "@/lib/syndrome-interpretation-types";

// Certainty module
import {
  assessCertainty,
  applyCertaintyCaps,
  checkSpeciesPreferredMarkers,
} from "@/lib/syndrome-certainty";

// Cross-reference module
import {
  crossReferenceHistopath,
  assessSyndromeRecovery,
  assessClinicalObservationSupport,
  assembleStudyDesignNotes,
} from "@/lib/syndrome-cross-reference";

// ECETOC module
import {
  assessMortalityContext,
  assessTumorContext,
  assessFoodConsumptionContext,
  computeTreatmentRelatedness,
  computeAdversity,
  deriveOverallSeverity,
  deriveHistopathSeverityGrade,
} from "@/lib/syndrome-ecetoc";

// ─── Translational Confidence Scoring ─────────────────────
// Data: concordance-v0 — Liu & Fan 2026 paper text, 2026-02-18

const CONCORDANCE_DATA_VERSION = "concordance-v0";

/** SOC-level LR+ by species. Midpoints of approximate ranges from Liu & Fan Fig. 3C. */
// @species SPECIES-01, SPECIES-02, SPECIES-03, SPECIES-04, SPECIES-05 — species-specific concordance LR+
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
// @species SPECIES-01, SPECIES-02, SPECIES-03, SPECIES-04 — species-specific PT-level concordance LR+
const KNOWN_PT_CONCORDANCE: Record<string, { species: string; lrPlus: number }[]> = {
  "immune-mediated hepatitis": [{ species: "mouse", lrPlus: 462.4 }],
  "hepatic necrosis": [{ species: "rat", lrPlus: 8.7 }, { species: "dog", lrPlus: 12.3 }],
  "cholestasis": [{ species: "rat", lrPlus: 6.1 }],
  "hepatotoxicity": [{ species: "all", lrPlus: 2.2 }],
  "hepatic function abnormal": [{ species: "all", lrPlus: 4.2 }],
  "liver disorder": [{ species: "all", lrPlus: 3.2 }],
  "neutropenia": [{ species: "all", lrPlus: 16.1 }],
  "anemia": [{ species: "all", lrPlus: 10.1 }],
  "thrombocytopenia": [{ species: "all", lrPlus: 8.4 }],
  "hypertriglyceridemia": [{ species: "rat", lrPlus: 112.7 }],
  "hyperglycemia": [{ species: "all", lrPlus: 34.4 }],
  "hyperphagia": [{ species: "dog", lrPlus: 230.8 }],
  "hyperinsulinemia": [{ species: "all", lrPlus: 217.7 }],
  "diabetes mellitus": [{ species: "all", lrPlus: 106.3 }],
  "lactic acidosis": [{ species: "all", lrPlus: 89 }],
  "constipation": [{ species: "all", lrPlus: 21.5 }],
  "rash": [{ species: "all", lrPlus: 20 }],
  "infection": [{ species: "all", lrPlus: 116 }],
  "hypercalcemia": [{ species: "dog", lrPlus: 98.2 }],
  "metabolic disorder": [{ species: "monkey", lrPlus: 217.4 }],
};


// ─── MedDRA dictionary index (built from send-to-meddra-v3.json) ──

/** Normalize MedDRA British spelling to American for concordance matching. */
function normalizePT(pt: string): string {
  return pt.toLowerCase()
    .replace(/aemia/g, "emia")
    .replace(/aemia/g, "emia")
    .replace(/oedema/g, "edema")
    .replace(/haem/g, "hem")
    .replace(/oestr/g, "estr");
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
    if (maxLR >= TRANSLATIONAL_BINS.endpoint.high) return "high";
    if (maxLR >= TRANSLATIONAL_BINS.endpoint.moderate) return "moderate";
    return "low";
  }
  const socLR = lookupSOCLRPlus(species, primarySOC);
  if (socLR === null) return "insufficient_data";
  if (socLR >= TRANSLATIONAL_BINS.soc.high) return "high";
  if (socLR >= TRANSLATIONAL_BINS.soc.moderate) return "moderate";
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
    if (ep.testCode) keys.push(ep.testCode.toUpperCase());
    keys.push(ep.endpoint_label.toUpperCase());
  } else if (domain === "MI" || domain === "MA") {
    const specimen = (ep.specimen ?? "").toUpperCase().replace(/[\s,]+/g, "_");
    const finding = (ep.finding ?? "").toUpperCase().replace(/[\s,]+/g, " ");
    if (specimen && finding) {
      keys.push(`MI:${finding}:${specimen}`);
      const shortSpecimen = specimen.split("_")[0] === "BONE" ? "BONE_MARROW" : specimen.split("_")[0];
      if (shortSpecimen !== specimen) keys.push(`MI:${finding}:${shortSpecimen}`);
    }
  } else if (domain === "OM") {
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
        break;
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
// @field FIELD-27 — translational confidence tier and LR+ data
export function assessTranslationalConfidence(
  syndrome: CrossDomainSyndrome,
  species: string,
  hasAbsenceMeaningful: boolean,
  allEndpoints?: EndpointSummary[],
): TranslationalConfidence {
  const primarySOC = SYNDROME_SOC_MAP[syndrome.id];
  const socLR = lookupSOCLRPlus(species, primarySOC);
  const normalizedSpecies = normalizeSpecies(species);

  const observedPTs = allEndpoints
    ? resolveObservedPTs(syndrome, allEndpoints)
    : new Set<string>();

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

// ─── Orchestrator ──────────────────────────────────────────

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
  /** REM-10: IDs of all detected syndromes (for stress confound cross-check) */
  allDetectedSyndromeIds?: string[],
  /** Organ weight normalization contexts for B-7 BW confounding assessment */
  normalizationContexts?: NormalizationContext[],
): SyndromeInterpretation {
  const discriminators = DISCRIMINATOR_REGISTRY[syndrome.id];

  // ── Component 1: Certainty ──
  let certaintyResult: {
    certainty: SyndromeCertainty;
    evidence: DiscriminatingFinding[];
    rationale: string;
    upgradeEvidence?: UpgradeEvidenceResult | null;
  };

  if (discriminators) {
    certaintyResult = assessCertainty(
      syndrome,
      discriminators,
      allEndpoints,
      histopathData,
    );
  } else {
    // No discriminators defined for this syndrome — still apply caps
    let cert: SyndromeCertainty = syndrome.requiredMet ? "mechanism_uncertain" : "pattern_only";
    let rat = syndrome.requiredMet
      ? "Required findings met. No discriminating evidence defined for this syndrome."
      : "Syndrome detected through supporting evidence only.";
    // REM-24: If directional gate fired, amend the rationale to mention the contradiction
    if (syndrome.directionalGate?.gateFired) {
      const gate = syndrome.directionalGate;
      const gateText = gate.explanation.replace(/\.+$/, "");
      rat = syndrome.requiredMet
        ? `Required findings met. Contradicting evidence from directional gate (${gate.action}): ${gateText}.`
        : `Syndrome detected through supporting evidence only. Contradicting evidence from directional gate (${gate.action}): ${gateText}.`;
    }
    const capsResult2 = applyCertaintyCaps(syndrome, cert, rat, allEndpoints, histopathData);
    certaintyResult = { certainty: capsResult2.certainty, evidence: [], rationale: capsResult2.rationale, upgradeEvidence: capsResult2.upgradeEvidence ?? null };
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
    foodConsumptionData,
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
    histopathData,
    allDetectedSyndromeIds ?? [],
    normalizationContexts,
  );

  // REM-10: Stress confound certainty downgrade — reduce by one level
  if (adversity.stressConfound) {
    const CERTAINTY_ORDER: SyndromeCertainty[] = ["pattern_only", "mechanism_uncertain", "mechanism_confirmed"];
    const idx = CERTAINTY_ORDER.indexOf(certaintyResult.certainty);
    if (idx > 0) {
      certaintyResult = {
        ...certaintyResult,
        certainty: CERTAINTY_ORDER[idx - 1],
        rationale: certaintyResult.rationale +
          ` Downgraded: all evidence overlaps with stress-response endpoints (XS08 co-detected). Direct ${syndrome.name.toLowerCase()} requires additional evidence (functional assay, histopathology, or dose-dissociation from stress markers).`,
      };
    }
  }

  // REM-16: Adaptive pattern narrative annotation
  if (adversity.adaptive) {
    certaintyResult = {
      ...certaintyResult,
      rationale: certaintyResult.rationale +
        ` Adaptive pattern: liver weight increase + hypertrophy without necrosis/degeneration suggests enzyme induction (non-adverse). ALT/AST fold change < 5×.`,
    };
  }

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

  // REM-11: Species-specific preferred marker annotations
  const speciesMarkers = checkSpeciesPreferredMarkers(
    syndrome.id,
    studyContext.species,
    allEndpoints,
  );
  if (speciesMarkers.narrative) {
    narrativeParts.push(speciesMarkers.narrative);
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
  if (adversity.secondaryToOther && !adversity.secondaryToBW) advFactors.push("secondary to food consumption");
  if (adversity.secondaryToBW) advFactors.push(`secondary to body weight loss (BW g=${adversity.secondaryToBW.bwG.toFixed(2)}, ${adversity.secondaryToBW.confidence} confidence)`);
  if (adversity.stressConfound) advFactors.push("potentially secondary to stress (XS08)");
  if (adversity.adaptive) advFactors.push("adaptive pattern (enzyme induction)");
  if (adversity.crossDomainSupport) advFactors.push("cross-domain support");

  // REM-17: Factor-by-factor TR reasoning trace
  const trReasoningDetail = treatmentRelatedness.reasoning
    .map(r => `${r.factor}: ${r.value} [${r.score}]`)
    .join("; ");
  narrativeParts.push(
    `Treatment-related: ${trLabel} (score ${treatmentRelatedness.reasoning.reduce((s, r) => s + r.score, 0).toFixed(1)}/${treatmentRelatedness.reasoning.length}; ${trReasoningDetail}).`,
  );
  narrativeParts.push(
    `Adverse: ${advLabel}${advFactors.length > 0 ? ` (${advFactors.join(", ")})` : ""}.`,
  );

  // REM-21: Histopathologic severity
  const histoGrade = deriveHistopathSeverityGrade(histopathData);
  if (histoGrade && histoGrade !== "none") {
    narrativeParts.push(
      `Histopathologic severity: ${histoGrade} (max tissue grade from MI data; ` +
      `regulatory significance: ${overallSeverity}).`,
    );
  }

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
    upgradeEvidence: certaintyResult.upgradeEvidence ?? null,
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
    histopathSeverityGrade: deriveHistopathSeverityGrade(histopathData),
    translationalConfidence,
    speciesMarkers,
    narrative: narrativeParts.join(" "),
  };
}
