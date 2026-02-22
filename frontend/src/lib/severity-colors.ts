/** Pure functions for color-coding severity, p-values, and effect sizes.
 *  Returns Tailwind-compatible class names or CSS color values.
 */

// ── Pipeline Stage Colors ──────────────────────────────────────────────────

/**
 * Get pipeline stage color (font color only, no background).
 */
export function getPipelineStageColor(stage: string): string {
  switch (stage) {
    case "submitted":
      return "#4A9B68"; // green
    case "pre_submission":
      return "#7CA8E8"; // blue
    case "ongoing":
      return "#E8D47C"; // amber
    case "planned":
      return "#C49BE8"; // purple
    default:
      return "#6B7280"; // gray
  }
}

// ── Severity Colors ────────────────────────────────────────────────────────

export function getSeverityColor(_severity: string): {
  bg: string;
  text: string;
  border: string;
} {
  // All adversity classifications are categorical identity → neutral gray (C-05)
  return {
    bg: "bg-gray-100",
    text: "text-gray-600",
    border: "border-gray-200",
  };
}

export function getSeverityBadgeClasses(severity: string): string {
  const c = getSeverityColor(severity);
  return `${c.bg} ${c.text} ${c.border} border`;
}

/** Returns just the CSS color for a severity dot. */
export function getSeverityDotColor(severity: string): string {
  switch (severity) {
    case "adverse":
      return "#dc2626"; // red-600
    case "warning":
      return "#d97706"; // amber-600
    case "normal":
    default:
      return "#16a34a"; // green-600
  }
}

/** Font-weight class for dose consistency level (used by OrganRailMode's organ evidence path). */
export function getDoseConsistencyWeight(level: "Strong" | "Moderate" | "Weak" | "NonMonotonic" | string): string {
  switch (level) {
    case "Strong": return "font-semibold";
    case "Moderate": return "font-medium";
    case "NonMonotonic": return "font-medium";
    default: return "font-normal";
  }
}

export function getPValueColor(p: number | null | undefined): string {
  if (p == null) return "text-muted-foreground";
  if (p < 0.001) return "text-red-600 font-semibold";
  if (p < 0.01) return "text-red-500 font-medium";
  if (p < 0.05) return "text-amber-600 font-medium";
  if (p < 0.1) return "text-amber-500";
  return "text-muted-foreground";
}

export function getEffectSizeColor(d: number | null | undefined): string {
  if (d == null) return "text-muted-foreground";
  const abs = Math.abs(d);
  if (abs >= 1.2) return "text-red-600 font-semibold";
  if (abs >= 0.8) return "text-red-500 font-medium";
  if (abs >= 0.5) return "text-amber-600";
  if (abs >= 0.2) return "text-amber-500";
  return "text-muted-foreground";
}

export function formatPValue(p: number | null | undefined): string {
  if (p == null) return "—";
  if (p < 0.0001) return "<0.0001";
  if (p < 0.01) return p.toFixed(4);   // keeps 0.0099 as "0.0099", not "0.010"
  if (p < 0.10) return p.toFixed(3);
  return p.toFixed(2);
}

export function formatEffectSize(d: number | null | undefined): string {
  if (d == null) return "—";
  return d.toFixed(2);
}

export function getDirectionSymbol(direction: string | null): string {
  switch (direction) {
    case "up":
      return "↑";
    case "down":
      return "↓";
    default:
      return "—";
  }
}

export function getDirectionColor(_direction: string | null): string {
  // Direction arrows are always neutral — the symbol (↑/↓) communicates direction.
  return "text-muted-foreground";
}

/** Severity heat color scale: pale yellow → deep red per spec §12.3 */
export function getSeverityHeatColor(avgSev: number): string {
  if (avgSev >= 4) return "#E57373"; // severe
  if (avgSev >= 3) return "#FF8A65"; // marked
  if (avgSev >= 2) return "#FFB74D"; // moderate
  if (avgSev >= 1) return "#FFE0B2"; // mild
  return "#FFF9C4"; // minimal
}

/** Signal score to CSS background color (hex) — spec §12.3 thresholds. */
export function getSignalScoreColor(score: number): string {
  if (score >= 0.8) return "#D32F2F";
  if (score >= 0.6) return "#F57C00";
  if (score >= 0.4) return "#FBC02D";
  if (score >= 0.2) return "#81C784";
  return "#388E3C";
}

