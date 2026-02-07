import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { InsightsList } from "./InsightsList";
import type {
  SignalSummaryRow,
  SignalSelection,
  RuleResult,
} from "@/types/analysis-views";
import { formatPValue, getSignalScoreColor } from "@/lib/severity-colors";

interface Props {
  signalData: SignalSummaryRow[];
  ruleResults: RuleResult[];
  selection: SignalSelection | null;
}

export function StudySummaryContextPanel({
  signalData,
  ruleResults,
  selection,
}: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();

  // Filter rules by selected endpoint's context_key
  const filteredRules = useMemo(() => {
    if (!selection) return ruleResults.slice(0, 20);
    const contextKey = `${selection.domain}_${selection.test_code}_${selection.sex}`;
    const organKey = `organ_${selection.organ_system}`;
    return ruleResults.filter(
      (r) =>
        r.context_key === contextKey ||
        r.context_key === organKey ||
        r.scope === "study"
    );
  }, [ruleResults, selection]);

  // Selected row data
  const selectedRow = useMemo(() => {
    if (!selection) return null;
    return signalData.find(
      (r) =>
        r.endpoint_label === selection.endpoint_label &&
        r.dose_level === selection.dose_level &&
        r.sex === selection.sex
    );
  }, [signalData, selection]);

  // Cross-domain correlations: other findings in same organ system
  const correlatedFindings = useMemo(() => {
    if (!selection) return [];
    return signalData
      .filter(
        (r) =>
          r.organ_system === selection.organ_system &&
          r.endpoint_label !== selection.endpoint_label
      )
      .sort((a, b) => b.signal_score - a.signal_score)
      .slice(0, 10);
  }, [signalData, selection]);

  if (!selection) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select a signal from the heatmap or grid to view details.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{selection.endpoint_label}</h3>
        <p className="text-xs text-muted-foreground">
          {selection.domain} &middot; {selection.sex} &middot; Dose{" "}
          {selection.dose_level}
        </p>
      </div>

      {/* Pane 1: Rule-based insights */}
      <CollapsiblePane title="Insights" defaultOpen>
        <InsightsList rules={filteredRules} />
      </CollapsiblePane>

      {/* Pane 2: Finding statistics */}
      <CollapsiblePane title="Statistics" defaultOpen>
        {selectedRow ? (
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Signal score</span>
              <span
                className="rounded px-1.5 py-0.5 text-xs font-semibold text-white"
                style={{
                  backgroundColor: getSignalScoreColor(
                    selectedRow.signal_score
                  ),
                }}
              >
                {selectedRow.signal_score.toFixed(3)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Direction</span>
              <span>{selectedRow.direction ?? "\u2014"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Best p-value</span>
              <span className="font-mono">
                {formatPValue(selectedRow.p_value)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trend p-value</span>
              <span className="font-mono">
                {formatPValue(selectedRow.trend_p)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Effect size</span>
              <span className="font-mono">
                {selectedRow.effect_size != null
                  ? selectedRow.effect_size.toFixed(2)
                  : "\u2014"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dose-response</span>
              <span>{selectedRow.dose_response_pattern.replace(/_/g, " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Severity</span>
              <span className="capitalize">{selectedRow.severity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Treatment-related</span>
              <span>{selectedRow.treatment_related ? "Yes" : "No"}</span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No data for selected row.
          </p>
        )}
      </CollapsiblePane>

      {/* Pane 3: Cross-domain correlations */}
      <CollapsiblePane title="Correlations" defaultOpen>
        {correlatedFindings.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No correlations in this organ system.
          </p>
        ) : (
          <div>
            <p className="mb-1.5 text-[10px] text-muted-foreground">
              Other findings in{" "}
              <span className="font-medium">
                {selection.organ_system.replace(/_/g, " ")}
              </span>
            </p>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-0.5 text-left font-medium">Endpoint</th>
                  <th className="pb-0.5 text-left font-medium">Dom</th>
                  <th className="pb-0.5 text-right font-medium">Signal</th>
                  <th className="pb-0.5 text-right font-medium">p</th>
                </tr>
              </thead>
              <tbody>
                {correlatedFindings.map((f, i) => (
                  <tr
                    key={i}
                    className="cursor-pointer border-b border-dashed hover:bg-accent/30"
                    onClick={() => {
                      if (studyId) {
                        navigate(
                          `/studies/${encodeURIComponent(studyId)}/dose-response`
                        );
                      }
                    }}
                  >
                    <td className="truncate py-0.5" title={f.endpoint_label}>
                      {f.endpoint_label.length > 25
                        ? f.endpoint_label.slice(0, 25) + "\u2026"
                        : f.endpoint_label}
                    </td>
                    <td className="py-0.5">{f.domain}</td>
                    <td className="py-0.5 text-right font-mono">
                      {f.signal_score.toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right font-mono">
                      {formatPValue(f.p_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsiblePane>
    </div>
  );
}
