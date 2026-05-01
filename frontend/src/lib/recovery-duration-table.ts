/**
 * Organ x Finding x Species Recovery Duration Lookup Table v3.
 *
 * Cross-validated three-way merge of literature sources (Brief 7).
 * 14 organs, 56 histopathology findings, 24 continuous endpoints.
 * Each entry carries its own severity modulation model and species modifiers.
 *
 * @see docs/_internal/research/recovery-duration/recovery_duration_lookup_v3_merged.json
 * @see docs/_internal/research/recovery-duration/cross-validation-report.md
 */

import type { ReversibilityQualifier } from "./finding-nature";
import { normalizeSpeciesKey } from "./species-key";

// ─── Types ────────────────────────────────────────────────

export type SeverityModulationModel =
  | "none"
  | "modest_scaling"
  | "threshold_to_poor_recovery"
  | "deposit_proportional";

export type LookupConfidence = "high" | "moderate" | "low";

export interface SeverityModulationEntry {
  model: SeverityModulationModel;
  minimal: number;
  mild: number;
  moderate: number;
  marked: number | null;   // null = severity too high → switch to unlikely/none
  severe: number | null;
}

export interface RecoveryDurationEntry {
  base_weeks: { low: number | null; high: number | null };
  reversibility: ReversibilityQualifier;
  severity: SeverityModulationEntry;
  species: { rat: number | null; mouse: number | null; dog: number | null; nhp: number | null };
  confidence: LookupConfidence;
}

export interface RecoveryLookupResult {
  weeks: { low: number; high: number } | null;
  reversibility: ReversibilityQualifier;
  confidence: LookupConfidence;
  severity_capped: boolean;           // true when marked/severe null → downgraded
  source: "organ_specific" | "generic_fallback";
  organ_key: string | null;
  finding_key: string | null;
}

// ─── Shared severity templates ────────────────────────────

type OrganTable = Record<string, RecoveryDurationEntry>;

const S_NONE: SeverityModulationEntry = { model: "none", minimal: 1, mild: 1, moderate: 1, marked: 1, severe: 1 };
const S_MODEST: SeverityModulationEntry = { model: "modest_scaling", minimal: 1, mild: 1, moderate: 1.25, marked: 1.5, severe: null };
const S_THRESH: SeverityModulationEntry = { model: "threshold_to_poor_recovery", minimal: 1, mild: 1, moderate: 1.25, marked: null, severe: null };
const S_DEPOSIT: SeverityModulationEntry = { model: "deposit_proportional", minimal: 1, mild: 1, moderate: 1.5, marked: 2.0, severe: 2.5 };

// ─── Histopathology lookup table (14 organs, 56 findings) ─

