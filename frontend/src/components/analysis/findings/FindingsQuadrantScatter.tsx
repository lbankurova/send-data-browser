import { useMemo, useCallback, useRef } from "react";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import {
  prepareQuadrantPoints,
  buildFindingsQuadrantOption,
} from "@/components/analysis/charts/findings-charts";
import { formatPValue, formatEffectSize } from "@/lib/severity-colors";
import type { EndpointSummary, OrganCoherence } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";

interface FindingsQuadrantScatterProps {
  endpoints: EndpointSummary[];
  selectedEndpoint: string | null;
  onSelect: (label: string) => void;
  organCoherence?: Map<string, OrganCoherence>;
  syndromes?: CrossDomainSyndrome[];
  labMatches?: LabClinicalMatch[];
  scopeFilter?: string;
}

export function FindingsQuadrantScatter({
  endpoints,
  selectedEndpoint,
  onSelect,
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
      if (params?.data?._meta?.endpoint_label) {
        onSelect(params.data._meta.endpoint_label);
      }
    },
    [onSelect],
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

  if (points.length === 0) {
    return (
      <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
        No endpoints with both effect size and p-value
      </div>
    );
  }

  // Selection summary for header
  const selectedPt = selectedEndpoint
    ? points.find((p) => p.endpoint_label === selectedEndpoint)
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header summary */}
      <div className="flex items-center justify-end px-2 py-0.5">
        {selectedPt ? (
          <span className="text-[10px]">
            <span className="font-medium">{"\u2605"} {selectedPt.endpoint_label}</span>
            <span className="ml-1.5 font-mono text-muted-foreground">
              |d|={formatEffectSize(selectedPt.x)} p={formatPValue(selectedPt.rawP)}
            </span>
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {points.length} endpoints plotted
          </span>
        )}
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
