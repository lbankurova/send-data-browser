/**
 * Organ-specific sex concordance/divergence scoring (GAP-123).
 *
 * Routes endpoints to organ bands using specimen → domain+testCode → organ_system
 * priority, then looks up calibrated concordance/divergence boost values from
 * shared/organ-sex-concordance-bands.json.
 *
 * Literature basis: docs/deep-research/Organ-specific sex concordance scoring
 * for rat toxicology signals.md
 */

import type { EndpointSummary } from "@/lib/derive-summaries";
import { sexesDisagree } from "@/lib/lab-clinical-catalog";
import {
  SPECIES_STRAIN_PROFILES,
  DEFAULT_BRAIN_TIER_THRESHOLDS,
  type HedgesGResult,
} from "@/lib/organ-weight-normalization";
import bandsData from "../../../shared/organ-sex-concordance-bands.json";

// ─── Types ─────────────────────────────────────────────────

interface BandBoosts {
  concordance: number;
  divergence: number;
}

type BandsMap = Record<string, BandBoosts | null>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const { _comment, default: defaultBand, ...speciesBands } = bandsData as Record<string, unknown>;
const defaultBoosts = defaultBand as BandBoosts;

export type OrganBandKey =
  | "LIVER" | "KIDNEY" | "HEMATOPOIETIC" | "BONE_MARROW" | "THYMUS"
  | "SPLEEN" | "ADRENAL" | "THYROID" | "HEART" | "LUNG" | "BRAIN"
  | "BRAIN_WEIGHT" | "BRAIN_ENZYME"
  | "REPRODUCTIVE" | "SKIN" | "BODY_WEIGHT" | "COAGULATION";

// ─── Specimen routing (Priority 1) ────────────────────────

const SPECIMEN_ROUTES: [RegExp, string][] = [
  [/\bBONE\s*MARROW\b/i, "BONE_MARROW"],
  [/\bSPLEEN\b/i, "SPLEEN"],
  [/\bLYMPH\s*NODE\b/i, "SPLEEN"],
  [/\bTHYMUS\b/i, "THYMUS"],
  [/\bLIVER\b|\bHEPAT/i, "LIVER"],
  [/\bKIDNEY\b|\bRENAL\b/i, "KIDNEY"],
  [/\bADRENAL\b/i, "ADRENAL"],
  [/\bTHYROID\b/i, "THYROID"],
  [/\bHEART\b/i, "HEART"],
  [/\bLUNG\b/i, "LUNG"],
  [/\bBRAIN\b|\bSPINAL\s*CORD\b/i, "BRAIN"],
  [/\bSKIN\b/i, "SKIN"],
  [/\bTESTIS\b|\bTESTES\b|\bOVARY\b|\bOVARIES\b|\bUTERUS\b|\bEPIDIDYMIS\b|\bPROSTATE\b|\bSEMINAL\s*VESICLE\b/i, "REPRODUCTIVE"],
];

function routeBySpecimen(specimen: string | null | undefined): string | null {
  if (!specimen) return null;
  for (const [re, band] of SPECIMEN_ROUTES) {
    if (re.test(specimen)) return band;
  }
  return null;
}

// ─── Test code routing (Priority 2 — LB domain) ──────────

const TESTCODE_BONE_MARROW = new Set(["MYELCYT", "ERYTHP", "ME"]);
const TESTCODE_COAGULATION = new Set(["PT", "APTT", "FIB", "INR"]);
const TESTCODE_THYROID = new Set(["TSH", "T3", "T4"]);
const TESTCODE_ADRENAL = new Set(["ACTH", "CORT", "CORTICOSTERONE"]);
const TESTCODE_HEART = new Set(["TROPONI", "TROPONIN", "CK", "LDH"]);
const TESTCODE_BRAIN = new Set(["ACHE", "BUCHE"]);
const TESTCODE_KIDNEY = new Set(["BUN", "CREAT"]);
const TESTCODE_LIVER = new Set([
  "ALT", "AST", "ALP", "GGT", "SDH", "GDH", "5NT",
  "BILI", "TBILI", "DBILI", "ALB", "TP", "GLUC", "CHOL", "TRIG",
]);

