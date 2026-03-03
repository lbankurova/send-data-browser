import { useMemo } from "react";

interface PlotArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Shared linear scale factory for context-panel SVG charts.
 * Returns memoised xScale (left→right) and yScale (top→bottom inverted).
 */
export function useChartScales(
  xDomain: [number, number],
  yDomain: [number, number],
  plotArea: PlotArea,
) {
  return useMemo(() => {
    const xRange = xDomain[1] - xDomain[0];
    const yRange = yDomain[1] - yDomain[0];

    const xScale = (v: number): number => {
      if (xRange === 0) return plotArea.left + plotArea.width / 2;
      return plotArea.left + ((v - xDomain[0]) / xRange) * plotArea.width;
    };

    const yScale = (v: number): number => {
      if (yRange === 0) return plotArea.top + plotArea.height / 2;
      // Inverted: higher values → lower y pixel
      return plotArea.top + plotArea.height - ((v - yDomain[0]) / yRange) * plotArea.height;
    };

    return { xScale, yScale };
  }, [xDomain[0], xDomain[1], yDomain[0], yDomain[1], plotArea.left, plotArea.top, plotArea.width, plotArea.height]);
}
