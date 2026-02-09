import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { InsightsList } from "./InsightsList";
import { TierCountBadges } from "./TierCountBadges";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import {
  formatPValue,
  formatEffectSize,
  getSeverityBadgeClasses,
} from "@/lib/severity-colors";
import { computeTierCounts } from "@/lib/rule-synthesis";
import { cn } from "@/lib/utils";
import type { Tier } from "@/lib/rule-synthesis";
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

function confidenceLabel(score: number): { text: string; cls: string } {
  if (score >= 0.8) return { text: "High", cls: "font-semibold text-green-700" };
  if (score >= 0.5) return { text: "Moderate", cls: "font-medium text-amber-700" };
  return { text: "Low", cls: "font-medium text-red-700" };
}

export function NoaelContextPanel({ noaelData, aeData, ruleResults, selection, studyId: studyIdProp }: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;
  const navigate = useNavigate();
  const [tierFilter, setTierFilter] = useState<Tier | null>(null);

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

  // Derive organ_system from aeData for cross-view links
  const selectedOrganSystem = useMemo(() => {
    if (!selection) return null;
    const match = aeData.find((r) => r.endpoint_label === selection.endpoint_label);
    return match?.organ_system ?? null;
  }, [aeData, selection]);

  // Count distinct target organs (adverse endpoints at LOAEL across all sexes)
  const adverseSummary = useMemo(() => {
    const adverse = aeData.filter((r) => r.severity === "adverse");
    const organs = new Set(adverse.map((r) => r.organ_system));
    const endpoints = new Set(adverse.map((r) => r.endpoint_label));
    return { nOrgans: organs.size, nEndpoints: endpoints.size };
  }, [aeData]);

  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // -------------------------------------------------------------------------
  // No-selection mode: study-level NOAEL overview
  // -------------------------------------------------------------------------
  if (!selection) {
    return (
      <div>
        <div className="flex items-center justify-end border-b px-4 py-1.5">
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>

        {/* 1. NOAEL narrative */}
        <CollapsiblePane title="NOAEL narrative" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <InsightsList rules={noaelRules} />
        </CollapsiblePane>

        {/* 2. NOAEL summary table */}
        <CollapsiblePane title="NOAEL summary" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          {noaelData.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No NOAEL data available.</p>
          ) : (
            <div className="space-y-2">
              <table className="w-full text-[10px] tabular-nums">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-0.5 text-left font-medium">Sex</th>
                    <th className="pb-0.5 text-right font-medium">NOAEL</th>
                    <th className="pb-0.5 text-right font-medium">LOAEL</th>
                    <th className="pb-0.5 text-right font-medium">Conf.</th>
                  </tr>
                </thead>
                <tbody>
                  {noaelData.map((r) => {
                    const conf = confidenceLabel(r.noael_confidence);
                    return (
                      <tr key={r.sex} className="border-b border-dashed">
                        <td className="py-0.5 text-muted-foreground">
                          {r.sex === "Combined" ? "All" : r.sex}
                        </td>
                        <td className="py-0.5 text-right font-mono">
                          {r.noael_label}
                        </td>
                        <td className="py-0.5 text-right font-mono">
                          {r.loael_label}
                        </td>
                        <td className={cn("py-0.5 text-right", conf.cls)}>
                          {conf.text}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Aggregate counts */}
              <div className="space-y-0.5 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Target organs</span>
                  <span>{adverseSummary.nOrgans}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adverse endpoints</span>
                  <span>{adverseSummary.nEndpoints}</span>
                </div>
              </div>
            </div>
          )}
        </CollapsiblePane>

        {/* 3. Confidence factors */}
        <CollapsiblePane title="Confidence factors" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-1.5 text-[11px]">
            {noaelData.map((r) => {
              const conf = confidenceLabel(r.noael_confidence);
              return (
                <div key={r.sex}>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {r.sex === "Combined" ? "Combined" : r.sex}
                    </span>
                    <span className={conf.cls}>
                      {(r.noael_confidence * 100).toFixed(0)}% ({conf.text})
                    </span>
                  </div>
                  <div className="ml-2 text-[10px] text-muted-foreground">
                    {r.n_adverse_at_loael} adverse at LOAEL ({r.adverse_domains_at_loael.join(", ")})
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsiblePane>

        <div className="px-4 py-2 text-xs text-muted-foreground">
          Select a row to view adversity rationale.
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // With-selection mode: endpoint-level adversity detail
  // -------------------------------------------------------------------------
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
        <div className="mt-1.5 text-xs">
          <TierCountBadges
            counts={computeTierCounts(endpointRules)}
            activeTier={tierFilter}
            onTierClick={setTierFilter}
          />
        </div>
      </div>

      {/* 1. Adversity rationale */}
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

      {/* 2. Endpoint insights */}
      <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <InsightsList rules={endpointRules} tierFilter={tierFilter} />
      </CollapsiblePane>

      {/* 3. Related views (with context) */}
      <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-1 text-[11px]">
          <a
            href="#"
            className="block hover:underline"
            style={{ color: "#3a7bd5" }}
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, {
                state: {
                  endpoint_label: selection.endpoint_label,
                  ...(selectedOrganSystem && { organ_system: selectedOrganSystem }),
                },
              });
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
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/target-organs`, {
                state: selectedOrganSystem ? { organ_system: selectedOrganSystem } : undefined,
              });
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
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, {
                state: selectedOrganSystem ? { organ_system: selectedOrganSystem } : undefined,
              });
            }}
          >
            View histopathology &#x2192;
          </a>
        </div>
      </CollapsiblePane>

      {/* 4. Tox Assessment */}
      {studyId && (
        <ToxFindingForm studyId={studyId} endpointLabel={selection.endpoint_label} />
      )}
    </div>
  );
}