function routeByTestCode(testCode: string | undefined): string | null {
  if (!testCode) return null;
  const tc = testCode.toUpperCase();
  if (TESTCODE_BONE_MARROW.has(tc)) return "BONE_MARROW";
  if (TESTCODE_COAGULATION.has(tc)) return "COAGULATION";
  if (TESTCODE_THYROID.has(tc)) return "THYROID";
  if (TESTCODE_ADRENAL.has(tc)) return "ADRENAL";
  if (TESTCODE_HEART.has(tc)) return "HEART";
  if (TESTCODE_BRAIN.has(tc)) return "BRAIN";
  if (TESTCODE_KIDNEY.has(tc)) return "KIDNEY";
  if (TESTCODE_LIVER.has(tc)) return "LIVER";
  return null;
}

// ─── Organ system fallback (Priority 3) ───────────────────

const ORGAN_SYSTEM_MAP: Record<string, string> = {
  hepatic: "LIVER",
  renal: "KIDNEY",
  hematologic: "HEMATOPOIETIC",
  cardiac: "HEART",
  respiratory: "LUNG",
  neurologic: "BRAIN",
  endocrine: "THYROID",
  dermal: "SKIN",
  reproductive: "REPRODUCTIVE",
  lymphoid: "SPLEEN",
};

// ─── Public API ───────────────────────────────────────────

/**
 * Route an endpoint to its organ band key using specimen → domain+testCode → organ_system.
 * Returns null when no mapping is found (use default band).
 */
export function resolveOrganBand(ep: EndpointSummary): string | null {
  // Priority 1: specimen
  const bySpecimen = routeBySpecimen(ep.specimen);
  if (bySpecimen) return refineBrain(bySpecimen, ep.domain);

  // Priority 2: domain + testCode
  if (ep.domain === "LB") {
    const byTC = routeByTestCode(ep.testCode);
    if (byTC) return refineBrain(byTC, ep.domain);
    // LB with no recognized test code → default to HEMATOPOIETIC
    return "HEMATOPOIETIC";
  }
  if (ep.domain === "BW" || ep.domain === "FW") return "BODY_WEIGHT";

  // For MI/MA/OM without specimen match, fall through to organ_system
  // Priority 3: organ_system fallback
  const byOS = ORGAN_SYSTEM_MAP[ep.organ_system] ?? null;
  return byOS ? refineBrain(byOS, ep.domain) : null;
}

/**
 * Refine BRAIN band into endpoint-type-aware sub-bands.
 * Brain weight (OM) and brain enzyme (LB) have fundamentally different
 * sex dimorphism profiles -- see research/brain-weight-sex-concordance-calibration.md.
 */
function refineBrain(band: string, domain: string | undefined): string {
  if (band !== "BRAIN") return band;
  if (domain === "OM") return "BRAIN_WEIGHT";
  if (domain === "LB") return "BRAIN_ENZYME";
  return "BRAIN"; // MI, CL, MA -> morphology/observation residual
}

