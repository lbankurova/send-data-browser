import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { TimeCoursePane } from "./TimeCoursePane";
import { EndpointSyndromePane } from "./EndpointSyndromePane";
import { NormalizationHeatmap } from "./NormalizationHeatmap";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { DoseLabel } from "@/components/ui/DoseLabel";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { getOrganCorrelationCategory, OrganCorrelationCategory } from "@/lib/organ-weight-normalization";
import { useStatMethods } from "@/hooks/useStatMethods";
import type { EndpointConfidenceResult, ConfidenceLevel } from "@/lib/endpoint-confidence";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndrome-types";
import type { DoseGroup, FindingContext, UnifiedFinding } from "@/types/analysis";
import { formatPValue, getDoseGroupColor } from "@/lib/severity-colors";
import { getPatternLabel } from "@/lib/findings-rail-engine";
import type { SexEndpointSummary, EndpointNoael } from "@/lib/derive-summaries";
import { useOrganRecovery } from "@/hooks/useOrganRecovery";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
import { useStudyContext } from "@/hooks/useStudyContext";
import { verdictLabel } from "@/lib/recovery-assessment";
import type { RecoveryVerdict } from "@/lib/recovery-assessment";

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
        <tr className="text-[9px] text-muted-foreground">
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

      {/* Punchline: plain-English ANCOVA vs raw comparison */}
      {punchline && (
        <div className="mb-1.5 text-foreground/80">
          {punchline}
        </div>
      )}

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
              <td className="py-0.5">
                <DoseLabel level={d.group} label={resolveDoseLabel(d.group)} className="text-[10px]" />
              </td>
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
            <span key={m.group} className="inline-flex items-center gap-1 font-mono">
              <DoseLabel level={m.group} label={resolveDoseLabel(m.group)} className="text-[10px]" />
              <span>{m.adjusted_mean.toFixed(2)}</span>
              <span className="text-muted-foreground">(raw {m.raw_mean.toFixed(2)})</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Decomposed Confidence Display ─────────────────────────