const RECOVERY_TABLE: Record<string, OrganTable> = {
  LIVER: {
    hypertrophy_hepatocellular:        { base_weeks: { low: 1, high: 4 },  reversibility: "expected", severity: { model: "modest_scaling", minimal: 1, mild: 1, moderate: 1.3, marked: 1.5, severe: null }, species: { rat: 1, mouse: 0.9, dog: 1.5, nhp: 1.5 }, confidence: "high" },
    necrosis_hepatocellular:           { base_weeks: { low: 1, high: 8 },  reversibility: "possible", severity: { model: "threshold_to_poor_recovery", minimal: 1, mild: 1.25, moderate: 1.5, marked: null, severe: null }, species: { rat: 1, mouse: 0.9, dog: 1.3, nhp: 1.5 }, confidence: "moderate" },
    vacuolation_hepatocellular:        { base_weeks: { low: 1, high: 4 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.5, nhp: 1.5 }, confidence: "moderate" },
    vacuolation_phospholipidosis:      { base_weeks: { low: 2, high: 8 },  reversibility: "possible", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.5, nhp: 1.5 }, confidence: "moderate" },
    bile_duct_hyperplasia:             { base_weeks: { low: 4, high: 12 }, reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.5, nhp: 1.5 }, confidence: "low" },
    inflammation_portal_lobular:       { base_weeks: { low: 2, high: 8 },  reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.5, nhp: 1.5 }, confidence: "moderate" },
    kupffer_cell_hypertrophy_hyperplasia: { base_weeks: { low: 1, high: 6 }, reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.5, nhp: 1.5 }, confidence: "moderate" },
    glycogen_depletion:                { base_weeks: { low: 0.1, high: 2 }, reversibility: "expected", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: 1.5, nhp: 1.5 }, confidence: "high" },
  },
  KIDNEY: {
    tubular_degeneration_necrosis:     { base_weeks: { low: 1, high: 8 },  reversibility: "possible", severity: { model: "threshold_to_poor_recovery", minimal: 1, mild: 1.25, moderate: 1.5, marked: null, severe: null }, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "high" },
    tubular_basophilia:                { base_weeks: { low: 1, high: 4 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "high" },
    tubular_dilatation:                { base_weeks: { low: 2, high: 8 },  reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "low" },
    interstitial_inflammation:         { base_weeks: { low: 2, high: 6 },  reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "low" },
    interstitial_nephritis:            { base_weeks: { low: 4, high: 12 }, reversibility: "unlikely", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "low" },
    mineralization:                    { base_weeks: { low: null, high: null }, reversibility: "none", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "high" },
    cast_formation:                    { base_weeks: { low: 0.5, high: 4 }, reversibility: "expected", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "moderate" },
  },
  THYROID: {
    follicular_cell_hypertrophy:       { base_weeks: { low: 2, high: 4 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.3, nhp: 1.5 }, confidence: "moderate" },
    follicular_cell_hyperplasia:       { base_weeks: { low: 2, high: 6 },  reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.4, nhp: 1.6 }, confidence: "moderate" },
    colloid_alteration:                { base_weeks: { low: 1, high: 3 },  reversibility: "expected", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: 1.3, nhp: 1.5 }, confidence: "moderate" },
    follicular_cell_hyperplasia_focal: { base_weeks: { low: 8, high: null }, reversibility: "unlikely", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: null, nhp: null }, confidence: "moderate" },
  },
  ADRENAL: {
    cortical_hypertrophy:              { base_weeks: { low: 1, high: 4 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.3, nhp: 1.4 }, confidence: "moderate" },
    cortical_vacuolation:              { base_weeks: { low: 1, high: 4 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.3, nhp: 1.4 }, confidence: "low" },
    medullary_hyperplasia:             { base_weeks: { low: 4, high: 8 },  reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "low" },
  },
  SPLEEN: {
    extramedullary_hematopoiesis_increase: { base_weeks: { low: 1, high: 4 }, reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.8, dog: 1.5, nhp: 1.4 }, confidence: "high" },
    lymphoid_depletion:                { base_weeks: { low: 2, high: 4 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.4, nhp: 1.5 }, confidence: "moderate" },
    congestion:                        { base_weeks: { low: 0.5, high: 2 }, reversibility: "expected", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "low" },
    hemosiderosis:                     { base_weeks: { low: 4, high: 12 }, reversibility: "possible", severity: S_DEPOSIT, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "low" },
  },
  THYMUS: {
    cortical_atrophy_lymphoid_depletion: { base_weeks: { low: 1, high: 4 }, reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.4, nhp: 1.5 }, confidence: "high" },
    apoptosis_increased:               { base_weeks: { low: 1, high: 2 },  reversibility: "expected", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: 1.4, nhp: 1.5 }, confidence: "moderate" },
  },
  TESTIS: {
    decreased_spermatogenesis:         { base_weeks: { low: 6, high: 12 }, reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.7, dog: 1.2, nhp: 0.8 }, confidence: "high" },
    germ_cell_degeneration:            { base_weeks: { low: 4, high: 8 },  reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.8, dog: 1.2, nhp: 1.4 }, confidence: "high" },
    seminiferous_tubule_atrophy:       { base_weeks: { low: 8, high: 24 }, reversibility: "unlikely", severity: S_THRESH, species: { rat: 1, mouse: 0.8, dog: 1.2, nhp: 1.4 }, confidence: "high" },
    leydig_cell_hypertrophy:           { base_weeks: { low: 2, high: 6 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.8, dog: 1.2, nhp: 1.4 }, confidence: "moderate" },
  },
  BONE_MARROW: {
    hypocellularity:                   { base_weeks: { low: 1, high: 6 },  reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.8, dog: 1.5, nhp: 1.4 }, confidence: "high" },
    myeloid_depletion:                 { base_weeks: { low: 1, high: 3 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.8, dog: 1.5, nhp: 1.4 }, confidence: "moderate" },
    erythroid_depletion:               { base_weeks: { low: 2, high: 6 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.8, dog: 1.5, nhp: 1.4 }, confidence: "high" },
    cellularity_increase:              { base_weeks: { low: 1, high: 3 },  reversibility: "expected", severity: S_NONE, species: { rat: 1, mouse: 0.8, dog: 1.5, nhp: 1.4 }, confidence: "moderate" },
  },
  STOMACH: {
    mucosal_hyperplasia_glandular:     { base_weeks: { low: 2, high: 6 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.2 }, confidence: "moderate" },
    mucosal_hyperplasia_forestomach:   { base_weeks: { low: 2, high: 13 }, reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: null, nhp: null }, confidence: "moderate" },
    erosion:                           { base_weeks: { low: 1, high: 3 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "moderate" },
    ulceration:                        { base_weeks: { low: 2, high: 12 }, reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "moderate" },
  },
  HEART: {
    cardiomyocyte_degeneration_necrosis: { base_weeks: { low: null, high: null }, reversibility: "none", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.1 }, confidence: "high" },
    inflammation:                      { base_weeks: { low: 2, high: 8 },  reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "low" },
    fibrosis:                          { base_weeks: { low: null, high: null }, reversibility: "none", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "high" },
  },
  LUNG: {
    alveolar_macrophage_accumulation:  { base_weeks: { low: 1, high: 8 },  reversibility: "possible", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "high" },
    inflammation:                      { base_weeks: { low: 2, high: 12 }, reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "low" },
    alveolar_epithelial_hyperplasia:   { base_weeks: { low: 4, high: 12 }, reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "low" },
  },
  LYMPH_NODE: {
    hyperplasia_follicular_paracortical: { base_weeks: { low: 2, high: 4 }, reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "high" },
    sinus_histiocytosis:               { base_weeks: { low: 2, high: 6 },  reversibility: "possible", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "moderate" },
    atrophy:                           { base_weeks: { low: 2, high: 8 },  reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "low" },
  },
  INJECTION_SITE: {
    inflammation:                      { base_weeks: { low: 1, high: 4 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "high" },
    necrosis:                          { base_weeks: { low: 2, high: 6 },  reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "moderate" },
    fibrosis:                          { base_weeks: { low: 26, high: 52 }, reversibility: "none", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "high" },
    granuloma:                         { base_weeks: { low: 4, high: 26 }, reversibility: "unlikely", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "high" },
  },
  GENERAL: {
    hemorrhage:                        { base_weeks: { low: 0.5, high: 3 }, reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "moderate" },
    congestion:                        { base_weeks: { low: 0.5, high: 2 }, reversibility: "expected", severity: S_NONE, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "moderate" },
    pigmentation:                      { base_weeks: { low: 4, high: 26 }, reversibility: "possible", severity: S_DEPOSIT, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "moderate" },
  },
};

