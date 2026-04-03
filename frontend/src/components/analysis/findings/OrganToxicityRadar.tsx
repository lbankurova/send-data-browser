/**
 * OrganToxicityRadar — ECharts radar chart showing organ-system-level
 * toxicity profile. Toggle between two modes:
 *
 *   Evidence (default, scale 10): statistical + pattern + syndrome evidence,
 *   independent of severity/TR classification and clinical tier.
 *
 *   Signal (scale 16): full composite signal score including base constants.
 *   Same ranking as the findings rail, visualized spatially.
 */

import { useMemo, useState } from "react";
import { Info } from "lucide-react";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import type { EndpointSummary } from "@/lib/derive-summaries";

type RadarMode = "evidence" | "signal";

interface Props {
  endpoints: EndpointSummary[];
  signalScores: Map<string, number>;
  evidenceScores: Map<string, number>;
  highlightOrgans?: Set<string>;
}

// Signal color — warm brown/ochre, not reserved for any other encoding
const SIGNAL_COLOR = "#b45309"; // amber-700
const DOT_COLOR = "#78716c";    // stone-500

const SCALE: Record<RadarMode, number> = { evidence: 10, signal: 16 };

// Fixed physiological ordering (hepatic at 12 o'clock, clockwise)
const ORGAN_ORDER = [
  "hepatic", "renal", "hematologic", "cardiovascular", "respiratory",
  "endocrine", "reproductive", "gastrointestinal", "musculoskeletal",
  "nervous", "neurological", "immune", "dermal", "integumentary",
  "electrolyte", "metabolic", "ocular", "general",
];

const ORGAN_SHORT: Record<string, string> = {
  hepatic: "Hepatic", renal: "Renal", hematologic: "Hemato",
  cardiovascular: "CV", respiratory: "Resp", endocrine: "Endo",
  reproductive: "Repro", gastrointestinal: "GI", musculoskeletal: "MSK",
  nervous: "Neuro", neurological: "Neuro", immune: "Immune",
  dermal: "Dermal", integumentary: "Integ", electrolyte: "Electro",
  metabolic: "Metab", ocular: "Ocular", general: "General",
};

function organLabel(organ: string, count: number): string {
  return `${ORGAN_SHORT[organ] ?? organ} (${count})`;
}

