import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { TierCountBadges } from "./TierCountBadges";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { cn } from "@/lib/utils";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { titleCase } from "@/lib/severity-colors";
import { computeTierCounts } from "@/lib/rule-synthesis";
import type { Tier } from "@/lib/rule-synthesis";
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
  const [tierFilter, setTierFilter] = useState<Tier | null>(null);

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

  // All evidence rows for this organ
  const organEvidence = useMemo(() => {
    if (!selection) return [];
    return evidenceData.filter((r) => r.organ_system === selection.organ_system);
  }, [evidenceData, selection]);

  // Contributing endpoints: unique endpoints sorted by occurrence count descending
  const endpoints = useMemo(() => {
    if (!selection) return [];
    const map = new Map<string, { domain: string; count: number }>();
    for (const r of organEvidence) {
      const existing = map.get(r.endpoint_label);
      if (existing) {
        existing.count++;
      } else {
        map.set(r.endpoint_label, { domain: r.domain, count: 1 });
      }
    }
    return [...map.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15);
  }, [organEvidence, selection]);

  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

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
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            {titleCase(selection.organ_system)}
          </h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px]">
            {selectedOrganSummary && (
              <>
                <span className={cn(
                  selectedOrganSummary.evidence_score >= 0.5 ? "font-semibold" : "font-medium"
                )}>
                  Evidence: {selectedOrganSummary.evidence_score.toFixed(2)}
                </span>
                {selectedOrganSummary.target_organ_flag && (
                  <span className="text-[10px] font-semibold uppercase text-[#DC2626]">
                    TARGET ORGAN
                  </span>
                )}
              </>
            )}
          </div>
          <span className="text-xs">
            <TierCountBadges
              counts={computeTierCounts(organRules)}
              activeTier={tierFilter}
              onTierClick={setTierFilter}
            />
          </span>
        </div>
      </div>

      {/* 1. Convergence summary (detail in center Hypotheses tab) */}
      <CollapsiblePane
        title="Convergence"
        defaultOpen
        expandAll={expandGen}
        collapseAll={collapseGen}
      >
        {organRules.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No convergence rules for this organ.</p>
        ) : (
          <div className="space-y-1.5 text-[11px]">
            {(() => {
              const counts = computeTierCounts(organRules);
              const lines: string[] = [];
              if (counts.Critical > 0) lines.push(`${counts.Critical} critical signal${counts.Critical > 1 ? "s" : ""}`);
              if (counts.Notable > 0) lines.push(`${counts.Notable} notable signal${counts.Notable > 1 ? "s" : ""}`);
              if (counts.Observed > 0) lines.push(`${counts.Observed} observed`);
              // Extract domain codes from evidence data (not context_key which has format "organ_hepatic" or "LB_ALT_M")
              const domains = new Set(organEvidence.map((r) => r.domain));
              return (
                <>
                  <p>{lines.join(", ") || "No tiered signals"} across {organRules.length} rule{organRules.length > 1 ? "s" : ""}.</p>
                  {domains.size > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
                      <span>Domains:</span>
                      {[...domains].sort().map((d) => (
                        <DomainLabel key={d} domain={d} />
                      ))}
                    </div>
                  )}
                  <p className="text-muted-foreground">
                    See Hypotheses tab for full insights.
                  </p>
                </>
              );
            })()}
          </div>
        )}
      </CollapsiblePane>

      {/* 2. Domain summary (detail in Evidence tab) */}
      <CollapsiblePane
        title="Domain coverage"
        defaultOpen
        expandAll={expandGen}
        collapseAll={collapseGen}
      >
        {endpoints.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No endpoints for this organ.</p>
        ) : (
          <div className="space-y-0.5">
            {(() => {
              const domainCounts = new Map<string, number>();
              for (const [, info] of endpoints) {
                domainCounts.set(info.domain, (domainCounts.get(info.domain) ?? 0) + 1);
              }
              return [...domainCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([domain, count]) => {
                  return (
                    <div key={domain} className="flex items-center justify-between text-[11px]">
                      <DomainLabel domain={domain} />
                      <span className="text-muted-foreground">{count} endpoint{count > 1 ? "s" : ""}</span>
                    </div>
                  );
                });
            })()}
            <p className="mt-1 text-[10px] text-muted-foreground">
              See Evidence tab for full endpoint list.
            </p>
          </div>
        )}
      </CollapsiblePane>

      {/* 3. Related views */}
      <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
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

      {/* 4. Tox Assessment (only when endpoint selected) */}
      {studyId && selection.endpoint_label && (
        <ToxFindingForm studyId={studyId} endpointLabel={selection.endpoint_label} />
      )}
    </div>
  );
}
