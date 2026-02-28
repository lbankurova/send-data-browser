import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { getPValueColor, formatPValue, getSexColor, getDoseGroupColor } from "@/lib/severity-colors";
import type { FindingContext } from "@/types/analysis";
import { DoseLabel } from "@/components/ui/DoseLabel";

// ─── Types ─────────────────────────────────────────────────

type StatRow = FindingContext["statistics"]["rows"][number];
type BarEntry = FindingContext["dose_response"]["bars"][number];

interface Props {
  statistics: FindingContext["statistics"];
  doseResponse: FindingContext["dose_response"];
  /** Sex of the selected finding — used for bar coloring (M=blue, F=pink). */
  sex?: string;
  /** Sibling sex statistics (opposite sex, same endpoint). */
  siblingStatistics?: FindingContext["statistics"];
  /** Sibling dose-response bars. */
  siblingDoseResponse?: FindingContext["dose_response"];
  /** The sibling's sex code. */
  siblingSex?: string;
}

// ─── Helpers ──────────────────────────────────────────────

function doseDisplayLabel(row: { dose_value: number | null; dose_unit: string | null; label?: string }, fallback?: string): string {
  if (row.dose_value != null && row.dose_value > 0) {
    return `${row.dose_value} ${row.dose_unit ?? ""}`.trim();
  }
  return fallback ?? "Control";
}

// ─── Single-sex stat row ──────────────────────────────────

function StatRowCells({ row, isContinuous }: { row: StatRow; isContinuous: boolean }) {
  return (
    <>
      <td className="py-0.5 text-right font-mono">{row.n}</td>
      {isContinuous ? (
        <>
          <td className="py-0.5 text-right font-mono">
            {row.mean != null ? row.mean.toFixed(2) : "\u2014"}
          </td>
          <td className="py-0.5 text-right font-mono text-muted-foreground">
            {row.sd != null ? row.sd.toFixed(2) : "\u2014"}
          </td>
        </>
      ) : (
        <>
          <td className="py-0.5 text-right font-mono">{row.affected ?? "\u2014"}</td>
          <td className="py-0.5 text-right font-mono">
            {row.incidence != null ? `${(row.incidence * 100).toFixed(0)}%` : "\u2014"}
          </td>
        </>
      )}
      <td className={cn("py-0.5 text-right font-mono", getPValueColor(row.p_value_adj))}>
        {formatPValue(row.p_value_adj)}
      </td>
    </>
  );
}

// ─── Component ──────────────────────────────────────────────

