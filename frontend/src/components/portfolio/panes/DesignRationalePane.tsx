import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import { CollapsiblePane } from "@/components/analysis/panes/CollapsiblePane";

interface Props {
  study: StudyMetadata;
}

export function DesignRationalePane({ study }: Props) {
  if (!study.design_rationale) return null;

  return (
    <CollapsiblePane title="Design Rationale" defaultOpen>
      <p className="text-[11px] leading-relaxed text-foreground">
        {study.design_rationale}
      </p>
    </CollapsiblePane>
  );
}
