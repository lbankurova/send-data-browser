/**
 * Syndrome Interpretation Layer — barrel re-export module.
 *
 * All implementation has been split into focused modules:
 *   - syndrome-interpretation-types.ts — types, interfaces, constants, discriminator data
 *   - syndrome-certainty.ts — certainty grading, enzyme tiers, upgrade evidence, species markers
 *   - syndrome-cross-reference.ts — histopath cross-ref, recovery, CL correlation, design notes
 *   - syndrome-ecetoc.ts — mortality, tumor, food, treatment-relatedness, adversity, severity
 *   - syndrome-translational.ts — translational confidence, MedDRA, interpretSyndrome orchestrator
 *
 * This file re-exports everything for backward compatibility.
 * New code should import from the specific module.
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

// ─── Types and constants (from types module) ────────────────

export {
  TRANSLATIONAL_BINS,
  STAT_SIG_THRESHOLDS,
  DOSE_RESPONSE_THRESHOLDS,
  DISCRIMINATOR_REGISTRY,
  SYNDROME_CL_CORRELATES,
  SYNDROME_SOC_MAP,
} from "@/lib/syndrome-interpretation-types";
export type {
  SyndromeCertainty,
  EnzymeTier,
  UpgradeEvidenceItem,
  UpgradeEvidenceResult,
  OverallSeverity,
  DiscriminatingFinding,
  HistopathCrossRef,
  HistopathObservation,
  SyndromeRecoveryAssessment,
  EndpointRecovery,
  ClinicalObservationSupport,
  RecoveryRow,
  OrganWeightRow,
  TumorFinding,
  AnimalDisposition,
  FoodConsumptionSummaryResponse,
  ClinicalObservation,
  MortalityContext,
  HumanNonRelevance,
  TumorContext,
  FoodConsumptionContext,
  TreatmentRelatednessScore,
  TRReasoningFactor,
  AdversityAssessment,
  TranslationalConfidence,
  SyndromeInterpretation,
  SyndromeDiscriminators,
} from "@/lib/syndrome-interpretation-types";

// ─── Certainty module ───────────────────────────────────────

export {
  evaluateDiscriminator,
  assessCertainty,
  getEnzymeMagnitudeTier,
  evaluateUpgradeEvidence,
  checkSpeciesPreferredMarkers,
  applyCertaintyCaps,
} from "@/lib/syndrome-certainty";

// ─── Cross-reference module ─────────────────────────────────

export {
  crossReferenceHistopath,
  assessSyndromeRecovery,
  assessClinicalObservationSupport,
  assembleStudyDesignNotes,
} from "@/lib/syndrome-cross-reference";

// ─── ECETOC module ──────────────────────────────────────────

export {
  getSyndromeOrgans,
  isDoseRelatedMortality,
  mapDeathRecordsToDispositions,
  assessMortalityContext,
  assessTumorContext,
  assessFoodConsumptionContext,
  computeTreatmentRelatedness,
  computeAdversity,
  deriveOverallSeverity,
  deriveHistopathSeverityGrade,
} from "@/lib/syndrome-ecetoc";

// ─── Translational module ───────────────────────────────────

export {
  normalizeSpecies,
  lookupSOCLRPlus,
  assignTranslationalTier,
  assessTranslationalConfidence,
  interpretSyndrome,
} from "@/lib/syndrome-translational";
