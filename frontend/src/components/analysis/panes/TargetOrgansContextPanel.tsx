import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { cn } from "@/lib/utils";
import { getDomainBadgeColor, getSignalScoreColor } from "@/lib/severity-colors";
import type {
  TargetOrganRow,
  OrganEvidenceRow,
  RuleResult,
} from "@/types/analysis-views";

interface OrganSelection {
  organ_system: string;
  endpoint_label?: string;
  sex?: string;
}

interface Props {
  organData: TargetOrganRow[];
  evidenceData: OrganEvidenceRow[];
  ruleResults: RuleResult[];
  selection: OrganSelection | null;
}

export function TargetOrgansContextPanel({
  organData,
  evidenceData,
  ruleResults,
  selection,
}: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();

  const selectedOrganSummary = useMemo(() => {
    if (!selection) return null;
    return organData.find((o) => o.organ_system === selection.organ_system) ?? null;
  }, [organData, selection]);

  // Rules for selected organ
  const organRules = useMemo(() => {
    if (!selection) return [];
    const organKey = `organ_${selection.organ_system}`;
    return ruleResults.filter(
      (r) => r.context_key === organKey || r.organ_system === selection.organ_system
    );
  }, [ruleResults, selection]);

  // Contributing endpoints for selected organ
  const endpoints = useMemo(() => {
    if (!selection) return [];
    const matching = evidenceData.filter((r) => r.organ_system === selection.organ_system);
    const unique = new Map<string, { domain: string; count: number }>();
    for (const r of matching) {
      const existing = unique.get(r.endpoint_label);
      if (existing) {
        existing.count++;
      } else {
        unique.set(r.endpoint_label, { domain: r.domain, count: 1 });
      }
    }
    return [...unique.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15);
  }, [evidenceData, selection]);

  if (!selection) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an organ system to view convergence details.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-semibold">
          {selection.organ_system.replace(/_/g, " ")}
        </h3>
        {selectedOrganSummary && (
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <span
              className="rounded px-1.5 py-0.5 font-medium text-white"
              style={{ backgroundColor: getSignalScoreColor(selectedOrganSummary.evidence_score / 2) }}
            >
              Evidence: {selectedOrganSummary.evidence_score.toFixed(2)}
            </span>
            {selectedOrganSummary.target_organ_flag && (
              <span className="rounded bg-red-100 px-1 py-0.5 text-[10px] font-medium text-red-700">
                TARGET ORGAN
              </span>
            )}
          </div>
        )}
      </div>

      {/* Organ convergence */}
      <CollapsiblePane title="Convergence" defaultOpen>
        {organRules.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No organ-specific insights.</p>
        ) : (
          <div className="space-y-1">
            {organRules.slice(0, 10).map((rule, i) => {
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

      {/* Contributing endpoints */}
      <CollapsiblePane title="Endpoints" defaultOpen>
        <div className="space-y-0.5">
          {endpoints.map(([label, info]) => {
            const dc = getDomainBadgeColor(info.domain);
            return (
              <div key={label} className="flex items-center gap-1 text-[11px]">
                <span className={cn("rounded px-1 py-0.5 text-[9px] font-medium", dc.bg, dc.text)}>
                  {info.domain}
                </span>
                <span className="truncate" title={label}>
                  {label.length > 28 ? label.slice(0, 28) + "\u2026" : label}
                </span>
                <span className="ml-auto text-muted-foreground">({info.count})</span>
              </div>
            );
          })}
        </div>
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