export function DoseDetailPane({ statistics, doseResponse, sex, siblingStatistics, siblingDoseResponse, siblingSex }: Props) {
  const isContinuous = statistics.data_type === "continuous";
  const testLabel = isContinuous
    ? "Pairwise: Dunnett\u2019s test (adjusted)"
    : "Pairwise: Fisher\u2019s exact test (Bonferroni-adjusted)";
  const trendTestName = isContinuous ? "Jonckheere-Terpstra" : "Cochran-Armitage";
  const doseUnit = statistics.rows.find(r => r.dose_unit)?.dose_unit ?? "";

  const hasSibling = siblingStatistics != null && siblingSex != null;

  // Combined bar chart scaling (include sibling bars when present)
  const allBars: BarEntry[] = [...doseResponse.bars];
  if (hasSibling && siblingDoseResponse) {
    allBars.push(...siblingDoseResponse.bars);
  }
  const barValues = allBars.map(b => b.value).filter((v): v is number => v != null);
  const maxVal = barValues.length > 0 ? Math.max(...barValues.map(Math.abs)) : 1;

  // Build a map from dose_level → sibling row for quick lookup
  const siblingRowMap = new Map<number, StatRow>();
  if (hasSibling) {
    for (const r of siblingStatistics!.rows) {
      siblingRowMap.set(r.dose_level, r);
    }
  }

  const siblingBarMap = new Map<number, BarEntry>();
  if (hasSibling && siblingDoseResponse) {
    for (const b of siblingDoseResponse.bars) {
      siblingBarMap.set(b.dose_level, b);
    }
  }

  return (
    <div className="space-y-3">
      {/* Group comparison table */}
      <div>
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b">
              <th className="py-1 text-left font-medium">Group</th>
              {hasSibling && <th className="py-1 text-left font-medium">Sex</th>}
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
                <div className="text-[9px] font-normal text-muted-foreground">
                  {isContinuous ? "Dunnett\u2019s" : "Fisher\u2019s exact"}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {hasSibling ? (
              // ── Combined F/M rows per dose level (alphabetical: F first) ──
              statistics.rows.map((row) => {
                const sibRow = siblingRowMap.get(row.dose_level);
                // Sort alphabetically: F before M
                const pairs: Array<{ sexLabel: string; data: StatRow }> = [];
                pairs.push({ sexLabel: sex ?? "M", data: row });
                if (sibRow) pairs.push({ sexLabel: siblingSex!, data: sibRow });
                pairs.sort((a, b) => a.sexLabel.localeCompare(b.sexLabel));

                return (
                  <Fragment key={row.dose_level}>
                    {pairs.map((p, i) => (
                      <tr
                        key={p.sexLabel}
                        className={i === pairs.length - 1
                          ? "border-b border-border/50"
                          : "border-b border-border/20"}
                      >
                        {/* Group label only on first row of each dose level */}
                        {i === 0 ? (
                          <td className="py-0.5" rowSpan={pairs.length}>
                            <DoseLabel
                              level={row.dose_level}
                              label={doseDisplayLabel(row)}
                              tooltip={row.label}
                              className="text-[10px]"
                            />
                          </td>
                        ) : null}
                        <td className="py-0.5 text-[9px] text-muted-foreground">
                          {p.sexLabel}
                        </td>
                        <StatRowCells row={p.data} isContinuous={isContinuous} />
                      </tr>
                    ))}
                  </Fragment>
                );
              })
            ) : (
              // ── Single-sex rows (original layout) ──
              statistics.rows.map((row) => (
                <tr key={row.dose_level} className="border-b border-border/50">
                  <td className="py-1">
                    <DoseLabel
                      level={row.dose_level}
                      label={doseDisplayLabel(row)}
                      tooltip={row.label}
                      className="text-[10px]"
                    />
                  </td>
                  <StatRowCells row={row} isContinuous={isContinuous} />
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Test name label */}
      <div className="text-[9px] text-muted-foreground italic">{testLabel}</div>

      {/* Significance summary footer */}
      {(() => {
        const sigDoses = statistics.rows
          .filter(r => r.dose_level > 0 && r.p_value_adj != null && r.p_value_adj < 0.05)
          .map(r => doseDisplayLabel(r, r.label));
        const method = isContinuous ? "Dunnett\u2019s" : "Fisher\u2019s exact";
        return sigDoses.length > 0 ? (
          <div className="text-[10px] text-foreground/80">
            Significant at {sigDoses.join(", ")} ({method}).
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground">
            No significant pairwise differences ({method}).
          </div>
        );
      })()}

      {/* Bar chart */}
      <div className="space-y-1">
        {hasSibling && siblingDoseResponse ? (
          // ── Side-by-side F / M charts (alphabetical: F left, M right) ──
          (() => {
            // Resolve which data belongs to F vs M
            const fSex = (sex ?? "M") === "F" ? sex! : siblingSex!;
            const mSex = fSex === sex ? siblingSex! : sex ?? "M";
            const fBars = fSex === sex ? doseResponse.bars : siblingDoseResponse.bars;
            const mBars = mSex === sex ? doseResponse.bars : siblingDoseResponse.bars;
            const fBarMap = new Map(fBars.map(b => [b.dose_level, b]));
            const mBarMap = new Map(mBars.map(b => [b.dose_level, b]));

            return (
              <div className="flex gap-2">
                {/* Females: dose label + bar + value */}
                <div className="flex-1 min-w-0">
                  <div className="mb-0.5 text-center text-[9px] font-medium text-muted-foreground">Females</div>
                  <div className="space-y-1">
                    {doseResponse.bars.map((refBar) => {
                      const bar = fBarMap.get(refBar.dose_level);
                      const val = bar?.value;
                      const pct = val != null && maxVal > 0 ? (Math.abs(val) / maxVal) * 100 : 0;
                      return (
                        <div key={refBar.dose_level} className="flex h-[18px] items-center gap-1">
                          <span className="w-[60px] shrink-0 text-right inline-flex justify-end">
                            <DoseLabel
                              level={refBar.dose_level}
                              label={refBar.dose_value != null && refBar.dose_value > 0
                                ? `${refBar.dose_value} ${doseUnit}`.trim()
                                : "Control"}
                              align="right"
                              className="text-[9px]"
                            />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div
                              className="h-[2.5px] rounded-full"
                              style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: "#d1d5db" }}
                            />
                          </div>
                          <span className="w-[38px] shrink-0 text-right font-mono text-[9px]">
                            {val != null ? val.toFixed(2) : "\u2014"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Males: colored pipe + bar + value */}
                <div className="flex-1 min-w-0">
                  <div className="mb-0.5 text-center text-[9px] font-medium text-muted-foreground">Males</div>
                  <div className="space-y-1">
                    {doseResponse.bars.map((refBar) => {
                      const bar = mBarMap.get(refBar.dose_level);
                      const val = bar?.value;
                      const pct = val != null && maxVal > 0 ? (Math.abs(val) / maxVal) * 100 : 0;
                      return (
                        <div key={refBar.dose_level} className="flex h-[18px] items-center gap-1">
                          <span className="w-[60px] shrink-0 inline-flex justify-end items-center">
                            <span
                              className="w-[2px] h-[10px] rounded-full"
                              style={{ backgroundColor: getDoseGroupColor(refBar.dose_level) }}
                            />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div
                              className="h-[2.5px] rounded-full"
                              style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: "#d1d5db" }}
                            />
                          </div>
                          <span className="w-[38px] shrink-0 text-right font-mono text-[9px]">
                            {val != null ? val.toFixed(2) : "\u2014"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()
        ) : (
          // ── Single-sex bars (original layout) ──
          doseResponse.bars.map((bar) => {
            const pct = bar.value != null && maxVal > 0
              ? (Math.abs(bar.value) / maxVal) * 100
              : 0;
            const barColor = sex === "M" || sex === "F" ? getSexColor(sex) : undefined;

            return (
              <div key={bar.dose_level} className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-right">
                  <DoseLabel
                    level={bar.dose_level}
                    label={bar.dose_value != null && bar.dose_value > 0
                      ? `${bar.dose_value} ${doseUnit}`.trim()
                      : "Control"}
                    align="right"
                    className="text-[10px]"
                  />
                </span>
                <div className="flex-1">
                  <div
                    className="h-[2.5px] rounded-full"
                    style={{
                      width: `${Math.max(pct, 2)}%`,
                      backgroundColor: barColor ?? "#d1d5db",
                    }}
                  />
                </div>
                <span className="w-[55px] shrink-0 text-right font-mono text-[10px]">
                  {bar.value != null ? bar.value.toFixed(2) : "\u2014"}
                  {bar.count != null && bar.total != null && (
                    <span className="text-muted-foreground">
                      {" "}({bar.count}/{bar.total})
                    </span>
                  )}
                </span>
              </div>
            );
          })
        )}
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
