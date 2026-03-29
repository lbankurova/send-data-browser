/**
 * GradeConfidencePane — renders backend GRADE-style confidence (D1-D9 dimensions).
 *
 * Shows per-finding evidence confidence from `_confidence` on UnifiedFinding.
 * Handles:
 *   - D8 scores down to -2 (severely underpowered)
 *   - D9 pharmacological expectation with suppression of D3/D4/D5/D7
 *   - Visual distinction between suppressed vs skipped dimensions
 *   - "Pharmacological" pill tag when D9 fires
 *   - "Severely underpowered" warning when D8 = -2
 */

import { Fragment, useCallback, useMemo, useState } from "react";
import { ChevronRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EvidenceConfidence, ConfidenceDimension } from "@/types/analysis";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Human-readable labels for each dimension score value. */
const D8_SCORE_LABELS: Record<number, string> = {
  1: "Adequately powered",
  0: "Acceptable N",
  [-1]: "Underpowered",
  [-2]: "Severely underpowered",
};

const D9_SCORE_LABELS: Record<number, string> = {
  [-1]: "Expected pharmacological effect",
  0: "No profile match",
};

/** Tooltip descriptions per dimension ID. */
const DIMENSION_DESCRIPTIONS: Record<string, string> = {
  D1: "Strength of pairwise significance and trend test results.",
  D2: "Consistency and shape of the dose-response curve.",
  D3: "Cross-domain corroboration from related findings.",
  D4: "Comparison against historical control data range.",
  D5: "Concordance between male and female findings.",
  D6: "Whether the effect magnitude falls in the equivocal zone for Tier 2 endpoints.",
  D7: "Whether the observed direction aligns with the known direction of toxicological concern.",
  D8: "Whether the per-group sample size meets the reference N for this study type.",
  D9: "Whether the finding matches an expected pharmacological effect for this compound class.",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** True when the rationale text indicates pharmacological suppression. */
function isSuppressed(dim: ConfidenceDimension): boolean {
  return dim.score === null && dim.rationale.toLowerCase().includes("suppressed");
}

/** Score indicator symbol/text for display. */
function scoreDisplay(dim: ConfidenceDimension): string {
  if (dim.score === null) {
    return isSuppressed(dim) ? "suppressed" : "\u2014"; // em dash for skipped
  }
  if (dim.score > 0) return `+${dim.score}`;
  return `${dim.score}`;
}

/** CSS class for score indicator. */
function scoreClass(dim: ConfidenceDimension): string {
  if (dim.score === null) {
    if (isSuppressed(dim)) {
      return "text-muted-foreground/60 line-through";
    }
    return "text-muted-foreground/40";
  }
  if (dim.score >= 1) return "text-foreground font-semibold";
  if (dim.score > 0) return "text-foreground font-medium"; // +0.5 (plausible NMDR)
  if (dim.score === 0) return "text-muted-foreground";
  if (dim.score <= -2) return "text-foreground font-semibold";
  return "text-foreground font-medium"; // -1
}

/** CSS class for the dimension label text. */
function labelClass(dim: ConfidenceDimension): string {
  if (isSuppressed(dim)) return "text-muted-foreground/60 line-through";
  if (dim.score === null) return "text-muted-foreground/50";
  return "";
}

/** Grade badge color — neutral gray per design rules (no colored badges for categorical identity). */
function gradeTextClass(grade: EvidenceConfidence["grade"]): string {
  switch (grade) {
    case "HIGH":
      return "text-foreground font-semibold";
    case "MODERATE":
      return "text-muted-foreground font-medium";
    case "LOW":
      return "text-foreground font-semibold";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface GradeConfidencePaneProps {
  confidence: EvidenceConfidence;
  /** Compact mode omits the expanded rationale rows. */
  compact?: boolean;
}

export function GradeConfidencePane({ confidence, compact = false }: GradeConfidencePaneProps) {
  const { dimensions, grade, grade_sum, n_scored, n_skipped } = confidence;
  const isPharmacological = confidence._pharmacological_candidate === true;

  const [expandedDims, setExpandedDims] = useState<Set<string>>(() => {
    // Auto-expand D8=-2 and suppressed dimensions
    const auto = new Set<string>();
    for (const d of dimensions) {
      if (d.dimension === "D8" && d.score != null && d.score <= -2) {
        auto.add(d.dimension);
      }
      if (d.dimension === "D9" && d.score != null && d.score < 0) {
        auto.add(d.dimension);
      }
    }
    return auto;
  });

  const toggleDim = useCallback((dimId: string) => {
    setExpandedDims((prev) => {
      const next = new Set(prev);
      if (next.has(dimId)) next.delete(dimId);
      else next.add(dimId);
      return next;
    });
  }, []);

  // D8=-2 warning
  const d8Dim = dimensions.find((d) => d.dimension === "D8");
  const severelyUnderpowered = d8Dim?.score != null && d8Dim.score <= -2;

  // Count suppressed dimensions
  const suppressedDims = useMemo(
    () => dimensions.filter(isSuppressed),
    [dimensions],
  );

  return (
    <div className="text-[11px]">
      {/* Header: grade + summary */}
      <div className="mb-1.5 flex items-center gap-2">
        <span className={cn("uppercase text-[10px]", gradeTextClass(grade))}>
          {grade}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono tabular-nums">
          ({grade_sum >= 0 ? "+" : ""}{grade_sum} from {n_scored} scored, {n_skipped} skipped)
        </span>
        {isPharmacological && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-200">
            Pharmacological
          </span>
        )}
      </div>

      {/* D8=-2 warning banner */}
      {severelyUnderpowered && (
        <div className="mb-1.5 flex items-center gap-1.5 rounded bg-gray-100 px-2 py-1 text-[10px] text-gray-600">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>Severely underpowered — treat as observational</span>
        </div>
      )}

      {/* Dimension rows */}
      <table className="w-full text-[11px]">
        <tbody>
          {dimensions.map((d) => {
            const suppressed = isSuppressed(d);
            const skipped = d.score === null && !suppressed;
            const isExpanded = !compact && expandedDims.has(d.dimension);
            const isExpandable = !compact && d.rationale.length > 0;

            // Special label for D8/D9 scores
            let extraLabel: string | null = null;
            if (d.dimension === "D8" && d.score != null && D8_SCORE_LABELS[d.score]) {
              extraLabel = D8_SCORE_LABELS[d.score];
            } else if (d.dimension === "D9") {
              if (d.score != null && D9_SCORE_LABELS[d.score]) {
                extraLabel = D9_SCORE_LABELS[d.score];
              } else if (d.score === null && !suppressed) {
                extraLabel = "No profile set";
              }
            }

            return (
              <Fragment key={d.dimension}>
                <tr
                  className={isExpandable ? "cursor-pointer hover:bg-muted/20" : ""}
                  onClick={isExpandable ? () => toggleDim(d.dimension) : undefined}
                >
                  {/* Score column */}
                  <td
                    className={cn("py-0.5 pr-1.5 text-right font-mono tabular-nums text-[10px]", scoreClass(d))}
                    style={{ width: "1px", whiteSpace: "nowrap" }}
                  >
                    {scoreDisplay(d)}
                  </td>
                  {/* Dimension ID */}
                  <td
                    className={cn("py-0.5 pr-1.5 font-mono text-[10px] text-muted-foreground", suppressed && "line-through text-muted-foreground/60")}
                    style={{ width: "1px", whiteSpace: "nowrap" }}
                  >
                    {d.dimension}
                  </td>
                  {/* Label + context */}
                  <td
                    className={cn("py-0.5 font-medium whitespace-nowrap", labelClass(d))}
                    title={DIMENSION_DESCRIPTIONS[d.dimension]}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {isExpandable && !compact ? (
                        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                      ) : (
                        <span className="inline-block h-3 w-3 shrink-0" />
                      )}
                      {d.label}
                      {skipped && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground/50">(skipped)</span>
                      )}
                      {suppressed && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground/60">(suppressed by D9)</span>
                      )}
                      {extraLabel && !suppressed && !skipped && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground">{extraLabel}</span>
                      )}
                    </span>
                  </td>
                </tr>
                {/* Expanded rationale row */}
                {isExpanded && (
                  <tr>
                    <td />
                    <td />
                    <td className="pb-1.5 pl-[14px] pt-0.5 text-[11px] text-muted-foreground">
                      {d.rationale}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Suppression summary when D9 fired */}
      {suppressedDims.length > 0 && (
        <div className="mt-1.5 text-[10px] text-muted-foreground/60">
          {suppressedDims.length} dimension{suppressedDims.length > 1 ? "s" : ""} suppressed by pharmacological expectation (D9)
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact inline badge — for use in table cells or rail items
// ---------------------------------------------------------------------------

/** Small inline badge showing the GRADE confidence level with optional pharmacological indicator. */
export function GradeConfidenceBadge({ confidence }: { confidence: EvidenceConfidence }) {
  const { grade } = confidence;
  const isPharmacological = confidence._pharmacological_candidate === true;
  const d8 = confidence.dimensions.find((d) => d.dimension === "D8");
  const severelyUnderpowered = d8?.score != null && d8.score <= -2;

  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "inline-flex items-center rounded bg-gray-100 px-1 py-px text-[10px] font-medium border border-gray-200",
          grade === "HIGH" ? "text-gray-700" :
          grade === "MODERATE" ? "text-gray-600" :
          "text-gray-700",
        )}
      >
        {grade}
      </span>
      {isPharmacological && (
        <span className="inline-flex items-center rounded-full bg-gray-100 px-1 py-px text-[9px] font-medium text-gray-500 border border-gray-200">
          Pharm
        </span>
      )}
      {severelyUnderpowered && (
        <AlertTriangle className="h-3 w-3 text-gray-500" />
      )}
    </span>
  );
}