/** Signal score to CSS background color with opacity for heatmap cells — spec §12.3 thresholds. */
export function getSignalScoreHeatmapColor(score: number): string {
  if (score >= 0.8) return "rgba(211,47,47,0.85)";
  if (score >= 0.6) return "rgba(245,124,0,0.7)";
  if (score >= 0.4) return "rgba(251,192,45,0.55)";
  if (score >= 0.2) return "rgba(129,199,132,0.35)";
  if (score > 0) return "rgba(56,142,60,0.2)";
  return "rgba(0,0,0,0.03)";
}

/** Neutral grayscale heat for heatmap matrices — same palette as histopath severity matrix.
 *  Maps signal score (0–1) to a 5-step neutral ramp. Always-on at rest. */
export function getNeutralHeatColor(score: number): { bg: string; text: string } {
  if (score >= 0.8) return { bg: "#4B5563", text: "white" };
  if (score >= 0.6) return { bg: "#6B7280", text: "white" };
  if (score >= 0.4) return { bg: "#9CA3AF", text: "var(--foreground)" };
  if (score >= 0.2) return { bg: "#D1D5DB", text: "var(--foreground)" };
  if (score > 0) return { bg: "#E5E7EB", text: "var(--foreground)" };
  return { bg: "rgba(0,0,0,0.02)", text: "var(--muted-foreground)" };
}

/** Dose group color by level index. */
export function getDoseGroupColor(level: number): string {
  const colors = ["#6b7280", "#3b82f6", "#f59e0b", "#ef4444"];
  return colors[level] ?? "#6b7280";
}

/** Sex color. */
export function getSexColor(sex: string): string {
  if (sex === "M") return "#3b82f6"; // blue-500
  if (sex === "F") return "#ec4899"; // pink-500
  return "#6b7280"; // gray-500
}

// ─── MS Office Median Palette (reports, exports, non-app contexts) ────────
// Warm, muted, earthy — suitable for printed reports and standalone charts.
// NOT used in app scatter plots (clashes with the Tableau-derived app chart colors).

export const MEDIAN_PALETTE = [
  "#775F55", "#94B6D2", "#DD8047", "#A5AB81", "#D8B25C",
  "#7BA79D", "#968C8C", "#F7B615", "#704404", "#EBDDC3",
  "#A2554A", "#8E6C8A", "#545E8B", "#6B8C5E", "#C4786B", "#486B5F",
] as const;

// ─── Categorical Chart Palette (Tableau 10 — matches app chart colors) ───
// For scatter "color by" overlays (organ system, domain, syndrome).
// Same family as --chart-1…5 and Datagrok default chart palette (§0.10).

const CATEGORICAL_CHART_PALETTE = [
  "#1F77B4",  //  0 blue
  "#FF7F0E",  //  1 orange
  "#2CA02C",  //  2 green
  "#D62728",  //  3 red
  "#9467BD",  //  4 purple
  "#8C564B",  //  5 brown
  "#E377C2",  //  6 pink
  "#7F7F7F",  //  7 gray
  "#BCBD22",  //  8 yellow-green
  "#17BECF",  //  9 cyan
  // Tableau 10 light pairs (for overflow beyond 10 categories)
  "#AEC7E8",  // 10 light blue
  "#FFBB78",  // 11 light orange
  "#98DF8A",  // 12 light green
] as const;

/** Get a categorical chart color by index (wraps). For scatter "color by" overlays. */
export function getCategoricalChartColor(index: number): string {
  return CATEGORICAL_CHART_PALETTE[index % CATEGORICAL_CHART_PALETTE.length];
}

/** Get a categorical chart color for a named category.
 *  Produces a stable assignment: same category string → same color. */
export function getCategoricalChartColorMap(categories: readonly string[]): Map<string, string> {
  const map = new Map<string, string>();
  const unique = [...new Set(categories)];
  unique.forEach((cat, i) => map.set(cat, getCategoricalChartColor(i)));
  return map;
}

/** Significance stars from p-value. */
export function getSignificanceStars(p: number | null): string {
  if (p == null) return "";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "ns";
}

