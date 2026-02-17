/**
 * ECharts option builders for the Findings view.
 */

import type { EChartsOption } from "echarts";
import type { EndpointSummary } from "@/lib/derive-summaries";
import { getOrganColor, getDomainBadgeColor } from "@/lib/severity-colors";

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
}

export function prepareQuadrantPoints(endpoints: EndpointSummary[]): QuadrantPoint[] {
  return endpoints
    .filter((ep) => ep.maxEffectSize != null && ep.minPValue != null && ep.minPValue > 0)
    .map((ep) => ({
      endpoint_label: ep.endpoint_label,
      organ_system: ep.organ_system,
      domain: ep.domain,
      worstSeverity: ep.worstSeverity,
      treatmentRelated: ep.treatmentRelated,
      x: Math.abs(ep.maxEffectSize!),
      y: -Math.log10(ep.minPValue!),
      rawP: ep.minPValue!,
    }));
}

export function buildFindingsQuadrantOption(
  points: QuadrantPoint[],
  selectedEndpoint: string | null,
): EChartsOption {
  if (points.length === 0) return {};

  const maxX = Math.max(...points.map((p) => p.x)) * 1.1 || 2;
  const maxY = Math.max(...points.map((p) => p.y)) * 1.1 || 3;

  const data = points.map((pt) => {
    const isSelected = pt.endpoint_label === selectedEndpoint;
    const isAdverse = pt.worstSeverity === "adverse";
    return {
      value: [pt.x, pt.y],
      name: pt.endpoint_label,
      // Carry metadata for tooltip
      _meta: pt,
      symbolSize: isSelected ? 10 : isAdverse ? 6 : 5,
      itemStyle: {
        color: isSelected ? getOrganColor(pt.organ_system) : "#9CA3AF",
        opacity: isSelected ? 1 : isAdverse ? 0.65 : 0.5,
        borderColor: isSelected ? "#1F2937" : "transparent",
        borderWidth: isSelected ? 2 : 0,
      },
      emphasis: {
        symbolSize: 8,
        itemStyle: {
          opacity: 0.8,
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
      axisLabel: { fontSize: 9, color: "#9CA3AF" },
      splitLine: { lineStyle: { color: "#F3F4F6", type: "dashed" } },
      name: "|d|",
      nameLocation: "end",
      nameTextStyle: { fontSize: 9, color: "#9CA3AF" },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: maxY,
      axisLabel: { fontSize: 9, color: "#9CA3AF" },
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
        const meta = item.data._meta as QuadrantPoint;
        const domainColor = getDomainBadgeColor(meta.domain).text;
        const sevLabel = meta.worstSeverity === "adverse" ? "adverse" : meta.worstSeverity === "warning" ? "warning" : "normal";
        const trLabel = meta.treatmentRelated ? "TR" : "non-TR";
        return [
          `<div style="font-size:11px;font-weight:600">${meta.endpoint_label}</div>`,
          `<div style="font-size:10px;color:#9CA3AF"><span style="color:${domainColor}">${meta.domain}</span> \u00b7 ${meta.organ_system}</div>`,
          `<div style="display:flex;gap:12px;font-family:monospace;font-size:10px;margin-top:3px">`,
          `<span>|d|=${meta.x.toFixed(2)}</span>`,
          `<span>p=${meta.rawP.toExponential(1)}</span>`,
          `</div>`,
          `<div style="font-size:9px;color:#9CA3AF;margin-top:2px">${sevLabel} \u00b7 ${trLabel}</div>`,
        ].join("");
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
