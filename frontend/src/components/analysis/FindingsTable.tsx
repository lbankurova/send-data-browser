import { cn } from "@/lib/utils";
import {
  getSeverityBadgeClasses,
  getPValueColor,
  getEffectSizeColor,
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  getDirectionColor,
  getDomainBadgeColor,
} from "@/lib/severity-colors";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";

interface FindingsTableProps {
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
}

export function FindingsTable({ findings, doseGroups }: FindingsTableProps) {
  const { selectedFindingId, selectFinding } = useFindingSelection();

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b bg-muted/50">
            <th className="px-2 py-1.5 text-left font-medium">Domain</th>
            <th className="px-2 py-1.5 text-left font-medium">Finding</th>
            <th className="px-2 py-1.5 text-left font-medium">Sex</th>
            <th className="px-2 py-1.5 text-left font-medium">Day</th>
            {doseGroups.map((dg) => (
              <th
                key={dg.dose_level}
                className="px-2 py-1.5 text-right font-medium"
                title={dg.label}
              >
                {dg.dose_value != null
                  ? `${dg.dose_value}${dg.dose_unit ? ` ${dg.dose_unit}` : ""}`
                  : dg.label}
              </th>
            ))}
            <th className="px-2 py-1.5 text-right font-medium">p-value</th>
            <th className="px-2 py-1.5 text-right font-medium">Trend</th>
            <th className="px-2 py-1.5 text-center font-medium">Dir</th>
            <th className="px-2 py-1.5 text-right font-medium">Effect</th>
            <th className="px-2 py-1.5 text-center font-medium">Severity</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => {
            const isSelected = selectedFindingId === f.id;
            const domainColor = getDomainBadgeColor(f.domain);

            return (
              <tr
                key={f.id}
                className={cn(
                  "cursor-pointer border-b transition-colors hover:bg-accent/50",
                  isSelected && "bg-accent"
                )}
                onClick={() => selectFinding(isSelected ? null : f)}
              >
                {/* Domain badge */}
                <td className="px-2 py-1">
                  <span
                    className={cn(
                      "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                      domainColor.bg,
                      domainColor.text
                    )}
                  >
                    {f.domain}
                  </span>
                </td>

                {/* Finding name */}
                <td className="max-w-[200px] truncate px-2 py-1" title={f.finding}>
                  {f.specimen ? (
                    <>
                      <span className="text-muted-foreground">
                        {f.specimen}:{" "}
                      </span>
                      {f.finding}
                    </>
                  ) : (
                    f.finding
                  )}
                </td>

                {/* Sex */}
                <td className="px-2 py-1">{f.sex}</td>

                {/* Day */}
                <td className="px-2 py-1 text-muted-foreground">
                  {f.day ?? "—"}
                </td>

                {/* Values per dose group */}
                {doseGroups.map((dg) => {
                  const gs = f.group_stats.find(
                    (g) => g.dose_level === dg.dose_level
                  );
                  if (!gs) return <td key={dg.dose_level} className="px-2 py-1 text-right">—</td>;

                  if (f.data_type === "continuous") {
                    return (
                      <td
                        key={dg.dose_level}
                        className="px-2 py-1 text-right font-mono"
                      >
                        {gs.mean != null ? gs.mean.toFixed(2) : "—"}
                      </td>
                    );
                  }
                  // incidence
                  return (
                    <td
                      key={dg.dose_level}
                      className="px-2 py-1 text-right font-mono"
                    >
                      {gs.affected != null && gs.n
                        ? `${gs.affected}/${gs.n}`
                        : "—"}
                    </td>
                  );
                })}

                {/* Min p-value */}
                <td
                  className={cn(
                    "px-2 py-1 text-right font-mono",
                    getPValueColor(f.min_p_adj)
                  )}
                >
                  {formatPValue(f.min_p_adj)}
                </td>

                {/* Trend p */}
                <td
                  className={cn(
                    "px-2 py-1 text-right font-mono",
                    getPValueColor(f.trend_p)
                  )}
                >
                  {formatPValue(f.trend_p)}
                </td>

                {/* Direction */}
                <td
                  className={cn(
                    "px-2 py-1 text-center text-sm",
                    getDirectionColor(f.direction)
                  )}
                >
                  {getDirectionSymbol(f.direction)}
                </td>

                {/* Effect size */}
                <td
                  className={cn(
                    "px-2 py-1 text-right font-mono",
                    getEffectSizeColor(f.max_effect_size)
                  )}
                >
                  {formatEffectSize(f.max_effect_size)}
                </td>

                {/* Severity */}
                <td className="px-2 py-1 text-center">
                  <span
                    className={cn(
                      "inline-block rounded-sm px-1.5 py-0.5 text-[10px] font-medium",
                      getSeverityBadgeClasses(f.severity)
                    )}
                  >
                    {f.severity}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
