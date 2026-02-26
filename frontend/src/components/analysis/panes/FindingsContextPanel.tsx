import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { FindingsAnalyticsProvider } from "@/contexts/FindingsAnalyticsContext";
import { useFindingsAnalyticsLocal } from "@/hooks/useFindingsAnalyticsLocal";
import { useFindingContext } from "@/hooks/useFindingContext";
import { useEffectiveNoael } from "@/hooks/useEffectiveNoael";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import type { ToxFinding } from "@/types/annotations";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { VerdictPane } from "./VerdictPane";
import { EvidencePane } from "./EvidencePane";
import { DoseDetailPane } from "./DoseDetailPane";
import { CorrelationsPane } from "./CorrelationsPane";
import { ContextPane } from "./ContextPane";
import { OrganContextPanel } from "./OrganContextPanel";
import { SyndromeContextPanel } from "./SyndromeContextPanel";
import { RecoveryPane } from "./RecoveryPane";
import { NormalizationHeatmap } from "./NormalizationHeatmap";
import { Skeleton } from "@/components/ui/skeleton";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { getOrganCorrelationCategory, OrganCorrelationCategory } from "@/lib/organ-weight-normalization";
import { useStatMethods } from "@/hooks/useStatMethods";
import type { EndpointConfidenceResult, ConfidenceLevel } from "@/lib/endpoint-confidence";
import type { UnifiedFinding } from "@/types/analysis";
import { formatPValue } from "@/lib/severity-colors";

// ─── Williams' Trend Test Comparison ────────────────────────

