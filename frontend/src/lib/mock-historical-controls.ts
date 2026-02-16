/**
 * Historical control data (HCD) — context-aware lookup with Charles River seed data.
 *
 * v2: Context-aware matching (IMP-02)
 * - Strain, sex, duration, route-aware 4-tier matching
 * - Charles River Crl:CD(SD) published reference ranges (34 control groups, 4-26 weeks)
 * - Legacy mock entries as general fallback
 *
 * In production, replaced by a backend query against a real HCD database.
 */

import type { StudyContext } from "@/types/study-context";

// ─── Types ────────────────────────────────────────────────

export type DurationBucket = "short" | "subchronic" | "chronic" | "carcinogenicity";

export interface HCDEntry {
  finding: string;           // case-insensitive match key
  specimen: string;          // UPPERCASE per SEND convention, or "GENERAL" for fallback
  strain: string;            // "SPRAGUE-DAWLEY", "*" for any
  species: string;           // "RAT", "MOUSE"
  sex: "M" | "F" | "BOTH";
  durationBucket: DurationBucket | "any";
  route: "oral" | "parenteral" | "any";
  meanIncidencePct: number;  // percentage (e.g., 15.0 = 15%)
  rangeLowPct: number;
  rangeHighPct: number;
  nStudies: number;
  isMock: boolean;
  notes: string | null;
  source: string;
}

export interface HistoricalControlQuery {
  finding: string;
  specimen: string;
  sex: "M" | "F";
  context: StudyContext;
}

export interface HistoricalControlResult {
  meanIncidence: number;       // as fraction (0.15 = 15%)
  range: [number, number];     // [low, high] as fractions
  nStudies: number;
  classification: "ABOVE" | "WITHIN" | "BELOW" | "NO_DATA";
  contextLabel: string;        // e.g., "Sprague-Dawley, oral gavage, 13-week, male"
  isMock: boolean;
  strainSpecific: boolean;     // true if matched on strain, false if species fallback
  notes: string | null;
  /** For backward compat — the raw entry that matched */
  entry: HCDEntry;
}

// Backward-compat type (used by existing call sites)
export interface HistoricalControlData {
  finding: string;
  organ: string;
  strain: string;
  species: string;
  sex: "M" | "F" | "combined";
  mean_incidence: number;
  min_incidence: number;
  max_incidence: number;
  p5_incidence: number;
  p95_incidence: number;
  sd_incidence: number;
  n_studies: number;
  n_animals: number;
  severity_mean: number;
  severity_max: number;
  source: "mock" | "laboratory" | "published";
  last_updated: string;
}

// ─── Duration bucket ──────────────────────────────────────

export function getDurationBucket(durationWeeks: number | null): DurationBucket | null {
  if (durationWeeks == null) return null;
  if (durationWeeks <= 4) return "short";
  if (durationWeeks <= 26) return "subchronic";
  if (durationWeeks <= 52) return "chronic";
  return "carcinogenicity";
}

function routeCategory(route: string): "oral" | "parenteral" | "any" {
  const r = route.toUpperCase();
  if (r.includes("ORAL") || r.includes("GAVAGE") || r.includes("DIETARY") || r.includes("DIET")) return "oral";
  if (r.includes("INJECT") || r.includes("SUBCUTANEOUS") || r.includes("INTRAMUSCULAR") || r.includes("INTRAVENOUS")) return "parenteral";
  return "any";
}

// ─── Charles River Crl:CD(SD) seed data ───────────────────
// Source: Charles River Laboratories published HCD, Crl:CD(SD) rats,
// 34 control groups, ages 4-26 weeks. isMock: false.

const CR = {
  strain: "SPRAGUE-DAWLEY",
  species: "RAT",
  durationBucket: "subchronic" as const,
  route: "any" as const,
  nStudies: 34,
  isMock: false,
  source: "Charles River Crl:CD(SD) Background Data, 4-26 week control groups",
};