/**
 * Organs where single-endpoint sex divergence lacks a well-characterized
 * biological mechanism. When a study has only one endpoint resolving to one of
 * these bands AND sexes show opposite directions, the divergence boost is
 * capped at GUARD_DIVERGENCE_CAP (0.3) to prevent uncorroborated single-
 * measurement amplification. See research/brain-concordance-guard.md.
 *
 * Maintenance rule (research §Phase 1, R2 N1 maintenance gap): new organs
 * default to NOT guarded -- do not suppress signals without literature review.
 * To add an organ, document a low-functional-dimorphism rationale in the
 * research doc Phase 1.
 *
 * Excluded by design: ADRENAL (HPA dimorphism), THYMUS (sex-differential
 * involution), KIDNEY (alpha-2u male-specific pathology), LIVER (CYP
 * dimorphism), THYROID (enzyme-induction sex susceptibility), HEMATOPOIETIC
 * (peripheral blood sex differences), BRAIN_ENZYME (cholinesterase has high
 * sex dimorphism).
 *
 * BRAIN_WEIGHT and BRAIN are both included: BRAIN_WEIGHT covers OM brain
 * weight (post-split, parent shipped 2026-04-04); BRAIN covers MI/CL/MA brain
 * residual endpoints. Defense-in-depth -- BRAIN_WEIGHT divergence is already
 * 0.3 from the band JSON, so the cap is redundant for that band but harmless
 * (min(0.3, 0.3) === 0.3).
 *
 * Set is typed ReadonlySet<string> for membership-check ergonomics (band is
 * `string | null` at the call site). Construction uses `new Set<OrganBandKey>`
 * so member names are validated against the union at definition time -- this
 * avoids an unsafe cast at the call site while keeping typo-safety here.
 */
export const SINGLE_ENDPOINT_GUARD_SET: ReadonlySet<string> = new Set<OrganBandKey>([
  "BRAIN", "BRAIN_WEIGHT",
  "LUNG", "HEART",
  "BONE_MARROW", "SPLEEN",
  "COAGULATION",
]);

const GUARD_DIVERGENCE_CAP = 0.3;

/**
 * Compute the sex concordance/divergence boost for an endpoint.
 * Returns 0 for single-sex endpoints or sex-exclusive organs (REPRODUCTIVE).
 *
 * @param nEndpointsForBand  optional count of endpoints in the same resolved
 *                           organ band across the study. When provided and
 *                           <= 1, sexes diverge, and the band is in
 *                           {@link SINGLE_ENDPOINT_GUARD_SET}, the divergence
 *                           boost is capped at GUARD_DIVERGENCE_CAP (0.3).
 *                           When undefined (existing callers), the guard is
 *                           inert and behavior matches pre-guard semantics.
 */
export function getSexConcordanceBoost(
  ep: EndpointSummary,
  species = "rat",
  nEndpointsForBand?: number,
): number {
  if (!ep.bySex || ep.bySex.size < 2) return 0;

  const band = resolveOrganBand(ep);
  if (band === "REPRODUCTIVE") return 0;

  const boosts = lookupBand(band, species);
  if (!boosts) return 0;

  // Classify: concordant (same direction) vs divergent (opposite)
  // Reuse existing sexesDisagree() from lab-clinical-catalog (CLAUDE.md rule 6)
  const isDivergent = sexesDisagree(ep);

  if (isDivergent) {
    // Single-endpoint guard (research/brain-concordance-guard.md): when only
    // one endpoint resolves to this organ band AND the band is in the low-
    // functional-dimorphism set, cap the divergence boost. Null bands are not
    // in the guard set, so the .has(band) check never fires regardless of
    // count -- the explicit null check is defense-in-depth.
    if (
      nEndpointsForBand !== undefined &&
      nEndpointsForBand <= 1 &&
      band !== null &&
      SINGLE_ENDPOINT_GUARD_SET.has(band)
    ) {
      return Math.min(boosts.divergence, GUARD_DIVERGENCE_CAP);
    }
    return boosts.divergence;
  }

  return boosts.concordance;
}

// ─── Internal helpers ─────────────────────────────────────

