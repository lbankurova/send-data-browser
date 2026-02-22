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
  titleCase,
} from "@/lib/severity-colors";
import { computeTierCounts } from "@/lib/rule-synthesis";
import { deriveToxSuggestion } from "@/types/annotations";
import { generateNoaelNarrative } from "@/lib/noael-narrative";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { SignalScorePopover } from "@/components/analysis/ScoreBreakdown";
import { SourceRecordsExpander } from "@/components/analysis/SourceRecordsExpander";
import { MethodologyPanel } from "@/components/analysis/MethodologyPanel";
import { AuditTrailPanel } from "@/components/analysis/AuditTrailPanel";
import type { Tier } from "@/lib/rule-synthesis";
import type {
  AdverseEffectSummaryRow,
  RuleResult,
  SignalSummaryRow,
} from "@/types/analysis-views";

interface NoaelSelection {
  endpoint_label: string;
  dose_level: number;
  sex: string;
}

interface Props {
  aeData: AdverseEffectSummaryRow[];
  ruleResults: RuleResult[];
  signalData: SignalSummaryRow[];
  selection: NoaelSelection | null;
  organSelection: string | null;
  studyId?: string;
}

export function NoaelContextPanel({
  aeData,
  ruleResults,
  signalData,
  selection,
  organSelection,
  studyId: studyIdProp,
}: Props) {
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
    if (selection) {
      const match = aeData.find((r) => r.endpoint_label === selection.endpoint_label);
      return match?.organ_system ?? organSelection;
    }
    return organSelection;
  }, [aeData, selection, organSelection]);

  // Organ-scoped rules
  const organRules = useMemo(() => {
    if (!selectedOrganSystem) return [];
    const organKey = selectedOrganSystem.toLowerCase();
    return ruleResults.filter(
      (r) =>
        r.organ_system === selectedOrganSystem ||
        r.context_key.includes(`organ_${organKey}`) ||
        r.scope === "study"
    );
  }, [ruleResults, selectedOrganSystem]);

  // Organ-level signal aggregation (for organ panel)
  const organSignalSummary = useMemo(() => {
    if (!organSelection || !signalData.length) return null;
    const organSignals = signalData.filter((s) => s.organ_system === organSelection);
    if (!organSignals.length) return null;

    // Group by endpoint, take max signal_score per endpoint
    const endpointMap = new Map<string, { endpoint: string; domain: string; maxScore: number; bestP: number | null }>();
    for (const s of organSignals) {
      const existing = endpointMap.get(s.endpoint_label);
      if (!existing || s.signal_score > existing.maxScore) {
        endpointMap.set(s.endpoint_label, {
          endpoint: s.endpoint_label,
          domain: s.domain,
          maxScore: s.signal_score,
          bestP: s.p_value,
        });
      } else if (existing && s.p_value != null && (existing.bestP == null || s.p_value < existing.bestP)) {
        existing.bestP = s.p_value;
      }
    }
    const endpoints = [...endpointMap.values()].sort((a, b) => b.maxScore - a.maxScore).slice(0, 15);

    // Counts
    const domains = new Set(organSignals.map((s) => s.domain));
    const sigCount = organSignals.filter((s) => s.p_value != null && s.p_value < 0.05).length;
    const totalCount = organSignals.length;
    const trCount = organSignals.filter((s) => s.treatment_related).length;
    const malesSig = organSignals.filter((s) => s.sex === "M" && s.p_value != null && s.p_value < 0.05).length;
    const malesTotal = organSignals.filter((s) => s.sex === "M").length;
    const femalesSig = organSignals.filter((s) => s.sex === "F" && s.p_value != null && s.p_value < 0.05).length;
    const femalesTotal = organSignals.filter((s) => s.sex === "F").length;

    return { endpoints, domains, sigCount, totalCount, trCount, malesSig, malesTotal, femalesSig, femalesTotal };
  }, [organSelection, signalData]);

  // Signal row matching the selected endpoint (for statistics pane)
  const selectedSignalRow = useMemo(() => {
    if (!selection || !signalData.length) return null;
    // Find the best signal row for this endpoint + sex
    const matches = signalData.filter(
      (s) => s.endpoint_label === selection.endpoint_label && s.sex === selection.sex
    );
    if (matches.length === 0) {
      // Fall back to any sex match
      return signalData.find((s) => s.endpoint_label === selection.endpoint_label) ?? null;
    }
    return matches.sort((a, b) => b.signal_score - a.signal_score)[0];
  }, [selection, signalData]);

  // Correlations: other endpoints in same organ system
  const correlations = useMemo(() => {
    if (!selection || !selectedOrganSystem || !signalData.length) return [];
    const organSignals = signalData.filter(
      (s) => s.organ_system === selectedOrganSystem && s.endpoint_label !== selection.endpoint_label
    );
    // Group by endpoint, take max signal_score
    const epMap = new Map<string, { endpoint: string; domain: string; score: number; p: number | null }>();
    for (const s of organSignals) {
      const existing = epMap.get(s.endpoint_label);
      if (!existing || s.signal_score > existing.score) {
        epMap.set(s.endpoint_label, { endpoint: s.endpoint_label, domain: s.domain, score: s.signal_score, p: s.p_value });
      }
    }
    return [...epMap.values()].sort((a, b) => b.score - a.score).slice(0, 10);
  }, [selection, selectedOrganSystem, signalData]);

  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // NOAEL narrative for context panel
  const { data: noaelData } = useNoaelSummary(studyId);
  const narrative = useMemo(() => {
    if (!noaelData || noaelData.length === 0) return null;
    const primary = noaelData.find((r) => r.sex === "Combined") ?? noaelData[0];
    return generateNoaelNarrative(primary, aeData, primary.sex as "Combined" | "M" | "F");
  }, [noaelData, aeData]);

  // Helper for navigation links
  const navLink = (label: string, path: string, state?: Record<string, string>) => (
    <a
      href="#"
      className="block text-primary hover:underline"
      onClick={(e) => {
        e.preventDefault();
        if (studyId) {
          if (selectedOrganSystem) navigateTo({ organSystem: selectedOrganSystem });
          navigate(`/studies/${encodeURIComponent(studyId)}${path}`, { state });
        }
      }}
    >
      {label} &#x2192;
    </a>
  );

  // -------------------------------------------------------------------------
  // No-selection mode: study-level NOAEL overview
  // -------------------------------------------------------------------------
  if (!selection && !organSelection) {
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
  // Organ-selected mode: organ-level context (no endpoint selected)
  // -------------------------------------------------------------------------
  if (!selection && organSelection) {
    return (
      <div>
        {/* Header */}
        <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{titleCase(organSelection)}</h3>
            <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
          </div>
          {organSignalSummary && (
            <p className="mt-1 text-xs text-muted-foreground">
              {organSignalSummary.totalCount} signals &middot; {organSignalSummary.domains.size} domain(s)
            </p>
          )}
          <div className="mt-1.5 text-xs">
            <TierCountBadges
              counts={computeTierCounts(organRules)}
              activeTier={tierFilter}
              onTierClick={setTierFilter}
            />
          </div>
        </div>

        {/* 1. Organ insights */}
        <CollapsiblePane title="Organ insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <InsightsList
            rules={organRules}
            tierFilter={tierFilter}
            onEndpointClick={(organ) => {
              if (studyId) {
                navigateTo({ organSystem: organ });
                navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: organ } });
              }
            }}
          />
        </CollapsiblePane>

        {/* 2. Contributing endpoints */}
        {organSignalSummary && organSignalSummary.endpoints.length > 0 && (
          <CollapsiblePane title="Contributing endpoints" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
            <table className="w-full text-[10px]">
              <thead>
                <tr className="border-b text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="py-0.5 pr-2">Endpoint</th>
                  <th className="py-0.5 pr-2">Dom</th>
                  <th className="py-0.5 pr-2 text-right">Signal</th>
                  <th className="py-0.5 text-right">p</th>
                </tr>
              </thead>
              <tbody>
                {organSignalSummary.endpoints.map((ep) => (
                  <tr
                    key={ep.endpoint}
                    className="cursor-pointer border-b border-dashed hover:bg-accent/30"
                    onClick={() => {
                      if (studyId) {
                        navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, {
                          state: { organ_system: organSelection },
                        });
                      }
                    }}
                  >
                    <td className="max-w-[140px] truncate py-0.5 pr-2" title={ep.endpoint}>{ep.endpoint}</td>
                    <td className="py-0.5 pr-2"><DomainLabel domain={ep.domain} /></td>
                    <td className="py-0.5 pr-2 text-right font-mono">{ep.maxScore.toFixed(2)}</td>
                    <td className="py-0.5 text-right font-mono">{ep.bestP != null ? formatPValue(ep.bestP) : "\u2014"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CollapsiblePane>
        )}

        {/* 3. Evidence breakdown */}
        {organSignalSummary && (
          <CollapsiblePane title="Evidence breakdown" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
            <div className="space-y-1.5 text-[11px]">
              {/* Domains */}
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Domains:</span>
                {[...organSignalSummary.domains].map((d) => (
                  <DomainLabel key={d} domain={d} />
                ))}
              </div>
              {/* Counts */}
              <div className="text-muted-foreground">
                Significant: {organSignalSummary.sigCount}/{organSignalSummary.totalCount}
              </div>
              <div className="text-muted-foreground">
                Treatment-related: {organSignalSummary.trCount}
              </div>
              {/* Sex comparison */}
              <div className="mt-1 border-t pt-1 text-muted-foreground">
                <div>Males: {organSignalSummary.malesSig}/{organSignalSummary.malesTotal} sig</div>
                <div>Females: {organSignalSummary.femalesSig}/{organSignalSummary.femalesTotal} sig</div>
              </div>
            </div>
          </CollapsiblePane>
        )}

        {/* 4. Related views */}
        <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-1 text-[11px]">
            {navLink(`View histopathology: ${titleCase(organSelection)}`, "/histopathology", { organ_system: organSelection })}
            {navLink("View dose-response", "/dose-response", { organ_system: organSelection })}
            {navLink("View study summary", "", organSelection ? { organ_system: organSelection } : undefined)}
          </div>
        </CollapsiblePane>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Endpoint-selected mode: adversity detail + statistics + correlations
  // -------------------------------------------------------------------------
  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{selection!.endpoint_label}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <p className="text-xs text-muted-foreground">
          {selection!.sex} &middot; Dose {selection!.dose_level}
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

      {/* 2. Statistics */}
      {selectedSignalRow && (
        <CollapsiblePane title="Statistics" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Signal score</span>
              <SignalScorePopover row={selectedSignalRow}>
                <span className="cursor-help font-mono">{selectedSignalRow.signal_score.toFixed(3)}</span>
              </SignalScorePopover>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Direction</span>
              <span className="tabular-nums">{selectedSignalRow.direction ?? "\u2014"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Best p-value</span>
              <span className="font-mono">{formatPValue(selectedSignalRow.p_value)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trend p-value</span>
              <span className="font-mono">{formatPValue(selectedSignalRow.trend_p)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Effect size</span>
              <span className="font-mono">{formatEffectSize(selectedSignalRow.effect_size)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dose-response</span>
              <span>{selectedSignalRow.dose_response_pattern.replace(/_/g, " ") || "\u2014"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Severity</span>
              <span>{selectedSignalRow.severity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Treatment-related</span>
              <span>{selectedSignalRow.treatment_related ? "Yes" : "No"}</span>
            </div>
          </div>
        </CollapsiblePane>
      )}

      {/* 3. Adversity rationale */}
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

      {/* 4. Source records */}
      {studyId && selectedSignalRow && (
        <SourceRecordsExpander
          studyId={studyId}
          domain={selectedSignalRow.domain}
          testCode={selectedSignalRow.test_code}
          sex={selection!.sex}
          doseLevel={selection!.dose_level}
          expandAll={expandGen}
          collapseAll={collapseGen}
        />
      )}

      {/* 5. Correlations */}
      <CollapsiblePane title={`Other findings in ${selectedOrganSystem ? titleCase(selectedOrganSystem) : "this organ"}`} defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {correlations.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No correlations in this organ system.</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-0.5 pr-2">Endpoint</th>
                <th className="py-0.5 pr-2">Dom</th>
                <th className="py-0.5 pr-2 text-right">Signal</th>
                <th className="py-0.5 text-right">p</th>
              </tr>
            </thead>
            <tbody>
              {correlations.map((c) => (
                <tr
                  key={c.endpoint}
                  className="cursor-pointer border-b border-dashed hover:bg-accent/30"
                  onClick={() => {
                    if (studyId && selectedOrganSystem) {
                      navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, {
                        state: { endpoint_label: c.endpoint, organ_system: selectedOrganSystem },
                      });
                    }
                  }}
                >
                  <td className="max-w-[140px] truncate py-0.5 pr-2" title={c.endpoint}>{c.endpoint}</td>
                  <td className="py-0.5 pr-2"><DomainLabel domain={c.domain} /></td>
                  <td className="py-0.5 pr-2 text-right font-mono">{c.score.toFixed(2)}</td>
                  <td className="py-0.5 text-right font-mono">{c.p != null ? formatPValue(c.p) : "\u2014"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsiblePane>

      {/* 6. Tox Assessment */}
      {studyId && (() => {
        const bestRow = selectedRows.find((r) => r.severity === "adverse") ?? selectedRows[0];
        return (
          <ToxFindingForm
            studyId={studyId}
            endpointLabel={selection!.endpoint_label}
            systemSuggestion={bestRow ? deriveToxSuggestion(bestRow.treatment_related, bestRow.severity) : undefined}
          />
        );
      })()}

      {/* 7. Related views */}
      <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-1 text-[11px]">
          {navLink("View dose-response", "/dose-response", {
            endpoint_label: selection!.endpoint_label,
            ...(selectedOrganSystem && { organ_system: selectedOrganSystem }),
          })}
          {navLink("View study summary", "", selectedOrganSystem ? { organ_system: selectedOrganSystem } : undefined)}
          {navLink(`View histopathology${selectedOrganSystem ? `: ${titleCase(selectedOrganSystem)}` : ""}`, "/histopathology",
            selectedOrganSystem ? { organ_system: selectedOrganSystem } : undefined)}
        </div>
      </CollapsiblePane>

      {/* 8. Audit trail */}
      {studyId && (
        <AuditTrailPanel
          studyId={studyId}
          entityFilter={selection!.endpoint_label}
          expandAll={expandGen}
          collapseAll={collapseGen}
        />
      )}

      {/* 9. Statistical methodology */}
      <MethodologyPanel expandAll={expandGen} collapseAll={collapseGen} />
    </div>
  );
}
