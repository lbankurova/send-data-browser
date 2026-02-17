import type { FindingContext, UnifiedFinding } from "@/types/analysis";
import type { FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import { titleCase, formatPValue, getEffectMagnitudeLabel } from "@/lib/severity-colors";
import { getPatternLabel } from "@/lib/findings-rail-engine";
import { resolveCanonical } from "@/lib/lab-clinical-catalog";

// ─── Types ─────────────────────────────────────────────────

interface Props {
  data: FindingContext["treatment_summary"];
  finding?: UnifiedFinding | null;
  analytics?: FindingsAnalytics;
  noael?: { dose_value: number | null; dose_unit: string | null } | null;
  doseResponse?: FindingContext["dose_response"];
  statistics?: FindingContext["statistics"];
}

// ─── Verdict logic ─────────────────────────────────────────

interface Verdict {
  icon: string;
  label: string;
  labelClass: string;
  severityLine: string;
  severityClass: string;
}

function computeVerdict(data: Props["data"]): Verdict {
  const tr = data.treatment_related;
  const sev = data.severity;

  if (tr && sev === "adverse") {
    return {
      icon: "\u26D4",
      label: "Treatment-related adverse effect",
      labelClass: "text-sm font-semibold text-foreground",
      severityLine: "Adverse — potential target organ toxicity",
      severityClass: "text-xs font-medium text-foreground",
    };
  }
  if (tr && sev === "warning") {
    return {
      icon: "\u26A0",
      label: "Treatment-related warning",
      labelClass: "text-sm font-semibold text-foreground",
      severityLine: "Warning — statistically significant, monitor closely",
      severityClass: "text-xs font-medium text-muted-foreground",
    };
  }
  if (tr) {
    return {
      icon: "\u26A0",
      label: "Treatment-related finding",
      labelClass: "text-sm font-medium text-foreground",
      severityLine: "Normal variation within expected range",
      severityClass: "text-xs text-muted-foreground",
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

// ─── Evidence bullet generation ────────────────────────────

function buildEvidenceBullets(
  _data: Props["data"],
  finding: UnifiedFinding | null | undefined,
  analytics: FindingsAnalytics | undefined,
  doseResponse: FindingContext["dose_response"] | undefined,
  statistics: FindingContext["statistics"] | undefined,
): string[] {
  const bullets: string[] = [];

  // Tier 2: Clinical lab matches
  if (analytics?.labMatches.length) {
    const endpointLabel = finding?.endpoint_label ?? finding?.finding;
    if (endpointLabel) {
      const canonical = resolveCanonical(endpointLabel);
      for (const match of analytics.labMatches) {
        if (canonical && match.matchedEndpoints.some((e) => resolveCanonical(e) === canonical)) {
          bullets.push(`${match.severityLabel}: ${match.ruleName}`);
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
}: Props) {
  const verdict = computeVerdict(data);
  const bullets = buildEvidenceBullets(data, finding, analytics, doseResponse, statistics);

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

  if (finding?.sex) {
    kvPairs.push({ key: "Affected sexes", value: finding.sex === "M" ? "Males" : finding.sex === "F" ? "Females" : "Both sexes" });
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
