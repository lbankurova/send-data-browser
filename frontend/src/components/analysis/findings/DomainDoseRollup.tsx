/**
 * DomainDoseRollup — domain × dose summary table for FindingsView's
 * organ/syndrome scope center pane (replaces OrganToxicityRadar +
 * GroupForestPlot's mixed-domain spatial encodings).
 *
 * Cell encoding splits three ways by domain class:
 *   - Continuous (LB/BW/OM/EG/VS/BG/FW): n_significant / n_endpoints
 *     where n_significant counts pairwise.p_value_adj < 0.05 at the dose.
 *   - Severity-graded (MI): max severity grade with count, e.g. `moderate (3)`,
 *     drawn from group_stats.severity_grade_counts.
 *   - Pure-incidence (MA/CL/TF/DS): n_affected / n_total summed across
 *     endpoints, with `*` suffix when any pairwise reaches p_adj < 0.05.
 *
 * Per-cell fragility (dotted underline) renders when any endpoint contributing
 * to that specific dose cell has looStability < 0.8 OR endpointConfidence
 * integrated grade === 'low'.
 *
 * Rightmost column "First adverse dose": lowest dose where any endpoint
 * in the domain has worstSeverity='adverse' AND treatmentRelated=true.
 * `≤ {dose}` prefix when the lowest tested dose is itself adverse
 * (BUG-031 below-lowest-tested case).
 */

import { useMemo } from "react";
import { buildDoseColumns, buildDoseLevelMap } from "@/lib/dose-columns";
import { buildDomainRows } from "@/lib/domain-rollup-aggregator";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { UnifiedFinding } from "@/types/analysis";
import type { DoseGroup } from "@/types";
import type { NoaelSummaryRow } from "@/types/analysis-views";

interface Props {
  endpoints: EndpointSummary[];
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  noaelData: NoaelSummaryRow[];
  onDomainClick?: (domain: string) => void;
  onDoseClick?: (doseLevel: number) => void;
}

export function DomainDoseRollup({
  endpoints,
  findings,
  doseGroups,
  noaelData,
  onDomainClick,
  onDoseClick,
}: Props) {
  const doseColumns = useMemo(
    () => buildDoseColumns(doseGroups, noaelData),
    [doseGroups, noaelData],
  );

  const doseLevelByValue = useMemo(() => buildDoseLevelMap(doseGroups), [doseGroups]);

  const rows = useMemo(
    () => buildDomainRows(endpoints, findings, doseColumns, doseLevelByValue),
    [endpoints, findings, doseColumns, doseLevelByValue],
  );

  if (doseColumns.length === 0 || rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        No domain endpoints in this scope.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <table className="organ-tbl">
        <colgroup>
          {/* Colgroup mirrors OrganBlock.tsx:120 (col-w-* fixed pixel widths)
              so dose columns vertically align across DomainDoseRollup,
              the right-panel rollup, and the bottom FindingsTable.
              A-11 spatial anchoring (synthesis Section 1 Architecture). */}
          <col className="col-w-name" />
          <col className="col-w-dose" />
          {doseColumns.map((c) => (
            <col key={c.dose_value} className="col-w-dose" />
          ))}
          <col className="col-w-conf" />
          <col className="col-w-spacer" />
        </colgroup>
        <thead>
          <tr>
            <th className="organ-tbl-name">Domain</th>
            <th className="organ-tbl-dose">Ctrl</th>
            {doseColumns.map((c) => {
              const dl = doseLevelByValue.get(c.dose_value);
              return (
                <th
                  key={c.dose_value}
                  className={
                    onDoseClick && dl != null
                      ? "organ-tbl-dose cursor-pointer hover:bg-muted/40"
                      : "organ-tbl-dose"
                  }
                  onClick={
                    onDoseClick && dl != null ? () => onDoseClick(dl) : undefined
                  }
                  title={
                    onDoseClick && dl != null
                      ? `Filter rail to dose ${c.label}`
                      : undefined
                  }
                >
                  {c.label}
                </th>
              );
            })}
            <th className="organ-tbl-summary">First adverse dose</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.domain}
              className={
                onDomainClick
                  ? "cursor-pointer hover:bg-muted/30"
                  : undefined
              }
              onClick={onDomainClick ? () => onDomainClick(r.domain) : undefined}
              title={onDomainClick ? `Filter rail to ${r.domain}` : undefined}
            >
              <td className="organ-tbl-name">
                <span className="font-semibold">{r.domain}</span>
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({r.nEndpoints})
                </span>
              </td>
              <td className="organ-tbl-dose">
                {r.ctrlCell.empty ? (
                  <span className="text-muted-foreground/50">—</span>
                ) : (
                  r.ctrlCell.content
                )}
              </td>
              {r.cells.map((cell, i) => (
                <td
                  key={i}
                  className={
                    cell.fragile
                      ? "organ-tbl-dose underline decoration-dotted decoration-amber-500 underline-offset-2"
                      : "organ-tbl-dose"
                  }
                  title={
                    cell.fragile
                      ? `${cell.fragileCount} endpoint(s) in this cell are LOO-fragile or LOW confidence — verify with bottom table`
                      : undefined
                  }
                >
                  {cell.empty ? (
                    <span className="text-muted-foreground/50">—</span>
                  ) : (
                    <>
                      {cell.content}
                      {cell.sig && (
                        <sup className="ml-0.5 text-foreground">*</sup>
                      )}
                    </>
                  )}
                </td>
              ))}
              <td className="organ-tbl-summary">
                {r.firstAdverseLabel ?? (
                  <span className="text-muted-foreground/60">&gt; HD</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
