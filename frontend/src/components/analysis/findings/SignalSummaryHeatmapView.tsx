import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
// getNeutralHeatColor thresholds are used inline in buildHeatmapOption
import type { EChartsOption } from "echarts";
import type { SignalSummaryRow } from "@/types/analysis-views";

export interface HeatmapSelection {
  endpoint_label: string;
  dose_label: string;
}

// ─── Heatmap option builder ──────────────────────────────────

function buildHeatmapOption(
  rows: SignalSummaryRow[],
  sexFilter: string | null,
): EChartsOption {
  // Filter by sex
  const filtered = sexFilter ? rows.filter((r) => r.sex === sexFilter) : rows;

  // Aggregate: for each (endpoint, dose_label), take max signal_score
  const agg = new Map<string, Map<string, number>>();
  const doseSet = new Set<string>();
  for (const r of filtered) {
    doseSet.add(r.dose_label);
    let endpointMap = agg.get(r.endpoint_label);
    if (!endpointMap) {
      endpointMap = new Map();
      agg.set(r.endpoint_label, endpointMap);
    }
    const cur = endpointMap.get(r.dose_label) ?? 0;
    if (r.signal_score > cur) endpointMap.set(r.dose_label, r.signal_score);
  }

  // Sort dose groups by dose_level (parse from first row with that label)
  const doseLevelMap = new Map<string, number>();
  for (const r of filtered) {
    if (!doseLevelMap.has(r.dose_label)) {
      doseLevelMap.set(r.dose_label, r.dose_level);
    }
  }
  const doseLabels = [...doseSet].sort((a, b) => (doseLevelMap.get(a) ?? 0) - (doseLevelMap.get(b) ?? 0));

  // Sort endpoints by max signal score descending
  const endpointMaxScores: [string, number][] = [];
  for (const [ep, doseMap] of agg) {
    let maxScore = 0;
    for (const s of doseMap.values()) {
      if (s > maxScore) maxScore = s;
    }
    endpointMaxScores.push([ep, maxScore]);
  }
  endpointMaxScores.sort((a, b) => a[1] - b[1]); // ascending for Y axis (bottom = low)
  const endpointLabels = endpointMaxScores.map(([ep]) => ep);

  // Build heatmap data: [xIndex, yIndex, value]
  const data: [number, number, number][] = [];
  for (const [ep, doseMap] of agg) {
    const yIdx = endpointLabels.indexOf(ep);
    for (const [dl, score] of doseMap) {
      const xIdx = doseLabels.indexOf(dl);
      if (xIdx >= 0 && yIdx >= 0) {
        data.push([xIdx, yIdx, +score.toFixed(3)]);
      }
    }
  }

  // Build visualMap pieces from getNeutralHeatColor thresholds
  const pieces = [
    { lte: 0, color: "rgba(0,0,0,0.02)", label: "0" },
    { gt: 0, lte: 0.2, color: "#E5E7EB", label: "0-0.2" },
    { gt: 0.2, lte: 0.4, color: "#D1D5DB", label: "0.2-0.4" },
    { gt: 0.4, lte: 0.6, color: "#9CA3AF", label: "0.4-0.6" },
    { gt: 0.6, lte: 0.8, color: "#6B7280", label: "0.6-0.8" },
    { gt: 0.8, color: "#4B5563", label: "0.8+" },
  ];

  // Dynamic grid sizing
  const leftMargin = Math.min(200, Math.max(80, endpointLabels.reduce((mx, l) => Math.max(mx, l.length * 5.5), 0)));

  return {
    grid: {
      left: leftMargin,
      right: 30,
      top: 10,
      bottom: 80,
    },
    xAxis: {
      type: "category",
      data: doseLabels,
      splitArea: { show: true },
      axisLabel: { fontSize: 10, rotate: 30 },
    },
    yAxis: {
      type: "category",
      data: endpointLabels,
      axisLabel: {
        fontSize: 9,
        width: leftMargin - 10,
        overflow: "truncate",
      },
      splitArea: { show: true },
    },
    visualMap: {
      type: "piecewise",
      pieces,
      orient: "horizontal",
      bottom: 5,
      left: "center",
      itemWidth: 14,
      itemHeight: 14,
      textStyle: { fontSize: 9 },
    },
    tooltip: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      formatter: (params: any) => {
        const d = params.data as [number, number, number] | undefined;
        if (!d) return "";
        const ep = endpointLabels[d[1]] ?? "";
        const dose = doseLabels[d[0]] ?? "";
        return `<b>${ep}</b><br/>Dose: ${dose}<br/>Score: ${d[2].toFixed(3)}`;
      },
      textStyle: { fontSize: 11 },
    },
    series: [{
      type: "heatmap",
      data,
      emphasis: {
        itemStyle: { borderColor: "#000", borderWidth: 1 },
      },
    }],
  };
}