const HCD_DATABASE: HCDEntry[] = [
  // ─── Male Crl:CD(SD) — from spec tables ────────────────
  { ...CR, sex: "M", specimen: "KIDNEY", finding: "basophilia",
    meanIncidencePct: 34.2, rangeLowPct: 8.33, rangeHighPct: 60.0,
    notes: "Tubular basophilia; wide range — grade and criteria vary" },
  { ...CR, sex: "M", specimen: "KIDNEY", finding: "dilatation",
    meanIncidencePct: 19.5, rangeLowPct: 9.09, rangeHighPct: 30.0,
    notes: "Renal pelvis dilatation; common incidental" },
  { ...CR, sex: "M", specimen: "HEART", finding: "cardiomyopathy",
    meanIncidencePct: 24.5, rangeLowPct: 9.09, rangeHighPct: 40.0,
    notes: "Spontaneous focal cardiomyopathy; progressive with age" },
  { ...CR, sex: "M", specimen: "PITUITARY", finding: "basophil hypertrophy",
    meanIncidencePct: 75.0, rangeLowPct: 50.0, rangeHighPct: 100.0,
    notes: "Extremely common; near-universal in some studies" },
  { ...CR, sex: "M", specimen: "PITUITARY", finding: "basophil vacuolation",
    meanIncidencePct: 41.7, rangeLowPct: 8.33, rangeHighPct: 75.0,
    notes: "Wide range across studies" },
  { ...CR, sex: "M", specimen: "PITUITARY", finding: "cyst",
    meanIncidencePct: 10.0, rangeLowPct: 10.0, rangeHighPct: 10.0,
    notes: "Narrow range (few studies with data)" },
  { ...CR, sex: "M", specimen: "MESENTERIC LYMPH NODE", finding: "infiltrate",
    meanIncidencePct: 34.5, rangeLowPct: 9.09, rangeHighPct: 60.0,
    notes: "Lymphocytic/plasmacytic infiltrate; common reactive finding" },
  { ...CR, sex: "M", specimen: "LUNG", finding: "neutrophilic perivascular infiltrate",
    meanIncidencePct: 24.2, rangeLowPct: 8.33, rangeHighPct: 40.0,
    notes: "Background inflammatory" },
  { ...CR, sex: "M", specimen: "LUNG", finding: "perivascular hemorrhage",
    meanIncidencePct: 58.3, rangeLowPct: 16.67, rangeHighPct: 100.0,
    notes: "Very wide range; may be agonal/procedure artifact" },
  { ...CR, sex: "M", specimen: "SPLEEN", finding: "extramedullary hematopoiesis",
    meanIncidencePct: 22.5, rangeLowPct: 5.0, rangeHighPct: 40.0,
    notes: "Very common background finding" },
  { ...CR, sex: "M", specimen: "TESTIS", finding: "atrophy",
    meanIncidencePct: 10.0, rangeLowPct: 10.0, rangeHighPct: 10.0,
    notes: "Low background; seminiferous tubule atrophy" },
  { ...CR, sex: "M", specimen: "TESTIS", finding: "decreased spermatogenesis",
    meanIncidencePct: 10.0, rangeLowPct: 10.0, rangeHighPct: 10.0,
    notes: "Low background" },
  { ...CR, sex: "M", specimen: "TESTIS", finding: "degeneration",
    meanIncidencePct: 10.0, rangeLowPct: 10.0, rangeHighPct: 10.0,
    notes: "Low background; seminiferous tubule degeneration" },
  { ...CR, sex: "M", specimen: "PROSTATE", finding: "chronic inflammation",
    meanIncidencePct: 24.5, rangeLowPct: 9.09, rangeHighPct: 40.0,
    notes: "Common incidental; multifocal, minimal" },
  { ...CR, sex: "M", specimen: "PROSTATE", finding: "mononuclear infiltrate",
    meanIncidencePct: 18.3, rangeLowPct: 6.67, rangeHighPct: 30.0,
    notes: "Common incidental" },

  // ─── Female Crl:CD(SD) — from spec tables ──────────────
  { ...CR, sex: "F", specimen: "LIVER", finding: "mononuclear infiltrate",
    meanIncidencePct: 54.2, rangeLowPct: 8.33, rangeHighPct: 100.0,
    notes: "Extremely wide range; very common" },
  { ...CR, sex: "F", specimen: "LIVER", finding: "hepatocellular vacuolation",
    meanIncidencePct: 19.2, rangeLowPct: 8.33, rangeHighPct: 30.0,
    notes: "Common; usually glycogen/lipid" },
  { ...CR, sex: "F", specimen: "KIDNEY", finding: "basophilia",
    meanIncidencePct: 34.2, rangeLowPct: 8.33, rangeHighPct: 60.0,
    notes: "Tubular basophilia; same as males" },
  { ...CR, sex: "F", specimen: "KIDNEY", finding: "dilatation",
    meanIncidencePct: 19.5, rangeLowPct: 9.09, rangeHighPct: 30.0,
    notes: "Renal pelvis dilatation; same as males" },
  { ...CR, sex: "F", specimen: "THYROID", finding: "cyst",
    meanIncidencePct: 8.33, rangeLowPct: 8.33, rangeHighPct: 8.33,
    notes: "Narrow range" },
  { ...CR, sex: "F", specimen: "UTERUS", finding: "dilatation",
    meanIncidencePct: 54.5, rangeLowPct: 9.09, rangeHighPct: 100.0,
    notes: "Extremely common; estrous-cycle-dependent" },
  { ...CR, sex: "F", specimen: "UTERUS", finding: "cyst",
    meanIncidencePct: 10.0, rangeLowPct: 10.0, rangeHighPct: 10.0,
    notes: "Narrow range" },
  { ...CR, sex: "F", specimen: "OVARY", finding: "cyst",
    meanIncidencePct: 24.5, rangeLowPct: 9.09, rangeHighPct: 40.0,
    notes: "Follicular/luteal origin" },
  { ...CR, sex: "F", specimen: "HARDERIAN GLAND", finding: "infiltrate lymphocytic",
    meanIncidencePct: 10.0, rangeLowPct: 10.0, rangeHighPct: 10.0,
    notes: "Incidental" },

  // ─── Legacy mock entries (general fallback) ─────────────
  // Converted from original mock data. sex: "BOTH", route: "any", duration: "any"
  ...buildLegacyEntries(),
];

