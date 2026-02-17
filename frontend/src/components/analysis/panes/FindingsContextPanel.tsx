import { useParams, useNavigate } from "react-router-dom";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useFindingContext } from "@/hooks/useFindingContext";
import { useCollapseAll } from "@/hooks/useCollapseAll";
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
  const { selectedFindingId, selectedFinding } = useFindingSelection();
  const { data: context, isLoading } = useFindingContext(
    studyId,
    selectedFindingId
  );
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

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
        <TreatmentRelatedSummaryPane data={context.treatment_summary} />
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
