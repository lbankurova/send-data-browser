/**
 * IncidenceDoseCharts — center panel layout for incidence endpoints (MI, MA, CL).
 *
 * Single stacked-by-grade vertical bar chart per endpoint. Doses on X, sex-grouped
 * bars at each dose, severity grade stacks within each affected portion. Recovery
 * cluster (when present) derives from subject-level histopath data — same source
 * as SeverityMatrix, ensuring consistent NE/zero encoding.
 *
 * For CL/MA (no severity), bars render as solid neutral fills and the verdict
 * summary line is preserved below the chart.
 *
 * Component contract: see StackedSeverityIncidenceChart.tsx and the
 * findings-stacked-severity-chart spec.
 */
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { StackedSeverityIncidenceChart } from "@/components/analysis/charts/StackedSeverityIncidenceChart";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import { getVerdictLabel, RECOVERY_VERDICT_CLASS } from "@/lib/recovery-labels";
import {
  buildClusterData,
  buildRecoveryClusterFromSubjects,
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
  const { studyId } = useParams<{ studyId: string }>();
  const { selectedFinding } = useFindingSelection();

  const domain = selectedFinding?.domain ?? "";
  const findingName = selectedFinding?.finding ?? "";
  const hasSeverity = domain === "MI";
  const specimen = selectedFinding?.specimen ?? null;

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

  // ── Recovery arm data (subject-level — single source of truth) ──
  const { data: subjData } = useHistopathSubjects(studyId, specimen);

  const recoveryCluster = useMemo(() => {
    if (!hasRecovery || !subjData?.subjects) return undefined;
    return buildRecoveryClusterFromSubjects(subjData.subjects, findingName, doseGroups);
  }, [hasRecovery, subjData, findingName, doseGroups]);

  const recoveryForChart = recoveryCluster && recoveryCluster.groups.length > 0
    ? recoveryCluster
    : undefined;

  // ── Verdict summary (CL/MA only) ─────────────────────────
  const incidenceRows = useMemo(
    () => recoveryData?.incidence_rows ?? [],
    [recoveryData],
  );

  const verdicts = useMemo(
    () => (!hasSeverity && recoveryForChart) ? extractVerdicts(incidenceRows, findingName, domain, doseGroups) : [],
    [hasSeverity, recoveryForChart, incidenceRows, findingName, domain, doseGroups],
  );

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
          sexDiffStyle="edge"
          sexGrouped
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
