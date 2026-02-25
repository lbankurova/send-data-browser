import { useMemo, useCallback, useState, useEffect, Fragment } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { PathologyReviewForm } from "./PathologyReviewForm";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { getDoseGroupColor, formatDoseShortLabel } from "@/lib/severity-colors";
import { classifyFindingPattern, formatPatternLabel, patternToLegacyConsistency } from "@/lib/pattern-classification";
import { detectSyndromes } from "@/lib/syndrome-rules";
import { DoseLabel } from "@/components/ui/DoseLabel";
import {
  deriveSpecimenSummaries,
  deriveSexLabel,
  deriveSpecimenReviewStatus,
  getNeutralHeatColor,
} from "@/lib/histopathology-helpers";
import type { SpecimenReviewStatus } from "@/lib/histopathology-helpers";
import { aggregateByFinding } from "@/lib/finding-aggregation";
import type { LesionSeverityRow, RuleResult } from "@/types/analysis-views";
import type { PathologyReview } from "@/types/annotations";
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { deriveRecoveryAssessments, MIN_RECOVERY_N, verdictArrow, formatRecoveryFraction } from "@/lib/recovery-assessment";
import type { RecoveryAssessment, RecoveryDoseAssessment } from "@/lib/recovery-assessment";
import type { SubjectHistopathEntry } from "@/types/timecourse";
import { classifyRecovery, CLASSIFICATION_LABELS, CLASSIFICATION_BORDER } from "@/lib/recovery-classification";
import type { RecoveryClassification } from "@/lib/recovery-classification";
import { classifyFindingNature } from "@/lib/finding-nature";
import { getHistoricalControl, classifyVsHCD, queryHistoricalControl, classifyControlVsHCD, HCD_STATUS_LABELS } from "@/lib/mock-historical-controls";
import type { HistoricalControlData, HistoricalControlResult, HCDStatus } from "@/lib/mock-historical-controls";
import { useStudyContext } from "@/hooks/useStudyContext";
// getFindingDoseConsistency removed — use classifyFindingPattern from pattern-classification.ts
import { useFindingDoseTrends } from "@/hooks/useFindingDoseTrends";
import { fishersExact2x2 } from "@/lib/statistics";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import type { SignalSummaryRow } from "@/types/analysis-views";
import { isPairedOrgan, specimenHasLaterality, aggregateFindingLaterality, lateralitySummary } from "@/lib/laterality";
import { useSpecimenLabCorrelation } from "@/hooks/useSpecimenLabCorrelation";
import type { LabCorrelation } from "@/hooks/useSpecimenLabCorrelation";

// ─── Lab Correlates Pane ─────────────────────────────────────────────────────

function signalDots(signal: number): string {
  return signal >= 3 ? "●●●" : signal >= 2 ? "●●" : signal >= 1 ? "●" : "";
}

