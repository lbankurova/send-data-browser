/**
 * Parses StudyMetadata (raw API response) into StudyContext (engine-ready).
 * Handles ISO 8601 duration parsing for DOSDUR/RECSAC/TRMSAC.
 */

import type { StudyMetadata } from "@/types";
import type { StudyContext, ECGInterpretation } from "@/types/study-context";

// ---------------------------------------------------------------------------
// ISO 8601 duration parser (subset: P{n}W, P{n}D, P{n}M)
// ---------------------------------------------------------------------------

/**
 * Parse a SEND-style ISO 8601 duration string into days.
 * Examples: "P13W" → 91, "P14D" → 14, "P6M" → 182
 * Returns null if the string doesn't match or is null.
 */
export function parseIsoDurationDays(duration: string | null): number | null {
  if (!duration) return null;
  const m = duration.trim().match(/^P(\d+)(W|D|M)$/i);
  if (!m) return null;
  const value = parseInt(m[1], 10);
  switch (m[2].toUpperCase()) {
    case "W":
      return value * 7;
    case "D":
      return value;
    case "M":
      return Math.round(value * 30.44); // average month
    default:
      return null;
  }
}

function daysToWeeks(days: number | null): number | null {
  return days != null ? days / 7 : null;
}

/**
 * Parse age text like "6-7" or "8" into a midpoint number.
 */
function parseAgeMidpoint(ageText: string | null): number | null {
  if (!ageText) return null;
  const range = ageText.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (range) return (parseInt(range[1], 10) + parseInt(range[2], 10)) / 2;
  const single = ageText.match(/^(\d+)$/);
  if (single) return parseInt(single[1], 10);
  return null;
}

/**
 * Convert age to weeks based on unit string.
 */
function ageToWeeks(value: number | null, unit: string | null): number | null {
  if (value == null) return null;
  const u = (unit ?? "").toUpperCase();
  if (u === "WEEKS" || u === "WEEK" || u === "WK") return value;
  if (u === "DAYS" || u === "DAY" || u === "D") return value / 7;
  if (u === "MONTHS" || u === "MONTH" || u === "MO") return value * 4.35;
  return value; // assume weeks if unit unclear
}

function parseSexPopulation(
  sexpop: string | null
): "M" | "F" | "BOTH" {
  const s = (sexpop ?? "").toUpperCase();
  if (s === "M" || s === "MALE" || s === "MALE ONLY") return "M";
  if (s === "F" || s === "FEMALE" || s === "FEMALE ONLY") return "F";
  return "BOTH";
}

function parseIntOrNull(s: string | null): number | null {
  if (!s) return null;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// ECG interpretation — species-aware QTc translational relevance
// ---------------------------------------------------------------------------

function deriveECGInterpretation(species: string): ECGInterpretation {
  const s = species.toUpperCase();
  if (s.includes("RAT") || s.includes("MOUSE")) {
    return {
      qtcTranslational: false,
      preferredCorrection: null,
      rationale:
        "Rodent ventricular repolarization is Ito-dominated; QTc prolongation has limited translational value to humans.",
    };
  }
  if (s.includes("DOG") || s.includes("CANINE") || s.includes("BEAGLE")) {
    return {
      qtcTranslational: true,
      preferredCorrection: "VanDeWater",
      rationale:
        "Dog QTc is the gold-standard non-clinical model for human QT risk. Van de Water correction preferred.",
    };
  }
  if (
    s.includes("MONKEY") ||
    s.includes("PRIMATE") ||
    s.includes("MACAQUE") ||
    s.includes("CYNOMOLGUS") ||
    s.includes("MARMOSET")
  ) {
    return {
      qtcTranslational: true,
      preferredCorrection: "Fridericia",
      rationale:
        "NHP QTc is translationally relevant. Fridericia correction preferred for non-human primates.",
    };
  }
  return {
    qtcTranslational: false,
    preferredCorrection: null,
    rationale: "QTc interpretation not configured for this species.",
  };
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

export function parseStudyContext(meta: StudyMetadata): StudyContext {
  const dosingDays = parseIsoDurationDays(meta.dosing_duration);
  const dosingDurationWeeks = daysToWeeks(dosingDays);
  const recoveryPeriodDays = parseIsoDurationDays(meta.recovery_sacrifice);
  const terminalSacrificeWeeks = daysToWeeks(
    parseIsoDurationDays(meta.terminal_sacrifice)
  );

  const ageMidpoint = parseAgeMidpoint(meta.age_text);
  const ageAtStartWeeks = ageToWeeks(ageMidpoint, meta.age_unit);

  const estimatedNecropsyAgeWeeks =
    ageAtStartWeeks != null && dosingDurationWeeks != null
      ? ageAtStartWeeks + dosingDurationWeeks
      : null;

  return {
    studyId: meta.study_id,
    strain: meta.strain ?? "",
    species: meta.species ?? "",
    route: meta.route ?? "",
    studyType: meta.study_type ?? "",
    dosingDurationWeeks,
    recoveryPeriodDays,
    terminalSacrificeWeeks,
    sexPopulation: parseSexPopulation(meta.sex_population),
    ageAtStartWeeks,
    estimatedNecropsyAgeWeeks,
    supplier: meta.supplier ?? "",
    vehicle: meta.vehicle ?? "",
    treatment: meta.treatment ?? "",
    studyDesign: meta.design ?? "",
    plannedSubjectsM: parseIntOrNull(meta.males),
    plannedSubjectsF: parseIntOrNull(meta.females),
    diet: meta.diet ?? "",
    glpCompliant: meta.glp != null && meta.glp !== "",
    sendCtVersion: meta.ct_version ?? "",
    title: meta.title ?? "",
    ecgInterpretation: deriveECGInterpretation(meta.species ?? ""),
  };
}
