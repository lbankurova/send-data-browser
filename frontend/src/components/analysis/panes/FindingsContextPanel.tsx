import { useParams, useNavigate } from "react-router-dom";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useFindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import { useFindingContext } from "@/hooks/useFindingContext";
import { useEffectiveNoael } from "@/hooks/useEffectiveNoael";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import type { ToxFinding } from "@/types/annotations";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { TreatmentRelatedSummaryPane } from "./TreatmentRelatedSummaryPane";
import { StatisticsPane } from "./StatisticsPane";
import { DoseResponsePane } from "./DoseResponsePane";
import { CorrelationsPane } from "./CorrelationsPane";
import { EffectSizePane } from "./EffectSizePane";
import { Skeleton } from "@/components/ui/skeleton";

export function FindingsContextPanel() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const { selectedFindingId, selectedFinding, endpointSexes } = useFindingSelection();
  const analytics = useFindingsAnalytics();
  const { data: context, isLoading } = useFindingContext(
    studyId,
    selectedFindingId
  );
  const { data: noaelRows } = useEffectiveNoael(studyId);
  const { data: toxAnnotations } = useAnnotations<ToxFinding>(studyId, "tox-finding");
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // Derive finding-level NOAEL from statistics rows (highest dose where p > 0.05
  // for all doses at and below it). Falls back to study-level NOAEL if stats unavailable.
  const noael = (() => {
    // Try finding-level first from context statistics
    if (context?.statistics?.rows && context.statistics.rows.length >= 2) {
      const rows = context.statistics.rows; // sorted by dose_level ascending
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
          dose_unit: noaelRow.dose_unit ?? context.statistics.unit ?? "mg/kg",
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
        dose_unit: highest.dose_unit ?? context.statistics.unit ?? "mg/kg",
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

  if (!selectedFindingId || !selectedFinding) {
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

  return (
    <div>
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

      <CollapsiblePane title="Treatment summary" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <TreatmentRelatedSummaryPane
          data={context.treatment_summary}
          finding={selectedFinding}
          analytics={analytics}
          noael={noael}
          doseResponse={context.dose_response}
          statistics={context.statistics}
          endpointSexes={endpointSexes}
          notEvaluated={
            toxAnnotations && selectedFinding
              ? toxAnnotations[selectedFinding.endpoint_label ?? selectedFinding.finding]?.treatmentRelated === "Not Evaluated"
              : false
          }
        />
      </CollapsiblePane>

      <CollapsiblePane title="Statistics" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <StatisticsPane data={context.statistics} />
      </CollapsiblePane>

      <CollapsiblePane title="Dose response" expandAll={expandGen} collapseAll={collapseGen}>
        <DoseResponsePane data={context.dose_response} />
      </CollapsiblePane>

      <CollapsiblePane title="Correlations" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        <CorrelationsPane data={context.correlations} />
      </CollapsiblePane>

      <CollapsiblePane title="Effect size" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        <EffectSizePane data={context.effect_size} />
      </CollapsiblePane>

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
