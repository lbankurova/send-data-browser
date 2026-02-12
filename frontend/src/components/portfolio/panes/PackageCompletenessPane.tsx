import type { StudyMetadata } from "@/hooks/useStudyPortfolio";
import { CollapsiblePane } from "@/components/analysis/panes/CollapsiblePane";
import { Check, X } from "lucide-react";

interface Props {
  study: StudyMetadata;
}

export function PackageCompletenessPane({ study }: Props) {
  return (
    <CollapsiblePane title="Package Completeness" defaultOpen>
      <div className="space-y-2">
        {/* File presence */}
        <div className="space-y-1 text-[11px]">
          <FileStatus label="nSDRG" present={study.has_nsdrg} />
          <FileStatus label="define.xml" present={study.has_define} />
          <FileStatus label="XPT domains" present={study.has_xpt} />
        </div>

        {/* Validation summary */}
        {study.validation && (
          <div className="mt-3 rounded bg-muted/50 p-2">
            <div className="mb-1 text-[10px] font-medium text-muted-foreground">
              Validation
            </div>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-red-600">{study.validation.errors} errors</span>
              <span className="text-amber-600">{study.validation.warnings} warnings</span>
            </div>
            {study.validation.all_addressed && (
              <div className="mt-1 text-[10px] text-green-700">All addressed</div>
            )}
          </div>
        )}
      </div>
    </CollapsiblePane>
  );
}

function FileStatus({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {present ? (
        <Check className="h-3 w-3 text-green-600" />
      ) : (
        <X className="h-3 w-3 text-gray-400" />
      )}
      <span className={present ? "text-foreground" : "text-muted-foreground"}>{label}</span>
    </div>
  );
}
