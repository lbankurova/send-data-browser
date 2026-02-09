import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { InsightsList } from "./InsightsList";
import { ToxFindingForm } from "./ToxFindingForm";
import { cn } from "@/lib/utils";
import { getDomainBadgeColor } from "@/lib/severity-colors";
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
  studyId?: string;
}

export function TargetOrgansContextPanel({
  organData,
  evidenceData,
  ruleResults,
  selection,
  studyId: studyIdProp,
}: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;
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
            <span className={cn(
              selectedOrganSummary.evidence_score >= 0.5 ? "font-semibold" : "font-medium"
            )}>
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
        <InsightsList rules={organRules} />
      </CollapsiblePane>

      {/* Contributing endpoints */}
      <CollapsiblePane title="Endpoints" defaultOpen>
        <div className="space-y-0.5">
          {endpoints.map(([label, info]) => {
            const dc = getDomainBadgeColor(info.domain);
            return (
              <div key={label} className="flex items-center gap-1 text-[11px]">
                <span className="inline-flex items-center gap-1 rounded border border-border px-1 py-0.5 text-[9px] font-medium text-foreground/70">
                  <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dc.bg)} />
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
      <CollapsiblePane title="Related views" defaultOpen={false}>
        <div className="space-y-1 text-[11px]">
          <a
            href="#"
            className="block hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: selection.organ_system } });
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
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { organ_system: selection.organ_system } });
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
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`, { state: { organ_system: selection.organ_system } });
            }}
          >
            View NOAEL decision &#x2192;
          </a>
        </div>
      </CollapsiblePane>

      {/* Tox Assessment */}
      {studyId && selection.endpoint_label && (
        <ToxFindingForm studyId={studyId} endpointLabel={selection.endpoint_label} />
      )}
    </div>
  );
}
