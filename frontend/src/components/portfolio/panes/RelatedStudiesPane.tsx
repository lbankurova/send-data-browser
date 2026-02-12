import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import { CollapsiblePane } from "@/components/analysis/panes/CollapsiblePane";
import { getPipelineStageColor } from "@/lib/severity-colors";

interface Props {
  study: StudyMetadata;
  allStudies: StudyMetadata[];
}

export function RelatedStudiesPane({ study, allStudies }: Props) {
  // Find other studies of the same test article
  const relatedStudies = allStudies
    .filter((s) => s.test_article === study.test_article && s.id !== study.id)
    .sort((a, b) => a.id.localeCompare(b.id));

  if (relatedStudies.length === 0) {
    return null;
  }

  return (
    <CollapsiblePane title="Related studies" defaultOpen={false}>
      <div className="space-y-2">
        {relatedStudies.map((s) => (
          <div key={s.id} className="text-[11px]">
            <div className="flex items-center gap-2">
              <div
                className="h-2 w-2 flex-shrink-0 rounded-full"
                style={{ backgroundColor: getPipelineStageColor(s.pipeline_stage) }}
              />
              <span className="font-medium text-foreground">{s.id}</span>
            </div>
            <div className="ml-4 mt-0.5 text-[10px] text-muted-foreground">
              {s.species} · {s.duration_weeks}w · {s.pipeline_stage.replace("_", " ")}
            </div>
          </div>
        ))}
      </div>
    </CollapsiblePane>
  );
}
