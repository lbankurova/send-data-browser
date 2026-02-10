/** Pure functions for color-coding severity, p-values, and effect sizes.
 *  Returns Tailwind-compatible class names or CSS color values.
 */

export function getSeverityColor(severity: string): {
  bg: string;
  text: string;
  border: string;
} {
  switch (severity) {
    case "adverse":
      return {
        bg: "bg-red-50",
        text: "text-red-700",
        border: "border-red-200",
      };
    case "warning":
      return {
        bg: "bg-amber-50",
        text: "text-amber-700",
        border: "border-amber-200",
      };
    case "normal":
    default:
      return {
        bg: "bg-green-50",
        text: "text-green-700",
        border: "border-green-200",
      };
  }
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
  if (p < 0.001) return p.toFixed(4);
  if (p < 0.01) return p.toFixed(3);
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

export function getDomainBadgeColor(domain: string): {
  bg: string;
  text: string;
} {
  switch (domain) {
    case "LB":
      return { bg: "bg-blue-100", text: "text-blue-700" };
    case "BW":
      return { bg: "bg-emerald-100", text: "text-emerald-700" };
    case "OM":
      return { bg: "bg-purple-100", text: "text-purple-700" };
    case "MI":
      return { bg: "bg-rose-100", text: "text-rose-700" };
    case "MA":
      return { bg: "bg-orange-100", text: "text-orange-700" };
    case "CL":
      return { bg: "bg-cyan-100", text: "text-cyan-700" };
    case "DS":
      return { bg: "bg-indigo-100", text: "text-indigo-700" };
    case "FW":
      return { bg: "bg-teal-100", text: "text-teal-700" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-700" };
  }
}

/** Returns a hex color for a domain identity dot (color spec §3.5). */
export function getDomainDotColor(domain: string): string {
  switch (domain) {
    case "BW": return "#10B981";
    case "LB": return "#3B82F6";
    case "MA": return "#F59E0B";
    case "MI": return "#EC4899";
    case "OM": return "#8B5CF6";
    case "CL": return "#22C55E";
    case "DS": return "#6366F1";
    case "FW": return "#14B8A6";
    default:   return "#9CA3AF";
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

/** Incidence background color for table cells. */
export function getIncidenceColor(incidence: number): string {
  if (incidence >= 0.8) return "rgba(239,68,68,0.15)";
  if (incidence >= 0.5) return "rgba(249,115,22,0.1)";
  if (incidence >= 0.2) return "rgba(234,179,8,0.08)";
  return "transparent";
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

/** Convert endpoint labels to title case: "ALBUMIN" → "Albumin", "LIVER_VACUOLIZATION" → "Liver Vacuolization" */
export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
