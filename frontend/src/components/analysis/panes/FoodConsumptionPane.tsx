import { Fragment, useMemo, useState } from "react";
import type { FoodConsumptionContext } from "@/lib/syndrome-interpretation-types";
import type { FoodConsumptionSummaryResponse } from "@/lib/syndrome-interpretation-types";
import type { DoseGroup } from "@/types/analysis";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { getDoseLabel } from "@/lib/dose-label-utils";

// ─── Verdict config ─────────────────────────────────────────

function getVerdictConfig(assessment: FoodConsumptionContext["bwFwAssessment"]) {
  switch (assessment) {
    case "primary_weight_loss":
      return {
        label: "Primary weight loss",
        description: "BW loss disproportionate to food intake reduction",
        borderClass: "border-l-4 pl-1.5 py-0.5",
        borderColor: "#D97706",
        labelClass: "text-sm font-semibold text-foreground",
        headerLabel: "Primary weight loss",
        headerBorderClass: "border-l-4 pl-1.5",
        headerBorderColor: "#D97706",
        headerTextClass: "font-medium text-foreground",
      };
    case "secondary_to_food":
      return {
        label: "Secondary to reduced intake",
        description: "BW and FC decreased proportionally -- FE preserved",
        borderClass: "",
        borderColor: undefined,
        labelClass: "text-sm font-medium text-muted-foreground",
        headerLabel: "Secondary to intake",
        headerBorderClass: "",
        headerBorderColor: undefined,
        headerTextClass: "text-muted-foreground",
      };
    case "malabsorption":
      return {
        label: "Indeterminate",
        description: "Borderline pattern -- review FE dose-response below",
        borderClass: "border-l-2 pl-1.5 py-0.5",
        borderColor: "currentColor",
        labelClass: "text-sm font-medium text-foreground",
        headerLabel: "Indeterminate",
        headerBorderClass: "border-l-2 pl-1.5",
        headerBorderColor: undefined,
        headerTextClass: "font-medium text-foreground",
      };
    default:
      return {
        label: "No effect",
        description: "No effect on body weight or food consumption",
        borderClass: "",
        borderColor: undefined,
        labelClass: "text-xs text-muted-foreground",
        headerLabel: "No effect",
        headerBorderClass: "",
        headerBorderColor: undefined,
        headerTextClass: "text-muted-foreground",
      };
  }
}

// ─── Header right badge ─────────────────────────────────────

export function FoodConsumptionHeaderRight({ assessment }: { assessment: FoodConsumptionContext["bwFwAssessment"] }) {
  const cfg = getVerdictConfig(assessment);
  return (
    <span
      className={`${cfg.headerBorderClass} ${cfg.headerTextClass}`}
      style={cfg.headerBorderColor ? { borderLeftColor: cfg.headerBorderColor } : undefined}
    >
      {cfg.headerLabel}
    </span>
  );
}

// ─── Raw metrics sub-table ──────────────────────────────────