/** Domain code to text color — colored text only per design decision C-04. */
export function getDomainBadgeColor(domain: string): { text: string } {
  switch (domain.toUpperCase()) {
    case "LB": return { text: "text-blue-700" };
    case "BW": return { text: "text-emerald-700" };
    case "OM": return { text: "text-purple-700" };
    case "MI": return { text: "text-rose-700" };
    case "MA": return { text: "text-orange-700" };
    case "CL": return { text: "text-cyan-700" };
    case "TF": return { text: "text-purple-700" };
    case "PM": return { text: "text-gray-500" };
    default:   return { text: "text-muted-foreground" };
  }
}

/** Parse raw dose labels into short display labels.
 *  "Group 2,2 mg/kg PCDRUG" → "2 mg/kg"
 *  "Group 1, Control"        → "Control"
 */
export function formatDoseShortLabel(rawLabel: string): string {
  const parts = rawLabel.split(/,\s*/);
  if (parts.length < 2) return rawLabel;
  const detail = parts.slice(1).join(", ").trim();
  if (/control/i.test(detail)) return "Control";
  // "200 mg/kg PCDRUG" → "200 mg/kg"
  const match = detail.match(/^([\d.]+\s*\S+\/\S+)/);
  return match ? match[1] : detail;
}

/** Convert endpoint labels to title case: "ALBUMIN" → "Albumin", "LIVER_VACUOLIZATION" → "Liver Vacuolization" */
export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Effect Magnitude Labels (Cohen's d thresholds) ───────────────────────

export function getEffectMagnitudeLabel(d: number): string {
  const abs = Math.abs(d);
  if (abs < 0.2) return "trivial";
  if (abs < 0.5) return "small";
  if (abs < 0.8) return "medium";
  if (abs < 1.2) return "large";
  return "very large";
}

// ── Perceptually-Distinct Color Assignment (CIELAB) ──────────────────────

/** sRGB hex → CIELAB [L, a, b]. Standard D65 illuminant. */
function hexToLab(hex: string): [number, number, number] {
  const ri = parseInt(hex.slice(1, 3), 16) / 255;
  const gi = parseInt(hex.slice(3, 5), 16) / 255;
  const bi = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const rl = lin(ri), gl = lin(gi), bl = lin(bi);
  const x = 0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl;
  const y = 0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl;
  const z = 0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [
    116 * f(y) - 16,
    500 * (f(x / 0.95047) - f(y)),
    200 * (f(y) - f(z / 1.08883)),
  ];
}

/** Euclidean ΔE in CIELAB (≈ CIEDE76). Good enough for palette selection. */
function deltaE(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/** Greedy max-min-distance assignment: each key gets the unused palette color
 *  that maximizes its minimum CIELAB distance to all already-assigned colors.
 *  Keys are sorted alphabetically for deterministic results across runs. */
function assignDistinctColors(keys: string[], palette: readonly string[]): Map<string, string> {
  const labs = palette.map(hexToLab);
  const assigned: number[] = [];
  const result = new Map<string, string>();
  const sorted = [...keys].sort();

  for (const key of sorted) {
    if (assigned.length === 0) {
      // First key gets palette[0] (blue — highest contrast on white)
      assigned.push(0);
      result.set(key, palette[0]);
      continue;
    }
    let bestIdx = -1;
    let bestMinDist = -1;
    for (let i = 0; i < labs.length; i++) {
      if (assigned.includes(i)) continue;
      const minDist = Math.min(...assigned.map((j) => deltaE(labs[i], labs[j])));
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      assigned.push(bestIdx);
      result.set(key, palette[bestIdx]);
    }
  }
  return result;
}

// ── Organ System Colors ───────────────────────────────────────────────────

const KNOWN_ORGANS = [
  "hepatic", "renal", "hematologic", "gastrointestinal", "cardiovascular",
  "respiratory", "endocrine", "reproductive", "neurological", "musculoskeletal",
  "integumentary", "ocular", "general",
];

/** Auto-assigned at module load: CIELAB max-min-distance from Tableau palette. */
const ORGAN_COLOR_MAP = assignDistinctColors(KNOWN_ORGANS, CATEGORICAL_CHART_PALETTE);

export function getOrganColor(organ: string): string {
  return ORGAN_COLOR_MAP.get(organ.toLowerCase()) ?? getCategoricalChartColor(ORGAN_COLOR_MAP.size);
}
