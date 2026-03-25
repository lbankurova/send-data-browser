/**
 * IncidenceRecoveryChart — paired horizontal bars for incidence recovery.
 *
 * Shows terminal vs recovery incidence side-by-side per dose group.
 * MI findings: stacked severity grade bars within each incidence bar.
 * CL/MA findings: solid incidence bars (no severity data).
 * F/M rows within each dose group, dose-colored labels.
 *
 * Data source: incidence_rows from /recovery-comparison API.
 */
import { useMemo } from "react";
import { getDoseGroupColor, getSexColor, getNeutralHeatColor } from "@/lib/severity-colors";
import { getVerdictLabel, RECOVERY_VERDICT_COLOR } from "@/lib/recovery-labels";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";

type IncidenceRow = NonNullable<RecoveryComparisonResponse["incidence_rows"]>[number];

interface IncidenceRecoveryChartProps {
  rows: IncidenceRow[];
  /** Recovery sacrifice day for header label. */
  recoveryDay?: number | null;
  /** Terminal sacrifice day for header label. */
  terminalDay?: number | null;
  /** Compact mode for narrower context panel rendering. */
  compact?: boolean;
}

// ── Severity grade palette ──────────────────────────────

const GRADE_SCORES = [0.1, 0.3, 0.5, 0.7, 0.9];
const GRADE_COLORS = GRADE_SCORES.map((s) => getNeutralHeatColor(s).bg);
const GRADE_LABELS = ["Minimal", "Mild", "Moderate", "Marked", "Severe"];

// ── Layout constants ────────────────────────────────────

const LAYOUT = {
  normal: { ROW_H: 18, BAR_H: 12, BAR_MAX_W: 120, LABEL_W: 70, COUNT_W: 40, GAP: 12 },
  compact: { ROW_H: 16, BAR_H: 10, BAR_MAX_W: 90, LABEL_W: 60, COUNT_W: 36, GAP: 8 },
} as const;

// ── Component ───────────────────────────────────────────

