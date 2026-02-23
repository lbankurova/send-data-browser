import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { FindingsAnalyticsProvider } from "@/contexts/FindingsAnalyticsContext";
import { useFindingsAnalyticsLocal } from "@/hooks/useFindingsAnalyticsLocal";
import { useFindingContext } from "@/hooks/useFindingContext";
import { useEffectiveNoael } from "@/hooks/useEffectiveNoael";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import type { ToxFinding } from "@/types/annotations";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { VerdictPane } from "./VerdictPane";
import { EvidencePane } from "./EvidencePane";
import { DoseDetailPane } from "./DoseDetailPane";
import { CorrelationsPane } from "./CorrelationsPane";
import { ContextPane } from "./ContextPane";
import { OrganContextPanel } from "./OrganContextPanel";
import { SyndromeContextPanel } from "./SyndromeContextPanel";
import { RecoveryPane } from "./RecoveryPane";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";

export function FindingsContextPanel() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const { selectedFindingId, selectedFinding, endpointSexes, selectedGroupType, selectedGroupKey } = useFindingSelection();
  const { analytics } = useFindingsAnalyticsLocal(studyId);
  const { data: context, isLoading } = useFindingContext(
    studyId,
    selectedFindingId
  );
  const { data: noaelRows } = useEffectiveNoael(studyId);
  const { data: toxAnnotations } = useAnnotations<ToxFinding>(studyId, "tox-finding");
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();
  const { useScheduledOnly: isScheduledOnly, hasEarlyDeaths } = useScheduledOnly();
  const { data: studyMeta } = useStudyMetadata(studyId ?? "");
  const hasRecovery = studyMeta?.dose_groups?.some((dg) => dg.recovery_armcd) ?? false;

  // When scheduled-only mode is active, swap statistics rows to scheduled variants
  const activeStatistics = useMemo(() => {
    if (!context?.statistics) return context?.statistics;
    if (isScheduledOnly && hasEarlyDeaths && context.statistics.scheduled_rows) {
      return { ...context.statistics, rows: context.statistics.scheduled_rows };
    }
    return context.statistics;
  }, [context?.statistics, isScheduledOnly, hasEarlyDeaths]);

  // Derive finding-level NOAEL from statistics rows (highest dose where p > 0.05
  // for all doses at and below it). Falls back to study-level NOAEL if stats unavailable.
  const noael = (() => {
    // Try finding-level first from active statistics (respects scheduled-only toggle)
    if (activeStatistics?.rows && activeStatistics.rows.length >= 2) {
      const rows = activeStatistics.rows; // sorted by dose_level ascending
      // Find the LOAEL: lowest dose with p_value_adj < 0.05
      let loaelIndex = -1;
      for (let i = 1; i < rows.length; i++) { // skip control (index 0)
        const p = rows[i].p_value_adj ?? rows[i].p_value;
        if (p != null && p < 0.05) {
          loaelIndex = i;
          break;
        }
      }
      if (loaelIndex > 1) {
        // NOAEL = dose just below LOAEL
        const noaelRow = rows[loaelIndex - 1];
        return {
          dose_value: noaelRow.dose_value,
          dose_unit: noaelRow.dose_unit ?? activeStatistics.unit ?? "mg/kg",
        };
      }
      if (loaelIndex === 1) {
        // All treatment doses significant — NOAEL below lowest tested dose
        return { dose_value: null, dose_unit: "mg/kg" };
      }
      // No significant doses — NOAEL is highest dose
      const highest = rows[rows.length - 1];
      return {
        dose_value: highest.dose_value,
        dose_unit: highest.dose_unit ?? activeStatistics.unit ?? "mg/kg",
      };
    }

    // Fallback: study-level NOAEL
    if (!noaelRows?.length) return null;
    const sex = selectedFinding?.sex;
    const row = noaelRows.find((r) =>
      sex === "M" ? r.sex === "M" : sex === "F" ? r.sex === "F" : true
    );
    if (!row) return null;
    return { dose_value: row.noael_dose_value, dose_unit: row.noael_dose_unit ?? "mg/kg" };
  })();

  // Priority 1: Endpoint selected → endpoint-level panel
  // Priority 2: Group selected → group-level panel
  // Priority 3: Nothing → empty state

  if (!selectedFindingId || !selectedFinding) {
    // Check for group selection (Priority 2)
    // Wrap in provider so child panels can access analytics via useFindingsAnalytics()
    if (selectedGroupType === "organ" && selectedGroupKey) {
      return <FindingsAnalyticsProvider value={analytics}><OrganContextPanel organKey={selectedGroupKey} /></FindingsAnalyticsProvider>;
    }
    if (selectedGroupType === "syndrome" && selectedGroupKey) {
      return <FindingsAnalyticsProvider value={analytics}><SyndromeContextPanel syndromeId={selectedGroupKey} /></FindingsAnalyticsProvider>;
    }

    // Priority 3: empty state
    return (
      <div className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Findings</h3>
        <p className="text-xs text-muted-foreground">
          Select a finding row to view detailed analysis.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!context) return null;

  const notEvaluated = toxAnnotations && selectedFinding
    ? toxAnnotations[selectedFinding.endpoint_label ?? selectedFinding.finding]?.treatmentRelated === "Not Evaluated"
    : false;

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{selectedFinding.finding}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {selectedFinding.domain} | {selectedFinding.sex} |{" "}
          {selectedFinding.day != null ? `Day ${selectedFinding.day}` : "Terminal"}
        </p>
      </div>

      {/* Verdict — always visible, not in CollapsiblePane */}
      <div className="border-b px-4 py-3">
        <VerdictPane
          finding={selectedFinding}
          analytics={analytics}
          noael={noael}
          doseResponse={context.dose_response}
          statistics={activeStatistics!}
          treatmentSummary={context.treatment_summary}
          endpointSexes={endpointSexes}
          notEvaluated={notEvaluated}
        />
      </div>

      <CollapsiblePane title="Evidence" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <EvidencePane
          finding={selectedFinding}
          analytics={analytics}
          statistics={activeStatistics!}
          effectSize={context.effect_size}
        />
      </CollapsiblePane>

      <CollapsiblePane
        title="Dose detail"
        defaultOpen
        expandAll={expandGen}
        collapseAll={collapseGen}
        headerRight={activeStatistics!.unit ? <span className="text-[10px] text-muted-foreground">Unit: {activeStatistics!.unit}</span> : undefined}
      >
        <DoseDetailPane
          statistics={activeStatistics!}
          doseResponse={context.dose_response}
        />
      </CollapsiblePane>

      {/* Hide correlations pane when based on group means — useless rho=1.0 with n=4 */}
      {context.correlations.related.length > 0
        && context.correlations.related.some((c) => c.basis !== "group_means" && (c.n ?? 0) >= 10) && (
        <CollapsiblePane title="Correlations" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <CorrelationsPane
            data={context.correlations}
            organSystem={selectedFinding.organ_system}
          />
        </CollapsiblePane>
      )}

      <CollapsiblePane title="Context" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <ContextPane
          effectSize={context.effect_size}
          selectedFindingId={selectedFindingId}
        />
      </CollapsiblePane>

      {/* Recovery insights */}
      {hasRecovery && selectedFinding && (
        <CollapsiblePane title="Recovery" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <RecoveryPane finding={selectedFinding} />
        </CollapsiblePane>
      )}

      {/* Related views */}
      <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-1 text-[11px]">
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) {
                navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`);
              }
            }}
          >
            View histopathology &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) {
                navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`);
              }
            }}
          >
            View dose-response &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) {
                navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`);
              }
            }}
          >
            View NOAEL decision &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) {
                navigate(`/studies/${encodeURIComponent(studyId)}`);
              }
            }}
          >
            View study summary &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}
