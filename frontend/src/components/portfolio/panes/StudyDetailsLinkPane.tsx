import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { StudyMetadata } from "@/hooks/useStudyPortfolio";

interface Props {
  study: StudyMetadata;
}

export function StudyDetailsLinkPane({ study }: Props) {
  return (
    <div className="border-t px-4 py-3">
      <div className="space-y-2">
        <Link
          to={`/studies/${study.id}`}
          className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent/50"
        >
          <span>View study details</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          to={`/studies/${study.id}?tab=insights`}
          className="flex items-center justify-between rounded-md bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <span>View cross-study insights</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
