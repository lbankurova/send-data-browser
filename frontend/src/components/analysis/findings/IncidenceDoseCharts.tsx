/**
 * IncidenceDoseCharts — center panel layout for incidence endpoints (MI, MA, CL).
 *
 * Completely replaces the continuous D-R framework for incidence findings.
 * Two chart variants:
 *   MI (has severity): incidence left + severity right, both with recovery below
 *   CL/MA (no severity): main incidence left + recovery incidence right
 *
 * Uses the existing ECharts builders from histopathology-charts.ts.
 */
import { useMemo } from "react";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import {
  buildDoseIncidenceBarOption,
  buildDoseSeverityBarOption,
} from "@/components/analysis/charts/histopathology-charts";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { getVerdictLabel, RECOVERY_VERDICT_COLOR } from "@/lib/recovery-labels";
import {
  buildMainIncidenceGroups,
  buildMainSeverityGroups,
  buildRecoveryIncidenceGroups,
  buildRecoverySeverityGroups,
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
  const { groups: mainIncGroups, sexKeys } = useMemo(
    () => buildMainIncidenceGroups(epFindings, doseGroups, selectedDay),
    [epFindings, doseGroups, selectedDay],
  );

  const mainSevGroups = useMemo(
    () => hasSeverity ? buildMainSeverityGroups(epFindings, doseGroups, selectedDay) : [],
    [hasSeverity, epFindings, doseGroups, selectedDay],
  );

  // ── Recovery arm data ─────────────────────────────────────
  const incidenceRows = recoveryData?.incidence_rows ?? [];

  const recoveryIncGroups = useMemo(
    () => hasRecovery ? buildRecoveryIncidenceGroups(incidenceRows, findingName, domain) : undefined,
    [hasRecovery, incidenceRows, findingName, domain],
  );

  const recoverySevGroups = useMemo(
    () => (hasRecovery && hasSeverity)
      ? buildRecoverySeverityGroups(incidenceRows, findingName, domain)
      : undefined,
    [hasRecovery, hasSeverity, incidenceRows, findingName, domain],
  );

  const hasRecoveryData = (recoveryIncGroups?.length ?? 0) > 0;

  // ── Chart options ─────────────────────────────────────────
  const incidenceOption = useMemo(() => {
    if (mainIncGroups.length === 0) return null;
    // MI: include recovery in this chart. CL/MA: main arm only (recovery goes to right panel)
    const recGroups = hasSeverity ? recoveryIncGroups : undefined;
    return buildDoseIncidenceBarOption(mainIncGroups, sexKeys, "scaled", recGroups);
  }, [mainIncGroups, sexKeys, "scaled", hasSeverity, recoveryIncGroups]);

  const rightChartOption = useMemo(() => {
    if (hasSeverity) {
      // MI: severity chart with recovery below
      if (mainSevGroups.length === 0) return null;
      return buildDoseSeverityBarOption(mainSevGroups, sexKeys, "scaled", recoverySevGroups);
    } else {
      // CL/MA: recovery incidence chart
      if (!recoveryIncGroups || recoveryIncGroups.length === 0) return null;
      return buildDoseIncidenceBarOption(recoveryIncGroups, sexKeys, "scaled");
    }
  }, [hasSeverity, mainSevGroups, sexKeys, "scaled", recoverySevGroups, recoveryIncGroups]);

  // ── Verdict summary (CL/MA only) ─────────────────────────
  const verdicts = useMemo(
    () => (!hasSeverity && hasRecoveryData) ? extractVerdicts(incidenceRows, findingName, domain) : [],
    [hasSeverity, hasRecoveryData, incidenceRows, findingName, domain],
  );

  // ── Labels ────────────────────────────────────────────────
  const rightLabel = hasSeverity ? "Severity" : "Recovery";
  const rightEmptyMsg = hasSeverity
    ? "No severity data."
    : (hasRecovery ? "No recovery data for this finding." : "No recovery arm data.");

  if (mainIncGroups.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No incidence data for this endpoint.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Charts row — 50/50 split */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Incidence chart */}
        <div className="relative flex-1 border-r border-border/30">
          <div className="absolute left-2 top-1 z-10">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Incidence
            </span>
          </div>
          <EChartsWrapper option={incidenceOption!} style={{ width: "100%", height: "100%" }} />
        </div>

        {/* Right: Severity (MI) or Recovery incidence (CL/MA) */}
        <div className="relative flex-1">
          <div className="absolute left-2 top-1 z-10">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {rightLabel}
            </span>
          </div>
          {rightChartOption ? (
            <EChartsWrapper option={rightChartOption} style={{ width: "100%", height: "100%" }} />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              {rightEmptyMsg}
            </div>
          )}
        </div>
      </div>

      {/* Verdict summary line (CL/MA only) */}
      {verdicts.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-1 px-2 py-1 text-[9px]">
          {verdicts.map((v, i) => (
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
    </div>
  );
}
