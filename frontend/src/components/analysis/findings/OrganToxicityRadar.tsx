/**
 * OrganToxicityRadar — ECharts radar chart showing organ-system-level
 * toxicity profile with dose-group overlay.
 *
 * Renders on the right side of the forest plot in grouped scope.
 * Spokes = organ systems. Value = max sigmoid-transformed |g| or |h|
 * across contributing endpoints per organ. Dose-group polygons overlay.
 *
 * Phase 3A of multi-endpoint investigation synthesis.
 */

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
// ECharts radar type not in base EChartsOption — use any for the option
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import type { EndpointSummary } from "@/lib/derive-summaries";
import { sigmoidTransform } from "@/lib/g-lower";

interface Props {
  /** All endpoint summaries for the study (not just the active group). */
  endpoints: EndpointSummary[];
  /** Organ systems to highlight (from active grouping). */
  highlightOrgans?: Set<string>;
}

// Signal color — warm brown/ochre, not reserved for any other encoding
const SIGNAL_COLOR = "#b45309"; // amber-700
const DOT_COLOR = "#78716c";    // stone-500

// Fixed physiological ordering (hepatic at 12 o'clock, clockwise)
const ORGAN_ORDER = [
  "hepatic",
  "renal",
  "hematologic",
  "cardiovascular",
  "respiratory",
  "endocrine",
  "reproductive",
  "gastrointestinal",
  "musculoskeletal",
  "nervous",
  "immune",
  "dermal",
  "electrolyte",
  "metabolic",
];

/** Short label for display on radar spokes. */
function organLabel(organ: string, count: number): string {
  const short: Record<string, string> = {
    hepatic: "Hepatic",
    renal: "Renal",
    hematologic: "Hemato",
    cardiovascular: "CV",
    respiratory: "Resp",
    endocrine: "Endo",
    reproductive: "Repro",
    gastrointestinal: "GI",
    musculoskeletal: "MSK",
    nervous: "Neuro",
    immune: "Immune",
    dermal: "Dermal",
    electrolyte: "Electro",
    metabolic: "Metab",
  };
  return `${short[organ] ?? organ} (${count})`;
}

/** True if this endpoint has incidence data. */
function isIncidence(ep: EndpointSummary): boolean {
  return ep.cohensH != null;
}

/** Unified raw effect size: |g| for continuous, |h| for incidence. */
function rawEffect(ep: EndpointSummary): number {
  if (isIncidence(ep)) return Math.abs(ep.cohensH ?? 0);
  return Math.abs(ep.maxEffectSize ?? 0);
}

