import { StripSep } from "@/components/ui/CollapsedStrip";
import type { FindingTableRow } from "@/components/analysis/HistopathologyView";

interface FindingsSelectionZoneProps {
  findings: FindingTableRow[];
  selectedRow: FindingTableRow | null;
}

/**
 * Selection zone content for the findings section header.
 * - Finding selected: selected finding's key metrics inline.
 * - No selection: top 3 flagged findings with signal + incidence, plus normal count.
 */
export function FindingsSelectionZone({ findings, selectedRow }: FindingsSelectionZoneProps) {
  if (selectedRow) {
    const pct = `${Math.round(selectedRow.maxIncidence * 100)}%`;
    return (
      <span className="text-[10px]">
        <span className="text-primary">▸</span>{" "}
        <span className="font-medium text-foreground/80">{selectedRow.finding}</span>{" "}
        <span className="font-mono text-foreground/70">{pct} {selectedRow.severity}</span>
        {selectedRow.isDoseDriven && <span className="font-mono text-foreground/70"> ✓dose-dep</span>}
        {selectedRow.relatedOrgans && selectedRow.relatedOrgans.length > 0 && (
          <><StripSep /><span className="text-muted-foreground">also in: {selectedRow.relatedOrgans.join(", ")}</span></>
        )}
      </span>
    );
  }

  const flagged = findings.filter((f) => f.severity !== "normal" || f.clinicalClass);
  const normalCount = findings.length - flagged.length;
  const shown = flagged.slice(0, 3);

  return (
    <span className="flex items-center gap-0 text-[10px]">
      {shown.map((f, i) => {
        const label = f.clinicalClass
          ? (f.clinicalClass === "Sentinel" ? "Sentinel" : f.clinicalClass === "HighConcern" ? "High concern" : f.severity)
          : f.severity;
        return (
          <span key={f.finding}>
            {i > 0 && <StripSep />}
            <span className="font-medium text-foreground/80">{f.finding}</span>{" "}
            <span className="text-muted-foreground">{label} {Math.round(f.maxIncidence * 100)}%</span>
          </span>
        );
      })}
      {flagged.length > 3 && <><StripSep /><span className="text-muted-foreground">+{flagged.length - 3} flagged</span></>}
      {normalCount > 0 && <><StripSep /><span className="text-muted-foreground">+{normalCount} normal</span></>}
    </span>
  );
}
