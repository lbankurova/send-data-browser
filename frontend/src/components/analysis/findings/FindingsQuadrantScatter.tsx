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
  /** Total endpoint count before scatter exclusions (for N/M display). */
  totalEndpoints: number;
  selectedEndpoint: string | null;
  onSelect: (label: string) => void;
  onExclude?: (label: string) => void;
  onSelectedPointChange?: (pt: ScatterSelectedPoint | null) => void;
  organCoherence?: Map<string, OrganCoherence>;
  syndromes?: CrossDomainSyndrome[];
  labMatches?: LabClinicalMatch[];
  scopeFilter?: string;
}

export function FindingsQuadrantScatter({
  endpoints,
  totalEndpoints,
  selectedEndpoint,
  onSelect,
  onExclude,
  onSelectedPointChange,
  organCoherence,
  syndromes,
  labMatches,
  scopeFilter,
}: FindingsQuadrantScatterProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);

  const points = useMemo(
    () => prepareQuadrantPoints(endpoints, organCoherence, syndromes, labMatches),
    [endpoints, organCoherence, syndromes, labMatches],
  );

  const option = useMemo(
    () => buildFindingsQuadrantOption(points, selectedEndpoint, scopeFilter),
    [points, selectedEndpoint, scopeFilter],
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

  // Legend entries — only show visually distinct categories present in data
  // At rest: all dots are gray. Differences are size + shape only.
  const legendEntries = useMemo(() => {
    const entries: { symbol: string; label: string; color?: string }[] = [];
    // Small dot = warning/normal (size 5)
    if (points.some((p) => p.worstSeverity !== "adverse" && !(p.clinicalSeverity === "S3" || p.clinicalSeverity === "S4")))
      entries.push({ symbol: "\u2022", label: "warning/normal" });
    // Larger dot = adverse (size 6)
    if (points.some((p) => p.worstSeverity === "adverse"))
      entries.push({ symbol: "\u25CF", label: "adverse" });
    // Diamond = clinical S3/S4, darker gray
    if (points.some((p) => p.clinicalSeverity === "S3" || p.clinicalSeverity === "S4"))
      entries.push({ symbol: "\u25C6", label: "clinical S3+", color: "#6B7280" });
    // Warm rose dot = low NOAEL (below-lowest or at-lowest)
    if (points.some((p) => p.noaelTier === "below-lowest" || p.noaelTier === "at-lowest"))
      entries.push({ symbol: "\u25CF", label: "low NOAEL", color: "rgba(248,113,113,0.7)" });
    return entries;
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
        No endpoints with both effect size and p-value
      </div>
    );
  }

  // Count label: "53/60 endpoints" when some are unplottable, "60 endpoints" otherwise
  const gap = totalEndpoints - points.length;
  const countLabel = gap > 0
    ? `${points.length}/${totalEndpoints} endpoints`
    : `${points.length} endpoints`;
  const tooltipLines = [
    "Click to select \u00b7 Ctrl+click to exclude",
    ...(gap > 0 ? [`${gap} endpoint${gap > 1 ? "s" : ""} not plotted (missing effect size or p-value)`] : []),
  ];
  const countTooltip = tooltipLines.join("\n");

  return (
    <div className="flex h-full flex-col">
      {/* Header: legend left, finding count right */}
      <div className="flex items-center justify-between px-2 py-0.5">
        <div className="flex items-center gap-2">
          {legendEntries.map((e, i) => (
            <span key={i} className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
              <span style={{ color: e.color ?? "#9CA3AF" }}>{e.symbol}</span>{e.label}
            </span>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground" title={countTooltip}>
          {countLabel}
        </span>
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