function confidenceLevelClass(level: ConfidenceLevel): string {
  // High = nothing to see; moderate = semibold; low = semibold + bright
  return level === "high"
    ? "text-muted-foreground"
    : level === "moderate"
      ? "font-semibold text-foreground"
      : "font-semibold text-red-600";
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
    const g = Math.abs(p.cohens_d ?? 0);
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

function BiologicalPlausibilityContent({ eci, syndromes, finding }: { eci: EndpointConfidenceResult; syndromes: CrossDomainSyndrome[]; finding: UnifiedFinding }) {
  const reason = eci.normCaveat?.reason;
  const hasSyndromes = syndromes.length > 0;
  const organ = finding.specimen ?? finding.organ_system ?? "";

  // Compute organ-level convergence (unique domains across all syndromes for this organ)
  const organDomains = useMemo(() => {
    const domains = new Set<string>();
    for (const syn of syndromes) {
      for (const m of syn.matchedEndpoints) {
        domains.add(m.domain);
      }
    }
    return [...domains].sort();
  }, [syndromes]);

  return (
    <div className="space-y-1 text-muted-foreground">
      {hasSyndromes && syndromes.map((syn) => (
        <div key={syn.id}>
          <div>Part of {syn.name} ({syn.confidence.toLowerCase()}):</div>
          <div className="pl-3 text-[9px]">
            {syn.matchedEndpoints.map((m) => m.endpoint_label).join(", ")}
          </div>
        </div>
      ))}
      {hasSyndromes && organ && organDomains.length >= 2 && (
        <div>{organDomains.length}-domain convergence in {organ}: {organDomains.join(", ")}</div>
      )}
      {!hasSyndromes && eci.integrated.biological === "high" && !reason && (
        <div>No cross-domain corroboration or normalization concerns.</div>
      )}
      {reason && <div>{reason}</div>}
    </div>
  );
}

function DoseResponseQualityContent({ eci, finding, doseGroups }: { eci: EndpointConfidenceResult; finding: UnifiedFinding; doseGroups?: DoseGroup[] }) {
  const { nonMonotonic } = eci;
  const pattern = finding.dose_response_pattern ?? "";
  const isThreshold = pattern.startsWith("threshold");
  const isFlat = pattern === "flat" || pattern === "no_pattern" || pattern === "insufficient_data";

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
      ) : eci.integrated.doseResponse === "moderate" ? (
        <>
          <div>Backend pattern classification: non_monotonic</div>
          <div>
            JT trend test assumes monotonic dose-response;
            significance may not reflect the observed pattern shape.
          </div>
          <div>Consider examining individual dose-group contrasts (Dunnett&apos;s) rather than trend for this endpoint.</div>
        </>
      ) : isFlat ? (
        <>
          <div>Flat dose-response pattern (no treatment-related trend).</div>
          <div>Statistical evidence dimension handles significance separately.</div>
        </>
      ) : isThreshold ? (
        <>
          <div>Threshold dose-response pattern</div>
          {finding.pairwise && (() => {
            const sigPw = finding.pairwise
              .filter((p) => { const pv = p.p_value_adj ?? p.p_value; return pv != null && pv <= 0.05; })
              .sort((a, b) => a.dose_level - b.dose_level);
            const onset = sigPw[0];
            return onset ? (
              <div>Effect onset at {doseLabel(onset.dose_level, doseGroups)}</div>
            ) : null;
          })()}
        </>
      ) : (
        <div>Monotonic dose-response confirmed.</div>
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
      <table className="text-[10px]">
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
      <div className="text-[9px]">{concordanceNote}</div>
      {williams && williams.step_down_results.length > 0 && (
        <div className="mt-1">
          <button
            className="text-[9px] text-blue-600 hover:underline"
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

function DecomposedConfidencePane({ eci, finding, doseGroups, syndromes }: { eci: EndpointConfidenceResult; finding: UnifiedFinding; doseGroups?: DoseGroup[]; syndromes: CrossDomainSyndrome[] }) {
  const { integrated } = eci;
  const [showDecomp, setShowDecomp] = useState(false);
  const [expandedDims, setExpandedDims] = useState<Set<string>>(new Set());
  const dimRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  // Seed expandedDims with LOW dimensions when decomposition first shown
  useEffect(() => {
    if (showDecomp) {
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
      if (lowDims.size > 0) setExpandedDims(lowDims);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDecomp]);

  const toggleDim = useCallback((key: string) => {
    setExpandedDims((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandAndScroll = useCallback((key: string) => {
    setShowDecomp(true);
    setExpandedDims((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    // Scroll after render
    requestAnimationFrame(() => {
      dimRefs.current.get(key)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
      renderContent: () => <BiologicalPlausibilityContent eci={eci} syndromes={syndromes} finding={finding} />,
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
    <div className="mt-2 text-[10px]">
      {/* Collapsed summary line */}
      <div className="flex items-baseline gap-1 flex-wrap">
        <span className="text-muted-foreground">Confidence:</span>
        <span className={`uppercase ${confidenceLevelClass(integrated.integrated)}`}>
          {integrated.integrated}
        </span>
        {integrated.limitingFactors.length > 0 && (
          <span className="text-muted-foreground">
            (limited by{" "}
            {integrated.limitingFactors.map((factor, i) => (
              <span key={factor}>
                {i > 0 && ", "}
                <button
                  className="text-primary cursor-pointer hover:underline"
                  onClick={() => expandAndScroll(factor)}
                >
                  {factor}
                </button>
              </span>
            ))}
            )
          </span>
        )}
        {eci.noaelContribution.weight > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              NOAEL weight: {eci.noaelContribution.weight} ({eci.noaelContribution.label})
              {eci.noaelContribution.requiresCorroboration && " — requires corroboration"}
            </span>
          </>
        )}
      </div>

      {/* Toggle link */}
      <button
        className="mt-0.5 text-[9px] text-primary hover:underline"
        onClick={() => setShowDecomp((v) => !v)}
      >
        {showDecomp ? "Hide decomposition" : "Show decomposition"}
      </button>

      {/* Expanded decomposition — per-dimension expandable rows */}
      {showDecomp && (
        <table className="mt-1.5 w-full text-[10px]">
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
                      className={`py-0.5 pr-1.5 uppercase text-[9px] ${
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
                          <span className="ml-1 text-[9px] font-normal text-muted-foreground/50">(not applicable)</span>
                        )}
                      </span>
                    </td>
                  </tr>
                  {isExpanded && d.renderContent && (
                    <tr>
                      <td />
                      <td className="pb-1.5 pl-[14px] pt-0.5 text-[10px]">
                        {d.renderContent()}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Sex Comparison Pane (Phase B5) ──────────────────────

function SexComparisonPane({
  finding,
  analytics,
  primaryStatistics,
  siblingStatistics,
  primaryRecoveryLabel,
  siblingRecoveryLabel,
}: {
  finding: UnifiedFinding;
  analytics: ReturnType<typeof useFindingsAnalyticsLocal>["analytics"];
  primaryStatistics?: FindingContext["statistics"];
  siblingStatistics?: FindingContext["statistics"];
  primaryRecoveryLabel?: string;
  siblingRecoveryLabel?: string;
}) {
  const endpointLabel = finding.endpoint_label ?? finding.finding;
  const epSummary = analytics.endpoints.find(e => e.endpoint_label === endpointLabel);
  const bySex = epSummary?.bySex;
  const noaelBySex = epSummary?.noaelBySex;
  if (!bySex || bySex.size < 2) return null;

  // Order: F first, then M (F precedes M in all sequential layouts)
  const sexes = ["F", "M"].filter(s => bySex.has(s));
  if (sexes.length < 2) return null;

  const dirLabel = (s: SexEndpointSummary) =>
    s.direction === "up" ? "\u2191 increase" : s.direction === "down" ? "\u2193 decrease" : "\u2014";

  const patLabel = (s: SexEndpointSummary) =>
    s.pattern ? getPatternLabel(s.pattern) : "\u2014";

  const noaelLabel = (n: EndpointNoael | undefined) => {
    if (!n) return "\u2014";
    if (n.doseValue != null) return `${n.doseValue} ${n.doseUnit ?? "mg/kg"}`;
    if (n.tier === "below-lowest") return "< lowest";
    return "\u2014";
  };

  const m = bySex.get(sexes[0])!;
  const f = bySex.get(sexes[1])!;

  const rows: Array<{ label: string; values: [string, string] }> = [
    { label: "Direction", values: [dirLabel(m), dirLabel(f)] },
    {
      label: "|g|",
      values: [
        m.maxEffectSize != null ? Math.abs(m.maxEffectSize).toFixed(2) : "\u2014",
        f.maxEffectSize != null ? Math.abs(f.maxEffectSize).toFixed(2) : "\u2014",
      ],
    },
    {
      label: "Trend p",
      values: [
        m.minPValue != null ? formatPValue(m.minPValue) : "\u2014",
        f.minPValue != null ? formatPValue(f.minPValue) : "\u2014",
      ],
    },
    { label: "Pattern", values: [patLabel(m), patLabel(f)] },
    { label: "Severity", values: [m.worstSeverity, f.worstSeverity] },
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
    const primarySex = finding.sex;
    rows.push({
      label: "BW confound",
      values: [
        primarySex === sexes[0] ? "ANCOVA" : "\u2014",
        primarySex === sexes[1] ? "ANCOVA" : "\u2014",
      ],
    });
  }

  // Onset dose row: first dose with p < 0.05 from statistics rows
  const onsetLabel = (stats: FindingContext["statistics"] | undefined): string => {
    if (!stats?.rows) return "\u2014";
    for (let i = 1; i < stats.rows.length; i++) {
      const p = stats.rows[i].p_value_adj ?? stats.rows[i].p_value;
      if (p != null && p < 0.05) {
        const r = stats.rows[i];
        return r.dose_value != null ? `${r.dose_value} ${r.dose_unit ?? "mg/kg"}`.trim() : (r.label ?? "\u2014");
      }
    }
    return "n.s.";
  };
  const primarySex = finding.sex;
  const primaryOnset = onsetLabel(primaryStatistics);
  const sibOnset = onsetLabel(siblingStatistics);
  rows.push({
    label: "Onset dose",
    values: [
      primarySex === sexes[0] ? primaryOnset : sibOnset,
      primarySex === sexes[1] ? primaryOnset : sibOnset,
    ],
  });

  // Recovery row (when available)
  if (primaryRecoveryLabel || siblingRecoveryLabel) {
    rows.push({
      label: "Recovery",
      values: [
        (primarySex === sexes[0] ? primaryRecoveryLabel : siblingRecoveryLabel) ?? "\u2014",
        (primarySex === sexes[1] ? primaryRecoveryLabel : siblingRecoveryLabel) ?? "\u2014",
      ],
    });
  }

  return (
    <div className="mt-2">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        Sex comparison
      </div>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b text-[9px] text-muted-foreground">
            <th className="py-0.5 text-left font-medium" />
            {sexes.map(s => (
              <th key={s} className="py-0.5 text-right font-medium">
                {s}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className="border-b border-border/30">
              <td className="py-0.5 text-muted-foreground">{r.label}</td>
              <td className="py-0.5 text-right font-mono">{r.values[0]}</td>
              <td className="py-0.5 text-right font-mono">{r.values[1]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Recovery verdict colors (text-only, no badge bg) ────

const RECOVERY_VERDICT_CLASS: Partial<Record<RecoveryVerdict, string>> = {
  reversed: "text-emerald-700",
  reversing: "text-emerald-600",
  persistent: "text-amber-700",
  progressing: "text-red-700",
};

// ─── Recovery verdict one-liner for the Verdict section ──

function RecoveryVerdictLine({
  finding,
  onSeeDetails,
}: {
  finding: UnifiedFinding;
  onSeeDetails: () => void;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const isHistopath = finding.domain === "MI" || finding.domain === "MA";
  const specimen = finding.specimen;

  // Hooks must be called unconditionally
  const specimens = useMemo(() => (specimen ? [specimen] : []), [specimen]);
  const { data: studyCtxRecLine } = useStudyContext(studyId);
  const organRecovery = useOrganRecovery(studyId, specimens, undefined, studyCtxRecLine?.species ?? null);
  const { data: recoveryComp } = useRecoveryComparison(studyId);

  if (isHistopath && specimen) {
    if (organRecovery.isLoading) return null;
    const label = `${specimen} \u2014 ${finding.finding}`;
    const verdict = organRecovery.byEndpointLabel.get(label);
    if (!verdict || verdict === "not_observed" || verdict === "no_data" || verdict === "not_examined") return null;
    return (
      <div className="mt-1.5 flex items-center gap-2 text-[10px]">
        <span className="text-muted-foreground">Recovery:</span>
        <span className={`font-medium ${RECOVERY_VERDICT_CLASS[verdict] ?? "text-muted-foreground"}`}>
          {verdictLabel(verdict)}
        </span>
        <button className="text-[9px] text-primary hover:underline" onClick={onSeeDetails}>
          See details
        </button>
      </div>
    );
  }

  if (finding.data_type === "continuous" && recoveryComp?.available) {
    const rows = recoveryComp.rows.filter((r) => {
      // For OM findings, match by specimen since OMTESTCD is always "WEIGHT"
      const codeMatch = finding.specimen
        ? r.test_code.toUpperCase() === finding.specimen.toUpperCase()
        : r.test_code.toUpperCase() === finding.test_code.toUpperCase();
      return codeMatch && r.sex === finding.sex;
    });
    if (rows.length === 0) return null;

    const hasComparable = rows.some((r) => r.terminal_effect != null && r.effect_size != null);
    if (!hasComparable) return null;

    const allReversing = rows.every(
      (r) => r.terminal_effect != null && r.effect_size != null &&
        Math.abs(r.effect_size) < Math.abs(r.terminal_effect) * 0.5,
    );
    const anyWorsening = rows.some(
      (r) => r.terminal_effect != null && r.effect_size != null &&
        Math.abs(r.effect_size) > Math.abs(r.terminal_effect) * 1.1,
    );

    const summaryText = allReversing
      ? "Reversing (>50% reduction)"
      : anyWorsening
        ? "Persistent or worsening"
        : "Partial recovery";
    const summaryClass = allReversing
      ? "text-emerald-700"
      : anyWorsening
        ? "text-amber-700"
        : "text-muted-foreground";

    return (
      <div className="mt-1.5 flex items-center gap-2 text-[10px]">
        <span className="text-muted-foreground">Recovery:</span>
        <span className={`font-medium ${summaryClass}`}>{summaryText}</span>
        <button className="text-[9px] text-primary hover:underline" onClick={onSeeDetails}>
          See details
        </button>
      </div>
    );
  }

  return null;
}

export function FindingsContextPanel() {
  const { studyId } = useParams<{ studyId: string }>();
  const navigate = useNavigate();
  const { selectedFindingId, selectedFinding: rawSelectedFinding, endpointSexes, selectedGroupType, selectedGroupKey, selectGroup } = useFindingSelection();
  const { analytics, data: findingsData, activeFindings } = useFindingsAnalyticsLocal(studyId);

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
  const recoveryPaneRef = useRef<HTMLDivElement>(null);
  const evidencePaneRef = useRef<HTMLDivElement>(null);
  const { data: toxAnnotations } = useAnnotations<ToxFinding>(studyId, "tox-finding");
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();
  const { useScheduledOnly: isScheduledOnly, hasEarlyDeaths } = useScheduledOnly();
  const { data: studyMeta } = useStudyMetadata(studyId ?? "");
  const hasRecovery = studyMeta?.dose_groups?.some((dg) => dg.recovery_armcd) ?? false;
  const { effectSize } = useStatMethods(studyId);
  const normalization = useOrganWeightNormalization(studyId, true, effectSize);

  // Recovery "not examined" detection — drives CollapsiblePane collapse + summary
  const { data: studyCtxForRecovery } = useStudyContext(studyId);
  const recoverySpecimens = useMemo(() => {
    const f = selectedFinding;
    const isHisto = f?.domain === "MI" || f?.domain === "MA";
    return isHisto && f?.specimen ? [f.specimen] : [];
  }, [selectedFinding]);
  const recoveryOverview = useOrganRecovery(
    studyId,
    recoverySpecimens,
    undefined,
    studyCtxForRecovery?.species ?? null,
  );
  const recoveryNotExamined = useMemo(() => {
    if (!selectedFinding?.specimen) return false;
    const isHisto = selectedFinding.domain === "MI" || selectedFinding.domain === "MA";
    if (!isHisto) return false;
    const label = `${selectedFinding.specimen} \u2014 ${selectedFinding.finding}`;
    const verdict = recoveryOverview.byEndpointLabel.get(label);
    return verdict === "not_examined";
  }, [selectedFinding, recoveryOverview.byEndpointLabel]);

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

  // Syndromes that include the currently selected endpoint
  const endpointSyndromes = useMemo(() => {
    if (!selectedFinding) return [];
    const label = selectedFinding.endpoint_label ?? selectedFinding.finding;
    return analytics.syndromes.filter((syn) =>
      syn.matchedEndpoints.some((m) => m.endpoint_label === label)
    );
  }, [analytics.syndromes, selectedFinding]);

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

  // ── Sex selector state (Phase B7) ──
  // Default to sex with larger |effect|; fallback to selected finding's sex
  const defaultSex = useMemo(() => {
    if (!selectedFinding) return "M";
    const label = selectedFinding.endpoint_label ?? selectedFinding.finding;
    const ep = analytics.endpoints.find(e => e.endpoint_label === label);
    const bySex = ep?.bySex;
    if (bySex && bySex.size >= 2) {
      let bestSex = selectedFinding.sex;
      let bestEffect = -1;
      for (const [sex, s] of bySex.entries()) {
        const effect = Math.abs(s.maxEffectSize ?? 0);
        if (effect > bestEffect) { bestEffect = effect; bestSex = sex; }
      }
      return bestSex;
    }
    return selectedFinding.sex;
  }, [selectedFinding, analytics.endpoints]);

  const [activeSex, setActiveSex] = useState(defaultSex);
  // Reset when the selected finding changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setActiveSex(defaultSex); }, [selectedFindingId, defaultSex]);

  const hasSibling = context?.sibling != null;
  const siblingContext = context?.sibling;

  // Determine the active sex's statistics for Tier 2 panes
  const sexAwareStatistics = useMemo(() => {
    if (!hasSibling || !siblingContext || activeSex === selectedFinding?.sex) {
      return activeStatistics;
    }
    // Active sex is the sibling's sex — use sibling statistics
    if (isScheduledOnly && hasEarlyDeaths && siblingContext.statistics.scheduled_rows) {
      return { ...siblingContext.statistics, rows: siblingContext.statistics.scheduled_rows };
    }
    return siblingContext.statistics;
  }, [activeStatistics, hasSibling, siblingContext, activeSex, selectedFinding?.sex, isScheduledOnly, hasEarlyDeaths]);

  // The active finding for ANCOVA: use the sibling finding from findingsData when toggled
  const activeFinding = useMemo(() => {
    if (!hasSibling || !siblingContext || activeSex === selectedFinding?.sex) {
      return selectedFinding;
    }
    // Look up the sibling UnifiedFinding from activeFindings (filtered stats)
    return activeFindings.find(f => f.id === siblingContext.finding_id) ?? selectedFinding;
  }, [hasSibling, siblingContext, activeSex, selectedFinding, activeFindings]);

  // ── Early returns (after all hooks) ──

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

  // Sync dose-response bars for sibling (reuses same logic inline)
  const syncBarsWithStats = (
    dr: typeof context.dose_response,
    stats: typeof context.statistics | undefined,
  ) => {
    if (!isScheduledOnly || !hasEarlyDeaths || !stats) return dr;
    const rowMap = new Map(stats.rows.map(r => [r.dose_level, r]));
    const isContinuous = stats.data_type === "continuous";
    const syncedBars = dr.bars.map(bar => {
      const row = rowMap.get(bar.dose_level);
      if (!row) return bar;
      return { ...bar, value: isContinuous ? (row.mean ?? bar.value) : (row.incidence ?? bar.value) };
    });
    return { ...dr, bars: syncedBars };
  };

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
          {selectedFinding.domain} | {selectedFinding.day != null ? `Day ${selectedFinding.day}` : "Terminal"}
        </p>
      </div>

      {/* Verdict — always visible, not in CollapsiblePane */}
      <div className="border-b px-4 py-3">
        <VerdictPane
          finding={selectedFinding}
          siblingFinding={hasSibling && siblingContext ? findingsData?.findings.find(f => f.id === siblingContext.finding_id) : undefined}
          analytics={analytics}
          noael={noael}
          doseResponse={context.dose_response}
          statistics={activeStatistics!}
          siblingStatistics={hasSibling && siblingContext ? siblingContext.statistics : undefined}
          siblingDoseResponse={hasSibling && siblingContext ? siblingContext.dose_response : undefined}
          treatmentSummary={context.treatment_summary}
          endpointSexes={endpointSexes}
          notEvaluated={notEvaluated}
          eciConfidence={eciConfidence}
          endpointConfidence={endpointConfidenceResult}
          onSeeDecomposition={() => {
            evidencePaneRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }}
        />
        {hasRecovery && !notEvaluated && (
          <RecoveryVerdictLine
            finding={selectedFinding}
            onSeeDetails={() => {
              recoveryPaneRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }}
          />
        )}
        {context.sibling && (
          <SexComparisonPane
            finding={selectedFinding}
            analytics={analytics}
            primaryStatistics={activeStatistics}
            siblingStatistics={siblingContext?.statistics}
          />
        )}
      </div>

      {/* Dose detail — Tier 1: always shows both sexes, above sex selector */}
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
          sex={selectedFinding.sex}
          siblingStatistics={hasSibling ? siblingContext!.statistics : undefined}
          siblingDoseResponse={hasSibling ? syncBarsWithStats(siblingContext!.dose_response, siblingContext!.statistics) : undefined}
          siblingSex={hasSibling ? siblingContext!.sex : undefined}
          ancova={selectedFinding.ancova}
          siblingAncova={hasSibling ? (findingsData?.findings.find(f => f.id === siblingContext!.finding_id)?.ancova ?? null) : undefined}
        />
      </CollapsiblePane>

      {/* Time course — between dose detail and recovery */}
      {selectedFinding && selectedFinding.data_type === "continuous" && (
        <TimeCoursePane
          finding={selectedFinding}
          doseGroups={findingsData?.dose_groups}
          expandAll={expandGen}
          collapseAll={collapseGen}
        />
      )}

      {/* Recovery insights — immediately after dose detail */}
      {hasRecovery && selectedFinding && (
        <div ref={recoveryPaneRef}>
          <CollapsiblePane
            key={selectedFinding.id}
            title="Recovery"
            defaultOpen={!recoveryNotExamined}
            summary={recoveryNotExamined ? "Not examined" : undefined}
            expandAll={expandGen}
            collapseAll={collapseGen}
          >
            <RecoveryPane finding={selectedFinding} doseGroups={findingsData?.dose_groups} />
          </CollapsiblePane>
        </div>
      )}

      <div ref={evidencePaneRef}>
      <CollapsiblePane
        title={hasSibling ? "Evidence:" : "Evidence"}
        defaultOpen
        expandAll={expandGen}
        collapseAll={collapseGen}
        headerRight={hasSibling ? (
          <>
            {[selectedFinding.sex, siblingContext!.sex].map((s, i) => (
              <span key={s}>
                {i > 0 && <span className="mx-0.5 text-muted-foreground/30">|</span>}
                <span
                  className={cn("cursor-pointer", activeSex === s ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground/60")}
                  onClick={() => setActiveSex(s)}
                >
                  {s}
                </span>
              </span>
            ))}
          </>
        ) : undefined}
      >
        <EvidencePane
          finding={activeFinding!}
          analytics={analytics}
          statistics={sexAwareStatistics!}
          effectSize={activeSex === selectedFinding.sex ? context.effect_size : siblingContext?.effect_size ?? context.effect_size}
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
        {/* ANCOVA effect decomposition (OM domain, Phase 2) */}
        {activeFinding!.domain === "OM" && activeFinding!.ancova && (
          <ANCOVADecompositionPane finding={activeFinding!} doseGroups={findingsData?.dose_groups} />
        )}
        {/* Decomposed confidence display (ECI — SPEC-ECI-AMD-002) */}
        {(() => {
          const endpointLabel = activeFinding!.endpoint_label ?? activeFinding!.finding;
          const ep = analytics.endpoints.find((e) => e.endpoint_label === endpointLabel);
          if (!ep?.endpointConfidence) return null;
          return <DecomposedConfidencePane eci={ep.endpointConfidence} finding={activeFinding!} doseGroups={findingsData?.dose_groups} syndromes={endpointSyndromes} />;
        })()}
      </CollapsiblePane>
      </div>

      {/* Syndrome context — only when endpoint participates in ≥1 syndrome */}
      {endpointSyndromes.length > 0 && studyId && (
        <CollapsiblePane
          title="Syndromes"
          defaultOpen
          expandAll={expandGen}
          collapseAll={collapseGen}
          headerRight={
            <span className="text-[9px] text-muted-foreground">
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
