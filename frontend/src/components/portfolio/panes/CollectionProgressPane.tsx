import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import { CollapsiblePane } from "@/components/analysis/panes/CollapsiblePane";

interface Props {
  study: StudyMetadata;
}

export function CollectionProgressPane({ study }: Props) {
  const collected = study.domains_collected?.length ?? 0;
  const planned = study.domains_planned?.length ?? 0;

  return (
    <CollapsiblePane title="Data Collection" defaultOpen>
      <div className="space-y-2">
        <p className="text-[11px]">
          <span className="font-semibold">{collected} / {planned}</span> domains collected
        </p>

        {study.interim_observations && (
          <div className="rounded bg-blue-50 p-2 text-[10px] leading-relaxed text-blue-900">
            {study.interim_observations}
          </div>
        )}
      </div>
    </CollapsiblePane>
  );
}
