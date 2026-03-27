/**
 * SeverityMatrix — specimen-scoped severity heatmap for FindingsView.
 *
 * Renders when rail is in specimen grouping mode and a specimen card is selected.
 * Rows = MI/MA findings for the specimen, columns = dose groups (terminal | recovery).
 * Dual encoding: cell color = avg severity (grayscale heat), cell label = affected/n.
 */

import { useMemo, useState } from "react";
import { getNeutralHeatColor } from "@/lib/histopathology-helpers";
import { DoseHeader } from "@/components/ui/DoseLabel";
import { formatDoseShortLabel } from "@/lib/severity-colors";
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import type { SubjectHistopathEntry } from "@/types/timecourse";

interface SeverityMatrixProps {
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  studyId?: string;
  specimen?: string | null;
}

interface MatrixCell {
  affected: number;
  n: number;
  avgSeverity: number | null;
  maxSeverity: number;
  isGraded: boolean;
}

/** Build terminal cells from UnifiedFinding group_stats. */
function buildMatrix(findings: UnifiedFinding[]) {
  const miMa = findings.filter(f => f.domain === "MI" || f.domain === "MA");

  const grouped = new Map<string, UnifiedFinding[]>();
  for (const f of miMa) {
    const key = `${f.endpoint_label ?? f.finding}\0${f.domain}`;
    const arr = grouped.get(key) ?? [];
    arr.push(f);
    grouped.set(key, arr);
  }

  const rows: {
    key: string;
    label: string;
    domain: string;
    finding: string;
    isGraded: boolean;
    maxSev: number;
    cells: Map<number, MatrixCell>;
  }[] = [];

  for (const [key, fGroup] of grouped) {
    const first = fGroup[0];
    const label = first.finding;
    const domain = first.domain;
    const finding = first.finding;

    const cells = new Map<number, MatrixCell>();
    let isGraded = false;
    let maxSev = 0;

    for (const f of fGroup) {
      for (const gs of f.group_stats) {
        const existing = cells.get(gs.dose_level);
        const avgSev = gs.avg_severity ?? null;
        if (avgSev != null && avgSev > 0) isGraded = true;
        if (avgSev != null && avgSev > maxSev) maxSev = avgSev;

        // Derive max severity from grade counts if available
        const gradeMax = gs.severity_grade_counts
          ? Math.max(...Object.keys(gs.severity_grade_counts).map(Number).filter(n => !isNaN(n)), 0)
          : (avgSev ?? 0);

        if (existing) {
          existing.affected += gs.affected ?? 0;
          existing.n += gs.n;
          existing.avgSeverity = avgSev != null
            ? Math.max(existing.avgSeverity ?? 0, avgSev)
            : existing.avgSeverity;
          existing.maxSeverity = Math.max(existing.maxSeverity, gradeMax);
          if (avgSev != null && avgSev > 0) existing.isGraded = true;
        } else {
          cells.set(gs.dose_level, {
            affected: gs.affected ?? 0,
            n: gs.n,
            avgSeverity: avgSev,
            maxSeverity: gradeMax,
            isGraded: avgSev != null && avgSev > 0,
          });
        }
      }
    }

    rows.push({ key, label, domain, finding, isGraded, maxSev, cells });
  }

  rows.sort((a, b) => {
    if (a.isGraded && !b.isGraded) return -1;
    if (!a.isGraded && b.isGraded) return 1;
    if (a.isGraded && b.isGraded) return b.maxSev - a.maxSev || a.label.localeCompare(b.label);
    return a.label.localeCompare(b.label);
  });

  return rows;
}

