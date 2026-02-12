import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import { StageStatusPane } from "./panes/StageStatusPane";
import { ToxSummaryPane } from "./panes/ToxSummaryPane";
import { ReportedVsDerivedDeltaPane } from "./panes/ReportedVsDerivedDeltaPane";
import { ProgramNoaelsPane } from "./panes/ProgramNoaelsPane";
import { PackageCompletenessPane } from "./panes/PackageCompletenessPane";
import { CollectionProgressPane } from "./panes/CollectionProgressPane";
import { DesignRationalePane } from "./panes/DesignRationalePane";
import { RelatedStudiesPane } from "./panes/RelatedStudiesPane";
import { StudyDetailsLinkPane } from "./panes/StudyDetailsLinkPane";
import {
  hasTargetOrganDiscrepancy,
  hasNoaelDiscrepancy,
  hasLoaelDiscrepancy,
  targetOrgans,
  noael,
} from "@/lib/study-accessors";

interface Props {
  selectedStudy: StudyMetadata | null;
  allStudies: StudyMetadata[];
}

export function StudyPortfolioContextPanel({ selectedStudy, allStudies }: Props) {
  if (!selectedStudy) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select a study from the list to view cross-study orientation and details.
      </div>
    );
  }

  const stage = selectedStudy.pipeline_stage;
  const hasDiscrepancies =
    hasTargetOrganDiscrepancy(selectedStudy) ||
    hasNoaelDiscrepancy(selectedStudy) ||
    hasLoaelDiscrepancy(selectedStudy);
  const hasReportedOrDerivedData =
    targetOrgans(selectedStudy).length > 0 || noael(selectedStudy) !== null;

  return (
    <div className="h-full overflow-y-auto">
      {/* Always shown */}
      <StageStatusPane study={selectedStudy} />

      {/* Conditional by stage */}
      {(stage === "submitted" || stage === "pre_submission") && (
        <>
          {hasReportedOrDerivedData && <ToxSummaryPane study={selectedStudy} />}
          {hasDiscrepancies && <ReportedVsDerivedDeltaPane study={selectedStudy} />}
          <ProgramNoaelsPane study={selectedStudy} allStudies={allStudies} />
          <PackageCompletenessPane study={selectedStudy} />
        </>
      )}

      {stage === "ongoing" && (
        <>
          {hasReportedOrDerivedData && <ToxSummaryPane study={selectedStudy} showDerivedOnly />}
          <ProgramNoaelsPane study={selectedStudy} allStudies={allStudies} />
          <CollectionProgressPane study={selectedStudy} />
        </>
      )}

      {stage === "planned" && (
        <>
          <ProgramNoaelsPane study={selectedStudy} allStudies={allStudies} />
          {selectedStudy.design_rationale && <DesignRationalePane study={selectedStudy} />}
        </>
      )}

      {/* Always shown */}
      <RelatedStudiesPane study={selectedStudy} allStudies={allStudies} />

      {/* Navigation to Study Details */}
      <StudyDetailsLinkPane study={selectedStudy} />
    </div>
  );
}
