import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import { InsightsList } from "./InsightsList";
import { PathologyReviewForm } from "./PathologyReviewForm";
import { ToxFindingForm } from "./ToxFindingForm";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { cn } from "@/lib/utils";
import {
  deriveSpecimenSummaries,
  deriveFindingSummaries,
  deriveSpecimenConclusion,
  deriveSexLabel,
  getDoseConsistency,
  deriveSpecimenReviewStatus,
} from "@/components/analysis/HistopathologyView";
import type { SpecimenReviewStatus } from "@/components/analysis/HistopathologyView";
import type { LesionSeverityRow, RuleResult } from "@/types/analysis-views";

/** Neutral grayscale for severity 1-5 scale (matches HistopathologyView). */
function sevHeatColor(avgSev: number): { bg: string; text: string } {
  if (avgSev >= 5) return { bg: "#4B5563", text: "white" };
  if (avgSev >= 4) return { bg: "#6B7280", text: "white" };
  if (avgSev >= 3) return { bg: "#9CA3AF", text: "var(--foreground)" };
  if (avgSev >= 2) return { bg: "#D1D5DB", text: "var(--foreground)" };
  return { bg: "#E5E7EB", text: "var(--foreground)" };
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

function specimenToOrganSystem(specimen: string): string {
  const upper = specimen.toUpperCase().trim();
  if (SPECIMEN_ORGAN_MAP[upper]) return SPECIMEN_ORGAN_MAP[upper];
  for (const [keyword, system] of KEYWORD_ORGAN_MAP) {
    if (upper.includes(keyword)) return system;
  }
  return "general";
}

const REVIEW_STATUS_STYLES: Record<SpecimenReviewStatus, string> = {
  "Preliminary": "border-border/50 text-muted-foreground/60",
  "In review": "border-border text-muted-foreground/80",
  "Confirmed": "border-border text-muted-foreground",
  "Revised": "border-border text-muted-foreground",
};

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
  onFindingSelect?: (finding: string, specimen: string) => void;
}

// ─── Specimen Overview (when no finding is selected) ──────────────────────────

