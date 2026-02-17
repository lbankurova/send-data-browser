import type { FindingContext, UnifiedFinding } from "@/types/analysis";
import type { FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import { titleCase, formatPValue, getEffectMagnitudeLabel } from "@/lib/severity-colors";
import { getPatternLabel, classifyEndpointConfidence } from "@/lib/findings-rail-engine";
import type { EndpointConfidence } from "@/lib/findings-rail-engine";
import { resolveCanonical } from "@/lib/lab-clinical-catalog";
import type { EndpointSummary } from "@/lib/derive-summaries";

// ─── Types ─────────────────────────────────────────────────

interface Props {
  data: FindingContext["treatment_summary"];
  finding?: UnifiedFinding | null;
  analytics?: FindingsAnalytics;
  noael?: { dose_value: number | null; dose_unit: string | null } | null;
  doseResponse?: FindingContext["dose_response"];
  statistics?: FindingContext["statistics"];
  /** Aggregate sexes per endpoint, from shared selection context. */
  endpointSexes?: Map<string, string[]>;
  /** When true, show "Not evaluated" verdict instead of computed verdict */
  notEvaluated?: boolean;
}

// ─── Verdict logic ─────────────────────────────────────────

interface Verdict {
  icon: string;
  label: string;
  labelClass: string;
  severityLine: string;
  severityClass: string;
}

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
  data: Props["data"],
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
      severityLine: `Adverse${suffix}`,
      severityClass: "text-xs font-medium text-foreground",
    };
  }
  if (tr && sev === "warning") {
    return {
      icon: "\u26A0",
      label: "Treatment-related",
      labelClass: "text-sm font-semibold text-foreground",
      severityLine: "Warning",
      severityClass: "text-xs font-medium text-muted-foreground",
    };
  }
  if (tr) {
    return {
      icon: "\u26A0",
      label: "Treatment-related",
      labelClass: "text-sm font-medium text-foreground",
      severityLine: "Normal",
      severityClass: "text-xs text-muted-foreground",
    };
  }
  // Not treatment-related but clinical override may still apply
  if (clinicalOverride && sev === "adverse") {
    return {
      icon: "\u26D4",
      label: `Clinical: ${clinicalOverride}`,
      labelClass: "text-sm font-semibold text-foreground",
      severityLine: `Adverse (clinical override, not statistically treatment-related)`,
      severityClass: "text-xs font-medium text-foreground",
    };
  }
  return {
    icon: "\u2714",
    label: "Not treatment-related",
    labelClass: "text-sm font-medium text-muted-foreground",
    severityLine: "No treatment-related signal detected",
    severityClass: "text-xs text-muted-foreground",
  };
}

// ─── Tier 1: Confidence classification ─────────────────────

function buildConfidenceLabel(
  finding: UnifiedFinding | null | undefined,
  analytics: FindingsAnalytics | undefined,
): { confidence: EndpointConfidence; factors: string[] } | null {
  if (!finding || !analytics) return null;
  const endpointLabel = finding.endpoint_label ?? finding.finding;

  // Build a minimal EndpointSummary from the finding + analytics signal scores
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
  };

  const conf = classifyEndpointConfidence(ep);
  const factors: string[] = [];

  // Build human-readable factor list
  if (ep.minPValue !== null && ep.minPValue < 0.01) factors.push(`p < 0.01`);
  else if (ep.minPValue !== null && ep.minPValue < 0.05) factors.push(`p < 0.05`);
  if (ep.maxEffectSize != null && Math.abs(ep.maxEffectSize) >= 0.8) factors.push("large effect");
  else if (ep.maxEffectSize != null && Math.abs(ep.maxEffectSize) >= 0.5) factors.push("moderate effect");
  if (ep.pattern === "monotonic_increase" || ep.pattern === "monotonic_decrease") factors.push("monotonic");
  else if (ep.pattern === "threshold") factors.push("threshold pattern");
  if (ep.treatmentRelated) factors.push("treatment-related");
  if (ep.sexes.length >= 2) factors.push("both sexes");

  return { confidence: conf, factors };
}

// ─── Evidence bullet generation ────────────────────────────

