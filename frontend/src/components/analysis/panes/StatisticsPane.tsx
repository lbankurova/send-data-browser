import { cn } from "@/lib/utils";
import { getPValueColor, formatPValue, getDoseGroupColor } from "@/lib/severity-colors";
import type { FindingContext } from "@/types/analysis";
import { InsightBlock } from "./InsightBlock";

interface Props {
  data: FindingContext["statistics"];
}

export function StatisticsPane({ data }: Props) {
  const isContinuous = data.data_type === "continuous";

  return (
    <div className="space-y-3">
      <InsightBlock insights={data.insights} />

      {/* Group comparison table */}
      <div className="max-h-60 overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b">
              <th className="py-1 text-left font-medium">Group</th>
              <th className="py-1 text-right font-medium">n</th>
              {isContinuous ? (
                <>
                  <th className="py-1 text-right font-medium">Mean</th>
                  <th className="py-1 text-right font-medium">SD</th>
                </>
              ) : (
                <>
                  <th className="py-1 text-right font-medium">Aff</th>
                  <th className="py-1 text-right font-medium">Inc%</th>
                </>
              )}
              <th className="py-1 text-right font-medium">p-adj</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.dose_level} className="border-b border-border/50">
                <td className="py-1 font-mono text-[10px]">
                  <span className="inline-block border-l-2 pl-1.5" style={{ borderLeftColor: getDoseGroupColor(row.dose_level) }} title={row.label}>
                    {row.dose_value != null && row.dose_value > 0
                      ? `${row.dose_value} ${row.dose_unit ?? ""}`.trim()
                      : "Control"}
                  </span>
                </td>
                <td className="py-1 text-right font-mono">{row.n}</td>
                {isContinuous ? (
                  <>
                    <td className="py-1 text-right font-mono">
                      {row.mean != null ? row.mean.toFixed(2) : "—"}
                    </td>
                    <td className="py-1 text-right font-mono text-muted-foreground">
                      {row.sd != null ? row.sd.toFixed(2) : "—"}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-1 text-right font-mono">
                      {row.affected ?? "—"}
                    </td>
                    <td className="py-1 text-right font-mono">
                      {row.incidence != null
                        ? `${(row.incidence * 100).toFixed(0)}%`
                        : "—"}
                    </td>
                  </>
                )}
                <td
                  className={cn(
                    "py-1 text-right font-mono",
                    getPValueColor(row.p_value_adj)
                  )}
                >
                  {formatPValue(row.p_value_adj)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Trend test */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Trend:</span>
        <span className={cn("font-mono", getPValueColor(data.trend_p))}>
          p={formatPValue(data.trend_p)}
        </span>
        {data.unit && (
          <span className="ml-auto text-muted-foreground">
            Unit: {data.unit}
          </span>
        )}
      </div>
    </div>
  );
}
