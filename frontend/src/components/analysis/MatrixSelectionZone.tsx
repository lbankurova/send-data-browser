import { StripSep } from "@/components/ui/SectionHeader";
import type { FindingTableRow, HeatmapData } from "@/lib/histopathology-helpers";
import type { SubjectHistopathEntry } from "@/types/timecourse";

interface MatrixSelectionZoneProps {
  selectedRow: FindingTableRow | null;
  heatmapData: HeatmapData | null;
  /** Subject-level data for sex breakdowns. When provided, enables {F}F + {M}M format. */
  subjects?: SubjectHistopathEntry[];
  isStrip?: boolean;
  onStripRestore?: () => void;
}

/** Compute per-group affected counts with sex breakdown from subject-level data. */
function computeGroupCounts(
  finding: string,
  subjects: SubjectHistopathEntry[],
  doseLevels: number[],
  doseLabels: Map<number, string>,
) {
  // Only main-arm subjects (not recovery)
  const mainSubjects = subjects.filter((s) => !s.is_recovery);

  return doseLevels.map((dl) => {
    const groupSubjects = mainSubjects.filter((s) => s.dose_level === dl);
    let maleCount = 0;
    let femaleCount = 0;
    for (const s of groupSubjects) {
      const f = s.findings[finding];
      if (f && f.severity_num > 0) {
        if (s.sex === "M") maleCount++;
        else if (s.sex === "F") femaleCount++;
      }
    }
    return {
      dl,
      label: doseLabels.get(dl) ?? `Dose ${dl}`,
      maleCount,
      femaleCount,
      total: maleCount + femaleCount,
    };
  });
}

/**
 * Selection zone content for the severity matrix section header.
 * - Finding selected: primary group (highest dose with affected) with sex breakdown,
 *   plus "also" list for other affected groups.
 * - No selection: affected subject counts per top 2 dose groups with sex breakdown.
 */
export function MatrixSelectionZone({
  selectedRow,
  heatmapData,
  subjects,
  isStrip,
  onStripRestore,
}: MatrixSelectionZoneProps) {
  if (!heatmapData) return <span className="text-[10px] text-muted-foreground">No data</span>;

  if (selectedRow) {
    // Use subject-level data for sex breakdown when available
    if (subjects) {
      const groupCounts = computeGroupCounts(
        selectedRow.finding,
        subjects,
        heatmapData.doseLevels,
        heatmapData.doseLabels,
      );
      const affected = groupCounts.filter((g) => g.total > 0);

      if (affected.length === 0) {
        return (
          <span className="text-[10px]">
            <span className="text-primary">&#x25B8;</span>{" "}
            <span className="font-medium text-foreground/80">{selectedRow.finding}</span>:{" "}
            <span className="text-muted-foreground">no affected subjects</span>
          </span>
        );
      }

      // Primary = highest dose group with affected subjects
      const primary = affected[affected.length - 1];
      const others = affected.slice(0, -1);

      return (
        <span className="text-[10px]">
          <span className="text-primary">&#x25B8;</span>{" "}
          <span
            className="cursor-pointer font-medium text-foreground/80 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              if (isStrip && onStripRestore) onStripRestore();
              requestAnimationFrame(() => {
                document.querySelector(`[data-finding="${selectedRow.finding}"]`)
                  ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
              });
            }}
          >
            {selectedRow.finding}
          </span>:{" "}
          <span className="text-foreground/70">
            {primary.femaleCount}F + {primary.maleCount}M in {primary.label}
          </span>
          {others.length > 0 && (
            <>
              <StripSep />
              <span className="text-muted-foreground">
                also {others.map((g) => g.label).join(", ")}
              </span>
            </>
          )}
        </span>
      );
    }

    // Fallback without subject data: use heatmap cell data (no sex breakdown)
    const groups = heatmapData.doseLevels
      .map((dl) => ({ dl, cell: heatmapData.cells.get(`${selectedRow.finding}|${dl}`) }))
      .filter((g) => g.cell && g.cell.affected > 0);

    if (groups.length === 0) {
      return (
        <span className="text-[10px]">
          <span className="text-primary">&#x25B8;</span>{" "}
          <span className="font-medium text-foreground/80">{selectedRow.finding}</span>:{" "}
          <span className="text-muted-foreground">no affected subjects</span>
        </span>
      );
    }

    // Primary = highest dose group
    const primary = groups[groups.length - 1];
    const others = groups.slice(0, -1);

    return (
      <span className="text-[10px]">
        <span className="text-primary">&#x25B8;</span>{" "}
        <span
          className="cursor-pointer font-medium text-foreground/80 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            if (isStrip && onStripRestore) onStripRestore();
            requestAnimationFrame(() => {
              document.querySelector(`[data-finding="${selectedRow.finding}"]`)
                ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            });
          }}
        >
          {selectedRow.finding}
        </span>:{" "}
        <span className="text-foreground/70">
          {primary.cell!.affected} in {heatmapData.doseLabels.get(primary.dl) ?? `Dose ${primary.dl}`}
        </span>
        {others.length > 0 && (
          <>
            <StripSep />
            <span className="text-muted-foreground">
              also {others.map((g) => heatmapData.doseLabels.get(g.dl) ?? `Dose ${g.dl}`).join(", ")}
            </span>
          </>
        )}
      </span>
    );
  }

  // No selection: show affected counts per top dose groups with sex breakdown
  if (subjects) {
    // Per-group totals for sorting
    const groupTotals = heatmapData.doseLevels.map((dl) => {
      let affected = 0;
      let groupMaxSev = 0;
      let groupAvgSev = 0;
      let cellCount = 0;
      for (const finding of heatmapData.findings) {
        const cell = heatmapData.cells.get(`${finding}|${dl}`);
        if (cell) {
          affected += cell.affected;
          if (cell.max_severity > groupMaxSev) groupMaxSev = cell.max_severity;
          if (cell.avg_severity > 0) { groupAvgSev += cell.avg_severity; cellCount++; }
        }
      }
      const avgSev = cellCount > 0 ? groupAvgSev / cellCount : 0;
      // Compute sex counts for this group
      const mainSubjects = subjects.filter((s) => !s.is_recovery && s.dose_level === dl);
      const maleAff = new Set<string>();
      const femaleAff = new Set<string>();
      for (const s of mainSubjects) {
        for (const f of heatmapData.findings) {
          const entry = s.findings[f];
          if (entry && entry.severity_num > 0) {
            if (s.sex === "M") maleAff.add(s.usubjid);
            else if (s.sex === "F") femaleAff.add(s.usubjid);
          }
        }
      }
      return {
        dl,
        affected,
        maleCount: maleAff.size,
        femaleCount: femaleAff.size,
        label: heatmapData.doseLabels.get(dl) ?? `Dose ${dl}`,
        maxSev: groupMaxSev,
        avgSev,
      };
    }).sort((a, b) => b.affected - a.affected);

    const top = groupTotals.slice(0, 2).filter((g) => g.affected > 0);

    return (
      <span className="text-[10px] text-muted-foreground">
        {top.map((g, i) => (
          <span key={g.dl}>
            {i > 0 && <StripSep />}
            {g.label}: {g.affected} affected ({g.maleCount}M, {g.femaleCount}F)
            {g.maxSev >= 3 && (g.maxSev - g.avgSev) >= 2 && (
              <span className="text-muted-foreground/60"> · max sev {g.maxSev}</span>
            )}
          </span>
        ))}
        {top.length === 0 && "No affected subjects"}
      </span>
    );
  }

  // Fallback without subject data: no sex breakdown
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