function WilliamsComparisonPane({ finding }: { finding: UnifiedFinding }) {
  const [showStepDown, setShowStepDown] = useState(false);
  const williams = finding.williams;
  if (!williams) return null;

  const jtSignificant = finding.trend_p != null && finding.trend_p < 0.05;
  const williamsSignificant = williams.step_down_results.some((r) => r.significant);
  const concordant = jtSignificant === williamsSignificant;

  return (
    <div className="mt-2 rounded-md border border-border/50 p-2 text-[10px]">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        Trend test comparison
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="font-medium">Jonckheere-Terpstra</span>
          <span className="font-mono text-[10px]">
            p = {finding.trend_p != null ? formatPValue(finding.trend_p) : "\u2014"}
            {jtSignificant && <span className="ml-1 text-red-600">*</span>}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="font-medium">Williams&apos; test</span>
          <span className="font-mono text-[10px]">
            {williams.minimum_effective_dose
              ? `MED: ${williams.minimum_effective_dose}`
              : "No MED detected"}
            {williamsSignificant && <span className="ml-1 text-red-600">*</span>}
          </span>
        </div>
        <div className="flex items-center gap-1.5 border-t border-border/30 pt-0.5">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${concordant ? "bg-emerald-500" : "bg-amber-500"}`} />
          <span className="font-medium">{concordant ? "Concordant" : "Discordant"}</span>
          {!concordant && (
            <span className="text-muted-foreground">
              &mdash; {jtSignificant ? "JT significant but Williams' not" : "Williams' significant but JT not"}
            </span>
          )}
        </div>
      </div>
      {williams.step_down_results.length > 0 && (
        <div className="mt-1.5">
          <button
            className="text-[9px] text-blue-600 hover:underline"
            onClick={() => setShowStepDown(!showStepDown)}
          >
            {showStepDown ? "Hide" : "Show"} step-down detail
          </button>
          {showStepDown && (
            <table className="mt-1 w-full">
              <thead>
                <tr className="text-[9px] text-muted-foreground">
                  <th className="py-0.5 text-left font-medium">Dose</th>
                  <th className="py-0.5 text-right font-medium">t&#x0303;</th>
                  <th className="py-0.5 text-right font-medium">CV</th>
                  <th className="py-0.5 text-right font-medium">p</th>
                  <th className="py-0.5 text-right font-medium">Sig</th>
                </tr>
              </thead>
              <tbody>
                {williams.step_down_results.map((r) => (
                  <tr key={r.dose_label} className={r.significant ? "text-red-600" : ""}>
                    <td className="py-0.5">{r.dose_label}</td>
                    <td className="py-0.5 text-right font-mono">{r.test_statistic.toFixed(3)}</td>
                    <td className="py-0.5 text-right font-mono">{r.critical_value.toFixed(3)}</td>
                    <td className="py-0.5 text-right font-mono">{formatPValue(r.p_value)}</td>
                    <td className="py-0.5 text-right">{r.significant ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ANCOVA Effect Decomposition ──────────────────────────

function ANCOVADecompositionPane({ finding }: { finding: UnifiedFinding }) {
  const ancova = finding.ancova;
  if (!ancova) return null;

  const slopeHomogeneous = ancova.slope_homogeneity.homogeneous;

  return (
    <div className="mt-2 rounded-md border border-border/50 p-2 text-[10px]">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
          ANCOVA decomposition
        </span>
        <span className="text-[9px] text-muted-foreground">
          R&sup2; = {ancova.model_r_squared.toFixed(2)}
        </span>
        {!slopeHomogeneous && (
          <span className="text-[9px] font-medium text-amber-600">
            Non-parallel slopes
          </span>
        )}
      </div>

      {/* Slope info */}
      <div className="mb-1.5 flex items-center gap-3 text-muted-foreground">
        <span>BW slope: <span className="font-mono">{ancova.slope.estimate.toFixed(4)}</span></span>
        <span>p = <span className="font-mono">{formatPValue(ancova.slope.p_value)}</span></span>
      </div>

      {/* Effect decomposition per dose group */}
      <table className="w-full">
        <thead>
          <tr className="text-[9px] text-muted-foreground">
            <th className="py-0.5 text-left font-medium">Group</th>
            <th className="py-0.5 text-right font-medium">Total</th>
            <th className="py-0.5 text-right font-medium">Direct</th>
            <th className="py-0.5 text-right font-medium">Indirect</th>
            <th className="py-0.5 text-right font-medium">% direct</th>
            <th className="py-0.5 text-right font-medium">p</th>
          </tr>
        </thead>
        <tbody>
          {ancova.effect_decomposition.map((d) => (
            <tr key={d.group} className={d.direct_p < 0.05 ? "text-red-600" : ""}>
              <td className="py-0.5">{d.group}</td>
              <td className="py-0.5 text-right font-mono">{d.total_effect.toFixed(3)}</td>
              <td className="py-0.5 text-right font-mono">{d.direct_effect.toFixed(3)}</td>
              <td className="py-0.5 text-right font-mono">{d.indirect_effect.toFixed(3)}</td>
              <td className="py-0.5 text-right font-mono">{(d.proportion_direct * 100).toFixed(0)}%</td>
              <td className="py-0.5 text-right font-mono">{formatPValue(d.direct_p)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Adjusted means */}
      <div className="mt-1.5">
        <div className="mb-0.5 text-[9px] text-muted-foreground">Adjusted means (at mean BW = {ancova.covariate_mean.toFixed(1)})</div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {ancova.adjusted_means.map((m) => (
            <span key={m.group} className="font-mono">
              <span className="text-muted-foreground">{m.group}:</span>{" "}
              {m.adjusted_mean.toFixed(2)}
              <span className="text-muted-foreground"> (raw {m.raw_mean.toFixed(2)})</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Decomposed Confidence Display ─────────────────────────

function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const cls = level === "high"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : level === "moderate"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${cls}`}>
      {level}
    </span>
  );
}

