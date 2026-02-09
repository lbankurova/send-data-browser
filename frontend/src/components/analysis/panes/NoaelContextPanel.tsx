import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { InsightsList } from "./InsightsList";
import { ToxFindingForm } from "./ToxFindingForm";
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
  studyId?: string;
}

export function NoaelContextPanel({ noaelData, aeData, ruleResults, selection, studyId: studyIdProp }: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;
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
        <CollapsiblePane title="NOAEL narrative" defaultOpen>
          <InsightsList rules={noaelRules} />
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
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <h3 className="text-sm font-semibold">{selection.endpoint_label}</h3>
        <p className="text-xs text-muted-foreground">
          {selection.sex} &middot; Dose {selection.dose_level}
        </p>
      </div>

      {/* Adversity rationale */}
      <CollapsiblePane title="Adversity rationale" defaultOpen>
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
        <InsightsList rules={endpointRules} />
      </CollapsiblePane>

      {/* Cross-view links */}
      <CollapsiblePane title="Related views" defaultOpen={false}>
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

      {/* Tox Assessment */}
      {studyId && (
        <ToxFindingForm studyId={studyId} endpointLabel={selection.endpoint_label} />
      )}
    </div>
  );
}
