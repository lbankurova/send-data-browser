/**
 * Mock historical control data (HCD) — stubbed for prototype.
 * ~30 entries covering common findings in 10 organs.
 * Realistic ranges derived from published background data for Sprague-Dawley rats.
 *
 * In production, this would be replaced by a backend query against a real HCD database
 * (e.g., Charles River, Envigo, or facility-specific background data).
 */

// ─── Types ────────────────────────────────────────────────

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

// ─── Mock data ────────────────────────────────────────────

/** Shared defaults for all mock entries. */
const D = {
  strain: "SD" as const,
  species: "Sprague-Dawley rat" as const,
  sex: "combined" as const,
  source: "mock" as const,
  last_updated: "2025-01-01",
};

/** Helper: derive p5 and severity from incidence data. */
function hcd(
  finding: string,
  organ: string,
  mean_incidence: number,
  min_incidence: number,
  max_incidence: number,
  p95_incidence: number,
  sd_incidence: number,
  n_studies: number,
  severity_mean = 1.5,
  severity_max = 3,
): HistoricalControlData {
  return {
    finding, organ, ...D,
    mean_incidence, min_incidence, max_incidence, p95_incidence, sd_incidence, n_studies,
    p5_incidence: Math.max(0, min_incidence + (max_incidence - min_incidence) * 0.05),
    n_animals: n_studies * 20,
    severity_mean, severity_max,
  };
}

const MOCK_HCD: HistoricalControlData[] = [
  // Liver
  hcd("hepatocellular hypertrophy", "liver", 0.08, 0.02, 0.18, 0.16, 0.04, 24, 1.2, 2),
  hcd("hepatocellular vacuolation", "liver", 0.12, 0.04, 0.28, 0.24, 0.06, 22, 1.3, 2),
  hcd("hepatocellular necrosis", "liver", 0.02, 0.00, 0.06, 0.05, 0.02, 24, 2.0, 4),
  hcd("bile duct hyperplasia", "liver", 0.04, 0.00, 0.10, 0.08, 0.03, 20, 1.5, 3),
  hcd("hepatocellular adenoma", "liver", 0.01, 0.00, 0.04, 0.03, 0.01, 18, 0, 5),

  // Kidney
  hcd("tubular degeneration", "kidney", 0.06, 0.00, 0.16, 0.14, 0.04, 22, 1.8, 3),
  hcd("tubular basophilia", "kidney", 0.15, 0.06, 0.30, 0.26, 0.06, 22, 1.2, 2),
  hcd("chronic progressive nephropathy", "kidney", 0.35, 0.15, 0.60, 0.55, 0.12, 24, 1.5, 4),
  hcd("mineralization", "kidney", 0.10, 0.02, 0.22, 0.20, 0.05, 20, 1.0, 2),

  // Lung
  hcd("alveolar macrophage infiltrate", "lung", 0.18, 0.06, 0.35, 0.32, 0.08, 20, 1.2, 2),
  hcd("perivascular inflammation", "lung", 0.10, 0.02, 0.22, 0.20, 0.05, 18, 1.3, 2),

  // Heart
  hcd("cardiomyopathy", "heart", 0.20, 0.08, 0.40, 0.36, 0.08, 22, 1.4, 3),
  hcd("myocardial degeneration", "heart", 0.05, 0.00, 0.12, 0.10, 0.03, 18, 2.0, 4),

  // Adrenal
  hcd("cortical hypertrophy", "adrenal", 0.14, 0.04, 0.28, 0.25, 0.06, 20, 1.2, 2),
  hcd("cortical vacuolation", "adrenal", 0.08, 0.02, 0.18, 0.16, 0.04, 18, 1.1, 2),

  // Thyroid
  hcd("follicular cell hypertrophy", "thyroid", 0.06, 0.00, 0.16, 0.14, 0.04, 20, 1.2, 2),
  hcd("follicular cell hyperplasia", "thyroid", 0.04, 0.00, 0.12, 0.10, 0.03, 18, 1.3, 2),

  // Testis
  hcd("tubular atrophy", "testis", 0.03, 0.00, 0.08, 0.07, 0.02, 16, 2.0, 4),
  hcd("spermatogenic degeneration", "testis", 0.05, 0.00, 0.14, 0.12, 0.04, 16, 1.8, 3),

  // Ovary
  hcd("cyst", "ovary", 0.10, 0.02, 0.22, 0.20, 0.05, 14, 0, 0),

  // Spleen
  hcd("extramedullary hematopoiesis", "spleen", 0.25, 0.10, 0.45, 0.42, 0.10, 22, 1.5, 3),
  hcd("lymphoid hyperplasia", "spleen", 0.08, 0.02, 0.18, 0.16, 0.04, 20, 1.2, 2),
  hcd("lymphoid atrophy", "spleen", 0.04, 0.00, 0.10, 0.08, 0.03, 18, 1.5, 3),

  // Stomach
  hcd("squamous cell hyperplasia", "stomach", 0.06, 0.00, 0.16, 0.14, 0.04, 16, 1.3, 2),
  hcd("erosion", "stomach", 0.03, 0.00, 0.08, 0.07, 0.02, 16, 2.0, 3),
  hcd("inflammation", "stomach", 0.08, 0.02, 0.18, 0.16, 0.04, 16, 1.2, 2),

  // General / multi-organ
  hcd("pigmentation", "general", 0.12, 0.04, 0.25, 0.22, 0.05, 20, 1.0, 2),
  hcd("inflammation", "general", 0.15, 0.06, 0.30, 0.28, 0.07, 24, 1.3, 3),
  hcd("fibrosis", "general", 0.04, 0.00, 0.10, 0.08, 0.03, 20, 1.5, 3),
  hcd("necrosis", "general", 0.03, 0.00, 0.08, 0.07, 0.02, 20, 2.0, 4),
];

// ─── Lookup ───────────────────────────────────────────────

/**
 * Look up historical control data for a finding + organ combination.
 * Case-insensitive substring match on finding name and organ.
 * Falls back to finding-only match (organ = "general") if no organ-specific match.
 */
export function getHistoricalControl(
  finding: string,
  organ: string,
): HistoricalControlData | null {
  const findingLower = finding.toLowerCase();
  const organLower = organ.toLowerCase();

  // First try organ-specific match
  const organMatch = MOCK_HCD.find(
    (h) =>
      h.organ !== "general" &&
      findingLower.includes(h.finding) &&
      organLower.includes(h.organ),
  );
  if (organMatch) return organMatch;

  // Fallback: finding-only match against general entries
  const generalMatch = MOCK_HCD.find(
    (h) => h.organ === "general" && findingLower.includes(h.finding),
  );
  return generalMatch ?? null;
}

// ─── Status classification ────────────────────────────────

export type HCDStatus = "above_range" | "at_upper" | "within_range" | "below_range" | "no_data";

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
