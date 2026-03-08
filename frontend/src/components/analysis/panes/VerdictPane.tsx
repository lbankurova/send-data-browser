import type { FindingContext, UnifiedFinding } from "@/types/analysis";
import type { FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import { formatPValue, getEffectMagnitudeLabel } from "@/lib/severity-colors";
import { getPatternLabel, classifyEndpointConfidence } from "@/lib/findings-rail-engine";
import type { EndpointConfidence } from "@/lib/findings-rail-engine";
import type { EndpointConfidenceResult } from "@/lib/endpoint-confidence";
import {
  resolveCanonical,
  findClinicalMatchForEndpoint,
  getClinicalTierTextClass,
  getRuleSourceShortLabel,
  describeThreshold,
} from "@/lib/lab-clinical-catalog";
import type { EndpointSummary, SexEndpointSummary } from "@/lib/derive-summaries";
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

interface Verdict {
  label: string;
  labelClass: string;
  severityWord: string;
  /** Dashed underline color for the verdict line (red for adverse, amber for warning). */
  underlineColor: string | null;
}

// ─── Verdict logic (moved from TreatmentRelatedSummaryPane) ─

/** Determine effective severity accounting for clinical override from Layer D. */
function effectiveSeverity(
  statSev: string,
  analytics: FindingsAnalytics | undefined,
  finding: UnifiedFinding | null | undefined,
): { sev: string; clinicalOverride: string | null } {
  if (!analytics?.labMatches.length || !finding) return { sev: statSev, clinicalOverride: null };
  const endpointLabel = finding.endpoint_label ?? finding.finding;
  const canonical = resolveCanonical(endpointLabel);
  if (!canonical) return { sev: statSev, clinicalOverride: null };

  const sevOrder: Record<string, number> = { adverse: 3, warning: 2, normal: 1 };
  const clinicalToStat: Record<string, string> = { S4: "adverse", S3: "adverse", S2: "warning", S1: "normal" };
  let worst = statSev;
  let overrideRule: string | null = null;

  for (const match of analytics.labMatches) {
    if (!match.matchedEndpoints.some((e) => resolveCanonical(e) === canonical)) continue;
    const mapped = clinicalToStat[match.severity] ?? "normal";
    if ((sevOrder[mapped] ?? 0) > (sevOrder[worst] ?? 0)) {
      worst = mapped;
      overrideRule = match.ruleName;
    }
  }

  return { sev: worst, clinicalOverride: worst !== statSev ? overrideRule : null };
}

function computeVerdict(
  data: FindingContext["treatment_summary"],
  analytics?: FindingsAnalytics,
  finding?: UnifiedFinding | null,
): Verdict {
  const tr = data.treatment_related;
  const { sev, clinicalOverride } = effectiveSeverity(data.severity, analytics, finding);

  if (tr && sev === "adverse") {
    const suffix = clinicalOverride ? ` (${clinicalOverride})` : "";
    return {
      label: "Treatment-related",
      labelClass: "text-sm font-semibold text-foreground",
      severityWord: `Adverse${suffix}`,
      underlineColor: "#DC2626",
    };
  }
  if (tr && sev === "warning") {
    return {
      label: "Treatment-related",
      labelClass: "text-sm font-semibold text-foreground",
      severityWord: "Warning",
      underlineColor: "#D97706",
    };
  }
  if (tr) {
    return {
      label: "Treatment-related",
      labelClass: "text-sm font-medium text-foreground",
      severityWord: "Normal",
      underlineColor: null,
    };
  }
  if (clinicalOverride && sev === "adverse") {
    return {
      label: `Clinical: ${clinicalOverride}`,
      labelClass: "text-sm font-semibold text-foreground",
      severityWord: "Adverse",
      underlineColor: "#DC2626",
    };
  }
  return {
    label: "Not treatment-related",
    labelClass: "text-sm font-medium text-muted-foreground",
    severityWord: "",
    underlineColor: null,
  };
}

// ─── Confidence ─────────────────────────────────────────────

function buildConfidenceLabel(
  finding: UnifiedFinding,
  analytics: FindingsAnalytics | undefined,
): EndpointConfidence | null {
  if (!analytics) return null;
  const endpointLabel = finding.endpoint_label ?? finding.finding;

  const ep: EndpointSummary = {
    endpoint_label: endpointLabel,
    organ_system: finding.organ_system ?? "unknown",
    domain: finding.domain,
    worstSeverity: (finding.severity === "adverse" ? "adverse" : finding.severity === "warning" ? "warning" : "normal") as "adverse" | "warning" | "normal",
    treatmentRelated: finding.treatment_related,
    pattern: finding.dose_response_pattern ?? "flat",
    minPValue: finding.min_p_adj,
    maxEffectSize: finding.max_effect_size,
    direction: finding.direction as "up" | "down" | "none" | null ?? null,
    sexes: finding.sex === "M" ? ["M"] : finding.sex === "F" ? ["F"] : ["M", "F"],
    maxFoldChange: null,
  };

  return classifyEndpointConfidence(ep);
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

/** Pattern type without direction word — used inside arrow-annotated lines where direction is already shown. */
function patternTypeOnly(pattern: string): string {
  if (pattern.startsWith("threshold")) return "threshold";
  if (pattern === "monotonic_increase" || pattern === "monotonic_decrease") return "monotonic";
  if (pattern === "non_monotonic") return "non-monotonic";
  if (pattern === "u_shaped") return "U-shaped";
  if (pattern === "flat") return "no pattern";
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
        return `${arrow} ${p.sex} (${patternTypeOnly(p.pattern)})`;
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
  noael,
  doseResponse,
  statistics,
  siblingStatistics,
  siblingDoseResponse,
  treatmentSummary,
  endpointSexes,
  notEvaluated,
  eciConfidence,
  endpointConfidence,
  onSeeDecomposition,
  hasSibling,
}: Props) {
  const { settings: studySettings } = useStudySettings();
  const verdict = notEvaluated
    ? { label: "Not evaluated", labelClass: "text-sm font-medium text-muted-foreground", severityWord: "", underlineColor: null }
    : computeVerdict(treatmentSummary, analytics, finding);

  // patternSentence computed below after epSummary
  // Prefer ECI integrated confidence over the simple heuristic
  const confidence: EndpointConfidence | null = notEvaluated
    ? null
    : eciConfidence
      ? eciConfidence.toUpperCase() as EndpointConfidence
      : buildConfidenceLabel(finding, analytics);

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
  const noaelBySex = epSummary?.noaelBySex;
  const hasSexNoaelDiff = noaelBySex && noaelBySex.size >= 2;

  // NOAEL string — when both sexes present, derive combined from min of per-sex values
  // (the `noael` prop is computed from primary finding's stats and may not reflect the true combined)
  const noaelStr = (() => {
    if (!noael) return null;
    if (hasSexNoaelDiff) {
      const entries = [...noaelBySex!.entries()];
      const belowLowest = entries.some(([, n]) => n.tier === "below-lowest");
      if (belowLowest) return "NOAEL below tested range (combined \u2014 min of per-sex values)";
      const withValues = entries.filter(([, n]) => n.doseValue != null);
      if (withValues.length > 0) {
        const min = withValues.reduce((best, cur) => (cur[1].doseValue! < best[1].doseValue! ? cur : best));
        return `NOAEL ${min[1].doseValue} ${min[1].doseUnit ?? "mg/kg"} (combined \u2014 min of per-sex values)`;
      }
      return "NOAEL below tested range (combined \u2014 min of per-sex values)";
    }
    if (noael.dose_value != null) {
      return `NOAEL ${noael.dose_value} ${noael.dose_unit ?? "mg/kg"}`;
    }
    const lowestDose = statistics?.rows?.[1]; // index 0 = control
    if (lowestDose?.dose_value != null) {
      return `NOAEL < ${lowestDose.dose_value} ${noael.dose_unit ?? "mg/kg"} (all tested doses significant)`;
    }
    return "NOAEL below tested range";
  })();

  const bySex = epSummary?.bySex;

  // Combined sex + direction + pattern line (replaces separate patternSentence + directionalFlag)
  const sexDirectionLine = notEvaluated ? null : buildSexDirectionLine(sexLabel, bySex, doseResponse);

  // NOAEL weight from ECI
  const noaelWeight = endpointConfidence?.noaelContribution ?? null;

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
  const clinicalLineClass = clinicalMatch ? getClinicalTierTextClass(clinicalMatch.severity) : "";

  return (
    <div>
      {/* Line 1 -- Verdict badge */}
      <div className="flex items-center gap-2">
        <span
          className={verdict.labelClass}
          style={verdict.underlineColor ? {
            textDecoration: "underline dashed",
            textDecorationColor: verdict.underlineColor,
            textUnderlineOffset: "4px",
          } : undefined}
        >{verdict.label}</span>
        {verdict.severityWord && (
          <>
            <span className="text-muted-foreground">|</span>
            <span
              className="text-xs font-medium text-foreground"
              style={verdict.underlineColor ? {
                textDecoration: "underline dashed",
                textDecorationColor: verdict.underlineColor,
                textUnderlineOffset: "4px",
              } : undefined}
            >{verdict.severityWord}</span>
          </>
        )}
      </div>

      {/* Line 2 -- Clinical tier + rule (only when a clinical rule matched) */}
      {clinicalLineText && (
        <div className={`mt-0.5 text-[10px] font-medium ${clinicalLineClass}`}>
          {clinicalLineText}
        </div>
      )}

      {/* Line 3 -- Metadata: confidence · NOAEL weight · NOAEL */}
      {(confidence || noaelWeight || noaelStr) && (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[10px] text-muted-foreground">
          {confidence && <span>{confidence} confidence</span>}
          {confidence && noaelWeight && <span>&middot;</span>}
          {noaelWeight && (
            <span>
              NOAEL weight: {noaelWeight.weight} ({noaelWeight.label})
              {onSeeDecomposition && (
                <button className="ml-1 text-primary hover:underline" onClick={onSeeDecomposition}>
                  See decomposition
                </button>
              )}
            </span>
          )}
          {(confidence || noaelWeight) && noaelStr && <span>&middot;</span>}
          {noaelStr && <span>{noaelStr}</span>}
        </div>
      )}

      {/* Line 4 -- Sex + direction + pattern (+ override dropdown for single-sex) */}
      {sexDirectionLine && (
        <div className="mt-0.5 flex items-center gap-2 text-[10px] font-medium text-foreground/80">
          <span>{sexDirectionLine}</span>
          {!hasSibling && !notEvaluated && <PatternOverrideDropdown finding={finding} />}
        </div>
      )}

      {/* Line 5 -- Key numbers with "Largest effect" header */}
      {(effectSize != null || trendP != null || pctChange != null || foldChangeDisplay != null) && (
        <div className="mt-3 pt-2 border-t border-border/40">
          <div className="text-[10px] text-muted-foreground">
            Largest effect ({bestEffectSex}):
          </div>
          <div className="mt-1.5 flex gap-x-6 text-[10px]">
            {effectSize != null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">|{isContinuous ? getEffectSizeSymbol(esMethod) : "d"}| = {Math.abs(effectSize).toFixed(2)}</span>
                <span className="text-[9px] text-muted-foreground">{effectLabel}</span>
                {effectMag && <span className="text-[9px] text-muted-foreground">({effectMag})</span>}
              </div>
            )}

            {trendP != null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">p {formatPValue(trendP) === "<0.0001" ? "< 0.0001" : `= ${formatPValue(trendP)}`}</span>
                <span className="text-[9px] text-muted-foreground">{trendTestName}</span>
                <span className="text-[9px] text-muted-foreground">trend</span>
              </div>
            )}

            {foldChangeDisplay != null ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">{foldChangeDisplay}</span>
                <span className="text-[9px] text-muted-foreground">vs control</span>
                {foldChangeContext && <span className="text-[9px] text-muted-foreground">{foldChangeContext}</span>}
              </div>
            ) : pctChange != null ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">{pctChange}</span>
                <span className="text-[9px] text-muted-foreground">vs control</span>
                {pctDoseLabel && <span className="text-[9px] text-muted-foreground">{pctDoseLabel}</span>}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Line 6 -- ANCOVA punchline */}
      {ancovaLine && (
        <div className="mt-2 text-[10px] text-foreground/80">{ancovaLine}</div>
      )}
    </div>
  );
}
