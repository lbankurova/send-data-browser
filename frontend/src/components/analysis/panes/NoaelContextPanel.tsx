import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import {
  formatPValue,
  formatEffectSize,
  getSeverityBadgeClasses,
} from "@/lib/severity-colors";
import { cn } from "@/lib/utils";
import type {
  NoaelSummaryRow,
  AdverseEffectSummaryRow,
  RuleResult,
} from "@/types/analysis-views";

interface NoaelSelection {
  endpoint_label: string;
  dose_level: number;
  sex: string;
}

interface Props {
  noaelData: NoaelSummaryRow[];
  aeData: AdverseEffectSummaryRow[];
  ruleResults: RuleResult[];
  selection: NoaelSelection | null;
}

export function NoaelContextPanel({ noaelData, aeData, ruleResults, selection }: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();

  // NOAEL-related rules (scope=study)
  const noaelRules = useMemo(
    () => ruleResults.filter((r) => r.scope === "study"),
    [ruleResults]
  );

  // Selected row details
  const selectedRows = useMemo(() => {
    if (!selection) return [];
    return aeData.filter(
      (r) =>
        r.endpoint_label === selection.endpoint_label &&
        r.sex === selection.sex
    );
  }, [aeData, selection]);

  // Endpoint rules
  const endpointRules = useMemo(() => {
    if (!selection) return [];
    return ruleResults.filter(
      (r) =>
        r.context_key.includes(selection.endpoint_label) ||
        (r.scope === "endpoint" &&
          r.output_text.toLowerCase().includes(selection.endpoint_label.toLowerCase()))
    );
  }, [ruleResults, selection]);

  if (!selection) {
    return (
      <div>
        {/* NOAEL narrative */}
        <CollapsiblePane title="NOAEL Narrative" defaultOpen>
          {noaelRules.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No study-level insights available.</p>
          ) : (
            <div className="space-y-1">
              {noaelRules.slice(0, 15).map((rule, i) => {
                const borderClass =
                  rule.severity === "warning"
                    ? "border-l-amber-500"
                    : rule.severity === "critical"
                      ? "border-l-red-500"
                      : "";
                return (
                  <div
                    key={`${rule.rule_id}-${i}`}
                    className={cn(
                      borderClass ? `border-l-2 ${borderClass}` : "",
                      "pl-2 text-[11px] leading-snug"
                    )}
                  >
                    <span className={borderClass ? "text-foreground" : "text-muted-foreground"}>
                      {rule.output_text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CollapsiblePane>

        {/* Confidence factors */}
        <CollapsiblePane title="Confidence" defaultOpen={false}>
          <div className="space-y-1 text-[11px]">
            {noaelData.map((r) => (
              <div key={r.sex} className="flex justify-between">
                <span className="text-muted-foreground">
                  {r.sex === "Combined" ? "Combined" : r.sex}
                </span>
                <span>
                  {r.n_adverse_at_loael} adverse at LOAEL ({r.adverse_domains_at_loael.join(", ")})
                </span>
              </div>
            ))}
          </div>
        </CollapsiblePane>

        <div className="px-4 py-2 text-xs text-muted-foreground">
          Select a row to view adversity rationale.
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{selection.endpoint_label}</h3>
        <p className="text-xs text-muted-foreground">
          {selection.sex} &middot; Dose {selection.dose_level}
        </p>
      </div>

      {/* Adversity rationale */}
      <CollapsiblePane title="Adversity Rationale" defaultOpen>
        {selectedRows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No data for selected endpoint.</p>
        ) : (
          <div className="space-y-1.5 text-[11px]">
            {selectedRows.map((row, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  Dose {row.dose_level} ({row.sex})
                </span>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{formatPValue(row.p_value)}</span>
                  <span className="font-mono">{formatEffectSize(row.effect_size)}</span>
                  <span
                    className={cn(
                      "rounded-sm px-1 py-0.5 text-[10px] font-medium",
                      getSeverityBadgeClasses(row.severity)
                    )}
                  >
                    {row.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsiblePane>

      {/* Endpoint insights */}
      <CollapsiblePane title="Insights" defaultOpen>
        {endpointRules.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No endpoint-specific insights.</p>
        ) : (
          <div className="space-y-1">
            {endpointRules.slice(0, 10).map((rule, i) => {
              const borderClass =
                rule.severity === "warning"
                  ? "border-l-amber-500"
                  : rule.severity === "critical"
                    ? "border-l-red-500"
                    : "";
              return (
                <div
                  key={`${rule.rule_id}-${i}`}
                  className={cn(
                    borderClass ? `border-l-2 ${borderClass}` : "",
                    "pl-2 text-[11px] leading-snug"
                  )}
                >
                  <span className={borderClass ? "text-foreground" : "text-muted-foreground"}>
                    {rule.output_text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CollapsiblePane>

      {/* Cross-view links */}
      <CollapsiblePane title="Related Views" defaultOpen={false}>
        <div className="space-y-1 text-[11px]">
          <a
            href="#"
            className="block hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`);
            }}
          >
            View dose-response &#x2192;
          </a>
          <a
            href="#"
            className="block hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/target-organs`);
            }}
          >
            View target organs &#x2192;
          </a>
          <a
            href="#"
            className="block hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`);
            }}
          >
            View histopathology &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}