export function OrganToxicityRadar({ endpoints, highlightOrgans }: Props) {
  const [showHelp, setShowHelp] = useState(false);

  // Aggregate: per organ system, compute max sigmoid-transformed effect size
  const { organData } = useMemo(() => {
    // Group endpoints by organ system
    const byOrgan = new Map<string, EndpointSummary[]>();
    for (const ep of endpoints) {
      if (!ep.treatmentRelated && ep.worstSeverity === "normal") continue; // skip clean endpoints
      const org = ep.organ_system;
      let arr = byOrgan.get(org);
      if (!arr) { arr = []; byOrgan.set(org, arr); }
      arr.push(ep);
    }

    // Filter to organs with signal, ordered by ORGAN_ORDER
    const ordered: string[] = [];
    for (const org of ORGAN_ORDER) {
      if (byOrgan.has(org)) ordered.push(org);
    }
    // Add any organs not in the fixed order
    for (const org of byOrgan.keys()) {
      if (!ordered.includes(org)) ordered.push(org);
    }

    // Per organ: max sigmoid(|g or h|), endpoint count, and individual endpoint values
    const data = ordered.map((org) => {
      const eps = byOrgan.get(org)!;
      const maxRaw = Math.max(...eps.map(rawEffect));
      return {
        organ: org,
        value: sigmoidTransform(maxRaw),
        rawMax: maxRaw,
        count: eps.length,
        // Individual endpoint values for dot distribution
        dots: eps.map((ep) => ({
          label: ep.endpoint_label,
          raw: rawEffect(ep),
          sigmoid: sigmoidTransform(rawEffect(ep)),
        })),
      };
    });

    return { organData: data };
  }, [endpoints]);

  // Build ECharts radar option
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option = useMemo<any>(() => {
    if (organData.length < 2) {
      // Degenerate: < 2 organs — show nothing (bar chart alternative would go here)
      return {};
    }

    const SCALE = 4.0; // sigmoid max
    const indicators = organData.map((d) => ({
      name: organLabel(d.organ, d.count),
      max: SCALE,
    }));

    // Single polygon: max effect per organ
    const values = organData.map((d) => d.value);

    // Highlight spokes for the active grouping
    const richStyles: Record<string, { color: string; fontWeight: string; fontSize: number }> = {};
    const nameFormatter = (name: string) => {
      // Check if this organ is highlighted
      const orgKey = organData.find((d) => organLabel(d.organ, d.count) === name)?.organ;
      if (orgKey && highlightOrgans?.has(orgKey)) {
        return `{highlight|${name}}`;
      }
      return `{normal|${name}}`;
    };
    richStyles.highlight = { color: "#111827", fontWeight: "bold", fontSize: 10 };
    richStyles.normal = { color: "#9ca3af", fontWeight: "normal", fontSize: 9 };

    // Signal polygon: max effect across all doses per organ

    // Individual endpoint dots: one radar data entry per endpoint per organ.
    // Each entry has all spokes = 0 except its organ spoke = sigmoid value.
    // This places dots along the spoke at their individual effect levels.
    const dotEntries: { value: number[]; name: string; raw: number }[] = [];
    for (let orgIdx = 0; orgIdx < organData.length; orgIdx++) {
      for (const dot of organData[orgIdx].dots) {
        const vals = new Array(organData.length).fill(0);
        vals[orgIdx] = dot.sigmoid;
        dotEntries.push({ value: vals, name: dot.label, raw: dot.raw });
      }
    }

    return {
      radar: {
        indicator: indicators,
        shape: "polygon",
        radius: "65%",
        axisName: {
          formatter: nameFormatter,
          rich: richStyles,
        },
        splitNumber: 1,
        splitArea: { show: false },
        splitLine: { lineStyle: { color: "#e5e7eb" } },
        axisLine: { lineStyle: { color: "#e5e7eb" } },
        // Reference ring at medium effect (0.5) — sigmoid(0.5) / SCALE = 0.333 / 4 = 8.33% of radius
        // Rendered via splitLine at the matching split level
      },
      series: [
        // Reference ring: medium effect threshold (0.5)
        {
          type: "radar",
          data: [
            {
              value: new Array(organData.length).fill(sigmoidTransform(0.5)),
              name: "Medium effect (0.5)",
              lineStyle: { color: "#d1d5db", width: 1, type: "dashed" },
              areaStyle: { opacity: 0 },
              itemStyle: { opacity: 0 },
              symbol: "none",
            },
          ],
          silent: true,
        },
        // Polygon: max effect envelope (silent — no tooltip on polygon vertices)
        {
          type: "radar",
          silent: true,
          data: [
            {
              value: values,
              name: "Max effect",
              lineStyle: { color: SIGNAL_COLOR, width: 2 },
              areaStyle: { color: SIGNAL_COLOR, opacity: 0.1 },
              itemStyle: { color: SIGNAL_COLOR },
              symbol: "none",
            },
          ],
        },
        // Dots: individual endpoints along spokes
        {
          type: "radar",
          data: dotEntries.map((d) => ({
            value: d.value,
            name: d.name,
            lineStyle: { width: 0, opacity: 0 },
            areaStyle: { opacity: 0 },
            itemStyle: { color: DOT_COLOR, opacity: 0.6 },
            symbol: "circle",
            symbolSize: 4,
          })),
        },
      ],
      tooltip: {
        trigger: "item",
        textStyle: { fontSize: 10 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        formatter: (params: any) => {
          if (params.seriesIndex !== 2) return "";
          const dot = dotEntries.find((d) => d.name === params.name);
          return dot ? `${dot.name}: ${dot.raw.toFixed(2)}` : params.name;
        },
      },
    };
  }, [organData, highlightOrgans]);

  if (organData.length < 2) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        <div>
          <div className="font-medium">Single organ system</div>
          <div className="mt-1 text-muted-foreground/60">Radar requires 2+ organ systems</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-border/50 px-3 py-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Organ profile
        </span>
        <div className="relative ml-auto">
          <Info
            className="h-3 w-3 cursor-help text-muted-foreground/50 hover:text-muted-foreground"
            onMouseEnter={() => setShowHelp(true)}
            onMouseLeave={() => setShowHelp(false)}
          />
          {showHelp && (
            <div className="absolute right-0 top-5 z-50 w-52 rounded border border-border bg-popover p-2 text-[10px] text-muted-foreground shadow-md">
              <p className="font-medium text-foreground">How to read this chart</p>
              <p className="mt-1">Each spoke = one organ system. Distance from center = max effect size across all endpoints for that organ.</p>
              <p className="mt-1">Larger polygon = stronger toxicity signal. Bold spoke labels = organs in the active group.</p>
              <p className="mt-1">Continuous endpoints use Hedges' g, incidence endpoints use Cohen's h -- both are standardized effect sizes on the same 0.2 (small) / 0.5 (medium) / 0.8 (large) scale, making them directly comparable.</p>
              <p className="mt-1">Values are sigmoid-compressed so extreme effects (g &gt; 3) don't dominate the chart.</p>
            </div>
          )}
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        {/* Legend — top left corner, single line */}
        <div className="absolute left-2 top-2 z-10 flex items-center gap-3 text-[9px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-2 w-3 rounded-sm" style={{ backgroundColor: SIGNAL_COLOR, opacity: 0.3 }} />
            <span>Max effect</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DOT_COLOR }} />
            <span>Endpoints</span>
          </div>
          <div className="flex items-center gap-1">
            <svg width={12} height={8}><line x1={0} y1={4} x2={12} y2={4} stroke="#9ca3af" strokeWidth={1} strokeDasharray="3,2" /></svg>
            <span>Medium effect (0.5)</span>
          </div>
        </div>
        <EChartsWrapper option={option} className="h-full w-full" />
      </div>
    </div>
  );
}
