/**
 * CohortEvidenceTable — center panel: organ toggle, shared findings bar,
 * side-by-side group summary + subject detail tables.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getNeutralHeatColor, getDoseGroupColor, formatDoseShortLabel } from "@/lib/severity-colors";
import type { OrganSignal, CohortFindingRow, SharedFinding, CohortSubject } from "@/types/cohort";
import type { DoseGroup } from "@/types/analysis";

const SEX_COLOR: Record<string, string> = { M: "#0891b2", F: "#ec4899" };

const SEVERITY_PILL: Record<string, string> = {
  adverse: "text-red-600",
  warning: "text-amber-600",
  normal: "text-muted-foreground",
};

interface Props {
  organSignals: OrganSignal[];
  selectedOrgan: string | null;
  onOrganChange: (organ: string | null) => void;
  sharedFindings: SharedFinding[];
  selectedSubjectCount: number;
  findingRows: CohortFindingRow[];
  displaySubjects: CohortSubject[];
  allSubjects: CohortSubject[];
  doseGroups: DoseGroup[];
  hoveredRow: string | null;
  onRowHover: (key: string | null) => void;
  onSubjectClick: (id: string) => void;
  onFindingClick: (findingId: string) => void;
  truncated: boolean;
}

export function CohortEvidenceTable({
  organSignals,
  selectedOrgan,
  onOrganChange,
  sharedFindings,
  selectedSubjectCount,
  findingRows,
  displaySubjects,
  doseGroups,
  hoveredRow,
  onRowHover,
  onSubjectClick,
  onFindingClick,
  truncated,
}: Props) {
  // Dose groups represented in display subjects (for group table columns)
  const representedDoseGroups = useMemo(() => {
    const orders = new Set(displaySubjects.map((s) => s.doseGroupOrder));
    return doseGroups
      .filter((dg) => orders.has(dg.dose_level) || dg.dose_level === 0)
      .sort((a, b) => a.dose_level - b.dose_level);
  }, [displaySubjects, doseGroups]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header: organ toggle + shared findings */}
      <div className="flex items-center gap-3 border-b px-3 py-1.5">
        {organSignals.length > 0 && (
          <div className="flex items-center gap-1">
            {organSignals.map((o) => (
              <button
                key={o.organName}
                type="button"
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-medium transition-colors",
                  selectedOrgan === o.organName
                    ? "bg-background shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                style={selectedOrgan === o.organName ? { color: SEVERITY_PILL[o.worstSeverity] ? undefined : undefined } : undefined}
                onClick={() => onOrganChange(o.organName)}
              >
                <span className={cn(SEVERITY_PILL[o.worstSeverity])}>{o.organName}</span>
              </button>
            ))}
          </div>
        )}
        {/* Shared findings bar */}
        {selectedSubjectCount >= 2 && sharedFindings.length > 0 && (
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-[10px]">
            <span className="shrink-0 font-semibold text-muted-foreground">
              All {selectedSubjectCount} share &middot;
            </span>
            {sharedFindings.slice(0, 8).map((sf) => (
              <span key={`${sf.domain}-${sf.finding}`} className="flex shrink-0 items-center gap-0.5">
                <span className="font-semibold text-muted-foreground">{sf.domain}</span>
                <span className="text-foreground">{sf.finding}</span>
                {sf.direction && sf.direction !== "none" && (
                  <span className={sf.direction === "up" ? "text-red-500" : "text-blue-500"}>
                    {sf.direction === "up" ? "\u2191" : "\u2193"}
                  </span>
                )}
                <span className="text-muted-foreground">&middot;</span>
              </span>
            ))}
          </div>
        )}
        {selectedSubjectCount >= 2 && sharedFindings.length === 0 && (
          <span className="text-[10px] text-muted-foreground">
            No findings common to all {selectedSubjectCount} subjects
          </span>
        )}
      </div>

      {/* Truncation warning */}
      {truncated && (
        <div className="border-b bg-amber-50 px-3 py-1 text-[10px] text-amber-700">
          Showing first 20 subjects. Narrow your selection for detailed comparison.
        </div>
      )}

      {/* Tables */}
      {findingRows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          {selectedOrgan
            ? `No findings recorded for ${selectedOrgan} in the selected subjects`
            : "Select an organ to view findings"}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left: Group summary table */}
          <div className="w-[280px] shrink-0 overflow-y-auto border-r">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr>
                  <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>Dom</th>
                  <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Finding</th>
                  {representedDoseGroups.map((dg) => (
                    <th
                      key={dg.dose_level}
                      className={cn(
                        "px-2 py-1 text-center text-[10px] font-semibold",
                        dg.dose_level === 0 ? "italic text-muted-foreground bg-muted/10" : "text-foreground",
                      )}
                      style={{ width: 1, whiteSpace: "nowrap" }}
                    >
                      {dg.dose_level === 0 ? "Ctrl" : formatDoseShortLabel(dg.label)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {findingRows.map((row) => (
                  <tr
                    key={row.key}
                    className={cn(
                      "cursor-pointer transition-colors",
                      hoveredRow === row.key ? "bg-accent/40" : "hover:bg-accent/20",
                    )}
                    onMouseEnter={() => onRowHover(row.key)}
                    onMouseLeave={() => onRowHover(null)}
                    onClick={() => onFindingClick(row.findingId)}
                  >
                    <td className="px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>{row.domain}</td>
                    <td className="max-w-[140px] truncate px-2 py-0.5">{row.finding}</td>
                    {representedDoseGroups.map((dg) => {
                      const gs = row.groupStats.find((g) => g.doseLevel === dg.dose_level);
                      return (
                        <td
                          key={dg.dose_level}
                          className={cn(
                            "px-2 py-0.5 text-center font-mono text-[11px]",
                            dg.dose_level === 0 && "bg-muted/10 text-muted-foreground",
                          )}
                          style={{ width: 1, whiteSpace: "nowrap" }}
                        >
                          <GroupCell row={row} stat={gs ?? null} isControl={dg.dose_level === 0} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right: Subject detail table */}
          <div className="min-w-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 z-10 bg-background">
                <tr>
                  {displaySubjects.map((s) => (
                    <th
                      key={s.usubjid}
                      className="cursor-pointer px-1.5 py-1 text-center hover:bg-accent/30"
                      style={{ width: 1, whiteSpace: "nowrap" }}
                      onClick={() => onSubjectClick(s.usubjid)}
                    >
                      <div className="font-mono text-[10px] font-semibold">{s.usubjid.split("-").pop()}</div>
                      <div className="flex items-center justify-center gap-0.5 text-[9px]">
                        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: getDoseGroupColor(s.doseGroupOrder) }} />
                        <span style={{ color: SEX_COLOR[s.sex] }}>{s.sex}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {findingRows.map((row) => (
                  <tr
                    key={row.key}
                    className={cn(
                      "cursor-pointer transition-colors",
                      hoveredRow === row.key ? "bg-accent/40" : "hover:bg-accent/20",
                    )}
                    onMouseEnter={() => onRowHover(row.key)}
                    onMouseLeave={() => onRowHover(null)}
                    onClick={() => onFindingClick(row.findingId)}
                  >
                    {displaySubjects.map((s) => {
                      const hasAnySubjectValues = Object.keys(row.subjectValues).length > 0;
                      return (
                        <td key={s.usubjid} className="px-1.5 py-0.5 text-center font-mono text-[11px]" style={{ width: 1, whiteSpace: "nowrap" }}>
                          {hasAnySubjectValues ? (
                            <SubjectCell value={row.subjectValues[s.usubjid]} domain={row.domain} />
                          ) : (
                            /* Incidence domains without per-subject data: show dot for dose group match */
                            <span className="text-muted-foreground text-[10px]">&middot;</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cell renderers ───────────────────────────────────────────

function GroupCell({ row, stat, isControl }: { row: CohortFindingRow; stat: { n: number; mean: number | null; affected: number | null; incidence: number | null } | null; isControl: boolean }) {
  if (!stat) return <span className="text-muted-foreground">&mdash;</span>;

  const dom = row.domain;
  if (dom === "MI" || dom === "MA" || dom === "CL") {
    // Incidence: n/N
    if (stat.affected != null && stat.n > 0) {
      return <>{stat.affected}/{stat.n}</>;
    }
    if (stat.incidence != null) {
      return <>{(stat.incidence * 100).toFixed(0)}%</>;
    }
    return <span className="text-muted-foreground">&mdash;</span>;
  }
  // Continuous: fold-change or % change
  if (stat.mean == null) return <span className="text-muted-foreground">&mdash;</span>;
  if (dom === "OM" || dom === "BW") {
    // % change — group_stats may have mean_pct_change but we use mean as-is if it's already a ratio
    const pct = stat.mean;
    if (isControl) return <>{pct.toFixed(1)}</>;
    return (
      <span className={pct > 0 ? "text-red-500" : pct < 0 ? "text-blue-500" : ""}>
        {pct > 0 ? "+" : ""}{pct.toFixed(0)}%
      </span>
    );
  }
  // LB: fold-change
  if (isControl) return <>{stat.mean.toFixed(1)}</>;
  return <>{stat.mean.toFixed(1)}&times;</>;
}

function SubjectCell({ value, domain }: { value: number | string | null | undefined; domain: string }) {
  if (value == null || value === undefined) {
    return <span className="text-muted-foreground">&mdash;</span>;
  }

  if (domain === "MI") {
    const sev = typeof value === "number" ? value : parseInt(String(value), 10);
    if (isNaN(sev)) return <span className="text-muted-foreground">&mdash;</span>;
    // getNeutralHeatColor expects 0-1 score; severity 1-5 → normalize
    const heat = getNeutralHeatColor(sev / 5);
    return (
      <span
        className="inline-flex h-5 w-6 items-center justify-center rounded text-[11px] font-semibold"
        style={{ background: heat.bg, color: heat.text }}
      >
        {sev}
      </span>
    );
  }

  if (domain === "MA") {
    return <span className="text-foreground">{value ? "\u2713" : "\u2014"}</span>;
  }

  if (domain === "LB") {
    const num = typeof value === "number" ? value : parseFloat(String(value));
    if (isNaN(num)) return <>{value}</>;
    const dir = num > 1.1 ? "up" : num < 0.9 ? "down" : "none";
    return (
      <span className={dir === "up" ? "text-red-500" : dir === "down" ? "text-blue-500" : ""}>
        {num.toFixed(1)}&times;{dir === "up" ? "\u2191" : dir === "down" ? "\u2193" : ""}
      </span>
    );
  }

  if (domain === "OM" || domain === "BW") {
    const num = typeof value === "number" ? value : parseFloat(String(value));
    if (isNaN(num)) return <>{value}</>;
    return (
      <span className={num > 0 ? "text-red-500" : num < 0 ? "text-blue-500" : ""}>
        {num > 0 ? "+" : ""}{num.toFixed(0)}%
      </span>
    );
  }

  if (domain === "CL") {
    return <span>d{value}&rarr;</span>;
  }

  return <>{String(value)}</>;
}
