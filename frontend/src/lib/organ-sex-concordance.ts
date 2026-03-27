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
  if (bySpecimen) return bySpecimen;

  // Priority 2: domain + testCode
  if (ep.domain === "LB") {
    const byTC = routeByTestCode(ep.testCode);
    if (byTC) return byTC;
    // LB with no recognized test code → default to HEMATOPOIETIC
    return "HEMATOPOIETIC";
  }
  if (ep.domain === "BW" || ep.domain === "FW") return "BODY_WEIGHT";

  // For MI/MA/OM without specimen match, fall through to organ_system
  // Priority 3: organ_system fallback
  return ORGAN_SYSTEM_MAP[ep.organ_system] ?? null;
}

/**
 * Compute the sex concordance/divergence boost for an endpoint.
 * Returns 0 for single-sex endpoints or sex-exclusive organs (REPRODUCTIVE).
 */
export function getSexConcordanceBoost(ep: EndpointSummary, species = "rat"): number {
  if (!ep.bySex || ep.bySex.size < 2) return 0;

  const band = resolveOrganBand(ep);
  if (band === "REPRODUCTIVE") return 0;

  const boosts = lookupBand(band, species);
  if (!boosts) return 0;

  // Classify: concordant (same direction) vs divergent (opposite)
  // Reuse existing sexesDisagree() from lab-clinical-catalog (CLAUDE.md rule 6)
  const isDivergent = sexesDisagree(ep);

  return isDivergent ? boosts.divergence : boosts.concordance;
}

// ─── Internal helpers ─────────────────────────────────────

function lookupBand(band: string | null, species: string): BandBoosts | null {
  const speciesData = speciesBands[species] as BandsMap | undefined;
  if (speciesData && band && band in speciesData) {
    return speciesData[band] ?? null; // null for REPRODUCTIVE
  }
  return defaultBoosts;
}
