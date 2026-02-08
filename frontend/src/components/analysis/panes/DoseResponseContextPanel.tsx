import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { InsightsList } from "./InsightsList";
import { ToxFindingForm } from "./ToxFindingForm";
import { cn } from "@/lib/utils";
import { formatPValue, formatEffectSize, getPValueColor } from "@/lib/severity-colors";
import type { DoseResponseRow, RuleResult } from "@/types/analysis-views";

interface DoseResponseSelection {
  endpoint_label: string;
  sex?: string;
  domain?: string;
  organ_system?: string;
}

interface Props {
  drData: DoseResponseRow[];
  ruleResults: RuleResult[];
  selection: DoseResponseSelection | null;
  studyId?: string;
}

export function DoseResponseContextPanel({ drData, ruleResults, selection, studyId: studyIdProp }: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;
  const navigate = useNavigate();

  // Rules for selected endpoint
  const endpointRules = useMemo(() => {
    if (!selection) return [];
    return ruleResults.filter(
      (r) =>
        r.context_key.includes(selection.domain ?? "") ||
        r.output_text.toLowerCase().includes(selection.endpoint_label.toLowerCase().slice(0, 20))
    );
  }, [ruleResults, selection]);

  // Pairwise detail for selected endpoint
  const pairwiseRows = useMemo(() => {
    if (!selection) return [];
    return drData
      .filter(
        (r) =>
          r.endpoint_label === selection.endpoint_label &&
          (!selection.sex || r.sex === selection.sex)
      )
      .sort((a, b) => a.dose_level - b.dose_level);
  }, [drData, selection]);

  if (!selection) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an endpoint from the grid or chart to view dose-response details.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{selection.endpoint_label}</h3>
        <p className="text-xs text-muted-foreground">
          {selection.domain} &middot; {selection.organ_system?.replace(/_/g, " ")}
          {selection.sex && <> &middot; {selection.sex}</>}
        </p>
      </div>

      {/* Endpoint insights */}
      <CollapsiblePane title="Insights" defaultOpen>
        <InsightsList rules={endpointRules} />
      </CollapsiblePane>

      {/* Pairwise detail */}
      <CollapsiblePane title="Pairwise detail" defaultOpen>
        {pairwiseRows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No pairwise data.</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-0.5 text-left font-medium">Dose</th>
                <th className="pb-0.5 text-left font-medium">Sex</th>
                <th className="pb-0.5 text-right font-medium">Mean</th>
                <th className="pb-0.5 text-right font-medium">p</th>
                <th className="pb-0.5 text-right font-medium">Effect</th>
              </tr>
            </thead>
            <tbody>
              {pairwiseRows.map((row, i) => (
                <tr key={i} className="border-b border-dashed">
                  <td className="py-0.5">{row.dose_label.split(",")[0]}</td>
                  <td className="py-0.5">{row.sex}</td>
                  <td className="py-0.5 text-right font-mono">
                    {row.mean != null ? row.mean.toFixed(2) : "\u2014"}
                  </td>
                  <td className={cn("py-0.5 text-right font-mono", getPValueColor(row.p_value))}>
                    {formatPValue(row.p_value)}
                  </td>
                  <td className="py-0.5 text-right font-mono">
                    {formatEffectSize(row.effect_size)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsiblePane>

      {/* Tox Assessment */}
      {studyId && (
        <ToxFindingForm studyId={studyId} endpointLabel={selection.endpoint_label} defaultOpen />
      )}

      {/* Cross-view links */}
      <CollapsiblePane title="Related views" defaultOpen={false}>
        <div className="space-y-1 text-[11px]">
          {selection.organ_system && (
            <a
              href="#"
              className="block hover:underline"
              style={{ color: "#3a7bd5" }}
              onClick={(e) => {
                e.preventDefault();
                if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/target-organs`);
              }}
            >
              View target organ: {selection.organ_system.replace(/_/g, " ")} &#x2192;
            </a>
          )}
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
          <a
            href="#"
            className="block hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`);
            }}
          >
            View NOAEL decision &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}
