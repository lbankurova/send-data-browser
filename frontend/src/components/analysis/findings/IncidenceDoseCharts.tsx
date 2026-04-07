/**
 * IncidenceDoseCharts — center panel layout for incidence endpoints (MI, MA, CL).
 *
 * Single stacked-by-grade vertical bar chart per endpoint. Doses on X, sex-grouped
 * bars at each dose, severity grade stacks within each affected portion. Recovery
 * cluster (when present) sits to the right of a dashed divider in the same chart.
 *
 * For CL/MA (no severity), bars render as solid neutral fills and the verdict
 * summary line is preserved below the chart.
 *
 * Component contract: see StackedSeverityIncidenceChart.tsx and the
 * findings-stacked-severity-chart spec.
 */
import { useMemo } from "react";
import { StackedSeverityIncidenceChart } from "@/components/analysis/charts/StackedSeverityIncidenceChart";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { getVerdictLabel, RECOVERY_VERDICT_CLASS } from "@/lib/recovery-labels";
import {
  buildClusterData,
  buildRecoveryClusterData,
  extractVerdicts,
} from "./incidence-chart-data";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";

interface Props {
  findings: UnifiedFinding[];
  endpointLabel: string;
  doseGroups: DoseGroup[];
  selectedDay: number | null;
  hasRecovery: boolean;
  recoveryData?: RecoveryComparisonResponse;
}

export function IncidenceDoseCharts({
  findings,
  endpointLabel,
  doseGroups,
  selectedDay,
  hasRecovery,
  recoveryData,
}: Props) {
  const { selectedFinding } = useFindingSelection();

  const domain = selectedFinding?.domain ?? "";
  const findingName = selectedFinding?.finding ?? "";
  const hasSeverity = domain === "MI";

  // Filter findings to this endpoint
  const epFindings = useMemo(
    () => findings.filter((f) => (f.endpoint_label ?? f.finding) === endpointLabel),
    [findings, endpointLabel],
  );

  // ── Main arm data ─────────────────────────────────────────
  const mainCluster = useMemo(
    () => buildClusterData(epFindings, doseGroups, selectedDay),
    [epFindings, doseGroups, selectedDay],
  );

  // ── Recovery arm data ─────────────────────────────────────
  const incidenceRows = useMemo(
    () => recoveryData?.incidence_rows ?? [],
    [recoveryData],
  );

  const recoveryCluster = useMemo(
    () => hasRecovery
      ? buildRecoveryClusterData(incidenceRows, findingName, domain, doseGroups)
      : undefined,
    [hasRecovery, incidenceRows, findingName, domain, doseGroups],
  );

  // Pass recovery only when it actually has groups (caller-side gate per
  // buildRecoveryClusterData contract: empty groups[] = "no recovery").
  const recoveryForChart = recoveryCluster && recoveryCluster.groups.length > 0
    ? recoveryCluster
    : undefined;

  // ── Verdict summary (CL/MA only) ─────────────────────────
  const verdicts = useMemo(
    () => (!hasSeverity && recoveryForChart) ? extractVerdicts(incidenceRows, findingName, domain, doseGroups) : [],
    [hasSeverity, recoveryForChart, incidenceRows, findingName, domain, doseGroups],
  );

  // Shared dose unit (e.g. "mg/kg") rendered once on the X axis. Prefer the
  // backend-computed `shared_unit` (null if mixed); fall back to the first
  // treated group's `dose_unit`.
  const xAxisUnit = useMemo(() => {
    const shared = doseGroups.find((dg) => dg.shared_unit)?.shared_unit;
    if (shared) return shared;
    const firstWithUnit = doseGroups.find((dg) => dg.dose_value != null && dg.dose_unit);
    return firstWithUnit?.dose_unit ?? undefined;
  }, [doseGroups]);

  if (mainCluster.groups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No incidence data for this endpoint.
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <StackedSeverityIncidenceChart
          main={mainCluster}
          recovery={recoveryForChart}
          hasSeverity={hasSeverity}
          xAxisUnit={xAxisUnit ?? undefined}
        />
      </div>

      {/* Verdict summary line (CL/MA only) */}
      {verdicts.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-1 px-2 py-1 text-[9px]">
          {verdicts.map((v, i) => (
            <span key={v.label} className="whitespace-nowrap">
              {i > 0 && <span className="text-muted-foreground/40 mr-1">{"\u00b7"}</span>}
              <span className="text-muted-foreground/60">{v.label}: </span>
              <span className={RECOVERY_VERDICT_CLASS[v.verdict] ?? "text-muted-foreground"}>
                {getVerdictLabel(v.verdict)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