function buildLegacyEntries(): HCDEntry[] {
  const L = {
    strain: "SPRAGUE-DAWLEY",
    species: "RAT",
    sex: "BOTH" as const,
    durationBucket: "any" as const,
    route: "any" as const,
    isMock: true,
    source: "Mock prototype data",
  };

  function legacy(finding: string, specimen: string, meanPct: number, lowPct: number, highPct: number, n: number, notes: string | null = null): HCDEntry {
    return { ...L, finding, specimen, meanIncidencePct: meanPct, rangeLowPct: lowPct, rangeHighPct: highPct, nStudies: n, notes };
  }

  return [
    legacy("hepatocellular hypertrophy", "LIVER", 8, 2, 18, 24),
    legacy("hepatocellular vacuolation", "LIVER", 12, 4, 28, 22),
    legacy("hepatocellular necrosis", "LIVER", 2, 0, 6, 24),
    legacy("bile duct hyperplasia", "LIVER", 4, 0, 10, 20),
    legacy("hepatocellular adenoma", "LIVER", 1, 0, 4, 18),
    legacy("tubular degeneration", "KIDNEY", 6, 0, 16, 22),
    legacy("tubular basophilia", "KIDNEY", 15, 6, 30, 22),
    legacy("chronic progressive nephropathy", "KIDNEY", 35, 15, 60, 24),
    legacy("mineralization", "KIDNEY", 10, 2, 22, 20),
    legacy("alveolar macrophage infiltrate", "LUNG", 18, 6, 35, 20),
    legacy("perivascular inflammation", "LUNG", 10, 2, 22, 18),
    legacy("cardiomyopathy", "HEART", 20, 8, 40, 22),
    legacy("myocardial degeneration", "HEART", 5, 0, 12, 18),
    legacy("cortical hypertrophy", "ADRENAL", 14, 4, 28, 20),
    legacy("cortical vacuolation", "ADRENAL", 8, 2, 18, 18),
    legacy("follicular cell hypertrophy", "THYROID", 6, 0, 16, 20),
    legacy("follicular cell hyperplasia", "THYROID", 4, 0, 12, 18),
    legacy("tubular atrophy", "TESTIS", 3, 0, 8, 16),
    legacy("spermatogenic degeneration", "TESTIS", 5, 0, 14, 16),
    legacy("cyst", "OVARY", 10, 2, 22, 14),
    legacy("extramedullary hematopoiesis", "SPLEEN", 25, 10, 45, 22),
    legacy("lymphoid hyperplasia", "SPLEEN", 8, 2, 18, 20),
    legacy("lymphoid atrophy", "SPLEEN", 4, 0, 10, 18),
    legacy("squamous cell hyperplasia", "STOMACH", 6, 0, 16, 16),
    legacy("erosion", "STOMACH", 3, 0, 8, 16),
    legacy("inflammation", "STOMACH", 8, 2, 18, 16),
    legacy("pigmentation", "GENERAL", 12, 4, 25, 20),
    legacy("inflammation", "GENERAL", 15, 6, 30, 24),
    legacy("fibrosis", "GENERAL", 4, 0, 10, 20),
    legacy("necrosis", "GENERAL", 3, 0, 8, 20),
  ];
}