// ─── Main ────────────────────────────────────────────────────

export function SignalSummaryHeatmapView({
  onSelectionChange,
}: {
  onSelectionChange?: (sel: HeatmapSelection | null) => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: signalData, isLoading, error } = useStudySignalSummary(studyId);
  const [sexFilter, setSexFilter] = useState<string | null>(null);

  const option = useMemo(() => {
    if (!signalData) return null;
    return buildHeatmapOption(signalData, sexFilter);
  }, [signalData, sexFilter]);

  // Unique sexes for filter
  const sexes = useMemo(() => {
    if (!signalData) return [];
    return [...new Set(signalData.map((r: SignalSummaryRow) => r.sex))].sort();
  }, [signalData]);

  // Heatmap height based on endpoint count
  const chartHeight = useMemo(() => {
    if (!signalData) return 400;
    const filtered = sexFilter ? signalData.filter((r: SignalSummaryRow) => r.sex === sexFilter) : signalData;
    const endpoints = new Set(filtered.map((r: SignalSummaryRow) => r.endpoint_label));
    return Math.max(400, endpoints.size * 18 + 100);
  }, [signalData, sexFilter]);

  const handleClick = useMemo(() => {
    if (!onSelectionChange) return undefined;
    return (params: Record<string, unknown>) => {
      const data = params.data as [number, number, number] | undefined;
      if (!data || !signalData) return;
      // Reconstruct labels
      const filtered = sexFilter ? signalData.filter((r: SignalSummaryRow) => r.sex === sexFilter) : signalData;
      const doseSet = new Set<string>();
      const endpointMaxScores = new Map<string, number>();
      for (const r of filtered) {
        doseSet.add(r.dose_label);
        const cur = endpointMaxScores.get(r.endpoint_label) ?? 0;
        if (r.signal_score > cur) endpointMaxScores.set(r.endpoint_label, r.signal_score);
      }
      const doseLevelMap = new Map<string, number>();
      for (const r of filtered) {
        if (!doseLevelMap.has(r.dose_label)) doseLevelMap.set(r.dose_label, r.dose_level);
      }
      const doseLabels = [...doseSet].sort((a, b) => (doseLevelMap.get(a) ?? 0) - (doseLevelMap.get(b) ?? 0));
      const endpointLabels = [...endpointMaxScores.entries()]
        .sort((a, b) => a[1] - b[1])
        .map(([ep]) => ep);

      onSelectionChange({
        endpoint_label: endpointLabels[data[1]] ?? "",
        dose_label: doseLabels[data[0]] ?? "",
      });
    };
  }, [onSelectionChange, signalData, sexFilter]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-red-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-red-700">Analysis data not available</h1>
          <p className="text-sm text-red-600">Run the generator to produce analysis data:</p>
          <code className="mt-2 block rounded bg-red-100 px-3 py-1.5 text-xs text-red-800">
            cd backend && python -m generator.generate {studyId}
          </code>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading heatmap data...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b bg-muted/30 px-4 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Signal heatmap
        </span>
        <select
          className="rounded border bg-background px-2 py-1 text-xs"
          value={sexFilter ?? ""}
          onChange={(e) => setSexFilter(e.target.value || null)}
        >
          <option value="">All sexes</option>
          {sexes.map((s) => (
            <option key={s} value={s}>{s === "M" ? "Male" : s === "F" ? "Female" : s}</option>
          ))}
        </select>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {signalData?.length ?? 0} signal rows
        </span>
      </div>

      {/* Heatmap */}
      <div className="flex-1 overflow-auto">
        {option && (
          <EChartsWrapper
            option={option}
            style={{ width: "100%", height: chartHeight }}
            onClick={handleClick}
          />
        )}
      </div>
    </div>
  );
}