function DecomposedConfidencePane({ eci }: { eci: EndpointConfidenceResult }) {
  const { integrated } = eci;

  const dims: { label: string; level: ConfidenceLevel; reason?: string }[] = [
    { label: "Statistical evidence", level: integrated.statistical },
    {
      label: "Biological plausibility",
      level: integrated.biological,
      reason: eci.normCaveat?.reason,
    },
    {
      label: "Dose-response quality",
      level: integrated.doseResponse,
      reason: eci.nonMonotonic.triggered ? eci.nonMonotonic.rationale ?? undefined : undefined,
    },
    {
      label: "Trend test validity",
      level: integrated.trendValidity,
      reason: eci.trendCaveat.triggered ? eci.trendCaveat.rationale ?? undefined : undefined,
    },
    {
      label: "Trend concordance",
      level: integrated.trendConcordance,
      reason: eci.trendConcordance.triggered ? eci.trendConcordance.rationale ?? undefined : undefined,
    },
  ];

  return (
    <div className="mt-2 rounded-md border border-border/50 p-2 text-[10px]">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        Confidence decomposition
      </div>
      <div className="space-y-1">
        {dims.map((d) => (
          <div key={d.label} className="flex items-start gap-2">
            <ConfidenceBadge level={d.level} />
            <div className="min-w-0 flex-1">
              <span className="font-medium">{d.label}</span>
              {d.reason && d.level !== "high" && (
                <span className="ml-1 text-muted-foreground">&mdash; {d.reason}</span>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 border-t pt-1.5">
        <span className="text-[9px] font-semibold text-muted-foreground">Integrated: </span>
        <ConfidenceBadge level={integrated.integrated} />
        {integrated.limitingFactor !== "None" && (
          <span className="ml-1 text-muted-foreground">
            (limited by {integrated.limitingFactor})
          </span>
        )}
      </div>
      {/* NOAEL contribution weight */}
      {eci.noaelContribution.weight > 0 && (
        <div className="mt-1 text-[9px] text-muted-foreground">
          NOAEL weight: {eci.noaelContribution.weight} ({eci.noaelContribution.label})
          {eci.noaelContribution.requiresCorroboration && " — requires corroboration"}
        </div>
      )}
    </div>
  );
}

export function FindingsContextPanel() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const { selectedFindingId, selectedFinding, endpointSexes, selectedGroupType, selectedGroupKey, selectGroup } = useFindingSelection();
  const { analytics } = useFindingsAnalyticsLocal(studyId);
  const { data: context, isLoading } = useFindingContext(
    studyId,
    selectedFindingId
  );
  const { data: noaelRows } = useEffectiveNoael(studyId);
  const { data: toxAnnotations } = useAnnotations<ToxFinding>(studyId, "tox-finding");
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();
  const { useScheduledOnly: isScheduledOnly, hasEarlyDeaths } = useScheduledOnly();
  const { data: studyMeta } = useStudyMetadata(studyId ?? "");
  const hasRecovery = studyMeta?.dose_groups?.some((dg) => dg.recovery_armcd) ?? false;
  const { effectSize } = useStatMethods(studyId);
  const normalization = useOrganWeightNormalization(studyId, true, effectSize);

  // When scheduled-only mode is active, swap statistics rows to scheduled variants
  const activeStatistics = useMemo(() => {
    if (!context?.statistics) return context?.statistics;
    if (isScheduledOnly && hasEarlyDeaths && context.statistics.scheduled_rows) {
      return { ...context.statistics, rows: context.statistics.scheduled_rows };
    }
    return context.statistics;
  }, [context?.statistics, isScheduledOnly, hasEarlyDeaths]);

  // Derive finding-level NOAEL from statistics rows (highest dose where p > 0.05
  // for all doses at and below it). Falls back to study-level NOAEL if stats unavailable.
  const noael = (() => {
    // Try finding-level first from active statistics (respects scheduled-only toggle)
    if (activeStatistics?.rows && activeStatistics.rows.length >= 2) {
      const rows = activeStatistics.rows; // sorted by dose_level ascending
      // Find the LOAEL: lowest dose with p_value_adj < 0.05
      let loaelIndex = -1;
      for (let i = 1; i < rows.length; i++) { // skip control (index 0)
        const p = rows[i].p_value_adj ?? rows[i].p_value;
        if (p != null && p < 0.05) {
          loaelIndex = i;
          break;
        }
      }
      if (loaelIndex > 1) {
        // NOAEL = dose just below LOAEL
        const noaelRow = rows[loaelIndex - 1];
        return {
          dose_value: noaelRow.dose_value,
          dose_unit: noaelRow.dose_unit ?? activeStatistics.unit ?? "mg/kg",
        };
      }
      if (loaelIndex === 1) {
        // All treatment doses significant — NOAEL below lowest tested dose
        return { dose_value: null, dose_unit: "mg/kg" };
      }
      // No significant doses — NOAEL is highest dose
      const highest = rows[rows.length - 1];
      return {
        dose_value: highest.dose_value,
        dose_unit: highest.dose_unit ?? activeStatistics.unit ?? "mg/kg",
      };
    }

    // Fallback: study-level NOAEL
    if (!noaelRows?.length) return null;
    const sex = selectedFinding?.sex;
    const row = noaelRows.find((r) =>
      sex === "M" ? r.sex === "M" : sex === "F" ? r.sex === "F" : true
    );
    if (!row) return null;
    return { dose_value: row.noael_dose_value, dose_unit: row.noael_dose_unit ?? "mg/kg" };
  })();

  // Priority 1: Endpoint selected → endpoint-level panel
  // Priority 2: Group selected → group-level panel
  // Priority 3: Nothing → empty state

  if (!selectedFindingId || !selectedFinding) {
    // Check for group selection (Priority 2)
    // Wrap in provider so child panels can access analytics via useFindingsAnalytics()
    if (selectedGroupType === "organ" && selectedGroupKey) {
      return <FindingsAnalyticsProvider value={analytics}><OrganContextPanel organKey={selectedGroupKey} /></FindingsAnalyticsProvider>;
    }
    if (selectedGroupType === "syndrome" && selectedGroupKey) {
      return <FindingsAnalyticsProvider value={analytics}><SyndromeContextPanel syndromeId={selectedGroupKey} /></FindingsAnalyticsProvider>;
    }

    // Priority 3: empty state — show normalization heatmap when OM data present
    const normContexts = analytics.normalizationContexts;
    const hasNormData = normContexts && normContexts.length > 0 && normContexts.some(c => c.tier >= 2);
    return (
      <div className="p-4">
        <h3 className="mb-2 text-sm font-semibold">Findings</h3>
        <p className="text-xs text-muted-foreground">
          Select a finding row to view detailed analysis.
        </p>
        {hasNormData && (
          <div className="mt-3">
            <CollapsiblePane title="Normalization overview" defaultOpen variant="margin">
              <NormalizationHeatmap
                contexts={normContexts.filter(c => c.tier >= 2)}
                onOrganClick={(organ) => selectGroup("organ", organ)}
              />
            </CollapsiblePane>
          </div>
        )}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!context) return null;

  const notEvaluated = toxAnnotations && selectedFinding
    ? toxAnnotations[selectedFinding.endpoint_label ?? selectedFinding.finding]?.treatmentRelated === "Not Evaluated"
    : false;

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{selectedFinding.finding}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {selectedFinding.domain} | {selectedFinding.sex} |{" "}
          {selectedFinding.day != null ? `Day ${selectedFinding.day}` : "Terminal"}
        </p>
      </div>

      {/* Verdict — always visible, not in CollapsiblePane */}
      <div className="border-b px-4 py-3">
        <VerdictPane
          finding={selectedFinding}
          analytics={analytics}
          noael={noael}
          doseResponse={context.dose_response}
          statistics={activeStatistics!}
          treatmentSummary={context.treatment_summary}
          endpointSexes={endpointSexes}
          notEvaluated={notEvaluated}
        />
      </div>

      <CollapsiblePane title="Evidence" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <EvidencePane
          finding={selectedFinding}
          analytics={analytics}
          statistics={activeStatistics!}
          effectSize={context.effect_size}
        />
        {/* Normalization annotation for OM domain endpoints */}
        {selectedFinding.domain === "OM" && (() => {
          const specimen = selectedFinding.specimen?.toUpperCase() ?? "";
          const category = specimen ? getOrganCorrelationCategory(specimen) : null;
          const normCtx = specimen ? normalization.getContext(specimen) : null;

          // Reproductive organs always show category-specific messaging
          if (category === OrganCorrelationCategory.GONADAL) {
            return (
              <div className="mt-2 rounded-md bg-amber-50 p-2 text-[10px]">
                <div className="font-semibold text-amber-800">
                  Testes — absolute weight primary (BW-spared)
                </div>
                <div className="mt-0.5 text-amber-700">
                  Absolute weight is the primary endpoint for testes.
                  Body weight ratios are not appropriate (Creasy 2013).
                </div>
                {normCtx && normCtx.tier >= 2 && (
                  <div className="mt-1 font-semibold text-amber-800">
                    BW-ratio testes weight will appear artificially increased
                    (BW Tier {normCtx.tier}, g = {normCtx.bwG.toFixed(2)}).
                  </div>
                )}
              </div>
            );
          }
          if (category === OrganCorrelationCategory.ANDROGEN_DEPENDENT) {
            const organName = specimen ? specimen.charAt(0) + specimen.slice(1).toLowerCase() : "Organ";
            return (
              <div className="mt-2 rounded-md bg-amber-50 p-2 text-[10px]">
                <div className="font-semibold text-amber-800">
                  {organName} — androgen-dependent, not BW-dependent
                </div>
                <div className="mt-0.5 text-amber-700">
                  Weight reflects androgen status. Correlate with histopathology
                  and testes findings.
                </div>
                <button
                  className="mt-1 text-[9px] text-blue-600 hover:underline"
                  onClick={() => {
                    // Navigate to MI domain findings for this organ
                    navigate(`/study/${studyId}/findings`, {
                      state: { domain: "MI", specimen: specimen },
                    });
                  }}
                >
                  View MI findings for {organName} &rarr;
                </button>
              </div>
            );
          }
          if (category === OrganCorrelationCategory.FEMALE_REPRODUCTIVE) {
            const organName = specimen ? specimen.charAt(0) + specimen.slice(1).toLowerCase() : "Organ";
            return (
              <div className="mt-2 rounded-md bg-amber-50 p-2 text-[10px]">
                <div className="font-semibold text-amber-800">
                  {organName} — low confidence (estrous cycle variability)
                </div>
                <div className="mt-0.5 text-amber-700">
                  Low confidence — estrous cycle stage not controlled.
                  Interpret with caution (CV 25–50%).
                </div>
              </div>
            );
          }

          // Non-reproductive organs: show BW confounding at tier >= 2
          if (!normCtx || normCtx.tier < 2) return null;
          const modeLabels: Record<string, string> = {
            absolute: "absolute weight",
            body_weight: "ratio-to-BW",
            brain_weight: "ratio-to-brain",
            ancova: "ANCOVA",
          };
          return (
            <div className="mt-2 rounded-md bg-amber-50 p-2 text-[10px]">
              <div className="font-semibold text-amber-800">
                Body weight confounding (Tier {normCtx.tier})
              </div>
              <div className="mt-0.5 text-amber-700">
                BW effect: g = {normCtx.bwG.toFixed(2)}. {normCtx.tier >= 3
                  ? "Organ-to-BW ratios unreliable for this dose group."
                  : "Organ-to-BW ratios should be interpreted with caution."}
              </div>
              <div className="mt-0.5 text-amber-700">
                Active normalization: {modeLabels[normCtx.activeMode] ?? normCtx.activeMode}
                {normCtx.tier === 4 && " — ANCOVA recommended for definitive assessment"}
              </div>
            </div>
          );
        })()}
        {/* Normalization alternatives for OM domain (G2: grayed for GONADAL, G5: side-by-side for FEMALE) */}
        {selectedFinding.domain === "OM" && (() => {
          const specimen = selectedFinding.specimen?.toUpperCase() ?? "";
          const cat = specimen ? getOrganCorrelationCategory(specimen) : null;
          const decision = specimen ? normalization.getDecision(specimen) : null;
          // Show alternatives for: GONADAL (grayed ratios), FEMALE_REPRODUCTIVE (always), tier >= 2 (showAlternatives)
          const shouldShow = cat === OrganCorrelationCategory.GONADAL
            || cat === OrganCorrelationCategory.FEMALE_REPRODUCTIVE
            || (decision?.showAlternatives ?? false);
          if (!shouldShow) return null;
          const isGonadal = cat === OrganCorrelationCategory.GONADAL;
          const gs = selectedFinding.group_stats;
          const controlGs = gs.find(g => g.dose_level === 0 || g.dose_level === 1);
          const highestGs = gs.length > 0 ? gs[gs.length - 1] : null;
          if (!controlGs || !highestGs || highestGs.dose_level === controlGs.dose_level) return null;
          const ratioGrayed = isGonadal ? "opacity-40" : "";
          return (
            <div className="mt-2 rounded-md border border-border/50 p-2 text-[10px]">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Normalization alternatives (high dose vs control)
              </div>
              <table className="w-full">
                <thead>
                  <tr className="text-[9px] text-muted-foreground">
                    <th className="py-0.5 text-left font-medium">Metric</th>
                    <th className="py-0.5 text-right font-medium">Control</th>
                    <th className="py-0.5 text-right font-medium">High dose</th>
                    <th className="py-0.5 text-right font-medium">{"\u0394"}%</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="py-0.5">Absolute (g)</td>
                    <td className="py-0.5 text-right font-mono">{controlGs.mean?.toFixed(3) ?? "\u2014"}</td>
                    <td className="py-0.5 text-right font-mono">{highestGs.mean?.toFixed(3) ?? "\u2014"}</td>
                    <td className="py-0.5 text-right font-mono">
                      {controlGs.mean && highestGs.mean
                        ? `${(((highestGs.mean - controlGs.mean) / controlGs.mean) * 100).toFixed(1)}%`
                        : "\u2014"}
                    </td>
                  </tr>
                  <tr className={ratioGrayed}>
                    <td className="py-0.5">
                      Ratio-to-BW
                      {isGonadal && <span className="ml-1 text-[8px] text-amber-600">(not appropriate)</span>}
                    </td>
                    <td className="py-0.5 text-right font-mono">{controlGs.mean_relative?.toFixed(4) ?? "\u2014"}</td>
                    <td className="py-0.5 text-right font-mono">{highestGs.mean_relative?.toFixed(4) ?? "\u2014"}</td>
                    <td className="py-0.5 text-right font-mono">
                      {controlGs.mean_relative && highestGs.mean_relative
                        ? `${(((highestGs.mean_relative - controlGs.mean_relative) / controlGs.mean_relative) * 100).toFixed(1)}%`
                        : "\u2014"}
                    </td>
                  </tr>
                  <tr className={ratioGrayed}>
                    <td className="py-0.5">
                      Ratio-to-brain
                      {isGonadal && <span className="ml-1 text-[8px] text-amber-600">(not appropriate)</span>}
                    </td>
                    <td className="py-0.5 text-right font-mono text-muted-foreground" colSpan={3}>
                      Not computed (Phase 2)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}
        {/* Williams' trend test comparison (OM domain only) */}
        {selectedFinding.domain === "OM" && selectedFinding.williams && (
          <WilliamsComparisonPane finding={selectedFinding} />
        )}
        {/* ANCOVA effect decomposition (OM domain, Phase 2) */}
        {selectedFinding.domain === "OM" && selectedFinding.ancova && (
          <ANCOVADecompositionPane finding={selectedFinding} />
        )}
        {/* Decomposed confidence display (ECI — SPEC-ECI-AMD-002) */}
        {(() => {
          const endpointLabel = selectedFinding.endpoint_label ?? selectedFinding.finding;
          const ep = analytics.endpoints.find((e) => e.endpoint_label === endpointLabel);
          if (!ep?.endpointConfidence) return null;
          return <DecomposedConfidencePane eci={ep.endpointConfidence} />;
        })()}
      </CollapsiblePane>

      <CollapsiblePane
        title="Dose detail"
        defaultOpen
        expandAll={expandGen}
        collapseAll={collapseGen}
        headerRight={activeStatistics!.unit ? <span className="text-[10px] text-muted-foreground">Unit: {activeStatistics!.unit}</span> : undefined}
      >
        <DoseDetailPane
          statistics={activeStatistics!}
          doseResponse={context.dose_response}
        />
      </CollapsiblePane>

      {/* Hide correlations pane when based on group means — useless rho=1.0 with n=4 */}
      {context.correlations.related.length > 0
        && context.correlations.related.some((c) => c.basis !== "group_means" && (c.n ?? 0) >= 10) && (
        <CollapsiblePane title="Correlations" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <CorrelationsPane
            data={context.correlations}
            organSystem={selectedFinding.organ_system}
          />
        </CollapsiblePane>
      )}

      <CollapsiblePane title="Context" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <ContextPane
          effectSize={context.effect_size}
          selectedFindingId={selectedFindingId}
        />
      </CollapsiblePane>

      {/* Recovery insights */}
      {hasRecovery && selectedFinding && (
        <CollapsiblePane title="Recovery" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <RecoveryPane finding={selectedFinding} />
        </CollapsiblePane>
      )}

      {/* Related views */}
      <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-1 text-[11px]">
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) {
                navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`);
              }
            }}
          >
            View histopathology &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) {
                navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`);
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
                navigate(`/studies/${encodeURIComponent(studyId)}/noael-determination`);
              }
            }}
          >
            View NOAEL determination &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) {
                navigate(`/studies/${encodeURIComponent(studyId)}`);
              }
            }}
          >
            View study summary &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}
