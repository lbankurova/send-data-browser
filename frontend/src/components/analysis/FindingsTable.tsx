import { cn } from "@/lib/utils";
import {
  getSeverityDotColor,
  formatPValue,
  formatEffectSize,
  getDirectionSymbol,
  getDirectionColor,
  formatDoseShortLabel,
} from "@/lib/severity-colors";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { DoseHeader } from "@/components/ui/DoseLabel";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";

interface FindingsTableProps {
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
}

export function FindingsTable({ findings, doseGroups }: FindingsTableProps) {
  const { selectedFindingId, selectFinding } = useFindingSelection();

  return (
    <div className="max-h-[60vh] overflow-auto">
      <table className="w-full text-xs">
        <thead className="sticky top-0 z-10 bg-background">
          <tr className="border-b bg-muted/30">
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Domain</th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Finding</th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sex</th>
            <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day</th>
            {doseGroups.map((dg) => (
              <th
                key={dg.dose_level}
                className="px-2 py-1.5 text-right text-[10px] font-semibold tracking-wider text-muted-foreground"
                title={dg.label}
              >
                <DoseHeader
                  level={dg.dose_level}
                  label={dg.dose_value != null
                    ? `${dg.dose_value}${dg.dose_unit ? ` ${dg.dose_unit}` : ""}`
                    : formatDoseShortLabel(dg.label)}
                />
              </th>
            ))}
            <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">p-value</th>
            <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Trend</th>
            <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dir</th>
            <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Effect</th>
            <th className="px-2 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Severity</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((f) => {
            const isSelected = selectedFindingId === f.id;

            return (
              <tr
                key={f.id}
                className={cn(
                  "cursor-pointer border-b transition-colors hover:bg-accent/50",
                  isSelected && "bg-accent"
                )}
                data-selected={isSelected ? "" : undefined}
                onClick={() => selectFinding(isSelected ? null : f)}
              >
                {/* Domain label — colored text only per design rule */}
                <td className="px-2 py-1">
                  <DomainLabel domain={f.domain} />
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
                  if (!gs) return (
                    <td key={dg.dose_level} className="px-2 py-1 text-right">—</td>
                  );

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
                <td className="px-2 py-1 text-right" data-evidence="">
                  <span className="ev font-mono text-muted-foreground">
                    {formatPValue(f.min_p_adj)}
                  </span>
                </td>

                {/* Trend p */}
                <td className="px-2 py-1 text-right" data-evidence="">
                  <span className="ev font-mono text-muted-foreground">
                    {formatPValue(f.trend_p)}
                  </span>
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
                <td className="px-2 py-1 text-right" data-evidence="">
                  <span className="ev font-mono text-muted-foreground">
                    {formatEffectSize(f.max_effect_size)}
                  </span>
                </td>

                {/* Severity */}
                <td className="px-2 py-1 text-center">
                  <span
                    className="inline-block border-l-2 pl-1.5 py-0.5 text-[10px] font-semibold text-gray-600"
                    style={{ borderLeftColor: getSeverityDotColor(f.severity) }}
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
