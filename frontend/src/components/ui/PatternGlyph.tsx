/**
 * Schematic SVG glyph for dose-response pattern.
 * 24×12px — renders a fixed shape per pattern type.
 * Used in FindingsRail endpoint rows.
 */

import { cn } from "@/lib/utils";

interface PatternGlyphProps {
  pattern: string;
  className?: string;
}

const GLYPH_W = 24;
const GLYPH_H = 12;

function pathForPattern(pattern: string): string {
  switch (pattern) {
    case "monotonic_increase":
      // Ascending line bottom-left → top-right
      return "M2,10 L22,2";
    case "monotonic_decrease":
      // Descending line top-left → bottom-right
      return "M2,2 L22,10";
    case "threshold_increase":
      // Flat then step-up
      return "M2,8 L10,8 L12,3 L22,3";
    case "threshold_decrease":
      // Flat then step-down
      return "M2,3 L10,3 L12,8 L22,8";
    case "threshold":
      // Backward compat — flat then step-up
      return "M2,8 L10,8 L12,3 L22,3";
    case "non_monotonic":
      // Zigzag
      return "M2,8 L8,3 L14,9 L22,4";
    case "flat":
    default:
      // Horizontal line
      return "M2,6 L22,6";
  }
}

export function PatternGlyph({ pattern, className }: PatternGlyphProps) {
  const d = pathForPattern(pattern);
  return (
    <svg
      width={GLYPH_W}
      height={GLYPH_H}
      viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`}
      className={cn("shrink-0", className)}
      aria-label={pattern.replace(/_/g, " ")}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
