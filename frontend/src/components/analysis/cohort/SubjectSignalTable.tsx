/**
 * SubjectSignalTable — per-subject rows x signal columns.
 *
 * Replaces the per-finding x per-subject layout of CohortEvidenceTable
 * as the default "Subjects" tab. CohortEvidenceTable is preserved as
 * the "Organ detail" tab (activated on organ click).
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getDoseGroupColor, getNeutralHeatColor } from "@/lib/severity-colors";
import { shortDoseLabel } from "@/lib/dose-label-utils";
import type { CohortSubject, SubjectSyndromeProfile, RecoverySubjectProfile, NoaelSubjectOverlay } from "@/types/cohort";

const SEX_COLOR: Record<string, string> = { M: "#0891b2", F: "#ec4899" };

/** Recovery verdict severity rank for display. */
const VERDICT_COLOR: Record<string, string> = {
  reversed: "text-green-600",
  partially_reversed: "text-amber-600",
  persistent: "text-red-600",
  progressing: "text-red-600",
  anomaly: "text-muted-foreground",
};

export interface SubjectSignalRow {
  subject: CohortSubject;
  syndromeCount: number;
  organCount: number;
  maxMiSeverity: number;
  maxLbFold: number | null;
  bwDeltaPct: number | null;
  earliestOnset: number | null;
  recoverySummary: string | null;
  recoveryWorstVerdict: string | null;
  noaelDrivingCount: number;
  noaelRole: string;
}

interface Props {
  subjects: CohortSubject[];
  syndromes: Record<string, SubjectSyndromeProfile>;
  organCounts: Map<string, number>;
  histopathMap: Map<string, Map<string, { severity_num: number; severity: string | null }>>;
  onsetDays: Record<string, Record<string, number>>;
  recoveryVerdicts: Record<string, RecoverySubjectProfile>;
  noaelOverlay: Record<string, NoaelSubjectOverlay>;
  onSubjectClick: (id: string) => void;
  selectedSubjectId: string | null;
}

/** Compute signal rows for each subject. */
function computeSignalRows(
  subjects: CohortSubject[],
  syndromes: Record<string, SubjectSyndromeProfile>,
  organCounts: Map<string, number>,
  histopathMap: Map<string, Map<string, { severity_num: number; severity: string | null }>>,
  onsetDays: Record<string, Record<string, number>>,
  recoveryVerdicts: Record<string, RecoverySubjectProfile>,
  noaelOverlay: Record<string, NoaelSubjectOverlay>,
): SubjectSignalRow[] {
  return subjects.map((s) => {
    // Syndrome count
    const sp = syndromes[s.usubjid];
    const syndromeCount = sp ? (sp.syndrome_count ?? 0) + (sp.partial_count ?? 0) : 0;

    // Organ count
    const organCount = organCounts.get(s.usubjid) ?? 0;

    // Max MI severity
    const histo = histopathMap.get(s.usubjid);
    let maxMiSeverity = 0;
    if (histo) {
      for (const entry of histo.values()) {
        if (entry.severity_num > maxMiSeverity) maxMiSeverity = entry.severity_num;
      }
    }

    // BW terminal delta % and max LB fold — from NOAEL overlay (computed pre-stripping)
    const noael = noaelOverlay[s.usubjid];
    const maxLbFold = noael?.lb_max_fold ?? null;
    const bwDeltaPct = noael?.bw_terminal_pct ?? null;

    // Earliest onset day
    const days = onsetDays[s.usubjid];
    let earliestOnset: number | null = null;
    if (days) {
      const vals = Object.values(days);
      if (vals.length > 0) earliestOnset = Math.min(...vals);
    }

    // Recovery summary
    const rv = recoveryVerdicts[s.usubjid];
    let recoverySummary: string | null = null;
    let recoveryWorstVerdict: string | null = null;
    if (rv?.findings?.length) {
      const counts: Record<string, number> = {};
      let worstRank = -1;
      for (const f of rv.findings) {
        const v = f.verdict ?? "not_assessed";
        counts[v] = (counts[v] ?? 0) + 1;
        const rank = { reversed: 0, partially_reversed: 1, anomaly: 2, progressing: 3, persistent: 4 }[v] ?? -1;
        if (rank > worstRank) { worstRank = rank; recoveryWorstVerdict = v; }
      }
      const parts: string[] = [];
      if (counts.persistent) parts.push(`${counts.persistent}P`);
      if (counts.progressing) parts.push(`${counts.progressing}Prog`);
      if (counts.partially_reversed) parts.push(`${counts.partially_reversed}Part`);
      if (counts.reversed) parts.push(`${counts.reversed}R`);
      recoverySummary = parts.join(" ") || null;
    }

    // NOAEL overlay (noael already declared above for BW/LB)
    const noaelDrivingCount = noael?.noael_driving_count ?? 0;
    const noaelRole = noael?.noael_role ?? "none";

    return {
      subject: s,
      syndromeCount,
      organCount,
      maxMiSeverity,
      maxLbFold,
      bwDeltaPct,
      earliestOnset,
      recoverySummary,
      recoveryWorstVerdict,
      noaelDrivingCount,
      noaelRole,
    };
  });
}