/** Build recovery cells from subject-level data. */
function buildRecoveryCells(
  subjects: SubjectHistopathEntry[],
  findingNames: string[],
  doseLevels: number[],
): Map<string, Map<number, MatrixCell | null>> {
  const recSubjects = subjects.filter(s => s.is_recovery);
  if (recSubjects.length === 0) return new Map();

  const result = new Map<string, Map<number, MatrixCell | null>>();

  for (const finding of findingNames) {
    const cells = new Map<number, MatrixCell | null>();
    for (const dl of doseLevels) {
      const doseSubjects = recSubjects.filter(s => s.dose_level === dl);
      if (doseSubjects.length === 0) continue;

      // Count examined subjects: those who have ANY finding in their findings dict
      // (if they have findings recorded, their tissue was examined)
      const examined = doseSubjects.filter(s =>
        Object.keys(s.findings).length > 0 || s.ma_examined === true,
      );

      // No subjects examined at this dose → not examined
      if (examined.length === 0) {
        cells.set(dl, null);
        continue;
      }

      let affected = 0;
      let sevSum = 0;
      let maxSev = 0;
      let hasGraded = false;
      for (const s of examined) {
        const fd = s.findings[finding];
        if (fd && fd.severity_num > 0) {
          affected++;
          sevSum += fd.severity_num;
          if (fd.severity_num > maxSev) maxSev = fd.severity_num;
          if (fd.severity_num >= 1) hasGraded = true;
        }
      }
      cells.set(dl, {
        affected,
        n: examined.length,
        avgSeverity: affected > 0 ? sevSum / affected : null,
        maxSeverity: maxSev,
        isGraded: hasGraded,
      });
    }
    result.set(finding, cells);
  }

  return result;
}

// ─── Legend ─────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { label: "1 Minimal", sev: 1 },
  { label: "2 Mild", sev: 2 },
  { label: "3 Moderate", sev: 3 },
  { label: "4 Marked", sev: 4 },
  { label: "5 Severe", sev: 5 },
];

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="font-medium">Severity:</span>
      {LEGEND_ITEMS.map(({ label, sev }) => {
        const { bg } = getNeutralHeatColor(sev);
        return (
          <span key={sev} className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: bg }} />
            {label}
          </span>
        );
      })}
      <span className="ml-2 flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm border border-dashed border-gray-300" />
        Zero
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm bg-striped" />
        NE
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block h-3 w-3 rounded-sm border border-gray-400 bg-transparent" />
        Present (ungraded)
      </span>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────

