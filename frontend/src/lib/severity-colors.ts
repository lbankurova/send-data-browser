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
    default:
      return { bg: "bg-gray-100", text: "text-gray-700" };
  }
}
