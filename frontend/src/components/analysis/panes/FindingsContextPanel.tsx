import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useFindingsAnalyticsResult } from "@/contexts/FindingsAnalyticsContext";
import type { FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import { useFindingContext } from "@/hooks/useFindingContext";
import { useEffectiveNoael } from "@/hooks/useEffectiveNoael";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { usePaneHistory } from "@/hooks/usePaneHistory";
import type { ToxFinding } from "@/types/annotations";
import { CollapsiblePane } from "./CollapsiblePane";
import { OutliersPane } from "./OutliersPane";
import { LOO_THRESHOLD, LOO_SMALL_N_THRESHOLD } from "@/lib/loo-constants";
import { ContextPanelHeader } from "./ContextPanelHeader";
import { VerdictPane } from "./VerdictPane";
import { CorrelationsPane } from "./CorrelationsPane";
import { ContextPane } from "./ContextPane";
import { OrganContextPanel } from "./OrganContextPanel";
import { SyndromeContextPanel } from "./SyndromeContextPanel";
import { TimeCoursePane } from "./TimeCoursePane";
import { FoodConsumptionPane, FoodConsumptionHeaderRight } from "./FoodConsumptionPane";
import { useFoodConsumptionSummary } from "@/hooks/useFoodConsumptionSummary";
import type { FoodConsumptionContext } from "@/lib/syndrome-interpretation-types";
// DistributionPane moved to center panel (CenterDistribution in DoseResponseChartPanel)
import { EndpointSyndromePane } from "./EndpointSyndromePane";
import { PatternOverrideDropdown } from "./PatternOverrideDropdown";
import { OnsetDoseDropdown } from "./OnsetDoseDropdown";
import { CausalityWorksheet } from "./CausalityWorksheet";
import type { CausalitySummary, CausalAssessment } from "./CausalityWorksheet";
import { QualifierDetailPane } from "./QualifierDetailPane";
import { PathologyReviewForm } from "./PathologyReviewForm";
import { ToxFindingForm } from "./ToxFindingForm";
import { deriveToxSuggestion } from "@/types/annotations";
import { ChevronRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { DoseLabel } from "@/components/ui/DoseLabel";
import { PharmacologicalBadge } from "@/components/ui/PharmacologicalBadge";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { getOrganCorrelationCategory, OrganCorrelationCategory } from "@/lib/organ-weight-normalization";
import { useStatMethods } from "@/hooks/useStatMethods";
import type { EndpointConfidenceResult, ConfidenceLevel } from "@/lib/endpoint-confidence";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndrome-types";
import type { DoseGroup, UnifiedFinding } from "@/types/analysis";
import { formatPValue, getDoseGroupColor, titleCase } from "@/lib/severity-colors";
import { getPatternLabel, getPatternLabelDirectional } from "@/lib/findings-rail-engine";
import type { SexEndpointSummary, EndpointNoael, OrganCoherence } from "@/lib/derive-summaries";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
import { buildFindingVerdictMap } from "@/lib/recovery-table-verdicts";
import { getVerdictLabel } from "@/lib/recovery-labels";
import { useRuleResults } from "@/hooks/useRuleResults";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import { NoaelDeterminationPane } from "@/components/analysis/noael/NoaelDeterminationPane";
import { SafetyMarginCalculator } from "@/components/analysis/noael/SafetyMarginCalculator";
import { StudyStatementsBar } from "@/components/analysis/noael/StudyStatementsBar";
import { usePkIntegration } from "@/hooks/usePkIntegration";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { buildSignalsPanelData } from "@/lib/signals-panel-engine";
import { resolveOnsetDose, resolveEffectivePattern } from "@/lib/onset-dose";
import { mapFindingsToRows } from "@/lib/derive-summaries";
import { isPairedOrgan, specimenHasLaterality, aggregateSubjectLaterality, aggregateFindingLaterality, lateralitySummary } from "@/lib/laterality";
import { getHistoricalControl, classifyVsHCD, HCD_STATUS_LABELS } from "@/lib/mock-historical-controls";
import type { HCDStatus, HistoricalControlData } from "@/lib/mock-historical-controls";
import { deriveRecoveryAssessmentsSexAware } from "@/lib/recovery-assessment";
import { classifyFindingNature } from "@/lib/finding-nature";
import { getRelevantTests } from "@/lib/organ-test-mapping";
import type { RecoveryAssessment } from "@/lib/recovery-assessment";
import { getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { GradeConfidencePane, GradeConfidenceBadge } from "./GradeConfidencePane";

// ─── Williams' Step-Down Table (shared sub-component) ───────

function WilliamsStepDownTable({ results, finding, doseGroups }: {
  results: { dose_label: string; test_statistic: number; critical_value: number; p_value: number; significant: boolean }[];
  finding: UnifiedFinding;
  doseGroups?: DoseGroup[];
}) {
  if (results.length === 0) return null;

  // Build dose_level → display label from DoseGroup metadata
  const dgMap = new Map<number, DoseGroup>();
  if (doseGroups) {
    for (const dg of doseGroups) dgMap.set(dg.dose_level, dg);
  }

  // Step-down results are highest→lowest treated; group_stats sorted by dose_level ascending
  const treatedLevels = [...finding.group_stats]
    .filter((g) => g.dose_level > 0)
    .sort((a, b) => b.dose_level - a.dose_level); // highest first, matching step-down order

  function doseInfo(idx: number) {
    const level = treatedLevels[idx]?.dose_level ?? idx + 1;
    const dg = dgMap.get(level);
    const label = dg && dg.dose_value != null && dg.dose_value > 0
      ? `${dg.dose_value} ${dg.dose_unit ?? ""}`.trim()
      : results[idx].dose_label;
    return { level, label };
  }

  return (
    <table className="mt-1.5 w-full">
      <thead>
        <tr className="text-[10px] text-muted-foreground">
          <th className="py-0.5 text-left font-medium" style={{ width: "1px", whiteSpace: "nowrap" }} title="Red = included in step-down testing.">Group</th>
          <th className="py-0.5 text-right font-medium" style={{ width: "1px", whiteSpace: "nowrap" }} title="Strength of dose effect vs. control. Significant when t̃ ≥ CV.">t&#x0303;</th>
          <th className="py-0.5 text-right font-medium" style={{ width: "1px", whiteSpace: "nowrap" }} title="Significance threshold for this study's design (α = 0.05).">CV</th>
          <th className="py-0.5 text-right font-medium" style={{ width: "1px", whiteSpace: "nowrap" }}>p</th>
          <th className="py-0.5 text-right font-medium" style={{ width: "1px", whiteSpace: "nowrap" }} title="Significant at α = 0.05. Step-down from high dose: testing stops at first 'No'.">Sig</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r, i) => {
          const di = doseInfo(i);
          return (
            <tr key={r.dose_label} className={cn("border-t border-border/20", r.significant && "text-red-600")}>
              <td className="py-0.5 pr-2" style={{ width: "1px", whiteSpace: "nowrap" }}>
                <span
                  className="border-l-2 pl-1.5 font-mono whitespace-nowrap"
                  style={{ borderLeftColor: getDoseGroupColor(di.level) }}
                >
                  {di.label}
                </span>
              </td>
              <td className="py-0.5 text-right font-mono" style={{ width: "1px", whiteSpace: "nowrap" }}>{r.test_statistic.toFixed(3)}</td>
              <td className="py-0.5 text-right font-mono" style={{ width: "1px", whiteSpace: "nowrap" }}>{r.critical_value.toFixed(3)}</td>
              <td className="py-0.5 text-right font-mono" style={{ width: "1px", whiteSpace: "nowrap" }}>{formatPValue(r.p_value)}</td>
              <td className="py-0.5 text-right" style={{ width: "1px", whiteSpace: "nowrap" }}>{r.significant ? "Yes" : "No"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── ANCOVA Effect Decomposition ──────────────────────────

function ANCOVADecompositionPane({ finding, doseGroups }: { finding: UnifiedFinding; doseGroups?: DoseGroup[] }) {
  const ancova = finding.ancova;
  if (!ancova) return null;

  const resolveDoseLabel = (level: number) => {
    const dg = doseGroups?.find(g => g.dose_level === level);
    return dg && dg.dose_value != null && dg.dose_value > 0
      ? `${dg.dose_value} ${dg.dose_unit ?? ""}`.trim()
      : level === 0 ? "Control" : `Group ${level}`;
  };

  const slopeHomogeneous = ancova.slope_homogeneity.homogeneous;

  // Punchline: compare ANCOVA-adjusted significance to raw Dunnett's
  const punchlineParts: string[] = [];
  for (const ap of ancova.pairwise) {
    const raw = finding.pairwise.find(p => p.dose_level === ap.group);
    if (!raw) continue;
    const rawP = raw.p_value_adj ?? raw.p_value;
    const rawSig = rawP != null && rawP < 0.05;
    const ancovaP = ap.p_value;
    const ancovaSig = ancovaP < 0.05;
    const label = resolveDoseLabel(ap.group);
    if (ancovaSig && rawSig) {
      punchlineParts.push(`Confirms effect at ${label} (p${formatPValue(ancovaP) === "<0.0001" ? " < 0.0001" : " = " + formatPValue(ancovaP)})`);
    } else if (ancovaSig && !rawSig) {
      punchlineParts.push(`Reveals effect at ${label} (raw n.s. \u2192 p = ${formatPValue(ancovaP)})`);
    } else if (!ancovaSig && rawSig) {
      punchlineParts.push(`${label} reduced to ${ancovaP < 0.1 ? "borderline" : "n.s."} (p-adj = ${formatPValue(ancovaP)})`);
    }
  }
  const punchline = punchlineParts.length > 0 ? punchlineParts.join(". ") + "." : null;

  return (
    <div className="mt-2 text-[11px]">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          ANCOVA decomposition
        </span>
        <span className="text-[10px] text-muted-foreground">
          R&sup2; = {ancova.model_r_squared.toFixed(2)}
        </span>
        {!slopeHomogeneous && (
          <span className="text-[10px] font-medium text-amber-600">
            Non-parallel slopes
          </span>
        )}
      </div>

      {/* Punchline: plain-English ANCOVA vs raw comparison */}
      {punchline && (
        <div className="mb-1.5 text-muted-foreground">
          {punchline}
        </div>
      )}

      {/* Slope info */}
      <div className="mb-1.5 flex items-center gap-3 text-muted-foreground">
        <span>BW slope: <span className="font-mono">{ancova.slope.estimate.toFixed(4)}</span></span>
        <span>p = <span className="font-mono">{formatPValue(ancova.slope.p_value)}</span></span>
      </div>

      {/* Effect decomposition + adjusted means — columnar table */}
      <table className="w-full">
        <thead>
          <tr className="text-[10px] text-muted-foreground">
            <th className="py-0.5 text-left font-medium">Group</th>
            <th className="py-0.5 text-right font-medium">Adjusted</th>
            <th className="py-0.5 text-right font-medium">Raw</th>
            <th className="py-0.5 text-right font-medium">Direct</th>
            <th className="py-0.5 text-right font-medium">% direct</th>
            <th className="py-0.5 text-right font-medium">p</th>
          </tr>
        </thead>
        <tbody>
          {ancova.effect_decomposition.map((d) => {
            const adj = ancova.adjusted_means.find(m => m.group === d.group);
            return (
              <tr key={d.group}>
                <td className="py-0.5">
                  <DoseLabel level={d.group} label={resolveDoseLabel(d.group)} className="text-[11px]" />
                </td>
                <td className="py-0.5 text-right font-mono">{adj ? adj.adjusted_mean.toFixed(2) : "—"}</td>
                <td className="py-0.5 text-right font-mono text-muted-foreground">{adj ? adj.raw_mean.toFixed(2) : "—"}</td>
                <td className="py-0.5 text-right font-mono">{d.direct_effect.toFixed(3)}</td>
                <td className="py-0.5 text-right font-mono">{(d.proportion_direct * 100).toFixed(0)}%</td>
                <td className="py-0.5 text-right font-mono">{formatPValue(d.direct_p)}</td>
              </tr>
            );
          })}
          {/* Control row (no decomposition, just means) */}
          {(() => {
            const ctrl = ancova.adjusted_means.find(m => m.group === 0);
            if (!ctrl) return null;
            return (
              <tr>
                <td className="py-0.5">
                  <DoseLabel level={0} label="Control" className="text-[11px]" />
                </td>
                <td className="py-0.5 text-right font-mono">{ctrl.adjusted_mean.toFixed(2)}</td>
                <td className="py-0.5 text-right font-mono text-muted-foreground">{ctrl.raw_mean.toFixed(2)}</td>
                <td className="py-0.5 text-right font-mono text-muted-foreground">—</td>
                <td className="py-0.5 text-right font-mono text-muted-foreground">—</td>
                <td className="py-0.5 text-right font-mono text-muted-foreground">—</td>
              </tr>
            );
          })()}
        </tbody>
      </table>
      <div className="mt-0.5 text-[10px] text-muted-foreground">At mean BW = {ancova.covariate_mean.toFixed(1)}</div>
    </div>
  );
}

// ─── Decomposed Confidence Display ─────────────────────────

function confidenceLevelClass(level: ConfidenceLevel): string {
  // High = nothing to see; moderate/low = semibold (C-04: no colored text in context panel)
  return level === "high"
    ? "text-muted-foreground"
    : "font-semibold text-foreground";
}

const DIMENSION_TOOLTIPS: Record<string, string> = {
  "Statistical evidence": "Strength of the statistical signal: p-value significance and effect size magnitude.",
  "Biological plausibility": "Whether this finding is corroborated by related findings across domains (e.g., clinical chemistry supporting an organ weight change).",
  "Dose-response quality": "Evaluates whether the dose-response pattern is consistent with a reliable treatment-related effect. Flags non-monotonic patterns (e.g., mid-dose peaks with high-dose reversals) where trend test interpretation may be less straightforward.",
  "Trend test validity": "Whether the statistical assumptions of the trend test are met — specifically, comparable within-group variances across dose groups. When ANCOVA is available, this check uses ANCOVA diagnostics instead of raw variance.",
  "Trend concordance": "Whether two independent trend tests (Jonckheere-Terpstra and Williams) agree on the presence and direction of a dose-related trend.",
};

// ─── Dimension Expanded Content Renderers ───────────────────

function doseLabel(level: number, doseGroups?: DoseGroup[]): string {
  const dg = doseGroups?.find((g) => g.dose_level === level);
  if (dg && dg.dose_value != null && dg.dose_value > 0) {
    return `${dg.dose_value} ${dg.dose_unit ?? ""}`.trim();
  }
  return `Level ${level}`;
}

function StatisticalEvidenceContent({ finding, doseGroups }: { finding: UnifiedFinding; doseGroups?: DoseGroup[] }) {
  // Show worst significant p-value from pairwise and best effect size
  const worstSigPairwise = finding.pairwise
    .filter((p) => {
      const pv = p.p_value_adj ?? p.p_value;
      return pv != null && pv < 0.05;
    })
    .sort((a, b) => ((b.p_value_adj ?? b.p_value) ?? 1) - ((a.p_value_adj ?? a.p_value) ?? 1))[0];

  const bestEffectSize = finding.pairwise.reduce<{ g: number; doseLevel: number } | null>((best, p) => {
    const g = Math.abs(p.effect_size ?? 0);
    if (g > (best?.g ?? 0)) return { g, doseLevel: p.dose_level };
    return best;
  }, null);

  const nonSigDoses = finding.pairwise
    .filter((p) => {
      const pv = p.p_value_adj ?? p.p_value;
      return pv == null || pv >= 0.05;
    })
    .filter((p) => p.dose_level > 0)
    .map((p) => doseLabel(p.dose_level, doseGroups));

  return (
    <div className="space-y-0.5 text-muted-foreground">
      {worstSigPairwise && (
        <div>
          Dunnett&apos;s: p = {formatPValue((worstSigPairwise.p_value_adj ?? worstSigPairwise.p_value)!)} at {doseLabel(worstSigPairwise.dose_level, doseGroups)}
        </div>
      )}
      {bestEffectSize && bestEffectSize.g > 0 && (
        <div>Effect size: d = {bestEffectSize.g.toFixed(2)}</div>
      )}
      {nonSigDoses.length > 0 && (
        <div>Not significant at {nonSigDoses.join(" or ")}</div>
      )}
      {!worstSigPairwise && (!bestEffectSize || bestEffectSize.g === 0) && nonSigDoses.length === 0 && (
        <div>No significant pairwise comparisons.</div>
      )}
    </div>
  );
}

function BiologicalPlausibilityContent({ eci, syndromes, finding, organCoherence }: { eci: EndpointConfidenceResult; syndromes: CrossDomainSyndrome[]; finding: UnifiedFinding; organCoherence?: OrganCoherence }) {
  const reason = eci.normCaveat?.reason;
  const hasSyndromes = syndromes.length > 0;
  const organ = finding.specimen ?? finding.organ_system ?? "";
  const coh = organCoherence;

  return (
    <div className="space-y-1 text-muted-foreground">
      {hasSyndromes && syndromes.map((syn) => (
        <div key={syn.id}>
          <div>Part of {syn.name} ({syn.confidence.toLowerCase()}):</div>
          <div className="pl-3 text-[10px]">
            {syn.matchedEndpoints.map((m) => m.endpoint_label).join(", ")}
          </div>
        </div>
      ))}
      {coh && coh.domainCount >= 2 && (
        <div>
          {coh.convergenceLabel} in {titleCase(organ)}: {coh.domains.join(", ")}
          {" \u00b7 "}
          {coh.adverseEndpoints} adverse{coh.warningEndpoints > 0 ? ` + ${coh.warningEndpoints} warning` : ""} endpoint{(coh.adverseEndpoints + coh.warningEndpoints) !== 1 ? "s" : ""}
        </div>
      )}
      {!hasSyndromes && !coh && eci.integrated.biological === "high" && !reason && (
        <div>No cross-domain corroboration or normalization concerns.</div>
      )}
      {reason && <div>{reason}</div>}
    </div>
  );
}

function DoseResponseQualityContent({ eci, finding, doseGroups }: { eci: EndpointConfidenceResult; finding: UnifiedFinding; doseGroups?: DoseGroup[] }) {
  const [showAncova, setShowAncova] = useState(false);
  const { nonMonotonic } = eci;
  const pattern = resolveEffectivePattern(finding) ?? "";
  const isThreshold = pattern.startsWith("threshold");
  const isFlat = pattern === "flat" || pattern === "no_pattern" || pattern === "insufficient_data";
  const hasAncova = finding.ancova != null
    && finding.ancova.adjusted_means.length > 0
    && finding.ancova.model_r_squared > 0;

  return (
    <div className="space-y-0.5 text-muted-foreground">
      {nonMonotonic.triggered ? (
        <>
          <div>
            Threshold with high-dose reversal detected:
            Effect peaks at {nonMonotonic.peakDoseLevel != null ? doseLabel(nonMonotonic.peakDoseLevel, doseGroups) : "—"} and reverses
            ({nonMonotonic.reversalRatio != null ? `${(nonMonotonic.reversalRatio * 100).toFixed(0)}%` : "—"} of peak at highest dose).
          </div>
          <div>Trend test may overstate or understate the effect.</div>
          {nonMonotonic.highestDosePValue != null && (
            <div>Highest dose p = {formatPValue(nonMonotonic.highestDosePValue)} vs control.</div>
          )}
        </>
      ) : (pattern === "non_monotonic" || pattern === "u_shaped") ? (
        <>
          <div>{pattern === "u_shaped" ? "U-shaped" : "Non-monotonic"} dose-response pattern.</div>
          <div>
            Trend test assumes monotonic dose-response;
            significance may not reflect the observed pattern shape.
          </div>
          <div>Individual dose-group contrasts (Dunnett&apos;s) may be more informative than trend for this endpoint.</div>
        </>
      ) : isFlat ? (
        <>
          <div>Flat dose-response pattern (no treatment-related trend).</div>
          <div>Statistical evidence dimension handles significance separately.</div>
        </>
      ) : isThreshold ? (
        <>
          <div>Threshold dose-response pattern</div>
          {(() => {
            const onset = resolveOnsetDose(finding);
            return onset ? (
              <div>Effect onset at {doseLabel(onset.doseLevel, doseGroups)}</div>
            ) : null;
          })()}
        </>
      ) : (
        <div>Monotonic dose-response confirmed.</div>
      )}
      {hasAncova && (
        <div className="mt-1">
          <button
            className="text-[10px] text-blue-600 hover:underline"
            onClick={() => setShowAncova((v) => !v)}
          >
            {showAncova ? "Hide" : "Show"} ANCOVA decomposition
          </button>
          {showAncova && <ANCOVADecompositionPane finding={finding} doseGroups={doseGroups} />}
        </div>
      )}
    </div>
  );
}

function TrendTestValidityContent({ eci, finding }: { eci: EndpointConfidenceResult; finding: UnifiedFinding }) {
  const { trendCaveat } = eci;
  const hasValidAncova = finding.ancova != null
    && finding.ancova.adjusted_means.length > 0
    && finding.ancova.model_r_squared > 0;

  if (hasValidAncova) {
    return (
      <div className="space-y-0.5 text-muted-foreground">
        <div>
          ANCOVA normalization available (R&sup2; = {finding.ancova!.model_r_squared.toFixed(2)})
        </div>
        <div>Raw variance check bypassed — body weight covariate accounts for between-group variance.</div>
        <div>
          BW slope homogeneity: p = {formatPValue(finding.ancova!.slope_homogeneity.p_value)} ({finding.ancova!.slope_homogeneity.homogeneous ? "assumption met" : "assumption not met"})
        </div>
      </div>
    );
  }

  if (trendCaveat.triggered) {
    return (
      <div className="space-y-0.5 text-muted-foreground">
        <div>Variance heterogeneity detected in raw group data:</div>
        {trendCaveat.sdRatio != null && trendCaveat.sdRatio > 2.0 && (
          <div>&nbsp;&nbsp;· SD ratio: {trendCaveat.sdRatio.toFixed(1)}&times; (control SD); threshold: 2.0&times;</div>
        )}
        {trendCaveat.cvRatio != null && trendCaveat.cvRatio > 2.0 && (
          <div>&nbsp;&nbsp;· CV ratio: {trendCaveat.cvRatio.toFixed(1)}&times; (min group CV); threshold: 2.0&times;</div>
        )}
        <div className="mt-0.5">
          JT trend test assumes comparable within-group variances across dose groups. Significance may be inflated.
        </div>
        {!hasValidAncova && (
          <div className="mt-0.5">
            Note: No ANCOVA normalization available for this endpoint.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-0.5 text-muted-foreground">
      <div>Within-group variance comparable across dose groups.</div>
      {trendCaveat.sdRatio != null && (
        <div>SD ratio: {trendCaveat.sdRatio.toFixed(1)}&times; (threshold: 2.0&times;)</div>
      )}
      {trendCaveat.cvRatio != null && (
        <div>CV ratio: {trendCaveat.cvRatio.toFixed(1)}&times; (threshold: 2.0&times;)</div>
      )}
    </div>
  );
}

function TrendConcordanceContent({ finding, doseGroups }: { eci: EndpointConfidenceResult; finding: UnifiedFinding; doseGroups?: DoseGroup[] }) {
  const [showStepDown, setShowStepDown] = useState(false);
  const williams = finding.williams;

  const jtSignificant = finding.trend_p != null && finding.trend_p < 0.05;
  const williamsSignificant = williams?.step_down_results.some((r) => r.significant) ?? false;
  const concordant = jtSignificant === williamsSignificant;

  // Resolve MED to actual dose label
  const medLabel = useMemo(() => {
    if (!williams?.minimum_effective_dose || !doseGroups) return williams?.minimum_effective_dose ?? null;
    // Step-down results are highest→lowest; find the MED entry and resolve its dose level
    const treatedLevels = [...finding.group_stats]
      .filter((g) => g.dose_level > 0)
      .sort((a, b) => b.dose_level - a.dose_level);
    const medIdx = williams.step_down_results.findIndex((r) => r.dose_label === williams.minimum_effective_dose);
    if (medIdx >= 0 && treatedLevels[medIdx]) {
      const dg = doseGroups.find((g) => g.dose_level === treatedLevels[medIdx].dose_level);
      if (dg && dg.dose_value != null && dg.dose_value > 0) {
        return `${dg.dose_value} ${dg.dose_unit ?? ""}`.trim();
      }
    }
    return williams.minimum_effective_dose;
  }, [williams, doseGroups, finding.group_stats]);

  // Concordance explanation
  const concordanceNote = concordant
    ? (jtSignificant
      ? "Both the trend test (JT) and step-down test (Williams) identify a significant dose-related effect."
      : "Neither test identifies a significant dose-related effect.")
    : (jtSignificant
      ? "The overall trend (JT) is significant, but Williams\u2019 step-down does not confirm an effect at any individual dose. May reflect variance heterogeneity or non-monotonic pattern."
      : "Williams\u2019 step-down identifies effects at individual doses, but the overall trend (JT) is not significant. May indicate a threshold response below the trend test\u2019s sensitivity.");

  return (
    <div className="space-y-0.5 text-muted-foreground">
      <table className="text-[11px]">
        <tbody>
          <tr>
            <td className="pr-3 whitespace-nowrap" style={{ width: "1px" }}>Jonckheere-Terpstra</td>
            <td className="font-mono whitespace-nowrap">
              p = {finding.trend_p != null ? formatPValue(finding.trend_p) : "\u2014"}
            </td>
          </tr>
          <tr>
            <td className="pr-3 whitespace-nowrap" style={{ width: "1px" }}>Williams&apos; test</td>
            <td className="font-mono whitespace-nowrap">
              {medLabel
                ? <span title="Minimum effective dose level — lowest dose significant in Williams' step-down.">MED: {medLabel}</span>
                : "No MED detected"}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="flex items-center gap-1.5 border-t border-border/30 pt-0.5">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${concordant ? "bg-emerald-500" : "bg-amber-500"}`} />
        <span className="font-medium text-foreground">{concordant ? "Concordant" : "Discordant"}</span>
      </div>
      <div className="text-[10px]">{concordanceNote}</div>
      {williams && williams.step_down_results.length > 0 && (
        <div className="mt-1">
          <button
            className="text-[10px] text-blue-600 hover:underline"
            onClick={() => setShowStepDown((v) => !v)}
          >
            {showStepDown ? "Hide" : "Show"} Williams&apos; step-down detail
          </button>
          {showStepDown && <WilliamsStepDownTable results={williams.step_down_results} finding={finding} doseGroups={doseGroups} />}
        </div>
      )}
    </div>
  );
}

// ─── Main Decomposed Confidence Pane ────────────────────────

interface DimDef {
  key: string;
  label: string;
  level: ConfidenceLevel;
  notApplicable: boolean;
  renderContent: (() => React.ReactNode) | null;
}

function DecomposedConfidencePane({ eci, finding, doseGroups, syndromes, organCoherence }: { eci: EndpointConfidenceResult; finding: UnifiedFinding; doseGroups?: DoseGroup[]; syndromes: CrossDomainSyndrome[]; organCoherence?: OrganCoherence }) {
  const { integrated } = eci;
  const [expandedDims, setExpandedDims] = useState<Set<string>>(() => {
    // Seed with LOW dimensions on mount
    const lowDims = new Set<string>();
    const levels: Record<string, ConfidenceLevel> = {
      "Statistical evidence": integrated.statistical,
      "Biological plausibility": integrated.biological,
      "Dose-response quality": integrated.doseResponse,
      "Trend test validity": integrated.trendValidity,
      "Trend concordance": integrated.trendConcordance,
    };
    for (const [key, level] of Object.entries(levels)) {
      if (level === "low") lowDims.add(key);
    }
    return lowDims;
  });
  const dimRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  const toggleDim = useCallback((key: string) => {
    setExpandedDims((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Not-applicable detection
  const trendNA = finding.trend_p == null;
  const concordanceNA = finding.trend_p == null || finding.williams == null;

  const dims: DimDef[] = useMemo(() => [
    {
      key: "Statistical evidence",
      label: "Statistical evidence",
      level: integrated.statistical,
      notApplicable: false,
      renderContent: () => <StatisticalEvidenceContent finding={finding} doseGroups={doseGroups} />,
    },
    {
      key: "Biological plausibility",
      label: "Biological plausibility",
      level: integrated.biological,
      notApplicable: false,
      renderContent: () => <BiologicalPlausibilityContent eci={eci} syndromes={syndromes} finding={finding} organCoherence={organCoherence} />,
    },
    {
      key: "Dose-response quality",
      label: "Dose-response quality",
      level: integrated.doseResponse,
      notApplicable: false,
      renderContent: () => <DoseResponseQualityContent eci={eci} finding={finding} doseGroups={doseGroups} />,
    },
    {
      key: "Trend test validity",
      label: "Trend test validity",
      level: integrated.trendValidity,
      notApplicable: trendNA,
      renderContent: trendNA ? null : () => <TrendTestValidityContent eci={eci} finding={finding} />,
    },
    {
      key: "Trend concordance",
      label: "Trend concordance",
      level: integrated.trendConcordance,
      notApplicable: concordanceNA,
      renderContent: concordanceNA ? null : () => <TrendConcordanceContent eci={eci} finding={finding} doseGroups={doseGroups} />,
    },
  ], [eci, finding, integrated, trendNA, concordanceNA]);

  return (
    <div className="text-[11px]">
      {/* Decomposition — per-dimension expandable rows */}
      <table className="w-full text-[11px]">
        <tbody>
          {dims.map((d) => {
            const isExpanded = expandedDims.has(d.key);
            const isExpandable = !d.notApplicable && d.renderContent != null;
            return (
              <Fragment key={d.key}>
                <tr
                  ref={(el) => { if (el) dimRefs.current.set(d.key, el); }}
                  className={isExpandable ? "cursor-pointer hover:bg-muted/20" : ""}
                  onClick={isExpandable ? () => toggleDim(d.key) : undefined}
                >
                  <td
                    className={`py-0.5 pr-1.5 uppercase text-[10px] ${
                      d.notApplicable ? "text-muted-foreground/50" : confidenceLevelClass(d.level)
                    }`}
                    style={{ width: "1px", whiteSpace: "nowrap" }}
                  >
                    {d.notApplicable ? "\u2014" : d.level}
                  </td>
                  <td
                    className={`py-0.5 font-medium whitespace-nowrap ${d.notApplicable ? "text-muted-foreground/50" : ""}`}
                    title={DIMENSION_TOOLTIPS[d.key]}
                  >
                    <span className="inline-flex items-center gap-0.5">
                      {isExpandable ? (
                        <ChevronRight className={cn("h-3 w-3 shrink-0 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
                      ) : (
                        <span className="inline-block h-3 w-3 shrink-0" />
                      )}
                      {d.label}
                      {d.notApplicable && (
                        <span className="ml-1 text-[10px] font-normal text-muted-foreground/50">(not applicable)</span>
                      )}
                    </span>
                  </td>
                </tr>
                {isExpanded && d.renderContent && (
                  <tr>
                    <td />
                    <td className="pb-1.5 pl-[14px] pt-0.5 text-[11px]">
                      {d.renderContent()}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sex Comparison Pane (Phase B5) ──────────────────────

function SexComparisonPane({
  finding,
  siblingFinding,
  analytics,
  primaryRecoveryLabel,
  siblingRecoveryLabel,
  doseGroups,
}: {
  finding: UnifiedFinding;
  siblingFinding?: UnifiedFinding;
  analytics: FindingsAnalytics;
  primaryRecoveryLabel?: string;
  siblingRecoveryLabel?: string;
  doseGroups?: DoseGroup[];
}) {
  const endpointLabel = finding.endpoint_label ?? finding.finding;
  const epSummary = analytics.endpoints.find(e => e.endpoint_label === endpointLabel);
  const bySex = epSummary?.bySex;
  const noaelBySex = epSummary?.noaelBySex;
  if (!bySex || bySex.size < 2) return null;

  // Order: F first, then M (F precedes M in all sequential layouts)
  const sexes = ["F", "M"].filter(s => bySex.has(s));
  if (sexes.length < 2) return null;

  const patLabel = (s: SexEndpointSummary) =>
    s.pattern ? getPatternLabelDirectional(s.pattern) : "\u2014";

  const noaelLabel = (n: EndpointNoael | undefined) => {
    if (!n) return "\u2014";
    if (n.doseValue != null) return `${n.doseValue} ${n.doseUnit ?? "mg/kg"}`;
    if (n.tier === "below-lowest") return "< lowest";
    return "\u2014";
  };

  // sexes[0] = "F", sexes[1] = "M" (alphabetical). Name by column index to
  // avoid the old m/f naming that inverted the sexes and invited future bugs.
  const col0 = bySex.get(sexes[0])!;
  const col1 = bySex.get(sexes[1])!;

  // Resolve per-sex findings for pattern override dropdowns
  const primarySex = finding.sex;
  const findingForSex: Record<string, UnifiedFinding | undefined> = {
    [primarySex]: finding,
    ...(siblingFinding ? { [siblingFinding.sex]: siblingFinding } : {}),
  };

  const isIncidence = finding.data_type === "incidence";
  const effectLabel = isIncidence ? "avg sev" : "|g|";

  const rows: Array<{ label: string; values: [string, string]; title?: string }> = [
    {
      label: effectLabel,
      values: [
        col0.maxEffectSize != null ? Math.abs(col0.maxEffectSize).toFixed(2) : "\u2014",
        col1.maxEffectSize != null ? Math.abs(col1.maxEffectSize).toFixed(2) : "\u2014",
      ],
    },
    {
      label: "Trend p",
      values: [
        col0.minPValue != null ? formatPValue(col0.minPValue) : "\u2014",
        col1.minPValue != null ? formatPValue(col1.minPValue) : "\u2014",
      ],
    },
    { label: "Severity", values: [col0.worstSeverity, col1.worstSeverity] },
  ];
  if (noaelBySex) {
    rows.push({
      label: "NOAEL",
      values: [noaelLabel(noaelBySex.get(sexes[0])), noaelLabel(noaelBySex.get(sexes[1]))],
    });
  }
  // BW confound row: check if primary or sibling has ANCOVA
  const primaryHasAncova = finding.ancova != null;
  if (primaryHasAncova) {
    rows.push({
      label: "BW confound",
      values: [
        primarySex === sexes[0] ? "ANCOVA" : "\u2014",
        primarySex === sexes[1] ? "ANCOVA" : "\u2014",
      ],
    });
  }
  // LOO stability row: show when at least one sex is fragile (<0.8)
  const loo0 = col0.looStability;
  const loo1 = col1.looStability;
  if ((loo0 != null && loo0 < 0.8) || (loo1 != null && loo1 < 0.8)) {
    const fmtLoo = (v: number | null | undefined, ctrlFragile?: boolean | null) =>
      v != null ? `${(v * 100).toFixed(0)}%${ctrlFragile ? " (ctrl)" : ""}` : "\u2014";
    const anyCtrl = col0.looControlFragile || col1.looControlFragile;
    rows.push({
      label: "LOO stability",
      values: [fmtLoo(loo0, col0.looControlFragile), fmtLoo(loo1, col1.looControlFragile)],
      title: anyCtrl
        ? "Leave-one-out stability: control-side dominant -- signal may be driven by an unusual control animal. Below 80% = fragile."
        : "Leave-one-out stability: what fraction of the effect size survives removing the most influential animal. Below 80% = fragile.",
    });
  }

  // Onset dose row — always rendered as custom JSX cells with dropdown
  // (onset dose is always overridable, even without a pattern override)

  // Recovery labels — rendered as last row after onset dose
  const recoveryValues: [string, string] | null = (primaryRecoveryLabel || siblingRecoveryLabel)
    ? [
        (primarySex === sexes[0] ? primaryRecoveryLabel : siblingRecoveryLabel) ?? "\u2014",
        (primarySex === sexes[1] ? primaryRecoveryLabel : siblingRecoveryLabel) ?? "\u2014",
      ]
    : null;

  return (
    <div className="mt-3 pr-6">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b text-[10px] text-muted-foreground">
            <th className="py-0.5 text-left font-semibold uppercase tracking-wider">Sex comparison</th>
            {sexes.map(s => (
              <th key={s} className="py-0.5 text-right font-medium">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-border/30">
              <td className="py-0.5 text-muted-foreground" title={r.title}>{r.label}</td>
              <td className="py-0.5 text-right font-mono">{r.values[0]}</td>
              <td className="py-0.5 text-right font-mono">{r.values[1]}</td>
            </tr>
          ))}
          {/* Pattern row — editable via dropdown, directional labels */}
          <tr className="border-b border-border/30">
            <td className="py-0.5 text-muted-foreground">Pattern</td>
            {sexes.map(s => {
              const sf = findingForSex[s];
              return (
                <td key={s} className="py-0.5 text-right bg-violet-100/50">
                  {sf ? (
                    <PatternOverrideDropdown key={sf.id} finding={sf} />
                  ) : (
                    <span className="font-mono">{patLabel(bySex.get(s)!)}</span>
                  )}
                </td>
              );
            })}
          </tr>
          {/* Onset dose row — always shows dropdown for override */}
          <tr className="border-b border-border/30">
            <td className="py-0.5 text-muted-foreground">Onset dose</td>
            {sexes.map(s => {
              const sf = findingForSex[s];
              return (
                <td key={s} className="py-0.5 text-right bg-violet-100/50">
                  {sf && doseGroups ? (
                    <OnsetDoseDropdown key={sf.id} finding={sf} doseGroups={doseGroups} />
                  ) : (
                    <span className="font-mono">{"\u2014"}</span>
                  )}
                </td>
              );
            })}
          </tr>
          {/* Recovery row — last, uses same engine as findings table */}
          {recoveryValues && (
            <tr className="border-b border-border/30">
              <td className="py-0.5 text-muted-foreground">Recovery</td>
              <td className="py-0.5 text-right font-mono">{recoveryValues[0]}</td>
              <td className="py-0.5 text-right font-mono">{recoveryValues[1]}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}


// ─── Convergence Note (for Patterns pane) ───────────────

// ─── Lab Correlates (from unified findings pipeline) ───────────────────────
function LabFindingsInline({ findings }: { findings: UnifiedFinding[] }) {
  if (findings.length === 0) return <p className="text-xs text-muted-foreground">No relevant lab findings.</p>;
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b text-muted-foreground">
          <th className="pb-0.5 text-left font-semibold">Test</th>
          <th className="pb-0.5 text-right font-semibold">Dir</th>
          <th className="pb-0.5 text-right font-semibold">Fold</th>
          <th className="pb-0.5 text-right font-semibold">p</th>
          <th className="pb-0.5 text-right font-semibold">Pattern</th>
        </tr>
      </thead>
      <tbody>
        {findings.map(f => (
          <tr key={`${f.test_code}-${f.sex ?? ""}`} className="border-b border-dashed">
            <td className="py-0.5 font-medium">{f.test_code}{f.sex ? ` (${f.sex})` : ""}</td>
            <td className="py-0.5 text-right font-mono text-muted-foreground">{f.direction === "up" ? "\u2191" : f.direction === "down" ? "\u2193" : "\u2014"}</td>
            <td className="py-0.5 text-right font-mono text-muted-foreground">{f.max_fold_change != null ? `\u00d7${f.max_fold_change.toFixed(2)}` : "\u2014"}</td>
            <td className="py-0.5 text-right font-mono text-muted-foreground">{f.min_p_adj != null ? (f.min_p_adj < 0.001 ? "<0.001" : f.min_p_adj.toFixed(3)) : "\u2014"}</td>
            <td className="py-0.5 text-right text-muted-foreground">{(resolveEffectivePattern(f) ?? "\u2014").replace(/_/g, " ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Peer Comparison / HCD (inline, ported from HistopathologyContextPanel) ──

function PeerComparisonInline({ row }: {
  row: { finding: string; controlIncidence: number; hcd: HistoricalControlData | null; status: HCDStatus };
}) {
  const { finding, controlIncidence, hcd, status } = row;
  if (!hcd) return null;

  const meanPct = Math.round(hcd.mean_incidence * 100);
  const rangeLow = Math.round(hcd.min_incidence * 100);
  const rangeHigh = Math.round(hcd.max_incidence * 100);

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Control group incidence vs historical control data (HCD) for the same strain.
      </p>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="pb-0.5 text-left text-[11px] font-semibold uppercase tracking-wider">Finding</th>
            <th className="pb-0.5 text-right text-[11px] font-semibold uppercase tracking-wider">Study ctrl</th>
            <th className="pb-0.5 text-right text-[11px] font-semibold uppercase tracking-wider">HCD range</th>
            <th className="pb-0.5 text-right text-[11px] font-semibold uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-dashed">
            <td className="max-w-[120px] truncate py-1 text-xs font-medium" title={finding}>{finding}</td>
            <td className="py-1 text-right font-mono text-muted-foreground">{Math.round(controlIncidence * 100)}%</td>
            <td className="py-1 text-right text-muted-foreground">
              <span className="font-mono">{rangeLow}{"\u2013"}{rangeHigh}%</span>
              <br />
              <span className="text-[10px] text-muted-foreground/60">mean {meanPct}%, n={hcd.n_studies}</span>
            </td>
            <td className="py-1 text-right">
              <span className={cn(
                "text-[10px]",
                status === "above_range" ? "font-medium text-foreground"
                  : status === "at_upper" ? "text-muted-foreground"
                  : "text-muted-foreground/60",
              )}>
                {status === "above_range" && "\u25B2 "}
                {status === "at_upper" && "\u26A0 "}
                {HCD_STATUS_LABELS[status]}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      {hcd && (
        <div className="flex items-center gap-2">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">mock</span>
          <span className="text-[10px] text-muted-foreground/50">Simulated historical control data</span>
        </div>
      )}
    </div>
  );
}

// ─── Correlating Evidence (inline, ported from HistopathologyContextPanel) ────

function CorrelatingEvidenceInline({ evidence }: {
  evidence: {
    inThisSpecimen: [string, { maxIncidence: number; domain: string }][];
    crossOrgan: [string, { maxIncidence: number }][];
  };
}) {
  return (
    <div className="space-y-2">
      {/* In this specimen */}
      {evidence.inThisSpecimen.length === 0 ? (
        <p className="text-xs text-muted-foreground">No other findings in this specimen.</p>
      ) : (
        <div className="space-y-0.5">
          {evidence.inThisSpecimen.map(([name, info]) => (
            <div key={name} className="flex items-center justify-between text-xs">
              <span className="min-w-0 truncate" title={name}>
                <span className="mr-1 text-[10px] font-semibold text-muted-foreground">{info.domain}</span>
                {name}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {Math.round(info.maxIncidence * 100)}%
              </span>
            </div>
          ))}
        </div>
      )}
      {/* In other specimens (same finding) — R16 cross-organ */}
      {evidence.crossOrgan.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            In other specimens (same finding)
          </div>
          <div className="space-y-0.5">
            {evidence.crossOrgan.map(([specimen, info]) => (
              <div key={specimen} className="text-xs">
                <span className="text-muted-foreground">{specimen}</span>
                <span className="text-[10px] text-muted-foreground"> {"\u00B7"} {Math.round(info.maxIncidence * 100)}% incidence</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WoE Strength Assessment ─────────────────────────────────────────────────
// Hierarchical: core triad (TR + D-R + stats) determines base tier,
// supporting evidence (HCD, recovery, syndrome, lab) upgrades by at most one tier.
// Floor: any adverse+TR finding guarantees minimum "weak".
// References: Lewis et al. 2002 Toxicol Pathol 30:66-74; Dorato & Engelhardt 2005.

export interface WoeStrengthInput {
  total: number;
  trCount: number;
  doseDepCount: number;
  sigCount: number;
  peerAboveRange: boolean;
  recoveryPersistent: number;
  hasSyndrome: boolean;
  labStrongCount: number;
  hasAdverseTr: boolean;
  /** R2 Q3: syndrome-matched LB endpoint labels (uppercase) for dedup */
  syndromeLbLabels: Set<string>;
  /** R2 Q3: strong lab finding labels (uppercase) for dedup */
  strongLabLabels: string[];
}

export interface WoeStrengthResult {
  strength: "strong" | "moderate" | "weak" | "insufficient";
  coreFactors: string[];
  supportingFactors: string[];
  wasUpgraded: boolean;
}

const STRENGTH_TIERS = ["insufficient", "weak", "moderate", "strong"] as const;

export function computeWoeStrength(input: WoeStrengthInput): WoeStrengthResult {
  // Core triad
  const coreFactors: string[] = [];
  if (input.trCount >= input.total * 0.6) coreFactors.push("majority treatment-related");
  if (input.doseDepCount >= 2) coreFactors.push("dose-dependent in multiple findings");
  if (input.sigCount >= 2) coreFactors.push("statistically significant");

  const baseTier = Math.min(coreFactors.length, 3) as 0 | 1 | 2 | 3;
  let strength = STRENGTH_TIERS[baseTier];

  // Supporting evidence
  const supportingFactors: string[] = [];
  if (input.peerAboveRange) supportingFactors.push("exceeds historical controls");
  if (input.recoveryPersistent > 0) supportingFactors.push("persistent findings");
  if (input.hasSyndrome) supportingFactors.push("syndrome match");

  // Lab correlation with syndrome dedup (R2 Q3)
  if (input.labStrongCount > 0) {
    let labConsumed = false;
    if (input.syndromeLbLabels.size > 0 && input.strongLabLabels.length > 0) {
      labConsumed = input.strongLabLabels.every(l => input.syndromeLbLabels.has(l));
    }
    if (!labConsumed) supportingFactors.push("correlated lab changes");
  }

  // Upgrade: 2+ supporting factors upgrades by one tier (max)
  let wasUpgraded = false;
  if (supportingFactors.length >= 2 && strength !== "strong") {
    const idx = STRENGTH_TIERS.indexOf(strength);
    strength = STRENGTH_TIERS[idx + 1];
    wasUpgraded = true;
  }

  // Floor: any adverse+TR finding = minimum "weak"
  if (input.hasAdverseTr && STRENGTH_TIERS.indexOf(strength) < 1) {
    strength = "weak";
  }

  return { strength, coreFactors, supportingFactors, wasUpgraded };
}

// ─── Specimen Context Panel (Phase 5) ────────────────────────────────────────

function SpecimenContextPanelInline({ studyId, specimen, activeFindings, analytics, nav }: {
  studyId: string | undefined;
  specimen: string;
  activeFindings: UnifiedFinding[];
  analytics: FindingsAnalytics;
  nav: { canGoBack: boolean; canGoForward: boolean; onBack: () => void; onForward: () => void };
}) {
  const { expandAll, collapseAll, expandGen, collapseGen } = useCollapseAll();
  const [labExpanded, setLabExpanded] = useState(false);

  // Specimen findings
  const specimenFindings = useMemo(() => {
    const unique = new Map<string, UnifiedFinding>();
    for (const f of activeFindings) {
      if (f.specimen === specimen && (f.domain === "MI" || f.domain === "MA")) {
        const key = `${f.finding}\0${f.domain}`;
        if (!unique.has(key)) unique.set(key, f);
      }
    }
    return [...unique.values()].sort((a, b) => {
      const sevOrd: Record<string, number> = { adverse: 0, warning: 1, normal: 2, not_assessed: 2 };
      return (sevOrd[a.severity] ?? 2) - (sevOrd[b.severity] ?? 2) || a.finding.localeCompare(b.finding);
    });
  }, [activeFindings, specimen]);

  // Syndromes containing this specimen
  const specimenSyndromes = useMemo(() => {
    const prefix = specimen.toUpperCase() + " \u2014 ";
    return analytics.syndromes?.filter(s =>
      s.matchedEndpoints.some(m => m.endpoint_label.toUpperCase().startsWith(prefix))
    ) ?? [];
  }, [analytics.syndromes, specimen]);

  // Lab correlates (specimen-level) — LB findings with test_codes relevant to this organ
  const relevantLabFindings = useMemo(() => {
    const tests = new Set(getRelevantTests(specimen).map(t => t.toUpperCase()));
    if (tests.size === 0) return [];
    return activeFindings
      .filter(f => f.domain === "LB" && tests.has(f.test_code.toUpperCase()))
      // Deduplicate by test_code (keep worst severity per test, combine sexes)
      .reduce((acc, f) => {
        const existing = acc.find(e => e.test_code.toUpperCase() === f.test_code.toUpperCase());
        if (!existing) { acc.push(f); }
        else if (f.severity === "adverse" && existing.severity !== "adverse") {
          acc[acc.indexOf(existing)] = f;
        }
        return acc;
      }, [] as UnifiedFinding[])
      .sort((a, b) => {
        // Treatment-related first, then by effect size descending
        if (a.treatment_related !== b.treatment_related) return a.treatment_related ? -1 : 1;
        return Math.abs(b.max_effect_size ?? 0) - Math.abs(a.max_effect_size ?? 0);
      });
  }, [activeFindings, specimen]);

  // Subject data for laterality + recovery
  const { data: subjData } = useHistopathSubjects(studyId, specimen);

  // Laterality
  const lateralityData = useMemo(() => {
    if (!subjData?.subjects || !isPairedOrgan(specimen)) return null;
    if (!specimenHasLaterality(subjData.subjects)) return null;
    const subjectAgg = aggregateSubjectLaterality(subjData.subjects);
    if (subjectAgg.total === 0) return null;
    const perFinding = (subjData.findings ?? []).map(f => ({
      finding: f,
      agg: aggregateFindingLaterality(subjData.subjects, f),
    })).filter(x => x.agg.left > 0 || x.agg.right > 0 || x.agg.bilateral > 0);
    return { subjectAgg, perFinding };
  }, [subjData, specimen]);

  // Recovery flag + per-finding classification
  const hasRecovery = useMemo(
    () => subjData?.subjects?.some(s => s.is_recovery) ?? false,
    [subjData],
  );
  const recoveryAssessments = useMemo((): RecoveryAssessment[] => {
    if (!hasRecovery || !subjData?.subjects) return [];
    const findingNames = specimenFindings.map(f => f.finding);
    if (findingNames.length === 0) return [];
    return deriveRecoveryAssessmentsSexAware(
      findingNames,
      subjData.subjects,
      undefined,
      subjData.recovery_days,
      specimen,
    );
  }, [hasRecovery, subjData, specimenFindings, specimen]);

  // Peer comparison (HCD) for all findings — computed before woeSynthesis (strength needs it)
  const peerRows = useMemo(() => {
    return specimenFindings.map(f => {
      const controlGs = f.group_stats.find(gs => gs.dose_level === 0);
      const controlInc = controlGs ? (controlGs.incidence ?? (controlGs.n > 0 ? (controlGs.affected ?? 0) / controlGs.n : 0)) : 0;
      const organName = specimen.toLowerCase().replace(/_/g, " ");
      const hcd = getHistoricalControl(f.finding, organName);
      const status: HCDStatus = hcd ? classifyVsHCD(controlInc, hcd) : "no_data";
      return { finding: f.finding, controlIncidence: controlInc, hcd, status };
    }).filter(r => r.hcd != null);
  }, [specimenFindings, specimen]);

  // Weight-of-evidence synthesis (aggregates across all specimen dimensions)
  const woeSynthesis = useMemo(() => {
    if (specimenFindings.length === 0) return null;
    const total = specimenFindings.length;
    const trCount = specimenFindings.filter(f => f.treatment_related).length;
    const adverseCount = specimenFindings.filter(f => f.severity === "adverse").length;
    const adaptiveCount = specimenFindings.filter(f => f.finding_class === "tr_adaptive").length;
    const equivocalCount = specimenFindings.filter(f => f.finding_class === "equivocal").length;

    // Dose-response patterns — collect types for distribution
    const patternTypes = new Map<string, number>();
    const withPattern = specimenFindings.filter(f => {
      const p = resolveEffectivePattern(f);
      if (p && p !== "no_pattern" && p !== "control_only") {
        const key = p.toUpperCase();
        patternTypes.set(key, (patternTypes.get(key) ?? 0) + 1);
        return true;
      }
      return false;
    });
    const doseDepCount = withPattern.length;
    const dominantPattern = [...patternTypes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    // D-R confidence from endpoint summaries (ECI integrated)
    const specimenPrefix = specimen.toUpperCase() + " \u2014 ";
    const specimenEndpoints = analytics.endpoints.filter(ep =>
      ep.endpoint_label.toUpperCase().startsWith(specimenPrefix));
    const highConfidenceCount = specimenEndpoints.filter(ep => {
      const level = ep.endpointConfidence?.integrated.integrated;
      return level === "high" || level === "moderate";
    }).length;

    // Significance
    const sigCount = specimenFindings.filter(f => f.min_p_adj != null && f.min_p_adj < 0.05).length;
    const trendSigCount = specimenFindings.filter(f => f.trend_p != null && f.trend_p < 0.05).length;

    // Finding natures — full breakdown + TR-filtered reversibility
    const natures = specimenFindings.map((f, i) => ({
      info: classifyFindingNature(f.finding, null, f.specimen ?? null),
      tr: f.treatment_related,
      idx: i,
    }));
    const natureCounts = new Map<string, number>();
    for (const n of natures) {
      if (n.info.nature !== "unknown") natureCounts.set(n.info.nature, (natureCounts.get(n.info.nature) ?? 0) + 1);
    }
    const dominantNature = [...natureCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    // Reversibility — TR findings only (R1 Finding 2.1)
    const trNatures = natures.filter(n => n.tr);
    const reversibleCount = trNatures.filter(n =>
      n.info.expected_reversibility === "high" || n.info.expected_reversibility === "moderate").length;
    const irreversibleCount = trNatures.filter(n =>
      n.info.expected_reversibility === "none" || n.info.expected_reversibility === "low").length;
    // Nature-qualified irreversibility breakdown (R1 Finding 2.3)
    const irreversibleByNature = new Map<string, number>();
    for (const n of trNatures) {
      if (n.info.expected_reversibility === "none" || n.info.expected_reversibility === "low") {
        irreversibleByNature.set(n.info.nature, (irreversibleByNature.get(n.info.nature) ?? 0) + 1);
      }
    }

    // Lab signal count
    const labStrongCount = relevantLabFindings.filter(f => Math.abs(f.max_fold_change ?? 0) >= 2.0).length;
    const labTotalCount = relevantLabFindings.length;

    // Syndrome domain breadth
    const syndromeDomainCount = specimenSyndromes.length > 0
      ? Math.max(...specimenSyndromes.map(s => s.domainsCovered?.length ?? 0))
      : 0;

    // Laterality summary
    const bilateralRatio = lateralityData
      ? lateralityData.subjectAgg.bilateral / lateralityData.subjectAgg.total
      : null;

    // Hierarchical strength assessment (core triad + supporting modulation + floor)
    const { strength, coreFactors, supportingFactors, wasUpgraded } = computeWoeStrength({
      total, trCount, doseDepCount, sigCount,
      peerAboveRange: peerRows.some(r => r.status === "above_range"),
      recoveryPersistent: recoveryAssessments.filter(r => r.overall === "persistent" || r.overall === "progressing").length,
      hasSyndrome: specimenSyndromes.length > 0,
      labStrongCount,
      hasAdverseTr: specimenFindings.some(f => f.treatment_related && f.severity === "adverse"),
      // R2 Q3: syndrome-lab dedup — match by testCode from EndpointSummary
      syndromeLbLabels: (() => {
        const codes = new Set<string>();
        for (const s of specimenSyndromes) {
          for (const m of s.matchedEndpoints) {
            if (m.domain !== "LB") continue;
            // Look up testCode from the EndpointSummary that this match came from
            const ep = analytics.endpoints.find(e =>
              e.endpoint_label === m.endpoint_label && e.domain === "LB");
            if (ep?.testCode) codes.add(ep.testCode.toUpperCase());
          }
        }
        return codes;
      })(),
      strongLabLabels: relevantLabFindings
        .filter(f => Math.abs(f.max_fold_change ?? 0) >= 2.0)
        .map(f => f.test_code.toUpperCase()),
    });

    return {
      total, trCount, adverseCount, adaptiveCount, equivocalCount,
      doseDepCount, sigCount, trendSigCount,
      patternTypes, dominantPattern, highConfidenceCount,
      natureCounts, dominantNature,
      reversibleCount, irreversibleCount, irreversibleByNature,
      labStrongCount, labTotalCount,
      syndromeDomainCount, bilateralRatio,
      strength, coreFactors, supportingFactors, wasUpgraded,
    };
  }, [specimenFindings, analytics.endpoints, specimen, relevantLabFindings,
      specimenSyndromes, lateralityData, peerRows, recoveryAssessments]);

  return (
    <div>
      <ContextPanelHeader
        title={specimen.toUpperCase()}
        subtitle={
          <>
            {specimenFindings.length} findings
            {specimenSyndromes.length > 0 && <> &middot; {specimenSyndromes.length} syndrome{specimenSyndromes.length !== 1 ? "s" : ""}</>}
          </>
        }
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        canGoBack={nav.canGoBack}
        canGoForward={nav.canGoForward}
        onBack={nav.onBack}
        onForward={nav.onForward}
      />

      {/* Weight-of-evidence synthesis */}
      {woeSynthesis && woeSynthesis.total > 0 && (
        <CollapsiblePane title="Specimen assessment" defaultOpen={false} sessionKey="pcc.specimen.assessment" expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-1.5">
            {/* Strength conclusion + rationale */}
            <p className="text-xs">
              <span className={woeSynthesis.strength === "strong" ? "font-semibold text-foreground" : woeSynthesis.strength === "moderate" ? "font-medium text-foreground" : "text-muted-foreground"}>
                {woeSynthesis.strength === "strong" ? "Strong" : woeSynthesis.strength === "moderate" ? "Moderate" : woeSynthesis.strength === "weak" ? "Weak" : "Insufficient"} evidence
              </span>
              {" \u2014 "}
              <span className="text-muted-foreground">
                {woeSynthesis.coreFactors.length > 0
                  ? woeSynthesis.coreFactors.join(", ")
                  : "0/3 core criteria"}
                {woeSynthesis.wasUpgraded && woeSynthesis.supportingFactors.length > 0 && (
                  `, supported by ${woeSynthesis.supportingFactors.join(" + ")}`
                )}
                .
              </span>
            </p>

            {/* Dimension rows */}
            <div className="space-y-0.5 text-[11px]">
              {/* Treatment relatedness */}
              {woeSynthesis.trCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Treatment-related</span>
                  <span className={woeSynthesis.adverseCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"}>
                    {woeSynthesis.trCount}/{woeSynthesis.total}
                    {woeSynthesis.adverseCount > 0 && `, ${woeSynthesis.adverseCount} adverse`}
                    {woeSynthesis.adaptiveCount > 0 && `, ${woeSynthesis.adaptiveCount} adaptive`}
                    {woeSynthesis.equivocalCount > 0 && `, ${woeSynthesis.equivocalCount} equivocal`}
                  </span>
                </div>
              )}

              {/* D-R consistency */}
              {woeSynthesis.doseDepCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dose-response</span>
                  <span className="text-muted-foreground">
                    {woeSynthesis.doseDepCount}/{woeSynthesis.total} dose-dependent
                    {woeSynthesis.dominantPattern && ` (${woeSynthesis.dominantPattern.toLowerCase().replace(/_/g, " ")}${woeSynthesis.highConfidenceCount > 0 ? `, ${woeSynthesis.highConfidenceCount} moderate+ confidence` : ""})`}
                  </span>
                </div>
              )}

              {/* HCD */}
              {peerRows.length > 0 && (() => {
                const aboveCount = peerRows.filter(r => r.status === "above_range").length;
                const atUpperCount = peerRows.filter(r => r.status === "at_upper").length;
                return (aboveCount > 0 || atUpperCount > 0) ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Historical controls</span>
                    <span className={aboveCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"}>
                      {aboveCount > 0 ? `${aboveCount} above range` : ""}{aboveCount > 0 && atUpperCount > 0 ? ", " : ""}{atUpperCount > 0 ? `${atUpperCount} at upper` : ""}
                    </span>
                  </div>
                ) : null;
              })()}

              {/* Recovery */}
              {recoveryAssessments.length > 0 && (() => {
                const reversed = recoveryAssessments.filter(r => r.overall === "reversed").length;
                const partial = recoveryAssessments.filter(r => r.overall === "partially_reversed").length;
                const persistent = recoveryAssessments.filter(r => r.overall === "persistent" || r.overall === "progressing").length;
                const parts: string[] = [];
                if (reversed > 0) parts.push(`${reversed} reversed`);
                if (partial > 0) parts.push(`${partial} partial`);
                if (persistent > 0) parts.push(`${persistent} persistent`);
                return parts.length > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Recovery</span>
                    <span className={persistent > 0 ? "font-medium text-foreground" : "text-muted-foreground"}>{parts.join(", ")}</span>
                  </div>
                ) : null;
              })()}

              {/* Syndromes — with domain coverage breadth */}
              {specimenSyndromes.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Syndrome support</span>
                  <span className="text-muted-foreground">{specimenSyndromes.map(s =>
                    `${s.name} (${s.confidence.toLowerCase()}${s.domainsCovered?.length ? `, ${s.domainsCovered.length} domains` : ""})`
                  ).join(", ")}</span>
                </div>
              )}

              {/* Lab correlates — with signal count */}
              {relevantLabFindings.length > 0 && (() => {
                const top3 = relevantLabFindings.slice(0, 3);
                const arrow = (f: UnifiedFinding) => f.direction === "up" ? "\u2191" : f.direction === "down" ? "\u2193" : "";
                const foldLabel = (f: UnifiedFinding) => f.max_fold_change != null
                  ? `${arrow(f)}${f.direction === "down" ? "" : "\u00d7"}${f.max_fold_change.toFixed(1)}`
                  : arrow(f);
                const strongLabel = woeSynthesis.labStrongCount > 0
                  ? `${woeSynthesis.labStrongCount} strong, ${woeSynthesis.labTotalCount} total`
                  : `${woeSynthesis.labTotalCount} total`;
                return (
                  <div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Lab correlates ({strongLabel}){" "}
                        {relevantLabFindings.length > 3 && (
                          <button className="text-primary hover:underline" onClick={() => setLabExpanded(p => !p)}>
                            {labExpanded ? "hide" : "show all"}
                          </button>
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        {top3.map(f => `${f.test_code} ${foldLabel(f)}`).join(", ")}
                      </span>
                    </div>
                    {labExpanded && (
                      <div className="mt-1.5 border-t border-border/30 pt-1.5">
                        <LabFindingsInline findings={relevantLabFindings} />
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Finding nature — full breakdown + TR-filtered reversibility */}
              {woeSynthesis.natureCounts.size > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Finding nature</span>
                  <span className="text-muted-foreground">
                    {[...woeSynthesis.natureCounts.entries()]
                      .sort((a, b) => b[1] - a[1])
                      .map(([nature, count]) => count === woeSynthesis.total ? nature : `${count} ${nature}`)
                      .join(", ")}
                    {/* Show reversibility only when no recovery data (R1 Finding 2.2) */}
                    {recoveryAssessments.length === 0 && woeSynthesis.irreversibleCount > 0 && (
                      ` (${[...woeSynthesis.irreversibleByNature.entries()].map(([n, c]) => `${c} irreversible ${n}`).join(", ")})`
                    )}
                  </span>
                </div>
              )}

              {/* Laterality summary */}
              {woeSynthesis.bilateralRatio != null && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Laterality</span>
                  <span className="text-muted-foreground">{Math.round(woeSynthesis.bilateralRatio * 100)}% bilateral</span>
                </div>
              )}

              {/* Significance */}
              {woeSynthesis.sigCount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Significance</span>
                  <span className="text-muted-foreground">
                    {woeSynthesis.sigCount}/{woeSynthesis.total} pairwise{woeSynthesis.trendSigCount > 0 ? `, ${woeSynthesis.trendSigCount} trend` : ""}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CollapsiblePane>
      )}

      {/* Peer comparison (HCD) */}
      {peerRows.length > 0 && (
        <CollapsiblePane title="Peer comparison (HCD)" defaultOpen={false} sessionKey="pcc.specimen.hcd" expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Control group incidence vs historical control data (HCD).
              </p>
              <div className="relative group shrink-0">
                <Info className="w-3 h-3 text-muted-foreground/40 cursor-help" />
                <div className="pointer-events-none absolute right-0 top-5 z-50 hidden w-[320px] rounded border bg-popover p-2.5 text-[11px] leading-relaxed text-popover-foreground shadow-md group-hover:block">
                  <p className="font-medium">Historical control data (HCD)</p>
                  <p className="mt-1 text-muted-foreground">Charles River Crl:CD(SD) published reference ranges — 34 control groups, 4–26 weeks, oral and parenteral routes. Context-aware 4-tier matching by strain, sex, study duration, and route.</p>
                  <p className="mt-1.5 font-medium">Limitations</p>
                  <ul className="mt-0.5 list-disc pl-3.5 text-muted-foreground">
                    <li>Limited to Sprague-Dawley rats — other strains/species use general fallback ranges</li>
                    <li>Seed dataset covers common findings only — rare lesions may lack HCD</li>
                    <li>Ranges reflect published aggregates, not facility-specific data</li>
                    <li>In production, replaced by a real HCD database query</li>
                  </ul>
                </div>
              </div>
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-0.5 text-left text-[11px] font-semibold uppercase tracking-wider">Finding</th>
                  <th className="pb-0.5 text-right text-[11px] font-semibold uppercase tracking-wider">Study ctrl</th>
                  <th className="pb-0.5 text-right text-[11px] font-semibold uppercase tracking-wider">HCD range</th>
                  <th className="pb-0.5 text-right text-[11px] font-semibold uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {peerRows.map(row => (
                  <tr key={row.finding} className="border-b border-dashed">
                    <td className="max-w-[120px] truncate py-1 text-xs font-medium" title={row.finding}>{row.finding}</td>
                    <td className="py-1 text-right font-mono text-muted-foreground">{Math.round(row.controlIncidence * 100)}%</td>
                    <td className="py-1 text-right text-muted-foreground">
                      {row.hcd && (
                        <span className="font-mono">{Math.round(row.hcd.min_incidence * 100)}{"\u2013"}{Math.round(row.hcd.max_incidence * 100)}%</span>
                      )}
                    </td>
                    <td className="py-1 text-right">
                      <span className={cn(
                        "text-[10px]",
                        row.status === "above_range" ? "font-medium text-foreground"
                          : row.status === "at_upper" ? "text-muted-foreground"
                          : "text-muted-foreground/60",
                      )}>
                        {row.status === "above_range" && "\u25B2 "}
                        {HCD_STATUS_LABELS[row.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsiblePane>
      )}

      {/* Laterality */}
      {lateralityData && (
        <CollapsiblePane title="Laterality" defaultOpen={false} sessionKey="pcc.specimen.laterality" expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-1.5 text-xs">
            <p className="text-muted-foreground">
              {lateralitySummary(lateralityData.subjectAgg)}
            </p>
            {lateralityData.perFinding.length > 0 && (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-0.5 text-left font-semibold">Finding</th>
                    <th className="pb-0.5 text-right font-semibold">L</th>
                    <th className="pb-0.5 text-right font-semibold">R</th>
                    <th className="pb-0.5 text-right font-semibold">Bi</th>
                  </tr>
                </thead>
                <tbody>
                  {lateralityData.perFinding.map(({ finding, agg }) => (
                    <tr key={finding} className="border-b border-dashed">
                      <td className="max-w-[120px] truncate py-0.5" title={finding}>{finding}</td>
                      <td className="py-0.5 text-right font-mono text-muted-foreground">{agg.left}</td>
                      <td className="py-0.5 text-right font-mono text-muted-foreground">{agg.right}</td>
                      <td className="py-0.5 text-right font-mono text-muted-foreground">{agg.bilateral}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CollapsiblePane>
      )}

      {/* Pathology review */}
      {studyId && (
        <PathologyReviewForm studyId={studyId} finding={`specimen:${specimen}`} />
      )}

    </div>
  );
}

/** Pathologist notes from CO domain, grouped by text with subject links. */
function PathologistNotes({ finding, studyId, navigate }: {
  finding: UnifiedFinding;
  studyId: string | undefined;
  navigate: (to: string) => void;
}) {
  if (!finding.comments || finding.comments.length === 0) return null;

  const grouped = new Map<string, Set<string>>();
  for (const c of finding.comments) {
    if (!c) continue;
    const text = typeof c === "string" ? c : c.text;
    const subj = typeof c === "string" ? "" : (c.subject_id ?? "");
    if (!text) continue;
    const existing = grouped.get(text);
    if (existing) {
      if (subj) existing.add(subj);
    } else {
      grouped.set(text, subj ? new Set([subj]) : new Set());
    }
  }
  if (grouped.size === 0) return null;

  // Total unique subjects across all comment texts
  const allSubjects = new Set<string>();
  for (const subjects of grouped.values()) {
    for (const s of subjects) allSubjects.add(s);
  }

  return (
    <div className="border-t px-4 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Pathologist Notes</div>
      <ul className="space-y-1">
        {[...grouped.entries()].map(([text, subjects], i) => {
          const subjectArr = [...subjects];
          return (
            <li key={i} className="text-xs leading-snug">
              <span className="text-muted-foreground italic">{text}</span>
              {allSubjects.size > 1 && <span className="text-muted-foreground/60"> ({subjects.size}/{allSubjects.size})</span>}
              {subjectArr.length > 0 && (
                <button
                  className="ml-1.5 text-primary hover:underline text-[10px] not-italic"
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/studies/${studyId}/cohort?subjects=${encodeURIComponent(subjectArr.join(","))}&preset=all`);
                  }}
                >
                  See subjects
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FindingsContextPanel() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const { selectedFindingId, selectedFinding: rawSelectedFinding, selectFinding, endpointSexes, selectedGroupType, selectedGroupKey, selectGroup } = useFindingSelection();
  const { analytics, data: findingsData, activeFindings } = useFindingsAnalyticsResult();

  // Use the filtered finding (with recovery pooling / scheduled-only stats swapped)
  // instead of the raw selection context finding which has original pooled stats.
  const selectedFinding = useMemo(() => {
    if (!rawSelectedFinding || !activeFindings.length) return rawSelectedFinding;
    return activeFindings.find(f => f.id === rawSelectedFinding.id) ?? rawSelectedFinding;
  }, [rawSelectedFinding, activeFindings]);
  const { data: context, isLoading } = useFindingContext(
    studyId,
    selectedFindingId
  );
  const { data: noaelRows } = useEffectiveNoael(studyId);
  // distributionPaneRef removed — DistributionPane moved to center panel
  const { data: toxAnnotations } = useAnnotations<ToxFinding>(studyId, "tox-findings");
  const { data: causalAnnotations } = useAnnotations<CausalAssessment>(studyId, "causal-assessment");
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // ── Navigation history (D1) ──
  type FindingsNavEntry = { type: "finding"; id: string } | { type: "organ" | "syndrome" | "specimen"; key: string };
  const currentNavEntry = useMemo((): FindingsNavEntry | null => {
    if (selectedFindingId) return { type: "finding", id: selectedFindingId };
    if (selectedGroupType && selectedGroupKey) return { type: selectedGroupType as "organ" | "syndrome" | "specimen", key: selectedGroupKey };
    return null;
  }, [selectedFindingId, selectedGroupType, selectedGroupKey]);

  const handleNavTo = useCallback((entry: FindingsNavEntry) => {
    if (entry.type === "finding") {
      const f = activeFindings.find(af => af.id === entry.id);
      if (f) selectFinding(f);
    } else {
      selectGroup(entry.type, entry.key);
    }
  }, [activeFindings, selectFinding, selectGroup]);

  const { canGoBack, canGoForward, goBack, goForward } = usePaneHistory(
    currentNavEntry,
    handleNavTo,
    (e) => `${e.type}:${"id" in e ? e.id : e.key}`,
  );
  const nav = { canGoBack, canGoForward, onBack: goBack, onForward: goForward };
  const { useScheduledOnly: isScheduledOnly, hasEarlyDeaths } = useScheduledOnly();
  const { data: studyMeta } = useStudyMetadata(studyId ?? "");
  const hasRecovery = studyMeta?.dose_groups?.some((dg) => dg.recovery_armcd) ?? false;
  const { data: recoveryCompData } = useRecoveryComparison(studyId);
  const { effectSize } = useStatMethods(studyId);
  const normalization = useOrganWeightNormalization(studyId, true, effectSize);
  const { data: foodConsumptionSummary } = useFoodConsumptionSummary(studyId);

  // Rule results + signal summary for CausalityWorksheet & InsightsList
  const { data: ruleResultsData } = useRuleResults(studyId);
  const { data: signalSummaryData } = useStudySignalSummary(studyId);
  const ruleResults = ruleResultsData ?? [];
  const signalSummary = signalSummaryData ?? [];

  // Signal row for the selected finding — used by ToxFindingForm system suggestion
  const selectedSignalRow = useMemo(() => {
    if (!selectedFinding) return null;
    const label = selectedFinding.endpoint_label ?? selectedFinding.finding;
    return signalSummary.find((r) => r.endpoint_label === label && r.sex === selectedFinding.sex) ?? null;
  }, [selectedFinding, signalSummary]);

  // InsightsList: filter by organ system + domain prefix (dual filter from D-R panel)
  // Lab correlates (any finding with a specimen — MI/MA, OM, etc.)
  const isHistoFinding = selectedFinding?.domain === "MI" || selectedFinding?.domain === "MA";
  const hasSpecimen = !!selectedFinding?.specimen;
  const relevantLabFindingsForEndpoint = useMemo(() => {
    if (!hasSpecimen || !selectedFinding?.specimen) return [];
    const tests = new Set(getRelevantTests(selectedFinding.specimen, selectedFinding.finding).map(t => t.toUpperCase()));
    if (tests.size === 0) return [];
    return activeFindings
      .filter(f => f.domain === "LB" && tests.has(f.test_code.toUpperCase()))
      .reduce((acc, f) => {
        const existing = acc.find(e => e.test_code.toUpperCase() === f.test_code.toUpperCase());
        if (!existing) { acc.push(f); }
        else if (f.severity === "adverse" && existing.severity !== "adverse") {
          acc[acc.indexOf(existing)] = f;
        }
        return acc;
      }, [] as UnifiedFinding[])
      .sort((a, b) => {
        if (a.treatment_related !== b.treatment_related) return a.treatment_related ? -1 : 1;
        return Math.abs(b.max_effect_size ?? 0) - Math.abs(a.max_effect_size ?? 0);
      });
  }, [activeFindings, selectedFinding, hasSpecimen]);

  // Peer comparison / HCD (MI/MA findings — control incidence vs historical controls)
  const peerRow = useMemo(() => {
    if (!isHistoFinding || !selectedFinding?.specimen || !selectedFinding?.finding) return null;
    const controlGs = selectedFinding.group_stats.find(gs => gs.dose_level === 0);
    if (!controlGs) return null;
    const controlInc = controlGs.incidence ?? (controlGs.n > 0 ? (controlGs.affected ?? 0) / controlGs.n : 0);
    const organName = selectedFinding.specimen.toLowerCase().replace(/_/g, " ");
    const hcd = getHistoricalControl(selectedFinding.finding, organName);
    const status: HCDStatus = hcd ? classifyVsHCD(controlInc, hcd) : "no_data";
    return { finding: selectedFinding.finding, controlIncidence: controlInc, hcd, status };
  }, [isHistoFinding, selectedFinding]);

  // Correlating evidence — other MI/MA findings in the same specimen + cross-organ matches
  const correlatingEvidence = useMemo(() => {
    if (!isHistoFinding || !selectedFinding?.specimen || !selectedFinding?.finding) return null;
    const specimen = selectedFinding.specimen;
    const finding = selectedFinding.finding;

    // In this specimen: other findings
    const sameSpecimen = activeFindings
      .filter(f => f.specimen === specimen && (f.domain === "MI" || f.domain === "MA") && f.finding !== finding)
      .reduce((acc, f) => {
        if (!acc.has(f.finding)) {
          const maxInc = Math.max(...f.group_stats.filter(gs => gs.dose_level > 0).map(gs => gs.incidence ?? 0), 0);
          acc.set(f.finding, { maxIncidence: maxInc, domain: f.domain });
        }
        return acc;
      }, new Map<string, { maxIncidence: number; domain: string }>());

    const inThisSpecimen = [...sameSpecimen.entries()]
      .sort((a, b) => b[1].maxIncidence - a[1].maxIncidence)
      .slice(0, 10);

    // Cross-organ: same finding in other specimens
    const findingLower = finding.toLowerCase();
    const otherSpecimens = activeFindings
      .filter(f => f.finding.toLowerCase() === findingLower && f.specimen !== specimen && f.specimen != null && (f.domain === "MI" || f.domain === "MA"))
      .reduce((acc, f) => {
        const spec = f.specimen!;
        if (!acc.has(spec)) {
          const maxInc = Math.max(...f.group_stats.filter(gs => gs.dose_level > 0).map(gs => gs.incidence ?? 0), 0);
          acc.set(spec, { maxIncidence: maxInc });
        }
        return acc;
      }, new Map<string, { maxIncidence: number }>());

    const crossOrgan = [...otherSpecimens.entries()]
      .sort((a, b) => b[1].maxIncidence - a[1].maxIncidence)
      .slice(0, 8);

    return { inThisSpecimen, crossOrgan };
  }, [isHistoFinding, selectedFinding, activeFindings]);

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
  const noael = useMemo(() => {
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
  }, [activeStatistics, noaelRows, selectedFinding?.sex]);

  // Syndromes that include the currently selected endpoint
  const endpointSyndromes = useMemo(() => {
    if (!selectedFinding) return [];
    const label = selectedFinding.endpoint_label ?? selectedFinding.finding;
    return analytics.syndromes.filter((syn) =>
      syn.matchedEndpoints.some((m) => m.endpoint_label === label)
    );
  }, [analytics.syndromes, selectedFinding]);

  // Organ coherence for the selected endpoint's organ system
  const organCoh = selectedFinding?.organ_system
    ? analytics.organCoherence.get(selectedFinding.organ_system)
    : undefined;
  // Look up ECI integrated confidence for the selected endpoint
  const eciConfidence = useMemo(() => {
    if (!selectedFinding || !analytics) return null;
    const label = selectedFinding.endpoint_label ?? selectedFinding.finding;
    const ep = analytics.endpoints.find((e) => e.endpoint_label === label);
    return ep?.endpointConfidence?.integrated.integrated ?? null;
  }, [selectedFinding, analytics]);

  // Full ECI result for NOAEL weight display in verdict
  const endpointConfidenceResult = useMemo(() => {
    if (!selectedFinding || !analytics) return null;
    const label = selectedFinding.endpoint_label ?? selectedFinding.finding;
    const ep = analytics.endpoints.find((e) => e.endpoint_label === label);
    return ep?.endpointConfidence ?? null;
  }, [selectedFinding, analytics]);

  // Build CausalitySummary for the CausalityWorksheet from UnifiedFinding + analytics
  const causalitySummary = useMemo((): CausalitySummary | null => {
    if (!selectedFinding) return null;
    const label = selectedFinding.endpoint_label ?? selectedFinding.finding;
    const ep = analytics.endpoints.find(e => e.endpoint_label === label);
    const sexes = ep?.bySex ? [...ep.bySex.keys()].sort() : [selectedFinding.sex];
    return {
      endpoint_label: label,
      organ_system: selectedFinding.organ_system ?? "",
      domain: selectedFinding.domain,
      data_type: selectedFinding.data_type === "incidence" ? "categorical" : "continuous",
      dose_response_pattern: selectedFinding.dose_response_pattern,
      min_trend_p: selectedFinding.trend_p,
      max_effect_size: selectedFinding.max_effect_size,
      min_p_value: selectedFinding.min_p_adj,
      sexes,
    };
  }, [selectedFinding, analytics.endpoints]);

  // ── Sex selector state (Phase B7) ──
  // Default to sex with larger |effect|; fallback to selected finding's sex
  const hasSibling = context?.sibling != null;
  const siblingContext = context?.sibling;

  // Per-sex CausalitySummary map for CausalityWorksheet per-sex breakdown (GAP-80)
  const perSexSummaries = useMemo((): Record<string, CausalitySummary> | undefined => {
    if (!causalitySummary || !selectedFinding || !hasSibling || !siblingContext) return undefined;
    const sibFinding = findingsData?.findings.find(f => f.id === siblingContext.finding_id);
    if (!sibFinding) return undefined;
    const base = { ...causalitySummary };
    return {
      [selectedFinding.sex]: {
        ...base,
        dose_response_pattern: selectedFinding.dose_response_pattern,
        min_trend_p: selectedFinding.trend_p,
        max_effect_size: selectedFinding.max_effect_size,
        min_p_value: selectedFinding.min_p_adj,
        sexes: [selectedFinding.sex],
      },
      [sibFinding.sex]: {
        ...base,
        dose_response_pattern: sibFinding.dose_response_pattern,
        min_trend_p: sibFinding.trend_p,
        max_effect_size: sibFinding.max_effect_size,
        min_p_value: sibFinding.min_p_adj,
        sexes: [sibFinding.sex],
      },
    };
  }, [causalitySummary, selectedFinding, hasSibling, siblingContext, findingsData]);

  // ── Early returns (after all hooks) ──

  // Priority 1: Endpoint selected → endpoint-level panel
  // Priority 2: Group selected → group-level panel
  // Priority 3: Nothing → empty state

  if (!selectedFindingId || !selectedFinding) {
    // Check for group selection (Priority 2)
    // Wrap in provider so child panels can access analytics via useFindingsAnalytics()
    if (selectedGroupType === "organ" && selectedGroupKey) {
      return <OrganContextPanel organKey={selectedGroupKey} nav={nav} />;
    }
    if (selectedGroupType === "syndrome" && selectedGroupKey) {
      return <SyndromeContextPanel syndromeId={selectedGroupKey} nav={nav} />;
    }
    if (selectedGroupType === "specimen" && selectedGroupKey) {
      return (
        <SpecimenContextPanelInline
          studyId={studyId}
          specimen={selectedGroupKey}
          activeFindings={activeFindings}
          analytics={analytics}
          nav={nav}
        />
      );
    }

    // Priority 3: no selection → NOAEL determination + study-level panes
    return (
      <NoaelStudyLevelPanel
        studyId={studyId}
        activeFindings={activeFindings}
        noaelRows={noaelRows}
        expandAll={expandAll}
        collapseAll={collapseAll}
        expandGen={expandGen}
        collapseGen={collapseGen}
        nav={nav}
      />
    );
  }

  // Progressive rendering: show header + independent panes immediately,
  // skeleton for context-dependent panes while useFindingContext loads.
  const contextReady = !isLoading && context != null;


  const notEvaluated = toxAnnotations && selectedFinding
    ? toxAnnotations[selectedFinding.endpoint_label ?? selectedFinding.finding]?.treatmentRelated === "Not Evaluated"
    : false;

  return (
    <div>
      {/* Sticky header — renders immediately from cached finding */}
      <ContextPanelHeader
        title={<>{selectedFinding.finding} <span className="text-[11px] font-medium text-muted-foreground">{selectedFinding.domain}</span></>}
        subtitle={
          (selectedFinding.modifier_profile?.dominant_temporality || selectedFinding.modifier_profile?.dominant_distribution || (selectedFinding.modifier_profile?.laterality && Object.keys(selectedFinding.modifier_profile.laterality).length > 0)) ? (
            <>
              {selectedFinding.modifier_profile?.dominant_temporality}
              {selectedFinding.modifier_profile?.dominant_distribution && (
                <>{selectedFinding.modifier_profile.dominant_temporality ? " · " : ""}{selectedFinding.modifier_profile.dominant_distribution}</>
              )}
              {selectedFinding.modifier_profile?.laterality && Object.keys(selectedFinding.modifier_profile.laterality).length > 0 && (
                <>{(selectedFinding.modifier_profile.dominant_temporality || selectedFinding.modifier_profile.dominant_distribution) ? " · " : ""}{Object.entries(selectedFinding.modifier_profile.laterality).sort((a, b) => b[1] - a[1]).map(([k]) => k).join(", ")}</>
              )}
            </>
          ) : undefined
        }
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        canGoBack={nav.canGoBack}
        canGoForward={nav.canGoForward}
        onBack={nav.onBack}
        onForward={nav.onForward}
      >
        {/* Incremental info: pattern badge + assessment status + NOAEL */}
        {/* Pattern badge and NOAEL suppressed when sibling exists — they're sex-specific
            and would contradict the combined VerdictPane synthesis (e.g., header shows
            "threshold decrease, NOAEL 20 mg/kg" for M while verdict shows "opposite direction,
            NOAEL 2 mg/kg combined"). VerdictPane handles cross-sex rendering correctly. */}
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
          {!hasSibling && selectedFinding.dose_response_pattern && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 border border-gray-200">
              {getPatternLabel(selectedFinding.dose_response_pattern)}
            </span>
          )}
          {selectedFinding.severity && selectedFinding.severity !== "normal" && selectedFinding.severity !== "not_assessed" && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 border border-gray-200 capitalize">
              {selectedFinding.severity}
            </span>
          )}
          {/* LOO fragility / small-N badge — shown when LOO is fragile OR when group size is too small for LOO to be reliable */}
          {(() => {
            const sibF = hasSibling && siblingContext
              ? findingsData?.findings.find(f => f.id === siblingContext.finding_id)
              : undefined;
            const priLoo = selectedFinding.loo_stability;
            const sibLoo = sibF?.loo_stability;
            const priFrag = priLoo != null && priLoo < LOO_THRESHOLD;
            const sibFrag = sibLoo != null && sibLoo < LOO_THRESHOLD;
            // Compute min treated-group N for small-N qualifier
            const priTreated = selectedFinding.group_stats.filter(g => g.dose_level > 0);
            const priMinN = priTreated.length > 0 ? Math.min(...priTreated.map(g => g.n)) : null;
            const sibTreated = sibF?.group_stats.filter(g => g.dose_level > 0);
            const sibMinN = sibTreated && sibTreated.length > 0 ? Math.min(...sibTreated.map(g => g.n)) : null;
            const priSmallN = priMinN != null && priMinN < LOO_SMALL_N_THRESHOLD;
            const sibSmallN = sibMinN != null && sibMinN < LOO_SMALL_N_THRESHOLD;
            const anySmallN = priSmallN || sibSmallN;
            const smallestN = [priMinN, sibMinN].filter((n): n is number => n != null && n < LOO_SMALL_N_THRESHOLD);
            const minN = smallestN.length > 0 ? Math.min(...smallestN) : null;
            // Show badge if fragile OR if LOO exists but N is too small for reliability
            const hasLoo = priLoo != null || sibLoo != null;
            if (!priFrag && !sibFrag && !anySmallN) return null;
            if (!hasLoo) return null;
            const priSex = selectedFinding.sex;
            const sibSex = sibF?.sex;
            const priCtrl = selectedFinding.loo_control_fragile === true;
            const sibCtrl = sibF?.loo_control_fragile === true;
            const anyCtrl = (priFrag && priCtrl) || (sibFrag && sibCtrl);
            const anyFrag = priFrag || sibFrag;
            const sexLabel = priFrag && sibFrag
              ? `${[priSex, sibSex].sort().join("+")}`
              : priFrag ? priSex : sibSex;
            const details = [
              priFrag ? `${priSex} ${(priLoo! * 100).toFixed(0)}%` : null,
              sibFrag ? `${sibSex} ${(sibLoo! * 100).toFixed(0)}%` : null,
            ].filter(Boolean).join(", ");
            // Build badge label
            let badgeLabel: string;
            if (anyFrag && anySmallN) {
              badgeLabel = `LOO: fragile, N=${minN} (${anyCtrl ? `ctrl, ${sexLabel}` : sexLabel})`;
            } else if (anyFrag) {
              badgeLabel = `LOO: fragile (${anyCtrl ? `ctrl, ${sexLabel}` : sexLabel})`;
            } else {
              // LOO >= 0.8 but N < 10 — stability value is unreliable
              badgeLabel = `LOO: N=${minN} (low power)`;
            }
            // Build tooltip
            let badgeTitle: string;
            if (anyFrag) {
              badgeTitle = `LOO stability: ${details}${anyCtrl
                ? " -- control-side dominant: signal may be driven by an unusual control animal rather than treatment effect."
                : " -- removing the most influential animal reduces the confident effect size to that fraction of its full value."
              } Below 80% = fragile.`;
            } else {
              badgeTitle = "LOO stability appears adequate, but ";
            }
            if (anySmallN) {
              badgeTitle += ` N=${minN}: at this sample size, LOO has low detection power for outliers. A high LOO value may reflect masking (degrees-of-freedom collapse), not genuine stability. Prefer HCD context.`;
            }
            return (
              <span
                className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 border border-gray-200"
                title={badgeTitle}
              >
                {badgeLabel}
              </span>
            );
          })()}
          {/* Pharmacological candidate badge (D9 fired) */}
          {selectedFinding._confidence?._pharmacological_candidate && (
            <>
              <PharmacologicalBadge
                rationale={selectedFinding._confidence.dimensions?.find(d => d.dimension === "D9")?.rationale}
              />
              {/* C3: Translation gap warning when D9 matched entry has known preclinical-to-clinical disconnect */}
              {(() => {
                const d9 = selectedFinding._confidence?.dimensions?.find(d => d.dimension === "D9");
                const tg = (d9 as Record<string, unknown> | undefined)?.translation_gap;
                if (!tg || typeof tg !== "string") return null;
                return (
                  <div className="mt-1 bg-amber-50 border-l-2 border-amber-400 px-2 py-1 text-[10px]">
                    <span className="font-semibold text-amber-700">Translation gap: </span>
                    <span className="text-amber-600">{tg}</span>
                  </div>
                );
              })()}
            </>
          )}
          {/* Clinical tier badge (S2+ only, matching rail) */}
          {(() => {
            if (!analytics?.labMatches.length) return null;
            const epLabel = selectedFinding.endpoint_label ?? selectedFinding.finding;
            const sevOrder: Record<string, number> = { S4: 4, S3: 3, S2: 2, S1: 1 };
            let worstTier: string | null = null;
            let worstLabel: string | null = null;
            for (const m of analytics.labMatches) {
              if ((sevOrder[m.severity] ?? 0) < 2) continue;
              if (!m.matchedEndpoints.some(e => e.toUpperCase() === epLabel.toUpperCase())) continue;
              if (!worstTier || (sevOrder[m.severity] ?? 0) > (sevOrder[worstTier] ?? 0)) {
                worstTier = m.severity;
                worstLabel = m.severityLabel;
              }
            }
            if (!worstTier) return null;
            return (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 border border-gray-200">
                {worstTier} {worstLabel}
              </span>
            );
          })()}
          {eciConfidence && (
            <span
              className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 border border-gray-200"
              title="Endpoint confidence — how reliably this endpoint's data supports NOAEL determination. Based on statistical strength, biological plausibility, dose-response quality, and trend test validity."
            >
              NOAEL: {eciConfidence === "high" ? "Determining" : eciConfidence === "moderate" ? "Contributing" : "Supporting"}
            </span>
          )}
          {(() => {
            const endpointKey = selectedFinding.endpoint_label ?? selectedFinding.finding;
            const tox = toxAnnotations?.[endpointKey];
            if (!tox) return null;
            const status = tox.treatmentRelated === "Not Evaluated"
              ? "Not evaluated"
              : tox.treatmentRelated === "Yes"
                ? "Treatment-related"
                : tox.treatmentRelated === "No"
                  ? "Not treatment-related"
                  : tox.treatmentRelated === "Equivocal"
                    ? "Equivocal"
                    : null;
            if (!status) return null;
            // Show provenance: "Expert override" when backend has_tox_override is set
            const isOverride = selectedFinding.has_tox_override;
            return (
              <span
                className={`rounded px-1.5 py-0.5 border ${
                  isOverride
                    ? "bg-violet-100/50 text-violet-700 border-violet-200"
                    : "bg-gray-100 text-gray-600 border-gray-200"
                }`}
                title={isOverride
                  ? `Expert override -- algorithm: ${selectedFinding.treatment_related ? "TR" : "Not TR"}`
                  : "Expert tox assessment (not yet applied to pipeline)"}
              >
                {status}{isOverride ? " (expert)" : ""}
              </span>
            );
          })()}
          {!hasSibling && noael && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 border border-gray-200">
              NOAEL: {noael.dose_value != null
                ? `${noael.dose_value} ${noael.dose_unit}`
                : `< lowest dose`}
            </span>
          )}
          {/* BW >10% regulatory threshold badge */}
          {selectedFinding.domain === "BW" && (() => {
            const gs = selectedFinding.group_stats;
            if (!gs || gs.length < 2) return null;
            const control = gs[0];
            const highest = gs[gs.length - 1];
            if (control.mean == null || highest.mean == null || control.mean === 0) return null;
            const pct = Math.abs(((highest.mean - control.mean) / Math.abs(control.mean)) * 100);
            if (pct <= 10) return null;
            return (
              <span
                className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600 border border-gray-200"
                title={`Body weight change of ${pct.toFixed(1)}% exceeds the 10% regulatory threshold`}
              >
                BW &gt;10%
              </span>
            );
          })()}
        </div>
      </ContextPanelHeader>

      {/* Context-dependent panes: Verdict + Evidence need useFindingContext */}
      {contextReady ? (
        <>
          {/* Summary */}
          <CollapsiblePane
            title="Summary"
            defaultOpen
            sessionKey="pcc.ep.summary"
            expandAll={expandGen}
          >
            <VerdictPane
              finding={selectedFinding}
              siblingFinding={hasSibling && siblingContext ? findingsData?.findings.find(f => f.id === siblingContext.finding_id) : undefined}
              analytics={analytics}
              noael={noael}
              doseResponse={context!.dose_response}
              statistics={activeStatistics!}
              siblingStatistics={hasSibling && siblingContext ? siblingContext.statistics : undefined}
              siblingDoseResponse={hasSibling && siblingContext ? siblingContext.dose_response : undefined}
              treatmentSummary={context!.treatment_summary}
              endpointSexes={endpointSexes}
              notEvaluated={notEvaluated}
              eciConfidence={eciConfidence}
              endpointConfidence={endpointConfidenceResult}
              hasSibling={hasSibling}
            />
            <PathologistNotes finding={selectedFinding} studyId={studyId} navigate={navigate} />
            {context!.sibling && (() => {
              const sibFinding = findingsData?.findings.find(f => f.id === siblingContext!.finding_id);
              // Compute recovery verdicts using the same engine as the findings table
              let primaryRecLabel: string | undefined;
              let siblingRecLabel: string | undefined;
              if (hasRecovery && recoveryCompData?.available) {
                const findings = [selectedFinding, ...(sibFinding ? [sibFinding] : [])];
                const verdictMap = buildFindingVerdictMap(findings, recoveryCompData, undefined);
                const pv = verdictMap.get(selectedFinding.id);
                if (pv) primaryRecLabel = getVerdictLabel(pv.effectiveVerdict) + (pv.lowConfidence ? " *" : "");
                if (sibFinding) {
                  const sv = verdictMap.get(sibFinding.id);
                  if (sv) siblingRecLabel = getVerdictLabel(sv.effectiveVerdict) + (sv.lowConfidence ? " *" : "");
                }
              }
              return (
                <SexComparisonPane
                  finding={selectedFinding}
                  siblingFinding={sibFinding}
                  analytics={analytics}
                  doseGroups={findingsData?.dose_groups}
                  primaryRecoveryLabel={primaryRecLabel}
                  siblingRecoveryLabel={siblingRecLabel}
                />
              );
            })()}
            {/* Opposite-direction callout: when sexes disagree on direction AND ANCOVA
                resolves whether the effect is direct, surface this prominently */}
            {(() => {
              if (!hasSibling || !siblingContext) return null;
              const sibFinding = findingsData?.findings.find(f => f.id === siblingContext.finding_id);
              if (!sibFinding) return null;
              const priDir = selectedFinding.direction;
              const sibDir = sibFinding.direction;
              const isOpposite = (priDir === "up" && sibDir === "down") || (priDir === "down" && sibDir === "up");
              if (!isOpposite) return null;

              const priAncova = selectedFinding.ancova;
              const sibAncova = sibFinding.ancova;
              const hasAnyAncova = priAncova != null || sibAncova != null;

              // Compute % direct for each sex where ANCOVA is available
              const directPcts: { sex: string; pct: number }[] = [];
              for (const [sex, anc] of [[selectedFinding.sex, priAncova], [sibFinding.sex, sibAncova]] as const) {
                if (!anc?.effect_decomposition?.length) continue;
                // Use the highest dose group (last entry) for the summary
                const highDose = anc.effect_decomposition[anc.effect_decomposition.length - 1];
                if (highDose) {
                  directPcts.push({ sex: sex as string, pct: highDose.proportion_direct * 100 });
                }
              }
              const allAbove95 = directPcts.length >= 2 && directPcts.every(d => d.pct > 95);
              const allAbove80 = directPcts.length >= 2 && directPcts.every(d => d.pct > 80);

              return (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50/50 p-2 text-[11px]">
                  <div className="font-semibold text-amber-800">
                    Opposite-direction effect between sexes
                  </div>
                  <div className="mt-0.5 text-amber-700">
                    {selectedFinding.sex} {priDir === "up" ? "\u2191" : "\u2193"}
                    {" / "}
                    {sibFinding.sex} {sibDir === "up" ? "\u2191" : "\u2193"}
                    {" \u2014 "}
                    {hasAnyAncova
                      ? allAbove95
                        ? "ANCOVA confirms direct effect in both sexes (>95% direct)"
                        : allAbove80
                          ? `ANCOVA: ${directPcts.map(d => `${d.sex} ${d.pct.toFixed(0)}% direct`).join(", ")}`
                          : "ANCOVA available — check decomposition for BW confounding"
                      : "No ANCOVA available. Consider BW confounding as a possible explanation."}
                  </div>
                </div>
              );
            })()}
          </CollapsiblePane>

          {/* Time course */}
          {selectedFinding && (selectedFinding.data_type === "continuous" || selectedFinding.domain === "CL") && (
            <TimeCoursePane
              finding={selectedFinding}
              doseGroups={findingsData?.dose_groups}
              expandAll={expandGen}
              collapseAll={collapseGen}
            />
          )}

          {/* Food consumption — BW/FW endpoint mechanistic context */}
          {(selectedFinding.domain === "BW" || selectedFinding.domain === "FW") && foodConsumptionSummary?.available && foodConsumptionSummary.overall_assessment && (() => {
            const oa = foodConsumptionSummary.overall_assessment;
            const assessment: FoodConsumptionContext["bwFwAssessment"] =
              oa.assessment === "primary_weight_loss" || oa.assessment === "secondary_to_food" || oa.assessment === "malabsorption"
                ? oa.assessment
                : "not_applicable";
            if (assessment === "not_applicable") return null;
            const ctx: FoodConsumptionContext = {
              available: true,
              bwFwAssessment: assessment,
              foodEfficiencyReduced: oa.fe_reduced,
              temporalOnset: (oa.temporal_onset === "bw_first" || oa.temporal_onset === "fw_first" || oa.temporal_onset === "simultaneous" || oa.temporal_onset === "unknown")
                ? oa.temporal_onset
                : "unknown",
              fwNarrative: oa.narrative,
            };
            return (
              <CollapsiblePane
                title="Food consumption"
                defaultOpen={false}
                sessionKey="pcc.ep.food-consumption"
                headerRight={<FoodConsumptionHeaderRight assessment={assessment} />}
                expandAll={expandGen}
                collapseAll={collapseGen}
              >
                <FoodConsumptionPane
                  context={ctx}
                  rawData={foodConsumptionSummary}
                  doseGroups={findingsData?.dose_groups}
                />
              </CollapsiblePane>
            );
          })()}

          {/* Outliers — bio outliers + LOO-fragile subjects */}
          <CollapsiblePane
            title="Outliers"
            defaultOpen={false}
            sessionKey="pcc.ep.outliers"
            expandAll={expandGen}
            collapseAll={collapseGen}
          >
            <OutliersPane
              finding={selectedFinding}
              allFindings={findingsData?.findings ?? []}
              doseGroups={findingsData?.dose_groups}
            />
          </CollapsiblePane>

          {/* NOAEL pane — endpoint-level NOAEL with per-sex ECI decomposition */}
          {noael && !notEvaluated && (() => {
            const epLabel = selectedFinding.endpoint_label ?? selectedFinding.finding;
            const ep = analytics.endpoints.find(e => e.endpoint_label === epLabel);
            const noaelBySex = ep?.noaelBySex;
            // Determine sex annotation for the pane title
            const sexAnnotation = (() => {
              if (!noaelBySex || noaelBySex.size < 2) return selectedFinding.sex;
              // Both sexes — check if they agree
              const entries = [...noaelBySex.entries()].sort(([a], [b]) => a.localeCompare(b));
              const allSame = entries.every(([, n]) => n.doseValue === entries[0][1].doseValue && n.tier === entries[0][1].tier);
              if (allSame) return "F+M";
              // Different — find which sex drives the lower (more conservative) NOAEL
              const belowLowest = entries.find(([, n]) => n.tier === "below-lowest");
              if (belowLowest) return belowLowest[0];
              const withValues = entries.filter(([, n]) => n.doseValue != null);
              if (withValues.length > 0) {
                const min = withValues.reduce((best, cur) => (cur[1].doseValue! < best[1].doseValue! ? cur : best));
                return min[0];
              }
              return "F+M";
            })();
            const noaelDose = noael.dose_value != null
              ? `${noael.dose_value} ${noael.dose_unit ?? "mg/kg"}`
              : "below tested range";
            const noaelTitle = `NOAEL: ${noaelDose} (${sexAnnotation})`;
            const eciPerSex = ep?.eciPerSex;
            const sibFinding = hasSibling && siblingContext
              ? findingsData?.findings.find(f => f.id === siblingContext.finding_id)
              : undefined;
            // Map sex → finding for per-sex decomposition
            const findingBySex = new Map<string, UnifiedFinding>();
            findingBySex.set(selectedFinding.sex, selectedFinding);
            if (sibFinding) findingBySex.set(sibFinding.sex, sibFinding);
            return (
              <CollapsiblePane
                title={noaelTitle}
                defaultOpen={false}
                sessionKey="pcc.ep.noael"
                expandAll={expandGen}
                collapseAll={collapseGen}
              >
                <div className="space-y-2 text-[11px] text-muted-foreground">
                  {/* Per-sex NOAEL breakdown — always shown when both sexes exist */}
                  {noaelBySex && noaelBySex.size >= 2 && (
                    <div className="flex gap-x-4">
                      {[...noaelBySex.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sex, n]) => (
                        <span key={sex}>
                          {sex}: {n.tier === "below-lowest"
                            ? "below tested range"
                            : n.doseValue != null
                              ? `${n.doseValue} ${n.doseUnit ?? "mg/kg"}`
                              : "—"}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* ECI decomposition — per-sex when available, otherwise aggregated */}
                  {eciPerSex && eciPerSex.size >= 2 ? (
                    <div className="space-y-3">
                      {[...eciPerSex.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sex, sexEci]) => (
                        <div key={sex}>
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{sex}</div>
                          <DecomposedConfidencePane
                            eci={sexEci}
                            finding={findingBySex.get(sex) ?? selectedFinding}
                            doseGroups={findingsData?.dose_groups}
                            syndromes={endpointSyndromes}
                            organCoherence={organCoh}
                          />
                        </div>
                      ))}
                    </div>
                  ) : ep?.endpointConfidence ? (
                    <DecomposedConfidencePane eci={ep.endpointConfidence} finding={selectedFinding} doseGroups={findingsData?.dose_groups} syndromes={endpointSyndromes} organCoherence={organCoh} />
                  ) : null}

                  {/* Normalization alternatives (OM domain, BW confounding) */}
                  {selectedFinding.domain === "OM" && (() => {
                    const specimen = selectedFinding.specimen?.toUpperCase() ?? "";
                    const cat = specimen ? getOrganCorrelationCategory(specimen) : null;
                    const decision = specimen ? normalization.getDecision(specimen) : null;
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
                      <div className="mt-2 border-t border-border/30 pt-2">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Normalization alternatives (high dose vs control)
                        </div>
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-[10px] text-muted-foreground">
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
                                {isGonadal && <span className="ml-1 text-[8px] text-amber-600">(n/a)</span>}
                              </td>
                              <td className="py-0.5 text-right font-mono">{controlGs.mean_relative?.toFixed(4) ?? "\u2014"}</td>
                              <td className="py-0.5 text-right font-mono">{highestGs.mean_relative?.toFixed(4) ?? "\u2014"}</td>
                              <td className="py-0.5 text-right font-mono">
                                {controlGs.mean_relative && highestGs.mean_relative
                                  ? `${(((highestGs.mean_relative - controlGs.mean_relative) / controlGs.mean_relative) * 100).toFixed(1)}%`
                                  : "\u2014"}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                        <button
                          className="mt-1 text-[10px] text-primary hover:underline"
                          onClick={() => studyId && navigate(`/studies/${encodeURIComponent(studyId)}?tab=rules`)}
                        >
                          Analysis methods &rarr;
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </CollapsiblePane>
            );
          })()}

          {/* GRADE confidence — backend D1-D9 evidence dimensions */}
          {selectedFinding?._confidence && (
            <CollapsiblePane
              title="Evidence confidence"
              defaultOpen={false}
              sessionKey="pcc.ep.grade-confidence"
              expandAll={expandGen}
              collapseAll={collapseGen}
              badge={
                <GradeConfidenceBadge confidence={selectedFinding._confidence} />
              }
            >
              <GradeConfidencePane confidence={selectedFinding._confidence} />
            </CollapsiblePane>
          )}


        </>
      ) : (
        <div className="space-y-3 p-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {/* Independent panes — render immediately, have their own data hooks */}


      {/* Distribution — moved to center panel DoseResponseChartPanel */}


      {/* Qualifier detail — MI/MA only, full modifier breakdown */}
      {selectedFinding && (selectedFinding.domain === "MI" || selectedFinding.domain === "MA") && selectedFinding.modifier_profile && (
        <CollapsiblePane
          title="Qualifiers"
          defaultOpen={false}
          sessionKey="pcc.ep.qualifiers"
          expandAll={expandGen}
          collapseAll={collapseGen}
        >
          <QualifierDetailPane finding={selectedFinding} />
        </CollapsiblePane>
      )}

      {/* Lab correlates — any finding with a specimen (MI/MA, OM, etc.) */}
      {relevantLabFindingsForEndpoint.length > 0 && (
        <CollapsiblePane
          title="Lab correlates"
          defaultOpen={false}
          sessionKey="pcc.ep.lab-correlates"
          expandAll={expandGen}
          collapseAll={collapseGen}
        >
          <LabFindingsInline
            findings={relevantLabFindingsForEndpoint}
          />
        </CollapsiblePane>
      )}

      {/* Peer comparison / HCD — MI/MA only, control vs historical controls */}
      {isHistoFinding && peerRow && peerRow.hcd && (
        <CollapsiblePane
          title="Peer comparison (HCD)"
          defaultOpen={false}
          sessionKey="pcc.ep.peer-hcd"
          expandAll={expandGen}
          collapseAll={collapseGen}
        >
          <PeerComparisonInline row={peerRow} />
        </CollapsiblePane>
      )}

      {/* Correlating evidence — MI/MA only, same specimen + cross-organ */}
      {isHistoFinding && correlatingEvidence && (correlatingEvidence.inThisSpecimen.length > 0 || correlatingEvidence.crossOrgan.length > 0) && (
        <CollapsiblePane
          title="Correlating evidence"
          defaultOpen={false}
          sessionKey="pcc.ep.correlating-evidence"
          expandAll={expandGen}
          collapseAll={collapseGen}
        >
          <CorrelatingEvidenceInline evidence={correlatingEvidence} />
        </CollapsiblePane>
      )}

      {/* Determination panes — need useFindingContext data */}
      {contextReady ? (
      <>
      {/* Syndromes pane */}
      {endpointSyndromes.length > 0 && studyId && (
        <CollapsiblePane
          title="Syndromes"
          defaultOpen={false}
          sessionKey="pcc.ep.syndromes"
          expandAll={expandGen}
          collapseAll={collapseGen}
          headerRight={
            <span className="text-[10px] text-muted-foreground">
              {endpointSyndromes.length} syndrome{endpointSyndromes.length !== 1 ? "s" : ""}
            </span>
          }
        >
          <EndpointSyndromePane
            studyId={studyId}
            currentEndpointLabel={selectedFinding.endpoint_label ?? selectedFinding.finding}
            syndromes={endpointSyndromes}
            allSyndromeIds={analytics.syndromes.map((s) => s.id)}
            endpoints={analytics.endpoints}
            signalScores={analytics.signalScores}
            normalizationContexts={analytics.normalizationContexts}
            onViewSyndrome={(syndromeId) => selectGroup("syndrome", syndromeId)}
          />
        </CollapsiblePane>
      )}

      {/* Hide correlations pane when based on group means — useless rho=1.0 with n=4 */}
      {context!.correlations.related.length > 0
        && context!.correlations.related.some((c) => c.basis !== "group_means" && (c.n ?? 0) >= 10) && (
        <CollapsiblePane title="Correlations" defaultOpen={false} sessionKey="pcc.ep.correlations" keepMounted expandAll={expandGen} collapseAll={collapseGen}>
          <CorrelationsPane
            data={context!.correlations}
            organSystem={selectedFinding.organ_system}
            dataType={selectedFinding.data_type}
          />
        </CollapsiblePane>
      )}

      <CollapsiblePane title="Effect ranking" defaultOpen={false} sessionKey="pcc.ep.effect-ranking" keepMounted expandAll={expandGen} collapseAll={collapseGen}>
        <ContextPane
          effectSize={context!.effect_size}
          selectedFindingId={selectedFindingId}
          effectSizeMethod={effectSize}
        />
      </CollapsiblePane>

      {/* Causality assessment — Bradford Hill criteria */}
      <CollapsiblePane
        title="Causality assessment"
        defaultOpen={false}
        sessionKey="pcc.ep.causality"
        keepMounted
        expandAll={expandGen}
        collapseAll={collapseGen}
        summary={(() => {
          const key = selectedFinding.endpoint_label ?? selectedFinding.finding;
          const saved = causalAnnotations?.[key];
          if (!saved || saved.overall === "Not assessed") return undefined;
          return saved.overall;
        })()}
      >
        <CausalityWorksheet
          studyId={studyId}
          selectedEndpoint={selectedFinding.endpoint_label ?? selectedFinding.finding}
          selectedSummary={causalitySummary}
          ruleResults={ruleResults}
          signalSummary={signalSummary}
          effectSizeSymbol={getEffectSizeSymbol(effectSize)}
          perSexSummaries={perSexSummaries}
        />
      </CollapsiblePane>

      {/* Tox assessment — treatment-related / adversity determination */}
      {studyId && (
        <ToxFindingForm
          studyId={studyId}
          endpointLabel={selectedFinding.endpoint_label ?? selectedFinding.finding}
          systemSuggestion={selectedSignalRow ? deriveToxSuggestion(selectedSignalRow.treatment_related, selectedSignalRow.severity) : undefined}
        />
      )}

      {/* Pathology review — MI/MA only */}
      {isHistoFinding && studyId && (
        <PathologyReviewForm studyId={studyId} finding={selectedFinding.finding} />
      )}
      </>
      ) : null}

    </div>
  );
}

// ─── Study-level NOAEL panel (no finding/group selected) ────────────────────

function NoaelStudyLevelPanel({
  studyId,
  activeFindings,
  noaelRows,
  expandAll,
  collapseAll,
  expandGen,
  collapseGen,
  nav,
}: {
  studyId: string | undefined;
  activeFindings: UnifiedFinding[];
  noaelRows: import("@/types/analysis-views").NoaelSummaryRow[] | undefined;
  expandAll: () => void;
  collapseAll: () => void;
  expandGen: number;
  collapseGen: number;
  nav: { canGoBack: boolean; canGoForward: boolean; onBack: () => void; onForward: () => void };
}) {
  const navigate = useNavigate();
  const { data: signalData } = useStudySignalSummary(studyId);
  const { data: targetOrgans } = useTargetOrganSummary(studyId);
  const { data: pkData } = usePkIntegration(studyId);

  const aeData = useMemo(() => {
    if (!activeFindings.length) return [];
    return mapFindingsToRows(activeFindings);
  }, [activeFindings]);

  // Study statements for StudyStatementsBar
  const panelData = useMemo(() => {
    if (!signalData || !targetOrgans || !noaelRows) return null;
    return buildSignalsPanelData(noaelRows, targetOrgans, signalData);
  }, [signalData, targetOrgans, noaelRows]);

  return (
    <div>
      <ContextPanelHeader
        title="Findings"
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        canGoBack={nav.canGoBack}
        canGoForward={nav.canGoForward}
        onBack={nav.onBack}
        onForward={nav.onForward}
      />

      {/* NOAEL determination (compact) */}
      <NoaelDeterminationPane aeData={aeData} expandAll={expandGen} collapseAll={collapseGen} />

      {/* Study statements + caveats */}
      {panelData && (panelData.studyStatements.length > 0 || panelData.modifiers.length > 0 || panelData.caveats.length > 0) && (
        <CollapsiblePane title="Study statements" defaultOpen={false} sessionKey="pcc.ep.study-statements" expandAll={expandGen} collapseAll={collapseGen}>
          <StudyStatementsBar
            statements={panelData.studyStatements}
            modifiers={panelData.modifiers}
            caveats={panelData.caveats}
          />
        </CollapsiblePane>
      )}

      {/* Safety margin calculator */}
      {pkData?.available && (pkData.noael_exposure || pkData.loael_exposure) && (
        <CollapsiblePane title="Safety margin" defaultOpen={false} sessionKey="pcc.ep.safety-margin" expandAll={expandGen} collapseAll={collapseGen}>
          <SafetyMarginCalculator pkData={pkData} />
        </CollapsiblePane>
      )}

      {/* Configure rules link */}
      {studyId && (
        <div className="border-b px-4 py-2">
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => navigate(`/studies/${encodeURIComponent(studyId)}?tab=rules`)}
          >
            Configure rules &rarr;
          </button>
        </div>
      )}

      {/* Fallback guidance */}
      <div className="px-4 py-3 text-xs text-muted-foreground">
        Select a finding to view detailed analysis.
      </div>
    </div>
  );
}
