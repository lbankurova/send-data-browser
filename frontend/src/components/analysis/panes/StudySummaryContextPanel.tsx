import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { InsightsList } from "./InsightsList";
import { TierCountBadges } from "./TierCountBadges";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { computeTierCounts } from "@/lib/rule-synthesis";
import type { Tier } from "@/lib/rule-synthesis";
import type {
  SignalSummaryRow,
  SignalSelection,
  RuleResult,
} from "@/types/analysis-views";
import {
  formatPValue,
  formatEffectSize,
  titleCase,
} from "@/lib/severity-colors";
import { DomainLabel } from "@/components/ui/DomainLabel";

interface Props {
  signalData: SignalSummaryRow[];
  ruleResults: RuleResult[];
  selection: SignalSelection | null;
  organSelection?: string | null;
  studyId?: string;
}

export function StudySummaryContextPanel({
  signalData,
  ruleResults,
  selection,
  organSelection,
  studyId: studyIdProp,
}: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;
  const navigate = useNavigate();

  // If organ is selected (from banner click), show organ mode
  if (!selection && organSelection) {
    return (
      <OrganPanel
        organSystem={organSelection}
        signalData={signalData}
        ruleResults={ruleResults}
        studyId={studyId}
        navigate={navigate}
      />
    );
  }

  // If no selection and no organ, show empty state
  if (!selection) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        <p className="mb-2">
          Select a signal from the heatmap or grid to view details.
        </p>
        <p className="text-muted-foreground/60">
          Tip: Click an organ in the rail for organ-level insights, or select a heatmap cell for endpoint statistics.
        </p>
      </div>
    );
  }

  return (
    <EndpointPanel
      selection={selection}
      signalData={signalData}
      ruleResults={ruleResults}
      studyId={studyId}
      navigate={navigate}
    />
  );
}

// ---------------------------------------------------------------------------
// Endpoint selection panel (existing behavior)
// ---------------------------------------------------------------------------

