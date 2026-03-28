/**
 * CohortView — multi-subject analysis surface.
 *
 * State is in CohortContext (provided by Layout). This component is the
 * center panel content: evidence table + charts.
 */
import { Loader2 } from "lucide-react";
import { useParams } from "react-router-dom";
import { useCohort } from "@/contexts/CohortContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { CohortEvidenceTable } from "./cohort/CohortEvidenceTable";
import { CohortCharts } from "./cohort/CohortCharts";
import { useCallback } from "react";

export function CohortView() {
  const { studyId } = useParams<{ studyId: string }>();
  const cohort = useCohort();
  const { setSelection, setSelectedSubject } = useViewSelection();

  const handleSubjectClick = useCallback((usubjid: string) => {
    setSelectedSubject(usubjid);
  }, [setSelectedSubject]);

  const handleFindingClick = useCallback((findingId: string) => {
    setSelection({ _view: "cohort", mode: "finding", findingId });
  }, [setSelection]);

  if (cohort.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <CohortEvidenceTable
        organSignals={cohort.organSignals}
        selectedOrgan={cohort.selectedOrgan}
        onOrganChange={cohort.setSelectedOrgan}
        sharedFindings={cohort.sharedFindings}
        selectedSubjectCount={cohort.activeSubjects.length}
        findingRows={cohort.findingRows}
        displaySubjects={cohort.displaySubjects}
        allSubjects={cohort.allSubjects}
        doseGroups={cohort.doseGroups}
        hoveredRow={cohort.hoveredRow}
        onRowHover={cohort.setHoveredRow}
        onSubjectClick={handleSubjectClick}
        onFindingClick={handleFindingClick}
        truncated={cohort.truncated}
        missingExamMap={cohort.missingExamMap}
        histopathMap={cohort.histopathMap}
        hasHistopathData={cohort.hasHistopathData}
        comparisonMode={cohort.comparisonMode}
        onComparisonModeChange={cohort.setComparisonMode}
        comparisonResults={cohort.comparisonResults}
        referenceLabel={cohort.referenceLabel}
        studySubjectCount={cohort.activeSubjects.filter(
          (s) => !cohort.effectiveReferenceIds.has(s.usubjid),
        ).length}
        hasCustomReference={cohort.referenceGroup !== null}
      />
      <CohortCharts
        studyId={studyId!}
        subjects={cohort.displaySubjects}
        selectedOrgan={cohort.selectedOrgan}
        findings={cohort.findings}
      />
    </div>
  );
}
