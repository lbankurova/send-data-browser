/**
 * CohortView — multi-subject analysis surface.
 *
 * State is in CohortContext (provided by Layout). This component is the
 * center panel content: tabbed table (Subjects / Organ detail) + charts.
 */
import { Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useCohort } from "@/contexts/CohortContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { CohortEvidenceTable } from "./cohort/CohortEvidenceTable";
import { SubjectSignalTable } from "./cohort/SubjectSignalTable";
import { CohortCharts } from "./cohort/CohortCharts";
import { CohortInfluenceMap } from "./cohort/CohortInfluenceMap";
import { AnimalInfluencePanel } from "./cohort/AnimalInfluencePanel";
import { SimilarityScatter } from "./cohort/SimilarityScatter";
import { useNoaelOverlay } from "@/hooks/useNoaelOverlay";
import { useSubjectSyndromes } from "@/hooks/useSubjectSyndromes";
import { useOnsetDays } from "@/hooks/useOnsetDays";
import { useRecoveryVerdicts } from "@/hooks/useRecoveryVerdicts";
import { useAnimalInfluence } from "@/hooks/useAnimalInfluence";
import { useSubjectSimilarity } from "@/hooks/useSubjectSimilarity";
import { useCallback, useState } from "react";
import { TabButton } from "@/components/ui/TabBar";

type CohortTab = "subjects" | "organ-detail";
type TopPanelMode = "influence" | "similarity";

export function CohortView() {
  const { studyId } = useParams<{ studyId: string }>();
  const cohort = useCohort();
  const { setSelection, setSelectedSubject, selection } = useViewSelection();
  const { data: noaelOverlay } = useNoaelOverlay(studyId);
  const { data: syndromesData } = useSubjectSyndromes(studyId);
  const { data: onsetDaysData } = useOnsetDays(studyId);
  const { data: recoveryVerdictsData } = useRecoveryVerdicts(studyId);
  const { data: influenceData } = useAnimalInfluence(studyId);
  const { data: similarityData } = useSubjectSimilarity(studyId);
  const [activeTab, setActiveTab] = useState<CohortTab>("subjects");
  const [topMode, setTopMode] = useState<TopPanelMode>("similarity");
  const [selectedInfluenceAnimal, setSelectedInfluenceAnimal] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleEndpointClick = useCallback(() => {
    // Navigate to findings view — endpoint pre-selection requires FindingSelectionContext
    // plumbing (context is inside FindingsView, not shared at app level)
    navigate(`/studies/${encodeURIComponent(studyId!)}/findings`);
  }, [navigate, studyId]);

  const handleSubjectClick = useCallback((usubjid: string) => {
    setSelectedSubject(usubjid);
  }, [setSelectedSubject]);

  const handleFindingClick = useCallback((findingId: string) => {
    setSelection({ _view: "cohort", mode: "finding", findingId });
  }, [setSelection]);

  // Switch to organ detail tab when an organ is selected
  const handleOrganChange = useCallback((organ: string | null) => {
    cohort.setSelectedOrgan(organ);
    if (organ) setActiveTab("organ-detail");
  }, [cohort]);

  if (cohort.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const selectedSubjectId = (selection as { usubjid?: string })?.usubjid ?? null;
  const hasInfluence = !!(influenceData && influenceData.animals.length > 0);
  const hasSimilarity = !!(similarityData && !similarityData.meta.similarity_suppressed);
  // Effective mode: fall back to whichever data source is available
  const effectiveTopMode = topMode === "similarity" && !hasSimilarity && hasInfluence
    ? "influence"
    : topMode === "influence" && !hasInfluence && hasSimilarity
      ? "similarity"
      : topMode;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top panel — tabbed: Similarity / Influence */}
      {(hasInfluence || hasSimilarity) && (
        <div className="shrink-0 border-b" style={{ height: 280 }}>
          {/* Top panel tab bar */}
          <div className="flex items-center border-b bg-muted/30 px-1">
            {hasSimilarity && (
              <TabButton active={effectiveTopMode === "similarity"} onClick={() => setTopMode("similarity")}>
                Similarity
              </TabButton>
            )}
            {hasInfluence && (
              <TabButton active={effectiveTopMode === "influence"} onClick={() => setTopMode("influence")}>
                Influence
              </TabButton>
            )}
          </div>

          {/* Top panel content */}
          <div className="flex" style={{ height: 280 - 33 }}>
            {effectiveTopMode === "similarity" && similarityData && (
              <div className="flex-1 min-w-0">
                <SimilarityScatter
                  data={similarityData}
                  doseGroups={cohort.doseGroups}
                  selectedSubject={selectedSubjectId}
                  onSubjectSelect={(id) => { if (id) handleSubjectClick(id); }}
                />
              </div>
            )}
            {effectiveTopMode === "influence" && influenceData && (
              <>
                <div className="flex-1 min-w-0 border-r">
                  <CohortInfluenceMap
                    data={influenceData}
                    doseGroups={cohort.doseGroups}
                    selectedAnimal={selectedInfluenceAnimal}
                    onAnimalSelect={setSelectedInfluenceAnimal}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <AnimalInfluencePanel
                    data={influenceData}
                    selectedAnimal={selectedInfluenceAnimal}
                    onEndpointClick={handleEndpointClick}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center border-b bg-muted/30">
        <TabButton active={activeTab === "subjects"} onClick={() => setActiveTab("subjects")}>
          Subjects
        </TabButton>
        <TabButton active={activeTab === "organ-detail"} onClick={() => setActiveTab("organ-detail")}>
          Organ detail
        </TabButton>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "subjects" ? (
          <SubjectSignalTable
            subjects={cohort.filteredSubjects}
            syndromes={syndromesData?.subjects ?? {}}
            organCounts={cohort.subjectOrganCounts}
            histopathMap={cohort.histopathMap}
            onsetDays={onsetDaysData?.subjects ?? {}}
            recoveryVerdicts={recoveryVerdictsData?.per_subject ?? {}}
            noaelOverlay={noaelOverlay?.subjects ?? {}}
            findings={cohort.findings}
            onSubjectClick={handleSubjectClick}
            selectedSubjectId={selectedSubjectId}
          />
        ) : (
          <CohortEvidenceTable
            organSignals={cohort.organSignals}
            selectedOrgan={cohort.selectedOrgan}
            onOrganChange={handleOrganChange}
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
        )}
      </div>

      <CohortCharts
        studyId={studyId!}
        subjects={cohort.displaySubjects}
        selectedOrgan={cohort.selectedOrgan}
        findings={cohort.findings}
        selectedSubjectId={selectedSubjectId}
      />
    </div>
  );
}
