import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { cn } from "@/lib/utils";
import { getSeverityBadgeClasses } from "@/lib/severity-colors";
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
}

/** Severity color scale */
function getSeverityHeatColor(avgSev: number): string {
  if (avgSev >= 4) return "#E57373";
  if (avgSev >= 3) return "#FF8A65";
  if (avgSev >= 2) return "#FFB74D";
  if (avgSev >= 1) return "#FFE0B2";
  return "#FFF9C4";
}

export function HistopathologyContextPanel({ lesionData, ruleResults, selection }: Props) {
  const { studyId } = useParams<{ studyId: string }>();
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
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">{selection.finding}</h3>
        <p className="text-xs text-muted-foreground">{selection.specimen}</p>
      </div>

      {/* Finding detail */}
      <CollapsiblePane title="Dose Detail" defaultOpen>
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
      <CollapsiblePane title="Insights" defaultOpen>
        {findingRules.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No finding-specific insights.</p>
        ) : (
          <div className="space-y-1">
            {findingRules.slice(0, 10).map((rule, i) => {
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

      {/* Correlating evidence */}
      <CollapsiblePane title="Correlating Evidence" defaultOpen={false}>
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
      <CollapsiblePane title="Related Views" defaultOpen={false}>
        <div className="space-y-1 text-[11px]">
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
