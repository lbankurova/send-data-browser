import type { FindingContext, UnifiedFinding } from "@/types/analysis";
import type { FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import { formatPValue, getEffectMagnitudeLabel } from "@/lib/severity-colors";
import { getPatternLabel, classifyEndpointConfidence } from "@/lib/findings-rail-engine";
import type { EndpointConfidence } from "@/lib/findings-rail-engine";
import {
  resolveCanonical,
  findClinicalMatchForEndpoint,
  getClinicalTierTextClass,
  getRuleSourceShortLabel,
  describeThreshold,
} from "@/lib/lab-clinical-catalog";
import type { EndpointSummary } from "@/lib/derive-summaries";

// ─── Types ─────────────────────────────────────────────────

interface Props {
  finding: UnifiedFinding;
  analytics?: FindingsAnalytics;
  noael?: { dose_value: number | null; dose_unit: string | null } | null;
  doseResponse?: FindingContext["dose_response"];
  statistics?: FindingContext["statistics"];
  treatmentSummary: FindingContext["treatment_summary"];
  endpointSexes?: Map<string, string[]>;
  notEvaluated?: boolean;
}

interface Verdict {
  icon: string;
  label: string;
  labelClass: string;
  severityWord: string;
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
      icon: "\u26D4",
      label: "Treatment-related",
      labelClass: "text-sm font-semibold text-foreground",
      severityWord: `Adverse${suffix}`,
    };
  }
  if (tr && sev === "warning") {
    return {
      icon: "\u26A0",
      label: "Treatment-related",
      labelClass: "text-sm font-semibold text-foreground",
      severityWord: "Warning",
    };
  }
  if (tr) {
    return {
      icon: "\u26A0",
      label: "Treatment-related",
      labelClass: "text-sm font-medium text-foreground",
      severityWord: "Normal",
    };
  }
  if (clinicalOverride && sev === "adverse") {
    return {
      icon: "\u26D4",
      label: `Clinical: ${clinicalOverride}`,
      labelClass: "text-sm font-semibold text-foreground",
      severityWord: "Adverse",
    };
  }
  return {
    icon: "\u2714",
    label: "Not treatment-related",
    labelClass: "text-sm font-medium text-muted-foreground",
    severityWord: "",
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

function buildPatternSentence(
  doseResponse: FindingContext["dose_response"] | undefined,
  statistics: FindingContext["statistics"] | undefined,
): string | null {
  if (!doseResponse?.pattern || doseResponse.pattern === "insufficient_data") return null;

  const direction = doseResponse.direction === "up" ? "increase" : doseResponse.direction === "down" ? "decrease" : null;

  if (doseResponse.pattern.startsWith("threshold")) {
    let onsetDose: string | null = null;
    // Prefer backend-computed onset (equivalence-band-based)
    if (doseResponse.onset_dose_value != null) {
      onsetDose = `${doseResponse.onset_dose_value} ${doseResponse.onset_dose_unit ?? "mg/kg"}`.trim();
    }
    // Fallback: first significant dose from statistics
    else if (statistics?.rows) {
      for (let i = 1; i < statistics.rows.length; i++) {
        const p = statistics.rows[i].p_value_adj ?? statistics.rows[i].p_value;
        if (p != null && p < 0.05) {
          const row = statistics.rows[i];
          onsetDose = row.dose_value != null ? `${row.dose_value} ${row.dose_unit ?? "mg/kg"}`.trim() : row.label;
          break;
        }
      }
    }
    const dirStr = direction ? ` ${direction}` : "";
    return onsetDose
      ? `Threshold${dirStr}, onset at ${onsetDose}`
      : `Threshold${dirStr}`;
  }

  if (doseResponse.pattern === "monotonic_increase" || doseResponse.pattern === "monotonic_decrease") {
    const dirStr = direction ? ` ${direction}` : "";
    return `Monotonic${dirStr} across doses`;
  }

  if (doseResponse.pattern === "non_monotonic") {
    const dirStr = direction ? ` ${direction}` : "";
    return `Non-monotonic${dirStr}`;
  }

  if (doseResponse.pattern === "flat") {
    return "No dose-dependent pattern";
  }

  return getPatternLabel(doseResponse.pattern);
}

// ─── Component ──────────────────────────────────────────────

export function VerdictPane({
  finding,
  analytics,
  noael,
  doseResponse,
  statistics,
  treatmentSummary,
  endpointSexes,
  notEvaluated,
}: Props) {
  const verdict = notEvaluated
    ? { icon: "\u2014", label: "Not evaluated", labelClass: "text-sm font-medium text-muted-foreground", severityWord: "" }
    : computeVerdict(treatmentSummary, analytics, finding);

  const patternSentence = notEvaluated ? null : buildPatternSentence(doseResponse, statistics);
  const confidence = notEvaluated ? null : buildConfidenceLabel(finding, analytics);

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
    sexLabel = aggSexes[0] === "M" ? "Males only" : aggSexes[0] === "F" ? "Females only" : "Both sexes";
  } else {
    const sex = finding.sex;
    sexLabel = sex === "M" ? "Males only" : sex === "F" ? "Females only" : "Both sexes";
  }

  // NOAEL string
  const noaelStr = noael
    ? noael.dose_value != null
      ? `NOAEL ${noael.dose_value} ${noael.dose_unit ?? "mg/kg"}`
      : (() => {
          // All treatment doses significant — show "NOAEL < lowest dose"
          const lowestDose = statistics?.rows?.[1]; // index 0 = control
          if (lowestDose?.dose_value != null) {
            return `NOAEL < ${lowestDose.dose_value} ${noael.dose_unit ?? "mg/kg"} (all tested doses significant)`;
          }
          return "NOAEL below tested range";
        })()
    : null;

  // Key numbers
  const isContinuous = statistics?.data_type === "continuous";
  const effectSize = finding.max_effect_size;
  const effectLabel = isContinuous ? "Cohen\u2019s d" : "Avg severity";
  const effectMag = effectSize != null ? getEffectMagnitudeLabel(effectSize) : null;

  const trendP = doseResponse?.trend_p ?? statistics?.trend_p ?? null;
  const trendTestName = isContinuous ? "Jonckheere-Terpstra" : "Cochran-Armitage";

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

  if (!foldChangeDisplay && statistics?.rows && statistics.rows.length >= 2) {
    const control = statistics.rows[0];
    const highest = statistics.rows[statistics.rows.length - 1];
    if (control.mean != null && highest.mean != null && control.mean !== 0) {
      const pct = ((highest.mean - control.mean) / Math.abs(control.mean)) * 100;
      pctChange = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      pctDoseLabel = highest.dose_value != null
        ? `at ${highest.dose_value} ${highest.dose_unit ?? "mg/kg"}`.trim()
        : `at ${highest.label}`;
    }
  }

  // Metadata items
  const metaItems: string[] = [];
  if (confidence) metaItems.push(`${confidence} confidence`);
  metaItems.push(sexLabel);
  if (noaelStr) metaItems.push(noaelStr);

  // Clinical verdict line
  const clinicalLineText = clinicalMatch
    ? `${clinicalMatch.severity} ${clinicalMatch.severityLabel} \u00b7 Rule ${clinicalMatch.ruleId} \u00b7 ${getRuleSourceShortLabel(clinicalMatch.source)}`
    : null;
  const clinicalLineClass = clinicalMatch ? getClinicalTierTextClass(clinicalMatch.severity) : "";

  return (
    <div>
      {/* Line 1 -- Verdict badge */}
      <div className="flex items-center gap-2">
        <span className="text-[14px]">{verdict.icon}</span>
        <span className={verdict.labelClass}>{verdict.label}</span>
        {verdict.severityWord && (
          <>
            <span className="text-muted-foreground">&middot;</span>
            <span className="text-xs font-medium text-foreground">{verdict.severityWord}</span>
          </>
        )}
      </div>

      {/* Line 2 -- Clinical tier + rule (only when a clinical rule matched) */}
      {clinicalLineText && (
        <div className={`mt-0.5 text-[10px] font-medium ${clinicalLineClass}`}>
          {clinicalLineText}
        </div>
      )}

      {/* Line 3 -- Pattern sentence */}
      {patternSentence && (
        <div className="mt-1.5 text-xs text-foreground/80">{patternSentence}</div>
      )}

      {/* Line 4 -- Key metadata */}
      {metaItems.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
          {metaItems.map((item, i) => (
            <span key={i}>
              {i > 0 && <span className="mr-2">&middot;</span>}
              {item}
            </span>
          ))}
        </div>
      )}

      {/* Line 5 -- Key numbers */}
      {(effectSize != null || trendP != null || pctChange != null || foldChangeDisplay != null) && (
        <div className="mt-2 flex gap-x-4 text-[10px]">
          {effectSize != null && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold font-mono">|d| = {Math.abs(effectSize).toFixed(2)}</span>
              <span className="text-[9px] text-muted-foreground">{effectLabel}</span>
              {effectMag && <span className="text-[9px] text-muted-foreground">({effectMag})</span>}
            </div>
          )}

          {trendP != null && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold font-mono">p {formatPValue(trendP) === "<0.0001" ? "< 0.0001" : `= ${formatPValue(trendP)}`}</span>
              <span className="text-[9px] text-muted-foreground">{trendTestName}</span>
              <span className="text-[9px] text-muted-foreground">trend</span>
            </div>
          )}

          {foldChangeDisplay != null ? (
            <div className="flex flex-col">
              <span className="text-sm font-semibold font-mono">{foldChangeDisplay}</span>
              <span className="text-[9px] text-muted-foreground">vs control</span>
              {foldChangeContext && <span className="text-[9px] text-muted-foreground">{foldChangeContext}</span>}
            </div>
          ) : pctChange != null ? (
            <div className="flex flex-col">
              <span className="text-sm font-semibold font-mono">{pctChange}</span>
              <span className="text-[9px] text-muted-foreground">vs control</span>
              {pctDoseLabel && <span className="text-[9px] text-muted-foreground">{pctDoseLabel}</span>}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