// ─── Continuous endpoint recovery (24 entries) ────────────

export const CONTINUOUS_RECOVERY: Record<string, Record<string, RecoveryDurationEntry>> = {
  organ_weights: {
    liver_weight_increase:    { base_weeks: { low: 1, high: 4 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.5, nhp: 1.5 }, confidence: "high" },
    thymus_weight_decrease:   { base_weeks: { low: 1, high: 3 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.4, nhp: 1.5 }, confidence: "high" },
    testis_weight_decrease:   { base_weeks: { low: 6, high: 10 }, reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.8, dog: 1.2, nhp: 1.4 }, confidence: "high" },
    kidney_weight_change:     { base_weeks: { low: 2, high: 6 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "low" },
    adrenal_weight_increase:  { base_weeks: { low: 2, high: 4 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.3, nhp: 1.4 }, confidence: "moderate" },
    spleen_weight_change:     { base_weeks: { low: 1, high: 4 },  reversibility: "expected", severity: S_NONE, species: { rat: 1, mouse: 0.8, dog: 1.5, nhp: 1.4 }, confidence: "moderate" },
  },
  clinical_chemistry: {
    ALT_increase:              { base_weeks: { low: 0.5, high: 2 }, reversibility: "expected", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.5, nhp: 1.5 }, confidence: "high" },
    AST_increase:              { base_weeks: { low: 0.3, high: 1 }, reversibility: "expected", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.3, nhp: 1.3 }, confidence: "moderate" },
    ALP_increase:              { base_weeks: { low: 1, high: 3 },   reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.5, nhp: 1.5 }, confidence: "moderate" },
    albumin_decrease:          { base_weeks: { low: 2, high: 8 },   reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.8, nhp: 2.0 }, confidence: "moderate" },
    GGT_increase:              { base_weeks: { low: 1, high: 3 },   reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.9, dog: 1.3, nhp: 1.3 }, confidence: "low" },
    bilirubin_increase:        { base_weeks: { low: 1, high: 3 },   reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.5, nhp: 1.5 }, confidence: "low" },
    BUN_increase:              { base_weeks: { low: 1, high: 4 },   reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "moderate" },
    creatinine_increase:       { base_weeks: { low: 1, high: 4 },   reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.1, nhp: 1.2 }, confidence: "moderate" },
  },
  hematology: {
    neutrophil_wbc_decrease:   { base_weeks: { low: 1, high: 3 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.8, dog: 1.5, nhp: 1.4 }, confidence: "high" },
    platelet_decrease:         { base_weeks: { low: 1, high: 3 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.8, dog: 1.5, nhp: 1.4 }, confidence: "high" },
    rbc_hgb_hct_decrease:      { base_weeks: { low: 4, high: 8 },  reversibility: "expected", severity: S_MODEST, species: { rat: 1, mouse: 0.7, dog: 1.8, nhp: 2.0 }, confidence: "high" },
    reticulocyte_increase:     { base_weeks: { low: 1, high: 2 },  reversibility: "expected", severity: S_NONE, species: { rat: 1, mouse: 0.8, dog: 1.5, nhp: 1.4 }, confidence: "moderate" },
  },
  body_weight: {
    body_weight_decrease:      { base_weeks: { low: 2, high: 8 },  reversibility: "possible", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "low" },
  },
  coagulation: {
    PT_APTT_fibrinogen_change: { base_weeks: { low: 0.5, high: 2 }, reversibility: "expected", severity: S_THRESH, species: { rat: 1, mouse: 0.9, dog: 1.2, nhp: 1.3 }, confidence: "low" },
  },
};

