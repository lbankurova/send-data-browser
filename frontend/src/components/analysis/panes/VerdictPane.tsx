import type { FindingContext, UnifiedFinding } from "@/types/analysis";
import type { FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import { formatPValue, getEffectMagnitudeLabel } from "@/lib/severity-colors";
import type { EndpointConfidenceResult } from "@/lib/endpoint-confidence";
import {
  resolveCanonical,
  findClinicalMatchForEndpoint,
  describeThreshold,
} from "@/lib/lab-clinical-catalog";
import { getEffectSizeLabel, getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { useStudySettings } from "@/contexts/StudySettingsContext";
import { TREND_TEST_LABELS, INCIDENCE_TREND_LABELS } from "@/lib/build-settings-params";
import { PatternOverrideDropdown } from "./PatternOverrideDropdown";
import { PharmacologicalBadge } from "@/components/ui/PharmacologicalBadge";

// ─── Types ─────────────────────────────────────────────────

interface Props {
  finding: UnifiedFinding;
  /** Opposite-sex finding for the same endpoint (when both sexes exist). */
  siblingFinding?: UnifiedFinding | null;
  analytics?: FindingsAnalytics;
  noael?: { dose_value: number | null; dose_unit: string | null } | null;
  doseResponse?: FindingContext["dose_response"];
  statistics?: FindingContext["statistics"];
  /** Sibling sex statistics (for sourcing "Largest effect" from bestEffectSex). */
  siblingStatistics?: FindingContext["statistics"] | null;
  /** Sibling dose-response (for sourcing trend p from bestEffectSex). */
  siblingDoseResponse?: FindingContext["dose_response"] | null;
  treatmentSummary: FindingContext["treatment_summary"];
  endpointSexes?: Map<string, string[]>;
  notEvaluated?: boolean;
  /** ECI integrated confidence — overrides the simple heuristic when available. */
  eciConfidence?: "high" | "moderate" | "low" | null;
  /** Full ECI result — used for NOAEL weight display. */
  endpointConfidence?: EndpointConfidenceResult | null;
  /** Callback to scroll to confidence decomposition in Evidence pane. */
  onSeeDecomposition?: () => void;
  /** When false, sex comparison table won't render — show pattern override inline. */
  hasSibling?: boolean;
}



// ─── Component ──────────────────────────────────────────────

export function VerdictPane({
  finding,
  siblingFinding,
  analytics,
  noael: _noael,
  doseResponse,
  statistics,
  siblingStatistics,
  siblingDoseResponse,
  treatmentSummary: _treatmentSummary,
  endpointSexes: _endpointSexes,
  notEvaluated,
  eciConfidence: _eciConfidence,
  endpointConfidence: _endpointConfidence,
  onSeeDecomposition: _onSeeDecomposition,
  hasSibling,
}: Props) {
  const { settings: studySettings } = useStudySettings();

  // Clinical match for this endpoint (Layer D)
  const clinicalMatch: LabClinicalMatch | null = (!notEvaluated && analytics?.labMatches.length)
    ? findClinicalMatchForEndpoint(finding.endpoint_label ?? finding.finding, analytics.labMatches, finding.test_code)
    : null;

  const endpointLabel = finding.endpoint_label ?? finding.finding;

  // Per-sex NOAEL breakdown (from endpoint summary)
  const epSummary = analytics?.endpoints.find(e => e.endpoint_label === endpointLabel);

  const bySex = epSummary?.bySex;

  // "Largest effect" sex header
  const bestEffectSex = (() => {
    if (!bySex || bySex.size < 2) return finding.sex;
    let best = finding.sex;
    let bestVal = -1;
    for (const [sex, s] of bySex.entries()) {
      const e = Math.abs(s.maxEffectSize ?? 0);
      if (e > bestVal) { bestVal = e; best = sex; }
    }
    return best;
  })();

  // Resolve data sources for "Largest effect" — always from bestEffectSex
  const isSibling = bestEffectSex !== finding.sex;
  const bestFinding = isSibling && siblingFinding ? siblingFinding : finding;
  const bestStats = isSibling && siblingStatistics ? siblingStatistics : statistics;
  const bestDR = isSibling && siblingDoseResponse ? siblingDoseResponse : doseResponse;

  // Key numbers — all sourced from bestEffectSex
  const isContinuous = statistics?.data_type === "continuous";
  const effectSize = bestFinding.max_effect_size;
  const esMethod = analytics?.activeEffectSizeMethod ?? "hedges-g";
  const effectLabel = isContinuous ? getEffectSizeLabel(esMethod) : "Avg severity";
  const effectMag = effectSize != null ? getEffectMagnitudeLabel(effectSize) : null;

  const trendP = bestDR?.trend_p ?? bestStats?.trend_p ?? null;
  const trendTestName = isContinuous
    ? (TREND_TEST_LABELS[studySettings.trendTest] ?? "Jonckheere-Terpstra")
    : (INCIDENCE_TREND_LABELS[studySettings.incidenceTrend] ?? "Cochran-Armitage");

  // Fold-change or % change cell
  let pctChange: string | null = null;
  let pctDoseLabel: string | null = null;
  let foldChangeDisplay: string | null = null;
  let foldChangeContext: string | null = null;

  if (clinicalMatch) {
    const canonical = resolveCanonical(endpointLabel);
    const fc = canonical ? clinicalMatch.foldChanges[canonical] : null;
    if (fc != null) {
      foldChangeDisplay = `${fc.toFixed(1)}\u00d7`;
      const threshDesc = canonical ? describeThreshold(clinicalMatch.ruleId, canonical) : null;
      foldChangeContext = threshDesc ? `(${clinicalMatch.ruleId}: ${threshDesc})` : null;
    }
  }

  if (!foldChangeDisplay && bestStats?.rows && bestStats.rows.length >= 2) {
    const control = bestStats.rows[0];
    const highest = bestStats.rows[bestStats.rows.length - 1];
    if (control.mean != null && highest.mean != null && control.mean !== 0) {
      const pct = ((highest.mean - control.mean) / Math.abs(control.mean)) * 100;
      pctChange = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
      pctDoseLabel = highest.dose_value != null
        ? `at ${highest.dose_value} ${highest.dose_unit ?? "mg/kg"}`.trim()
        : `at ${highest.label}`;
    }
  }

  // ANCOVA punchline — use the best-effect sex's ANCOVA when both sexes exist,
  // and pick the most significant pairwise comparison (lowest p), not just the first.
  const ancovaLine = (() => {
    const bestAncova = bestEffectSex !== finding.sex && siblingFinding?.ancova
      ? siblingFinding.ancova
      : finding.ancova;
    if (!bestAncova?.pairwise?.length) return null;
    const sigPairs = bestAncova.pairwise.filter(ap => ap.p_value < 0.05);
    if (sigPairs.length === 0) return null;
    const sig = sigPairs.reduce((a, b) => a.p_value <= b.p_value ? a : b);
    const row = bestStats?.rows?.find(r => r.dose_level === sig.group);
    const doseLabel = row?.dose_value != null ? `${row.dose_value} ${row.dose_unit ?? "mg/kg"}` : `group ${sig.group}`;
    const pStr = formatPValue(sig.p_value);
    const pFragment = pStr.startsWith("<") ? `p\u2009${pStr}` : `p\u2009=\u2009${pStr}`;
    return `ANCOVA confirms direct effect at ${doseLabel} (${pFragment}).`;
  })();

  // Clinical significance line: "Clinical sig. S2 | F: 1.5×↑ · M: 1.3×↑"
  const clinicalLine = (() => {
    if (!clinicalMatch) return null;
    const tier = clinicalMatch.severity;
    const canonical = resolveCanonical(endpointLabel, finding.test_code);

    // Build fold-change parts
    if (bySex && bySex.size >= 2 && canonical) {
      const entries = [...bySex.entries()].sort(([a], [b]) => a.localeCompare(b));
      const parts = entries.map(([sex, s]) => {
        const fc = s.maxFoldChange != null && s.maxFoldChange > 0 ? s.maxFoldChange : null;
        const dir = s.direction === "up" ? "\u2191" : s.direction === "down" ? "\u2193" : "";
        return fc != null ? `${sex}: ${fc.toFixed(1)}\u00d7${dir}` : `${sex}: \u2014`;
      });
      return `Clinical sig. ${tier} | ${parts.join(" \u00b7 ")}`;
    }

    // Single sex — use the rule-level fold change
    const fc = canonical ? clinicalMatch.foldChanges[canonical] : null;
    const dir = finding.direction === "up" ? "\u2191" : finding.direction === "down" ? "\u2193" : "";
    const fcStr = fc != null ? ` | ${fc.toFixed(1)}\u00d7${dir}` : "";
    return `Clinical sig. ${tier}${fcStr}`;
  })();

  // Pharmacological candidate (D9 fired)
  const isPharmCandidate = finding._confidence?._pharmacological_candidate === true;
  const pharmRationale = isPharmCandidate
    ? (finding._confidence?.dimensions?.find(d => d.dimension === "D9")?.rationale ?? null)
    : null;

  return (
    <div>
      {/* Pharmacological candidate indicator */}
      {isPharmCandidate && (
        <div className="mt-0.5 flex items-center gap-1.5">
          <PharmacologicalBadge rationale={pharmRationale} />
          {pharmRationale && (
            <span className="text-[10px] text-muted-foreground truncate" title={pharmRationale}>
              {pharmRationale}
            </span>
          )}
        </div>
      )}

      {/* Clinical significance line */}
      {clinicalLine && (
        <div className="mt-0.5 text-[11px] font-medium text-muted-foreground">
          {clinicalLine}
        </div>
      )}

      {/* Pattern override dropdown (single-sex only — both-sex pattern shown in sex comparison table) */}
      {!hasSibling && !notEvaluated && (
        <div className="mt-0.5">
          <PatternOverrideDropdown finding={finding} />
        </div>
      )}

      {/* Line 5 -- Key numbers with "Largest effect" header */}
      {(effectSize != null || trendP != null || pctChange != null || foldChangeDisplay != null) && (
        <div className="mt-1.5">
          <div className="text-[11px] text-muted-foreground">
            Largest effect ({bestEffectSex}):
          </div>
          <div className="mt-1.5 flex gap-x-6 text-[11px]">
            {effectSize != null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">|{isContinuous ? getEffectSizeSymbol(esMethod) : "d"}| = {Math.abs(effectSize).toFixed(2)}</span>
                <span className="text-[10px] text-muted-foreground">{effectLabel}</span>
                {effectMag && <span className="text-[10px] text-muted-foreground">({effectMag})</span>}
              </div>
            )}

            {trendP != null && (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">p {formatPValue(trendP) === "<0.0001" ? "< 0.0001" : `= ${formatPValue(trendP)}`}</span>
                <span className="text-[10px] text-muted-foreground">{trendTestName}</span>
                <span className="text-[10px] text-muted-foreground">trend</span>
              </div>
            )}

            {foldChangeDisplay != null ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">{foldChangeDisplay}</span>
                <span className="text-[10px] text-muted-foreground">vs control</span>
                {foldChangeContext && <span className="text-[10px] text-muted-foreground">{foldChangeContext}</span>}
              </div>
            ) : pctChange != null ? (
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold font-mono">{pctChange}</span>
                <span className="text-[10px] text-muted-foreground">vs control</span>
                {pctDoseLabel && <span className="text-[10px] text-muted-foreground">{pctDoseLabel}</span>}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Line 6 -- ANCOVA punchline */}
      {ancovaLine && (
        <div className="mt-2 text-[11px] text-muted-foreground">{ancovaLine}</div>
      )}
    </div>
  );
}
