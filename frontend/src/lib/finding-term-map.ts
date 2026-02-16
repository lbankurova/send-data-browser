/**
 * CT-Normalized Finding Term Mapping (IMP-12).
 *
 * Curated mapping of histopathology / macroscopic / clinical finding terms
 * to normalized categories, reversibility profiles, and INHAND classes.
 * Built against SEND Terminology 2017-03-31.
 *
 * Lookup priority:
 *   1. Exact normalized match  →  O(1)
 *   2. Synonym scan             →  O(n) but n ≈ total synonyms
 *   3. Caller falls back to legacy substring matching
 */

import type { FindingNature, ReversibilityQualifier } from "./finding-nature";

// ─── Types ────────────────────────────────────────────────

export interface ReversibilityProfile {
  weeksLow: number | null;
  weeksHigh: number | null;
  qualifier: ReversibilityQualifier;
}

export interface FindingTermMapping {
  normalizedTerm: string;
  category: FindingNature;
  inhandClass: string | null;
  reversibility: ReversibilityProfile;
  commonSynonyms: string[];
}

// ─── Mapping table ────────────────────────────────────────
// Keys are lowercase, whitespace-normalized.

const FINDING_TERM_MAP: Record<string, FindingTermMapping> = {
  // ── Proliferative ──────────────────────────────────────
  "adenoma, hepatocellular": {
    normalizedTerm: "Adenoma, hepatocellular",
    category: "proliferative",
    inhandClass: "Hepatocellular, neoplastic",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: ["hepatocellular adenoma", "liver cell adenoma"],
  },
  "hepatocellular carcinoma": {
    normalizedTerm: "Hepatocellular carcinoma",
    category: "proliferative",
    inhandClass: "Hepatocellular, neoplastic",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: ["carcinoma, hepatocellular", "liver cell carcinoma"],
  },
  "leiomyoma": {
    normalizedTerm: "Leiomyoma",
    category: "proliferative",
    inhandClass: "Smooth muscle, neoplastic",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: [],
  },
  "mass": {
    normalizedTerm: "Mass",
    category: "proliferative",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: ["mass, palpable", "palpable mass"],
  },
  "hyperplasia": {
    normalizedTerm: "Hyperplasia",
    category: "adaptive",
    inhandClass: "Adaptive/reparative",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["hyperplastic"],
  },
  "hypertrophy": {
    normalizedTerm: "Hypertrophy",
    category: "adaptive",
    inhandClass: "Adaptive/reparative",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["hypertrophic"],
  },

  // ── Degenerative ───────────────────────────────────────
  "atrophy": {
    normalizedTerm: "Atrophy",
    category: "degenerative",
    inhandClass: "Degenerative",
    reversibility: { weeksLow: 8, weeksHigh: 12, qualifier: "possible" },
    commonSynonyms: ["atrophic"],
  },
  "necrosis": {
    normalizedTerm: "Necrosis",
    category: "degenerative",
    inhandClass: "Degenerative",
    reversibility: { weeksLow: 6, weeksHigh: 10, qualifier: "possible" },
    commonSynonyms: ["necrotic"],
  },
  "fibrosis": {
    normalizedTerm: "Fibrosis",
    category: "degenerative",
    inhandClass: "Degenerative",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: ["fibrotic"],
  },
  "erosion": {
    normalizedTerm: "Erosion",
    category: "degenerative",
    inhandClass: "Degenerative",
    reversibility: { weeksLow: 2, weeksHigh: 6, qualifier: "expected" },
    commonSynonyms: [],
  },
  "cyst": {
    normalizedTerm: "Cyst",
    category: "degenerative",
    inhandClass: "Degenerative/developmental",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unlikely" },
    commonSynonyms: ["cystic"],
  },
  "adhesion": {
    normalizedTerm: "Adhesion",
    category: "degenerative",
    inhandClass: "Degenerative/reparative",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: [],
  },
  "alopecia": {
    normalizedTerm: "Alopecia",
    category: "degenerative",
    inhandClass: "Integumentary, degenerative",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "possible" },
    commonSynonyms: ["hair loss"],
  },
  "aspermia": {
    normalizedTerm: "Aspermia",
    category: "degenerative",
    inhandClass: "Reproductive, degenerative",
    reversibility: { weeksLow: 12, weeksHigh: 20, qualifier: "unlikely" },
    commonSynonyms: [],
  },
  "azoospermia": {
    normalizedTerm: "Azoospermia",
    category: "degenerative",
    inhandClass: "Reproductive, degenerative",
    reversibility: { weeksLow: 12, weeksHigh: 20, qualifier: "unlikely" },
    commonSynonyms: [],
  },
  "cast": {
    normalizedTerm: "Cast",
    category: "degenerative",
    inhandClass: "Renal, degenerative",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "possible" },
    commonSynonyms: ["renal cast", "tubular cast"],
  },
  "crust": {
    normalizedTerm: "Crust",
    category: "degenerative",
    inhandClass: "Integumentary, degenerative",
    reversibility: { weeksLow: 2, weeksHigh: 4, qualifier: "expected" },
    commonSynonyms: [],
  },
  "perforation": {
    normalizedTerm: "Perforation",
    category: "degenerative",
    inhandClass: "Degenerative",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: ["perforated"],
  },
  "intussusception": {
    normalizedTerm: "Intussusception",
    category: "degenerative",
    inhandClass: "GI, degenerative",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: [],
  },

  // ── Adaptive ───────────────────────────────────────────
  "vacuolization": {
    normalizedTerm: "Vacuolization",
    category: "adaptive",
    inhandClass: "Adaptive/reparative",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["vacuolation", "vacuolisation", "vacuolated"],
  },
  "basophilic tubules": {
    normalizedTerm: "Basophilic tubules",
    category: "adaptive",
    inhandClass: "Renal, adaptive",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["tubules, basophilic", "basophilic change"],
  },
  "dilatation": {
    normalizedTerm: "Dilatation",
    category: "adaptive",
    inhandClass: "Adaptive",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["dilation", "dilated"],
  },
  "fat vacuoles": {
    normalizedTerm: "Fat vacuoles",
    category: "adaptive",
    inhandClass: "Adaptive/depositional",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["fatty vacuoles", "fatty change", "lipid vacuoles"],
  },
  "metaplasia": {
    normalizedTerm: "Metaplasia",
    category: "adaptive",
    inhandClass: "Adaptive",
    reversibility: { weeksLow: 6, weeksHigh: 12, qualifier: "possible" },
    commonSynonyms: ["metaplastic"],
  },
  "enlarged": {
    normalizedTerm: "Enlarged",
    category: "adaptive",
    inhandClass: null,
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["enlargement"],
  },
  "small": {
    normalizedTerm: "Small",
    category: "adaptive",
    inhandClass: null,
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "possible" },
    commonSynonyms: ["decreased size", "reduced size"],
  },

  // ── Depositional ───────────────────────────────────────
  "mineralization": {
    normalizedTerm: "Mineralization",
    category: "depositional",
    inhandClass: "Depositional",
    reversibility: { weeksLow: 10, weeksHigh: 16, qualifier: "unlikely" },
    commonSynonyms: ["mineral deposit", "calcification"],
  },
  "pigmentation": {
    normalizedTerm: "Pigmentation",
    category: "depositional",
    inhandClass: "Depositional/pigment",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "possible" },
    commonSynonyms: ["pigment", "pigment deposition"],
  },
  "calculus": {
    normalizedTerm: "Calculus",
    category: "depositional",
    inhandClass: "Depositional",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unlikely" },
    commonSynonyms: ["stone", "urinary calculus", "renal calculus"],
  },

  // ── Inflammatory ───────────────────────────────────────
  "inflammation": {
    normalizedTerm: "Inflammation",
    category: "inflammatory",
    inhandClass: "Inflammatory",
    reversibility: { weeksLow: 6, weeksHigh: 10, qualifier: "expected" },
    commonSynonyms: ["inflamed"],
  },
  "infiltration granulocytic": {
    normalizedTerm: "Infiltration, granulocytic",
    category: "inflammatory",
    inhandClass: "Inflammatory, infiltrate",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["granulocytic infiltrate", "granulocytic infiltration"],
  },
  "infiltration mononuclear cell": {
    normalizedTerm: "Infiltration, mononuclear cell",
    category: "inflammatory",
    inhandClass: "Inflammatory, infiltrate",
    reversibility: { weeksLow: 6, weeksHigh: 10, qualifier: "possible" },
    commonSynonyms: [
      "mononuclear cell infiltrate",
      "mononuclear cell infiltration",
      "mononuclear infiltrate",
    ],
  },
  "ectopic lymphoid tissue": {
    normalizedTerm: "Ectopic lymphoid tissue",
    category: "inflammatory",
    inhandClass: "Inflammatory/adaptive",
    reversibility: { weeksLow: 8, weeksHigh: 14, qualifier: "possible" },
    commonSynonyms: ["lymphoid tissue, ectopic"],
  },
  "exudate": {
    normalizedTerm: "Exudate",
    category: "inflammatory",
    inhandClass: "Inflammatory",
    reversibility: { weeksLow: 2, weeksHigh: 6, qualifier: "expected" },
    commonSynonyms: [],
  },
  "macrophages intra-alveolar": {
    normalizedTerm: "Macrophages, intra-alveolar",
    category: "inflammatory",
    inhandClass: "Inflammatory, macrophagic",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["intra-alveolar macrophages", "alveolar macrophages"],
  },
  "swelling": {
    normalizedTerm: "Swelling",
    category: "inflammatory",
    inhandClass: null,
    reversibility: { weeksLow: 2, weeksHigh: 4, qualifier: "expected" },
    commonSynonyms: ["swollen"],
  },

  // ── Vascular ───────────────────────────────────────────
  "hemorrhage": {
    normalizedTerm: "Hemorrhage",
    category: "vascular",
    inhandClass: "Vascular",
    reversibility: { weeksLow: 2, weeksHigh: 6, qualifier: "expected" },
    commonSynonyms: ["haemorrhage", "hemorrhagic"],
  },
  "congestion": {
    normalizedTerm: "Congestion",
    category: "vascular",
    inhandClass: "Vascular",
    reversibility: { weeksLow: 1, weeksHigh: 3, qualifier: "expected" },
    commonSynonyms: ["congested"],
  },
  "edema": {
    normalizedTerm: "Edema",
    category: "vascular",
    inhandClass: "Vascular/fluid",
    reversibility: { weeksLow: 2, weeksHigh: 6, qualifier: "expected" },
    commonSynonyms: ["oedema", "edematous"],
  },
  "aspiration blood": {
    normalizedTerm: "Aspiration, blood",
    category: "vascular",
    inhandClass: null,
    reversibility: { weeksLow: 1, weeksHigh: 3, qualifier: "expected" },
    commonSynonyms: ["blood aspiration"],
  },

  // ── Gross / clinical observations → unknown ────────────
  // These are not histopathological categories; they appear in MA/CL domains.
  "accessory": {
    normalizedTerm: "Accessory",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: [],
  },
  "area(s), dark red": {
    normalizedTerm: "Area(s), dark red",
    category: "vascular",
    inhandClass: null,
    reversibility: { weeksLow: 1, weeksHigh: 4, qualifier: "possible" },
    commonSynonyms: ["dark red area", "dark red areas"],
  },
  "area(s), white": {
    normalizedTerm: "Area(s), white",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: ["white area", "white areas"],
  },
  "clear fluid": {
    normalizedTerm: "Clear fluid",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: [],
  },
  "contents, dark red": {
    normalizedTerm: "Contents, dark red",
    category: "vascular",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: ["dark red contents"],
  },
  "discoloration": {
    normalizedTerm: "Discoloration",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: ["discoloured", "discolored"],
  },
  "discolored area": {
    normalizedTerm: "Discolored area",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: ["discoloured area"],
  },
  "distended": {
    normalizedTerm: "Distended",
    category: "adaptive",
    inhandClass: null,
    reversibility: { weeksLow: 2, weeksHigh: 6, qualifier: "expected" },
    commonSynonyms: ["distension", "distention"],
  },
  "diverticulum": {
    normalizedTerm: "Diverticulum",
    category: "unknown",
    inhandClass: "Developmental",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: [],
  },
  "hard thickening": {
    normalizedTerm: "Hard thickening",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: ["thickening, hard"],
  },
  "misshapen": {
    normalizedTerm: "Misshapen",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: [],
  },
  "pale": {
    normalizedTerm: "Pale",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: ["pallor"],
  },
  "red area": {
    normalizedTerm: "Red area",
    category: "vascular",
    inhandClass: null,
    reversibility: { weeksLow: 1, weeksHigh: 4, qualifier: "possible" },
    commonSynonyms: [],
  },
  "retinal fold": {
    normalizedTerm: "Retinal fold",
    category: "unknown",
    inhandClass: "Developmental",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: ["retinal fold(s)", "retinal folds"],
  },
  "soft": {
    normalizedTerm: "Soft",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: [],
  },
  "watery contents": {
    normalizedTerm: "Watery contents",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: [],
  },
  "yellow fluid": {
    normalizedTerm: "Yellow fluid",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: [],
  },

  // ── Clinical / cage-side observations → unknown ────────
  "bedding wet": {
    normalizedTerm: "Bedding wet",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: ["wet bedding"],
  },
  "firm feces": {
    normalizedTerm: "Firm feces",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: ["firm faeces"],
  },
  "matting": {
    normalizedTerm: "Matting",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: ["matted fur"],
  },
  "rough fur": {
    normalizedTerm: "Rough fur",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unknown" },
    commonSynonyms: ["rough coat", "unkempt fur"],
  },
  "mouribond": {
    normalizedTerm: "Moribund",
    category: "unknown",
    inhandClass: null,
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: ["moribund"],
  },

  // ── Common SEND terms not in this study but frequently encountered ──
  "chronic progressive nephropathy": {
    normalizedTerm: "Chronic progressive nephropathy",
    category: "degenerative",
    inhandClass: "Renal, degenerative",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: ["cpn", "nephropathy, chronic progressive"],
  },
  "hepatocellular hypertrophy": {
    normalizedTerm: "Hepatocellular hypertrophy",
    category: "adaptive",
    inhandClass: "Hepatocellular, adaptive",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["hypertrophy, hepatocellular", "liver cell hypertrophy"],
  },
  "cardiomyopathy": {
    normalizedTerm: "Cardiomyopathy",
    category: "degenerative",
    inhandClass: "Cardiac, degenerative",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: ["cardiomyopathy, spontaneous"],
  },
  "extramedullary hematopoiesis": {
    normalizedTerm: "Extramedullary hematopoiesis",
    category: "adaptive",
    inhandClass: "Hematopoietic, adaptive",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: [
      "emh",
      "extramedullary haematopoiesis",
      "hematopoiesis, extramedullary",
    ],
  },
  "tubular degeneration": {
    normalizedTerm: "Tubular degeneration",
    category: "degenerative",
    inhandClass: "Renal, degenerative",
    reversibility: { weeksLow: 8, weeksHigh: 14, qualifier: "possible" },
    commonSynonyms: ["degeneration, tubular", "renal tubular degeneration"],
  },
  "tubular dilatation": {
    normalizedTerm: "Tubular dilatation",
    category: "adaptive",
    inhandClass: "Renal, adaptive",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["dilatation, tubular", "dilated tubules"],
  },
  "thyroid follicular cell hypertrophy": {
    normalizedTerm: "Thyroid follicular cell hypertrophy",
    category: "adaptive",
    inhandClass: "Thyroid, adaptive",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["follicular cell hypertrophy", "thyroid hypertrophy"],
  },
  "bile duct hyperplasia": {
    normalizedTerm: "Bile duct hyperplasia",
    category: "adaptive",
    inhandClass: "Hepatobiliary, adaptive",
    reversibility: { weeksLow: 6, weeksHigh: 10, qualifier: "possible" },
    commonSynonyms: ["hyperplasia, bile duct"],
  },
  "granuloma": {
    normalizedTerm: "Granuloma",
    category: "inflammatory",
    inhandClass: "Inflammatory, granulomatous",
    reversibility: { weeksLow: 6, weeksHigh: 12, qualifier: "possible" },
    commonSynonyms: ["granulomatous"],
  },
  "abscess": {
    normalizedTerm: "Abscess",
    category: "inflammatory",
    inhandClass: "Inflammatory",
    reversibility: { weeksLow: 6, weeksHigh: 10, qualifier: "possible" },
    commonSynonyms: [],
  },
  "ulcer": {
    normalizedTerm: "Ulcer",
    category: "degenerative",
    inhandClass: "Degenerative",
    reversibility: { weeksLow: 4, weeksHigh: 10, qualifier: "possible" },
    commonSynonyms: ["ulceration", "ulcerated"],
  },
  "thrombus": {
    normalizedTerm: "Thrombus",
    category: "vascular",
    inhandClass: "Vascular",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unlikely" },
    commonSynonyms: ["thrombosis"],
  },
  "hemosiderin": {
    normalizedTerm: "Hemosiderin",
    category: "depositional",
    inhandClass: "Depositional/pigment",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "unlikely" },
    commonSynonyms: ["haemosiderin", "hemosiderin deposition"],
  },
  "lipofuscin": {
    normalizedTerm: "Lipofuscin",
    category: "depositional",
    inhandClass: "Depositional/pigment",
    reversibility: { weeksLow: null, weeksHigh: null, qualifier: "none" },
    commonSynonyms: ["lipofuscin deposition"],
  },
  "glycogen depletion": {
    normalizedTerm: "Glycogen depletion",
    category: "adaptive",
    inhandClass: "Hepatocellular, adaptive",
    reversibility: { weeksLow: 4, weeksHigh: 8, qualifier: "expected" },
    commonSynonyms: ["depletion, glycogen"],
  },
  "decreased spermatogenesis": {
    normalizedTerm: "Decreased spermatogenesis",
    category: "degenerative",
    inhandClass: "Reproductive, degenerative",
    reversibility: { weeksLow: 14, weeksHigh: 20, qualifier: "unlikely" },
    commonSynonyms: ["spermatogenesis, decreased"],
  },
};

