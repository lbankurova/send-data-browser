import { getSeverityDotColor } from "@/lib/severity-colors";
import type { FindingContext } from "@/types/analysis";
import { InsightBlock } from "./InsightBlock";

interface Props {
  data: FindingContext["treatment_summary"];
}

export function TreatmentRelatedSummaryPane({ data }: Props) {
  return (
    <div className="space-y-3">
      <InsightBlock insights={data.insights} />

      {/* Treatment-related status */}
      <div className="flex items-center gap-2 text-xs">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: data.treatment_related ? "#dc2626" : "#16a34a" }}
        />
        <span className="font-medium">
          {data.treatment_related ? "Treatment-related" : "Not treatment-related"}
        </span>
        <span className="text-muted-foreground">·</span>
        <span
          className="font-medium"
          style={{ color: getSeverityDotColor(data.severity) }}
        >
          {data.severity}
        </span>
      </div>

      {/* Severity counts */}
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Study-wide severity
        </div>
        <div className="flex gap-3 text-xs">
          <span style={{ color: "#dc2626" }}>
            {data.severity_counts.adverse ?? 0} adverse
          </span>
          <span style={{ color: "#d97706" }}>
            {data.severity_counts.warning ?? 0} warning
          </span>
          <span style={{ color: "#16a34a" }}>
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
              <div key={ce.finding_id} className="flex items-center gap-1.5 text-[11px]">
                <span className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium">
                  {ce.domain}
                </span>
                <span className="truncate">{ce.finding}</span>
                <span
                  className="ml-auto shrink-0 text-[10px] font-medium"
                  style={{ color: getSeverityDotColor(ce.severity) }}
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
