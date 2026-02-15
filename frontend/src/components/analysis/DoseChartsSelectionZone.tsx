import { cn } from "@/lib/utils";
import { StripSep } from "@/components/ui/SectionHeader";
import type { FindingTableRow, HeatmapData } from "@/components/analysis/HistopathologyView";

interface RecoveryHeatmap {
  doseLevels: number[];
  doseLabels: Map<number, string>;
  cells: Map<string, { incidence: number; avg_severity: number; affected: number; n: number }>;
}

interface DoseChartsSelectionZoneProps {
  findings: FindingTableRow[];
  selectedRow: FindingTableRow | null;
  heatmapData: HeatmapData | null;
  recoveryHeatmapData?: RecoveryHeatmap | null;
  specimenHasRecovery?: boolean;
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
 *   When recovery data exists, appends `| R:` separator and recovery dose sequence.
 * - No selection: peak incidence and peak severity from specimen aggregate.
 *   When recovery data exists, appends recovery peak after main peak.
 */
export function DoseChartsSelectionZone({ findings, selectedRow, heatmapData, recoveryHeatmapData, specimenHasRecovery }: DoseChartsSelectionZoneProps) {
  const hasRecovery = specimenHasRecovery && recoveryHeatmapData && recoveryHeatmapData.doseLevels.length > 0;

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
        {hasRecovery && (
          <>
            <span className="mx-0.5 text-muted-foreground/40">|</span>
            <span className="text-muted-foreground/50">R:</span>
            {recoveryHeatmapData.doseLevels.map((dl, i) => {
              const cell = recoveryHeatmapData.cells.get(`${selectedRow.finding}|${dl}`);
              const pct = cell ? Math.round(cell.incidence * 100) : 0;
              return (
                <span key={`r${dl}`}>
                  {i > 0 && <span className="text-muted-foreground/40">&rarr;</span>}
                  <span className={cn(incTypo(pct), "opacity-60")}>{pct}%</span>
                </span>
              );
            })}
          </>
        )}
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
        {hasRecovery && (
          <>
            <span className="mx-0.5 text-muted-foreground/40">|</span>
            <span className="text-muted-foreground/50">R:</span>
            {recoveryHeatmapData.doseLevels.map((dl, i) => {
              const cell = recoveryHeatmapData.cells.get(`${selectedRow.finding}|${dl}`);
              const v = cell?.avg_severity ?? 0;
              return (
                <span key={`r${dl}`}>
                  {i > 0 && <span className="text-muted-foreground/40">&rarr;</span>}
                  <span className={cn(sevTypo(v), "opacity-60")}>{v > 0 ? v.toFixed(1) : "\u2014"}</span>
                </span>
              );
            })}
          </>
        )}
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

  // Recovery peaks
  let recPeakInc = 0;
  let recPeakSev = 0;
  if (hasRecovery) {
    for (const f of findings) {
      for (const dl of recoveryHeatmapData.doseLevels) {
        const cell = recoveryHeatmapData.cells.get(`${f.finding}|${dl}`);
        if (cell) {
          if (cell.incidence > recPeakInc) recPeakInc = cell.incidence;
          if (cell.avg_severity > recPeakSev) recPeakSev = cell.avg_severity;
        }
      }
    }
  }

  const peakIncPct = Math.round(peakInc * 100);
  const recPeakIncPct = Math.round(recPeakInc * 100);

  return (
    <span className="flex items-center gap-0 font-mono text-[10px]">
      <span className="text-foreground/70">Peak incidence:{" "}</span>
      <span className={cn(incTypo(peakIncPct))}>{peakIncPct}%</span>
      {peakIncGroup && <span className="text-muted-foreground/60">{" "}({peakIncGroup})</span>}
      {hasRecovery && (
        <>
          <span className="mx-0.5 text-muted-foreground/40">&rarr;</span>
          <span className={cn(incTypo(recPeakIncPct), "opacity-60")}>{recPeakIncPct}%</span>
          <span className="text-muted-foreground/50">{" "}(R)</span>
        </>
      )}
      <StripSep />
      <span className="text-foreground/70">Peak severity:{" "}</span>
      <span className={cn(sevTypo(peakSev))}>{peakSev.toFixed(1)}</span>
      {peakSevGroup && <span className="text-muted-foreground/60">{" "}({peakSevGroup})</span>}
      {hasRecovery && (
        <>
          <span className="mx-0.5 text-muted-foreground/40">&rarr;</span>
          <span className={cn(sevTypo(recPeakSev), "opacity-60")}>{recPeakSev.toFixed(1)}</span>
          <span className="text-muted-foreground/50">{" "}(R)</span>
        </>
      )}
    </span>
  );
}