// ─── Specimen → organ key mapping ─────────────────────────

const SPECIMEN_EXACT: Record<string, string> = {
  LIVER: "LIVER",
  KIDNEY: "KIDNEY", KIDNEYS: "KIDNEY",
  SPLEEN: "SPLEEN",
  THYMUS: "THYMUS",
  TESTIS: "TESTIS", TESTES: "TESTIS",
  HEART: "HEART",
  LUNG: "LUNG", LUNGS: "LUNG",
  STOMACH: "STOMACH",
};

const SPECIMEN_SUBSTRING: [string, string][] = [
  ["THYROID", "THYROID"],
  ["ADRENAL", "ADRENAL"],
  ["BONE MARROW", "BONE_MARROW"],
  ["LYMPH NODE", "LYMPH_NODE"],
  ["INJECTION SITE", "INJECTION_SITE"],
];

export function specimenToOrganKey(specimen: string): string | null {
  const upper = specimen.toUpperCase().trim();
  // Strip common SEND qualifiers
  const cleaned = upper
    .replace(/\s*\(.*?\)\s*/g, "")   // "(WEIGHT)", "(LEFT)", etc.
    .replace(/,\s*(LEFT|RIGHT|BILATERAL)\s*$/i, "")
    .replace(/GLAND,?\s*/i, "")
    .trim();

  const exact = SPECIMEN_EXACT[cleaned];
  if (exact) return exact;

  for (const [substr, key] of SPECIMEN_SUBSTRING) {
    if (cleaned.includes(substr)) return key;
  }
  return null;
}

// ─── Finding → entry key matching ─────────────────────────

