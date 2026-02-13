import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { PathologyReviewForm } from "./PathologyReviewForm";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
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
import type { FindingCategory } from "@/lib/finding-aggregation";
import type { LesionSeverityRow, RuleResult } from "@/types/analysis-views";
import type { PathologyReview } from "@/types/annotations";
import { getNeutralHeatColor } from "@/components/analysis/HistopathologyView";

// ─── Specimen-scoped insights (purpose-built for context panel) ──────────────

interface InsightBlock {
  kind: "adverse" | "protective" | "repurposing" | "trend" | "info";
  finding: string;
  sexes: string;
  detail: string;
}

function deriveSpecimenInsights(rules: RuleResult[], specimen: string): InsightBlock[] {
  const blocks: InsightBlock[] = [];
  const specLower = specimen.toLowerCase();

  // Filter rules to those matching this specimen (via params or context_key)
  const specimenRules = rules.filter((r) => {
    if (r.params?.specimen && r.params.specimen.toLowerCase() === specLower) return true;
    return r.context_key.toLowerCase().includes(specLower.replace(/[, ]+/g, "_"));
  });

  // Use aggregateByFinding to get pre-categorized findings
  const aggregated = aggregateByFinding(specimenRules);

  // Category → InsightBlock kind mapping
  const categoryToKind: Record<FindingCategory, InsightBlock["kind"]> = {
    adverse: "adverse",
    protective: "protective",
    trend: "trend",
    info: "info",
  };

  for (const agg of aggregated) {
    const kind = categoryToKind[agg.category];

    if (kind === "adverse") {
      // Build detail from contributing rules
      const details: string[] = [];
      for (const r of agg.rules) {
        if (r.rule_id === "R04") {
          const p = r.params?.p_value;
          if (p != null) details.push(`Adverse (p = ${p})`);
          else details.push("Adverse");
        }
        if (r.rule_id === "R10" && r.severity === "warning") {
          const d = r.params?.effect_size;
          if (d != null) details.push(`Large effect (d = ${typeof d === "number" ? d.toFixed(2) : d})`);
        }
        if (r.rule_id === "R12") details.push("Incidence increases with dose");
        if (r.rule_id === "R13") details.push("Dose-dependent severity increase");
      }
      blocks.push({
        kind: "adverse",
        finding: agg.finding || agg.endpointLabel,
        sexes: agg.sex,
        detail: [...new Set(details)].join(" \u00b7 "),
      });
    } else if (kind === "protective") {
      const ctrlPct = agg.primaryRule.params?.ctrl_pct ?? "";
      const highPct = agg.primaryRule.params?.high_pct ?? "";
      const hasR19 = agg.rules.some((r) => r.rule_id === "R19");

      blocks.push({
        kind: "protective",
        finding: agg.finding || agg.endpointLabel,
        sexes: agg.sex,
        detail: `${ctrlPct}% control \u2192 ${highPct}% high dose`,
      });
      if (hasR19) {
        blocks.push({
          kind: "repurposing",
          finding: agg.finding || agg.endpointLabel,
          sexes: agg.sex,
          detail: `High baseline (${ctrlPct}%) reduced by treatment \u2014 potential therapeutic target`,
        });
      }
    } else if (kind === "trend") {
      const dir = agg.direction;
      blocks.push({
        kind: "trend",
        finding: agg.finding || agg.endpointLabel,
        sexes: agg.sex,
        detail: dir === "up" ? "Significant dose-dependent increase" : "Significant dose-dependent decrease",
      });
    }
    // info: skip — not shown in specimen insights
  }

  return blocks;
}

const INSIGHT_STYLES: Record<InsightBlock["kind"], { border: string; icon: string; label: string }> = {
  adverse:     { border: "border-l-red-400",    icon: "↑", label: "Adverse" },
  protective:  { border: "border-l-emerald-400", icon: "↓", label: "Protective" },
  repurposing: { border: "border-l-purple-400",  icon: "◆", label: "Repurposing" },
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
  const protectiveBlocks = blocks.filter((b) => b.kind === "protective");
  const repurposingBlocks = blocks.filter((b) => b.kind === "repurposing");
  const trendBlocks = blocks.filter((b) => b.kind === "trend" || b.kind === "info");

  return (
    <div className="space-y-2.5">
      {adverseBlocks.length > 0 && (
        <InsightSection label="Treatment-related" blocks={adverseBlocks} />
      )}
      {protectiveBlocks.length > 0 && (
        <InsightSection label="Decreased with treatment" blocks={protectiveBlocks} />
      )}
      {repurposingBlocks.length > 0 && (
        <InsightSection label="Drug repurposing signal" blocks={repurposingBlocks} />
      )}
      {trendBlocks.length > 0 && (
        <InsightSection label="Other trends" blocks={trendBlocks} />
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
      : "dose-response: no clear trend";
    const findingBreakdown = summary.warningCount > 0
      ? `${summary.findingCount} findings (${summary.adverseCount}adv/${summary.warningCount}warn)`
      : `${summary.findingCount} findings`;
    return {
      incidence: `incidence: ${incidenceLabel}, ${incPct}%`,
      severity: sevLabel,
      sex: sexLabel,
      sexSkew: summary.sexSkew && summary.sexSkew !== "M=F"
        ? `sex difference: ${summary.sexSkew === "M>F" ? "males" : "females"} >1.5× higher`
        : null,
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
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/target-organs`, { state: { organ_system: specimen } });
            }}
          >
            View target organs &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: specimen } });
            }}
          >
            View dose-response &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`, { state: { organ_system: specimen } });
            }}
          >
            View NOAEL decision &#x2192;
          </a>
        </div>
      </CollapsiblePane>
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
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

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
    const doseMap = new Map<number, { affected: number; n: number }>();
    for (const r of findingRows) {
      const existing = doseMap.get(r.dose_level);
      if (existing) { existing.affected += r.affected; existing.n += r.n; }
      else doseMap.set(r.dose_level, { affected: r.affected, n: r.n });
    }
    const sorted = [...doseMap.entries()].sort((a, b) => a[0] - b[0]);
    let doseTrend: "Weak" | "Moderate" | "Strong" = "Weak";
    if (sorted.length >= 2) {
      const incidences = sorted.map(([, v]) => (v.n > 0 ? v.affected / v.n : 0));
      let isMonotonic = true;
      for (let i = 1; i < incidences.length; i++) {
        if (incidences[i] < incidences[i - 1] - 0.001) { isMonotonic = false; break; }
      }
      const doseGroupsAffected = sorted.filter(([, v]) => v.affected > 0).length;
      if (isMonotonic && doseGroupsAffected >= 3) doseTrend = "Strong";
      else if (isMonotonic || doseGroupsAffected >= 2) doseTrend = "Moderate";
    }
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
      </CollapsiblePane>

      {/* Dose detail */}
      <CollapsiblePane title="Dose detail" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {findingRows.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No data.</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead className="sticky top-0 z-10 bg-background">
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
          </div>
        </CollapsiblePane>
      )}

      {/* Correlating evidence */}
      <CollapsiblePane title="Correlating evidence" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
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
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/target-organs`, { state: { organ_system: selection.specimen } });
            }}
          >
            View target organs &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: selection.specimen } });
            }}
          >
            View dose-response &#x2192;
          </a>
          <a
            href="#"
            className="block text-primary hover:underline"
            onClick={(e) => {
              e.preventDefault();
              if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`, { state: { organ_system: selection.specimen } });
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
