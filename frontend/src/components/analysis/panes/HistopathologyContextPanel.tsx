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
import { getDoseConsistencyWeight, getDoseGroupColor } from "@/lib/severity-colors";
import { DoseLabel } from "@/components/ui/DoseLabel";
import {
  deriveSpecimenSummaries,
  deriveSexLabel,
  getDoseConsistency,
  deriveSpecimenReviewStatus,
} from "@/components/analysis/HistopathologyView";
import type { SpecimenReviewStatus } from "@/components/analysis/HistopathologyView";
import { aggregateByFinding } from "@/lib/finding-aggregation";
import type { LesionSeverityRow, RuleResult } from "@/types/analysis-views";
import type { PathologyReview } from "@/types/annotations";
import { getNeutralHeatColor } from "@/components/analysis/HistopathologyView";
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { deriveRecoveryAssessments, MIN_RECOVERY_N, verdictArrow, formatRecoveryFraction } from "@/lib/recovery-assessment";
import type { RecoveryAssessment, RecoveryDoseAssessment } from "@/lib/recovery-assessment";
import type { SubjectHistopathEntry } from "@/types/timecourse";
import { classifyRecovery, CLASSIFICATION_LABELS, CLASSIFICATION_BORDER } from "@/lib/recovery-classification";
import type { RecoveryClassification } from "@/lib/recovery-classification";
import { classifyFindingNature } from "@/lib/finding-nature";
import { getHistoricalControl, classifyVsHCD, HCD_STATUS_LABELS } from "@/lib/mock-historical-controls";
import { getFindingDoseConsistency } from "@/components/analysis/HistopathologyView";
import { useFindingDoseTrends } from "@/hooks/useFindingDoseTrends";
import { fishersExact2x2 } from "@/lib/statistics";

// ─── Specimen-scoped insights (purpose-built for context panel) ──────────────

interface InsightBlock {
  kind: "adverse" | "protective" | "repurposing" | "trend" | "info" | "clinical";
  finding: string;
  sexes: string;
  detail: string;
}

