import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { InsightsList } from "./InsightsList";
import { TierCountBadges } from "./TierCountBadges";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import {
  titleCase,
  formatPValue,
  getDomainBadgeColor,
} from "@/lib/severity-colors";
import { computeTierCounts } from "@/lib/rule-synthesis";
import type { Tier } from "@/lib/rule-synthesis";
import type { RuleResult, SignalSummaryRow } from "@/types/analysis-views";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DoseResponseSelection {
  endpoint_label: string;
  sex?: string;
  domain?: string;
  organ_system?: string;
}

interface Props {
  ruleResults: RuleResult[];
  signalData: SignalSummaryRow[];
  selection: DoseResponseSelection | null;
  studyId?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DoseResponseContextPanel({
  ruleResults,
  signalData,
  selection,
  studyId: studyIdProp,
}: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;
  const navigate = useNavigate();
  const [tierFilter, setTierFilter] = useState<Tier | null>(null);

  // Rules for selected endpoint — filter by organ system + domain prefix
  const endpointRules = useMemo(() => {
    if (!selection) return [];
    const domainPrefix = selection.domain ? selection.domain + "_" : null;
    return ruleResults.filter((r) => {
      if (selection.organ_system && r.organ_system === selection.organ_system) return true;
      if (domainPrefix && r.scope === "endpoint" && r.context_key.startsWith(domainPrefix)) return true;
      return false;
    });
  }, [ruleResults, selection]);

  // Best signal row for selected endpoint (highest signal_score across doses)
  const selectedSignalRow = useMemo(() => {
    if (!selection) return null;
    const candidates = signalData.filter(
      (r) =>
        r.endpoint_label === selection.endpoint_label &&
        (!selection.sex || r.sex === selection.sex)
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((best, r) =>
      r.signal_score > best.signal_score ? r : best
    );
  }, [signalData, selection]);

  // Correlations: other endpoints in same organ, sorted by signal score
  const correlatedFindings = useMemo(() => {
    if (!selection?.organ_system) return [];
    // Group by endpoint, take max signal_score row per endpoint
    const map = new Map<string, SignalSummaryRow>();
    for (const s of signalData) {
      if (s.organ_system !== selection.organ_system) continue;
      if (s.endpoint_label === selection.endpoint_label) continue;
      const existing = map.get(s.endpoint_label);
      if (!existing || s.signal_score > existing.signal_score) {
        map.set(s.endpoint_label, s);
      }
    }
    return [...map.values()]
      .sort((a, b) => b.signal_score - a.signal_score)
      .slice(0, 10);
  }, [signalData, selection]);

  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  if (!selection) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an endpoint from the list or chart to view insights and assessment.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{selection.endpoint_label}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {selection.domain} &middot; {titleCase(selection.organ_system)}
          {selection.sex && <> &middot; {selection.sex}</>}
        </p>
        <div className="mt-1.5 text-xs">
          <TierCountBadges
            counts={computeTierCounts(endpointRules)}
            activeTier={tierFilter}
            onTierClick={setTierFilter}
          />
        </div>
      </div>

      {/* 1. Insights */}
      <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <InsightsList rules={endpointRules} tierFilter={tierFilter} />
      </CollapsiblePane>

      {/* 2. Statistics — only items NOT already in the evidence panel header */}
      <CollapsiblePane title="Statistics" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {selectedSignalRow ? (
          <div className="space-y-1.5 text-[11px] tabular-nums">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Signal score</span>
              <span className="font-mono">{selectedSignalRow.signal_score.toFixed(3)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Direction</span>
              <span>{selectedSignalRow.direction ?? "\u2014"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Severity</span>
              <span>{selectedSignalRow.severity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Treatment-related</span>
              <span>{selectedSignalRow.treatment_related ? "yes" : "no"}</span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No signal data for selected endpoint.
          </p>
        )}
      </CollapsiblePane>

      {/* 3. Correlations */}
      <CollapsiblePane title="Correlations" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {correlatedFindings.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No other endpoints in this organ system.
          </p>
        ) : (
          <div>
            <p className="mb-1.5 text-[10px] text-muted-foreground">
              Other findings in{" "}
              <span className="font-medium">{titleCase(selection.organ_system)}</span>
            </p>
            <table className="w-full text-[10px] tabular-nums">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-0.5 text-left font-medium">Endpoint</th>
                  <th className="pb-0.5 text-left font-medium">Dom</th>
                  <th className="pb-0.5 text-right font-medium">Signal</th>
                  <th className="pb-0.5 text-right font-medium">p</th>
                </tr>
              </thead>
              <tbody>
                {correlatedFindings.map((f, i) => {
                  const dc = getDomainBadgeColor(f.domain);
                  return (
                    <tr
                      key={i}
                      className="cursor-pointer border-b border-dashed hover:bg-accent/30"
                      onClick={() => {
                        if (studyId) {
                          navigate(
                            `/studies/${encodeURIComponent(studyId)}/dose-response`,
                            { state: { endpoint_label: f.endpoint_label, organ_system: f.organ_system } }
                          );
                        }
                      }}
                    >
                      <td className="truncate py-0.5" title={f.endpoint_label}>
                        {f.endpoint_label.length > 22
                          ? f.endpoint_label.slice(0, 22) + "\u2026"
                          : f.endpoint_label}
                      </td>
                      <td className={`py-0.5 text-[9px] font-semibold ${dc.text}`}>
                        {f.domain}
                      </td>
                      <td className="py-0.5 text-right font-mono">
                        {f.signal_score.toFixed(2)}
                      </td>
                      <td className="py-0.5 text-right font-mono">
                        {formatPValue(f.p_value)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CollapsiblePane>

      {/* 4. Tox Assessment */}
      {studyId && (
        <ToxFindingForm studyId={studyId} endpointLabel={selection.endpoint_label} />
      )}

      {/* 5. Related views */}
      <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-1 text-[11px]">
          {selection.organ_system && (
            <a
              href="#"
              className="block text-primary hover:underline"
              onClick={(e) => {
                e.preventDefault();
                if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/target-organs`, { state: { organ_system: selection.organ_system } });
              }}
            >
              View target organ: {titleCase(selection.organ_system)} &#x2192;
            </a>
          )}
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { organ_system: selection.organ_system } });
            }}
          >
            View histopathology &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`, { state: { organ_system: selection.organ_system } });
            }}
          >
            View NOAEL decision &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}
