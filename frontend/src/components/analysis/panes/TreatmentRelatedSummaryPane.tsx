import { cn } from "@/lib/utils";
import { getSeverityBadgeClasses } from "@/lib/severity-colors";
import type { FindingContext } from "@/types/analysis";
import { InsightBlock } from "./InsightBlock";

interface Props {
  data: FindingContext["treatment_summary"];
}

export function TreatmentRelatedSummaryPane({ data }: Props) {
  return (
    <div className="space-y-3">
      <InsightBlock insights={data.insights} />

      {/* Treatment-related badge */}
      <div
        className={cn(
          "rounded-md px-3 py-2 text-xs",
          data.treatment_related
            ? "border border-red-200 bg-red-50 text-red-800"
            : "border border-green-200 bg-green-50 text-green-800"
        )}
      >
        <span className="font-semibold">
          {data.treatment_related ? "Treatment-related" : "Not treatment-related"}
        </span>
        <span className="ml-2">
          Severity:{" "}
          <span
            className={cn(
              "inline-block rounded px-1 py-0.5 text-[10px] font-medium",
              getSeverityBadgeClasses(data.severity)
            )}
          >
            {data.severity}
          </span>
        </span>
      </div>

      {/* Severity counts */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Study-wide severity
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded border border-red-200 bg-red-50 px-1.5 py-0.5 text-red-700">
            {data.severity_counts.adverse ?? 0} adverse
          </span>
          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-amber-700">
            {data.severity_counts.warning ?? 0} warning
          </span>
          <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-green-700">
            {data.severity_counts.normal ?? 0} normal
          </span>
        </div>
      </div>

      {/* Target organs */}
      {data.target_organs.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Target organs
          </div>
          <div className="flex flex-wrap gap-1">
            {data.target_organs.map((organ) => (
              <span
                key={organ}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px]"
              >
                {organ}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Convergent evidence */}
      {data.convergent_evidence.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Convergent evidence
          </div>
          <div className="space-y-0.5">
            {data.convergent_evidence.map((ce) => (
              <div key={ce.finding_id} className="flex items-center gap-1 text-[11px]">
                <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium">
                  {ce.domain}
                </span>
                <span className="truncate">{ce.finding}</span>
                <span
                  className={cn(
                    "ml-auto shrink-0 rounded px-1 py-0.5 text-[9px]",
                    getSeverityBadgeClasses(ce.severity)
                  )}
                >
                  {ce.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