function SpecimenOverviewPane({
  specimen,
  lesionData,
  ruleResults,
  studyId,
  onFindingSelect,
}: {
  specimen: string;
  lesionData: LesionSeverityRow[];
  ruleResults: RuleResult[];
  studyId?: string;
  onFindingSelect?: (finding: string, specimen: string) => void;
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
        r.output_text.toLowerCase().includes(specLower) ||
        r.context_key.toLowerCase().includes(specKey) ||
        r.organ_system.toLowerCase() === specLower
    );
  }, [ruleResults, specimen]);

  // Finding summaries
  const findingSummaries = useMemo(
    () => deriveFindingSummaries(specimenData),
    [specimenData]
  );

  // Conclusion text
  const conclusion = useMemo(() => {
    if (!summary) return "";
    return deriveSpecimenConclusion(summary, specimenData, specimenRules);
  }, [summary, specimenData, specimenRules]);

  // Sex label
  const sexLabel = useMemo(() => deriveSexLabel(specimenData), [specimenData]);

  // Merged domains from data + rules
  const allDomains = useMemo(() => {
    const set = new Set(summary?.domains ?? []);
    for (const r of specimenRules) {
      const m = r.context_key.match(/^([A-Z]{2})_/);
      if (m) set.add(m[1]);
    }
    return [...set].sort();
  }, [summary?.domains, specimenRules]);

  // Dose trend detail: incidence by dose group
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

  const reviewStatus = deriveSpecimenReviewStatus(findingNames, undefined);

  return (
    <div>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{specimen.replace(/_/g, " ")}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {summary.adverseCount > 0 && (
            <span className="rounded-sm border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
              {summary.adverseCount} adverse
            </span>
          )}
          <span className="rounded border border-border px-1 py-0.5 text-[10px] text-muted-foreground">
            {sexLabel}
          </span>
          <span
            className={cn("rounded border px-1 py-0.5 text-[10px]", REVIEW_STATUS_STYLES[reviewStatus])}
            title={REVIEW_STATUS_TOOLTIPS[reviewStatus]}
          >
            {reviewStatus}
          </span>
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
        <p className="text-[11px] leading-snug text-muted-foreground">{conclusion}</p>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>Findings: <span className="font-mono font-medium">{summary.findingCount}</span></span>
          <span>Incidence: <span className="font-mono font-medium">{summary.totalN > 0 ? Math.round((summary.totalAffected / summary.totalN) * 100) : 0}%</span></span>
          <span>Max sev: <span className="font-mono font-medium">{summary.maxSeverity.toFixed(1)}</span></span>
          <span>Dose: <span className="font-medium">{summary.doseConsistency}</span></span>
        </div>
      </CollapsiblePane>

      {/* Dose trend detail */}
      <CollapsiblePane title="Dose trend detail" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <div className="mb-1.5 text-[10px] text-muted-foreground">
          Method: <span className="font-medium">{doseTrendDetail.method}</span>
          {" \u2014 "}
          <span className="font-medium">
            {doseTrendDetail.trend === "Strong" ? "Strong trend (\u25B2\u25B2\u25B2)" :
             doseTrendDetail.trend === "Moderate" ? "Moderate trend (\u25B2\u25B2)" :
             "Weak trend (\u25B2)"}
          </span>
        </div>
        {doseTrendDetail.doses.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No dose data.</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="pb-0.5 text-left text-[10px] font-semibold uppercase tracking-wider">Dose</th>
                <th className="pb-0.5 text-right text-[10px] font-semibold uppercase tracking-wider">Affected</th>
                <th className="w-16 pb-0.5 text-[10px] font-semibold uppercase tracking-wider" />
              </tr>
            </thead>
            <tbody>
              {doseTrendDetail.doses.map(([level, info]) => {
                const pct = info.n > 0 ? (info.affected / info.n) * 100 : 0;
                return (
                  <tr key={level} className="border-b border-dashed">
                    <td className="py-0.5">{info.label}</td>
                    <td className="py-0.5 text-right font-mono">{info.affected}/{info.n}</td>
                    <td className="py-0.5 px-1">
                      <div className="h-1.5 w-full rounded-full bg-gray-100">
                        <div
                          className="h-1.5 rounded-full bg-gray-400"
                          style={{ width: `${Math.min(pct, 100)}%` }}
                          title={`${Math.round(pct)}%`}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CollapsiblePane>

      {/* Findings */}
      <CollapsiblePane title={`Findings (${findingSummaries.length})`} defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {findingSummaries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No findings in this specimen.</p>
        ) : (
          <div className="space-y-0.5">
            {findingSummaries.map((f) => (
              <button
                key={f.finding}
                className="flex w-full items-center justify-between rounded px-1 py-0.5 text-left text-[11px] hover:bg-accent/30"
                onClick={() => onFindingSelect?.(f.finding, specimen)}
              >
                <span className="min-w-0 flex-1 truncate" title={f.finding}>{f.finding}</span>
                <span className="ml-2 flex shrink-0 items-center gap-1.5">
                  <span
                    className="rounded px-1 font-mono text-[9px]"
                    style={{ backgroundColor: sevHeatColor(f.maxSeverity).bg, color: sevHeatColor(f.maxSeverity).text }}
                  >
                    {f.maxSeverity.toFixed(1)}
                  </span>
                  {f.severity === "adverse" && (
                    <span className="rounded-sm border border-border px-1 py-0.5 text-[9px] text-muted-foreground">adverse</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </CollapsiblePane>

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
    let totalAffected = 0;
    let totalN = 0;
    let maxSev = 0;
    const sexes = new Set<string>();
    for (const r of findingRows) {
      totalAffected += r.affected;
      totalN += r.n;
      if ((r.avg_severity ?? 0) > maxSev) maxSev = r.avg_severity ?? 0;
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
    const incPct = totalN > 0 ? Math.round((totalAffected / totalN) * 100) : 0;
    return { totalAffected, totalN, incPct, maxSev, doseTrend, sexLabel };
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
        (r.output_text.toLowerCase().includes(findingLower) ||
        r.output_text.toLowerCase().includes(specimenLower) ||
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
            <span>Incidence: <span className="font-mono font-medium">{headerMetrics.totalAffected}/{headerMetrics.totalN} ({headerMetrics.incPct}%)</span></span>
            <span>Max sev: <span className="font-mono font-medium">{headerMetrics.maxSev.toFixed(1)}</span></span>
            <span>Dose: <span className="font-medium">{headerMetrics.doseTrend}</span></span>
            <span>Sex: <span className="font-medium">{headerMetrics.sexLabel}</span></span>
          </div>
        )}
      </div>

      {/* Insights */}
      <CollapsiblePane title="Insights" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <InsightsList rules={findingRules} onEndpointClick={(organ) => {
          if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`, { state: { organ_system: organ } });
        }} />
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
                    <td className="py-0.5">{row.dose_label.split(",")[0]}</td>
                    <td className="py-0.5">{row.sex}</td>
                    <td className="py-0.5 text-right font-mono">
                      {row.affected}/{row.n}
                    </td>
                    <td className="py-0.5 px-1">
                      <div className="h-1.5 w-full rounded-full bg-gray-100">
                        <div
                          className="h-1.5 rounded-full bg-gray-400"
                          style={{ width: `${Math.min(incPct, 100)}%` }}
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
                      <span className="rounded-sm border border-border px-1 py-0.5 text-[9px] font-medium text-muted-foreground">
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
                      style={{ backgroundColor: sevHeatColor(stats.maxSev).bg, color: sevHeatColor(stats.maxSev).text }}
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
                  style={{ backgroundColor: sevHeatColor(info.maxSev).bg, color: sevHeatColor(info.maxSev).text }}
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

export function HistopathologyContextPanel({ lesionData, ruleResults, selection, studyId: studyIdProp, onFindingSelect }: Props) {
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
      onFindingSelect={onFindingSelect}
    />
  );
}
