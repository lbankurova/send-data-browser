/**
 * MemberRolesByDoseTable — syndrome scope center-pane top-region.
 *
 * Two row-groups (Required on top, Supporting below). Within each group,
 * rows ordered alphabetically by endpoint label (Phase 1 default).
 * Cells use per-endpoint domain-native encoding consistent with
 * DomainDoseRollup but at the row scope:
 *   - Continuous: `*` when pairwise.p_value_adj < 0.05 at the dose, else `—`
 *   - Severity-graded MI: severity grade label at the dose, else `—`
 *   - Pure-incidence: n_affected/n_total at the dose
 *
 * Phase 2 (onset-day inner sort) descoped per architect SIMPLIFY 2026-04-28
 * — EndpointSummary lacks an onset_day/onset_dose field; reinstating Phase 2
 * is a backend pipeline prerequisite (DATA-GAP-RFC-2).
 */

import { useMemo } from "react";
import { buildDoseColumns } from "@/lib/dose-columns";
import { buildPerEndpointCell } from "@/lib/domain-rollup-aggregator";
import type { UnifiedFinding } from "@/types/analysis";
import type { DoseGroup } from "@/types";
import type { NoaelSummaryRow } from "@/types/analysis-views";

export interface MemberEntry {
  endpointLabel: string;
  domain: string;
  role: "required" | "supporting";
}

interface Props {
  members: MemberEntry[];
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  noaelData: NoaelSummaryRow[];
}

export function MemberRolesByDoseTable({
  members,
  findings,
  doseGroups,
  noaelData,
}: Props) {
  const doseColumns = useMemo(
    () => buildDoseColumns(doseGroups, noaelData),
    [doseGroups, noaelData],
  );

  const doseLevelByValue = useMemo(() => {
    const m = new Map<number, number>();
    for (const dg of doseGroups) {
      if (dg.is_recovery) continue;
      if (dg.dose_value == null) continue;
      if (!m.has(dg.dose_value)) m.set(dg.dose_value, dg.dose_level);
    }
    return m;
  }, [doseGroups]);

  const findingsByEndpoint = useMemo(() => {
    const m = new Map<string, UnifiedFinding[]>();
    for (const f of findings) {
      const key = f.endpoint_label ?? "";
      if (!key) continue;
      let arr = m.get(key);
      if (!arr) {
        arr = [];
        m.set(key, arr);
      }
      arr.push(f);
    }
    return m;
  }, [findings]);

  const groups = useMemo(() => {
    const required = members
      .filter((m) => m.role === "required")
      .sort((a, b) => a.endpointLabel.localeCompare(b.endpointLabel));
    const supporting = members
      .filter((m) => m.role === "supporting")
      .sort((a, b) => a.endpointLabel.localeCompare(b.endpointLabel));
    return { required, supporting };
  }, [members]);

  if (doseColumns.length === 0 || members.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        No syndrome member endpoints in scope.
      </div>
    );
  }

  const colWidthPct = Math.floor(60 / doseColumns.length);

  return (
    <div className="h-full overflow-auto">
      <table className="organ-tbl">
        <colgroup>
          <col style={{ width: "12%" }} />
          <col style={{ width: "28%" }} />
          {doseColumns.map((c) => (
            <col key={c.dose_value} style={{ width: `${colWidthPct}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th className="organ-tbl-name">Domain</th>
            <th className="organ-tbl-name">Endpoint</th>
            {doseColumns.map((c) => (
              <th key={c.dose_value} className="organ-tbl-dose">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {renderGroup("Required", groups.required, doseColumns, doseLevelByValue, findingsByEndpoint)}
          {renderGroup("Supporting", groups.supporting, doseColumns, doseLevelByValue, findingsByEndpoint)}
        </tbody>
      </table>
    </div>
  );
}

function renderGroup(
  groupTitle: string,
  members: MemberEntry[],
  doseColumns: { dose_value: number }[],
  doseLevelByValue: Map<number, number>,
  findingsByEndpoint: Map<string, UnifiedFinding[]>,
) {
  if (members.length === 0) return null;
  return (
    <>
      <tr>
        <td colSpan={2 + doseColumns.length} className="bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {groupTitle} ({members.length})
        </td>
      </tr>
      {members.map((m) => {
        const fs = findingsByEndpoint.get(m.endpointLabel) ?? [];
        return (
          <tr key={`${m.role}-${m.endpointLabel}`}>
            <td className="organ-tbl-name text-muted-foreground">{m.domain}</td>
            <td className="organ-tbl-name">{m.endpointLabel}</td>
            {doseColumns.map((c) => {
              const dl = doseLevelByValue.get(c.dose_value);
              const cell = dl != null ? buildPerEndpointCell(m.domain, fs, dl) : null;
              return (
                <td key={c.dose_value} className="organ-tbl-dose">
                  {cell == null || cell === "" ? (
                    <span className="text-muted-foreground/50">—</span>
                  ) : (
                    cell
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

