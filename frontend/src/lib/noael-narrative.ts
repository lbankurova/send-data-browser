import type { NoaelSummaryRow, AdverseEffectSummaryRow } from "@/types/analysis-views";
import type { StudyMortality } from "@/types/mortality";
import type { NoaelTier } from "@/lib/derive-summaries";
import { formatDoseShortLabel } from "@/lib/severity-colors";

/** Structured NOAEL narrative for display in banner and context panel. */
export interface NoaelNarrative {
  summary: string;
  loael_findings: string[];
  loael_details: {
    finding: string;
    domain: string;
    severity: string;
    treatment_related: boolean;
    dose_dependent: boolean;
    effect_size: number | null;
    p_value: number | null;
  }[];
  noael_basis: "adverse_findings" | "below_tested_range" | "not_established";
  mortality_context: string | null;
}

/**
 * Canonical NOAEL display string. Distinguishes the three terminal states:
 * - established → "<value> <unit>"
 * - below_tested_range → "Not established (< <lowest tested dose>)"
 *   (LOAEL = lowest active dose; NOAEL would be vehicle, which is not a
 *   testable dose. Ref: EPA IRIS, OECD TG 407/408, Kale 2022.)
 * - not_established → "Not established"
 */
export function formatNoaelDisplay(row: NoaelSummaryRow): string {
  if (row.noael_dose_value != null) {
    return `${row.noael_dose_value} ${row.noael_dose_unit ?? ""}`.trim();
  }
  if (row.noael_derivation?.method === "below_tested_range") {
    const lowest = row.loael_label
      ? formatDoseShortLabel(row.loael_label)
      : "lowest tested dose";
    return `Not established (< ${lowest})`;
  }
  return "Not established";
}

/**
 * Per-endpoint NOAEL label for context-panel headers and sex-comparison
 * tables (FindingsContextPanel). The endpoint-level NOAEL has only tier +
 * dose value (no derivation method), so the rendering is simpler than
 * the study-level ``formatNoaelDisplay``:
 *   - ``below-lowest`` → "below range" (short) / "below tested range" (long)
 *   - tiered with a dose value → ``"<value> <unit>"``
 *   - missing tier or no dose → em dash (short) / "Not established" (long)
 */
export function formatEndpointNoaelLabel(
  tier: NoaelTier | undefined,
  doseValue: number | null | undefined,
  doseUnit: string | null | undefined,
  mode: "short" | "long",
): string {
  if (tier === "below-lowest") {
    return mode === "short" ? "below range" : "below tested range";
  }
  if (tier === undefined || tier === "none") {
    return mode === "short" ? "\u2014" : "Not established";
  }
  if (doseValue != null) {
    return `${doseValue} ${doseUnit ?? "mg/kg"}`;
  }
  return mode === "short" ? "\u2014" : "Not established";
}

/**
 * Generate a rationale narrative for a NOAEL determination.
 *
 * @param noaelRow - The NOAEL summary row for the target sex
 * @param aeData - All adverse effect summary rows (will be filtered to LOAEL dose)
 * @param sex - Which sex to generate for ("Combined", "M", or "F")
 * @param mortality - Optional study mortality summary for mortality context sentence
 */
