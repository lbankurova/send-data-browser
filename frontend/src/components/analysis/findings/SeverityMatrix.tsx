/**
 * SeverityMatrix — specimen-scoped severity heatmap for FindingsView.
 *
 * Renders when rail is in specimen grouping mode and a specimen card is selected.
 * Rows = MI/MA findings for the specimen, columns = dose groups (terminal | recovery).
 * Dual encoding: cell color = mean severity (grayscale heat), cell label = affected/n or %.
 *
 * In compact mode (split-panel), the legend is suppressed (caller renders a shared
 * header), dose labels use color-coded abbreviations, and recovery columns get a
 * golden-brown tint for visual separation.
 */

import { useMemo, useState } from "react";
import { getSeverityGradeColor, BINARY_AFFECTED_FILL } from "@/lib/severity-colors";
import { DoseHeader } from "@/components/ui/DoseLabel";
import { doseAbbrev } from "@/lib/dose-label-utils";
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import type { SubjectHistopathEntry, SubjectHistopathResponse } from "@/types/timecourse";

export interface SeverityMatrixProps {
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  studyId?: string;
  specimen?: string | null;
  /** Compact mode: tighter cells, smaller fonts, no legend header. For split-panel use. */
  compact?: boolean;
  /** Currently selected finding name (highlighted row). */
  selectedFinding?: string | null;
  /** Callback when a row is clicked. Emits finding name + domain. */
  onRowClick?: (finding: string, domain: string) => void;
  /** Display mode: counts ("3/5") or percent ("60%"). Default "counts". */
  displayMode?: "counts" | "percent";
  /** Signal scores keyed by endpoint_label — when provided, rows are sorted by descending score. */
  signalScores?: Map<string, number>;
  /** Pre-fetched subject-level data. When provided, skips internal useHistopathSubjects call. */
  subjData?: SubjectHistopathResponse;
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
    endpointLabel: string;
    domain: string;
    finding: string;
    isGraded: boolean;
    maxSev: number;
    cells: Map<number, MatrixCell>;
  }[] = [];

  for (const [key, fGroup] of grouped) {
    const first = fGroup[0];
    const label = first.finding;
    const endpointLabel = first.endpoint_label ?? first.finding;
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

    rows.push({ key, label, endpointLabel, domain, finding, isGraded, maxSev, cells });
  }

  // No custom sort — preserve input order (matches findings rail ranking)

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

      // No subjects examined at this dose -> not examined
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

// ─── Legend (standalone mode only) ────────────────────────

const LEGEND_ITEMS = [
  { label: "1 Minimal", grade: 1 },
  { label: "2 Mild", grade: 2 },
  { label: "3 Moderate", grade: 3 },
  { label: "4 Marked", grade: 4 },
  { label: "5 Severe", grade: 5 },
];