export function SeverityMatrix({ findings, doseGroups, studyId, specimen }: SeverityMatrixProps) {
  const [gradedOnly, setGradedOnly] = useState(false);

  const rows = useMemo(() => buildMatrix(findings), [findings]);
  const visibleRows = useMemo(
    () => gradedOnly ? rows.filter(r => r.isGraded) : rows,
    [rows, gradedOnly],
  );

  // Recovery data from subject-level endpoint
  const { data: subjData } = useHistopathSubjects(studyId, specimen ?? null);
  const hasRecovery = useMemo(
    () => subjData?.subjects?.some(s => s.is_recovery) ?? false,
    [subjData],
  );
  const recoveryDoseLevels = useMemo(() => {
    if (!hasRecovery || !subjData?.subjects) return [];
    const levels = new Set<number>();
    for (const s of subjData.subjects) {
      if (s.is_recovery) levels.add(s.dose_level);
    }
    return [...levels].sort((a, b) => a - b);
  }, [hasRecovery, subjData]);
  const recoveryCells = useMemo(() => {
    if (!hasRecovery || !subjData?.subjects) return new Map<string, Map<number, MatrixCell>>();
    const findingNames = rows.map(r => r.finding);
    return buildRecoveryCells(subjData.subjects, findingNames, recoveryDoseLevels);
  }, [hasRecovery, subjData, rows, recoveryDoseLevels]);

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No MI/MA findings for this specimen
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header bar */}
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
        <div className="flex items-center gap-4">
          <Legend />
        </div>
        <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={gradedOnly}
            onChange={(e) => setGradedOnly(e.target.checked)}
            className="h-3 w-3 rounded border-gray-300"
          />
          Severity graded only
          {gradedOnly && rows.length !== visibleRows.length && (
            <span className="text-muted-foreground/60">
              ({visibleRows.length}/{rows.length})
            </span>
          )}
        </label>
      </div>

      {/* Matrix */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-background">
            <tr>
              <th className="px-2 py-1.5 text-left text-[11px] font-medium text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                Domain
              </th>
              <th className="px-2 py-1.5 text-left text-[11px] font-medium text-muted-foreground" style={{ width: "100%" }}>
                Finding
              </th>
              {doseGroups.map(dg => {
                const shortLabel = dg.dose_level === 0 ? "C" : String(dg.dose_value ?? formatDoseShortLabel(dg.label));
                return (
                  <th key={dg.dose_level} className="px-1 py-1.5 text-center" style={{ width: 1, whiteSpace: "nowrap" }}>
                    <DoseHeader level={dg.dose_level} label={shortLabel} />
                  </th>
                );
              })}
              {/* Recovery columns */}
              {hasRecovery && (
                <>
                  <th className="px-0.5 py-1.5" style={{ width: 1 }}>
                    <div className="mx-0.5 h-4 w-px bg-border" />
                  </th>
                  {recoveryDoseLevels.map(dl => {
                    const dg = doseGroups.find(d => d.dose_level === dl);
                    const shortLabel = dl === 0 ? "C" : String(dg?.dose_value ?? dl);
                    return (
                      <th key={`rec_${dl}`} className="px-1 py-1.5 text-center" style={{ width: 1, whiteSpace: "nowrap" }}>
                        <span className="text-[10px] font-medium text-muted-foreground">{shortLabel}</span>
                      </th>
                    );
                  })}
                </>
              )}
            </tr>
            {/* Recovery header label */}
            {hasRecovery && (
              <tr>
                <th colSpan={2 + doseGroups.length} />
                <th className="px-0.5" style={{ width: 1 }} />
                <th colSpan={recoveryDoseLevels.length} className="pb-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recovery
                </th>
              </tr>
            )}
          </thead>
          <tbody>
            {visibleRows.map(row => {
              const recCells = recoveryCells.get(row.finding);
              return (
                <tr
                  key={row.key}
                  className="hover:bg-accent/30"
                >
                  <td className="px-2 py-px text-[10px] font-semibold text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                    {row.domain}
                  </td>
                  <td className="px-2 py-px" style={{ width: "100%" }}>
                    <span className="text-xs">{row.label}</span>
                  </td>
                  {doseGroups.map(dg => {
                    const cell = row.cells.get(dg.dose_level);
                    return (
                      <td key={dg.dose_level} className="px-1 py-px" style={{ width: 1, whiteSpace: "nowrap" }}>
                        <CellRenderer cell={cell} />
                      </td>
                    );
                  })}
                  {/* Recovery cells */}
                  {hasRecovery && (
                    <>
                      <td className="px-0.5" style={{ width: 1 }}>
                        <div className="mx-0.5 h-full w-px bg-border" />
                      </td>
                      {recoveryDoseLevels.map(dl => {
                        const cell = recCells?.get(dl);
                        return (
                          <td key={`rec_${dl}`} className="px-1 py-px" style={{ width: 1, whiteSpace: "nowrap" }}>
                            <CellRenderer cell={cell} />
                          </td>
                        );
                      })}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Cell renderer ──────────────────────────────────────────

function CellRenderer({ cell }: { cell: MatrixCell | null | undefined }) {
  // Not examined — no data at all
  if (!cell) {
    return (
      <div className="flex h-6 w-16 items-center justify-center rounded-sm bg-striped" title="Not examined">
        <span className="text-[10px] font-mono text-muted-foreground/40">NE</span>
      </div>
    );
  }

  // Examined but finding absent
  if (cell.affected === 0) {
    return (
      <div className="flex h-6 w-16 items-center justify-center rounded-sm border border-dashed border-gray-200">
        <span className="text-[10px] font-mono text-muted-foreground/50">0/{cell.n}</span>
      </div>
    );
  }

  // Present but not graded (binary finding)
  if (!cell.isGraded) {
    return (
      <div className="flex h-6 w-16 items-center justify-center rounded-sm border border-gray-400">
        <span className="text-[10px] font-mono font-medium">{cell.affected}/{cell.n}</span>
      </div>
    );
  }

  // Graded — heat color by avg severity
  const heat = getNeutralHeatColor(cell.avgSeverity ?? 0);
  const isOutlier = cell.maxSeverity >= 3 && cell.avgSeverity != null && (cell.maxSeverity - cell.avgSeverity) >= 2;
  return (
    <div
      className="flex h-6 w-16 items-center justify-center rounded-sm"
      style={{ backgroundColor: heat.bg, color: heat.text }}
      title={cell.avgSeverity != null ? `avg severity: ${cell.avgSeverity.toFixed(1)}${isOutlier ? `, max: ${cell.maxSeverity}` : ""}` : undefined}
    >
      <span className="text-[10px] font-mono font-medium">{cell.affected}/{cell.n}{isOutlier ? "*" : ""}</span>
    </div>
  );
}