/** Organ-specific synonym overrides for ambiguous finding names. */
const FINDING_SYNONYMS: Record<string, Record<string, string>> = {
  LIVER: {
    phospholipidosis: "vacuolation_phospholipidosis",
    vacuolation: "vacuolation_hepatocellular",
    "fatty change": "vacuolation_hepatocellular",
    hypertrophy: "hypertrophy_hepatocellular",
    necrosis: "necrosis_hepatocellular",
    inflammation: "inflammation_portal_lobular",
    "kupffer cell": "kupffer_cell_hypertrophy_hyperplasia",
    "glycogen": "glycogen_depletion",
    "bile duct": "bile_duct_hyperplasia",
  },
  KIDNEY: {
    degeneration: "tubular_degeneration_necrosis",
    necrosis: "tubular_degeneration_necrosis",
    basophilia: "tubular_basophilia",
    "basophilic tubules": "tubular_basophilia",
    dilatation: "tubular_dilatation",
    dilation: "tubular_dilatation",
    nephritis: "interstitial_nephritis",
    inflammation: "interstitial_inflammation",
    mineralization: "mineralization",
    cast: "cast_formation",
  },
  THYROID: {
    hypertrophy: "follicular_cell_hypertrophy",
    hyperplasia: "follicular_cell_hyperplasia",
    "focal hyperplasia": "follicular_cell_hyperplasia_focal",
    colloid: "colloid_alteration",
  },
  ADRENAL: {
    hypertrophy: "cortical_hypertrophy",
    vacuolation: "cortical_vacuolation",
    hyperplasia: "medullary_hyperplasia",
  },
  SPLEEN: {
    "extramedullary hematopoiesis": "extramedullary_hematopoiesis_increase",
    emh: "extramedullary_hematopoiesis_increase",
    hematopoiesis: "extramedullary_hematopoiesis_increase",
    "lymphoid depletion": "lymphoid_depletion",
    congestion: "congestion",
    hemosiderosis: "hemosiderosis",
    hemosiderin: "hemosiderosis",
  },
  THYMUS: {
    atrophy: "cortical_atrophy_lymphoid_depletion",
    "lymphoid depletion": "cortical_atrophy_lymphoid_depletion",
    apoptosis: "apoptosis_increased",
  },
  TESTIS: {
    "decreased spermatogenesis": "decreased_spermatogenesis",
    spermatogenesis: "decreased_spermatogenesis",
    "germ cell": "germ_cell_degeneration",
    atrophy: "seminiferous_tubule_atrophy",
    "leydig": "leydig_cell_hypertrophy",
  },
  BONE_MARROW: {
    hypocellularity: "hypocellularity",
    "decreased cellularity": "hypocellularity",
    "myeloid depletion": "myeloid_depletion",
    "erythroid depletion": "erythroid_depletion",
    "increased cellularity": "cellularity_increase",
    hypercellularity: "cellularity_increase",
  },
  STOMACH: {
    hyperplasia: "mucosal_hyperplasia_glandular",
    erosion: "erosion",
    ulceration: "ulceration",
    ulcer: "ulceration",
  },
  HEART: {
    degeneration: "cardiomyocyte_degeneration_necrosis",
    necrosis: "cardiomyocyte_degeneration_necrosis",
    inflammation: "inflammation",
    fibrosis: "fibrosis",
  },
  LUNG: {
    "alveolar macrophage": "alveolar_macrophage_accumulation",
    macrophage: "alveolar_macrophage_accumulation",
    inflammation: "inflammation",
    hyperplasia: "alveolar_epithelial_hyperplasia",
  },
  LYMPH_NODE: {
    hyperplasia: "hyperplasia_follicular_paracortical",
    histiocytosis: "sinus_histiocytosis",
    atrophy: "atrophy",
  },
  INJECTION_SITE: {
    inflammation: "inflammation",
    necrosis: "necrosis",
    fibrosis: "fibrosis",
    granuloma: "granuloma",
  },
  GENERAL: {
    hemorrhage: "hemorrhage",
    bleeding: "hemorrhage",
    congestion: "congestion",
    pigmentation: "pigmentation",
    pigment: "pigmentation",
  },
};

export function findingToEntryKey(findingName: string, organKey: string): string | null {
  const lower = findingName.toLowerCase().trim();
  const organEntries = RECOVERY_TABLE[organKey];
  if (!organEntries) return null;

  // 1. Direct match — finding name IS the entry key (after normalization)
  const normalized = lower.replace(/[,\s]+/g, "_").replace(/_+/g, "_");
  if (organEntries[normalized]) return normalized;

  // 2. Check entry keys as substrings of finding name (longest match first)
  const entryKeys = Object.keys(organEntries).sort((a, b) => b.length - a.length);
  for (const key of entryKeys) {
    const keyWords = key.split("_");
    if (keyWords.every(w => lower.includes(w))) return key;
  }

  // 3. Synonym map
  const synonyms = FINDING_SYNONYMS[organKey];
  if (synonyms) {
    // Try longest synonym keys first
    const synKeys = Object.keys(synonyms).sort((a, b) => b.length - a.length);
    for (const syn of synKeys) {
      if (lower.includes(syn)) return synonyms[syn];
    }
  }

  return null;
}

