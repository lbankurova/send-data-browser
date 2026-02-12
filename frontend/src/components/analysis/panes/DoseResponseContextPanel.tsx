import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { InsightsList } from "./InsightsList";
import { TierCountBadges } from "./TierCountBadges";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { useDoseResponseMetrics } from "@/hooks/useDoseResponseMetrics";
import {
  titleCase,
  formatPValue,
} from "@/lib/severity-colors";
import { DomainLabel } from "@/components/ui/DomainLabel";
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

  // Dose-response metrics for dose-level breakdown table
  const { data: metricsData } = useDoseResponseMetrics(studyId);

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
  // (Currently unused - kept for potential future use)
  // const selectedSignalRow = useMemo(() => {
  //   if (!selection) return null;
  //   const candidates = signalData.filter(
  //     (r) =>
  //       r.endpoint_label === selection.endpoint_label &&
  //       (!selection.sex || r.sex === selection.sex)
  //   );
  //   if (candidates.length === 0) return null;
  //   return candidates.reduce((best, r) =>
  //     r.signal_score > best.signal_score ? r : best
  //   );
  // }, [signalData, selection]);

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

  // Dose-level breakdown for selected endpoint
  const doseLevelBreakdown = useMemo(() => {
    if (!selection || !metricsData) return null;
    const rows = metricsData.filter((r) => r.endpoint_label === selection.endpoint_label);
    if (rows.length === 0) return null;
    // Group by dose level, aggregate across sexes if needed
    const byDose = new Map<number, typeof rows[0][]>();
    for (const r of rows) {
      const existing = byDose.get(r.dose_level);
      if (existing) existing.push(r);
      else byDose.set(r.dose_level, [r]);
    }
    const aggregated = Array.from(byDose.entries()).map(([dose_level, levelRows]) => {
      // Combine data across sexes for this dose level
      const totalN = levelRows.reduce((sum, r) => sum + (r.n ?? 0), 0);
      const avgMean = levelRows.every((r) => r.mean != null)
        ? levelRows.reduce((sum, r) => sum + (r.mean ?? 0), 0) / levelRows.length
        : null;
      const avgSd = levelRows.every((r) => r.sd != null)
        ? levelRows.reduce((sum, r) => sum + (r.sd ?? 0), 0) / levelRows.length
        : null;
      const totalAffected = levelRows.reduce((sum, r) => sum + (r.affected ?? 0), 0);
      const avgIncidence = levelRows.every((r) => r.incidence != null)
        ? levelRows.reduce((sum, r) => sum + (r.incidence ?? 0), 0) / levelRows.length
        : null;
      const minP = levelRows.reduce((min, r) => {
        if (r.p_value == null) return min;
        return min === null || r.p_value < min ? r.p_value : min;
      }, null as number | null);
      return {
        dose_level,
        label: levelRows[0].dose_label,
        n: totalN,
        mean: avgMean,
        sd: avgSd,
        affected: totalAffected,
        incidence: avgIncidence,
        p_value: minP,
        data_type: levelRows[0].data_type,
      };
    }).sort((a, b) => a.dose_level - b.dose_level);
    return {
      rows: aggregated,
      data_type: rows[0].data_type,
      test_method: rows[0].data_type === "continuous" ? "Dunnett" : "Fisher",
    };
  }, [metricsData, selection]);

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

      {/* 2. Statistics — dose-level breakdown with N per group */}
      <CollapsiblePane title="Statistics" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {doseLevelBreakdown ? (
          <div className="space-y-2">
            {/* Test method */}
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">Test method:</span>
              <span className="font-medium">{doseLevelBreakdown.test_method}</span>
            </div>

            {/* Dose-level breakdown table */}
            <div className="max-h-60 overflow-auto">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 z-10 bg-background">
                  <tr className="border-b text-muted-foreground">
                    <th className="py-1 text-left font-medium">Dose</th>
                    <th className="py-1 text-right font-semibold">N</th>
                    {doseLevelBreakdown.data_type === "continuous" ? (
                      <>
                        <th className="py-1 text-right font-medium">Mean</th>
                        <th className="py-1 text-right font-medium">SD</th>
                      </>
                    ) : (
                      <>
                        <th className="py-1 text-right font-medium">Aff</th>
                        <th className="py-1 text-right font-medium">Inc%</th>
                      </>
                    )}
                    <th className="py-1 text-right font-medium">p-value</th>
                  </tr>
                </thead>
                <tbody>
                  {doseLevelBreakdown.rows.map((row) => (
                    <tr key={row.dose_level} className="border-b border-border/50">
                      <td className="py-1 font-mono text-[10px]">{row.label}</td>
                      <td className="py-1 text-right font-mono font-semibold">{row.n}</td>
                      {doseLevelBreakdown.data_type === "continuous" ? (
                        <>
                          <td className="py-1 text-right font-mono">
                            {row.mean != null ? row.mean.toFixed(2) : "\u2014"}
                          </td>
                          <td className="py-1 text-right font-mono text-muted-foreground">
                            {row.sd != null ? row.sd.toFixed(2) : "\u2014"}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-1 text-right font-mono">{row.affected ?? "\u2014"}</td>
                          <td className="py-1 text-right font-mono">
                            {row.incidence != null ? `${(row.incidence * 100).toFixed(0)}%` : "\u2014"}
                          </td>
                        </>
                      )}
                      <td className="py-1 text-right font-mono">
                        {formatPValue(row.p_value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No dose-level data for selected endpoint.
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
                        {f.endpoint_label.length > 22
                          ? f.endpoint_label.slice(0, 22) + "\u2026"
                          : f.endpoint_label}
                      </td>
                      <td className="py-0.5">
                        <DomainLabel domain={f.domain} />
                      </td>
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