export function IncidenceRecoveryChart({ rows, recoveryDay, terminalDay, compact = false }: IncidenceRecoveryChartProps) {
  const L = compact ? LAYOUT.compact : LAYOUT.normal;

  // Group by dose_level, then sex within dose
  const { doseLevels, sexes, rowMap } = useMemo(() => {
    const levels = new Set<number>();
    const sxs = new Set<string>();
    const map = new Map<string, IncidenceRow>(); // "doseLevel_sex" -> row
    for (const r of rows) {
      if (r.dose_level === 0) continue; // skip control
      levels.add(r.dose_level);
      sxs.add(r.sex);
      map.set(`${r.dose_level}_${r.sex}`, r);
    }
    return {
      doseLevels: [...levels].sort((a, b) => a - b),
      sexes: [...sxs].sort(), // F before M
      rowMap: map,
    };
  }, [rows]);

  // Dose labels from row data
  const doseLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of rows) {
      if (!map.has(r.dose_level) && r.dose_level > 0) {
        // Extract short dose from dose_label: "3 (200 mg/kg)" → "200 mg/kg"
        const m = r.dose_label.match(/\(([^)]+)\)/);
        map.set(r.dose_level, m ? m[1] : r.dose_label);
      }
    }
    return map;
  }, [rows]);

  // Verdict summary: one entry per dose (or per dose+sex if verdicts differ)
  const verdictSummary = useMemo(() => {
    const entries: { label: string; verdict: string }[] = [];
    for (const dl of doseLevels) {
      const doseLabel = doseLabelMap.get(dl) ?? `Dose ${dl}`;
      if (sexes.length <= 1) {
        const r = rowMap.get(`${dl}_${sexes[0]}`);
        if (r?.verdict) entries.push({ label: doseLabel, verdict: r.verdict });
      } else {
        // Check if verdicts differ across sexes
        const verdicts = sexes.map((s) => rowMap.get(`${dl}_${s}`)?.verdict).filter(Boolean);
        const unique = new Set(verdicts);
        if (unique.size <= 1 && verdicts[0]) {
          entries.push({ label: doseLabel, verdict: verdicts[0] });
        } else {
          // Different verdicts per sex — show each
          for (const sex of sexes) {
            const r = rowMap.get(`${dl}_${sex}`);
            if (r?.verdict) entries.push({ label: `${doseLabel} ${sex}`, verdict: r.verdict });
          }
        }
      }
    }
    return entries;
  }, [doseLevels, sexes, rowMap, doseLabelMap]);

  const multiSex = sexes.length > 1;
  const hasSeverity = rows.some((r) => r.main_severity_counts || r.recovery_severity_counts);

  if (doseLevels.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center text-[10px] text-muted-foreground/60 gap-4">
        <span style={{ width: L.LABEL_W }} />
        <span className="font-medium" style={{ width: L.BAR_MAX_W + L.COUNT_W, textAlign: "center" }}>
          Terminal{terminalDay != null ? ` (D${terminalDay})` : ""}
        </span>
        <span style={{ width: L.GAP }} />
        <span className="font-medium" style={{ width: L.BAR_MAX_W + L.COUNT_W, textAlign: "center" }}>
          Recovery{recoveryDay != null ? ` (D${recoveryDay})` : ""}
        </span>
      </div>

      {/* Dose rows */}
      {doseLevels.map((dl) => (
        <div key={dl} className="space-y-0">
          {sexes.map((sex) => {
            const r = rowMap.get(`${dl}_${sex}`);
            if (!r) return null;
            const mainInc = r.main_n > 0 ? r.main_affected / r.main_n : 0;
            const recInc = r.recovery_n > 0 ? r.recovery_affected / r.recovery_n : 0;

            return (
              <div key={sex} className="flex items-center" style={{ height: L.ROW_H }}>
                {/* Dose label (first sex row only) or sex indicator */}
                <div className="shrink-0 flex items-center gap-1" style={{ width: L.LABEL_W }}>
                  {(sex === sexes[0]) ? (
                    <span
                      className="font-mono text-[10px] border-l-2 pl-1.5 truncate"
                      style={{ borderLeftColor: getDoseGroupColor(dl) }}
                    >
                      {doseLabelMap.get(dl) ?? `Dose ${dl}`}
                    </span>
                  ) : (
                    <span className="pl-3 text-[10px] text-muted-foreground/40" />
                  )}
                  {multiSex && (
                    <span className="text-[9px] font-medium" style={{ color: getSexColor(sex) }}>
                      {sex}
                    </span>
                  )}
                </div>

                {/* Terminal bar */}
                <IncidenceBar
                  proportion={mainInc}
                  affected={r.main_affected}
                  total={r.main_n}
                  severityCounts={r.main_severity_counts}
                  barMaxW={L.BAR_MAX_W}
                  barH={L.BAR_H}
                  countW={L.COUNT_W}
                />

                {/* Gap */}
                <div style={{ width: L.GAP }} />

                {/* Recovery bar */}
                <IncidenceBar
                  proportion={recInc}
                  affected={r.recovery_affected}
                  total={r.recovery_n}
                  severityCounts={r.recovery_severity_counts}
                  barMaxW={L.BAR_MAX_W}
                  barH={L.BAR_H}
                  countW={L.COUNT_W}
                />
              </div>
            );
          })}
        </div>
      ))}

      {/* Verdict summary — below chart, one line */}
      {verdictSummary.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-1 text-[9px] pt-0.5">
          {verdictSummary.map((v, i) => (
            <span key={v.label} className="whitespace-nowrap">
              {i > 0 && <span className="text-muted-foreground/40 mr-1">{"\u00b7"}</span>}
              <span className="text-muted-foreground/60">{v.label}: </span>
              <span className={RECOVERY_VERDICT_COLOR[v.verdict] ?? "text-muted-foreground"}>
                {getVerdictLabel(v.verdict)}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Severity legend (MI only) */}
      {hasSeverity && (
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground/50 pt-1">
          {GRADE_LABELS.map((label, i) => (
            <span key={label} className="inline-flex items-center gap-0.5">
              <span
                className="inline-block rounded-sm"
                style={{ width: 8, height: 8, backgroundColor: GRADE_COLORS[i] }}
              />
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bar sub-component ───────────────────────────────────

function IncidenceBar({
  proportion,
  affected,
  total,
  severityCounts,
  barMaxW,
  barH,
  countW,
}: {
  proportion: number;
  affected: number;
  total: number;
  severityCounts?: Record<string, number> | null;
  barMaxW: number;
  barH: number;
  countW: number;
}) {
  const barW = Math.round(proportion * barMaxW);

  // Severity segments (MI only)
  const segments = useMemo(() => {
    if (!severityCounts || affected === 0) return null;
    const grades: { grade: number; count: number; color: string }[] = [];
    let sumCount = 0;
    for (let g = 1; g <= 5; g++) {
      const count = severityCounts[String(g)] ?? 0;
      if (count > 0) {
        grades.push({ grade: g, count, color: GRADE_COLORS[g - 1] });
        sumCount += count;
      }
    }
    if (sumCount === 0) return null;
    // Convert counts to proportional widths within the bar
    return grades.map((seg) => ({
      ...seg,
      width: Math.max(1, Math.round((seg.count / sumCount) * barW)),
    }));
  }, [severityCounts, affected, barW]);

  return (
    <div className="flex items-center" style={{ width: barMaxW + countW }}>
      {/* Bar */}
      <div
        className="relative"
        style={{ width: barMaxW, height: barH }}
        title={`${affected}/${total} (${total > 0 ? Math.round(proportion * 100) : 0}%)`}
      >
        {/* Background track */}
        <div
          className="absolute inset-0 bg-muted/20 rounded-sm"
          style={{ width: barMaxW }}
        />
        {/* Filled portion */}
        {barW > 0 && (
          segments ? (
            // Stacked severity segments
            <div className="absolute top-0 left-0 flex h-full rounded-sm overflow-hidden">
              {segments.map((seg) => (
                <div
                  key={seg.grade}
                  style={{ width: seg.width, height: barH, backgroundColor: seg.color }}
                  title={`${GRADE_LABELS[seg.grade - 1]}: ${seg.count}`}
                />
              ))}
            </div>
          ) : (
            // Solid bar (CL/MA — no severity)
            <div
              className="absolute top-0 left-0 rounded-sm"
              style={{ width: barW, height: barH, backgroundColor: "#94A3B8" }}
            />
          )
        )}
      </div>
      {/* Count label */}
      <span
        className="text-[9px] tabular-nums text-muted-foreground/60 text-right"
        style={{ width: countW }}
      >
        {affected}/{total}
      </span>
    </div>
  );
}