// ─── Severity modulation ──────────────────────────────────

const SEVERITY_GRADE_MAP: Record<number, "minimal" | "mild" | "moderate" | "marked" | "severe"> = {
  1: "minimal", 2: "mild", 3: "moderate", 4: "marked", 5: "severe",
};

export function applySeverityModulation(
  entry: RecoveryDurationEntry,
  maxSeverity: number | null | undefined,
): { weeks: { low: number; high: number } | null; reversibility: ReversibilityQualifier; capped: boolean } {
  // Null base_weeks = irreversible finding, no meaningful duration
  if (entry.base_weeks.low == null || entry.base_weeks.high == null) {
    return { weeks: null, reversibility: entry.reversibility, capped: false };
  }

  if (maxSeverity == null || maxSeverity < 1) {
    return { weeks: { low: entry.base_weeks.low, high: entry.base_weeks.high }, reversibility: entry.reversibility, capped: false };
  }

  const grade = SEVERITY_GRADE_MAP[Math.min(Math.round(maxSeverity), 5)] ?? "moderate";
  const sev = entry.severity;
  const multiplier = sev[grade];

  // null multiplier = severity exceeds recoverable threshold
  if (multiplier == null) {
    // Downgrade reversibility
    const downgraded: ReversibilityQualifier =
      entry.reversibility === "expected" ? "unlikely"
        : entry.reversibility === "possible" ? "unlikely"
          : "none";
    return { weeks: { low: entry.base_weeks.low, high: entry.base_weeks.high }, reversibility: downgraded, capped: true };
  }

  return {
    weeks: {
      low: Math.round(entry.base_weeks.low * multiplier * 10) / 10,
      high: Math.round(entry.base_weeks.high * multiplier * 10) / 10,
    },
    reversibility: entry.reversibility,
    capped: false,
  };
}

// ─── Species modifier ─────────────────────────────────────

/**
 * GAP-218 adapter: delegates to canonical normalizeSpeciesKey() and maps
 * "cynomolgus" -> "nhp" because the recovery-duration JSON entry.species[]
 * keys use the "nhp" vocabulary. Returns null for unrecognized species
 * (preserves prior behavior; consumer skips modifier when null).
 */
function normalizeSpecies(species: string): "rat" | "mouse" | "dog" | "nhp" | null {
  const canonical = normalizeSpeciesKey(species);
  if (canonical === "cynomolgus") return "nhp";
  if (canonical === "rat" || canonical === "mouse" || canonical === "dog") return canonical;
  return null;
}

export function applySpeciesModifier(
  weeks: { low: number; high: number } | null,
  entry: RecoveryDurationEntry,
  species: string | null | undefined,
): { low: number; high: number } | null {
  if (weeks == null) return null;
  if (!species) return weeks;
  const key = normalizeSpecies(species);
  if (!key) return weeks;
  const mod = entry.species[key];
  // null modifier = species not applicable for this finding
  if (mod == null) return weeks;
  return {
    low: Math.round(weeks.low * mod * 10) / 10,
    high: Math.round(weeks.high * mod * 10) / 10,
  };
}

// ─── Primary lookup ───────────────────────────────────────

export function lookupRecoveryDuration(
  findingName: string,
  opts?: {
    organ?: string | null;
    species?: string | null;
    maxSeverity?: number | null;
  },
): RecoveryLookupResult | null {
  const organ = opts?.organ ? specimenToOrganKey(opts.organ) : null;

  // Organ-specific lookup
  if (organ) {
    const entryKey = findingToEntryKey(findingName, organ);
    if (entryKey) {
      const entry = RECOVERY_TABLE[organ][entryKey];
      const { weeks, reversibility, capped } = applySeverityModulation(entry, opts?.maxSeverity);
      const finalWeeks = applySpeciesModifier(weeks, entry, opts?.species);
      return {
        weeks: finalWeeks,
        reversibility,
        confidence: entry.confidence,
        severity_capped: capped,
        source: "organ_specific",
        organ_key: organ,
        finding_key: entryKey,
      };
    }
  }

  // Generic fallback: scan all organs for a finding match
  const lower = findingName.toLowerCase();
  let bestMatch: { organ: string; key: string; entry: RecoveryDurationEntry } | null = null;
  let bestScore = 0;

  for (const [orgKey, findings] of Object.entries(RECOVERY_TABLE)) {
    for (const [fKey, entry] of Object.entries(findings)) {
      const keyWords = fKey.split("_");
      const matchCount = keyWords.filter(w => lower.includes(w)).length;
      // Require at least 1 word match and prefer longer matches
      if (matchCount > 0 && matchCount > bestScore) {
        bestScore = matchCount;
        bestMatch = { organ: orgKey, key: fKey, entry };
      }
    }
  }

  if (bestMatch) {
    const { weeks, reversibility, capped } = applySeverityModulation(bestMatch.entry, opts?.maxSeverity);
    const finalWeeks = applySpeciesModifier(weeks, bestMatch.entry, opts?.species);
    return {
      weeks: finalWeeks,
      reversibility,
      confidence: bestMatch.entry.confidence,
      severity_capped: capped,
      source: "generic_fallback",
      organ_key: bestMatch.organ,
      finding_key: bestMatch.key,
    };
  }

  return null;
}

