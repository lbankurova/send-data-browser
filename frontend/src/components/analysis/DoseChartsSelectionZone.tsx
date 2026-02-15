import { cn } from "@/lib/utils";
import { StripSep } from "@/components/ui/SectionHeader";
import type { FindingTableRow, HeatmapData } from "@/components/analysis/HistopathologyView";

interface DoseChartsSelectionZoneProps {
  findings: FindingTableRow[];
  selectedRow: FindingTableRow | null;
  heatmapData: HeatmapData | null;
}

function incTypo(pct: number): string {
  if (pct >= 30) return "font-bold text-foreground";
  if (pct >= 10) return "font-semibold text-foreground/80";
  if (pct > 0) return "font-medium text-muted-foreground";
  return "text-muted-foreground/40";
}

function sevTypo(v: number): string {
  if (v >= 4) return "font-bold text-foreground";
  if (v >= 2) return "font-semibold text-foreground/80";
  if (v > 0) return "font-medium text-muted-foreground";
  return "text-muted-foreground/40";
}

/**
 * Selection zone content for the dose charts section header.
 * - Finding selected: per-dose-group incidence->severity sequence with dose labels.
 * - No selection: peak incidence and peak severity from specimen aggregate.
 */
export function DoseChartsSelectionZone({ findings, selectedRow, heatmapData }: DoseChartsSelectionZoneProps) {
  if (selectedRow && heatmapData) {
    return (
      <span className="flex items-center gap-0 font-mono text-[10px]">
        <span className="text-foreground/70">Incid:</span>
        {heatmapData.doseLevels.map((dl, i) => {
          const cell = heatmapData.cells.get(`${selectedRow.finding}|${dl}`);
          const pct = cell ? Math.round(cell.incidence * 100) : 0;
          return (
            <span key={dl}>
              {i > 0 && <span className="text-foreground/70">&rarr;</span>}
              <span className={cn(incTypo(pct))}>{pct}%</span>
            </span>
          );
        })}
        <StripSep />
        <span className="text-foreground/70">Sev:</span>
        {heatmapData.doseLevels.map((dl, i) => {
          const cell = heatmapData.cells.get(`${selectedRow.finding}|${dl}`);
          const v = cell?.avg_severity ?? 0;
          return (
            <span key={dl}>
              {i > 0 && <span className="text-foreground/70">&rarr;</span>}
              <span className={cn(sevTypo(v))}>{v > 0 ? v.toFixed(1) : "\u2014"}</span>
            </span>
          );
        })}
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

  const peakIncPct = Math.round(peakInc * 100);

  return (
    <span className="flex items-center gap-0 font-mono text-[10px]">
      <span className="text-foreground/70">Peak incidence:{" "}</span>
      <span className={cn(incTypo(peakIncPct))}>{peakIncPct}%</span>
      {peakIncGroup && <span className="text-muted-foreground/60">{" "}({peakIncGroup})</span>}
      <StripSep />
      <span className="text-foreground/70">Peak severity:{" "}</span>
      <span className={cn(sevTypo(peakSev))}>{peakSev.toFixed(1)}</span>
      {peakSevGroup && <span className="text-muted-foreground/60">{" "}({peakSevGroup})</span>}
    </span>
  );
}
