import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import { CollapsiblePane } from "@/components/analysis/panes/CollapsiblePane";
import { noael } from "@/lib/study-accessors";

interface Props {
  study: StudyMetadata;
  allStudies: StudyMetadata[];
}

export function ProgramNoaelsPane({ study, allStudies }: Props) {
  // Find other studies of the same test article
  const relatedStudies = allStudies.filter(
    (s) => s.test_article === study.test_article && s.id !== study.id
  );

  // Filter to only those with NOAELs
  const studiesWithNoael = relatedStudies
    .map((s) => ({ study: s, noael: noael(s) }))
    .filter((item) => item.noael !== null)
    .sort((a, b) => a.study.id.localeCompare(b.study.id));

  if (studiesWithNoael.length === 0) {
    return null;
  }

  return (
    <CollapsiblePane title={`Program NOAELs (${study.test_article})`} defaultOpen>
      <div className="space-y-2">
        {studiesWithNoael.map(({ study: s, noael: n }) => (
          <div key={s.id} className="text-[11px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-foreground">{s.id}</span>
              <span
                style={{ color: "#8CD4A2" }}
                className="font-mono text-xs font-semibold"
              >
                {n!.dose} {n!.unit}
              </span>
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {s.species} · {s.duration_weeks}w
            </div>
          </div>
        ))}
      </div>
    </CollapsiblePane>
  );
}