// ─── Continuous endpoint lookup ───────────────────────────

export function lookupContinuousRecovery(
  category: string,
  endpoint: string,
): RecoveryDurationEntry | null {
  const cat = CONTINUOUS_RECOVERY[category];
  if (!cat) return null;
  return cat[endpoint] ?? null;
}

// ─── Uncertainty model ────────────────────────────────────

const UNCERTAINTY_DEFAULTS: Record<LookupConfidence, { low_pct: number; high_pct: number }> = {
  high:     { low_pct: 25, high_pct: 35 },
  moderate: { low_pct: 25, high_pct: 50 },
  low:      { low_pct: 25, high_pct: 75 },
};

const UNCERTAINTY_TIGHTENING: Record<string, { low_pct: number; high_pct: number }> = {
  liver_hypertrophy:    { low_pct: 20, high_pct: 30 },
  thymic_stress:        { low_pct: 20, high_pct: 30 },
};

const UNCERTAINTY_WIDENING: Record<string, { low_pct: number; high_pct: number }> = {
  injection_site:       { low_pct: 30, high_pct: 75 },
  kidney_with_CPN:      { low_pct: 30, high_pct: 75 },
};

const UNCERTAINTY_FLOOR = 0.5;
const UNCERTAINTY_MAX_MARGIN = 8;

export function computeUncertaintyBands(
  weeks: { low: number; high: number },
  confidence: LookupConfidence,
  organKey?: string | null,
  findingKey?: string | null,
): { lower: number; upper: number } {
  // Determine percentage bands
  let pcts = UNCERTAINTY_DEFAULTS[confidence];

  // Check for organ-specific overrides
  if (organKey && findingKey) {
    const lookupKey = `${organKey.toLowerCase()}_${findingKey}`;
    if (lookupKey.includes("liver") && lookupKey.includes("hypertrophy")) {
      pcts = UNCERTAINTY_TIGHTENING.liver_hypertrophy;
    } else if (lookupKey.includes("thymus") || lookupKey.includes("thymic")) {
      pcts = UNCERTAINTY_TIGHTENING.thymic_stress;
    } else if (lookupKey.includes("injection_site")) {
      pcts = UNCERTAINTY_WIDENING.injection_site;
    } else if (lookupKey.includes("kidney") && lookupKey.includes("cpn")) {
      pcts = UNCERTAINTY_WIDENING.kidney_with_CPN;
    }
  }

  const lowMargin = Math.min(weeks.low * (pcts.low_pct / 100), UNCERTAINTY_MAX_MARGIN);
  const highMargin = Math.min(weeks.high * (pcts.high_pct / 100), UNCERTAINTY_MAX_MARGIN);

  return {
    lower: Math.max(UNCERTAINTY_FLOOR, Math.round((weeks.low - lowMargin) * 10) / 10),
    upper: Math.round((weeks.high + highMargin) * 10) / 10,
  };
}

// ─── Metadata ─────────────────────────────────────────────

export const RECOVERY_TABLE_METADATA = {
  version: "3.0-merged",
  source: "Brief 7 three-way merge (2026-03)",
  organs: Object.keys(RECOVERY_TABLE).length,
  histopath_entries: Object.values(RECOVERY_TABLE).reduce((sum, o) => sum + Object.keys(o).length, 0),
  continuous_entries: Object.values(CONTINUOUS_RECOVERY).reduce((sum, c) => sum + Object.keys(c).length, 0),
  status: "cross-validated three-way merge",
};
