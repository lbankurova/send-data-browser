import type { NoaelSummaryRow, AdverseEffectSummaryRow } from "@/types/analysis-views";
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
  noael_basis: "adverse_findings" | "control_noael" | "not_established";
}

/**
 * Generate a rationale narrative for a NOAEL determination.
 *
 * @param noaelRow - The NOAEL summary row for the target sex
 * @param aeData - All adverse effect summary rows (will be filtered to LOAEL dose)
 * @param sex - Which sex to generate for ("Combined", "M", or "F")
 */
export function generateNoaelNarrative(
  noaelRow: NoaelSummaryRow,
  aeData: AdverseEffectSummaryRow[],
  sex: "Combined" | "M" | "F",
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

  // Determine basis
  let basis: NoaelNarrative["noael_basis"];
  if (noaelRow.noael_dose_level === 0) {
    basis = "control_noael";
  } else if (noaelRow.noael_dose_value == null) {
    basis = "not_established";
  } else {
    basis = "adverse_findings";
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
    case "control_noael":
      summary =
        `The NOAEL could not be established above the control dose. ` +
        `Adverse, treatment-related findings (${formatFindings(findingNames, totalFindingCount)}) ` +
        `were observed at the lowest dose tested (${loaelLabel}).`;
      break;
    case "not_established":
      summary =
        `A NOAEL was not established. Adverse, treatment-related findings ` +
        `were observed at all dose levels tested.`;
      break;
  }

  return {
    summary,
    loael_findings: findingNames,
    loael_details: details,
    noael_basis: basis,
  };
}