function LabCorrelatesPane({
  correlations,
  isLoading,
  specimen,
  finding,
}: {
  correlations: LabCorrelation[];
  isLoading: boolean;
  specimen?: string;
  finding?: string;
}) {
  if (isLoading) {
    return <p className="text-[11px] text-muted-foreground">Loading lab data...</p>;
  }
  if (correlations.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No clinical pathology data available.</p>;
  }

  const organLabel = specimen?.replace(/_/g, " ") ?? "";

  // Finding-level: compact inline format per spec §4
  if (finding) {
    return (
      <div className="space-y-0.5">
        <p className="text-[10px] text-muted-foreground">Most relevant for {finding}</p>
        {correlations.filter((c) => c.signal > 0 || c.isRelevant).slice(0, 8).map((c) => (
          <div key={c.test} className="text-[10px]">
            <span className={c.isRelevant ? "font-medium text-foreground" : "text-muted-foreground"}>
              {c.test}: {c.pctChange >= 0 ? "+" : ""}{c.pctChange.toFixed(0)}% at high dose ({c.controlMean.toFixed(0)} {"\u2192"} {c.highDoseMean.toFixed(0)} {c.unit})
            </span>
            {c.signal > 0 && <span className="ml-1 font-mono text-[9px] text-muted-foreground">{signalDots(c.signal)}</span>}
          </div>
        ))}
      </div>
    );
  }

  // Specimen-level: full table format per spec §3
  return (
    <div className="space-y-0.5">
      {organLabel && <p className="text-[10px] text-muted-foreground">Organ-relevant tests for {organLabel}</p>}
      {/* Header row */}
      <div className="flex items-center gap-1 text-[9px] font-medium text-muted-foreground/60">
        <span className="w-12">Test</span>
        <span className="w-20 text-right">Control</span>
        <span className="w-14 text-right">High dose</span>
        <span className="w-16 text-right">Change</span>
        <span className="w-8 text-center">Signal</span>
      </div>
      {correlations.map((c) => (
        <div
          key={c.test}
          className={`flex items-center gap-1 rounded px-0.5 py-0.5 text-[10px] ${c.isRelevant ? "bg-muted/20" : ""}`}
          title={`${c.test}: control ${c.controlMean.toFixed(2)} \u00B1 ${c.controlSD.toFixed(2)}, high dose ${c.highDoseMean.toFixed(2)} (${c.pctChange >= 0 ? "+" : ""}${c.pctChange.toFixed(0)}%)`}
        >
          <span className={`w-12 truncate font-mono text-[9px] ${c.isRelevant ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
            {c.test}
          </span>
          <span className="w-20 text-right font-mono text-[9px] text-muted-foreground">
            {c.controlMean.toFixed(1)} {"\u00B1"} {c.controlSD.toFixed(1)}
          </span>
          <span className="w-14 text-right font-mono text-[9px] text-muted-foreground">
            {c.highDoseMean.toFixed(1)}
          </span>
          <span className={`w-16 text-right font-mono text-[9px] ${c.signal > 0 ? "text-foreground" : "text-muted-foreground/60"}`}>
            {c.direction === "up" ? "+" : ""}{c.pctChange.toFixed(0)}%{c.signal > 0 ? (c.direction === "up" ? " \u2191" : " \u2193") : ""}
          </span>
          <span className="w-8 text-center font-mono text-[9px] text-muted-foreground">
            {signalDots(c.signal)}
          </span>
        </div>
      ))}
      {organLabel && (
        <p className="mt-1 text-[9px] text-muted-foreground/50">
          {"\u24D8"} Tests from CL/LB domains mapped to {organLabel}.
        </p>
      )}
    </div>
  );
}

// ─── Specimen-scoped insights (purpose-built for context panel) ──────────────

interface InsightBlock {
  kind: "adverse" | "protective" | "decreased" | "trend" | "info" | "clinical";
  finding: string;
  sexes: string;
  detail: string;
  correlates?: string;
}

function deriveSpecimenInsights(rules: RuleResult[], specimen: string, signalData?: SignalSummaryRow[]): InsightBlock[] {
  const blocks: InsightBlock[] = [];
  const specLower = specimen.toLowerCase();

  // Filter rules to those matching this specimen
  const specimenRules = rules.filter((r) => {
    if (r.params?.specimen && r.params.specimen.toLowerCase() === specLower) return true;
    return r.context_key.toLowerCase().includes(specLower.replace(/[, ]+/g, "_"));
  });

  const aggregated = aggregateByFinding(specimenRules);

  // ── 1. Treatment-related (per-finding, collapsed across sexes) ────────
  // Group adverse findings by name to collapse M/F duplicates
  const adverseByName = new Map<string, typeof aggregated>();
  for (const agg of aggregated) {
    if (agg.category !== "adverse") continue;
    const name = agg.finding || agg.endpointLabel;
    const list = adverseByName.get(name);
    if (list) list.push(agg);
    else adverseByName.set(name, [agg]);
  }

  for (const [name, aggs] of adverseByName) {
    const sexes = [...new Set(aggs.map((a) => a.sex))].sort();
    const sexLabel = sexes.length >= 2 ? "M, F" : sexes[0] ?? "";
    const allRulesFlat = aggs.flatMap((a) => a.rules);

    // Build evidence qualifiers (not table data — interpretive detail)
    const details: string[] = [];
    if (allRulesFlat.some((r) => r.rule_id === "R04")) {
      const bestP = Math.min(...allRulesFlat
        .filter((r) => r.rule_id === "R04" && r.params?.p_value != null)
        .map((r) => r.params!.p_value as number));
      details.push(bestP < Infinity ? `p = ${bestP.toFixed(4)}` : "significant");
    }
    const effectRules = allRulesFlat.filter((r) => r.rule_id === "R10" && r.severity === "warning");
    if (effectRules.length > 0) {
      const maxD = Math.max(...effectRules.map((r) => Math.abs(r.params?.effect_size as number ?? 0)));
      details.push(`d = ${maxD.toFixed(2)}`);
    }
    if (allRulesFlat.some((r) => r.rule_id === "R12") && allRulesFlat.some((r) => r.rule_id === "R13")) {
      details.push("incidence + severity increase");
    } else if (allRulesFlat.some((r) => r.rule_id === "R12")) {
      details.push("incidence increase");
    } else if (allRulesFlat.some((r) => r.rule_id === "R13")) {
      details.push("severity increase");
    }

    // Clinical annotation inline
    const clinicalRule = allRulesFlat.find((r) => r.params?.clinical_class);
    if (clinicalRule?.params?.clinical_class) {
      details.push(`${formatClinicalClass(clinicalRule.params.clinical_class)} (${clinicalRule.params.catalog_id ?? ""})`);
    }

    blocks.push({
      kind: "adverse",
      finding: name,
      sexes: sexLabel,
      detail: details.join(" \u00b7 "),
    });
  }

  // ── 2. Clinical significance (findings NOT already in adverse) ────────
  const adverseNames = new Set(adverseByName.keys());
  const clinicalSeen = new Set<string>();
  for (const r of specimenRules) {
    const cc = r.params?.clinical_class;
    const catalogId = r.params?.catalog_id;
    if (!cc || !catalogId) continue;
    const finding = r.params?.finding ?? r.params?.endpoint_label ?? "";
    if (adverseNames.has(finding)) continue; // already shown with inline clinical tag
    const key = `${catalogId}|${finding}`;
    if (clinicalSeen.has(key)) continue;
    clinicalSeen.add(key);
    const conf = r.params?.clinical_confidence
      ? ` \u00b7 ${r.params.clinical_confidence} confidence`
      : "";
    blocks.push({
      kind: "clinical",
      finding,
      sexes: "",
      detail: `${formatClinicalClass(cc)} (${catalogId})${conf}`,
    });
  }

  // ── 3. Protective signals (per-finding, collapsed across sexes) ───────
  const protectiveByName = new Map<string, typeof aggregated>();
  for (const agg of aggregated) {
    if (agg.category !== "protective") continue;
    const name = agg.finding || agg.endpointLabel;
    const list = protectiveByName.get(name);
    if (list) list.push(agg);
    else protectiveByName.set(name, [agg]);
  }

  for (const [name, aggs] of protectiveByName) {
    const allRulesFlat = aggs.flatMap((a) => a.rules);
    const excludedRule = allRulesFlat.find((r) => r.params?.protective_excluded);
    if (excludedRule) {
      blocks.push({
        kind: "info",
        finding: name,
        sexes: "",
        detail: `Decreased incidence excluded from protective classification (${excludedRule.params?.exclusion_id ?? ""})`,
      });
    } else {
      const ctrlPct = aggs[0].primaryRule.params?.ctrl_pct ?? "";
      const highPct = aggs[0].primaryRule.params?.high_pct ?? "";
      // Cross-domain correlates from signal data
      let correlates: string | undefined;
      if (signalData) {
        const organSystem = specimenToOrganSystem(specimen);
        const organSignals = signalData.filter(
          (s) => s.organ_system === organSystem && s.domain !== "MI" && s.direction != null && s.direction !== "none",
        );
        // Deduplicate by endpoint_label
        const seen = new Set<string>();
        const corr: string[] = [];
        for (const s of organSignals) {
          if (seen.has(s.endpoint_label)) continue;
          seen.add(s.endpoint_label);
          const arrow = s.direction === "down" ? "\u2193" : "\u2191";
          corr.push(`${s.endpoint_label} ${arrow}`);
        }
        if (corr.length > 0) {
          correlates = `Correlated: ${corr.slice(0, 5).join(", ")}`;
        }
      }
      blocks.push({
        kind: "decreased",
        finding: name,
        sexes: [...new Set(aggs.map((a) => a.sex))].sort().join(", "),
        detail: `${ctrlPct}% control \u2192 ${highPct}% high dose`,
        correlates,
      });
    }
  }

  return blocks;
}

function formatClinicalClass(cc: string): string {
  switch (cc) {
    case "Sentinel": return "Sentinel";
    case "HighConcern": return "High concern";
    case "ModerateConcern": return "Moderate concern";
    case "ContextDependent": return "Context dependent";
    default: return cc;
  }
}

const INSIGHT_STYLES: Record<InsightBlock["kind"], { border: string; icon: string; label: string }> = {
  adverse:     { border: "border-l-red-400",    icon: "\u2191", label: "Adverse" },
  protective:  { border: "border-l-blue-400",   icon: "\u2193", label: "Decreased" },
  decreased:   { border: "border-l-blue-400",   icon: "\u2193", label: "Decreased" },
  clinical:    { border: "border-l-orange-400",  icon: "\u2691", label: "Clinical" },
  trend:       { border: "border-l-amber-300",  icon: "\u2192", label: "Trend" },
  info:        { border: "border-l-gray-300",   icon: "\u00b7", label: "Info" },
};

function SpecimenInsights({ rules, specimen, signalData }: { rules: RuleResult[]; specimen: string; signalData?: SignalSummaryRow[] }) {
  const blocks = useMemo(() => deriveSpecimenInsights(rules, specimen, signalData), [rules, specimen, signalData]);

  if (blocks.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No insights for this specimen.</p>;
  }

  // Group by kind for section headers
  const adverseBlocks = blocks.filter((b) => b.kind === "adverse");
  const clinicalBlocks = blocks.filter((b) => b.kind === "clinical");
  const protectiveBlocks = blocks.filter((b) => b.kind === "protective" || b.kind === "decreased");
  const infoBlocks = blocks.filter((b) => b.kind === "info");

  return (
    <div className="space-y-2.5">
      {adverseBlocks.length > 0 && (
        <InsightSection label="Treatment-related" blocks={adverseBlocks} />
      )}
      {clinicalBlocks.length > 0 && (
        <InsightSection label="Clinical significance" blocks={clinicalBlocks} />
      )}
      {protectiveBlocks.length > 0 && (
        <InsightSection label="Decreased with treatment" blocks={protectiveBlocks} />
      )}
      {infoBlocks.length > 0 && (
        <InsightSection label="Notes" blocks={infoBlocks} />
      )}
    </div>
  );
}

function InsightSection({ label, blocks }: { label: string; blocks: InsightBlock[] }) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {label}
      </div>
      <div className="space-y-1">
        {blocks.map((b, i) => {
          const style = INSIGHT_STYLES[b.kind];
          return (
            <div
              key={`${b.finding}-${b.kind}-${i}`}
              className={cn("border-l-2 py-0.5 pl-2", style.border)}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-medium">{b.finding}</span>
                {b.sexes && (
                  <span className="text-[10px] font-medium text-muted-foreground">{b.sexes}</span>
                )}
              </div>
              <div className="text-[10px] leading-snug text-muted-foreground">
                {b.detail}
              </div>
              {b.correlates && (
                <div className="text-[9px] leading-snug text-muted-foreground/60 italic">
                  {b.correlates}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Wrapper that fetches signal data for cross-domain correlates in insight blocks */
function SpecimenInsightsWithSignals({ rules, specimen, studyId }: { rules: RuleResult[]; specimen: string; studyId?: string }) {
  const { data: signalData } = useStudySignalSummary(studyId);
  return <SpecimenInsights rules={rules} specimen={specimen} signalData={signalData} />;
}

// ─── Recovery insight block (interpretive layer — Insights pane only) ─────────

function RecoveryInsightBlock({ classification }: { classification: RecoveryClassification }) {
  const label = CLASSIFICATION_LABELS[classification.classification];
  const border = CLASSIFICATION_BORDER[classification.classification];

  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Recovery assessment
      </div>
      <div className={cn("py-0.5 pl-2", border)}>
        <div className="text-[11px] font-medium text-foreground">
          {label} &middot; {classification.confidence} confidence
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {classification.rationale}
        </div>
        {classification.inputsUsed.length > 0 && (
          <div className="mt-1 border-l border-border/40 pl-2 text-[10px] text-muted-foreground/60">
            {classification.inputsUsed.join(" \u00b7 ")}
          </div>
        )}
        {classification.qualifiers.length > 0 && (
          <div className="mt-0.5 space-y-0.5">
            {classification.qualifiers.map((q, i) => (
              <div key={i} className="text-[10px] italic text-muted-foreground/50">
                {q}
              </div>
            ))}
          </div>
        )}
        {classification.recommendedAction && (
          <div className="mt-1 text-[10px] font-medium text-foreground/70">
            {classification.recommendedAction}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Specimen → organ_system mapping (mirrors backend ORGAN_SYSTEM_MAP) ──────
const SPECIMEN_ORGAN_MAP: Record<string, string> = {
  LIVER: "hepatic", KIDNEY: "renal", KIDNEYS: "renal", HEART: "cardiovascular",
  AORTA: "cardiovascular", BRAIN: "neurological", "SPINAL CORD": "neurological",
  LUNG: "respiratory", LUNGS: "respiratory", TRACHEA: "respiratory", LARYNX: "respiratory",
  SPLEEN: "hematologic", THYMUS: "hematologic",
  PANCREAS: "endocrine", STOMACH: "gastrointestinal", ESOPHAGUS: "gastrointestinal",
  TONGUE: "gastrointestinal", TESTIS: "reproductive", TESTES: "reproductive",
  EPIDIDYMIS: "reproductive", UTERUS: "reproductive", SKIN: "integumentary",
  EYE: "ocular", EYES: "ocular", "URINARY BLADDER": "renal",
};
const KEYWORD_ORGAN_MAP: [string, string][] = [
  ["ADRENAL", "endocrine"], ["THYROID", "endocrine"], ["PITUITARY", "endocrine"],
  ["PROSTATE", "reproductive"], ["MAMMARY", "reproductive"], ["OVARY", "reproductive"],
  ["BONE MARROW", "hematologic"], ["LYMPH NODE", "hematologic"],
  ["LARGE INTESTINE", "gastrointestinal"], ["SMALL INTESTINE", "gastrointestinal"],
  ["COLON", "gastrointestinal"], ["CECUM", "gastrointestinal"], ["RECTUM", "gastrointestinal"],
  ["DUODENUM", "gastrointestinal"], ["JEJUNUM", "gastrointestinal"], ["ILEUM", "gastrointestinal"],
  ["MUSCLE", "musculoskeletal"], ["FEMUR", "musculoskeletal"], ["STERNUM", "musculoskeletal"],
];

export function specimenToOrganSystem(specimen: string): string {
  const upper = specimen.toUpperCase().trim();
  if (SPECIMEN_ORGAN_MAP[upper]) return SPECIMEN_ORGAN_MAP[upper];
  for (const [keyword, system] of KEYWORD_ORGAN_MAP) {
    if (upper.includes(keyword)) return system;
  }
  return "general";
}

const REVIEW_STATUS_TOOLTIPS: Record<SpecimenReviewStatus, string> = {
  "Preliminary": "No peer review recorded yet",
  "In review": "Some findings reviewed, others pending",
  "Confirmed": "All findings agreed by peer reviewer",
  "Revised": "One or more findings disagreed and resolved",
  "Under dispute": "One or more findings disagreed, awaiting resolution",
  "PWG pending": "Pathology Working Group review pending",
};

interface HistopathSelection {
  specimen: string;
  finding?: string;
  sex?: string;
}

interface Props {
  lesionData: LesionSeverityRow[];
  ruleResults: RuleResult[];
  selection: HistopathSelection | null;
  studyId?: string;
  pathReviews?: Record<string, PathologyReview>;
}

// ─── Specimen Overview (when no finding is selected) ──────────────────────────

function SpecimenOverviewPane({
  specimen,
  lesionData,
  ruleResults,
  studyId,
  pathReviews,
}: {
  specimen: string;
  lesionData: LesionSeverityRow[];
  ruleResults: RuleResult[];
  studyId?: string;
  pathReviews?: Record<string, PathologyReview>;
}) {
  const navigate = useNavigate();
  const { navigateTo } = useStudySelection();
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // Hooks for pattern classification
  const { data: trendDataSpec } = useFindingDoseTrends(studyId);
  const { data: signalDataSpec } = useStudySignalSummary(studyId);
  const { data: studyCtxSpec } = useStudyContext(studyId);
  const syndromeMatchesSpec = useMemo(() => {
    if (!lesionData.length) return [];
    const organMap = new Map<string, LesionSeverityRow[]>();
    for (const r of lesionData) {
      if (!r.specimen) continue;
      const key = r.specimen.toUpperCase();
      const arr = organMap.get(key) ?? [];
      arr.push(r);
      organMap.set(key, arr);
    }
    return detectSyndromes(organMap, signalDataSpec ?? null, studyCtxSpec);
  }, [lesionData, signalDataSpec, studyCtxSpec]);

  // Derive specimen summary
  const summary = useMemo(() => {
    const summaries = deriveSpecimenSummaries(lesionData, ruleResults, trendDataSpec ?? null, syndromeMatchesSpec, signalDataSpec ?? null);
    return summaries.find((s) => s.specimen === specimen) ?? null;
  }, [lesionData, ruleResults, specimen, trendDataSpec, syndromeMatchesSpec, signalDataSpec]);

  // Subject-level data (for laterality)
  const { data: subjData } = useHistopathSubjects(studyId, specimen);

  // Laterality summary for paired organs
  const lateralityInfo = useMemo(() => {
    if (!isPairedOrgan(specimen) || !subjData?.subjects || !specimenHasLaterality(subjData.subjects)) return null;
    // Aggregate across all findings
    const findings = subjData.findings ?? [];
    const perFinding = findings.map((f) => ({
      finding: f,
      agg: aggregateFindingLaterality(subjData.subjects, f),
    })).filter((x) => x.agg.left > 0 || x.agg.right > 0 || x.agg.bilateral > 0);
    if (perFinding.length === 0) return null;
    // Overall totals
    const total = { left: 0, right: 0, bilateral: 0, total: 0 };
    for (const pf of perFinding) {
      total.left += pf.agg.left;
      total.right += pf.agg.right;
      total.bilateral += pf.agg.bilateral;
      total.total += pf.agg.total;
    }
    // Predominantly unilateral? Spec: >70% same laterality and not bilateral
    const unilateral = total.left + total.right;
    const affected = unilateral + total.bilateral;
    const isUnilateral = affected > 0 && unilateral / affected >= 0.7;
    // Determine dominant side for display
    const dominantSide = total.left >= total.right ? "left" : "right";
    const dominantCount = Math.max(total.left, total.right);
    return { perFinding, total, isUnilateral, dominantSide, dominantCount, affected };
  }, [specimen, subjData]);

  // Lab correlation (specimen-level)
  const labCorrelation = useSpecimenLabCorrelation(studyId, specimen);

  // Specimen-scoped data
  const specimenData = useMemo(
    () => lesionData.filter((r) => r.specimen === specimen),
    [lesionData, specimen]
  );

  // Specimen-scoped rules
  const specimenRules = useMemo(() => {
    if (!ruleResults.length) return [];
    const specLower = specimen.toLowerCase();
    const specKey = specLower.replace(/[, ]+/g, "_");
    return ruleResults.filter(
      (r) =>
        (r.params?.specimen && r.params.specimen.toLowerCase() === specLower) ||
        r.context_key.toLowerCase().includes(specKey) ||
        r.organ_system.toLowerCase() === specLower
    );
  }, [ruleResults, specimen]);

  // Merged domains from data + rules
  const allDomains = useMemo(() => {
    const set = new Set(summary?.domains ?? []);
    for (const r of specimenRules) {
      const m = r.context_key.match(/^([A-Z]{2})_/);
      if (m) set.add(m[1]);
    }
    return [...set].sort();
  }, [summary?.domains, specimenRules]);

  // Dose-response: incidence by dose group
  const doseTrendDetail = useMemo(() => {
    // Aggregate across all findings in specimen
    const doseMap = new Map<number, { label: string; affected: number; n: number }>();
    for (const r of specimenData) {
      const existing = doseMap.get(r.dose_level);
      if (existing) {
        existing.affected += r.affected;
        existing.n += r.n;
      } else {
        doseMap.set(r.dose_level, { label: formatDoseShortLabel(r.dose_label), affected: r.affected, n: r.n });
      }
    }
    const sorted = [...doseMap.entries()].sort((a, b) => a[0] - b[0]);

    // Determine method
    const hasDoseRule = specimenRules.some((r) => r.rule_id === "R01" || r.rule_id === "R04");
    const matchingRuleIds = specimenRules
      .filter((r) => r.rule_id === "R01" || r.rule_id === "R04")
      .map((r) => r.rule_id);
    const method = hasDoseRule
      ? `Rule engine (${[...new Set(matchingRuleIds)].join("/")})`
      : "Pattern classification";

    // Use pattern from precomputed summary, or fall back to legacy label
    const patternLabel = summary ? formatPatternLabel(summary.pattern) : "—";

    return { doses: sorted, method, patternLabel };
  }, [specimenData, specimenRules, summary]);

  // Structured conclusion parts (rendered as individual chips)
  const conclusionParts = useMemo(() => {
    if (!summary) return null;
    const incPct = Math.round(summary.maxIncidence * 100);
    const incidenceLabel = incPct > 50 ? "high" : incPct > 20 ? "moderate" : "low";
    const sevLabel = summary.adverseCount > 0
      ? `max severity ${summary.maxSeverity.toFixed(1)}`
      : "non-adverse";
    const sexLabel = deriveSexLabel(specimenData).toLowerCase();
    const doseRelation = `pattern: ${doseTrendDetail.patternLabel}`;
    const findingBreakdown = summary.warningCount > 0
      ? `${summary.findingCount} findings (${summary.adverseCount}adv/${summary.warningCount}warn)`
      : `${summary.findingCount} findings`;
    // Enhanced sexSkew: require ratio > 1.5× AND incidence difference ≥ 20pp AND Fisher's p < 0.10
    let sexSkewLabel: string | null = null;
    if (summary.sexSkew && summary.sexSkew !== "M=F") {
      // Compute Fisher's from highest-affected dose group with both sexes
      const byDoseSex = new Map<number, Map<string, { affected: number; n: number }>>();
      for (const r of specimenData) {
        let sexMap = byDoseSex.get(r.dose_level);
        if (!sexMap) { sexMap = new Map(); byDoseSex.set(r.dose_level, sexMap); }
        const existing = sexMap.get(r.sex);
        if (existing) { existing.affected += r.affected; existing.n += r.n; }
        else sexMap.set(r.sex, { affected: r.affected, n: r.n });
      }
      let bestDose: number | null = null;
      let bestTotal = 0;
      for (const [dl, sexMap] of byDoseSex) {
        const m = sexMap.get("M");
        const f = sexMap.get("F");
        if (!m || !f || m.n === 0 || f.n === 0) continue;
        const total = m.affected + f.affected;
        if (total > bestTotal) { bestTotal = total; bestDose = dl; }
      }
      if (bestDose !== null) {
        const sexMap = byDoseSex.get(bestDose)!;
        const m = sexMap.get("M")!;
        const f = sexMap.get("F")!;
        const mInc = m.n > 0 ? m.affected / m.n : 0;
        const fInc = f.n > 0 ? f.affected / f.n : 0;
        const incDiff = Math.abs(mInc - fInc);
        const p = fishersExact2x2(m.affected, m.n - m.affected, f.affected, f.n - f.affected);
        // Require both: incidence difference ≥ 20pp AND Fisher's p < 0.10
        if (incDiff >= 0.2 && p < 0.10) {
          const pLabel = p < 0.001 ? "<0.001" : p.toFixed(3);
          sexSkewLabel = `sex difference: ${summary.sexSkew === "M>F" ? "males" : "females"} >1.5× higher (p=${pLabel})`;
        }
        // Below both thresholds: sexSkew suppressed (null)
      }
    }

    return {
      incidence: `incidence: ${incidenceLabel}, ${incPct}%`,
      severity: sevLabel,
      sex: sexLabel,
      sexSkew: sexSkewLabel,
      doseRelation,
      findings: findingBreakdown,
      hasRecovery: summary.hasRecovery,
    };
  }, [summary, specimenData, doseTrendDetail.patternLabel]);

  // Review status
  const findingNames = useMemo(
    () => [...new Set(specimenData.map((r) => r.finding))],
    [specimenData]
  );

  if (!summary) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No data for specimen.
      </div>
    );
  }

  const reviewStatus = deriveSpecimenReviewStatus(findingNames, pathReviews);

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-end gap-2">
            <h3 className="text-sm font-semibold leading-none">{specimen.replace(/_/g, " ")}</h3>
            <span
              className={`text-[10px] leading-none ${reviewStatus === "Revised" ? "text-purple-600" : "text-muted-foreground"}`}
              title={REVIEW_STATUS_TOOLTIPS[reviewStatus]}
            >
              {reviewStatus}
            </span>
            {summary.adverseCount > 0 && (
              <span className="rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
                {summary.adverseCount} adverse
              </span>
            )}
          </div>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        {allDomains.length > 0 && (
          <div className="mt-1 flex items-center gap-1">
            {allDomains.map((d) => (
              <DomainLabel key={d} domain={d} />
            ))}
          </div>
        )}
      </div>

      {/* Overview */}
      <CollapsiblePane title="Overview" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {conclusionParts && (
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">{conclusionParts.incidence}</span>
            <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">{conclusionParts.severity}</span>
            <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">{conclusionParts.sex}</span>
            {conclusionParts.sexSkew && (
              <span className="rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">{conclusionParts.sexSkew}</span>
            )}
            <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">{conclusionParts.doseRelation}</span>
            <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">{conclusionParts.findings}</span>
            {conclusionParts.hasRecovery && (
              <span className="rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">recovery data available</span>
            )}
          </div>
        )}
      </CollapsiblePane>

      {/* Insights */}
      {specimenRules.length > 0 && (
        <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <SpecimenInsightsWithSignals rules={specimenRules} specimen={specimen} studyId={studyId} />
        </CollapsiblePane>
      )}

      {/* Syndrome detected (§6f) */}
      {(() => {
        const syndromeMatch = syndromeMatchesSpec.find(
          (m) => m.organ.toUpperCase() === specimen.toUpperCase(),
        );
        if (!syndromeMatch) return null;
        return (
          <CollapsiblePane title="Syndrome detected" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
            <div className="border-l-2 border-l-primary/30 pl-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
              <div className="font-medium">{"\uD83D\uDD17"} {syndromeMatch.syndrome.syndrome_name}</div>
              <div className="mt-0.5 pl-2">
                {syndromeMatch.requiredFinding}
                {syndromeMatch.supportingFindings.length > 0 && ` + ${syndromeMatch.supportingFindings.join(" + ")}`}
                {syndromeMatch.concordantGroups.length > 0 && ` in concordant dose groups`}
              </div>
              {syndromeMatch.relatedOrganMatches.length > 0 && (
                <div className="pl-2">Related organs: {syndromeMatch.relatedOrganMatches.join("; ")}</div>
              )}
              {syndromeMatch.relatedEndpointMatches.length > 0 && (
                <div className="pl-2">Related: {syndromeMatch.relatedEndpointMatches.join("; ")}</div>
              )}
              {syndromeMatch.exclusionWarning && (
                <div className="mt-0.5 pl-2 font-medium">{syndromeMatch.exclusionWarning}</div>
              )}
            </div>
          </CollapsiblePane>
        );
      })()}

      {/* Lab correlates (specimen-level) */}
      {(labCorrelation.hasData || labCorrelation.isLoading) && (
        <div data-pane="lab-correlates">
          <CollapsiblePane title="Lab correlates" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
            <LabCorrelatesPane correlations={labCorrelation.correlations} isLoading={labCorrelation.isLoading} specimen={specimen} />
          </CollapsiblePane>
        </div>
      )}

      {/* Laterality note (paired organs only) */}
      {lateralityInfo && (
        <CollapsiblePane title="Laterality" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground italic">
              Laterality: Predominantly {lateralityInfo.isUnilateral
                ? `${lateralityInfo.dominantSide}-sided (${lateralityInfo.dominantCount}/${lateralityInfo.affected} affected subjects)`
                : `${lateralitySummary(lateralityInfo.total)}`
              }
            </p>
            {lateralityInfo.isUnilateral && (
              <p className="text-[10px] text-muted-foreground italic">
                Unilateral findings in paired organs may suggest local etiology rather than systemic treatment effect.
              </p>
            )}
            {lateralityInfo.perFinding.length > 1 && (
              <div className="mt-1 space-y-0.5">
                {lateralityInfo.perFinding.map((pf) => (
                  <div key={pf.finding} className="flex items-baseline gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/70">{pf.finding}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{lateralitySummary(pf.agg)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CollapsiblePane>
      )}

      {/* Pathology Review (specimen-level) */}
      {studyId && (
        <PathologyReviewForm studyId={studyId} finding={`specimen:${specimen}`} defaultOpen />
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
                navigateTo({ organSystem: specimen });
                navigate(`/studies/${encodeURIComponent(studyId)}`, { state: { organ_system: specimen } });
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
                navigateTo({ organSystem: specimen });
                navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: specimen } });
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
                navigateTo({ organSystem: specimen });
                navigate(`/studies/${encodeURIComponent(studyId)}/noael-determination`, { state: { organ_system: specimen } });
              }
            }}
          >
            View NOAEL determination &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}

// ─── Recovery pane content ────────────────────────────────────────────────────

function RecoveryPaneContent({
  assessment,
  onSubjectClick,
  recoveryDays,
  allSubjects,
  onCompareSubjects,
}: {
  assessment: RecoveryAssessment;
  onSubjectClick?: (usubjid: string) => void;
  recoveryDays?: number | null;
  allSubjects?: SubjectHistopathEntry[];
  onCompareSubjects?: (subjectIds: string[]) => void;
}) {
  const visible = assessment.assessments.filter(
    (a) => a.verdict !== "not_observed" && a.verdict !== "no_data",
  );

  if (visible.length === 0) return null;

  return (
    <div>
      {visible.map((a, i) => (
        <Fragment key={a.doseLevel}>
          {i > 0 && <div className="border-t border-border/40 my-2" />}
          {/* E-5/v3: Container treatment per verdict tier */}
          {a.verdict === "not_examined" ? (
            <div className="rounded border border-red-300/20 bg-red-50/10 px-2 py-1.5 dark:border-red-500/15 dark:bg-red-900/5">
              <RecoveryDoseBlock
                assessment={a}
                onSubjectClick={onSubjectClick}
                recoveryDays={recoveryDays}
                allSubjects={allSubjects}
                onCompareSubjects={onCompareSubjects}
              />
            </div>
          ) : a.verdict === "anomaly" ? (
            <div className="rounded border border-amber-300/30 bg-amber-50/20 px-2 py-1.5 dark:border-amber-500/20 dark:bg-amber-900/10">
              <RecoveryDoseBlock
                assessment={a}
                onSubjectClick={onSubjectClick}
                recoveryDays={recoveryDays}
                allSubjects={allSubjects}
                onCompareSubjects={onCompareSubjects}
              />
            </div>
          ) : a.verdict === "insufficient_n" || a.verdict === "low_power" ? (
            <div className="rounded border border-border/30 bg-muted/10 px-2 py-1.5">
              <RecoveryDoseBlock
                assessment={a}
                onSubjectClick={onSubjectClick}
                recoveryDays={recoveryDays}
                allSubjects={allSubjects}
                onCompareSubjects={onCompareSubjects}
              />
            </div>
          ) : (
            <RecoveryDoseBlock
              assessment={a}
              onSubjectClick={onSubjectClick}
              recoveryDays={recoveryDays}
              allSubjects={allSubjects}
              onCompareSubjects={onCompareSubjects}
            />
          )}
        </Fragment>
      ))}
    </div>
  );
}

const SUBJECT_COLLAPSE_THRESHOLD = 4;

function RecoveryDoseBlock({
  assessment: a,
  onSubjectClick,
  recoveryDays,
  allSubjects,
  onCompareSubjects,
}: {
  assessment: RecoveryDoseAssessment;
  onSubjectClick?: (usubjid: string) => void;
  recoveryDays?: number | null;
  allSubjects?: SubjectHistopathEntry[];
  onCompareSubjects?: (subjectIds: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // E-6: Reset collapsed state on finding change (new subject set)
  const subjectIds = a.recovery.subjectDetails.map((s) => s.id).join(",");
  useEffect(() => {
    setExpanded(false);
  }, [subjectIds]);

  const shortId = (id: string) => {
    const parts = id.split("-");
    return parts[parts.length - 1] || id.slice(-4);
  };

  const periodLabel = recoveryDays != null
    ? recoveryDays >= 7
      ? `${Math.round(recoveryDays / 7)} week${Math.round(recoveryDays / 7) !== 1 ? "s" : ""} recovery`
      : `${recoveryDays} day${recoveryDays !== 1 ? "s" : ""} recovery`
    : null;

  // E-2: Inline delta computation (suppress for guard verdicts)
  const showDeltas = a.verdict !== "anomaly" && a.verdict !== "insufficient_n"
    && a.verdict !== "not_examined" && a.verdict !== "low_power";
  const incDelta = showDeltas && a.main.incidence > 0
    ? Math.round(((a.recovery.incidence - a.main.incidence) / a.main.incidence) * 100)
    : null;
  const sevDelta = showDeltas && a.main.avgSeverity > 0
    ? Math.round(((a.recovery.avgSeverity - a.main.avgSeverity) / a.main.avgSeverity) * 100)
    : null;

  // E-6: Collapsible subject list
  const subjects = a.recovery.subjectDetails;
  const visible = expanded ? subjects : subjects.slice(0, SUBJECT_COLLAPSE_THRESHOLD);
  const hiddenCount = subjects.length - SUBJECT_COLLAPSE_THRESHOLD;

  // E-1: Compare subject handlers
  const handleCompareRecovery = useCallback(() => {
    if (!onCompareSubjects) return;
    const ids = subjects.map((s) => s.id);
    onCompareSubjects(ids);
  }, [onCompareSubjects, subjects]);

  const handleCompareWithMain = useCallback(() => {
    if (!onCompareSubjects || !allSubjects) return;
    const recoveryIds = subjects.map((s) => s.id);
    const mainIds = allSubjects
      .filter((s) => s.dose_level === a.doseLevel && !s.is_recovery)
      .map((s) => s.usubjid);
    // Interleave recovery/main for balanced comparison
    const combined: string[] = [];
    const maxLen = Math.max(recoveryIds.length, mainIds.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < recoveryIds.length) combined.push(recoveryIds[i]);
      if (i < mainIds.length) combined.push(mainIds[i]);
    }
    // Deduplicate (same subjects could be in both arms)
    const unique = [...new Set(combined)];
    onCompareSubjects(unique);
  }, [onCompareSubjects, allSubjects, subjects, a.doseLevel]);

  const totalCompareCount = useMemo(() => {
    if (!allSubjects) return 0;
    const recoveryIds = subjects.map((s) => s.id);
    const mainIds = allSubjects
      .filter((s) => s.dose_level === a.doseLevel && !s.is_recovery)
      .map((s) => s.usubjid);
    return new Set([...recoveryIds, ...mainIds]).size;
  }, [allSubjects, subjects, a.doseLevel]);

  return (
    <div>
      {/* E-4: Enhanced dose label typography */}
      <div className="mb-1 pt-0.5">
        <span className="text-[11px] font-medium text-foreground">{a.doseGroupLabel}</span>
        {periodLabel && (
          <>
            <span className="mx-1 text-muted-foreground/30">{"\u00b7"}</span>
            <span className="text-[10px] text-muted-foreground">{periodLabel}</span>
          </>
        )}
      </div>

      {/* v3: not_examined — no data exists, short-circuit */}
      {a.verdict === "not_examined" ? (
        <div className="mt-1.5">
          <div className="text-[10px] font-medium text-foreground/70">
            {"\u2205"} Tissue not examined in recovery arm.
          </div>
          <div className="text-[10px] text-muted-foreground italic">
            None of the {a.recovery.n} recovery subject{a.recovery.n !== 1 ? "s" : ""} had this tissue evaluated. No reversibility assessment is possible.
          </div>
        </div>
      ) : a.verdict === "insufficient_n" ? (
        <div className="mt-1.5">
          <div className="text-[10px] font-medium text-foreground/70">
            {"\u2020"} Insufficient sample: only {a.recovery.examined} recovery subject{a.recovery.examined !== 1 ? "s" : ""} examined.
          </div>
          <div className="text-[10px] text-muted-foreground italic">
            Ratios with fewer than {MIN_RECOVERY_N} examined subjects are unreliable.
          </div>
        </div>
      ) : a.verdict === "low_power" ? (
        <div className="mt-1.5">
          <div className="text-[10px] font-medium text-foreground/70">
            ~ Low statistical power.
          </div>
          <div className="text-[10px] text-muted-foreground italic">
            Main-arm incidence ({Math.round(a.main.incidence * 100)}%) too low to assess reversibility with {a.recovery.examined} examined recovery subject{a.recovery.examined !== 1 ? "s" : ""}. Expected {"\u2248"}{(a.main.incidence * a.recovery.examined).toFixed(1)} affected; {a.recovery.affected} observed is not informative.
          </div>
        </div>
      ) : (
        <>
          {/* E-2: Inline delta comparison lines */}
          <div className="space-y-1 text-[10px]">
            {/* Incidence line: main → recovery with delta (v3: examination-aware fractions) */}
            <div className="flex items-center flex-wrap gap-x-1">
              <span className="text-muted-foreground shrink-0">Incidence</span>
              <span className="font-mono text-muted-foreground">
                {formatRecoveryFraction(a.main.affected, a.main.examined, a.main.n)}
              </span>
              <div
                className="inline-block h-1.5 rounded-full bg-gray-400"
                style={{ width: `${Math.min(a.main.incidence * 48, 48)}px` }}
              />
              <span className="text-muted-foreground/40">{"\u2192"}</span>
              <span className="font-mono text-foreground">
                {formatRecoveryFraction(a.recovery.affected, a.recovery.examined, a.recovery.n)}
              </span>
              <div
                className="inline-block h-1.5 rounded-full bg-gray-400/50"
                style={{ width: `${Math.min(a.recovery.incidence * 48, 48)}px` }}
              />
              {incDelta != null && (
                <span className={cn(
                  "ml-1 font-mono",
                  incDelta > 0 ? "font-medium text-foreground/70" :
                  incDelta < 0 ? "text-muted-foreground" :
                  "text-muted-foreground/50",
                )}>
                  {verdictArrow(a.verdict)} {incDelta > 0 ? "+" : ""}{incDelta}%
                </span>
              )}
            </div>

            {/* Severity line: main → recovery with delta */}
            <div className="flex items-center flex-wrap gap-x-1">
              <span className="text-muted-foreground shrink-0">Severity</span>
              <span className="font-mono text-muted-foreground">
                avg {a.main.avgSeverity.toFixed(1)}
              </span>
              <span className="text-muted-foreground/40">{"\u2192"}</span>
              <span className="font-mono text-foreground">
                avg {a.recovery.avgSeverity.toFixed(1)}
              </span>
              {sevDelta != null && (
                <span className={cn(
                  "ml-1 font-mono",
                  sevDelta > 0 ? "font-medium text-foreground/70" :
                  sevDelta < 0 ? "text-muted-foreground" :
                  "text-muted-foreground/50",
                )}>
                  {verdictArrow(a.verdict)} {sevDelta > 0 ? "+" : ""}{sevDelta}%
                </span>
              )}
            </div>
          </div>

          {/* Assessment */}
          <div className="mt-1.5 text-[10px]">
            <span className="text-muted-foreground">Assessment: </span>
            <span className="font-medium">{a.verdict}</span>
          </div>

          {/* E-5: Anomaly explanation text (two-line format) */}
          {a.verdict === "anomaly" && (
            <div className="mt-1.5">
              <div className="text-[10px] font-medium text-foreground/70">
                {"\u26A0"} Anomaly: recovery incidence {Math.round(a.recovery.incidence * 100)}% at a dose level where main arm had 0%.
              </div>
              <div className="text-[10px] text-muted-foreground italic">
                This may indicate delayed onset or a data quality issue. Requires pathologist assessment.
              </div>
            </div>
          )}

          {/* E-3/E-6: Recovery subjects with severity trajectories and collapsible list */}
          <div className="mt-1 text-[10px] text-muted-foreground">
            {subjects.length > 0 ? (
              <>
                Recovery subjects:{" "}
                {visible.map((s, i) => {
                  // E-3: Severity trajectory
                  const mainPart = s.mainArmSeverity !== null
                    ? `${s.mainArmSeverity}`
                    : s.mainArmAvgSeverity > 0
                      ? `avg ${s.mainArmAvgSeverity.toFixed(1)}`
                      : "\u2014";
                  const unexpected = s.mainArmSeverity !== null
                    ? s.severity >= s.mainArmSeverity
                    : s.mainArmAvgSeverity > 0
                      ? s.severity >= s.mainArmAvgSeverity
                      : false;

                  return (
                    <span key={s.id}>
                      {i > 0 && ", "}
                      <button
                        className="text-primary hover:underline"
                        onClick={() => onSubjectClick?.(s.id)}
                      >
                        {shortId(s.id)}
                      </button>
                      <span className={cn("font-mono", unexpected ? "font-medium" : "text-muted-foreground")}>
                        {" "}({mainPart}
                        <span className="text-muted-foreground/40"> {"\u2192"} </span>
                        {s.severity})
                      </span>
                    </span>
                  );
                })}
                {/* E-6: Collapse toggle */}
                {hiddenCount > 0 && (
                  <>
                    {" "}
                    <button
                      className="text-[10px] text-primary hover:underline"
                      onClick={() => setExpanded((p) => !p)}
                    >
                      {expanded ? "Show fewer" : `+${hiddenCount} more`}
                    </button>
                  </>
                )}
              </>
            ) : (
              <>none affected (0/{a.recovery.examined} examined{a.recovery.examined < a.recovery.n ? ` of ${a.recovery.n}` : ""})</>
            )}
          </div>

          {/* E-1: Compare action links */}
          {onCompareSubjects && subjects.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
              <button
                className="text-primary hover:underline cursor-pointer"
                onClick={handleCompareRecovery}
              >
                Compare recovery subjects
              </button>
              <span className="text-muted-foreground/30">{"\u00b7"}</span>
              <button
                className="text-primary hover:underline cursor-pointer"
                onClick={handleCompareWithMain}
              >
                Compare with main arm
              </button>
              {totalCompareCount > 0 && (
                <span className="text-muted-foreground/50">({totalCompareCount})</span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Finding Detail (when finding is selected) ───────────────────────────────

function FindingDetailPane({
  selection,
  lesionData,
  ruleResults,
  studyId,
}: {
  selection: HistopathSelection & { finding: string };
  lesionData: LesionSeverityRow[];
  ruleResults: RuleResult[];
  studyId?: string;
}) {
  const navigate = useNavigate();
  const { navigateTo } = useStudySelection();
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();
  const { setSelectedSubject, setPendingCompare } = useViewSelection();

  // Recovery assessment
  const { data: subjData } = useHistopathSubjects(studyId, selection.specimen);
  const specimenHasRecovery = useMemo(
    () => subjData?.subjects?.some((s) => s.is_recovery) ?? false,
    [subjData],
  );
  const findingRecovery = useMemo(() => {
    if (!specimenHasRecovery || !subjData?.subjects) return null;
    const assessments = deriveRecoveryAssessments([selection.finding], subjData.subjects, undefined, subjData.recovery_days);
    return assessments[0] ?? null;
  }, [specimenHasRecovery, subjData, selection.finding]);

  // Hooks for pattern & syndrome (finding-level)
  const { data: trendData } = useFindingDoseTrends(studyId);
  const { data: signalDataFinding } = useStudySignalSummary(studyId);
  const { data: studyCtx } = useStudyContext(studyId);
  const findingSyndromeMatch = useMemo(() => {
    if (!lesionData.length) return null;
    const organMap = new Map<string, LesionSeverityRow[]>();
    for (const r of lesionData) {
      if (!r.specimen) continue;
      const key = r.specimen.toUpperCase();
      const arr = organMap.get(key) ?? [];
      arr.push(r);
      organMap.set(key, arr);
    }
    const matches = detectSyndromes(organMap, signalDataFinding ?? null, studyCtx);
    // Find syndrome relevant to current specimen
    return matches.find(
      (m) => m.organ.toUpperCase() === selection.specimen.toUpperCase(),
    ) ?? null;
  }, [lesionData, signalDataFinding, selection.specimen, studyCtx]);

  // Recovery classification (interpretive layer)
  const recoveryClassification = useMemo(() => {
    if (!findingRecovery) return null;
    // Gather context
    const findingLower = selection.finding.toLowerCase();
    const specLower = selection.specimen.toLowerCase();
    const findingRulesLocal = ruleResults.filter(
      (r) =>
        (r.params?.finding && r.params.finding.toLowerCase().includes(findingLower)) &&
        (r.params?.specimen && r.params.specimen.toLowerCase() === specLower),
    );
    const isAdverse = findingRulesLocal.some(
      (r) =>
        r.rule_id === "R04" || r.rule_id === "R12" || r.rule_id === "R13" ||
        (r.rule_id === "R10" && r.severity === "warning"),
    );
    const findingLat = subjData?.subjects ? aggregateFindingLaterality(subjData.subjects, selection.finding) : null;
    const findingPattern = classifyFindingPattern(
      lesionData.filter((r) => r.specimen === selection.specimen),
      selection.finding,
      trendData?.find((t: { finding: string; specimen: string }) => t.finding === selection.finding && t.specimen === selection.specimen)?.ca_trend_p ?? null,
      null,
      false,
      findingLat,
    );
    const doseConsistency = patternToLegacyConsistency(findingPattern.pattern, findingPattern.confidence);
    const trend = trendData?.find(
      (t: { finding: string; specimen: string }) =>
        t.finding === selection.finding && t.specimen === selection.specimen,
    );
    const clinicalRule = ruleResults.find(
      (r) =>
        r.params?.clinical_class &&
        r.params?.finding?.toLowerCase().includes(findingLower) &&
        r.params?.specimen?.toLowerCase() === specLower,
    );
    const clinicalClass = clinicalRule?.params?.clinical_class ?? null;
    const signalClass: "adverse" | "warning" | "normal" = isAdverse
      ? "adverse"
      : clinicalClass
        ? "warning"
        : "normal";

    const findingNature = classifyFindingNature(selection.finding);

    return classifyRecovery(findingRecovery, {
      isAdverse,
      doseConsistency,
      doseResponsePValue: trend?.ca_trend_p ?? null,
      clinicalClass,
      signalClass,
      findingNature,
      historicalControlIncidence: null,
      crossDomainCorroboration: null,
      recoveryPeriodDays: subjData?.recovery_days ?? null,
    });
  }, [findingRecovery, ruleResults, lesionData, trendData, selection, subjData]);

  // Show recovery insight when: classification exists AND (not UNCLASSIFIABLE, or UNCLASSIFIABLE with not_examined/low_power)
  const showRecoveryInsight = useMemo(() => {
    if (!recoveryClassification) return false;
    if (recoveryClassification.classification !== "UNCLASSIFIABLE") return true;
    // Show UNCLASSIFIABLE for informative guard verdicts
    const verdict = findingRecovery?.overall;
    return verdict === "not_examined" || verdict === "low_power";
  }, [recoveryClassification, findingRecovery]);

  const onSubjectClick = useCallback(
    (usubjid: string) => setSelectedSubject(usubjid),
    [setSelectedSubject],
  );

  // E-1: Compare callback — sets pendingCompare in ViewSelectionContext
  const onCompareSubjects = useCallback(
    (subjectIds: string[]) => setPendingCompare(subjectIds),
    [setPendingCompare],
  );

  // Historical control lookup for this finding — context-aware when StudyContext available
  const historicalContext = useMemo(() => {
    // Compute control group incidence from lesion data
    const controlRows = lesionData.filter(
      (r) =>
        r.finding === selection.finding &&
        r.specimen === selection.specimen &&
        r.dose_level === 0 &&
        !r.dose_label.toLowerCase().includes("recovery"),
    );
    let affected = 0;
    let n = 0;
    for (const r of controlRows) {
      affected += r.affected;
      n += r.n;
    }
    const controlInc = n > 0 ? affected / n : 0;

    // Context-aware lookup (IMP-02)
    if (studyCtx) {
      // Determine sex from the data for this finding, default to "M"
      const sexes = [...new Set(controlRows.map(r => r.sex))];
      const sex: "M" | "F" = sexes.includes("F") && !sexes.includes("M") ? "F" : "M";
      const result = queryHistoricalControl({
        finding: selection.finding,
        specimen: selection.specimen,
        sex,
        context: studyCtx,
      });
      if (!result) return null;
      const cls = classifyControlVsHCD(controlInc, result);
      const statusMap: Record<string, HCDStatus> = {
        ABOVE: "above_range", WITHIN: "within_range", BELOW: "below_range",
      };
      return {
        hcd: null as HistoricalControlData | null,
        hcdResult: result,
        controlInc,
        status: statusMap[cls] ?? ("no_data" as HCDStatus),
      };
    }

    // Legacy fallback
    const organName = selection.specimen.toLowerCase().replace(/_/g, " ");
    const hcd = getHistoricalControl(selection.finding, organName);
    if (!hcd) return null;
    const status = classifyVsHCD(controlInc, hcd);
    return { hcd, hcdResult: null as HistoricalControlResult | null, controlInc, status };
  }, [lesionData, selection, studyCtx]);

  // Dose-level detail for selected finding
  const findingRows = useMemo(() => {
    return lesionData
      .filter((r) => r.finding === selection.finding && r.specimen === selection.specimen)
      .sort((a, b) => a.dose_level - b.dose_level || a.sex.localeCompare(b.sex));
  }, [lesionData, selection]);

  // Header metrics for selected finding
  const headerMetrics = useMemo(() => {
    if (!findingRows.length) return null;
    let maxSev = 0;
    let maxInc = 0;
    const sexes = new Set<string>();
    for (const r of findingRows) {
      if (r.severity_status === "graded" && r.avg_severity! > maxSev) maxSev = r.avg_severity!;
      if (r.incidence > maxInc) maxInc = r.incidence;
      sexes.add(r.sex);
    }
    const findingPattern = classifyFindingPattern(findingRows, selection.finding, null, null, false);
    const doseTrend = formatPatternLabel(findingPattern);
    const sexLabel = sexes.size === 1 ? ([...sexes][0] === "M" ? "M" : "F") : "M/F";
    const incPct = Math.round(maxInc * 100);
    return { incPct, maxSev, doseTrend, sexLabel, findingPattern };
  }, [findingRows, selection.finding]);

  // Rules matching finding
  const findingRules = useMemo(() => {
    const organSystem = specimenToOrganSystem(selection.specimen);
    const findingLower = selection.finding.toLowerCase();
    const specimenLower = selection.specimen.toLowerCase();
    const organFiltered = organSystem !== "general"
      ? ruleResults.filter((r) => r.organ_system === organSystem)
      : ruleResults;
    return organFiltered.filter(
      (r) =>
        r.rule_id !== "R12" && r.rule_id !== "R13" &&
        ((r.params?.finding && r.params.finding.toLowerCase().includes(findingLower)) ||
        (r.params?.specimen && r.params.specimen.toLowerCase().includes(specimenLower)) ||
        r.context_key.toLowerCase().includes(specimenLower.replace(/[, ]+/g, "_")))
    );
  }, [ruleResults, selection]);

  // Correlating evidence
  const correlating = useMemo(() => {
    const otherFindings = lesionData
      .filter((r) => r.specimen === selection.specimen && r.finding !== selection.finding);
    const unique = new Map<string, { maxSev: number; count: number }>();
    for (const r of otherFindings) {
      const existing = unique.get(r.finding);
      if (existing) {
        existing.count++;
        if (r.severity_status === "graded" && r.avg_severity! > existing.maxSev) existing.maxSev = r.avg_severity!;
      } else {
        unique.set(r.finding, { maxSev: r.severity_status === "graded" ? r.avg_severity! : 0, count: 1 });
      }
    }
    return [...unique.entries()]
      .sort((a, b) => b[1].maxSev - a[1].maxSev)
      .slice(0, 10);
  }, [lesionData, selection]);

  // Cross-organ matches: same finding in other specimens (R16)
  const crossOrganMatches = useMemo(() => {
    const findingLower = selection.finding.toLowerCase();
    const otherRows = lesionData.filter(
      (r) => r.finding.toLowerCase() === findingLower && r.specimen !== selection.specimen,
    );
    const bySpec = new Map<string, { incidence: number; maxSev: number }>();
    for (const r of otherRows) {
      const existing = bySpec.get(r.specimen);
      if (existing) {
        if (r.incidence > existing.incidence) existing.incidence = r.incidence;
        if (r.severity_status === "graded" && r.avg_severity! > existing.maxSev) existing.maxSev = r.avg_severity!;
      } else {
        bySpec.set(r.specimen, { incidence: r.incidence, maxSev: r.severity_status === "graded" ? r.avg_severity! : 0 });
      }
    }
    return [...bySpec.entries()]
      .map(([specimen, stats]) => ({ specimen, incidence: stats.incidence, maxSev: stats.maxSev }))
      .sort((a, b) => b.incidence - a.incidence)
      .slice(0, 8);
  }, [lesionData, selection]);

  // Sex summary
  const sexSummary = useMemo(() => {
    const rows = lesionData.filter(
      (r) => r.finding === selection.finding && r.specimen === selection.specimen
    );
    const bySex = new Map<string, { affected: number; total: number; maxSev: number }>();
    for (const r of rows) {
      const existing = bySex.get(r.sex);
      if (existing) {
        existing.affected += r.affected;
        existing.total += r.n;
        if (r.severity_status === "graded" && r.avg_severity! > existing.maxSev) existing.maxSev = r.avg_severity!;
      } else {
        bySex.set(r.sex, { affected: r.affected, total: r.n, maxSev: r.severity_status === "graded" ? r.avg_severity! : 0 });
      }
    }
    return bySex;
  }, [lesionData, selection]);

  // Fisher's exact test for sex difference (uses highest-affected dose group where both sexes have n > 0)
  const sexFisherP = useMemo(() => {
    if (!sexSummary || sexSummary.size < 2) return null;
    const findingRows = lesionData.filter(
      (r) => r.finding === selection.finding && r.specimen === selection.specimen
    );
    // Group by dose level and sex
    const byDoseSex = new Map<number, Map<string, { affected: number; n: number }>>();
    for (const r of findingRows) {
      let sexMap = byDoseSex.get(r.dose_level);
      if (!sexMap) { sexMap = new Map(); byDoseSex.set(r.dose_level, sexMap); }
      const existing = sexMap.get(r.sex);
      if (existing) { existing.affected += r.affected; existing.n += r.n; }
      else sexMap.set(r.sex, { affected: r.affected, n: r.n });
    }
    // Find highest-affected dose group where both M and F have n > 0
    let bestDose: number | null = null;
    let bestTotal = 0;
    for (const [dl, sexMap] of byDoseSex) {
      const m = sexMap.get("M");
      const f = sexMap.get("F");
      if (!m || !f || m.n === 0 || f.n === 0) continue;
      const total = m.affected + f.affected;
      if (total > bestTotal) { bestTotal = total; bestDose = dl; }
    }
    if (bestDose === null) return null;
    const sexMap = byDoseSex.get(bestDose)!;
    const m = sexMap.get("M")!;
    const f = sexMap.get("F")!;
    // 2×2 table: maleAffected, maleUnaffected, femaleAffected, femaleUnaffected
    return fishersExact2x2(m.affected, m.n - m.affected, f.affected, f.n - f.affected);
  }, [lesionData, selection, sexSummary]);

  // Lab correlation (finding-level)
  const findingLabCorrelation = useSpecimenLabCorrelation(studyId, selection.specimen, selection.finding);

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{selection.finding}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <p className="text-xs text-muted-foreground">{selection.specimen}</p>
        {headerMetrics && (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
            <span>Peak incidence: <span className="font-mono font-medium">{headerMetrics.incPct}%</span></span>
            <span>Max sev: <span className="font-mono font-medium">{headerMetrics.maxSev.toFixed(1)}</span></span>
            <span>Pattern: <span className="font-medium">{headerMetrics.doseTrend}</span></span>
            <span>Sex: <span className="font-medium">{headerMetrics.sexLabel}</span></span>
          </div>
        )}
      </div>

      {/* Insights */}
      <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <SpecimenInsightsWithSignals rules={findingRules} specimen={selection.specimen} studyId={studyId} />
        {showRecoveryInsight && recoveryClassification && (
          <div className="mt-2.5">
            <RecoveryInsightBlock classification={recoveryClassification} />
          </div>
        )}
        {historicalContext && (() => {
          const r = historicalContext.hcdResult;
          const h = historicalContext.hcd;
          const rangeLow = r ? Math.round(r.range[0] * 100) : h ? Math.round(h.min_incidence * 100) : 0;
          const rangeHigh = r ? Math.round(r.range[1] * 100) : h ? Math.round(h.max_incidence * 100) : 0;
          const meanPct = r ? Math.round(r.meanIncidence * 100) : h ? Math.round(h.mean_incidence * 100) : 0;
          const nStudies = r?.nStudies ?? h?.n_studies ?? 0;
          const isMock = r ? r.isMock : true;
          const contextLabel = r?.contextLabel ?? null;
          return (
            <div className="mt-2.5 border-l-2 border-l-gray-300/40 py-0.5 pl-2">
              <div className="text-[10px] leading-snug text-muted-foreground">
                {(historicalContext.status === "above_range" || historicalContext.status === "at_upper") && (
                  <span className="mr-1">{"\u26A0"}</span>
                )}
                Historical context{" "}
                {isMock
                  ? <span className="text-amber-600">(mock)</span>
                  : <span className="text-emerald-600">(published)</span>
                }
                : Control incidence {Math.round(historicalContext.controlInc * 100)}% is{" "}
                <span className="font-medium">{HCD_STATUS_LABELS[historicalContext.status].toLowerCase()}</span>
                {" "}({rangeLow}{"\u2013"}{rangeHigh}%,
                mean {meanPct}%,
                n={nStudies} studies)
                {contextLabel && (
                  <span className="block mt-0.5 text-[9px] text-muted-foreground/60">{contextLabel}</span>
                )}
              </div>
            </div>
          );
        })()}
      </CollapsiblePane>

      {/* Dose-response pattern block (§6e) */}
      {headerMetrics?.findingPattern && (
        <CollapsiblePane title="Dose-response pattern" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <div className="border-l-2 border-l-muted-foreground/30 pl-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
            <div>Pattern: <span className="font-medium">{headerMetrics.findingPattern.detail ?? headerMetrics.findingPattern.pattern.replace(/_/g, " ").toLowerCase()}</span></div>
            <div>Confidence: <span className="font-medium">{headerMetrics.findingPattern.confidence.toLowerCase()}</span>
              {headerMetrics.findingPattern.confidenceFactors.length > 0 && (
                <span className="text-muted-foreground/60"> ({headerMetrics.findingPattern.confidenceFactors.join(", ")})</span>
              )}
            </div>
            {headerMetrics.findingPattern.alerts.length > 0 && (
              <div className="mt-0.5">
                {headerMetrics.findingPattern.alerts.map((a, i) => (
                  <div key={i}>{a.priority === "HIGH" ? "\u26A0" : "\u2139\uFE0F"} {a.text}</div>
                ))}
              </div>
            )}
          </div>
        </CollapsiblePane>
      )}

      {/* Concordant findings block (§6e) — when syndrome detected */}
      {findingSyndromeMatch && (
        <CollapsiblePane title="Concordant findings" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <div className="border-l-2 border-l-primary/30 pl-2 py-1 text-[10px] leading-relaxed text-muted-foreground">
            <div className="font-medium">{"\uD83D\uDD17"} {findingSyndromeMatch.syndrome.syndrome_name}</div>
            <div className="mt-0.5 pl-2">
              Primary: <span className="font-medium">{findingSyndromeMatch.requiredFinding}</span>
              {findingSyndromeMatch.concordantGroups.length > 0 && (
                <span className="text-muted-foreground/60"> (Grp {findingSyndromeMatch.concordantGroups.join(", ")})</span>
              )}
            </div>
            {findingSyndromeMatch.supportingFindings.length > 0 && (
              <div className="pl-2">Supporting: <span className="font-medium">{findingSyndromeMatch.supportingFindings.join(", ")}</span></div>
            )}
            {findingSyndromeMatch.relatedOrganMatches.length > 0 && (
              <div className="pl-2">Related organs: {findingSyndromeMatch.relatedOrganMatches.join("; ")}</div>
            )}
            {findingSyndromeMatch.relatedEndpointMatches.length > 0 && (
              <div className="pl-2">Related: {findingSyndromeMatch.relatedEndpointMatches.join("; ")}</div>
            )}
            {findingSyndromeMatch.exclusionWarning && (
              <div className="mt-0.5 pl-2 font-medium">{findingSyndromeMatch.exclusionWarning}</div>
            )}
            <div className="mt-1 pl-2 italic text-muted-foreground/60">{findingSyndromeMatch.syndrome.interpretation_note}</div>
          </div>
        </CollapsiblePane>
      )}

      {/* Dose detail */}
      <CollapsiblePane title="Dose detail" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {findingRows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No data.</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead className="bg-background">
              <tr className="border-b text-muted-foreground">
                <th className="pb-0.5 text-left text-[10px] font-semibold uppercase tracking-wider">Dose</th>
                <th className="pb-0.5 text-left text-[10px] font-semibold uppercase tracking-wider">Sex</th>
                <th className="pb-0.5 text-right text-[10px] font-semibold uppercase tracking-wider">Incid.</th>
                <th className="w-12 pb-0.5 text-[10px] font-semibold uppercase tracking-wider" />
                <th className="pb-0.5 text-right text-[10px] font-semibold uppercase tracking-wider">Avg sev</th>
                <th className="pb-0.5 text-center text-[10px] font-semibold uppercase tracking-wider">Sev</th>
              </tr>
            </thead>
            <tbody>
              {findingRows.map((row, i) => {
                const incPct = row.n > 0 ? (row.affected / row.n) * 100 : 0;
                return (
                  <tr key={i} className="border-b border-dashed">
                    <td className="py-0.5">
                      <DoseLabel level={row.dose_level} label={formatDoseShortLabel(row.dose_label)} />
                    </td>
                    <td className="py-0.5">{row.sex}</td>
                    <td className="py-0.5 text-right font-mono">
                      {row.affected}/{row.n}
                    </td>
                    <td className="py-0.5 px-1">
                      <div className="h-1.5 w-full rounded-full bg-gray-100">
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${Math.min(incPct, 100)}%`, backgroundColor: getDoseGroupColor(row.dose_level) }}
                          title={`${Math.round(incPct)}%`}
                        />
                      </div>
                    </td>
                    <td className="py-0.5 text-right">
                      <span className="rounded px-1 font-mono text-[9px]">
                        {row.avg_severity != null ? row.avg_severity.toFixed(1) : "\u2014"}
                      </span>
                    </td>
                    <td className="py-0.5 text-center">
                      <span
                        className="text-[9px] font-medium"
                        style={{ color: row.severity === "adverse" ? "#dc2626" : row.severity === "warning" ? "#d97706" : "#16a34a" }}
                      >
                        {row.severity}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CollapsiblePane>

      {/* Result modifiers (SUPP) */}
      {(() => {
        const modRow = findingRows.find((r) => r.dominant_distribution != null || r.dominant_temporality != null || (r.modifier_raw && r.modifier_raw.length > 0));
        if (!modRow) return null;
        // Aggregate distribution counts across dose rows
        const distCounts: Record<string, number> = {};
        const tempCounts: Record<string, number> = {};
        for (const r of findingRows) {
          if (r.modifier_counts) {
            for (const [k, v] of Object.entries(r.modifier_counts)) {
              distCounts[k] = (distCounts[k] ?? 0) + v;
            }
          }
        }
        // Use dominant_temporality from first row that has it
        const tempRow = findingRows.find((r) => r.dominant_temporality != null);
        if (tempRow?.dominant_temporality) tempCounts[tempRow.dominant_temporality] = modRow.n_with_modifiers ?? 0;
        const hasDist = Object.keys(distCounts).length > 0;
        const hasTemp = Object.keys(tempCounts).length > 0;
        const rawValues = modRow.modifier_raw ?? [];
        return (
          <CollapsiblePane title="Result modifiers (SUPP)" expandAll={expandGen} collapseAll={collapseGen}>
            <div className="space-y-1 text-[11px]">
              {hasDist && (
                <div className="flex items-baseline gap-1.5">
                  <span className="w-16 shrink-0 text-[10px] text-muted-foreground/70">Distribution</span>
                  <span className="text-[10px] text-muted-foreground">
                    {Object.entries(distCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}
                  </span>
                </div>
              )}
              {hasTemp && (
                <div className="flex items-baseline gap-1.5">
                  <span className="w-16 shrink-0 text-[10px] text-muted-foreground/70">Temporality</span>
                  <span className="text-[10px] text-muted-foreground">
                    {Object.entries(tempCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}
                  </span>
                </div>
              )}
              {rawValues.length > 0 && (
                <p className="text-[9px] italic text-muted-foreground/50">
                  Source: {rawValues.length} unique modifier value{rawValues.length !== 1 ? "s" : ""} from SUPP{modRow.domain}
                </p>
              )}
            </div>
          </CollapsiblePane>
        );
      })()}

      {/* Sex summary */}
      {sexSummary && sexSummary.size > 1 && (
        <CollapsiblePane title="Sex comparison" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-1 text-[11px]">
            {[...sexSummary.entries()].map(([sex, stats]) => (
              <div key={sex} className="flex items-center justify-between">
                <span className="text-muted-foreground">{sex === "M" ? "Males" : sex === "F" ? "Females" : sex}</span>
                <span className="tabular-nums">
                  {stats.affected}/{stats.total} affected
                  {stats.maxSev > 0 && (
                    <span
                      className="ml-1.5 rounded px-1 font-mono text-[9px]"
                      style={{ backgroundColor: getNeutralHeatColor(stats.maxSev).bg, color: getNeutralHeatColor(stats.maxSev).text }}
                    >
                      sev {stats.maxSev.toFixed(1)}
                    </span>
                  )}
                </span>
              </div>
            ))}
            {sexFisherP !== null && sexFisherP < 0.05 && (
              <div className={cn(
                "mt-1 font-mono text-[10px]",
                sexFisherP < 0.01
                  ? "font-medium text-foreground/70"
                  : "font-medium text-muted-foreground",
              )}>
                Sex difference: p = {sexFisherP < 0.001 ? "<0.001" : sexFisherP.toFixed(3)} (Fisher&apos;s exact)
              </div>
            )}
          </div>
        </CollapsiblePane>
      )}

      {/* Recovery */}
      {findingRecovery &&
        findingRecovery.assessments.some(
          (a) => a.verdict !== "not_observed" && a.verdict !== "no_data",
        ) && (
          <CollapsiblePane
            title="Recovery"
            defaultOpen
            expandAll={expandGen}
            collapseAll={collapseGen}
          >
            <RecoveryPaneContent
              assessment={findingRecovery}
              onSubjectClick={onSubjectClick}
              recoveryDays={subjData?.recovery_days}
              allSubjects={subjData?.subjects}
              onCompareSubjects={onCompareSubjects}
            />
          </CollapsiblePane>
        )}

      {/* Correlating evidence */}
      <CollapsiblePane title="Correlating evidence" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {/* In this specimen */}
        {correlating.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No other findings in this specimen.</p>
        ) : (
          <div className="space-y-0.5">
            {correlating.map(([finding, info]) => (
              <div key={finding} className="flex items-center justify-between text-[11px]">
                <span className="truncate" title={finding}>
                  {finding.length > 25 ? finding.slice(0, 25) + "\u2026" : finding}
                </span>
                <span
                  className="rounded px-1 font-mono text-[9px]"
                  style={{ backgroundColor: getNeutralHeatColor(info.maxSev).bg, color: getNeutralHeatColor(info.maxSev).text }}
                >
                  {info.maxSev.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
        {/* In other specimens (same finding) — R16 cross-organ */}
        {crossOrganMatches.length > 0 && (
          <div className="mt-2">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              In other specimens (same finding)
            </div>
            <div className="space-y-0.5">
              {crossOrganMatches.map((m) => (
                <button
                  key={m.specimen}
                  type="button"
                  className="w-full text-left text-[11px] transition-colors hover:bg-muted/40"
                  onClick={() => {
                    const organ = specimenToOrganSystem(m.specimen);
                    navigateTo({ organSystem: organ, specimen: m.specimen, endpoint: selection.finding });
                  }}
                  title={`Navigate to ${m.specimen}`}
                >
                  <span className="text-primary/70 hover:underline">
                    {m.specimen.length > 20 ? m.specimen.slice(0, 20) + "\u2026" : m.specimen}
                  </span>
                  <span className="text-muted-foreground">: {selection.finding}</span>
                  <span className="text-[9px] text-muted-foreground"> {"\u00B7"} {Math.round(m.incidence * 100)}% incidence, max sev {m.maxSev.toFixed(1)}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CollapsiblePane>

      {/* Lab correlates (finding-level) */}
      {(findingLabCorrelation.hasData || findingLabCorrelation.isLoading) && (
        <CollapsiblePane title="Lab correlates" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <LabCorrelatesPane correlations={findingLabCorrelation.correlations} isLoading={findingLabCorrelation.isLoading} specimen={selection.specimen} finding={selection.finding} />
        </CollapsiblePane>
      )}

      {/* Finding-level laterality note */}
      {isPairedOrgan(selection.specimen) && subjData?.subjects && (() => {
        const agg = aggregateFindingLaterality(subjData.subjects, selection.finding);
        if (agg.left === 0 && agg.right === 0 && agg.bilateral === 0) return null;
        const unilateral = agg.left + agg.right;
        const affected = unilateral + agg.bilateral;
        const isUnilateral = affected > 0 && unilateral / affected >= 0.7;
        const dominantSide = agg.left >= agg.right ? "left" : "right";
        const dominantCount = Math.max(agg.left, agg.right);
        return (
          <CollapsiblePane title="Laterality" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
            <div className="space-y-1">
              <p className="text-[10px] text-muted-foreground italic">
                Laterality: {isUnilateral
                  ? `Predominantly ${dominantSide}-sided (${dominantCount}/${affected} affected subjects)`
                  : lateralitySummary(agg)
                }
              </p>
              {isUnilateral && (
                <p className="text-[10px] text-muted-foreground italic">
                  Unilateral findings in paired organs may suggest local etiology rather than systemic treatment effect.
                </p>
              )}
            </div>
          </CollapsiblePane>
        );
      })()}

      {/* Pathology Review */}
      {studyId && (
        <PathologyReviewForm studyId={studyId} finding={selection.finding} defaultOpen />
      )}

      {/* Tox Assessment */}
      {studyId && (
        <ToxFindingForm studyId={studyId} endpointLabel={selection.finding} />
      )}

      {/* Cross-view links */}
      <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-1 text-[11px]">
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) {
                navigateTo({ organSystem: selection.specimen });
                navigate(`/studies/${encodeURIComponent(studyId)}`, { state: { organ_system: selection.specimen } });
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
                navigateTo({ organSystem: selection.specimen });
                navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: selection.specimen } });
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
                navigateTo({ organSystem: selection.specimen });
                navigate(`/studies/${encodeURIComponent(studyId)}/noael-determination`, { state: { organ_system: selection.specimen } });
              }
            }}
          >
            View NOAEL determination &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function HistopathologyContextPanel({ lesionData, ruleResults, selection, studyId: studyIdProp, pathReviews }: Props) {
  const { studyId: studyIdParam } = useParams<{ studyId: string }>();
  const studyId = studyIdProp ?? studyIdParam;

  if (!selection || !selection.specimen) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select a specimen or finding to view details.
      </div>
    );
  }

  // Finding-level view
  if (selection.finding) {
    return (
      <FindingDetailPane
        selection={selection as HistopathSelection & { finding: string }}
        lesionData={lesionData}
        ruleResults={ruleResults}
        studyId={studyId}
      />
    );
  }

  // Specimen-level overview
  return (
    <SpecimenOverviewPane
      specimen={selection.specimen}
      lesionData={lesionData}
      ruleResults={ruleResults}
      studyId={studyId}
      pathReviews={pathReviews}
    />
  );
}