// ─── Context-aware lookup ─────────────────────────────────

/**
 * Context-aware HCD query with 4-tier fallback matching.
 * Returns the best match for the given finding/specimen/sex in the study context.
 */
export function queryHistoricalControl(
  query: HistoricalControlQuery,
): HistoricalControlResult | null {
  const findingLower = query.finding.toLowerCase();
  const specimenUpper = query.specimen.toUpperCase();
  const studyStrain = query.context.strain.toUpperCase();
  const studyRoute = routeCategory(query.context.route);
  const studyDuration = getDurationBucket(query.context.dosingDurationWeeks);

  // Filter entries that match the finding (substring) and specimen
  const candidates = HCD_DATABASE.filter((e) => {
    const specMatch = e.specimen === "GENERAL"
      ? !HCD_DATABASE.some((o) => o.specimen === specimenUpper && findingLower.includes(o.finding.toLowerCase()))
      : specimenUpper.includes(e.specimen.toUpperCase());
    return findingLower.includes(e.finding.toLowerCase()) && specMatch;
  });

  if (candidates.length === 0) return null;

  // Sex filter: prefer exact sex match, accept BOTH as fallback
  const sexFiltered = candidates.filter((e) => e.sex === query.sex || e.sex === "BOTH");
  const pool = sexFiltered.length > 0 ? sexFiltered : candidates;

  // 4-tier matching
  let match: HCDEntry | null = null;
  let strainSpecific = false;

  // Tier 1: strain + species + route + sex + duration
  match = pool.find((e) =>
    e.strain === studyStrain &&
    (e.route === studyRoute || e.route === "any") &&
    (e.durationBucket === studyDuration || e.durationBucket === "any") &&
    (e.sex === query.sex || e.sex === "BOTH"),
  ) ?? null;
  if (match) strainSpecific = true;

  // Tier 2: strain + species + sex + duration (drop route)
  if (!match) {
    match = pool.find((e) =>
      e.strain === studyStrain &&
      (e.durationBucket === studyDuration || e.durationBucket === "any") &&
      (e.sex === query.sex || e.sex === "BOTH"),
    ) ?? null;
    if (match) strainSpecific = true;
  }

  // Tier 3: species + sex + duration (drop strain)
  if (!match) {
    match = pool.find((e) =>
      (e.durationBucket === studyDuration || e.durationBucket === "any") &&
      (e.sex === query.sex || e.sex === "BOTH"),
    ) ?? null;
  }

  // Tier 4: species + sex (drop duration)
  if (!match) {
    match = pool.find((e) =>
      e.sex === query.sex || e.sex === "BOTH",
    ) ?? null;
  }

  // Final fallback: any match
  if (!match) match = pool[0] ?? null;
  if (!match) return null;

  const meanInc = match.meanIncidencePct / 100;
  const rangeLow = match.rangeLowPct / 100;
  const rangeHigh = match.rangeHighPct / 100;

  // Build context label
  const strainLabel = strainSpecific ? query.context.strain : query.context.species;
  const sexLabel = query.sex === "M" ? "male" : "female";
  const durationLabel = query.context.dosingDurationWeeks != null
    ? `${Math.round(query.context.dosingDurationWeeks)}-wk`
    : "";
  const routeLabel = query.context.route.toLowerCase().replace("oral gavage", "oral gavage");
  const mockSuffix = match.isMock ? " (mock HCD)" : "";
  const contextLabel = [strainLabel, routeLabel, durationLabel, sexLabel]
    .filter(Boolean).join(", ") + mockSuffix;

  return {
    meanIncidence: meanInc,
    range: [rangeLow, rangeHigh],
    nStudies: match.nStudies,
    classification: "NO_DATA", // will be classified by caller
    contextLabel,
    isMock: match.isMock,
    strainSpecific,
    notes: match.notes,
    entry: match,
  };
}

