import { cn } from "@/lib/utils";
import { getPValueColor, formatPValue } from "@/lib/severity-colors";
import type { FindingContext } from "@/types/analysis";
import { DoseLabel } from "@/components/ui/DoseLabel";

// ─── Types ─────────────────────────────────────────────────

interface Props {
  statistics: FindingContext["statistics"];
  doseResponse: FindingContext["dose_response"];
}

// ─── Component ──────────────────────────────────────────────

export function DoseDetailPane({ statistics, doseResponse }: Props) {
  const isContinuous = statistics.data_type === "continuous";
  const testLabel = isContinuous
    ? "Pairwise: Dunnett\u2019s test (adjusted)"
    : "Pairwise: Fisher\u2019s exact test (Bonferroni-adjusted)";
  const trendTestName = isContinuous ? "Jonckheere-Terpstra" : "Cochran-Armitage";

  // Bar chart scaling
  const barValues = doseResponse.bars
    .map((b) => b.value)
    .filter((v): v is number => v != null);
  const maxVal = barValues.length > 0 ? Math.max(...barValues.map(Math.abs)) : 1;

  return (
    <div className="space-y-3">
      {/* Group comparison table */}
      <div className="max-h-60 overflow-auto">
        <table className="w-full text-[11px]">
          <thead>
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
              <th className="py-1 text-right font-medium">
                p-adj
                <div className="text-[9px] font-normal text-muted-foreground">{isContinuous ? "Dunnett\u2019s" : "Fisher\u2019s exact"}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {statistics.rows.map((row) => (
              <tr key={row.dose_level} className="border-b border-border/50">
                <td className="py-1">
                  <DoseLabel
                    level={row.dose_level}
                    label={row.dose_value != null && row.dose_value > 0
                      ? `${row.dose_value} ${row.dose_unit ?? ""}`.trim()
                      : "Control"}
                    tooltip={row.label}
                    className="text-[10px]"
                  />
                </td>
                <td className="py-1 text-right font-mono">{row.n}</td>
                {isContinuous ? (
                  <>
                    <td className="py-1 text-right font-mono">
                      {row.mean != null ? row.mean.toFixed(2) : "\u2014"}
                    </td>
                    <td className="py-1 text-right font-mono text-muted-foreground">
                      {row.sd != null ? row.sd.toFixed(2) : "\u2014"}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-1 text-right font-mono">
                      {row.affected ?? "\u2014"}
                    </td>
                    <td className="py-1 text-right font-mono">
                      {row.incidence != null
                        ? `${(row.incidence * 100).toFixed(0)}%`
                        : "\u2014"}
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

      {/* Test name label */}
      <div className="text-[9px] text-muted-foreground italic">{testLabel}</div>

      {/* Bar chart (from old DoseResponsePane) */}
      <div className="space-y-1">
        {doseResponse.bars.map((bar) => {
          const pct =
            bar.value != null && maxVal > 0
              ? (Math.abs(bar.value) / maxVal) * 100
              : 0;

          return (
            <div key={bar.dose_level} className="flex items-center gap-2">
              <span className="w-[50px] shrink-0 truncate text-right text-[10px] text-muted-foreground">
                {bar.dose_value != null ? bar.dose_value : bar.label}
              </span>
              <div className="flex-1">
                <div
                  className="h-4 rounded-sm bg-primary/30"
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
              <span className="w-[55px] shrink-0 text-right font-mono text-[10px]">
                {bar.value != null ? bar.value.toFixed(2) : "\u2014"}
                {bar.count != null && bar.total != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({bar.count}/{bar.total})
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Trend footer */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-muted-foreground">Trend:</span>
        <span className={cn("font-mono", getPValueColor(doseResponse.trend_p))}>
          {doseResponse.trend_p != null
            ? (formatPValue(doseResponse.trend_p).startsWith("<")
              ? `p${formatPValue(doseResponse.trend_p)}`
              : `p=${formatPValue(doseResponse.trend_p)}`)
            : "p=\u2014"}
        </span>
        <span className="text-[9px] text-muted-foreground">&middot; {trendTestName}</span>
      </div>
    </div>
  );
}
