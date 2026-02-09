import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { InsightsList } from "./InsightsList";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
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

  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  if (!selection) {
    return (
      <div>
        <div className="flex items-center justify-end border-b px-4 py-1.5">
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        {/* NOAEL narrative */}
        <CollapsiblePane title="NOAEL narrative" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <InsightsList rules={noaelRules} />
        </CollapsiblePane>

        {/* Confidence factors */}
        <CollapsiblePane title="Confidence" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
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
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{selection.endpoint_label}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <p className="text-xs text-muted-foreground">
          {selection.sex} &middot; Dose {selection.dose_level}
        </p>
      </div>

      {/* Adversity rationale */}
      <CollapsiblePane title="Adversity rationale" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
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
      <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <InsightsList rules={endpointRules} />
      </CollapsiblePane>

      {/* Cross-view links */}
      <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
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