// Three-tier fallback per docs/_internal/research/brain-concordance-species-bands.md:
//   tier 1: species-specific band (e.g. dog BRAIN_WEIGHT)
//   tier 2: rat baseline (calibrated against the largest HCD corpus)
//   tier 3: defaultBoosts (concordance 1.5, divergence 1.0)
// An explicit `null` value in a species-specific entry suppresses fallback
// (returns null/0 boost) -- e.g. REPRODUCTIVE in rat. This is the documented
// way to opt a species-organ pair out of cross-species inheritance.
// Consumption invariant: `species` MUST be the output of normalizeSpecies()
// from syndrome-translational.ts (e.g. "monkey" not "cynomolgus") -- other
// normalizers map to different keys and would silently miss species entries.
function lookupBand(band: string | null, species: string): BandBoosts | null {
  if (!band) return defaultBoosts;
  // Tier 1: species-specific lookup
  const speciesData = speciesBands[species] as BandsMap | undefined;
  if (speciesData && band in speciesData) {
    return speciesData[band] ?? null; // explicit null suppresses fallback
  }
  // Tier 2: rat fallback (baseline calibration)
  if (species !== "rat") {
    const ratData = speciesBands["rat"] as BandsMap | undefined;
    if (ratData && band in ratData) {
      return ratData[band] ?? null; // rat's null (e.g. REPRODUCTIVE) applies cross-species
    }
  }
  // Tier 3: default
  return defaultBoosts;
}

// ─── BW-mediation auto-check (Proposal 5) ─────────────────

export type BwMediationFlag = "plausible" | "probable" | "likely_artifact";

export interface BwMediationDetail {
  sex: string;
  brainG: number | null;
  bwG: number | null;
  sameSign: boolean | null;
  classification: BwMediationFlag | "below_threshold" | "no_bw_data" | "demoted_dose_decoupled";
}

/**
 * Threshold below which a sex's BW Hedges' g is considered "stable" for the
 * cross-sex artifact check. Expert-judgment value, NOT calibrated against
 * a study corpus. See `research/brain-concordance-bw-mediation.md` §2.3 step 4
 * and TODO.md GAP-219 (calibration follow-up).
 */
const BW_NEGLIGIBLE_G = 0.3;

/**
 * Discount factors per BW-mediation classification. Provisional values from
 * research §2.4 — empirical calibration tracked at REGISTRY.md
 * `brain-concordance-calibration` stream and TODO.md GAP-219.
 */
const FACTOR_BY_FLAG: Record<BwMediationFlag, number> = {
  plausible: 0.7,
  probable: 0.5,
  likely_artifact: 0.3,
};

const FLAG_RANK: Record<BwMediationFlag, number> = {
  plausible: 1,
  probable: 2,
  likely_artifact: 3,
};

