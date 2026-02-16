import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { InsightsList } from "./InsightsList";
import { TierCountBadges } from "./TierCountBadges";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { useNoaelSummary } from "@/hooks/useNoaelSummary";
import {
  formatPValue,
  formatEffectSize,
  getSeverityDotColor,
} from "@/lib/severity-colors";
import { computeTierCounts } from "@/lib/rule-synthesis";
import { deriveToxSuggestion } from "@/types/annotations";
import { generateNoaelNarrative } from "@/lib/noael-narrative";
import { DomainLabel } from "@/components/ui/DomainLabel";
import type { Tier } from "@/lib/rule-synthesis";
import type {
  AdverseEffectSummaryRow,
  RuleResult,
} from "@/types/analysis-views";

interface NoaelSelection {
  endpoint_label: string;
  dose_level: number;
  sex: string;
}

interface Props {
  aeData: AdverseEffectSummaryRow[];
  ruleResults: RuleResult[];
  selection: NoaelSelection | null;
  studyId?: string;
}

export function NoaelContextPanel({ aeData, ruleResults, selection, studyId: studyIdProp }: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;
  const navigate = useNavigate();
  const { navigateTo } = useStudySelection();
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

  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // NOAEL narrative for context panel
  const { data: noaelData } = useNoaelSummary(studyId);
  const narrative = useMemo(() => {
    if (!noaelData || noaelData.length === 0) return null;
    const primary = noaelData.find((r) => r.sex === "Combined") ?? noaelData[0];
    return generateNoaelNarrative(primary, aeData, primary.sex as "Combined" | "M" | "F");
  }, [noaelData, aeData]);

  // -------------------------------------------------------------------------
  // No-selection mode: study-level NOAEL overview
  // -------------------------------------------------------------------------
  if (!selection) {
    return (
      <div>
        <div className="flex items-center justify-end border-b px-4 py-1.5">
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>

        {/* NOAEL rationale narrative */}
        {narrative && (
          <CollapsiblePane title="NOAEL rationale" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
            <p className="text-[11px] leading-relaxed text-foreground/80">
              {narrative.summary}
            </p>
            {narrative.loael_details.length > 0 && (
              <div className="mt-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Dose-limiting findings at LOAEL
                </div>
                <div className="space-y-0.5">
                  {narrative.loael_details.map((f) => (
                    <button
                      key={f.finding}
                      type="button"
                      className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[10px] hover:bg-muted/40"
                      onClick={() => {
                        if (studyId) {
                          navigateTo({ endpoint: f.finding });
                        }
                      }}
                    >
                      <span className="font-medium">{f.finding}</span>
                      <DomainLabel domain={f.domain} />
                      <span className="ml-auto text-muted-foreground">
                        {f.effect_size != null && `|d|=${Math.abs(f.effect_size).toFixed(1)}`}
                        {f.p_value != null && `, p=${formatPValue(f.p_value)}`}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CollapsiblePane>
        )}

        {/* Insights */}
        <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <InsightsList rules={noaelRules} onEndpointClick={(organ) => {
            if (studyId) {
              navigateTo({ organSystem: organ });
              navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: organ } });
            }
          }} />
        </CollapsiblePane>

        <div className="px-4 py-3 text-xs text-muted-foreground">
          Select an endpoint to view adversity rationale.
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

      {/* 1. Endpoint insights */}
      <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <InsightsList rules={endpointRules} tierFilter={tierFilter} onEndpointClick={(organ) => {
          if (studyId) {
            navigateTo({ organSystem: organ });
            navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: organ } });
          }
        }} />
      </CollapsiblePane>

      {/* 2. Adversity rationale */}
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
                    className="text-[10px] font-medium"
                    style={{ color: getSeverityDotColor(row.severity) }}
                  >
                    {row.severity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsiblePane>

      {/* 3. Tox Assessment */}
      {studyId && (() => {
        const bestRow = selectedRows.find((r) => r.severity === "adverse") ?? selectedRows[0];
        return (
          <ToxFindingForm
            studyId={studyId}
            endpointLabel={selection.endpoint_label}
            systemSuggestion={bestRow ? deriveToxSuggestion(bestRow.treatment_related, bestRow.severity) : undefined}
          />
        );
      })()}

      {/* 4. Related views (with context) */}
      <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-1 text-[11px]">
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) {
                if (selectedOrganSystem) navigateTo({ organSystem: selectedOrganSystem });
                navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, {
                  state: {
                    endpoint_label: selection.endpoint_label,
                    ...(selectedOrganSystem && { organ_system: selectedOrganSystem }),
                  },
                });
              }
            }}
          >
            View dose-response &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) {
                if (selectedOrganSystem) navigateTo({ organSystem: selectedOrganSystem });
                navigate(`/studies/${encodeURIComponent(studyId)}`, {
                  state: selectedOrganSystem ? { organ_system: selectedOrganSystem } : undefined,
                });
              }
            }}
          >
            View study summary &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) {
                if (selectedOrganSystem) navigateTo({ organSystem: selectedOrganSystem });
                navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, {
                  state: selectedOrganSystem ? { organ_system: selectedOrganSystem } : undefined,
                });
              }
            }}
          >
            View histopathology &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}