function buildEvidenceBullets(
  _data: Props["data"],
  finding: UnifiedFinding | null | undefined,
  analytics: FindingsAnalytics | undefined,
  doseResponse: FindingContext["dose_response"] | undefined,
  statistics: FindingContext["statistics"] | undefined,
): string[] {
  const bullets: string[] = [];

  // Tier 1: Confidence classification
  const confResult = buildConfidenceLabel(finding, analytics);
  if (confResult) {
    const factorStr = confResult.factors.length > 0 ? ` (${confResult.factors.join(", ")})` : "";
    bullets.push(`${confResult.confidence} confidence${factorStr}`);
  }

  // Tier 2: Clinical lab matches (with fold change details)
  if (analytics?.labMatches.length) {
    const endpointLabel = finding?.endpoint_label ?? finding?.finding;
    if (endpointLabel) {
      const canonical = resolveCanonical(endpointLabel);
      for (const match of analytics.labMatches) {
        if (canonical && match.matchedEndpoints.some((e) => resolveCanonical(e) === canonical)) {
          const fcDetails = Object.entries(match.foldChanges)
            .map(([k, v]) => `${k} ${v.toFixed(1)}x`)
            .join(", ");
          const fcSuffix = fcDetails ? ` \u2014 ${fcDetails}` : "";
          bullets.push(`${match.severityLabel}: ${match.ruleName}${fcSuffix}`);
        }
      }
    }
  }

  // Tier 2: Syndrome
  if (analytics?.syndromes.length && finding) {
    const endpointLabel = (finding.endpoint_label ?? finding.finding).toLowerCase();
    for (const syn of analytics.syndromes) {
      if (syn.matchedEndpoints.some((m) => m.endpoint_label.toLowerCase() === endpointLabel)) {
        const others = syn.matchedEndpoints
          .filter((m) => m.endpoint_label.toLowerCase() !== endpointLabel)
          .map((m) => m.endpoint_label)
          .slice(0, 3);
        const suffix = others.length > 0 ? `: ${others.join(", ")}` : "";
        bullets.push(`Part of ${syn.name} syndrome (${syn.confidence.toLowerCase()})${suffix}`);
      }
    }
  }

  // Tier 2: Coherence
  if (analytics?.organCoherence && finding?.organ_system) {
    const coh = analytics.organCoherence.get(finding.organ_system);
    if (coh && coh.domainCount >= 2) {
      bullets.push(`${coh.domainCount}-domain convergence in ${titleCase(coh.organ_system)}: ${coh.domains.join(", ")}`);
    }
  }

  // Tier 3: Programmatic fallbacks from FindingContext
  if (statistics?.rows) {
    const sigDoses = statistics.rows.filter((r) => r.p_value != null && r.p_value < 0.05);
    for (const row of sigDoses) {
      bullets.push(`Significant at ${row.label} (p=${formatPValue(row.p_value)})`);
    }
  }

  if (doseResponse?.pattern && doseResponse.pattern !== "flat" && doseResponse.pattern !== "insufficient_data") {
    bullets.push(`${getPatternLabel(doseResponse.pattern)} dose-response`);
  }

  if (finding?.max_effect_size != null) {
    const d = finding.max_effect_size;
    const mag = getEffectMagnitudeLabel(d);
    bullets.push(`Effect size ${d.toFixed(2)} (${mag})`);
  }

  if (doseResponse?.trend_p != null) {
    const trendNote = doseResponse.trend_p < 0.05 ? ", supporting dose-dependence" : ", not supporting dose-dependence";
    bullets.push(`Trend p = ${formatPValue(doseResponse.trend_p)}${trendNote}`);
  }

  // Mean change at highest dose
  if (statistics?.rows && statistics.rows.length >= 2) {
    const control = statistics.rows[0];
    const highest = statistics.rows[statistics.rows.length - 1];
    if (control.mean != null && highest.mean != null && control.mean !== 0) {
      const pct = ((highest.mean - control.mean) / Math.abs(control.mean)) * 100;
      const dir = pct > 0 ? "increased" : "decreased";
      bullets.push(`Mean ${dir} ${Math.abs(pct).toFixed(0)}% at highest dose vs control`);
    }
  }

  // No significance fallback
  if (statistics?.rows) {
    const anySig = statistics.rows.some((r) => r.p_value != null && r.p_value < 0.05);
    if (!anySig && bullets.length < 3) {
      bullets.push("No dose groups reached significance");
    }
  }

  // Cap at 8 bullets
  return bullets.slice(0, 8);
}