/**
 * Detect when a brain weight finding is body-weight-mediated and return a
 * frontend-only signal-evidence discount factor. Pure function: no side effects,
 * no I/O.
 *
 * # Algorithm (research/brain-concordance-bw-mediation.md §2.3)
 *
 * 1. Locate the worst-case BW endpoint by `|maxEffectSize|`. None / no `bySex`
 *    → no discount.
 * 2. Look up `[T1, T2]` from `SPECIES_STRAIN_PROFILES[speciesStrainKey].brainTierThresholds`
 *    (fallback `DEFAULT_BRAIN_TIER_THRESHOLDS`).
 * 3. Per-sex same-sign check: if `|brainG| ≥ T1` AND `sign(brainG) === sign(bwG)`,
 *    classify `plausible` (`|bwG| ≥ T1`) or `probable` (`|bwG| ≥ T2`).
 * 4. Cross-sex artifact check (when `bySex.size ≥ 2`): brain directions oppose
 *    AND (BW directions oppose OR one sex `|bwG| < BW_NEGLIGIBLE_G`) AND at least
 *    one sex has `|bwG| ≥ T1` → `likely_artifact` candidate.
 * 5. Dose-coupling guard (when `bwGByGroup` provided): if the brain endpoint's
 *    peak-effect dose group has `|bw_g| < T1`, demote `likely_artifact` →
 *    `plausible` (factor 0.3 → 0.7). Without the guard the classification
 *    stands as research-spec — the conservative behavior (research §1.3:
 *    endpoint-level worst case is more likely to flag than miss).
 * 6. Return the worst (most-discounting) factor across all sex/cross-sex
 *    classifications: `likely_artifact: 0.3, probable: 0.5, plausible: 0.7,
 *    none: 1.0`.
 *
 * # Methods note (regenerated to docs/methods.md by `/regen-science`)
 *
 * **BW-mediation auto-check.** For brain-weight (OM) findings in multi-sex
 * studies, the rail signal score discounts evidence by a factor reflecting
 * how strongly body-weight changes mediate the apparent brain effect.
 * Species-calibrated brain Hedges' g thresholds (rat `[0.5, 1.0]`,
 * dog `[0.8, 1.5]`, NHP `[1.0, 2.0]`) gate per-sex same-sign and cross-sex
 * artifact patterns. Citations: Sprengell 2021 (brain sparing 11–40% BW),
 * Bailey 2004 (brain–BW correlation), Crofton 2024 (DNT brain-vs-BW).
 * Rationale for species-calibrated (not fixed) thresholds: research §2.5.
 *
 * **Calibration is provisional.** The 0.7/0.5/0.3 discount factors and the
 * `BW_NEGLIGIBLE_G = 0.3` cross-sex stability threshold are expert-judgment
 * starting points and have not been calibrated against an empirical study
 * corpus. See open validation stream `brain-concordance-calibration`
 * (REGISTRY.md) and TODO.md GAP-219 for status.
 *
 * **Application conditions.** Only `BRAIN_WEIGHT` band (OM domain), only
 * multi-sex studies (the cross-sex check requires `bySex` ≥ 2). No impact on
 * severity/TR classification — the discount applies to the rail's evidence
 * sum only.
 *
 * @param brainEp        the brain-weight endpoint under evaluation.
 * @param endpoints      all endpoints in the study (used to locate the worst
 *                       BW endpoint).
 * @param speciesStrainKey  built via `buildSpeciesStrainKey(species, strain)` from
 *                          `organ-weight-normalization.ts`. Format:
 *                          "RAT_SPRAGUE_DAWLEY", "DOG_BEAGLE", "NHP_CYNOMOLGUS".
 *                          NOT the lowercase species name returned by
 *                          `normalizeSpecies` — passing "rat" silently misses
 *                          the lookup and falls back to defaults for every
 *                          species, disabling dog/NHP calibration.
 * @param bwGByGroup    (optional) per-dose-group worst-case BW Hedges' g from
 *                      `useOrganWeightNormalization.state.bwGByGroup`. When
 *                      provided, the cross-sex `likely_artifact` flag is
 *                      additionally required to be dose-coupled (the brain
 *                      endpoint's peak-effect dose group must also show a
 *                      study-level BW perturbation `≥ T1`). Guards against
 *                      the dose-decoupled false positive (research R1 F3).
 *                      `bwGByGroup` is study-level (NOT per-sex) — keys are
 *                      `String(doseLevel)` per `organ-weight-normalization.ts`.
 *
 * @see DEFAULT_BRAIN_TIER_THRESHOLDS
 * @see SPECIES_STRAIN_PROFILES
 * @see contract-triangles.md#brainTierThresholds
 */
