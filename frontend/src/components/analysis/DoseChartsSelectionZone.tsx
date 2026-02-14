import { StripSep } from "@/components/ui/CollapsedStrip";
import type { FindingTableRow, HeatmapData } from "@/components/analysis/HistopathologyView";

interface DoseChartsSelectionZoneProps {
  findings: FindingTableRow[];
  selectedRow: FindingTableRow | null;
  heatmapData: HeatmapData | null;
}

/**
 * Selection zone content for the dose charts section header.
 * - Finding selected: per-dose-group incidence→severity sequence with dose labels.
 * - No selection: peak incidence and peak severity from specimen aggregate.
 */
export function DoseChartsSelectionZone({ findings, selectedRow, heatmapData }: DoseChartsSelectionZoneProps) {
  if (selectedRow && heatmapData) {
    const seq = heatmapData.doseLevels.map((dl) => {
      const cell = heatmapData.cells.get(`${selectedRow.finding}|${dl}`);
      return cell ? `${Math.round(cell.incidence * 100)}%` : "0%";
    }).join("→");
    const sevSeq = heatmapData.doseLevels.map((dl) => {
      const cell = heatmapData.cells.get(`${selectedRow.finding}|${dl}`);
      return cell && cell.avg_severity ? cell.avg_severity.toFixed(1) : "—";
    }).join("→");
    return (
      <span className="font-mono text-[10px] text-foreground/70">
        Incid: {seq}<StripSep />Sev: {sevSeq}
      </span>
    );
  }

  // Specimen aggregate: peak incidence and severity across all findings, with dose group labels
  let peakInc = 0;
  let peakSev = 0;
  let peakIncGroup = "";
  let peakSevGroup = "";
  if (heatmapData) {
    for (const f of findings) {
      for (const dl of heatmapData.doseLevels) {
        const cell = heatmapData.cells.get(`${f.finding}|${dl}`);
        if (cell) {
          if (cell.incidence > peakInc) {
            peakInc = cell.incidence;
            peakIncGroup = heatmapData.doseLabels.get(dl) ?? `Dose ${dl}`;
          }
          if (cell.avg_severity > peakSev) {
            peakSev = cell.avg_severity;
            peakSevGroup = heatmapData.doseLabels.get(dl) ?? `Dose ${dl}`;
          }
        }
      }
    }
  } else {
    for (const f of findings) {
      if (f.maxIncidence > peakInc) peakInc = f.maxIncidence;
      if (f.maxSeverity > peakSev) peakSev = f.maxSeverity;
    }
  }

  return (
    <span className="font-mono text-[10px] text-foreground/70">
      Peak incidence: {Math.round(peakInc * 100)}%{peakIncGroup ? ` (${peakIncGroup})` : ""}
      <StripSep />Peak severity: {peakSev.toFixed(1)}{peakSevGroup ? ` (${peakSevGroup})` : ""}
    </span>
  );
}
