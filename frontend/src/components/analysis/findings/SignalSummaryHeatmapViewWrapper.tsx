import { useCallback } from "react";
import { SignalSummaryHeatmapView } from "./SignalSummaryHeatmapView";
import type { HeatmapSelection } from "./SignalSummaryHeatmapView";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export function SignalSummaryHeatmapViewWrapper() {
  const { setSelection } = useViewSelection();

  const handleSelectionChange = useCallback(
    (sel: HeatmapSelection | null) => {
      setSelection(
        sel
          ? { _view: "signal-heatmap", endpoint_label: sel.endpoint_label, dose_label: sel.dose_label }
          : null,
      );
    },
    [setSelection],
  );

  return <SignalSummaryHeatmapView onSelectionChange={handleSelectionChange} />;
}