export function computeBwMediationFactor(
  brainEp: EndpointSummary,
  endpoints: EndpointSummary[],
  speciesStrainKey: string,
  bwGByGroup?: Map<string, HedgesGResult>,
): { factor: number; flag: BwMediationFlag | null; detail: BwMediationDetail[] } {
  // 1. Locate worst-case BW endpoint by |maxEffectSize|.
  let bwEp: EndpointSummary | null = null;
  let bwAbs = 0;
  for (const ep of endpoints) {
    if (ep.domain !== "BW") continue;
    const m = ep.maxEffectSize == null ? 0 : Math.abs(ep.maxEffectSize);
    if (m > bwAbs) {
      bwAbs = m;
      bwEp = ep;
    }
  }
  if (!bwEp || !bwEp.bySex || bwEp.bySex.size === 0 || !brainEp.bySex || brainEp.bySex.size === 0) {
    return { factor: 1.0, flag: null, detail: [] };
  }

  // 2. Species-calibrated thresholds.
  const profile = SPECIES_STRAIN_PROFILES[speciesStrainKey];
  const [T1, T2] = profile?.brainTierThresholds ?? DEFAULT_BRAIN_TIER_THRESHOLDS;

  // 3. Per-sex same-sign classification.
  const detail: BwMediationDetail[] = [];
  let worstFlag: BwMediationFlag | null = null;
  const setFlag = (f: BwMediationFlag) => {
    if (worstFlag == null || FLAG_RANK[f] > FLAG_RANK[worstFlag]) worstFlag = f;
  };

  for (const [sex, brainSex] of brainEp.bySex) {
    const bwSex = bwEp.bySex.get(sex);
    const brainG = brainSex.maxEffectSize;
    const bwG = bwSex?.maxEffectSize ?? null;
    if (brainG == null || bwG == null) {
      detail.push({ sex, brainG, bwG, sameSign: null, classification: "no_bw_data" });
      continue;
    }
    const sameSign = Math.sign(brainG) === Math.sign(bwG);
    if (Math.abs(brainG) < T1) {
      detail.push({ sex, brainG, bwG, sameSign, classification: "below_threshold" });
      continue;
    }
    if (sameSign && Math.abs(bwG) >= T2) {
      detail.push({ sex, brainG, bwG, sameSign, classification: "probable" });
      setFlag("probable");
    } else if (sameSign && Math.abs(bwG) >= T1) {
      detail.push({ sex, brainG, bwG, sameSign, classification: "plausible" });
      setFlag("plausible");
    } else {
      detail.push({ sex, brainG, bwG, sameSign, classification: "below_threshold" });
    }
  }

  // 4. Cross-sex artifact check (≥2 sexes).
  // Filter to known sex codes M/F to guard against any future "Combined"
  // pseudo-sex entry from derive-summaries (peer-review hardening 2026-04-27).
  if (brainEp.bySex.size >= 2) {
    const brainBySex: { sex: string; g: number; bwG: number | null }[] = [];
    for (const [sex, brainSex] of brainEp.bySex) {
      if (sex !== "M" && sex !== "F") continue;
      const bwSex = bwEp.bySex.get(sex);
      if (brainSex.maxEffectSize == null) continue;
      brainBySex.push({ sex, g: brainSex.maxEffectSize, bwG: bwSex?.maxEffectSize ?? null });
    }
    if (brainBySex.length >= 2) {
      const signs = new Set(brainBySex.map(s => Math.sign(s.g)));
      const brainOpposes = signs.has(1) && signs.has(-1);
      const bwsKnown = brainBySex.filter(s => s.bwG != null) as { sex: string; g: number; bwG: number }[];
      const bwSigns = new Set(bwsKnown.map(s => Math.sign(s.bwG)));
      const bwOppose = bwSigns.has(1) && bwSigns.has(-1);
      const oneStableBw = bwsKnown.some(s => Math.abs(s.bwG) < BW_NEGLIGIBLE_G);
      const oneAtThreshold = bwsKnown.some(s => Math.abs(s.bwG) >= T1);
      if (brainOpposes && (bwOppose || oneStableBw) && oneAtThreshold) {
        // 5. Dose-coupling guard: demote when the brain endpoint's peak-effect
        // dose group is not BW-coupled at the study level.
        let demoted = false;
        if (bwGByGroup && bwGByGroup.size > 0 && brainEp.worstTreatedStats?.doseLevel != null) {
          const key = String(brainEp.worstTreatedStats.doseLevel);
          const peakBw = bwGByGroup.get(key);
          if (peakBw != null && Math.abs(peakBw.g) < T1) demoted = true;
        }
        const flag: BwMediationFlag = demoted ? "plausible" : "likely_artifact";
        for (const s of brainBySex) {
          detail.push({
            sex: s.sex,
            brainG: s.g,
            bwG: s.bwG,
            sameSign: null,
            classification: demoted ? "demoted_dose_decoupled" : "likely_artifact",
          });
        }
        setFlag(flag);
      }
    }
  }

  if (worstFlag == null) return { factor: 1.0, flag: null, detail };
  return { factor: FACTOR_BY_FLAG[worstFlag], flag: worstFlag, detail };
}
