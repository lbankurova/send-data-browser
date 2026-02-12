import { useState, useMemo } from "react";
import { useStudyPortfolio } from "@/hooks/useStudyPortfolio";
import { useProjects } from "@/hooks/useProjects";
import { StudyPortfolioContextPanel } from "./StudyPortfolioContextPanel";
import { getPipelineStageColor } from "@/lib/severity-colors";
import { noael } from "@/lib/study-accessors";
import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import { Loader2 } from "lucide-react";
import { Header } from "@/components/layout/Header";

export function StudyPortfolioView() {
  const { data: studies, isLoading: studiesLoading } = useStudyPortfolio();
  const { data: projects } = useProjects();
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>("");

  // Filter studies by project
  const filteredStudies = useMemo(() => {
    if (!studies) return [];
    if (!projectFilter) return studies;
    return studies.filter((s) => s.project === projectFilter);
  }, [studies, projectFilter]);

  // Get selected study object
  const selectedStudy = useMemo(() => {
    if (!selectedStudyId || !studies) return null;
    return studies.find((s) => s.id === selectedStudyId) || null;
  }, [selectedStudyId, studies]);

  // Handle row selection
  const handleRowClick = (studyId: string) => {
    setSelectedStudyId(studyId === selectedStudyId ? null : studyId);
  };

  // Handle filter change
  const handleFilterChange = (projectId: string) => {
    setProjectFilter(projectId);
    setSelectedStudyId(null); // Clear selection when filter changes
  };

  if (studiesLoading) {
    return (
      <div className="flex h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!studies || studies.length === 0) {
    return (
      <div className="flex h-screen flex-col">
        <Header />
        <div className="flex flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
          No studies available
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex flex-1">
      {/* Left: Study Table */}
      <div className="flex flex-1 flex-col overflow-hidden border-r">
        {/* Header with filter */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h1 className="text-xl font-bold">Study Portfolio</h1>

          {/* Program Filter */}
          {projects && projects.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Program:</span>
              <select
                value={projectFilter}
                onChange={(e) => handleFilterChange(e.target.value)}
                className="rounded border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="">All Programs</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.compound})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-muted/30">
              <tr className="border-b">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Study
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Protocol
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Species
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Stage
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Subjects
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Duration
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Type
                </th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  NOAEL
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredStudies.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-4 text-center text-sm text-muted-foreground">
                    No studies match the selected filter
                  </td>
                </tr>
              ) : (
                filteredStudies.map((study) => (
                  <StudyRow
                    key={study.id}
                    study={study}
                    selected={study.id === selectedStudyId}
                    onClick={() => handleRowClick(study.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right: Context Panel */}
      <div className="w-[320px] border-l bg-background">
        <StudyPortfolioContextPanel
          selectedStudy={selectedStudy}
          allStudies={studies}
        />
      </div>
    </div>
    </div>
  );
}

interface StudyRowProps {
  study: StudyMetadata;
  selected: boolean;
  onClick: () => void;
}

function StudyRow({ study, selected, onClick }: StudyRowProps) {
  const stageColor = getPipelineStageColor(study.pipeline_stage);
  const resolvedNoael = noael(study);

  // Abbreviate study type
  const typeAbbrev = study.study_type
    .replace("Repeat Dose", "")
    .replace("Toxicity", "")
    .trim();

  return (
    <tr
      onClick={onClick}
      className={`
        cursor-pointer border-b transition-colors
        ${selected ? "bg-accent" : "hover:bg-accent/50"}
      `}
    >
      <td className="px-3 py-2 text-xs font-semibold" style={{ color: selected ? "#3b82f6" : undefined }}>
        {study.id}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{study.protocol}</td>
      <td className="px-3 py-2 text-xs">{study.species}</td>
      <td className="px-3 py-2 text-xs font-medium" style={{ color: stageColor }}>
        {formatStage(study.pipeline_stage)}
      </td>
      <td className="px-3 py-2 text-right text-xs">{study.subjects}</td>
      <td className="px-3 py-2 text-xs">
        {study.duration_weeks}wk
        {study.recovery_weeks > 0 && ` (+${study.recovery_weeks}wk)`}
      </td>
      <td className="px-3 py-2 text-xs">{typeAbbrev}</td>
      <td className="px-3 py-2 text-right text-xs">
        {resolvedNoael ? (
          <span style={{ color: "#8CD4A2" }} className="font-medium">
            {resolvedNoael.dose}
            {resolvedNoael.source === "derived" && (
              <span className="ml-1 text-[9px] text-muted-foreground">(d)</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{study.status}</td>
    </tr>
  );
}

function formatStage(stage: string): string {
  switch (stage) {
    case "submitted":
      return "Submitted";
    case "pre_submission":
      return "Pre-Submission";
    case "ongoing":
      return "Ongoing";
    case "planned":
      return "Planned";
    default:
      return stage;
  }
}
