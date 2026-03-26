import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { ContextPanelHeader } from "./ContextPanelHeader";
import { InsightsList } from "./InsightsList";
import { TierCountBadges } from "./TierCountBadges";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { titleCase } from "@/lib/severity-colors";
import { computeTierCounts } from "@/lib/rule-synthesis";
import { computeConfidenceBreakdown } from "@/lib/rule-definitions";
import type { NoaelNarrative } from "@/lib/noael-narrative";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { MethodologyPanel } from "@/components/analysis/MethodologyPanel";
import { useStatMethods } from "@/hooks/useStatMethods";
import { AuditTrailPanel } from "@/components/analysis/AuditTrailPanel";
import type {
  AdverseEffectSummaryRow,
  NoaelSummaryRow,
  RuleResult,
} from "@/types/analysis-views";

interface Props {
  aeData: AdverseEffectSummaryRow[];
  ruleResults: RuleResult[];
  organSelection: string | null;
  studyId?: string;
  narrative?: NoaelNarrative | null;
  noaelData?: NoaelSummaryRow[];
}

export function NoaelContextPanel({
  aeData,
  ruleResults,
  organSelection,
  studyId: studyIdProp,
  narrative,
  noaelData,
}: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;
  const noaelStatMethods = useStatMethods(studyId);
  const navigate = useNavigate();
  const { navigateTo } = useStudySelection();

  // NOAEL-related rules (scope=study)
  const noaelRules = useMemo(
    () => ruleResults.filter((r) => r.scope === "study"),
    [ruleResults]
  );

  // Organ-scoped rules
  const organRules = useMemo(() => {
    if (!organSelection) return [];
    const organKey = organSelection.toLowerCase();
    return ruleResults.filter(
      (r) =>
        r.organ_system === organSelection ||
        r.context_key.includes(`organ_${organKey}`) ||
        r.scope === "study"
    );
  }, [ruleResults, organSelection]);

  // Organ-level evidence summary
  const organEvidence = useMemo(() => {
    if (!organSelection) return null;
    const organAe = aeData.filter((r) => r.organ_system === organSelection);
    if (!organAe.length) return null;

    const domains = new Set(organAe.map((r) => r.domain));
    const adverseCount = organAe.filter((r) => r.severity === "adverse").length;
    const trCount = organAe.filter((r) => r.treatment_related).length;
    const malesAdverse = organAe.filter((r) => r.sex === "M" && r.severity === "adverse").length;
    const femalesAdverse = organAe.filter((r) => r.sex === "F" && r.severity === "adverse").length;

    return { domains, adverseCount, trCount, totalCount: organAe.length, malesAdverse, femalesAdverse };
  }, [organSelection, aeData]);

  // Confidence breakdown for study-level mode
  const confidenceBreakdown = useMemo(() => {
    if (!noaelData || noaelData.length === 0) return null;
    const primary = noaelData.find((r) => r.sex === "Combined") ?? noaelData[0];
    return computeConfidenceBreakdown(primary, noaelData);
  }, [noaelData]);

  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // -------------------------------------------------------------------------
  // Organ-selected mode: assessment summary + cross-view link + audit trail
  // -------------------------------------------------------------------------
  if (organSelection) {
    return (
      <div>
        <ContextPanelHeader
          title={titleCase(organSelection)}
          subtitle={organEvidence ? (
            <>{organEvidence.adverseCount} adverse &middot; {organEvidence.domains.size} domain(s)</>
          ) : undefined}
          onExpandAll={expandAll}
          onCollapseAll={collapseAll}
        >
          <div className="mt-1.5 text-xs">
            <TierCountBadges
              counts={computeTierCounts(organRules)}
            />
          </div>
        </ContextPanelHeader>

        {/* 1. Organ insights */}
        <CollapsiblePane title="Organ insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <InsightsList
            rules={organRules}
            onEndpointClick={(organ) => {
              if (studyId) {
                navigateTo({ organSystem: organ });
                navigate(`/studies/${encodeURIComponent(studyId)}/findings`, { state: { organ_system: organ } });
              }
            }}
          />
        </CollapsiblePane>

        {/* 2. Evidence breakdown */}
        {organEvidence && (
          <CollapsiblePane title="Evidence breakdown" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Domains:</span>
                {[...organEvidence.domains].map((d) => (
                  <DomainLabel key={d} domain={d} />
                ))}
              </div>
              <div className="text-muted-foreground">
                Adverse: {organEvidence.adverseCount}/{organEvidence.totalCount}
              </div>
              <div className="text-muted-foreground">
                Treatment-related: {organEvidence.trCount}
              </div>
              <div className="mt-1 border-t pt-1 text-muted-foreground">
                <div>Males adverse: {organEvidence.malesAdverse}</div>
                <div>Females adverse: {organEvidence.femalesAdverse}</div>
              </div>
            </div>
          </CollapsiblePane>
        )}

        {/* 3. Related views */}
        {studyId && (
          <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
            <div className="space-y-1">
              <RelatedViewLink label="View in Findings" onClick={() => navigate(`/studies/${encodeURIComponent(studyId!)}/findings`, { state: { organ_system: organSelection } })} />
              <RelatedViewLink label="View in Histopathology" onClick={() => navigate(`/studies/${encodeURIComponent(studyId!)}/histopathology`, { state: { organ_system: organSelection } })} />
              <RelatedViewLink label="View study summary" onClick={() => navigate(`/studies/${encodeURIComponent(studyId!)}`, { state: { organ_system: organSelection } })} />
            </div>
          </CollapsiblePane>
        )}

        {/* 4. Audit trail */}
        {studyId && (
          <AuditTrailPanel
            studyId={studyId}
            entityFilter={organSelection}
            expandAll={expandGen}
            collapseAll={collapseGen}
          />
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Study-level mode: confidence + narrative + insights + methodology + audit
  // -------------------------------------------------------------------------
  return (
    <div>
      <ContextPanelHeader
        title="NOAEL determination"
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
      />

      {/* 1. NOAEL rationale narrative */}
      {narrative && (
        <CollapsiblePane title="NOAEL rationale" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <p className="text-xs leading-relaxed text-foreground/80">
            {narrative.summary}
          </p>
          {narrative.loael_details.length > 0 && (
            <div className="mt-2">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Dose-limiting findings at LOAEL
              </div>
              <div className="space-y-0.5">
                {narrative.loael_details.map((f) => (
                  <button
                    key={f.finding}
                    type="button"
                    className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] hover:bg-muted/40"
                    onClick={() => {
                      if (studyId) {
                        navigateTo({ endpoint: f.finding });
                      }
                    }}
                  >
                    <span className="font-medium">{f.finding}</span>
                    <DomainLabel domain={f.domain} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </CollapsiblePane>
      )}

      {/* 2. Confidence breakdown (expanded, not just a popover) */}
      {confidenceBreakdown && (
        <CollapsiblePane title="Confidence breakdown" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-1 text-[11px] font-mono tabular-nums">
            <div className="flex justify-between">
              <span>Base</span>
              <span>{confidenceBreakdown.base.toFixed(2)}</span>
            </div>
            <ConfidencePenaltyRow label="Single endpoint" value={confidenceBreakdown.singleEndpointPenalty} detail={confidenceBreakdown.singleEndpointDetail} />
            <ConfidencePenaltyRow label="Sex inconsistency" value={confidenceBreakdown.sexInconsistencyPenalty} detail={confidenceBreakdown.sexInconsistencyDetail} />
            <ConfidencePenaltyRow label="Pathology disagreement" value={confidenceBreakdown.pathologyPenalty} detail={confidenceBreakdown.pathologyDetail} />
            <ConfidencePenaltyRow label="Large effect non-sig" value={confidenceBreakdown.largeEffectPenalty} detail={confidenceBreakdown.largeEffectDetail} />
            <div className="flex justify-between border-t pt-1.5 font-semibold">
              <span>Confidence</span>
              <span>{confidenceBreakdown.total.toFixed(2)} ({Math.round(confidenceBreakdown.total * 100)}%)</span>
            </div>
          </div>
        </CollapsiblePane>
      )}

      {/* 3. Insights */}
      <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <InsightsList rules={noaelRules} onEndpointClick={(organ) => {
          if (studyId) {
            navigateTo({ organSystem: organ });
            navigate(`/studies/${encodeURIComponent(studyId)}/findings`, { state: { organ_system: organ } });
          }
        }} />
      </CollapsiblePane>

      {/* 4. Methodology */}
      <MethodologyPanel expandAll={expandGen} collapseAll={collapseGen} activeEffectSizeMethod={noaelStatMethods.effectSize} />

      {/* 5. Related views */}
      {studyId && (
        <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-1">
            <RelatedViewLink label="View findings" onClick={() => navigate(`/studies/${encodeURIComponent(studyId!)}/findings`)} />
            <RelatedViewLink label="View study summary" onClick={() => navigate(`/studies/${encodeURIComponent(studyId!)}`)} />
          </div>
        </CollapsiblePane>
      )}

      {/* 6. Audit trail (override history) */}
      {studyId && (
        <AuditTrailPanel
          studyId={studyId}
          entityFilter="noael"
          expandAll={expandGen}
          collapseAll={collapseGen}
        />
      )}
    </div>
  );
}

// ─── Helper ─────────────────────────────────────────────────────────────────

function RelatedViewLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="block w-full text-left text-xs font-medium text-primary hover:underline"
      onClick={onClick}
    >
      {label} &rarr;
    </button>
  );
}

function ConfidencePenaltyRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  if (value === 0) return null;
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">&minus; {label}</span>
      <span className="flex items-baseline gap-1.5">
        <span>{value.toFixed(2)}</span>
        <span className="text-[10px] text-muted-foreground">({detail})</span>
      </span>
    </div>
  );
}