function RawMetricsTable({ title, data, getDoseLabelFn }: {
  title: string;
  data: {
    periods: Array<{
      label: string;
      rows: Array<{ dose: number; values: (number | null)[] }>;
    }>;
    sexes: string[];
  };
  getDoseLabelFn: (level: number) => string;
}) {
  if (data.periods.length === 0) return null;
  return (
    <div>
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="text-[10px] text-muted-foreground">
            <th className="text-left font-semibold uppercase tracking-wider pr-2 pb-0.5">{title}</th>
            {data.periods.map((p, pi) => (
              <th key={pi} colSpan={data.sexes.length} className="text-right font-medium pb-0.5 pl-1 pr-0.5">
                {p.label}
              </th>
            ))}
          </tr>
          <tr className="text-[10px] text-muted-foreground/60 border-b border-muted-foreground/15">
            <th className="pb-0.5" />
            {data.periods.map((_p, pi) => (
              <Fragment key={pi}>
                {data.sexes.map(sex => (
                  <th key={sex} className="text-right font-normal pb-0.5 pl-1 pr-0.5">{sex}</th>
                ))}
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.periods[0].rows.map((row, ri) => (
            <tr key={ri} className="text-muted-foreground/60">
              <td className="py-0.5 pr-2">
                <span
                  className="border-l-2 pl-1.5 font-mono whitespace-nowrap"
                  style={{ borderLeftColor: getDoseGroupColor(row.dose) }}
                >
                  {getDoseLabelFn(row.dose)}
                </span>
              </td>
              {data.periods.map((p, pi) => (
                <Fragment key={pi}>
                  {data.sexes.map((_sex, si) => (
                    <td key={si} className="text-right pl-1 pr-0.5 py-0.5 font-mono tabular-nums">
                      {p.rows[ri]?.values[si]?.toFixed(2) ?? "\u2014"}
                    </td>
                  ))}
                </Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main pane content ──────────────────────────────────────

export function FoodConsumptionPane({
  context,
  rawData,
  doseGroups,
}: {
  context: FoodConsumptionContext;
  rawData?: FoodConsumptionSummaryResponse;
  doseGroups?: DoseGroup[];
}) {
  const [showRaw, setShowRaw] = useState(false);
  const verdict = getVerdictConfig(context.bwFwAssessment);

  // ── Key stats: extract highest-dose per-sex data ──
  const keyStats = useMemo(() => {
    if (!rawData?.periods?.length) return null;
    const termPeriod = rawData.periods[rawData.periods.length - 1];
    if (!termPeriod) return null;
    const entries = termPeriod.by_dose_sex;
    const sexes = [...new Set(entries.map(e => e.sex))].sort();

    const bySex = sexes.map(sex => {
      const sexEntries = entries.filter(e => e.sex === sex);
      const maxDose = Math.max(...sexEntries.map(e => e.dose_level));
      const e = sexEntries.find(x => x.dose_level === maxDose);
      if (!e) return null;
      const feCtrl = e.food_efficiency_control;
      const fePct = feCtrl && feCtrl > 0 ? Math.round(((e.mean_food_efficiency - feCtrl) / feCtrl) * 100) : null;
      return {
        sex: sex as string,
        bwPct: e.bw_pct_change as number | null,
        fcPct: e.fw_pct_change as number | null,
        fePct,
        doseLabel: getDoseLabel(maxDose, doseGroups),
      };
    }).filter((s): s is NonNullable<typeof s> => s != null);

    if (!bySex.length) return null;
    const recPeriod = rawData.periods.find(p => p.label?.toLowerCase().includes("recov"));
    let recoverySex: Array<{ sex: string; bwRecovered: boolean | null; fcRecovered: boolean | null }> | null = null;

    if (recPeriod) {
      recoverySex = sexes.map(sex => {
        const sexEntries = recPeriod.by_dose_sex.filter(e => e.sex === sex);
        const sexMaxDose = Math.max(...sexEntries.map(e => e.dose_level));
        const e = sexEntries.find(x => x.dose_level === sexMaxDose);
        if (!e) return null;
        const bwRecovered = e.bw_pct_change != null ? Math.abs(e.bw_pct_change) < 5 : null;
        const fcRecovered = e.fw_pct_change != null ? Math.abs(e.fw_pct_change) < 5 : null;
        return { sex, bwRecovered, fcRecovered };
      }).filter((s): s is NonNullable<typeof s> => s != null);
    } else if (rawData.recovery?.available) {
      recoverySex = sexes.map(sex => ({
        sex,
        bwRecovered: rawData.recovery?.bw_recovered ?? null,
        fcRecovered: rawData.recovery?.fw_recovered ?? null,
      }));
    }

    return { bySex, recoverySex };
  }, [rawData, doseGroups]);

  // ── Period data for FE by dose ──
  const periodData = useMemo(() => {
    if (!rawData?.periods) return [];
    return rawData.periods.map((p) => {
      const entries = p.by_dose_sex;
      const sexes = [...new Set(entries.map((e) => e.sex))].sort();
      const doseLevels = [0, ...new Set(entries.filter((e) => e.dose_level > 0).map((e) => e.dose_level))].sort((a, b) => a - b);
      const uniqueDoses = [...new Set(doseLevels)].sort((a, b) => a - b);

      const lookup = new Map(entries.map((e) => [`${e.dose_level}_${e.sex}`, e]));

      const doseRows = uniqueDoses.map((dose) => {
        const sexData = sexes.map((sex) => {
          const e = lookup.get(`${dose}_${sex}`);
          if (!e) return { sex, fe: null, pct: null, reduced: false };
          const ctrl = e.food_efficiency_control;
          const pct = ctrl && ctrl > 0 ? ((e.mean_food_efficiency - ctrl) / ctrl) * 100 : null;
          return { sex, fe: e.mean_food_efficiency, pct: pct != null ? Math.round(pct) : null, reduced: e.food_efficiency_reduced ?? false };
        });
        return { dose, sexData, anyReduced: sexData.some((s) => s.reduced) };
      });

      return {
        label: p.label,
        startDay: p.start_day,
        endDay: p.end_day,
        doseRows,
      };
    });
  }, [rawData]);

  // ── Raw metrics data for toggle ──
  const rawMetrics = useMemo(() => {
    if (!rawData?.periods) return null;
    const periods = rawData.periods;
    const sexes = [...new Set(periods.flatMap(p => p.by_dose_sex.map(e => e.sex)))].sort();
    const doseLevels = [...new Set(periods.flatMap(p => p.by_dose_sex.map(e => e.dose_level)))].sort((a, b) => a - b);

    const buildTable = (getValue: (e: { mean_food_efficiency: number; mean_fw: number; mean_bw_gain: number }) => number) => {
      return {
        periods: periods.map(p => ({
          label: p.label ?? `Days ${p.start_day}\u2013${p.end_day}`,
          rows: doseLevels.map(dose => ({
            dose,
            values: sexes.map(sex => {
              const e = p.by_dose_sex.find(e => e.dose_level === dose && e.sex === sex);
              return e ? getValue(e) : null;
            }),
          })),
        })),
        sexes,
      };
    };

    return {
      fe: buildTable(e => e.mean_food_efficiency),
      fc: buildTable(e => e.mean_fw),
      bw: buildTable(e => e.mean_bw_gain),
    };
  }, [rawData]);

  return (
    <div>
      {verdict.description && (
        <div className="text-[11px] text-muted-foreground">{verdict.description}</div>
      )}

      {keyStats && (
        <div className="mt-1.5 space-y-0.5">
          {keyStats.bySex.map(s => {
            const hasEdgeCase = s.fcPct != null && s.fcPct > 0 && s.bwPct != null && s.bwPct < 0;
            const rec = keyStats.recoverySex?.find(r => r.sex === s.sex);
            const fmtPct = (v: number | null, threshold: number) => {
              if (v == null) return null;
              const text = `${v > 0 ? "+" : ""}${Math.round(v)}%`;
              return <span className={Math.abs(v) >= threshold ? "font-medium text-foreground" : "text-muted-foreground"}>{text}</span>;
            };
            return (
              <div key={s.sex} className="text-[11px]">
                <span className="inline-block font-medium text-foreground" style={{ width: 46 }}>{s.sex === "M" ? "Males" : "Females"}</span>
                {s.bwPct != null && (
                  <span className="inline-block" style={{ width: 52 }}>
                    <span className="text-muted-foreground">BW </span>
                    <span className="tabular-nums font-mono">{fmtPct(s.bwPct, 10)}</span>
                  </span>
                )}
                {s.fcPct != null && (
                  <span className="inline-block" style={{ width: 52 }} title="Food consumption">
                    <span className="text-muted-foreground">FC </span>
                    <span className="tabular-nums font-mono">{fmtPct(s.fcPct, 10)}</span>
                  </span>
                )}
                {s.fePct != null && (
                  <span className="inline-block" style={{ width: 52 }} title="Food efficiency">
                    <span className="text-muted-foreground">FE </span>
                    <span className="tabular-nums font-mono">{fmtPct(s.fePct, 20)}</span>
                  </span>
                )}
                <span className="inline-block" style={{ width: 80 }}>
                  <span className="text-muted-foreground">at {s.doseLabel}</span>
                </span>
                {rec && (
                  <span className="inline-block">
                    <span className="text-muted-foreground">Recovery: </span>
                    {rec.bwRecovered != null && (
                      <span className="inline-block" style={{ width: 36 }}>
                        <span className="text-muted-foreground">BW </span>
                        <span className={rec.bwRecovered ? "text-muted-foreground" : "font-medium text-foreground"}>
                          {rec.bwRecovered ? "yes" : "no"}
                        </span>
                      </span>
                    )}
                    {rec.fcRecovered != null && (
                      <span className="inline-block" style={{ width: 36 }}>
                        <span className="text-muted-foreground">FC </span>
                        <span className={rec.fcRecovered ? "text-muted-foreground" : "font-medium text-foreground"}>
                          {rec.fcRecovered ? "yes" : "no"}
                        </span>
                      </span>
                    )}
                  </span>
                )}
                {hasEdgeCase && (
                  <span className="font-medium text-foreground ml-1.5">-- weight loss despite increased intake</span>
                )}
              </div>
            );
          })}
          {!keyStats.recoverySex && rawData?.recovery && !rawData.recovery.available && (
            <div className="text-[11px] text-muted-foreground italic">Recovery: no recovery arm</div>
          )}
        </div>
      )}

      {periodData.length > 0 && (
        <div className="mt-2.5">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-[10px] text-muted-foreground">
                <th
                  className="text-left font-semibold uppercase tracking-wider pr-2 pb-0.5"
                  title="Food efficiency = body weight gain / food consumed per period. Values shown as mean FE with % change vs control."
                >
                  FE by dose
                </th>
                {periodData.map((period, pi) => (
                  <th key={pi} colSpan={4} className="text-right font-medium pb-0.5 pl-1 pr-0.5">
                    {period.label ?? `Days ${period.startDay}\u2013${period.endDay}`}
                  </th>
                ))}
              </tr>
              <tr className="text-[10px] text-muted-foreground/60 border-b border-muted-foreground/15">
                <th className="pb-0.5" />
                {periodData.map((_p, pi) => (
                  <Fragment key={pi}>
                    <th colSpan={2} className="text-right font-normal pb-0.5 pl-1 pr-0.5">M</th>
                    <th colSpan={2} className="text-right font-normal pb-0.5 pl-1 pr-0.5">F</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {(periodData[0]?.doseRows ?? []).map(({ dose }) => {
                const rowReduced = periodData.some(p =>
                  p.doseRows.find(r => r.dose === dose)?.anyReduced
                );
                return (
                  <tr
                    key={dose}
                    className={rowReduced ? "font-medium text-foreground" : "text-muted-foreground/60"}
                  >
                    <td className="py-0.5 pr-2">
                      <span
                        className="border-l-2 pl-1.5 font-mono whitespace-nowrap"
                        style={{ borderLeftColor: getDoseGroupColor(dose) }}
                      >
                        {getDoseLabel(dose, doseGroups)}
                      </span>
                    </td>
                    {periodData.map((period, pi) => {
                      const row = period.doseRows.find(r => r.dose === dose);
                      const mData = row?.sexData.find(s => s.sex === "M");
                      const fData = row?.sexData.find(s => s.sex === "F");
                      return (
                        <Fragment key={pi}>
                          <td className="text-right pl-1 py-0.5 font-mono tabular-nums">
                            {mData?.fe != null ? mData.fe.toFixed(2) : "\u2014"}
                          </td>
                          <td className="text-right pr-1 py-0.5 font-mono tabular-nums">
                            {mData?.pct != null ? <span className={rowReduced ? "" : "text-muted-foreground/60"}>({mData.pct > 0 ? "+" : ""}{mData.pct}%)</span> : ""}
                          </td>
                          <td className="text-right pl-1 py-0.5 font-mono tabular-nums">
                            {fData?.fe != null ? fData.fe.toFixed(2) : "\u2014"}
                          </td>
                          <td className="text-right pr-1 py-0.5 font-mono tabular-nums">
                            {fData?.pct != null ? <span className={rowReduced ? "" : "text-muted-foreground/60"}>({fData.pct > 0 ? "+" : ""}{fData.pct}%)</span> : ""}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2">
        <button
          className="text-[11px] text-primary cursor-pointer hover:underline"
          onClick={() => setShowRaw(!showRaw)}
          aria-expanded={showRaw}
        >
          {showRaw ? "Hide raw metrics \u25be" : "Show raw metrics \u25b8"}
        </button>
        {showRaw && rawMetrics && (
          <div className="mt-1.5 space-y-3">
            <RawMetricsTable title="FE" data={rawMetrics.fe} getDoseLabelFn={(l) => getDoseLabel(l, doseGroups)} />
            <RawMetricsTable title="FC" data={rawMetrics.fc} getDoseLabelFn={(l) => getDoseLabel(l, doseGroups)} />
            <RawMetricsTable title="BW gain" data={rawMetrics.bw} getDoseLabelFn={(l) => getDoseLabel(l, doseGroups)} />
          </div>
        )}
      </div>
    </div>
  );
}
