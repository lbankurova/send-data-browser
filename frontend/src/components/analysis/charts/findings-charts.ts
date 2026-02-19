/**
 * ECharts option builders for the Findings view.
 */

import type { EChartsOption } from "echarts";
import type { EndpointSummary, OrganCoherence, NoaelTier } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import { resolveCanonical } from "@/lib/lab-clinical-catalog";


/** Hex domain color for use in tooltip HTML (not Tailwind classes). */
function getDomainHexColor(domain: string): string {
  switch (domain.toUpperCase()) {
    case "LB": return "#1D4ED8"; // blue-700
    case "BW": return "#047857"; // emerald-700
    case "OM": return "#7E22CE"; // purple-700
    case "MI": return "#BE123C"; // rose-700
    case "MA": return "#C2410C"; // orange-700
    case "CL": return "#0E7490"; // cyan-700
    default:   return "#6B7280"; // gray-500
  }
}

// ─── Quadrant Scatter ──────────────────────────────────────

export interface QuadrantPoint {
  endpoint_label: string;
  organ_system: string;
  domain: string;
  worstSeverity: "adverse" | "warning" | "normal";
  treatmentRelated: boolean;
  x: number;  // |effect size|
  y: number;  // -log10(p)
  rawP: number;
  coherenceSize?: number;       // 7 for 3+ domain organs
  syndromeId?: string;          // syndrome ID if endpoint is matched
  syndromeName?: string;        // for tooltip line
  clinicalSeverity?: string;    // "S2" | "S3" | "S4" → diamond shape
  clinicalRuleId?: string;      // e.g. "L02"
  clinicalSeverityLabel?: string; // e.g. "Adverse"
  clinicalFoldChange?: number;  // e.g. 4.2
  noaelTier?: NoaelTier;
  noaelDoseValue?: number | null;
  noaelDoseUnit?: string | null;
  hasEarlyDeathExclusion?: boolean;
}

export function prepareQuadrantPoints(
  endpoints: EndpointSummary[],
  organCoherence?: Map<string, OrganCoherence>,
  syndromes?: CrossDomainSyndrome[],
  labMatches?: LabClinicalMatch[],
): QuadrantPoint[] {
  // Index syndrome endpoint labels -> syndrome
  const syndromeIndex = new Map<string, { id: string; name: string }>();
  if (syndromes) {
    for (const syn of syndromes) {
      for (const m of syn.matchedEndpoints) {
        syndromeIndex.set(m.endpoint_label.toLowerCase(), { id: syn.id, name: syn.name });
      }
    }
  }

  // Index lab match endpoint labels -> worst severity + rule metadata
  // Build testCode lookup from endpoints for resolveCanonical Priority 1
  const testCodeByLabel = new Map<string, string>();
  for (const ep of endpoints) {
    if (ep.testCode) testCodeByLabel.set(ep.endpoint_label.toLowerCase(), ep.testCode);
  }
  const clinicalIndex = new Map<string, {
    severity: string;
    ruleId: string;
    severityLabel: string;
    foldChange: number | undefined;
  }>();
  if (labMatches) {
    const sevOrder: Record<string, number> = { S4: 4, S3: 3, S2: 2, S1: 1 };
    for (const match of labMatches) {
      if (sevOrder[match.severity] >= 2) { // S2+ get diamond (matches rail badge threshold)
        for (const epLabel of match.matchedEndpoints) {
          const tc = testCodeByLabel.get(epLabel.toLowerCase());
          const canonical = resolveCanonical(epLabel, tc);
          if (canonical) {
            const existing = clinicalIndex.get(epLabel.toLowerCase());
            if (!existing || sevOrder[match.severity] > sevOrder[existing.severity]) {
              // Get fold change for this specific endpoint's canonical
              const fc = match.foldChanges[canonical];
              clinicalIndex.set(epLabel.toLowerCase(), {
                severity: match.severity,
                ruleId: match.ruleId,
                severityLabel: match.severityLabel,
                foldChange: fc,
              });
            }
          }
        }
      }
    }
  }

  return endpoints
    .filter((ep) => ep.maxEffectSize != null && ep.minPValue != null)
    .map((ep) => {
      const coh = organCoherence?.get(ep.organ_system);
      const syn = syndromeIndex.get(ep.endpoint_label.toLowerCase());
      const clinical = clinicalIndex.get(ep.endpoint_label.toLowerCase());
      // Clamp p=0 to 1e-300 to avoid -log10(0)=Infinity
      const safeP = Math.max(ep.minPValue!, 1e-300);

      return {
        endpoint_label: ep.endpoint_label,
        organ_system: ep.organ_system,
        domain: ep.domain,
        worstSeverity: ep.worstSeverity,
        treatmentRelated: ep.treatmentRelated,
        x: Math.abs(ep.maxEffectSize!),
        y: -Math.log10(safeP),
        rawP: ep.minPValue!,
        coherenceSize: coh && coh.domainCount >= 3 ? 7 : undefined,
        syndromeId: syn?.id,
        syndromeName: syn?.name,
        clinicalSeverity: clinical?.severity,
        clinicalRuleId: clinical?.ruleId,
        clinicalSeverityLabel: clinical?.severityLabel,
        clinicalFoldChange: clinical?.foldChange,
        noaelTier: ep.noaelTier,
        noaelDoseValue: ep.noaelDoseValue,
        noaelDoseUnit: ep.noaelDoseUnit,
        hasEarlyDeathExclusion: ep.hasEarlyDeathExclusion,
      };
    });
}

