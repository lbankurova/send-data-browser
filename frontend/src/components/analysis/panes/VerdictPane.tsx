import type { FindingContext, UnifiedFinding } from "@/types/analysis";
import type { FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import { formatPValue, getEffectMagnitudeLabel } from "@/lib/severity-colors";
import { getPatternLabel } from "@/lib/findings-rail-engine";
import type { EndpointConfidenceResult } from "@/lib/endpoint-confidence";
import {
  resolveCanonical,
  findClinicalMatchForEndpoint,
  getRuleSourceShortLabel,
  describeThreshold,
} from "@/lib/lab-clinical-catalog";
import type { SexEndpointSummary } from "@/lib/derive-summaries";
import { getEffectSizeLabel, getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { TREND_TEST_LABELS, INCIDENCE_TREND_LABELS } from "@/lib/build-settings-params";
import { PatternOverrideDropdown } from "./PatternOverrideDropdown";

// ─── Types ─────────────────────────────────────────────────

interface Props {
  finding: UnifiedFinding;
  /** Opposite-sex finding for the same endpoint (when both sexes exist). */
  siblingFinding?: UnifiedFinding | null;
  analytics?: FindingsAnalytics;
  noael?: { dose_value: number | null; dose_unit: string | null } | null;
  doseResponse?: FindingContext["dose_response"];
  statistics?: FindingContext["statistics"];
  /** Sibling sex statistics (for sourcing "Largest effect" from bestEffectSex). */
  siblingStatistics?: FindingContext["statistics"] | null;
  /** Sibling dose-response (for sourcing trend p from bestEffectSex). */
  siblingDoseResponse?: FindingContext["dose_response"] | null;
  treatmentSummary: FindingContext["treatment_summary"];
  endpointSexes?: Map<string, string[]>;
  notEvaluated?: boolean;
  /** ECI integrated confidence — overrides the simple heuristic when available. */
  eciConfidence?: "high" | "moderate" | "low" | null;
  /** Full ECI result — used for NOAEL weight display. */
  endpointConfidence?: EndpointConfidenceResult | null;
  /** Callback to scroll to confidence decomposition in Evidence pane. */
  onSeeDecomposition?: () => void;
  /** When false, sex comparison table won't render — show pattern override inline. */
  hasSibling?: boolean;
}



// ─── Pattern sentence ───────────────────────────────────────

/** Format a single pattern + direction into a human label. */
function formatPattern(pattern: string, direction: string | null): string {
  const dirWord = direction === "up" ? "increase" : direction === "down" ? "decrease" : null;

  if (pattern.startsWith("threshold")) {
    return dirWord ? `Threshold ${dirWord}` : "Threshold";
  }
  if (pattern === "monotonic_increase" || pattern === "monotonic_decrease") {
    return dirWord ? `Monotonic ${dirWord}` : "Monotonic";
  }
  if (pattern === "non_monotonic") {
    return dirWord ? `Non-monotonic ${dirWord}` : "Non-monotonic";
  }
  if (pattern === "u_shaped") {
    return "U-shaped";
  }
  if (pattern === "flat") {
    return "No dose-dependent pattern";
  }
  return getPatternLabel(pattern);
}


/** Build combined sex + direction + pattern description for the verdict section. */
function buildSexDirectionLine(
  sexLabel: string,
  bySex: Map<string, SexEndpointSummary> | undefined,
  doseResponse: FindingContext["dose_response"] | undefined,
): string {
  if (!bySex || bySex.size < 2) {
    // Single sex — append pattern if available
    if (!doseResponse?.pattern || doseResponse.pattern === "insufficient_data" || doseResponse.pattern === "flat") {
      return sexLabel;
    }
    return `${sexLabel} \u00b7 ${formatPattern(doseResponse.pattern, doseResponse.direction ?? null)}`;
  }

  const entries = [...bySex.entries()].sort(([a], [b]) => a.localeCompare(b));
  const pats = entries.map(([sex, s]) => ({
    sex,
    direction: s.direction,
    pattern: s.pattern,
    fullLabel: formatPattern(s.pattern, s.direction),
  }));

  // Check for opposite directions
  const ups = pats.filter(p => p.direction === "up");
  const downs = pats.filter(p => p.direction === "down");
  const hasOpposite = ups.length > 0 && downs.length > 0;

  if (hasOpposite) {
    // "Both sexes · Opposite direction: ↑ F (threshold), ↓ M (threshold)"
    const parts = pats
      .filter(p => p.direction === "up" || p.direction === "down")
      .map(p => {
        const arrow = p.direction === "up" ? "\u2191" : "\u2193";
        return `${arrow} ${p.sex} (${getPatternLabel(p.pattern)})`;
      });
    return `${sexLabel} \u00b7 Opposite direction: ${parts.join(", ")}`;
  }

  // Same direction — show pattern
  const allSame = pats.every(p => p.pattern === pats[0].pattern && p.direction === pats[0].direction);
  if (allSame && pats[0].pattern && pats[0].pattern !== "flat" && pats[0].pattern !== "insufficient_data") {
    return `${sexLabel} \u00b7 ${pats[0].fullLabel}`;
  }

  // Different patterns, same direction
  const patParts = pats.map(p => `${p.sex}: ${p.fullLabel}`);
  return `${sexLabel} \u00b7 ${patParts.join(" \u00b7 ")}`;
}

// ─── Component ──────────────────────────────────────────────

export function VerdictPane({
  finding,
  siblingFinding,
  analytics,
  noael: _noael,
  doseResponse,
  statistics,
  siblingStatistics,
  siblingDoseResponse,
  treatmentSummary: _treatmentSummary,
  endpointSexes,
  notEvaluated,
  eciConfidence: _eciConfidence,
  endpointConfidence: _endpointConfidence,
  onSeeDecomposition: _onSeeDecomposition,
  hasSibling,
}: Props) {
  const { settings: studySettings } = useStudySettings();

  // Clinical match for this endpoint (Layer D)
  const clinicalMatch: LabClinicalMatch | null = (!notEvaluated && analytics?.labMatches.length)
    ? findClinicalMatchForEndpoint(finding.endpoint_label ?? finding.finding, analytics.labMatches, finding.test_code)
    : null;

  // Sex label
  const endpointLabel = finding.endpoint_label ?? finding.finding;
  const aggSexes = endpointSexes?.get(endpointLabel);
  let sexLabel: string;
  if (aggSexes && aggSexes.length >= 2) {
    sexLabel = "Both sexes";
  } else if (aggSexes && aggSexes.length === 1) {
    sexLabel = aggSexes[0] === "M" ? "M only" : aggSexes[0] === "F" ? "F only" : "Both sexes";
  } else {
    const sex = finding.sex;
    sexLabel = sex === "M" ? "M only" : sex === "F" ? "F only" : "Both sexes";
  }

  // Per-sex NOAEL breakdown (from endpoint summary)
  const epSummary = analytics?.endpoints.find(e => e.endpoint_label === endpointLabel);

  const bySex = epSummary?.bySex;

  // Combined sex + direction + pattern line (replaces separate patternSentence + directionalFlag)
  const sexDirectionLine = notEvaluated ? null : buildSexDirectionLine(sexLabel, bySex, doseResponse);

  // "Largest effect" sex header
  const bestEffectSex = (() => {
    if (!bySex || bySex.size < 2) return finding.sex;
    let best = finding.sex;
    let bestVal = -1;
    for (const [sex, s] of bySex.entries()) {
      const e = Math.abs(s.maxEffectSize ?? 0);
      if (e > bestVal) { bestVal = e; best = sex; }
    }
    return best;
  })();

  // Resolve data sources for "Largest effect" — always from bestEffectSex
  const isSibling = bestEffectSex !== finding.sex;
  const bestFinding = isSibling && siblingFinding ? siblingFinding : finding;
  const bestStats = isSibling && siblingStatistics ? siblingStatistics : statistics;
  const bestDR = isSibling && siblingDoseResponse ? siblingDoseResponse : doseResponse;

  // Key numbers — all sourced from bestEffectSex
  const isContinuous = statistics?.data_type === "continuous";
  const effectSize = bestFinding.max_effect_size;
  const esMethod = analytics?.activeEffectSizeMethod ?? "hedges-g";
  const effectLabel = isContinuous ? getEffectSizeLabel(esMethod) : "Avg severity";
  const effectMag = effectSize != null ? getEffectMagnitudeLabel(effectSize) : null;

  const trendP = bestDR?.trend_p ?? bestStats?.trend_p ?? null;
  const trendTestName = isContinuous
    ? (TREND_TEST_LABELS[studySettings.trendTest] ?? "Jonckheere-Terpstra")
    : (INCIDENCE_TREND_LABELS[studySettings.incidenceTrend] ?? "Cochran-Armitage");

  // Fold-change or % change cell
  let pctChange: string | null = null;
  let pctDoseLabel: string | null = null;
  let foldChangeDisplay: string | null = null;
  let foldChangeContext: string | null = null;

  if (clinicalMatch) {
    const canonical = resolveCanonical(endpointLabel);
    const fc = canonical ? clinicalMatch.foldChanges[canonical] : null;
    if (fc != null) {
      foldChangeDisplay = `${fc.toFixed(1)}\u00d7`;
      const threshDesc = canonical ? describeThreshold(clinicalMatch.ruleId, canonical) : null;
      foldChangeContext = threshDesc ? `(${clinicalMatch.ruleId}: ${threshDesc})` : null;
    }
  }

  if (!foldChangeDisplay && bestStats?.rows && bestStats.rows.length >= 2) {
    const control = bestStats.rows[0];
    const highest = bestStats.rows[bestStats.rows.length - 1];
    if (control.mean != null && highest.mean != null && control.mean !== 0) {
      const pct = ((highest.mean - control.mean) / Math.abs(control.mean)) * 100;
      pctChange = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      pctDoseLabel = highest.dose_value != null
        ? `at ${highest.dose_value} ${highest.dose_unit ?? "mg/kg"}`.trim()
        : `at ${highest.label}`;
    }
  }

  // ANCOVA punchline — use the best-effect sex's ANCOVA when both sexes exist,
  // and pick the most significant pairwise comparison (lowest p), not just the first.
  const ancovaLine = (() => {
    const bestAncova = bestEffectSex !== finding.sex && siblingFinding?.ancova
      ? siblingFinding.ancova
      : finding.ancova;
    if (!bestAncova?.pairwise?.length) return null;
    const sigPairs = bestAncova.pairwise.filter(ap => ap.p_value < 0.05);
    if (sigPairs.length === 0) return null;
    const sig = sigPairs.reduce((a, b) => a.p_value <= b.p_value ? a : b);
    const row = bestStats?.rows?.find(r => r.dose_level === sig.group);
    const doseLabel = row?.dose_value != null ? `${row.dose_value} ${row.dose_unit ?? "mg/kg"}` : `group ${sig.group}`;
    const pStr = formatPValue(sig.p_value);
    const pFragment = pStr.startsWith("<") ? `p\u2009${pStr}` : `p\u2009=\u2009${pStr}`;
    return `ANCOVA confirms direct effect at ${doseLabel} (${pFragment}).`;
  })();

  // Clinical verdict line
  const sexAnnotation = clinicalMatch?.sex
    ? ` \u00b7 ${clinicalMatch.sex}`
    : "";
  const clinicalLineText = clinicalMatch
    ? `${clinicalMatch.severity} ${clinicalMatch.severityLabel} \u00b7 Rule ${clinicalMatch.ruleId}${sexAnnotation} \u00b7 ${getRuleSourceShortLabel(clinicalMatch.source)}`
    : null;
  // C-04: no colored text in context panel — tier label communicates severity
  const clinicalLineClass = "text-muted-foreground";

  return (
    <div>
      {/* Line 1 -- Clinical tier + rule (only when a clinical rule matched) */}
      {clinicalLineText && (
        <div className={`mt-0.5 text-[11px] font-medium ${clinicalLineClass}`}>
          {clinicalLineText}
        </div>
      )}

      {/* Line 2 -- Sex + direction + pattern (+ override dropdown for single-sex) */}
      {sexDirectionLine && (
        <div className="mt-0.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
          <span>{sexDirectionLine}</span>
          {!hasSibling && !notEvaluated && <PatternOverrideDropdown finding={finding} />}
        </div>
      )}

      {/* Sex divergence callout — when both sexes present and effect sizes differ substantially */}
      {bySex && bySex.size >= 2 && (() => {
        const entries = [...bySex.entries()].sort((a, b) => a[0].localeCompare(b[0]));
        const esValues = entries.map(([, s]) => Math.abs(s.maxEffectSize ?? 0));
        const divergence = esValues.length >= 2 ? Math.abs(esValues[0] - esValues[1]) : 0;
        if (divergence <= 0.5) return null;
        const parts = entries.map(([sex, s]) =>
          `${sex} |${isContinuous ? getEffectSizeSymbol(esMethod) : "d"}|=${Math.abs(s.maxEffectSize ?? 0).toFixed(2)}`
        );
        return (
          <div className="mt-1 text-[10px] text-muted-foreground">
            Sex divergence: {parts.join(", ")}
          </div>
        );
      })()}

      {/* Line 5 -- Key numbers with "Largest effect" header */}
      {(effectSize != null || trendP != null || pctChange != null || foldChangeDisplay != null) && (
        <div className="mt-3 pt-2 border-t border-border/40">
          <div className="text-[11px] text-muted-foreground">
            Largest effect ({bestEffectSex}):
          </div>
          <div className="mt-1.5 flex gap-x-6 text-[11px]">
            {effectSize != null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">|{isContinuous ? getEffectSizeSymbol(esMethod) : "d"}| = {Math.abs(effectSize).toFixed(2)}</span>
                <span className="text-[10px] text-muted-foreground">{effectLabel}</span>
                {effectMag && <span className="text-[10px] text-muted-foreground">({effectMag})</span>}
              </div>
            )}

            {trendP != null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">p {formatPValue(trendP) === "<0.0001" ? "< 0.0001" : `= ${formatPValue(trendP)}`}</span>
                <span className="text-[10px] text-muted-foreground">{trendTestName}</span>
                <span className="text-[10px] text-muted-foreground">trend</span>
              </div>
            )}

            {foldChangeDisplay != null ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">{foldChangeDisplay}</span>
                <span className="text-[10px] text-muted-foreground">vs control</span>
                {foldChangeContext && <span className="text-[10px] text-muted-foreground">{foldChangeContext}</span>}
              </div>
            ) : pctChange != null ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">{pctChange}</span>
                <span className="text-[10px] text-muted-foreground">vs control</span>
                {pctDoseLabel && <span className="text-[10px] text-muted-foreground">{pctDoseLabel}</span>}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Line 6 -- ANCOVA punchline */}
      {ancovaLine && (
        <div className="mt-2 text-[11px] text-muted-foreground">{ancovaLine}</div>
      )}
    </div>
  );
}