export function OrganToxicityRadar({ endpoints, signalScores, evidenceScores, highlightOrgans }: Props) {
  const [showHelp, setShowHelp] = useState(false);
  const [mode, setMode] = useState<RadarMode>("evidence");

  const scale = SCALE[mode];
  const scoreMap = mode === "evidence" ? evidenceScores : signalScores;

  // Per organ: max score, endpoint count, individual dots
  const organData = useMemo(() => {
    const byOrgan = new Map<string, EndpointSummary[]>();
    for (const ep of endpoints) {
      if (!ep.treatmentRelated && ep.worstSeverity === "normal") continue;
      const org = ep.organ_system;
      let arr = byOrgan.get(org);
      if (!arr) { arr = []; byOrgan.set(org, arr); }
      arr.push(ep);
    }

    const ordered: string[] = [];
    for (const org of ORGAN_ORDER) {
      if (byOrgan.has(org)) ordered.push(org);
    }
    for (const org of byOrgan.keys()) {
      if (!ordered.includes(org)) ordered.push(org);
    }

    return ordered.map((org) => {
      const eps = byOrgan.get(org)!;
      let maxVal = 0;
      const dots: { label: string; value: number }[] = [];
      for (const ep of eps) {
        const v = Math.min(scoreMap.get(ep.endpoint_label) ?? 0, scale);
        if (v > maxVal) maxVal = v;
        dots.push({ label: ep.endpoint_label, value: v });
      }
      return { organ: org, value: maxVal, count: eps.length, dots };
    });
  }, [endpoints, scoreMap, scale]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const option = useMemo<any>(() => {
    if (organData.length < 2) return {};

    const indicators = organData.map((d) => ({
      name: organLabel(d.organ, d.count),
      max: scale,
    }));

    const values = organData.map((d) => d.value);

    // Highlight spokes
    const richStyles: Record<string, { color: string; fontWeight: string; fontSize: number }> = {};
    const nameFormatter = (name: string) => {
      const orgKey = organData.find((d) => organLabel(d.organ, d.count) === name)?.organ;
      return orgKey && highlightOrgans?.has(orgKey) ? `{highlight|${name}}` : `{normal|${name}}`;
    };
    richStyles.highlight = { color: "#111827", fontWeight: "bold", fontSize: 10 };
    richStyles.normal = { color: "#9ca3af", fontWeight: "normal", fontSize: 9 };

    // Endpoint dots
    const dotEntries: { value: number[]; name: string; score: number }[] = [];
    for (let i = 0; i < organData.length; i++) {
      for (const dot of organData[i].dots) {
        const vals = new Array(organData.length).fill(0);
        vals[i] = dot.value;
        dotEntries.push({ value: vals, name: dot.label, score: dot.value });
      }
    }

    return {
      radar: {
        indicator: indicators,
        shape: "polygon",
        radius: "65%",
        axisName: { formatter: nameFormatter, rich: richStyles },
        splitNumber: 1,
        splitArea: { show: false },
        splitLine: { lineStyle: { color: "#e5e7eb" } },
        axisLine: { lineStyle: { color: "#e5e7eb" } },
      },
      series: [
        // Polygon: max score envelope
        {
          type: "radar",
          silent: true,
          data: [{
            value: values,
            name: "Max",
            lineStyle: { color: SIGNAL_COLOR, width: 2 },
            areaStyle: { color: SIGNAL_COLOR, opacity: 0.1 },
            itemStyle: { color: SIGNAL_COLOR },
            symbol: "none",
          }],
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
          if (params.seriesIndex !== 1) return "";
          const dot = dotEntries.find((d) => d.name === params.name);
          return dot ? `${dot.name}: ${dot.score.toFixed(1)}` : params.name;
        },
      },
    };
  }, [organData, highlightOrgans, scale]);

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
        {/* Mode toggle */}
        <div className="ml-2 flex items-center rounded-sm bg-muted/40 p-0.5 text-[9px]">
          <button
            className={`rounded-sm px-1.5 py-0.5 font-medium transition-colors ${mode === "evidence" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMode("evidence")}
          >
            Evidence
          </button>
          <button
            className={`rounded-sm px-1.5 py-0.5 font-medium transition-colors ${mode === "signal" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setMode("signal")}
          >
            Signal
          </button>
        </div>
        <div className="relative ml-auto">
          <Info
            className="h-3 w-3 cursor-help text-muted-foreground/50 hover:text-muted-foreground"
            onMouseEnter={() => setShowHelp(true)}
            onMouseLeave={() => setShowHelp(false)}
          />
          {showHelp && (
            <div className="absolute right-0 top-5 z-50 w-56 rounded border border-border bg-popover p-2 text-[10px] text-muted-foreground shadow-md">
              <p className="font-medium text-foreground">How to read this chart</p>
              <p className="mt-1">Each spoke = one organ system. Distance from center = highest-scoring endpoint in that organ. Scale: 0-{scale}.</p>
              {mode === "evidence" ? (
                <p className="mt-1"><span className="font-medium">Evidence (0-10):</span> statistical effect size, LOO stability, dose-response pattern, syndrome membership, and confidence. Independent of severity/TR classification and clinical tier.</p>
              ) : (
                <p className="mt-1"><span className="font-medium">Signal (0-16):</span> full composite score including severity, treatment-relatedness, clinical tier, and all boosts. Same ranking as the findings rail.</p>
              )}
              <p className="mt-1">Bold spoke labels = organs in the active group.</p>
            </div>
          )}
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        {/* Legend */}
        <div className="absolute left-2 top-2 z-10 flex items-center gap-3 text-[9px] text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="h-2 w-3 rounded-sm" style={{ backgroundColor: SIGNAL_COLOR, opacity: 0.3 }} />
            <span>Max {mode}</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: DOT_COLOR }} />
            <span>Endpoints</span>
          </div>
        </div>
        <EChartsWrapper option={option} className="h-full w-full" />
      </div>
    </div>
  );
}