function Legend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
      <span className="font-medium">Severity:</span>
      {LEGEND_ITEMS.map(({ label, grade }) => {
        const { bg } = getSeverityGradeColor(grade);
        return (
          <span key={grade} className="flex items-center gap-1">
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

// Separator between treatment and recovery columns — pronounced 2px solid line
const RECOVERY_SEPARATOR = "w-px bg-gray-300";

// ─── Component ──────────────────────────────────────────────

export function SeverityMatrix({
  findings, doseGroups, studyId, specimen, compact,
  selectedFinding, onRowClick, displayMode = "counts", signalScores, subjData: subjDataProp,
}: SeverityMatrixProps) {
  const [gradedOnly, setGradedOnly] = useState(false);

  const unsortedRows = useMemo(() => buildMatrix(findings), [findings]);
  const rows = useMemo(() => {
    if (!signalScores || signalScores.size === 0) return unsortedRows;
    return [...unsortedRows].sort((a, b) => {
      const sa = signalScores.get(a.endpointLabel) ?? 0;
      const sb = signalScores.get(b.endpointLabel) ?? 0;
      return sb - sa; // descending — highest signal first
    });
  }, [unsortedRows, signalScores]);
  const visibleRows = useMemo(
    () => gradedOnly ? rows.filter(r => r.isGraded) : rows,
    [rows, gradedOnly],
  );

  // Recovery data from subject-level endpoint (skip hook when caller provides data)
  const { data: subjDataHook } = useHistopathSubjects(
    subjDataProp ? undefined : studyId,
    subjDataProp ? null : (specimen ?? null),
  );
  const subjData = subjDataProp ?? subjDataHook;
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

  // Sizing tokens
  const cellW = compact ? "w-9" : "w-16";
  const cellH = compact ? "h-5" : "h-6";
  const cellText = compact ? "text-[9px]" : "text-[10px]";
  const headerText = compact ? "text-[9px]" : "text-[11px]";
  const rowText = compact ? "text-[11px]" : "text-xs";
  const domainText = compact ? "text-[9px]" : "text-[10px]";
  const px = compact ? "px-1" : "px-2";
  const thPx = compact ? "px-0.5" : "px-1";
  const thPy = compact ? "py-0.5" : "py-1.5";
  const periodText = compact ? "text-[9px]" : "text-[10px]";


  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header bar — full legend in standalone, suppressed in compact (shared header above) */}
      {!compact && (
        <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5">
          <Legend />
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
      )}

      {/* Matrix */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-background">
            {/* Period titles row — always show "Treatment"; show "Recovery" when data exists */}
            <tr>
              <th colSpan={compact ? 1 : 2} />
              <th
                colSpan={doseGroups.length}
                className={`pb-0 text-center ${periodText} font-semibold uppercase tracking-wider text-muted-foreground`}
              >
                Treatment
              </th>
              {hasRecovery && (
                <>
                  <th className="px-0" style={{ width: 1 }}>
                    <div className={`mx-auto h-full ${RECOVERY_SEPARATOR}`} />
                  </th>
                  <th
                    colSpan={recoveryDoseLevels.length}
                    className={`pb-0 text-center ${periodText} font-semibold uppercase tracking-wider text-muted-foreground`}
                    style={{ backgroundColor: "#f7f8fa" }}
                  >
                    Recovery
                  </th>
                </>
              )}
            </tr>
            {/* Dose labels row */}
            <tr>
              {!compact && (
                <th className={`${px} ${thPy} text-left ${headerText} font-medium text-muted-foreground`} style={{ width: 1, whiteSpace: "nowrap" }}>
                  Domain
                </th>
              )}
              <th className={`${px} ${thPy} text-left ${headerText} font-medium text-muted-foreground`} style={{ width: "100%" }}>
                Finding
              </th>
              {doseGroups.map(dg => (
                <th key={dg.dose_level} className={`${thPx} ${thPy} text-center`} style={{ width: 1, whiteSpace: "nowrap" }}>
                  {compact ? (
                    <span
                      className="text-[9px] font-mono font-medium"
                      style={{ color: dg.display_color ?? "#6b7280" }}
                    >
                      {doseAbbrev(dg)}
                    </span>
                  ) : (
                    <DoseHeader level={dg.dose_level} label={dg.short_label ?? doseAbbrev(dg)} color={dg.display_color} />
                  )}
                </th>
              ))}
              {/* Recovery dose labels */}
              {hasRecovery && (
                <>
                  <th className="px-0" style={{ width: 1 }}>
                    <div className={`mx-auto h-full ${RECOVERY_SEPARATOR}`} />
                  </th>
                  {recoveryDoseLevels.map(dl => {
                    const dg = doseGroups.find(d => d.dose_level === dl);
                    return (
                      <th key={`rec_${dl}`} className={`${thPx} ${thPy} text-center`} style={{ width: 1, whiteSpace: "nowrap", backgroundColor: "#f7f8fa" }}>
                        <span
                          className="text-[9px] font-mono font-medium"
                          style={{ color: dg?.display_color ?? "#6b7280" }}
                        >
                          {dl === 0 ? "C" : String(dg?.dose_value ?? dl)}
                        </span>
                      </th>
                    );
                  })}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(row => {
              const recCells = recoveryCells.get(row.finding);
              const isSelected = selectedFinding != null && row.finding === selectedFinding;
              return (
                <tr
                  key={row.key}
                  className={`${onRowClick ? "cursor-pointer" : ""} ${isSelected ? "bg-accent/50" : "hover:bg-accent/30"}`}
                  onClick={onRowClick ? () => onRowClick(row.finding, row.domain) : undefined}
                >
                  {!compact && (
                    <td className={`${px} py-px ${domainText} font-semibold text-muted-foreground`} style={{ width: 1, whiteSpace: "nowrap" }}>
                      {row.domain}
                    </td>
                  )}
                  <td className={`${px} py-px`} style={{ width: "100%" }}>
                    <span className={`${rowText} ${isSelected ? "font-medium" : ""}`}>{row.label}</span>
                    {compact && (
                      <span className="ml-1 text-[9px] text-muted-foreground/60">{row.domain}</span>
                    )}
                  </td>
                  {doseGroups.map(dg => {
                    const cell = row.cells.get(dg.dose_level);
                    return (
                      <td key={dg.dose_level} className={`${thPx} py-px`} style={{ width: 1, whiteSpace: "nowrap" }}>
                        <CellRenderer cell={cell} cellW={cellW} cellH={cellH} cellText={cellText} displayMode={displayMode} />
                      </td>
                    );
                  })}
                  {/* Recovery cells */}
                  {hasRecovery && (
                    <>
                      <td className="px-0" style={{ width: 1 }}>
                        <div className={`mx-auto h-full ${RECOVERY_SEPARATOR}`} />
                      </td>
                      {recoveryDoseLevels.map(dl => {
                        let cell = recCells?.get(dl) ?? undefined;
                        // MA/CL/TF rows are never graded — override subject-level isGraded
                        if (cell && !row.isGraded) cell = { ...cell, isGraded: false };
                        return (
                          <td key={`rec_${dl}`} className={`${thPx} py-px`} style={{ width: 1, whiteSpace: "nowrap", backgroundColor: "#f7f8fa" }}>
                            <CellRenderer cell={cell} cellW={cellW} cellH={cellH} cellText={cellText} displayMode={displayMode} />
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

/** Format cell label: "3/5" in counts mode, "60%" in percent mode. */
function formatCellLabel(affected: number, n: number, mode: "counts" | "percent"): string {
  if (mode === "counts") return `${affected}/${n}`;
  const pct = n > 0 ? Math.round((affected / n) * 100) : 0;
  return `${pct}%`;
}

function CellRenderer({ cell, cellW = "w-16", cellH = "h-6", cellText = "text-[10px]", displayMode = "counts" }: {
  cell: MatrixCell | null | undefined;
  cellW?: string;
  cellH?: string;
  cellText?: string;
  displayMode?: "counts" | "percent";
}) {
  const base = `flex ${cellH} ${cellW} items-center justify-center rounded-sm`;

  // Not examined -- faint dash, no text prominence. Explicit white bg to resist recovery tint.
  if (!cell) {
    return (
      <div className={`${base} bg-white`} title="Not examined">
        <span className={`${cellText} italic text-muted-foreground/25`}>&mdash;</span>
      </div>
    );
  }

  // Examined, finding absent -- dashed envelope. Explicit white bg to resist recovery tint.
  if (cell.affected === 0) {
    return (
      <div className={`${base} border border-dashed border-gray-300 bg-white`}>
        <span className={`${cellText} font-mono text-muted-foreground/50`}>{formatCellLabel(0, cell.n, displayMode)}</span>
      </div>
    );
  }

  // Present but not graded (binary finding -- CL/MA)
  if (!cell.isGraded) {
    return (
      <div
        className={`${base}`}
        style={{ backgroundColor: BINARY_AFFECTED_FILL }}
        title={`${cell.affected}/${cell.n} present (ungraded)`}
      >
        <span className={`${cellText} font-mono font-medium`} style={{ color: "var(--foreground)" }}>{formatCellLabel(cell.affected, cell.n, displayMode)}</span>
      </div>
    );
  }

  // Graded -- cool-earth severity palette by mean severity
  const heat = getSeverityGradeColor(cell.avgSeverity ?? 0);
  const isOutlier = cell.maxSeverity >= 3 && cell.avgSeverity != null && (cell.maxSeverity - cell.avgSeverity) >= 2;
  return (
    <div
      className={base}
      style={{ backgroundColor: heat.bg, color: heat.text }}
      title={cell.avgSeverity != null ? `mean severity: ${cell.avgSeverity.toFixed(1)}${isOutlier ? `, max: ${cell.maxSeverity}` : ""}` : undefined}
    >
      <span className={`${cellText} font-mono font-medium`}>{formatCellLabel(cell.affected, cell.n, displayMode)}{isOutlier ? "*" : ""}</span>
    </div>
  );
}