function deriveSpecimenInsights(rules: RuleResult[], specimen: string): InsightBlock[] {
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
      const hasR19 = allRulesFlat.some((r) => r.rule_id === "R19");
      blocks.push({
        kind: "protective",
        finding: name,
        sexes: [...new Set(aggs.map((a) => a.sex))].sort().join(", "),
        detail: hasR19
          ? `${ctrlPct}% \u2192 ${highPct}% \u2014 potential protective effect`
          : `${ctrlPct}% control \u2192 ${highPct}% high dose`,
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
  adverse:     { border: "border-l-red-400",    icon: "↑", label: "Adverse" },
  protective:  { border: "border-l-emerald-400", icon: "↓", label: "Protective" },
  repurposing: { border: "border-l-purple-400",  icon: "◆", label: "Repurposing" },
  clinical:    { border: "border-l-orange-400",  icon: "⚑", label: "Clinical" },
  trend:       { border: "border-l-amber-300",  icon: "→", label: "Trend" },
  info:        { border: "border-l-gray-300",   icon: "·", label: "Info" },
};

function SpecimenInsights({ rules, specimen }: { rules: RuleResult[]; specimen: string }) {
  const blocks = useMemo(() => deriveSpecimenInsights(rules, specimen), [rules, specimen]);

  if (blocks.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No insights for this specimen.</p>;
  }

  // Group by kind for section headers
  const adverseBlocks = blocks.filter((b) => b.kind === "adverse");
  const clinicalBlocks = blocks.filter((b) => b.kind === "clinical");
  const protectiveBlocks = blocks.filter((b) => b.kind === "protective");
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
            </div>
          );
        })}
      </div>
    </div>
  );
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
  "Revised": "One or more findings disagreed by peer reviewer",
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

  // Derive specimen summary
  const summary = useMemo(() => {
    const summaries = deriveSpecimenSummaries(lesionData, ruleResults);
    return summaries.find((s) => s.specimen === specimen) ?? null;
  }, [lesionData, ruleResults, specimen]);

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
        doseMap.set(r.dose_level, { label: r.dose_label.split(",")[0], affected: r.affected, n: r.n });
      }
    }
    const sorted = [...doseMap.entries()].sort((a, b) => a[0] - b[0]);

    // Determine method
    const hasDoseRule = specimenRules.some((r) => r.rule_id === "R01" || r.rule_id === "R04");
    const matchingRuleIds = specimenRules
      .filter((r) => r.rule_id === "R01" || r.rule_id === "R04")
      .map((r) => r.rule_id);
    const heuristicResult = getDoseConsistency(specimenData);
    const finalTrend = hasDoseRule ? "Strong" as const : heuristicResult;
    const method = hasDoseRule
      ? `Rule engine (${[...new Set(matchingRuleIds)].join("/")})`
      : "Incidence heuristic";

    return { doses: sorted, method, trend: finalTrend };
  }, [specimenData, specimenRules]);

  // Structured conclusion parts (rendered as individual chips)
  const conclusionParts = useMemo(() => {
    if (!summary) return null;
    const incPct = Math.round(summary.maxIncidence * 100);
    const incidenceLabel = incPct > 50 ? "high" : incPct > 20 ? "moderate" : "low";
    const sevLabel = summary.adverseCount > 0
      ? `max severity ${summary.maxSeverity.toFixed(1)}`
      : "non-adverse";
    const sexLabel = deriveSexLabel(specimenData).toLowerCase();
    const trend = doseTrendDetail.trend;
    const doseRelation = trend === "Strong"
      ? "dose-response: \u2191 strong"
      : trend === "Moderate"
      ? "dose-response: \u2191 moderate"
      : trend === "NonMonotonic"
      ? "dose-response: \u2191\u2193 non-monotonic"
      : "dose-response: no clear trend";
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
  }, [summary, specimenData, doseTrendDetail.trend]);

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
            <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">
              <span className={getDoseConsistencyWeight(doseTrendDetail.trend)}>{conclusionParts.doseRelation}</span>
            </span>
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
          <SpecimenInsights rules={specimenRules} specimen={specimen} />
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
                navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`, { state: { organ_system: specimen } });
              }
            }}
          >
            View NOAEL decision &#x2192;
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
    const assessments = deriveRecoveryAssessments([selection.finding], subjData.subjects);
    return assessments[0] ?? null;
  }, [specimenHasRecovery, subjData, selection.finding]);

  // Recovery classification (interpretive layer)
  const { data: trendData } = useFindingDoseTrends(studyId);
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
    const doseConsistency = getFindingDoseConsistency(lesionData, selection.finding);
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
      recoveryPeriodDays: null,
    });
  }, [findingRecovery, ruleResults, lesionData, trendData, selection]);

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

  // Historical control lookup for this finding
  const historicalContext = useMemo(() => {
    const organName = selection.specimen.toLowerCase().replace(/_/g, " ");
    const hcd = getHistoricalControl(selection.finding, organName);
    if (!hcd) return null;

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
    const status = classifyVsHCD(controlInc, hcd);
    return { hcd, controlInc, status };
  }, [lesionData, selection]);

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
      if ((r.avg_severity ?? 0) > maxSev) maxSev = r.avg_severity ?? 0;
      if (r.incidence > maxInc) maxInc = r.incidence;
      sexes.add(r.sex);
    }
    const doseTrend = getFindingDoseConsistency(findingRows, selection.finding);
    const sexLabel = sexes.size === 1 ? ([...sexes][0] === "M" ? "M" : "F") : "M/F";
    const incPct = Math.round(maxInc * 100);
    return { incPct, maxSev, doseTrend, sexLabel };
  }, [findingRows]);

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
        if ((r.avg_severity ?? 0) > existing.maxSev) existing.maxSev = r.avg_severity ?? 0;
      } else {
        unique.set(r.finding, { maxSev: r.avg_severity ?? 0, count: 1 });
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
        if ((r.avg_severity ?? 0) > existing.maxSev) existing.maxSev = r.avg_severity ?? 0;
      } else {
        bySpec.set(r.specimen, { incidence: r.incidence, maxSev: r.avg_severity ?? 0 });
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
        if ((r.avg_severity ?? 0) > existing.maxSev) existing.maxSev = r.avg_severity ?? 0;
      } else {
        bySex.set(r.sex, { affected: r.affected, total: r.n, maxSev: r.avg_severity ?? 0 });
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
            <span>Dose: <span className="font-medium">{headerMetrics.doseTrend}</span></span>
            <span>Sex: <span className="font-medium">{headerMetrics.sexLabel}</span></span>
          </div>
        )}
      </div>

      {/* Insights */}
      <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <SpecimenInsights rules={findingRules} specimen={selection.specimen} />
        {showRecoveryInsight && recoveryClassification && (
          <div className="mt-2.5">
            <RecoveryInsightBlock classification={recoveryClassification} />
          </div>
        )}
        {historicalContext && (
          <div className="mt-2.5 border-l-2 border-l-gray-300/40 py-0.5 pl-2">
            <div className="text-[10px] leading-snug text-muted-foreground">
              {(historicalContext.status === "above_range" || historicalContext.status === "at_upper") && (
                <span className="mr-1">{"\u26A0"}</span>
              )}
              Historical context <span className="text-amber-600">(mock)</span>: Control incidence {Math.round(historicalContext.controlInc * 100)}% is{" "}
              <span className="font-medium">{HCD_STATUS_LABELS[historicalContext.status].toLowerCase()}</span>
              {" "}({Math.round(historicalContext.hcd.min_incidence * 100)}{"\u2013"}{Math.round(historicalContext.hcd.max_incidence * 100)}%,
              mean {Math.round(historicalContext.hcd.mean_incidence * 100)}%,
              n={historicalContext.hcd.n_studies} studies)
            </div>
          </div>
        )}
      </CollapsiblePane>

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
                      <DoseLabel level={row.dose_level} label={row.dose_label.split(",")[0]} />
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
                  className="flex w-full items-center justify-between text-left text-[11px] transition-colors hover:bg-muted/40"
                  onClick={() => {
                    const organ = specimenToOrganSystem(m.specimen);
                    navigateTo({ organSystem: organ, specimen: m.specimen });
                  }}
                >
                  <span className="truncate text-primary/70 hover:underline" title={`${m.specimen}: ${selection.finding}`}>
                    {m.specimen.length > 20 ? m.specimen.slice(0, 20) + "\u2026" : m.specimen}
                  </span>
                  <span className="shrink-0 text-[9px] text-muted-foreground">
                    {Math.round(m.incidence * 100)}% inc, max sev {m.maxSev.toFixed(1)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </CollapsiblePane>

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
                navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`, { state: { organ_system: selection.specimen } });
              }
            }}
          >
            View NOAEL decision &#x2192;
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

  if (!selection) {
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
