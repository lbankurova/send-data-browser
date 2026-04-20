import { useState } from "react";
import { useTermCollisions } from "@/hooks/useTermCollisions";
import type { CollisionReport } from "@/lib/admin-terms-api";
import { PaneTable } from "@/components/analysis/panes/PaneTable";

type Props = {
  studyIds: string[];
  onResolveAsSynonym: (collision: CollisionReport) => void;
};

// LEVEL-4-REPORT-ONLY: the "Resolve as synonym" action opens the curation
// Accept modal (Feature 4). Nothing here writes to unified_findings.json.
export function CrossStudyTermCollisions({ studyIds, onResolveAsSynonym }: Props) {
  const [includeQualifierDivergence, setIncludeQualifierDivergence] = useState(false);
  const query = useTermCollisions(
    studyIds,
    { includeQualifierDivergence },
    studyIds.length >= 2,
  );

  if (studyIds.length < 2) {
    return (
      <div className="p-2 text-xs text-muted-foreground">
        Select at least 2 studies to detect cross-study term collisions.
      </div>
    );
  }

  const collisions = query.data?.collisions ?? [];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end">
        <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={includeQualifierDivergence}
            onChange={(e) => setIncludeQualifierDivergence(e.target.checked)}
          />
          Include qualifier divergence
        </label>
      </div>
      {query.isLoading && <div className="text-xs text-muted-foreground">Loading collisions…</div>}
      {query.isError && <div className="text-xs text-destructive">Failed to load collisions.</div>}
      {!query.isLoading && collisions.length === 0 && (
        <div className="text-xs text-muted-foreground">No collisions detected at current filters.</div>
      )}
      {collisions.length > 0 && (
        <PaneTable>
          <thead>
            <tr className="border-b border-border bg-muted/30 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <PaneTable.Th style={{ width: 100 }} className="px-2">Study A</PaneTable.Th>
              <PaneTable.Th style={{ width: 100 }} className="px-2">Study B</PaneTable.Th>
              <PaneTable.Th style={{ width: 120 }} className="px-2">Organ</PaneTable.Th>
              <PaneTable.Th absorber className="px-2">Term A</PaneTable.Th>
              <PaneTable.Th absorber className="px-2">Term B</PaneTable.Th>
              <PaneTable.Th numeric style={{ width: 80 }} className="px-2">Confidence</PaneTable.Th>
              <PaneTable.Th style={{ width: 150 }} className="px-2">Kind</PaneTable.Th>
              <PaneTable.Th style={{ width: 150 }} className="px-2" />
            </tr>
          </thead>
          <tbody>
            {collisions.map((c, idx) => (
              <tr key={`${c.study_a}-${c.study_b}-${c.term_a}-${c.term_b}-${idx}`} className="border-b border-border/40 hover:bg-muted/40">
                <PaneTable.Td className="px-2 font-mono">{c.study_a}</PaneTable.Td>
                <PaneTable.Td className="px-2 font-mono">{c.study_b}</PaneTable.Td>
                <PaneTable.Td className="px-2">{c.organ ?? "—"}</PaneTable.Td>
                <PaneTable.Td className="px-2 font-mono">{c.term_a}</PaneTable.Td>
                <PaneTable.Td className="px-2 font-mono">{c.term_b}</PaneTable.Td>
                <PaneTable.Td numeric className="px-2 font-mono">{c.confidence.toFixed(2)}</PaneTable.Td>
                <PaneTable.Td className="px-2 text-[10px] text-muted-foreground">{c.report_kind}</PaneTable.Td>
                <PaneTable.Td className="px-2">
                  <button
                    className="rounded-md border border-border bg-background px-2 py-0.5 text-[11px] hover:bg-muted"
                    onClick={() => onResolveAsSynonym(c)}
                  >
                    Resolve as synonym
                  </button>
                </PaneTable.Td>
              </tr>
            ))}
          </tbody>
        </PaneTable>
      )}
    </div>
  );
}
