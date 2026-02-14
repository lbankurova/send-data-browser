import { StripSep } from "@/components/ui/CollapsedStrip";
import type { FindingTableRow, HeatmapData } from "@/components/analysis/HistopathologyView";

interface MatrixStripSummaryProps {
  selectedRow: FindingTableRow | null;
  heatmapData: HeatmapData | null;
}

/**
 * Summary content for the severity matrix collapsed strip.
 * - No selection: affected subject counts per top 2 dose groups.
 * - Finding selected: per-group affected/N breakdown for that finding.
 */
export function MatrixStripSummary({ selectedRow, heatmapData }: MatrixStripSummaryProps) {
  if (!heatmapData) return <span className="text-[10px] text-muted-foreground">No data</span>;

  if (selectedRow) {
    const groups = heatmapData.doseLevels
      .map((dl) => ({ dl, cell: heatmapData.cells.get(`${selectedRow.finding}|${dl}`) }))
      .filter((g) => g.cell && g.cell.affected > 0);
    return (
      <span className="text-[10px]">
        <span className="text-primary">▸</span>{" "}
        <span className="font-medium">{selectedRow.finding}</span>:{" "}
        {groups.length === 0
          ? <span className="text-muted-foreground">no affected subjects</span>
          : groups.map((g, i) => (
              <span key={g.dl} className="text-muted-foreground">
                {i > 0 && ", "}
                {g.cell!.affected}/{g.cell!.n} in {heatmapData.doseLabels.get(g.dl) ?? `Dose ${g.dl}`}
              </span>
            ))
        }
      </span>
    );
  }

  // No selection: show affected counts per top dose groups
  const groupTotals = heatmapData.doseLevels.map((dl) => {
    let affected = 0;
    for (const finding of heatmapData.findings) {
      const cell = heatmapData.cells.get(`${finding}|${dl}`);
      if (cell) affected += cell.affected;
    }
    return { dl, affected, label: heatmapData.doseLabels.get(dl) ?? `Dose ${dl}` };
  }).sort((a, b) => b.affected - a.affected);
  const top = groupTotals.slice(0, 2).filter((g) => g.affected > 0);

  return (
    <span className="text-[10px] text-muted-foreground">
      {top.map((g, i) => (
        <span key={g.dl}>
          {i > 0 && <StripSep />}
          {g.label}: {g.affected} affected
        </span>
      ))}
      {top.length === 0 && "No affected subjects"}
    </span>
  );
}
