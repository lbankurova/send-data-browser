import { useMemo, useCallback, useRef, useEffect } from "react";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import {
  prepareQuadrantPoints,
  buildFindingsQuadrantOption,
} from "@/components/analysis/charts/findings-charts";
import type { EndpointSummary, OrganCoherence } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";

export interface ScatterSelectedPoint {
  label: string;
  effectSize: number;
  rawP: number;
  domain: string;
}

interface FindingsQuadrantScatterProps {
  endpoints: EndpointSummary[];
  selectedEndpoint: string | null;
  onSelect: (label: string) => void;
  onExclude?: (label: string) => void;
  onSelectedPointChange?: (pt: ScatterSelectedPoint | null) => void;
  organCoherence?: Map<string, OrganCoherence>;
  syndromes?: CrossDomainSyndrome[];
  labMatches?: LabClinicalMatch[];
  scopeFilter?: string;
  effectSizeSymbol?: string;
}

export function FindingsQuadrantScatter({
  endpoints,
  selectedEndpoint,
  onSelect,
  onExclude,
  onSelectedPointChange,
  organCoherence,
  syndromes,
  labMatches,
  scopeFilter,
  effectSizeSymbol = "g",
}: FindingsQuadrantScatterProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);

  const points = useMemo(
    () => prepareQuadrantPoints(endpoints, organCoherence, syndromes, labMatches),
    [endpoints, organCoherence, syndromes, labMatches],
  );

  const option = useMemo(
    () => buildFindingsQuadrantOption(points, selectedEndpoint, scopeFilter, effectSizeSymbol),
    [points, selectedEndpoint, scopeFilter, effectSizeSymbol],
  );

  // Build syndrome member index for hover linking
  const syndromeMembers = useMemo(() => {
    const map = new Map<string, number[]>();
    for (let i = 0; i < points.length; i++) {
      const sid = points[i].syndromeId;
      if (sid) {
        let list = map.get(sid);
        if (!list) {
          list = [];
          map.set(sid, list);
        }
        list.push(i);
      }
    }
    return map;
  }, [points]);

  const handleClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (params: any) => {
      if (params?.data?._outOfScope) return; // ignore dimmed dots
      const label = params?.data?._meta?.endpoint_label;
      if (!label) return;
      // Ctrl+click → exclude endpoint from scatter
      if (params?.event?.event?.ctrlKey && onExclude) {
        onExclude(label);
        return;
      }
      onSelect(label);
    },
    [onSelect, onExclude],
  );

  // Syndrome hover linking: highlight all dots in the same syndrome
  const handleMouseOver = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (params: any) => {
      const chart = chartRef.current;
      if (!chart || !params?.data?._meta?.syndromeId) return;
      const members = syndromeMembers.get(params.data._meta.syndromeId);
      if (!members || members.length <= 1) return;
      for (const idx of members) {
        chart.dispatchAction({ type: "highlight", seriesIndex: 0, dataIndex: idx });
      }
    },
    [syndromeMembers],
  );

  const handleMouseOut = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (params: any) => {
      const chart = chartRef.current;
      if (!chart || !params?.data?._meta?.syndromeId) return;
      const members = syndromeMembers.get(params.data._meta.syndromeId);
      if (!members || members.length <= 1) return;
      for (const idx of members) {
        chart.dispatchAction({ type: "downplay", seriesIndex: 0, dataIndex: idx });
      }
    },
    [syndromeMembers],
  );

  // Selection summary — notify parent for section header
  const selectedPt = selectedEndpoint
    ? points.find((p) => p.endpoint_label === selectedEndpoint)
    : null;

  useEffect(() => {
    if (selectedPt) {
      onSelectedPointChange?.({
        label: selectedPt.endpoint_label,
        effectSize: selectedPt.x,
        rawP: selectedPt.rawP,
        domain: selectedPt.domain,
      });
    } else {
      onSelectedPointChange?.(null);
    }
  }, [selectedPt?.endpoint_label, selectedPt?.x, selectedPt?.rawP, onSelectedPointChange]); // eslint-disable-line react-hooks/exhaustive-deps

  // Legend: three independent encoding channels.
  //   Stroke → adverse = dark stroke, non-adverse = no stroke
  //   Shape  → clinical S2+ = diamond, everything else = circle
  //   Color  → NOAEL contribution (determining=rose, contributing=gray, supporting=outline)
  const legendEntries = useMemo(() => {
    const entries: { symbol: string; label: string; color?: string; stroke?: boolean }[] = [];
    // Stroke: adverse (no fill — stroke IS the encoding)
    if (points.some((p) => p.worstSeverity === "adverse"))
      entries.push({ symbol: "\u25CF", label: "adverse", stroke: true });
    // Shape: clinical (outline diamond — shape IS the encoding)
    if (points.some((p) => p.clinicalSeverity))
      entries.push({ symbol: "\u25C7", label: "clinical S2+" });
    // Color: NOAEL contribution
    if (points.some((p) => p.noaelWeight === 1.0))
      entries.push({ symbol: "\u25CF", label: "NOAEL determining", color: "rgba(248,113,113,0.7)" });
    if (points.some((p) => p.noaelWeight === 0.7))
      entries.push({ symbol: "\u25CF", label: "NOAEL contributing" });
    if (points.some((p) => p.noaelWeight === 0.3))
      entries.push({ symbol: "\u25CB", label: "NOAEL supporting" });
    return entries;
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
        No endpoints with both effect size and p-value
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header: legend only */}
      <div className="flex items-center justify-end px-2 pt-1 pb-3">
        <div className="flex items-center gap-2">
          {legendEntries.map((e, i) => (
            <span key={i} className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
              <span style={{
                color: e.stroke ? "transparent" : (e.color ?? "#9CA3AF"),
                ...(e.stroke ? { WebkitTextStroke: "1px #374151" } : {}),
              }}>{e.symbol}</span>{e.label}
            </span>
          ))}
        </div>
      </div>
      {/* Chart */}
      <EChartsWrapper
        option={option}
        onClick={handleClick}
        onMouseOver={handleMouseOver}
        onMouseOut={handleMouseOut}
        ref={chartRef}
        className="min-h-0 flex-1"
        style={{ width: "100%" }}
      />
    </div>
  );
}