export function buildFindingsQuadrantOption(
  points: QuadrantPoint[],
  selectedEndpoint: string | null,
  scopeFilter?: string,
): EChartsOption {
  if (points.length === 0) return {};

  const maxX = Math.max(...points.map((p) => p.x)) * 1.1 || 2;
  const maxY = Math.max(...points.map((p) => p.y)) * 1.1 || 3;

  const data = points.map((pt) => {
    const isSelected = pt.endpoint_label === selectedEndpoint;
    const isAdverse = pt.worstSeverity === "adverse";
    const isClinical = pt.clinicalSeverity === "S2" || pt.clinicalSeverity === "S3" || pt.clinicalSeverity === "S4";
    const hasExclusion = pt.hasEarlyDeathExclusion === true;
    const isOutOfScope = scopeFilter != null &&
      pt.organ_system !== scopeFilter &&
      pt.domain !== scopeFilter &&
      (pt as QuadrantPoint).endpoint_label !== scopeFilter;

    // Symbol size: selected > clinical > coherence > adverse > default
    let symbolSize = 5;
    if (isAdverse) symbolSize = 6;
    if (pt.coherenceSize) symbolSize = 7;
    if (isClinical) symbolSize = 7;
    if (isSelected) symbolSize = 10;

    // Symbol shape: clinical S2+ get diamond (persists in all states)
    const symbol = isClinical ? "diamond" : "circle";

    // NOAEL tint: warm rose for low-NOAEL dots (below-lowest or at-lowest)
    const isLowNoael = pt.noaelTier === "below-lowest" || pt.noaelTier === "at-lowest";

    // Opacity: clinical 0.75, coherent 0.65, adverse 0.65, default 0.5
    let opacity = isSelected ? 1 : isClinical ? 0.75 : (pt.coherenceSize || isAdverse) ? 0.65 : 0.5;
    if (isOutOfScope) opacity = 0.15;

    // Dot color: low NOAEL → warm rose, clinical → dark gray, default → gray
    let dotColor: string;
    if (isLowNoael) {
      dotColor = pt.noaelTier === "below-lowest"
        ? "rgba(248,113,113,0.6)"
        : "rgba(248,113,113,0.4)";
    } else if (isClinical) {
      dotColor = "#6B7280";
    } else {
      dotColor = "#9CA3AF";
    }

    return {
      value: [pt.x, pt.y],
      name: pt.endpoint_label,
      _meta: pt,
      _outOfScope: isOutOfScope,
      symbolSize,
      symbol,
      itemStyle: {
        color: dotColor,
        opacity,
        borderColor: isSelected ? "#1F2937" : isClinical ? "#6B7280" : hasExclusion ? "#9CA3AF" : "transparent",
        borderWidth: isSelected ? 2 : isClinical ? 1 : hasExclusion ? 1 : 0,
        borderType: hasExclusion && !isSelected && !isClinical ? "dashed" as const : "solid" as const,
      },
      emphasis: isOutOfScope
        ? { disabled: true }
        : {
            symbolSize: 8,
            itemStyle: {
              opacity: 0.8,
              borderColor: "#6B7280",
              borderWidth: 1,
            },
          },
    };
  });

  return {
    grid: { left: 36, right: 12, top: 8, bottom: 24 },
    xAxis: {
      type: "value",
      min: 0,
      max: maxX,
      axisLabel: { fontSize: 9, color: "#9CA3AF", formatter: (v: number) => v.toFixed(2) },
      splitLine: { lineStyle: { color: "#F3F4F6", type: "dashed" } },
      name: "|d|",
      nameLocation: "end",
      nameTextStyle: { fontSize: 9, color: "#9CA3AF" },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: maxY,
      axisLabel: { fontSize: 9, color: "#9CA3AF", formatter: (v: number) => v.toFixed(2) },
      splitLine: { lineStyle: { color: "#F3F4F6", type: "dashed" } },
      name: "-log\u2081\u2080(p)",
      nameLocation: "end",
      nameTextStyle: { fontSize: 9, color: "#9CA3AF" },
    },
    tooltip: {
      trigger: "item",
      textStyle: { fontSize: 10 },
      backgroundColor: "rgba(255,255,255,0.96)",
      borderColor: "#e5e7eb",
      borderWidth: 1,
      formatter(params: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const item = params as any;
        if (!item?.data?._meta) return "";
        if (item.data._outOfScope) return "";
        const meta = item.data._meta as QuadrantPoint;
        const domainColor = getDomainHexColor(meta.domain);
        const sevLabel = meta.worstSeverity === "adverse" ? "adverse" : meta.worstSeverity === "warning" ? "warning" : "normal";
        const trLabel = meta.treatmentRelated ? "TR" : "non-TR";
        const lines = [
          `<div style="font-size:11px;font-weight:600">${meta.endpoint_label}</div>`,
          `<div style="font-size:10px;color:#9CA3AF"><span style="color:${domainColor}">${meta.domain}</span> \u00b7 ${meta.organ_system}</div>`,
          `<div style="display:flex;gap:12px;font-family:monospace;font-size:10px;margin-top:3px">`,
          `<span>|d|=${meta.x.toFixed(2)}</span>`,
          `<span>p=${meta.rawP.toExponential(1)}</span>`,
          `</div>`,
          `<div style="font-size:9px;color:#9CA3AF;margin-top:2px">${sevLabel} \u00b7 ${trLabel}</div>`,
        ];
        if (meta.clinicalSeverity && meta.clinicalRuleId) {
          lines.push(`<div style="font-size:10px;margin-top:3px;font-weight:500">${meta.clinicalSeverity} ${meta.clinicalSeverityLabel ?? ""} \u00b7 Rule ${meta.clinicalRuleId}</div>`);
          if (meta.clinicalFoldChange != null) {
            lines.push(`<div style="font-size:9px;color:#6B7280">${meta.clinicalFoldChange.toFixed(1)}\u00d7 concurrent control</div>`);
          }
        }
        if (meta.syndromeName) {
          lines.push(`<div style="font-size:9px;margin-top:2px">\uD83D\uDD17 ${meta.syndromeName} syndrome</div>`);
        }
        if (meta.hasEarlyDeathExclusion) {
          lines.push(`<div style="font-size:9px;margin-top:2px;color:#6B7280">Early deaths excluded from stats</div>`);
        }
        // NOAEL line
        if (meta.noaelTier === "below-lowest") {
          const doseLabel = meta.noaelDoseValue != null ? `${meta.noaelDoseValue} ${meta.noaelDoseUnit ?? ""}`.trim() : "lowest dose";
          lines.push(`<div style="font-size:9px;margin-top:2px;color:#DC2626">NOAEL &lt; ${doseLabel}</div>`);
        } else if (meta.noaelTier === "at-lowest" || meta.noaelTier === "mid" || meta.noaelTier === "high") {
          const doseLabel = meta.noaelDoseValue != null ? `${meta.noaelDoseValue} ${meta.noaelDoseUnit ?? ""}`.trim() : "—";
          lines.push(`<div style="font-size:9px;margin-top:2px${meta.noaelTier === "at-lowest" ? ";color:#DC2626" : ""}">NOAEL ${doseLabel}</div>`);
        } else {
          lines.push(`<div style="font-size:9px;margin-top:2px;color:#9CA3AF">NOAEL n/a</div>`);
        }
        return lines.join("");
      },
    },
    series: [
      {
        type: "scatter",
        data,
        markLine: {
          silent: true,
          symbol: "none",
          data: [
            {
              yAxis: -Math.log10(0.05),
              lineStyle: { color: "#D1D5DB", type: "dashed", width: 1 },
              label: {
                formatter: "p=0.05",
                position: "insideEndTop",
                fontSize: 8,
                color: "#9CA3AF",
              },
            },
            {
              xAxis: 0.8,
              lineStyle: { color: "#9CA3AF", type: "dashed", width: 1 },
              label: {
                formatter: "|d|=0.8",
                position: "end",
                fontSize: 8,
                color: "#6B7280",
              },
            },
          ],
        },
      },
    ],
    animation: true,
    animationDuration: 200,
  };
}
