import { useNavigate } from "react-router-dom";
import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import type { Project } from "@/hooks/useProjects";
import { useStudyPreferences } from "@/hooks/useStudyPreferences";
import { CollapsiblePane } from "@/components/analysis/panes/CollapsiblePane";
import { getPipelineStageColor } from "@/lib/severity-colors";
import { noael } from "@/lib/study-accessors";

interface Props {
  project: Project;
  studies: StudyMetadata[];
  onViewStudies?: () => void;
}

export function ProgramContextPanel({ project, studies, onViewStudies }: Props) {
  const navigate = useNavigate();
  const { data: prefs } = useStudyPreferences();
  const displayNames = prefs?.display_names ?? {};

  // Studies belonging to this program
  const programStudies = studies
    .filter((s) => s.project === project.id)
    .sort((a, b) => a.id.localeCompare(b.id));

  // Stage breakdown
  const stageCounts = new Map<string, number>();
  for (const s of programStudies) {
    stageCounts.set(s.pipeline_stage, (stageCounts.get(s.pipeline_stage) ?? 0) + 1);
  }

  // Species covered
  const species = [...new Set(programStudies.map((s) => s.species).filter(Boolean) as string[])].sort();

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{project.name}</h3>
        <div className="mt-1 text-xs text-muted-foreground">
          {project.compound}
          {project.therapeutic_area && <> · {project.therapeutic_area}</>}
          {project.phase && <> · {project.phase}</>}
        </div>
      </div>

      {/* Program summary */}
      <CollapsiblePane title="Summary" defaultOpen>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Studies</span>
            <span>{programStudies.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Species</span>
            <span>{species.join(", ") || "—"}</span>
          </div>
          {stageCounts.size > 0 && (
            <div className="mt-2 space-y-0.5">
              {[...stageCounts.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([stage, count]) => (
                  <div key={stage} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: getPipelineStageColor(stage) }}
                      />
                      <span className="text-muted-foreground">{formatStage(stage)}</span>
                    </div>
                    <span>{count}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      </CollapsiblePane>

      {/* Studies list */}
      <CollapsiblePane title={`Studies (${programStudies.length})`} defaultOpen>
        <div className="space-y-1">
          {programStudies.map((s) => {
            const resolvedNoael = noael(s);
            const displayName = displayNames[s.id];
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/studies/${encodeURIComponent(s.id)}`)}
                className="block w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-2 text-xs">
                  <div
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: getPipelineStageColor(s.pipeline_stage) }}
                  />
                  <span className="font-medium text-primary">
                    {displayName ?? s.id}
                  </span>
                </div>
                {displayName && (
                  <div className="ml-4 mt-0.5 text-[11px] text-muted-foreground">
                    {s.id}
                  </div>
                )}
                <div className="ml-4 mt-0.5 text-[11px] text-muted-foreground">
                  {s.species ?? "—"}
                  {" · "}
                  {s.duration_weeks != null ? `${s.duration_weeks}w` : "—"}
                  {resolvedNoael && (
                    <>
                      {" · NOAEL "}
                      <span style={{ color: "#8CD4A2" }} className="font-medium">
                        {resolvedNoael.dose} {resolvedNoael.unit}
                      </span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
          {onViewStudies && (
            <button
              onClick={onViewStudies}
              className="mt-1 block w-full text-left text-[11px] text-primary hover:underline px-2"
            >
              View all in studies table &#x2197;
            </button>
          )}
        </div>
      </CollapsiblePane>
    </div>
  );
}

function formatStage(stage: string): string {
  switch (stage) {
    case "submitted":
      return "Submitted";
    case "pre_submission":
      return "Pre-submission";
    case "ongoing":
      return "Ongoing";
    case "planned":
      return "Planned";
    default:
      return stage;
  }
}
