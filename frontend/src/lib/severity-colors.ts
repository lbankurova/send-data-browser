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

export function getDirectionColor(direction: string | null): string {
  switch (direction) {
    case "up":
      return "text-red-500";
    case "down":
      return "text-blue-500";
    default:
      return "text-muted-foreground";
  }
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

// ── Organ System Colors ───────────────────────────────────────────────────

/** Deterministic hue for organ system names (pastel-ish, well-spaced). */
const ORGAN_COLORS: Record<string, string> = {};
export function getOrganColor(organ: string): string {
  if (ORGAN_COLORS[organ]) return ORGAN_COLORS[organ];
  // Golden-angle hue spacing seeded by organ string hash
  let h = 0;
  for (let i = 0; i < organ.length; i++) h = (h * 31 + organ.charCodeAt(i)) | 0;
  const hue = ((h % 360) + 360) % 360;
  const color = `hsl(${hue}, 55%, 50%)`;
  ORGAN_COLORS[organ] = color;
  return color;
}
