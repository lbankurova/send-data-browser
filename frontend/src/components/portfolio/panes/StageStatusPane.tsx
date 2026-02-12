import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import { getPipelineStageColor } from "@/lib/severity-colors";

interface Props {
  study: StudyMetadata;
}

export function StageStatusPane({ study }: Props) {
  const stageColor = getPipelineStageColor(study.pipeline_stage);

  return (
    <div className="border-b px-4 py-3">
      <h3 className="text-sm font-semibold">{study.id}</h3>
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span style={{ color: stageColor }} className="font-medium">
          {formatStage(study.pipeline_stage)}
        </span>
        <span className="text-muted-foreground">•</span>
        <span className="text-muted-foreground">{study.status}</span>
      </div>
    </div>
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
