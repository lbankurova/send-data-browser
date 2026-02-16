import { useMemo } from "react";
import type { SignalSummaryRow, SignalSelection } from "@/types/analysis-views";
import {
  getSignalScoreHeatmapColor,
  getSignificanceStars,
  formatDoseShortLabel,
} from "@/lib/severity-colors";
import { DoseHeader } from "@/components/ui/DoseLabel";

interface Props {
  data: SignalSummaryRow[];
  selection: SignalSelection | null;
  onSelect: (sel: SignalSelection | null) => void;
}

export function SignalHeatmap({ data, selection, onSelect }: Props) {
  // Group by endpoint_label (rows) and dose_label (columns)
  const { endpoints, doseLabels, cellMap } = useMemo(() => {
    // Get unique dose labels in order
    const doseLevels = [...new Set(data.map((r) => r.dose_level))].sort(
      (a, b) => a - b
    );
    const dlMap = new Map<number, string>();
    for (const r of data) {
      dlMap.set(r.dose_level, r.dose_label);
    }
    const doseLabels = doseLevels.map((dl) => ({
      level: dl,
      label: formatDoseShortLabel(dlMap.get(dl) ?? `Dose ${dl}`),
    }));

    // Aggregate: for each endpoint x dose, take max signal score
    const cellMap = new Map<string, SignalSummaryRow>();
    for (const row of data) {
      const key = `${row.endpoint_label}__${row.dose_level}`;
      const existing = cellMap.get(key);
      if (!existing || row.signal_score > existing.signal_score) {
        cellMap.set(key, row);
      }
    }

    // Sort endpoints by max signal score desc
    const epScores = new Map<string, number>();
    for (const row of data) {
      const cur = epScores.get(row.endpoint_label) ?? 0;
      if (row.signal_score > cur) {
        epScores.set(row.endpoint_label, row.signal_score);
      }
    }
    const endpoints = [...epScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => label);

    return { endpoints, doseLabels, cellMap };
  }, [data]);

  if (endpoints.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
        No signals to display
      </div>
    );
  }

  // Limit display to top 30 endpoints to keep it readable
  const displayEndpoints = endpoints.slice(0, 30);

  return (
    <div className="overflow-auto">
      <div
        className="inline-grid gap-px"
        style={{
          gridTemplateColumns: `180px repeat(${doseLabels.length}, 70px)`,
        }}
      >
        {/* Header row */}
        <div className="sticky left-0 z-10 bg-background px-2 py-1 text-[10px] font-semibold text-muted-foreground">
          Endpoint
        </div>
        {doseLabels.map((dl) => (
          <div
            key={dl.level}
            className="px-1 py-1 text-center text-[10px] font-semibold text-muted-foreground"
          >
            <DoseHeader level={dl.level} label={dl.label} />
          </div>
        ))}

        {/* Data rows */}
        {displayEndpoints.map((ep) => (
          <>
            <div
              key={`label-${ep}`}
              className="sticky left-0 z-10 truncate bg-background px-2 py-1 text-[11px]"
              title={ep}
            >
              {ep}
            </div>
            {doseLabels.map((dl) => {
              const key = `${ep}__${dl.level}`;
              const cell = cellMap.get(key);
              const score = cell?.signal_score ?? 0;
              const stars = cell ? getSignificanceStars(cell.p_value) : "";
              const isSelected =
                selection &&
                selection.endpoint_label === ep &&
                selection.dose_level === dl.level;

              return (
                <div
                  key={`cell-${ep}-${dl.level}`}
                  className="flex cursor-pointer items-center justify-center py-1 text-[10px] font-medium transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: getSignalScoreHeatmapColor(score),
                    color: score >= 0.5 ? "#fff" : "#374151",
                    outline: isSelected
                      ? "2px solid #3b82f6"
                      : "1px solid rgba(0,0,0,0.05)",
                    outlineOffset: isSelected ? "-2px" : "0",
                  }}
                  title={`${ep} @ ${dl.label}: score=${score.toFixed(3)}${stars ? ` (${stars})` : ""}`}
                  onClick={() => {
                    if (!cell) return;
                    if (isSelected) {
                      onSelect(null);
                    } else {
                      onSelect({
                        endpoint_label: cell.endpoint_label,
                        dose_level: cell.dose_level,
                        sex: cell.sex,
                        domain: cell.domain,
                        test_code: cell.test_code,
                        organ_system: cell.organ_system,
                      });
                    }
                  }}
                >
                  {score > 0 ? (
                    <>
                      <span>{score.toFixed(2)}</span>
                      {stars && stars !== "ns" && (
                        <span className="ml-0.5 text-[9px]">{stars}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground/30">-</span>
                  )}
                </div>
              );
            })}
          </>
        ))}
      </div>

      {endpoints.length > 30 && (
        <div className="mt-1 px-2 text-[10px] text-muted-foreground">
          Showing top 30 of {endpoints.length} endpoints
        </div>
      )}
    </div>
  );
}
