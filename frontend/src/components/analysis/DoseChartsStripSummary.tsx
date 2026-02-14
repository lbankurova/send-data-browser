import { StripSep } from "@/components/ui/CollapsedStrip";
import type { FindingTableRow, HeatmapData } from "@/components/analysis/HistopathologyView";

interface DoseChartsStripSummaryProps {
  findings: FindingTableRow[];
  selectedRow: FindingTableRow | null;
  heatmapData: HeatmapData | null;
}

/**
 * Summary content for the dose charts collapsed strip.
 * - No selection: peak incidence and peak severity from specimen aggregate.
 * - Finding selected: per-dose-group incidence→severity sequence.
 */
export function DoseChartsStripSummary({ findings, selectedRow, heatmapData }: DoseChartsStripSummaryProps) {
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
      <span className="font-mono text-[10px] text-muted-foreground">
        Incid: {seq}<StripSep />Sev: {sevSeq}
      </span>
    );
  }

  // Specimen aggregate: peak incidence and severity across all findings
  let peakInc = 0;
  let peakSev = 0;
  for (const f of findings) {
    if (f.maxIncidence > peakInc) peakInc = f.maxIncidence;
    if (f.maxSeverity > peakSev) peakSev = f.maxSeverity;
  }
  return (
    <span className="text-[10px] text-muted-foreground">
      Peak incidence: {Math.round(peakInc * 100)}%<StripSep />Peak severity: {peakSev.toFixed(1)}
    </span>
  );
}
