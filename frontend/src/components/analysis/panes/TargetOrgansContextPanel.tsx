import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { InsightsList } from "./InsightsList";
import { TierCountBadges } from "./TierCountBadges";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { cn } from "@/lib/utils";
import {
  getDomainBadgeColor,
  titleCase,
  formatPValue,
} from "@/lib/severity-colors";
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

  // Contributing endpoints: unique endpoints with best p-value and max effect size
  const endpoints = useMemo(() => {
    if (!selection) return [];
    const map = new Map<string, { domain: string; minP: number | null; maxD: number | null }>();
    for (const r of organEvidence) {
      const existing = map.get(r.endpoint_label);
      if (existing) {
        if (r.p_value !== null && (existing.minP === null || r.p_value < existing.minP)) {
          existing.minP = r.p_value;
        }
        if (r.effect_size !== null && (existing.maxD === null || Math.abs(r.effect_size) > existing.maxD)) {
          existing.maxD = Math.abs(r.effect_size);
        }
      } else {
        map.set(r.endpoint_label, {
          domain: r.domain,
          minP: r.p_value,
          maxD: r.effect_size !== null ? Math.abs(r.effect_size) : null,
        });
      }
    }
    return [...map.entries()]
      .sort((a, b) => (b[1].maxD ?? 0) - (a[1].maxD ?? 0))
      .slice(0, 15);
  }, [organEvidence, selection]);

  // Evidence breakdown statistics
  const evidence = useMemo(() => {
    const domains = [...new Set(organEvidence.map((r) => r.domain))].sort();
    const nSignificant = organEvidence.filter(
      (r) => r.p_value !== null && r.p_value < 0.05
    ).length;
    const nTR = organEvidence.filter((r) => r.treatment_related).length;
    const nAdverse = organEvidence.filter((r) => r.severity === "adverse").length;
    const maleRows = organEvidence.filter((r) => r.sex === "M");
    const femaleRows = organEvidence.filter((r) => r.sex === "F");
    const maleSig = maleRows.filter((r) => r.p_value !== null && r.p_value < 0.05).length;
    const femaleSig = femaleRows.filter((r) => r.p_value !== null && r.p_value < 0.05).length;
    return {
      total: organEvidence.length,
      domains,
      nSignificant,
      nTR,
      nAdverse,
      maleTotal: maleRows.length,
      maleSig,
      femaleTotal: femaleRows.length,
      femaleSig,
    };
  }, [organEvidence]);

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

      {/* 1. Convergence insights */}
      <CollapsiblePane
        title="Convergence"
        defaultOpen
        expandAll={expandGen}
        collapseAll={collapseGen}
      >
        <InsightsList rules={organRules} tierFilter={tierFilter} />
      </CollapsiblePane>

      {/* 2. Contributing endpoints (tabular) */}
      <CollapsiblePane
        title={`Endpoints (${endpoints.length})`}
        defaultOpen
        expandAll={expandGen}
        collapseAll={collapseGen}
      >
        {endpoints.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No endpoints for this organ.</p>
        ) : (
          <table className="w-full text-[10px] tabular-nums">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-0.5 text-left font-medium">Endpoint</th>
                <th className="pb-0.5 text-left font-medium">Dom</th>
                <th className="pb-0.5 text-right font-medium">|d|</th>
                <th className="pb-0.5 text-right font-medium">p</th>
              </tr>
            </thead>
            <tbody>
              {endpoints.map(([label, info]) => {
                const dc = getDomainBadgeColor(info.domain);
                return (
                  <tr
                    key={label}
                    className="cursor-pointer border-b border-dashed hover:bg-accent/30"
                    onClick={() => {
                      if (studyId) {
                        navigate(
                          `/studies/${encodeURIComponent(studyId)}/dose-response`,
                          { state: { endpoint_label: label, organ_system: selection.organ_system } }
                        );
                      }
                    }}
                  >
                    <td className="truncate py-0.5" title={label}>
                      {label.length > 22 ? label.slice(0, 22) + "\u2026" : label}
                    </td>
                    <td className={`py-0.5 text-[9px] font-semibold ${dc.text}`}>
                      {info.domain}
                    </td>
                    <td className="py-0.5 text-right font-mono">
                      {info.maxD !== null ? info.maxD.toFixed(2) : "\u2014"}
                    </td>
                    <td className="py-0.5 text-right font-mono">
                      {formatPValue(info.minP)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CollapsiblePane>

      {/* 3. Evidence breakdown */}
      <CollapsiblePane title="Evidence breakdown" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-2 text-[11px]">
          {/* Domains */}
          <div>
            <span className="text-muted-foreground">Domains: </span>
            <span className="inline-flex flex-wrap gap-1">
              {evidence.domains.map((d) => (
                <span
                  key={d}
                  className={`text-[9px] font-semibold ${getDomainBadgeColor(d).text}`}
                >
                  {d}
                </span>
              ))}
            </span>
          </div>
          {/* Counts */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Significant</span>
            <span>{evidence.nSignificant} / {evidence.total}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Treatment-related</span>
            <span>{evidence.nTR}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Adverse</span>
            <span>{evidence.nAdverse}</span>
          </div>
          {/* Sex comparison */}
          <div className="mt-1 border-t pt-1">
            <div className="mb-0.5 text-[10px] text-muted-foreground">Sex comparison</div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Males</span>
              <span>{evidence.maleSig} sig / {evidence.maleTotal} total</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Females</span>
              <span>{evidence.femaleSig} sig / {evidence.femaleTotal} total</span>
            </div>
          </div>
        </div>
      </CollapsiblePane>

      {/* 4. Related views */}
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

      {/* 5. Tox Assessment (only when endpoint selected) */}
      {studyId && selection.endpoint_label && (
        <ToxFindingForm studyId={studyId} endpointLabel={selection.endpoint_label} />
      )}
    </div>
  );
}