// @field FIELD-44 — NOAEL narrative structure
export function generateNoaelNarrative(
  noaelRow: NoaelSummaryRow,
  aeData: AdverseEffectSummaryRow[],
  sex: "Combined" | "M" | "F",
  mortality?: StudyMortality,
): NoaelNarrative {
  const loaelDoseLevel = noaelRow.loael_dose_level;

  // Filter AE data to LOAEL dose, adverse, treatment-related
  const sexFilter = sex === "Combined" ? null : sex;
  const loaelFindings = aeData
    .filter(
      (r) =>
        r.dose_level === loaelDoseLevel &&
        r.severity === "adverse" &&
        r.treatment_related &&
        (sexFilter == null || r.sex === sexFilter),
    )
    .sort((a, b) => Math.abs(b.effect_size ?? 0) - Math.abs(a.effect_size ?? 0));

  // Top 3 findings for display
  const topFindings = loaelFindings.slice(0, 3);
  const findingNames = topFindings.map((f) => f.endpoint_label);

  const details = topFindings.map((f) => ({
    finding: f.endpoint_label,
    domain: f.domain,
    severity: f.severity,
    treatment_related: f.treatment_related,
    dose_dependent:
      f.dose_response_pattern !== "flat" &&
      f.dose_response_pattern !== "no_pattern" &&
      f.dose_response_pattern !== "",
    effect_size: f.effect_size,
    p_value: f.p_value,
  }));

  const noaelDose = noaelRow.noael_dose_value;
  const noaelUnit = noaelRow.noael_dose_unit ?? "mg/kg/day";
  const loaelLabel = noaelRow.loael_label ? formatDoseShortLabel(noaelRow.loael_label) : `${loaelDoseLevel}`;

  // Determine basis. The backend distinguishes "below_tested_range" (LOAEL =
  // lowest active dose, vehicle not a testable dose) from a hard
  // "not_established" via noael_derivation.method.
  let basis: NoaelNarrative["noael_basis"];
  if (noaelRow.noael_dose_value != null) {
    basis = "adverse_findings";
  } else if (noaelRow.noael_derivation?.method === "below_tested_range") {
    basis = "below_tested_range";
  } else {
    basis = "not_established";
  }

  // Total count before capping
  const totalFindingCount = loaelFindings.length;

  // Build finding list string (e.g. "hepatocellular necrosis, ALT, and AST")
  const formatFindings = (names: string[], total: number) => {
    if (names.length === 0) return "adverse findings";
    if (names.length === 1 && total <= 1) return names[0];
    if (names.length === 1 && total > 1) return `${names[0]} (and ${total - 1} others)`;
    if (names.length === 2 && total <= 2) return `${names[0]} and ${names[1]}`;
    const listed = `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
    if (total > names.length) return `${listed} (and ${total - names.length} others)`;
    return listed;
  };

  // Check dose-dependence
  const anyDoseDependent = details.some((d) => d.dose_dependent);
  const doseDepPhrase = anyDoseDependent
    ? "dose-dependent"
    : "present at the highest dose tested";

  let summary: string;

  switch (basis) {
    case "adverse_findings":
      summary =
        `The NOAEL is ${noaelDose} ${noaelUnit} based on ${formatFindings(findingNames, totalFindingCount)} ` +
        `observed at ${loaelLabel} (LOAEL). ` +
        `These findings were adverse, treatment-related, and ${doseDepPhrase}. ` +
        `No adverse findings were observed at ${noaelDose} ${noaelUnit}.`;
      break;
    case "below_tested_range":
      summary =
        `The NOAEL is below the lowest tested dose (${loaelLabel}). ` +
        `Adverse, treatment-related findings (${formatFindings(findingNames, totalFindingCount)}) ` +
        `were observed at the lowest active dose; vehicle is not a testable dose of the test article.`;
      break;
    case "not_established":
      summary =
        `A NOAEL was not established. Adverse, treatment-related findings ` +
        `were observed at all dose levels tested.`;
      break;
  }

  // Build mortality context sentence
  let mortality_context: string | null = null;
  if (mortality?.has_mortality) {
    const mainDeaths = mortality.deaths.filter((d) => !d.is_recovery);
    const causes = [...new Set(mainDeaths.map((d) => d.cause).filter(Boolean))];
    const causePhrase = causes.length > 0 ? ` (${causes.join(", ")})` : "";
    const accPhrase =
      mortality.total_accidental > 0
        ? ` ${mortality.total_accidental} accidental death${mortality.total_accidental > 1 ? "s" : ""} excluded from analysis.`
        : "";
    mortality_context =
      `${mortality.total_deaths} treatment-related death${mortality.total_deaths !== 1 ? "s" : ""}${causePhrase}` +
      ` observed${mortality.mortality_loael_label ? ` at ${formatDoseShortLabel(mortality.mortality_loael_label)}` : ""}.` +
      accPhrase;
  }

  return {
    summary,
    loael_findings: findingNames,
    loael_details: details,
    noael_basis: basis,
    mortality_context,
  };
}
