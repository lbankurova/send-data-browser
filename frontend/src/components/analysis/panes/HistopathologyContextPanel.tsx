import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { InsightsList } from "./InsightsList";
import { PathologyReviewForm } from "./PathologyReviewForm";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { cn } from "@/lib/utils";
import { getSeverityBadgeClasses, getSeverityHeatColor } from "@/lib/severity-colors";
import type { LesionSeverityRow, RuleResult } from "@/types/analysis-views";

interface HistopathSelection {
  finding: string;
  specimen: string;
  sex?: string;
}

interface Props {
  lesionData: LesionSeverityRow[];
  ruleResults: RuleResult[];
  selection: HistopathSelection | null;
  studyId?: string;
}

export function HistopathologyContextPanel({ lesionData, ruleResults, selection, studyId: studyIdProp }: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;
  const navigate = useNavigate();

  // Dose-level detail for selected finding
  const findingRows = useMemo(() => {
    if (!selection) return [];
    return lesionData
      .filter((r) => r.finding === selection.finding && r.specimen === selection.specimen)
      .sort((a, b) => a.dose_level - b.dose_level || a.sex.localeCompare(b.sex));
  }, [lesionData, selection]);

  // Rules matching finding
  const findingRules = useMemo(() => {
    if (!selection) return [];
    const findingLower = selection.finding.toLowerCase();
    const specimenLower = selection.specimen.toLowerCase();
    return ruleResults.filter(
      (r) =>
        r.output_text.toLowerCase().includes(findingLower) ||
        r.output_text.toLowerCase().includes(specimenLower) ||
        r.context_key.toLowerCase().includes(specimenLower.replace(/[, ]+/g, "_"))
    );
  }, [ruleResults, selection]);

  // Correlating evidence: other findings in same specimen
  const correlating = useMemo(() => {
    if (!selection) return [];
    const otherFindings = lesionData
      .filter((r) => r.specimen === selection.specimen && r.finding !== selection.finding);
    const unique = new Map<string, { maxSev: number; count: number }>();
    for (const r of otherFindings) {
      const existing = unique.get(r.finding);
      if (existing) {
        existing.count++;
        if ((r.avg_severity ?? 0) > existing.maxSev) existing.maxSev = r.avg_severity ?? 0;
      } else {
        unique.set(r.finding, { maxSev: r.avg_severity ?? 0, count: 1 });
      }
    }
    return [...unique.entries()]
      .sort((a, b) => b[1].maxSev - a[1].maxSev)
      .slice(0, 10);
  }, [lesionData, selection]);

  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  if (!selection) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select a finding from the heatmap or grid to view details.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{selection.finding}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <p className="text-xs text-muted-foreground">{selection.specimen}</p>
      </div>

      {/* Pathology Review */}
      {studyId && (
        <PathologyReviewForm studyId={studyId} finding={selection.finding} defaultOpen />
      )}

      {/* Finding detail */}
      <CollapsiblePane title="Dose detail" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {findingRows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No data.</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-0.5 text-left font-medium">Dose</th>
                <th className="pb-0.5 text-left font-medium">Sex</th>
                <th className="pb-0.5 text-right font-medium">Incid.</th>
                <th className="pb-0.5 text-right font-medium">Avg Sev</th>
                <th className="pb-0.5 text-center font-medium">Sev</th>
              </tr>
            </thead>
            <tbody>
              {findingRows.map((row, i) => (
                <tr key={i} className="border-b border-dashed">
                  <td className="py-0.5">{row.dose_label.split(",")[0]}</td>
                  <td className="py-0.5">{row.sex}</td>
                  <td className="py-0.5 text-right font-mono">
                    {row.affected}/{row.n}
                  </td>
                  <td className="py-0.5 text-right">
                    <span
                      className="rounded px-1 font-mono text-[9px]"
                      style={{ backgroundColor: getSeverityHeatColor(row.avg_severity ?? 0) }}
                    >
                      {row.avg_severity != null ? row.avg_severity.toFixed(1) : "\u2014"}
                    </span>
                  </td>
                  <td className="py-0.5 text-center">
                    <span
                      className={cn(
                        "rounded-sm px-1 py-0.5 text-[9px] font-medium",
                        getSeverityBadgeClasses(row.severity)
                      )}
                    >
                      {row.severity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsiblePane>

      {/* Rule-based insights */}
      <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <InsightsList rules={findingRules} />
      </CollapsiblePane>

      {/* Correlating evidence */}
      <CollapsiblePane title="Correlating evidence" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        {correlating.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No other findings in this specimen.</p>
        ) : (
          <div className="space-y-0.5">
            {correlating.map(([finding, info]) => (
              <div key={finding} className="flex items-center justify-between text-[11px]">
                <span className="truncate" title={finding}>
                  {finding.length > 25 ? finding.slice(0, 25) + "\u2026" : finding}
                </span>
                <span
                  className="rounded px-1 font-mono text-[9px]"
                  style={{ backgroundColor: getSeverityHeatColor(info.maxSev) }}
                >
                  {info.maxSev.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
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
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/target-organs`, { state: { organ_system: selection.specimen } });
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
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { specimen: selection.specimen } });
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
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`, { state: { organ_system: selection.specimen } });
            }}
          >
            View NOAEL decision &#x2192;
          </a>
        </div>
      </CollapsiblePane>

      {/* Tox Assessment */}
      {studyId && (
        <ToxFindingForm studyId={studyId} endpointLabel={selection.finding} />
      )}
    </div>
  );
}