// ─── Synonym index (built once at module load) ───────────

const SYNONYM_INDEX = new Map<string, FindingTermMapping>();
for (const entry of Object.values(FINDING_TERM_MAP)) {
  for (const syn of entry.commonSynonyms) {
    SYNONYM_INDEX.set(syn.toLowerCase(), entry);
  }
}

// ─── Lookup ──────────────────────────────────────────────

/**
 * Look up a raw finding term in the curated CT-normalized mapping.
 * Returns the mapping if found (exact or synonym), or null for substring fallback.
 */
export function normalizeFinding(rawTerm: string): FindingTermMapping | null {
  const normalized = rawTerm.trim().toLowerCase();

  // 1. Exact match
  const exact = FINDING_TERM_MAP[normalized];
  if (exact) return exact;

  // 2. Synonym match (pre-indexed)
  const syn = SYNONYM_INDEX.get(normalized);
  if (syn) return syn;

  return null;
}

// ─── Metadata ────────────────────────────────────────────

export const FINDING_TERM_MAP_METADATA = {
  builtAgainstCtVersion: "SEND Terminology 2017-03-31",
  lastUpdated: "2026-02-16",
  entryCount: Object.keys(FINDING_TERM_MAP).length,
  coverageNotes:
    "Covers all 64 findings in PointCross study + common rat/mouse tox histopath terms. Not a complete CT vocabulary.",
};