export function SubjectSignalTable({
  subjects,
  syndromes,
  organCounts,
  histopathMap,
  onsetDays,
  recoveryVerdicts,
  noaelOverlay,
  onSubjectClick,
  selectedSubjectId,
}: Props) {
  const rows = useMemo(
    () => computeSignalRows(subjects, syndromes, organCounts, histopathMap, onsetDays, recoveryVerdicts, noaelOverlay),
    [subjects, syndromes, organCounts, histopathMap, onsetDays, recoveryVerdicts, noaelOverlay],
  );

  if (rows.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground">
        No subjects to display.
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="whitespace-nowrap px-2 py-1" style={{ width: "1px" }}>ID</th>
            <th className="whitespace-nowrap px-2 py-1" style={{ width: "1px" }}>Sex</th>
            <th className="whitespace-nowrap px-2 py-1" style={{ width: "1px" }}>Dose</th>
            <th className="whitespace-nowrap px-2 py-1" style={{ width: "1px" }}>Disp</th>
            <th className="whitespace-nowrap px-2 py-1 text-right" style={{ width: "1px" }}>Syn</th>
            <th className="whitespace-nowrap px-2 py-1 text-right" style={{ width: "1px" }}>Organs</th>
            <th className="whitespace-nowrap px-2 py-1 text-right" style={{ width: "1px" }}>MI max</th>
            <th className="whitespace-nowrap px-2 py-1 text-right" style={{ width: "1px" }}>LB fold</th>
            <th className="whitespace-nowrap px-2 py-1 text-right" style={{ width: "1px" }}>BW %</th>
            <th className="whitespace-nowrap px-2 py-1 text-right" style={{ width: "1px" }}>Onset</th>
            <th className="whitespace-nowrap px-2 py-1" style={{ width: "1px" }}>Recovery</th>
            <th className="whitespace-nowrap px-2 py-1 text-right" style={{ width: "1px" }}>NOAEL</th>
            <th className="px-2 py-1">{/* absorber */}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const s = row.subject;
            const pipeColor = getDoseGroupColor(s.doseGroupOrder);
            const isSelected = selectedSubjectId === s.usubjid;
            const isEarly = s.sacrificeDay != null && s.plannedDay != null && s.sacrificeDay < s.plannedDay;

            return (
              <tr
                key={s.usubjid}
                className={cn(
                  "cursor-pointer border-b border-gray-100 transition-colors",
                  isSelected ? "bg-accent" : "hover:bg-accent/30",
                )}
                onClick={() => onSubjectClick(s.usubjid)}
              >
                {/* ID with dose pipe */}
                <td className="whitespace-nowrap px-2 py-1" style={{ borderLeft: `3px solid ${pipeColor}` }}>
                  <span className="font-mono font-semibold">{s.usubjid}</span>
                </td>

                {/* Sex */}
                <td className="whitespace-nowrap px-2 py-1">
                  <span className="font-semibold" style={{ color: SEX_COLOR[s.sex] }}>{s.sex}</span>
                </td>

                {/* Dose */}
                <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                  {shortDoseLabel(s.doseLabel)}
                </td>

                {/* Disposition */}
                <td className="whitespace-nowrap px-2 py-1 text-muted-foreground">
                  {isEarly ? (
                    <span className="font-medium text-foreground">d{s.sacrificeDay}</span>
                  ) : s.isRecovery ? (
                    <span className="text-muted-foreground">Rec</span>
                  ) : (
                    <span>d{s.sacrificeDay ?? "?"}</span>
                  )}
                </td>

                {/* Syndrome count */}
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  {row.syndromeCount > 0 ? (
                    <span className="font-mono">{row.syndromeCount}</span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>

                {/* Organ count */}
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  {row.organCount > 0 ? (
                    <span className="font-mono" style={{ color: getNeutralHeatColor(row.organCount / 8).text, backgroundColor: getNeutralHeatColor(row.organCount / 8).bg, padding: "0 3px", borderRadius: "2px" }}>
                      {row.organCount}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>

                {/* Max MI severity */}
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  {row.maxMiSeverity > 0 ? (
                    <span className="font-mono" style={{ color: getNeutralHeatColor(row.maxMiSeverity / 5).text, backgroundColor: getNeutralHeatColor(row.maxMiSeverity / 5).bg, padding: "0 3px", borderRadius: "2px" }}>
                      {row.maxMiSeverity}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>

                {/* LB max fold */}
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  {row.maxLbFold != null && row.maxLbFold > 1.05 ? (
                    <span className={cn("font-mono", row.maxLbFold >= 2.0 ? "text-red-600" : row.maxLbFold >= 1.5 ? "text-amber-600" : "text-muted-foreground")}>
                      {row.maxLbFold.toFixed(1)}x
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>

                {/* BW delta % */}
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  {row.bwDeltaPct != null ? (
                    <span className={cn("font-mono", row.bwDeltaPct < -10 ? "text-red-600" : "text-muted-foreground")}>
                      {row.bwDeltaPct > 0 ? "+" : ""}{row.bwDeltaPct.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>

                {/* Earliest onset */}
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  {row.earliestOnset != null ? (
                    <span className="font-mono text-muted-foreground">d{row.earliestOnset}</span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>

                {/* Recovery summary */}
                <td className="whitespace-nowrap px-2 py-1">
                  {row.recoverySummary ? (
                    <span className={cn("font-mono text-[10px]", VERDICT_COLOR[row.recoveryWorstVerdict ?? ""] ?? "text-muted-foreground")}>
                      {row.recoverySummary}
                    </span>
                  ) : s.isRecovery ? (
                    <span className="text-muted-foreground">NE</span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>

                {/* NOAEL driving */}
                <td className="whitespace-nowrap px-2 py-1 text-right">
                  {row.noaelRole === "determining" ? (
                    <span className="font-mono font-medium text-foreground" title="NOAEL-determining subject">
                      {row.noaelDrivingCount}
                    </span>
                  ) : row.noaelRole === "contributing" ? (
                    <span className="font-mono text-muted-foreground" title="Contributing (above LOAEL)">
                      {row.noaelDrivingCount}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>

                {/* Absorber */}
                <td className="px-2 py-1" />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
