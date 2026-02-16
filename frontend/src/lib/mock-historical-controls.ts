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
  mean_incidence: number;
  min_incidence: number;
  max_incidence: number;
  p95_incidence: number;
  sd_incidence: number;
  n_studies: number;
  source: "mock";
}

// ─── Mock data ────────────────────────────────────────────

const MOCK_HCD: HistoricalControlData[] = [
  // Liver
  { finding: "hepatocellular hypertrophy", organ: "liver", strain: "SD", mean_incidence: 0.08, min_incidence: 0.02, max_incidence: 0.18, p95_incidence: 0.16, sd_incidence: 0.04, n_studies: 24, source: "mock" },
  { finding: "hepatocellular vacuolation", organ: "liver", strain: "SD", mean_incidence: 0.12, min_incidence: 0.04, max_incidence: 0.28, p95_incidence: 0.24, sd_incidence: 0.06, n_studies: 22, source: "mock" },
  { finding: "hepatocellular necrosis", organ: "liver", strain: "SD", mean_incidence: 0.02, min_incidence: 0.00, max_incidence: 0.06, p95_incidence: 0.05, sd_incidence: 0.02, n_studies: 24, source: "mock" },
  { finding: "bile duct hyperplasia", organ: "liver", strain: "SD", mean_incidence: 0.04, min_incidence: 0.00, max_incidence: 0.10, p95_incidence: 0.08, sd_incidence: 0.03, n_studies: 20, source: "mock" },
  { finding: "hepatocellular adenoma", organ: "liver", strain: "SD", mean_incidence: 0.01, min_incidence: 0.00, max_incidence: 0.04, p95_incidence: 0.03, sd_incidence: 0.01, n_studies: 18, source: "mock" },

  // Kidney
  { finding: "tubular degeneration", organ: "kidney", strain: "SD", mean_incidence: 0.06, min_incidence: 0.00, max_incidence: 0.16, p95_incidence: 0.14, sd_incidence: 0.04, n_studies: 22, source: "mock" },
  { finding: "tubular basophilia", organ: "kidney", strain: "SD", mean_incidence: 0.15, min_incidence: 0.06, max_incidence: 0.30, p95_incidence: 0.26, sd_incidence: 0.06, n_studies: 22, source: "mock" },
  { finding: "chronic progressive nephropathy", organ: "kidney", strain: "SD", mean_incidence: 0.35, min_incidence: 0.15, max_incidence: 0.60, p95_incidence: 0.55, sd_incidence: 0.12, n_studies: 24, source: "mock" },
  { finding: "mineralization", organ: "kidney", strain: "SD", mean_incidence: 0.10, min_incidence: 0.02, max_incidence: 0.22, p95_incidence: 0.20, sd_incidence: 0.05, n_studies: 20, source: "mock" },

  // Lung
  { finding: "alveolar macrophage infiltrate", organ: "lung", strain: "SD", mean_incidence: 0.18, min_incidence: 0.06, max_incidence: 0.35, p95_incidence: 0.32, sd_incidence: 0.08, n_studies: 20, source: "mock" },
  { finding: "perivascular inflammation", organ: "lung", strain: "SD", mean_incidence: 0.10, min_incidence: 0.02, max_incidence: 0.22, p95_incidence: 0.20, sd_incidence: 0.05, n_studies: 18, source: "mock" },

  // Heart
  { finding: "cardiomyopathy", organ: "heart", strain: "SD", mean_incidence: 0.20, min_incidence: 0.08, max_incidence: 0.40, p95_incidence: 0.36, sd_incidence: 0.08, n_studies: 22, source: "mock" },
  { finding: "myocardial degeneration", organ: "heart", strain: "SD", mean_incidence: 0.05, min_incidence: 0.00, max_incidence: 0.12, p95_incidence: 0.10, sd_incidence: 0.03, n_studies: 18, source: "mock" },

  // Adrenal
  { finding: "cortical hypertrophy", organ: "adrenal", strain: "SD", mean_incidence: 0.14, min_incidence: 0.04, max_incidence: 0.28, p95_incidence: 0.25, sd_incidence: 0.06, n_studies: 20, source: "mock" },
  { finding: "cortical vacuolation", organ: "adrenal", strain: "SD", mean_incidence: 0.08, min_incidence: 0.02, max_incidence: 0.18, p95_incidence: 0.16, sd_incidence: 0.04, n_studies: 18, source: "mock" },

  // Thyroid
  { finding: "follicular cell hypertrophy", organ: "thyroid", strain: "SD", mean_incidence: 0.06, min_incidence: 0.00, max_incidence: 0.16, p95_incidence: 0.14, sd_incidence: 0.04, n_studies: 20, source: "mock" },
  { finding: "follicular cell hyperplasia", organ: "thyroid", strain: "SD", mean_incidence: 0.04, min_incidence: 0.00, max_incidence: 0.12, p95_incidence: 0.10, sd_incidence: 0.03, n_studies: 18, source: "mock" },

  // Testis
  { finding: "tubular atrophy", organ: "testis", strain: "SD", mean_incidence: 0.03, min_incidence: 0.00, max_incidence: 0.08, p95_incidence: 0.07, sd_incidence: 0.02, n_studies: 16, source: "mock" },
  { finding: "spermatogenic degeneration", organ: "testis", strain: "SD", mean_incidence: 0.05, min_incidence: 0.00, max_incidence: 0.14, p95_incidence: 0.12, sd_incidence: 0.04, n_studies: 16, source: "mock" },

  // Ovary
  { finding: "cyst", organ: "ovary", strain: "SD", mean_incidence: 0.10, min_incidence: 0.02, max_incidence: 0.22, p95_incidence: 0.20, sd_incidence: 0.05, n_studies: 14, source: "mock" },

  // Spleen
  { finding: "extramedullary hematopoiesis", organ: "spleen", strain: "SD", mean_incidence: 0.25, min_incidence: 0.10, max_incidence: 0.45, p95_incidence: 0.42, sd_incidence: 0.10, n_studies: 22, source: "mock" },
  { finding: "lymphoid hyperplasia", organ: "spleen", strain: "SD", mean_incidence: 0.08, min_incidence: 0.02, max_incidence: 0.18, p95_incidence: 0.16, sd_incidence: 0.04, n_studies: 20, source: "mock" },
  { finding: "lymphoid atrophy", organ: "spleen", strain: "SD", mean_incidence: 0.04, min_incidence: 0.00, max_incidence: 0.10, p95_incidence: 0.08, sd_incidence: 0.03, n_studies: 18, source: "mock" },

  // Stomach
  { finding: "squamous cell hyperplasia", organ: "stomach", strain: "SD", mean_incidence: 0.06, min_incidence: 0.00, max_incidence: 0.16, p95_incidence: 0.14, sd_incidence: 0.04, n_studies: 16, source: "mock" },
  { finding: "erosion", organ: "stomach", strain: "SD", mean_incidence: 0.03, min_incidence: 0.00, max_incidence: 0.08, p95_incidence: 0.07, sd_incidence: 0.02, n_studies: 16, source: "mock" },
  { finding: "inflammation", organ: "stomach", strain: "SD", mean_incidence: 0.08, min_incidence: 0.02, max_incidence: 0.18, p95_incidence: 0.16, sd_incidence: 0.04, n_studies: 16, source: "mock" },

  // General / multi-organ
  { finding: "pigmentation", organ: "general", strain: "SD", mean_incidence: 0.12, min_incidence: 0.04, max_incidence: 0.25, p95_incidence: 0.22, sd_incidence: 0.05, n_studies: 20, source: "mock" },
  { finding: "inflammation", organ: "general", strain: "SD", mean_incidence: 0.15, min_incidence: 0.06, max_incidence: 0.30, p95_incidence: 0.28, sd_incidence: 0.07, n_studies: 24, source: "mock" },
  { finding: "fibrosis", organ: "general", strain: "SD", mean_incidence: 0.04, min_incidence: 0.00, max_incidence: 0.10, p95_incidence: 0.08, sd_incidence: 0.03, n_studies: 20, source: "mock" },
  { finding: "necrosis", organ: "general", strain: "SD", mean_incidence: 0.03, min_incidence: 0.00, max_incidence: 0.08, p95_incidence: 0.07, sd_incidence: 0.02, n_studies: 20, source: "mock" },
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
  if (generalMatch) return generalMatch;

  // Try organ-specific with reversed substring (HCD finding ⊂ actual finding)
  const reverseOrganMatch = MOCK_HCD.find(
    (h) =>
      h.organ !== "general" &&
      findingLower.includes(h.finding) &&
      organLower.includes(h.organ),
  );
  return reverseOrganMatch ?? null;
}

// ─── Status classification ────────────────────────────────

export type HCDStatus = "above_range" | "at_upper" | "within_range" | "below_range" | "no_data";

export function classifyVsHCD(
  controlIncidence: number,
  hcd: HistoricalControlData,
): HCDStatus {
  if (controlIncidence > hcd.p95_incidence) return "above_range";
  if (controlIncidence > hcd.mean_incidence + hcd.sd_incidence) return "at_upper";
  if (controlIncidence < hcd.min_incidence) return "below_range";
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