function EndpointPanel({
  selection,
  signalData,
  ruleResults,
  studyId,
  navigate,
}: {
  selection: SignalSelection;
  signalData: SignalSummaryRow[];
  ruleResults: RuleResult[];
  studyId: string | undefined;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const filteredRules = useMemo(() => {
    const contextKey = `${selection.domain}_${selection.test_code}_${selection.sex}`;
    const organKey = `organ_${selection.organ_system}`;
    return ruleResults.filter(
      (r) =>
        r.context_key === contextKey ||
        r.context_key === organKey ||
        r.scope === "study"
    );
  }, [ruleResults, selection]);

  const selectedRow = useMemo(() => {
    return signalData.find(
      (r) =>
        r.endpoint_label === selection.endpoint_label &&
        r.dose_level === selection.dose_level &&
        r.sex === selection.sex
    );
  }, [signalData, selection]);

  const correlatedFindings = useMemo(() => {
    return signalData
      .filter(
        (r) =>
          r.organ_system === selection.organ_system &&
          r.endpoint_label !== selection.endpoint_label
      )
      .sort((a, b) => b.signal_score - a.signal_score)
      .slice(0, 10);
  }, [signalData, selection]);

  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();
  const [tierFilter, setTierFilter] = useState<Tier | null>(null);

  return (
    <div>
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{selection.endpoint_label}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {selection.domain} &middot; {selection.sex} &middot; Dose{" "}
          {selection.dose_level}
        </p>
        <div className="mt-1.5 text-xs">
          <TierCountBadges
            counts={computeTierCounts(filteredRules)}
            activeTier={tierFilter}
            onTierClick={setTierFilter}
          />
        </div>
      </div>

      <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <InsightsList rules={filteredRules} tierFilter={tierFilter} onEndpointClick={(organ) => {
          if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: organ } });
        }} />
      </CollapsiblePane>

      <CollapsiblePane title="Statistics" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {selectedRow ? (
          <div className="space-y-1.5 text-[11px] tabular-nums">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Signal score</span>
              <span className="font-mono">{selectedRow.signal_score.toFixed(3)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Direction</span>
              <span>{selectedRow.direction ?? "\u2014"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Best p-value</span>
              <span className="font-mono">
                {formatPValue(selectedRow.p_value)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Trend p-value</span>
              <span className="font-mono">
                {formatPValue(selectedRow.trend_p)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Effect size</span>
              <span className="font-mono">
                {formatEffectSize(selectedRow.effect_size)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Dose-response</span>
              <span>{selectedRow.dose_response_pattern.replace(/_/g, " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Severity</span>
              <span>{selectedRow.severity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Treatment-related</span>
              <span>{selectedRow.treatment_related ? "Yes" : "No"}</span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No data for selected row.
          </p>
        )}
      </CollapsiblePane>

      <CollapsiblePane title="Correlations" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {correlatedFindings.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No correlations in this organ system.
          </p>
        ) : (
          <div>
            <p className="mb-1.5 text-[10px] text-muted-foreground">
              Other findings in{" "}
              <span className="font-medium">
                {titleCase(selection.organ_system)}
              </span>
            </p>
            <table className="w-full text-[10px] tabular-nums">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b text-muted-foreground">
                  <th className="pb-0.5 text-left font-medium">Endpoint</th>
                  <th className="pb-0.5 text-left font-medium">Dom</th>
                  <th className="pb-0.5 text-right font-medium">Signal</th>
                  <th className="pb-0.5 text-right font-medium">p</th>
                </tr>
              </thead>
              <tbody>
                {correlatedFindings.map((f, i) => (
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
                      {f.endpoint_label.length > 25
                        ? f.endpoint_label.slice(0, 25) + "\u2026"
                        : f.endpoint_label}
                    </td>
                    <td className="py-0.5"><DomainLabel domain={f.domain} /></td>
                    <td className="py-0.5 text-right font-mono">
                      {f.signal_score.toFixed(2)}
                    </td>
                    <td className="py-0.5 text-right font-mono">
                      {formatPValue(f.p_value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CollapsiblePane>

      {studyId && (
        <ToxFindingForm studyId={studyId} endpointLabel={selection.endpoint_label} />
      )}

      {/* Related views */}
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
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, {
                state: {
                  endpoint_label: selection.endpoint_label,
                  ...(selection.organ_system && { organ_system: selection.organ_system }),
                },
              });
            }}
          >
            View dose-response &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, {
                state: selection.organ_system ? { organ_system: selection.organ_system } : undefined,
              });
            }}
          >
            View histopathology &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`, {
                state: selection.organ_system ? { organ_system: selection.organ_system } : undefined,
              });
            }}
          >
            View NOAEL decision &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Organ selection panel (NEW — from banner click)
// ---------------------------------------------------------------------------

function OrganPanel({
  organSystem,
  signalData,
  ruleResults,
  studyId,
  navigate,
}: {
  organSystem: string;
  signalData: SignalSummaryRow[];
  ruleResults: RuleResult[];
  studyId: string | undefined;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const displayName = titleCase(organSystem);

  // Filter rules to this organ + study scope
  const organRules = useMemo(() => {
    const organKey = `organ_${organSystem}`;
    return ruleResults.filter(
      (r) =>
        r.context_key === organKey ||
        r.organ_system === organSystem ||
        r.scope === "study"
    );
  }, [ruleResults, organSystem]);

  // Contributing endpoints: unique endpoints in this organ, sorted by signal score
  const endpoints = useMemo(() => {
    const organSignals = signalData.filter(
      (s) => s.organ_system === organSystem
    );
    // Group by endpoint, take the max signal score row per endpoint
    const map = new Map<string, SignalSummaryRow>();
    for (const s of organSignals) {
      const existing = map.get(s.endpoint_label);
      if (!existing || s.signal_score > existing.signal_score) {
        map.set(s.endpoint_label, s);
      }
    }
    return [...map.values()].sort(
      (a, b) => b.signal_score - a.signal_score
    );
  }, [signalData, organSystem]);

  // Evidence breakdown: domain distribution, sex comparison
  const evidence = useMemo(() => {
    const organSignals = signalData.filter(
      (s) => s.organ_system === organSystem
    );
    const domains = [...new Set(organSignals.map((s) => s.domain))].sort();
    const nSignificant = organSignals.filter(
      (s) => s.p_value !== null && s.p_value < 0.05
    ).length;
    const nTR = organSignals.filter((s) => s.treatment_related).length;
    const nAdverse = organSignals.filter(
      (s) => s.severity === "adverse"
    ).length;
    const maleSignals = organSignals.filter((s) => s.sex === "M");
    const femaleSignals = organSignals.filter((s) => s.sex === "F");
    const mSig = maleSignals.filter(
      (s) => s.p_value !== null && s.p_value < 0.05
    ).length;
    const fSig = femaleSignals.filter(
      (s) => s.p_value !== null && s.p_value < 0.05
    ).length;

    return {
      totalSignals: organSignals.length,
      domains,
      nSignificant,
      nTR,
      nAdverse,
      maleTotal: maleSignals.length,
      maleSig: mSig,
      femaleTotal: femaleSignals.length,
      femaleSig: fSig,
    };
  }, [signalData, organSystem]);

  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();
  const [tierFilter, setTierFilter] = useState<Tier | null>(null);

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{displayName}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {evidence.totalSignals} signals &middot;{" "}
          {evidence.domains.length} domain{evidence.domains.length !== 1 ? "s" : ""}
        </p>
        <div className="mt-1.5 text-xs">
          <TierCountBadges
            counts={computeTierCounts(organRules)}
            activeTier={tierFilter}
            onTierClick={setTierFilter}
          />
        </div>
      </div>

      {/* Pane 1: Organ insights */}
      <CollapsiblePane title="Organ insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <InsightsList rules={organRules} tierFilter={tierFilter} onEndpointClick={(organ) => {
          if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: organ } });
        }} />
      </CollapsiblePane>

      {/* Pane 2: Contributing endpoints */}
      <CollapsiblePane
        title={`Contributing endpoints (${endpoints.length})`}
        defaultOpen
        expandAll={expandGen}
        collapseAll={collapseGen}
      >
        {endpoints.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No endpoints for this organ.
          </p>
        ) : (
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
              {endpoints.slice(0, 15).map((ep, i) => (
                <tr
                  key={i}
                  className="cursor-pointer border-b border-dashed hover:bg-accent/30"
                  onClick={() => {
                    if (studyId) {
                      navigate(
                        `/studies/${encodeURIComponent(studyId)}/target-organs`,
                        { state: { organ_system: ep.organ_system } }
                      );
                    }
                  }}
                >
                  <td className="truncate py-0.5" title={ep.endpoint_label}>
                    {ep.endpoint_label.length > 22
                      ? ep.endpoint_label.slice(0, 22) + "\u2026"
                      : ep.endpoint_label}
                  </td>
                  <td className="py-0.5"><DomainLabel domain={ep.domain} /></td>
                  <td className="py-0.5 text-right font-mono">
                    {ep.signal_score.toFixed(2)}
                  </td>
                  <td className="py-0.5 text-right font-mono">
                    {formatPValue(ep.p_value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CollapsiblePane>

      {/* Pane 3: Evidence breakdown */}
      <CollapsiblePane title="Evidence breakdown" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-2 text-[11px]">
          {/* Domains */}
          <div>
            <span className="text-muted-foreground">Domains: </span>
            <span className="inline-flex flex-wrap gap-1">
              {evidence.domains.map((d) => (
                <DomainLabel key={d} domain={d} />
              ))}
            </span>
          </div>
          {/* Counts */}
          <div className="flex justify-between">
            <span className="text-muted-foreground">Significant</span>
            <span>{evidence.nSignificant} / {evidence.totalSignals}</span>
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
            <div className="mb-0.5 text-[10px] text-muted-foreground">
              Sex comparison
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Males</span>
              <span>
                {evidence.maleSig} sig / {evidence.maleTotal} total
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Females</span>
              <span>
                {evidence.femaleSig} sig / {evidence.femaleTotal} total
              </span>
            </div>
          </div>
        </div>
      </CollapsiblePane>

      {/* Pane 4: Related views */}
      <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-1 text-[11px]">
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/target-organs`, { state: { organ_system: organSystem } });
            }}
          >
            View target organ: {displayName} &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: organSystem } });
            }}
          >
            View dose-response &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { organ_system: organSystem } });
            }}
          >
            View histopathology &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`, { state: { organ_system: organSystem } });
            }}
          >
            View NOAEL decision &#x2192;
          </a>
        </div>
      </CollapsiblePane>

    </div>
  );
}