/**
 * Classify a study's control group incidence against HCD result.
 */
export function classifyControlVsHCD(
  controlIncidence: number,
  result: HistoricalControlResult,
): "ABOVE" | "WITHIN" | "BELOW" {
  if (controlIncidence > result.range[1]) return "ABOVE";
  if (controlIncidence < result.range[0]) return "BELOW";
  return "WITHIN";
}

// ─── Backward-compatible API ──────────────────────────────
// Existing call sites use getHistoricalControl(finding, organ) and classifyVsHCD.

export type HCDStatus = "above_range" | "at_upper" | "within_range" | "below_range" | "no_data";

/**
 * Legacy lookup: case-insensitive substring match on finding + organ.
 * Falls back to "general" entries if no organ-specific match.
 */
export function getHistoricalControl(
  finding: string,
  organ: string,
): HistoricalControlData | null {
  const findingLower = finding.toLowerCase();
  const organLower = organ.toLowerCase().replace(/_/g, " ");

  // Search all entries, prefer organ-specific over GENERAL
  let match: HCDEntry | null = null;

  for (const e of HCD_DATABASE) {
    if (!findingLower.includes(e.finding.toLowerCase())) continue;
    const entryOrgan = e.specimen.toLowerCase().replace(/_/g, " ");
    if (entryOrgan !== "general" && organLower.includes(entryOrgan)) {
      match = e;
      break;
    }
  }

  if (!match) {
    match = HCD_DATABASE.find(
      (e) => e.specimen === "GENERAL" && findingLower.includes(e.finding.toLowerCase()),
    ) ?? null;
  }

  if (!match) return null;

  // Convert to legacy format
  const mean = match.meanIncidencePct / 100;
  const min = match.rangeLowPct / 100;
  const max = match.rangeHighPct / 100;
  const sd = (max - min) / 4; // approximate SD from range

  return {
    finding: match.finding,
    organ: match.specimen.toLowerCase(),
    strain: "SD",
    species: "Sprague-Dawley rat",
    sex: match.sex === "BOTH" ? "combined" : match.sex,
    mean_incidence: mean,
    min_incidence: min,
    max_incidence: max,
    p5_incidence: Math.max(0, min + (max - min) * 0.05),
    p95_incidence: min + (max - min) * 0.95,
    sd_incidence: sd,
    n_studies: match.nStudies,
    n_animals: match.nStudies * 20,
    severity_mean: 1.5,
    severity_max: 3,
    source: match.isMock ? "mock" : "published",
    last_updated: "2026-02-16",
  };
}

export function classifyVsHCD(
  controlIncidence: number,
  hcd: HistoricalControlData,
): HCDStatus {
  if (controlIncidence > hcd.p95_incidence) return "above_range";
  if (controlIncidence > hcd.mean_incidence + hcd.sd_incidence) return "at_upper";
  if (controlIncidence < hcd.mean_incidence - hcd.sd_incidence) return "below_range";
  return "within_range";
}

export const HCD_STATUS_LABELS: Record<HCDStatus, string> = {
  above_range: "Above range",
  at_upper: "At upper",
  within_range: "Within range",
  below_range: "Below range",
  no_data: "No data",
};

export const HCD_STATUS_SORT: Record<HCDStatus, number> = {
  above_range: 0,
  at_upper: 1,
  within_range: 2,
  below_range: 3,
  no_data: 4,
};
