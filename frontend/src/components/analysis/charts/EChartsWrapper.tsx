import { useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, ScatterChart, HeatmapChart, PieChart, CustomChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
  ToolboxComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

echarts.use([
  BarChart,
  LineChart,
  ScatterChart,
  HeatmapChart,
  PieChart,
  CustomChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  VisualMapComponent,
  DataZoomComponent,
  MarkLineComponent,
  ToolboxComponent,
  CanvasRenderer,
]);

type EChartsInstance = ReturnType<typeof echarts.init>;

interface EChartsWrapperProps {
  option: EChartsOption;
  style?: React.CSSProperties;
  className?: string;
  onInit?: (chart: EChartsInstance) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onClick?: (params: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMouseOver?: (params: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onMouseOut?: (params: any) => void;
}

export const EChartsWrapper = forwardRef<EChartsInstance | null, EChartsWrapperProps>(
  function EChartsWrapper({ option, style, className, onInit, onClick, onMouseOver, onMouseOut }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<EChartsInstance | null>(null);

    // Expose chart instance via ref
    useImperativeHandle(ref, () => chartRef.current!, []);

    // Init + dispose
    useEffect(() => {
      if (!containerRef.current) return;
      const chart = echarts.init(containerRef.current);
      chartRef.current = chart;
      onInit?.(chart);

      const ro = new ResizeObserver(() => chart.resize());
      ro.observe(containerRef.current);

      return () => {
        ro.disconnect();
        chart.dispose();
        chartRef.current = null;
      };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Update option
    useEffect(() => {
      if (chartRef.current) {
        chartRef.current.setOption(option, { notMerge: true });
      }
    }, [option]);

    // Click handler
    useEffect(() => {
      const chart = chartRef.current;
      if (!chart || !onClick) return;
      chart.on("click", onClick);
      return () => { chart.off("click", onClick); };
    }, [onClick]);

    // MouseOver handler
    useEffect(() => {
      const chart = chartRef.current;
      if (!chart || !onMouseOver) return;
      chart.on("mouseover", onMouseOver);
      return () => { chart.off("mouseover", onMouseOver); };
    }, [onMouseOver]);

    // MouseOut handler
    useEffect(() => {
      const chart = chartRef.current;
      if (!chart || !onMouseOut) return;
      chart.on("mouseout", onMouseOut);
      return () => { chart.off("mouseout", onMouseOut); };
    }, [onMouseOut]);

    return <div ref={containerRef} style={style} className={className} />;
  }
);