// ─── Component ─────────────────────────────────────────────

export function TreatmentRelatedSummaryPane({
  data,
  finding,
  analytics,
  noael,
  doseResponse,
  statistics,
  endpointSexes,
  notEvaluated,
}: Props) {
  const verdict = notEvaluated
    ? { icon: "\u2014", label: "Not evaluated", labelClass: "text-sm font-medium text-muted-foreground", severityLine: "Expert review pending", severityClass: "text-xs text-muted-foreground" }
    : computeVerdict(data, analytics, finding);
  const bullets = notEvaluated ? [] : buildEvidenceBullets(data, finding, analytics, doseResponse, statistics);

  // Key-value pairs
  const kvPairs: { key: string; value: string }[] = [];

  if (finding?.organ_system) {
    kvPairs.push({ key: "Target organ", value: titleCase(finding.organ_system) });
  }

  if (noael) {
    const noaelStr = noael.dose_value != null
      ? `${noael.dose_value} ${noael.dose_unit ?? "mg/kg"}`
      : "Not determined";
    kvPairs.push({ key: "NOAEL", value: noaelStr });
  }

  if (finding) {
    // Use endpoint-level aggregate sexes from shared selection context (not the single row's sex)
    const endpointLabel = finding.endpoint_label ?? finding.finding;
    const aggSexes = endpointSexes?.get(endpointLabel);
    let sexLabel: string;
    if (aggSexes && aggSexes.length >= 2) {
      sexLabel = "Both";
    } else if (aggSexes && aggSexes.length === 1) {
      sexLabel = aggSexes[0] === "M" ? "Males only" : aggSexes[0] === "F" ? "Females only" : "Both";
    } else {
      // Fallback to single finding's sex
      const sex = finding.sex;
      sexLabel = sex === "M" ? "Males only" : sex === "F" ? "Females only" : "Both";
    }
    kvPairs.push({ key: "Affected sexes", value: sexLabel });
  }

  if (doseResponse?.pattern && doseResponse.pattern !== "flat" && doseResponse.pattern !== "insufficient_data") {
    kvPairs.push({ key: "Pattern", value: getPatternLabel(doseResponse.pattern) });
  }

  if (analytics?.organCoherence && finding?.organ_system) {
    const coh = analytics.organCoherence.get(finding.organ_system);
    if (coh && coh.domainCount >= 2) {
      kvPairs.push({ key: "Coherence", value: `${coh.domainCount}-domain: ${coh.domains.join(", ")}` });
    }
  }

  if (analytics?.syndromes.length && finding) {
    const endpointLabel = (finding.endpoint_label ?? finding.finding).toLowerCase();
    const matched = analytics.syndromes.find((syn) =>
      syn.matchedEndpoints.some((m) => m.endpoint_label.toLowerCase() === endpointLabel)
    );
    if (matched) {
      kvPairs.push({ key: "Syndrome", value: matched.name });
    }
  }

  const confResult = buildConfidenceLabel(finding, analytics);
  if (confResult) {
    kvPairs.push({ key: "Confidence", value: confResult.confidence });
  }

  return (
    <div className="space-y-2">
      {/* Verdict row */}
      <div className="flex items-center gap-2 py-1">
        <span className="text-[14px]">{verdict.icon}</span>
        <span className={verdict.labelClass}>{verdict.label}</span>
      </div>
      <div className={verdict.severityClass}>{verdict.severityLine}</div>

      {/* Evidence block */}
      {bullets.length > 0 && (
        <div className="mt-2 rounded border border-border/50 bg-muted/20 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Evidence
          </div>
          <div className="mt-1.5 space-y-1">
            {bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs text-foreground/80">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
                <span>{b}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Key-value pairs */}
      {kvPairs.length > 0 && (
        <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          {kvPairs.map((kv, i) => (
            <div key={i} className="contents">
              <span className="whitespace-nowrap text-muted-foreground">{kv.key}</span>
              <span className="font-medium">{kv.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
