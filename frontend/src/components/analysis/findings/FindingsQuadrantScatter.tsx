import { useMemo, useCallback } from "react";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import {
  prepareQuadrantPoints,
  buildFindingsQuadrantOption,
} from "@/components/analysis/charts/findings-charts";
import { formatPValue, formatEffectSize } from "@/lib/severity-colors";
import type { EndpointSummary } from "@/lib/derive-summaries";

interface FindingsQuadrantScatterProps {
  endpoints: EndpointSummary[];
  selectedEndpoint: string | null;
  onSelect: (label: string) => void;
}

export function FindingsQuadrantScatter({
  endpoints,
  selectedEndpoint,
  onSelect,
}: FindingsQuadrantScatterProps) {
  const points = useMemo(() => prepareQuadrantPoints(endpoints), [endpoints]);

  const option = useMemo(
    () => buildFindingsQuadrantOption(points, selectedEndpoint),
    [points, selectedEndpoint],
  );

  const handleClick = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (params: any) => {
      if (params?.data?._meta?.endpoint_label) {
        onSelect(params.data._meta.endpoint_label);
      }
    },
    [onSelect],
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
            <span className="font-medium">★ {selectedPt.endpoint_label}</span>
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
        className="min-h-0 flex-1"
        style={{ width: "100%" }}
      />
    </div>
  );
}
