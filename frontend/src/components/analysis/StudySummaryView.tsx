import { useState, useMemo, useCallback, useEffect } from "react";
import { useStudySummaryTab } from "@/hooks/useStudySummaryTab";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, FileText, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { ViewTabBar } from "@/components/ui/ViewTabBar";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { useNoaelSummary } from "@/hooks/useNoaelSummary";
import { useRuleResults } from "@/hooks/useRuleResults";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useProvenanceMessages } from "@/hooks/useProvenanceMessages";
import { useDomains } from "@/hooks/useDomains";
import { useInsights } from "@/hooks/useInsights";
import { generateStudyReport } from "@/lib/report-generator";
import { buildSignalsPanelData } from "@/lib/signals-panel-engine";
import type { MetricsLine, PanelStatement } from "@/lib/signals-panel-engine";
import {
  SignalsEvidencePanel,
  StudyStatementsBar,
} from "./SignalsPanel";
import { ConfidencePopover } from "./ScoreBreakdown";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useSessionState } from "@/hooks/useSessionState";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import type { SignalSelection, SignalSummaryRow, ProvenanceMessage, NoaelSummaryRow, RuleResult } from "@/types/analysis-views";
import type { StudyMortality } from "@/types/mortality";
import type { StudyMetadata } from "@/types";
import type { Insight } from "@/hooks/useInsights";
import { classifyProtectiveSignal, getProtectiveBadgeStyle } from "@/lib/protective-signal";
import type { ProtectiveClassification } from "@/lib/protective-signal";
import { specimenToOrganSystem } from "@/components/analysis/panes/HistopathologyContextPanel";

type Tab = "details" | "signals" | "insights";

export function StudySummaryView() {
  const { studyId } = useParams<{ studyId: string }>();
  const [searchParams] = useSearchParams();
  const { selection: studySelection, navigateTo } = useStudySelection();
  const { data: signalData, isLoading, error } = useStudySignalSummary(studyId);
  const { data: targetOrgans } = useTargetOrganSummary(studyId);
  const { data: noaelData } = useNoaelSummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);
  const { data: meta } = useStudyMetadata(studyId!);
  const { data: provenanceData } = useProvenanceMessages(studyId);
  const { data: mortalityData } = useStudyMortality(studyId);

  // Initialize tab from URL query parameter if present, then persist via session
  const initialTab = (searchParams.get("tab") as Tab) || "details";
  const [tab, setTab] = useStudySummaryTab(initialTab);

  // Local signal selection (for endpoint-level detail in evidence panel)
  const [localSignalSel, setLocalSignalSel] = useState<SignalSelection | null>(null);

  // Read organ from StudySelectionContext
  const selectedOrgan = studySelection.organSystem ?? null;

  // Initialize ScheduledOnlyContext from mortality data (matches FindingsView pattern)
  const { setEarlyDeathSubjects } = useScheduledOnly();
  useEffect(() => {
    if (mortalityData) {
      const earlyDeaths = mortalityData.early_death_subjects ?? {};
      const trIds = new Set(
        mortalityData.deaths
          .filter(d => !d.is_recovery && d.USUBJID in earlyDeaths)
          .map(d => d.USUBJID),
      );
      setEarlyDeathSubjects(earlyDeaths, trIds);
    }
  }, [mortalityData, setEarlyDeathSubjects]);

  // Auto-select top organ when view loads and nothing is selected
  useEffect(() => {
    if (!selectedOrgan && targetOrgans && targetOrgans.length > 0) {
      const top = [...targetOrgans].sort((a, b) => b.evidence_score - a.evidence_score)[0];
      navigateTo({ organSystem: top.organ_system });
    }
  }, [selectedOrgan, targetOrgans, navigateTo]);

  const handleSetSelection = useCallback((sel: SignalSelection | null) => {
    setLocalSignalSel(sel);
    if (sel) {
      navigateTo({ endpoint: sel.endpoint_label });
    }
  }, [navigateTo]);

  // Build panel data
  const panelData = useMemo(() => {
    if (!signalData || !targetOrgans || !noaelData) return null;
    return buildSignalsPanelData(noaelData, targetOrgans, signalData);
  }, [signalData, targetOrgans, noaelData]);

  // Selected organ data
  const selectedOrganData = useMemo(() => {
    if (!selectedOrgan || !targetOrgans) return null;
    return targetOrgans.find((o) => o.organ_system === selectedOrgan) ?? null;
  }, [selectedOrgan, targetOrgans]);

  // If analysis data not available but insights tab requested, show insights
  if (error && tab === "insights") {
    return (
      <div className="flex h-full flex-col">
        <ViewTabBar
          tabs={[
            { key: "details", label: "Study details" },
            { key: "signals", label: "Signals" },
            { key: "insights", label: "Cross-study insights" },
          ]}
          value={tab}
          onChange={(newTab: string) => setTab(newTab as Tab)}
        />
        <CrossStudyInsightsTab studyId={studyId!} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-amber-50 p-6">
          <Info className="mx-auto mb-3 h-10 w-10 text-amber-600" />
          <h1 className="mb-2 text-xl font-semibold text-amber-700">
            Analysis data not available
          </h1>
          <p className="text-sm text-amber-600">
            This is a portfolio metadata study without analysis data.
          </p>
          <p className="mt-2 text-sm text-amber-600">
            Try the <strong>Cross-study insights</strong> tab to see intelligence for this study.
          </p>
          <button
            onClick={() => setTab("insights")}
            className="mt-4 rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
          >
            View cross-study insights →
          </button>
        </div>
        <div className="mt-6 rounded-lg bg-gray-50 p-4 text-left">
          <p className="text-xs text-gray-600">
            <strong>For studies with XPT data:</strong> Run the generator to produce analysis data:
          </p>
          <code className="mt-2 block rounded bg-gray-100 px-3 py-1.5 text-xs text-gray-700">
            cd backend && python -m generator.generate {studyId}
          </code>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Loading study summary...
        </span>
      </div>
    );
  }

  if (!signalData) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Tab bar */}
      <ViewTabBar
        tabs={[
          { key: "details", label: "Study details" },
          { key: "signals", label: "Signals" },
          { key: "insights", label: "Cross-study insights" },
        ]}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
        right={
          <div className="px-3 py-2">
            <button
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent/50"
              onClick={() => studyId && generateStudyReport(studyId)}
            >
              <FileText className="h-3.5 w-3.5" />
              Generate report
            </button>
          </div>
        }
      />

      {/* Tab content */}
      {tab === "details" && <DetailsTab meta={meta} studyId={studyId!} provenanceMessages={provenanceData} signalData={signalData} mortalityData={mortalityData} />}
      {tab === "insights" && <CrossStudyInsightsTab studyId={studyId!} />}
      {tab === "signals" && panelData && (
        <div className="flex h-full flex-col overflow-hidden">
          {/* Decision Bar — persistent */}
          <DecisionBar
            statements={panelData.decisionBar}
            metrics={panelData.metrics}
            noaelData={noaelData}
          />

          {/* Study-level statements + study-level flags */}
          <StudyStatementsBar
            statements={panelData.studyStatements}
            modifiers={panelData.modifiers}
            caveats={panelData.caveats}
          />

          {/* Protective signals — study-wide R18/R19 aggregation */}
          <ProtectiveSignalsBar rules={ruleResults ?? []} studyId={studyId!} signalData={signalData} />

          {/* Evidence panel — full width (rail is in shell) */}
          <div className="flex-1 overflow-hidden">
            {selectedOrganData && signalData ? (
              <SignalsEvidencePanel
                organ={selectedOrganData}
                signalData={signalData}
                ruleResults={ruleResults ?? []}
                modifiers={panelData.modifiers}
                caveats={panelData.caveats}
                selection={localSignalSel}
                onSelect={handleSetSelection}
                studyId={studyId!}
              />
            ) : (
              <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
                Select an organ system from the rail to view evidence
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cross-Study Insights Tab
// ---------------------------------------------------------------------------

function CrossStudyInsightsTab({ studyId }: { studyId: string }) {
  const { data: insights, isLoading, error } = useInsights(studyId);
  const [showAll, setShowAll] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Loading insights...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12 text-center">
        <div>
          <Info className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Cross-study insights are not available for this study.
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            (Only portfolio studies with metadata have insights)
          </p>
        </div>
      </div>
    );
  }

  if (!insights || insights.length === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-center">
        <p className="text-xs text-muted-foreground">
          No cross-study insights available (no reference studies).
        </p>
      </div>
    );
  }

  const priority01 = insights.filter((i) => i.priority <= 1);
  const priority23 = insights.filter((i) => i.priority >= 2);

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="space-y-2">
        {/* Priority 0 and 1 — always visible */}
        {priority01.map((insight, idx) => (
          <InsightCard key={idx} insight={insight} />
        ))}

        {/* Priority 2 and 3 — collapsed by default */}
        {priority23.length > 0 && (
          <>
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-4 text-xs text-primary hover:underline"
            >
              {showAll
                ? "Show fewer insights ▲"
                : `Show ${priority23.length} more insights ▼`}
            </button>
            {showAll &&
              priority23.map((insight, idx) => (
                <InsightCard key={`p23-${idx}`} insight={insight} />
              ))}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Insight Card Component
// ---------------------------------------------------------------------------

function InsightCard({ insight }: { insight: Insight }) {
  return (
    <div className="border-l-2 border-primary py-2 pl-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold">{insight.title}</span>
        {insight.ref_study && (
          <span className="text-[10px] text-muted-foreground">
            {insight.ref_study}
          </span>
        )}
        {!insight.ref_study && (
          <span className="text-[10px] italic text-muted-foreground">
            (this study)
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-foreground">{insight.detail}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Protective Signals Bar — study-wide aggregation of R18/R19
// ---------------------------------------------------------------------------

interface ProtectiveFinding {
  finding: string;
  specimens: string[];
  sexes: string;
  ctrlPct: string;
  highPct: string;
  classification: ProtectiveClassification;
}

function aggregateProtectiveFindings(rules: RuleResult[]): ProtectiveFinding[] {
  const map = new Map<string, { specimens: Set<string>; sexes: Set<string>; ctrlPct: string; highPct: string; hasR19: boolean }>();

  for (const r of rules) {
    if (r.rule_id !== "R18" && r.rule_id !== "R19") continue;

    const p = r.params;
    if (p?.finding && p?.specimen && p?.ctrl_pct) {
      const findingName = p.finding;
      const entry = map.get(findingName) ?? { specimens: new Set(), sexes: new Set(), ctrlPct: p.ctrl_pct, highPct: p.high_pct ?? "", hasR19: false };
      entry.specimens.add(p.specimen);
      if (p.sex) entry.sexes.add(p.sex);
      if (parseInt(p.ctrl_pct) > parseInt(entry.ctrlPct)) { entry.ctrlPct = p.ctrl_pct; entry.highPct = p.high_pct ?? ""; }
      if (r.rule_id === "R19") entry.hasR19 = true;
      map.set(findingName, entry);
    }
  }

  return [...map.entries()]
    .map(([finding, info]) => {
      const ctrlInc = parseInt(info.ctrlPct) / 100;
      const highInc = parseInt(info.highPct) / 100;
      const result = classifyProtectiveSignal({
        finding,
        controlIncidence: ctrlInc,
        highDoseIncidence: highInc,
        doseConsistency: info.hasR19 ? "Moderate" : "Weak",
        direction: "decreasing",
        crossDomainCorrelateCount: info.hasR19 ? 2 : 0,
      });
      return {
        finding,
        specimens: [...info.specimens].sort(),
        sexes: [...info.sexes].sort().join(", "),
        ctrlPct: info.ctrlPct,
        highPct: info.highPct,
        classification: result?.classification ?? "background" as ProtectiveClassification,
      };
    })
    .sort((a, b) => {
      // Pharmacological first, then treatment-decrease, then background
      const order: Record<ProtectiveClassification, number> = { pharmacological: 0, "treatment-decrease": 1, background: 2 };
      const d = order[a.classification] - order[b.classification];
      if (d !== 0) return d;
      return parseInt(b.ctrlPct) - parseInt(a.ctrlPct);
    });
}

function ProtectiveSignalsBar({
  rules,
  studyId,
  signalData,
}: {
  rules: RuleResult[];
  studyId: string;
  signalData?: SignalSummaryRow[];
}) {
  const navigate = useNavigate();
  const { navigateTo } = useStudySelection();
  const findings = useMemo(() => aggregateProtectiveFindings(rules), [rules]);

  // Cross-domain correlates: for each protective finding's organ system,
  // find other signals in the same organ system with direction info
  const correlatesByFinding = useMemo(() => {
    const map = new Map<string, { label: string; direction: string }[]>();
    if (!signalData || findings.length === 0) return map;
    for (const f of findings) {
      if (f.classification === "background") continue;
      // Determine organ system from first specimen
      const spec = f.specimens[0];
      if (!spec) continue;
      const organ = specimenToOrganSystem(spec).toLowerCase();
      // Find other endpoints in the same organ system (not the finding itself)
      const correlates: { label: string; direction: string }[] = [];
      const seen = new Set<string>();
      for (const row of signalData) {
        if (row.organ_system.toLowerCase() !== organ) continue;
        if (row.endpoint_label.toLowerCase() === f.finding.toLowerCase()) continue;
        if (seen.has(row.endpoint_label)) continue;
        seen.add(row.endpoint_label);
        const dir = row.direction === "down" ? "\u2193" : row.direction === "up" ? "\u2191" : "";
        if (dir) correlates.push({ label: row.endpoint_label, direction: dir });
      }
      if (correlates.length > 0) map.set(f.finding, correlates.slice(0, 5));
    }
    return map;
  }, [findings, signalData]);

  if (findings.length === 0) return null;

  const pharmacological = findings.filter((f) => f.classification === "pharmacological");
  const treatmentDecrease = findings.filter((f) => f.classification === "treatment-decrease");
  const background = findings.filter((f) => f.classification === "background");

  const classifiedCount = pharmacological.length + treatmentDecrease.length;

  return (
    <div className="shrink-0 border-b px-4 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Protective signals
        </span>
        <span className="text-[10px] text-muted-foreground">
          {findings.length} finding{findings.length !== 1 ? "s" : ""} with decreased incidence
          {classifiedCount > 0 && ` \u00b7 ${pharmacological.length} pharmacological \u00b7 ${treatmentDecrease.length} treatment-related`}
        </span>
      </div>
      <div className="space-y-1.5">
        {/* Pharmacological candidates */}
        {pharmacological.map((f) => (
          <div key={`ph-${f.finding}`} className="border-l-2 border-l-blue-400 py-1 pl-2.5">
            <div className="flex items-baseline gap-2">
              <button
                className="text-[11px] font-semibold hover:underline"
                onClick={() => {
                  const spec = f.specimens[0];
                  if (spec) {
                    navigateTo({ specimen: spec });
                    navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { specimen: spec, finding: f.finding } });
                  }
                }}
              >
                {f.finding}
              </button>
              <span className="text-[10px] font-medium text-muted-foreground">{f.sexes}</span>
              <span className={cn("rounded px-1.5 py-0.5", getProtectiveBadgeStyle("pharmacological"))}>pharmacological</span>
            </div>
            <div className="text-[10px] leading-snug text-muted-foreground">
              {f.ctrlPct}% control {"\u2192"} {f.highPct}% high dose in {f.specimens.join(", ")}
            </div>
            {correlatesByFinding.get(f.finding) && (
              <div className="mt-0.5 text-[10px] text-muted-foreground/70">
                Correlated: {correlatesByFinding.get(f.finding)!.map((c, i) => (
                  <span key={c.label}>{i > 0 && ", "}{c.label} {c.direction}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {/* Treatment-decrease */}
        {treatmentDecrease.map((f) => (
          <div key={`td-${f.finding}`} className="border-l-2 border-l-slate-400 py-0.5 pl-2.5">
            <div className="flex items-baseline gap-2">
              <button
                className="text-[11px] font-medium hover:underline"
                onClick={() => {
                  const spec = f.specimens[0];
                  if (spec) {
                    navigateTo({ specimen: spec });
                    navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { specimen: spec, finding: f.finding } });
                  }
                }}
              >
                {f.finding}
              </button>
              <span className="text-[10px] text-muted-foreground">{f.sexes}</span>
              <span className={cn("rounded px-1.5 py-0.5", getProtectiveBadgeStyle("treatment-decrease"))}>treatment decrease</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                {f.ctrlPct}% {"\u2192"} {f.highPct}%
              </span>
            </div>
            {f.specimens.length > 0 && (
              <div className="text-[9px] text-muted-foreground/70">{f.specimens.join(", ")}</div>
            )}
            {correlatesByFinding.get(f.finding) && (
              <div className="text-[10px] text-muted-foreground/70">
                Correlated: {correlatesByFinding.get(f.finding)!.map((c, i) => (
                  <span key={c.label}>{i > 0 && ", "}{c.label} {c.direction}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {/* Background (other decreased) */}
        {background.length > 0 && (
          <div className="space-y-0.5">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Other decreased findings
            </div>
            {background.slice(0, 5).map((f) => (
              <div key={`bg-${f.finding}`} className="border-l-2 border-l-gray-300 py-0.5 pl-2.5">
                <div className="flex items-baseline gap-2">
                  <button
                    className="text-[11px] font-medium hover:underline"
                    onClick={() => {
                      const spec = f.specimens[0];
                      if (spec) {
                        navigateTo({ specimen: spec });
                        navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { specimen: spec, finding: f.finding } });
                      }
                    }}
                  >
                    {f.finding}
                  </button>
                  <span className="text-[10px] text-muted-foreground">{f.sexes}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                    {f.ctrlPct}% {"\u2192"} {f.highPct}%
                  </span>
                </div>
              </div>
            ))}
            {background.length > 5 && (
              <div className="pl-2.5 text-[10px] text-muted-foreground/50">
                +{background.length - 5} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision Bar — persistent across both modes
// ---------------------------------------------------------------------------

function DecisionBar({
  statements,
  metrics,
  noaelData,
}: {
  statements: PanelStatement[];
  metrics: MetricsLine;
  noaelData?: NoaelSummaryRow[];
}) {
  // Separate the main NOAEL fact (first priority 990+ fact) from alerts/warnings
  const alertStatements = statements.filter(
    (s) => s.icon === "warning" || s.icon === "review-flag"
  );

  return (
    <div className="shrink-0 border-b bg-muted/20 px-4 py-2">
      {/* Structured NOAEL / LOAEL / Driver — single compact row */}
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">NOAEL</span>{" "}
          <span
            className={cn(
              "text-xs font-semibold",
              metrics.noael === "Not established"
                ? "text-amber-600"
                : "text-foreground"
            )}
          >
            {metrics.noael}
          </span>
          {metrics.noaelSex && (
            <span className="text-[10px] text-muted-foreground"> ({metrics.noaelSex})</span>
          )}
          {metrics.noaelConfidence != null && (() => {
            const confidenceEl = (
              <span
                className={cn(
                  "ml-1 text-[10px] font-medium",
                  metrics.noaelConfidence >= 0.8
                    ? "text-green-700"
                    : metrics.noaelConfidence >= 0.6
                      ? "text-amber-700"
                      : "text-red-700"
                )}
              >
                {Math.round(metrics.noaelConfidence * 100)}%
              </span>
            );
            const combinedRow = noaelData?.find((r) => r.sex === "Combined");
            if (combinedRow && noaelData) {
              return (
                <ConfidencePopover row={combinedRow} allNoael={noaelData}>
                  {confidenceEl}
                </ConfidencePopover>
              );
            }
            return confidenceEl;
          })()}
        </span>
        <span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">LOAEL</span>{" "}
          <span className="text-xs font-semibold text-foreground">{metrics.loael}</span>
        </span>
        {metrics.driver && (
          <span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Driver</span>{" "}
            <span className="text-xs font-medium text-foreground">{metrics.driver}</span>
          </span>
        )}
      </div>

      {/* Alert/warning statements */}
      {alertStatements.length > 0 && (
        <div className="mt-1 space-y-0.5">
          {alertStatements.map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs leading-snug text-amber-700"
            >
              <span className="mt-0.5 shrink-0 text-[10px] text-amber-600">
                {s.icon === "review-flag" ? "\u26A0" : "\u25B2"}
              </span>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Metrics line */}
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
        <span>
          {metrics.targets} target{metrics.targets !== 1 ? "s" : ""}
        </span>
        <span>&middot;</span>
        <span>{metrics.significantRatio} sig</span>
        <span>&middot;</span>
        <span>{metrics.doseResponse} D-R</span>
        <span>&middot;</span>
        <span>
          {metrics.domains} domain{metrics.domains !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Details tab — study metadata
// ---------------------------------------------------------------------------

function MetadataRow({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-2 py-0.5 text-xs">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="select-all">{value}</span>
    </div>
  );
}

function formatDuration(iso: string): string {
  const wMatch = iso.match(/^P(\d+)W$/);
  if (wMatch) return `${wMatch[1]} weeks`;
  const dMatch = iso.match(/^P(\d+)D$/);
  if (dMatch) return `${dMatch[1]} days`;
  return iso;
}

function formatSubjects(
  total: string | null,
  males: string | null,
  females: string | null
): string | null {
  if (!total) return null;
  const parts = [total];
  if (males && females) parts.push(`(${males}M, ${females}F)`);
  return parts.join(" ");
}


/** Full SEND domain name map for display. */
const DOMAIN_LABELS: Record<string, string> = {
  dm: "Demographics", ex: "Exposure", ds: "Disposition", ts: "Trial Summary",
  ta: "Trial Arms", te: "Trial Elements", tx: "Trial Sets",
  bw: "Body Weights", cl: "Clinical Observations", fw: "Food/Water Consumption",
  lb: "Laboratory", ma: "Macroscopic Findings", mi: "Microscopic Findings",
  om: "Organ Measurements", pp: "Pharmacokinetics", pc: "Concentrations",
  tf: "Tumor Findings", bg: "Biospecimen Genetics", dd: "Death Diagnosis",
  eg: "ECG", cv: "Cardiovascular", re: "Respiratory", vs: "Vital Signs",
  sc: "Subject Characteristics", se: "Subject Elements", co: "Comments",
};

// ---------------------------------------------------------------------------
// Signal-prioritized domain table — sorts by adversity, shows key findings
// ---------------------------------------------------------------------------

/** Structural domains that always go below the fold. */
const STRUCTURAL_DOMAINS = new Set([
  "dm", "ex", "ta", "te", "tx", "ts", "co", "se",
  "suppmi", "suppom", "supplb", "relrec", "sc", "pm",
  "suppdm", "suppds", "suppcl", "suppex",
]);

/** Domains with special significance that stay above fold even with 0 signals. */
const ALWAYS_VISIBLE = new Set(["ds", "tf"]);

interface EndpointAgg {
  tr: boolean;
  adverse: boolean;
  direction: string | null;
  organName: string;
  minP: number | null;
  maxAbsD: number | null;
  maxScore: number;
}

interface DomainSignalInfo {
  trCount: number;
  adverseCount: number;
  endpoints: Map<string, EndpointAgg>;
}

/** Aggregate signal rows into per-domain stats, preserving p-value/effect size/score. */
function aggregateDomainSignals(signalData: SignalSummaryRow[]): Record<string, DomainSignalInfo> {
  const byDomain: Record<string, DomainSignalInfo> = {};

  for (const row of signalData) {
    const dom = row.domain.toLowerCase();
    if (!byDomain[dom]) byDomain[dom] = { trCount: 0, adverseCount: 0, endpoints: new Map() };
    const existing = byDomain[dom].endpoints.get(row.endpoint_label);
    const isTr = existing?.tr || row.treatment_related;
    const isAdv = existing?.adverse || row.severity === "adverse";
    const prevP = existing?.minP ?? null;
    const newP = row.p_value != null
      ? (prevP != null ? Math.min(prevP, row.p_value) : row.p_value)
      : prevP;
    const prevD = existing?.maxAbsD ?? null;
    const absD = row.effect_size != null ? Math.abs(row.effect_size) : null;
    const newD = absD != null
      ? (prevD != null ? Math.max(prevD, absD) : absD)
      : prevD;
    const prevScore = existing?.maxScore ?? 0;
    byDomain[dom].endpoints.set(row.endpoint_label, {
      tr: isTr,
      adverse: isAdv,
      direction: row.direction ?? existing?.direction ?? null,
      organName: row.organ_name,
      minP: newP,
      maxAbsD: newD,
      maxScore: Math.max(prevScore, row.signal_score),
    });
  }

  // Recount after dedup
  for (const info of Object.values(byDomain)) {
    info.trCount = [...info.endpoints.values()].filter(e => e.tr).length;
    info.adverseCount = [...info.endpoints.values()].filter(e => e.adverse).length;
  }

  return byDomain;
}

// ---------------------------------------------------------------------------
// Key findings generation — uses existing signal data fields directly
// ---------------------------------------------------------------------------

const DIR_ARROW: Record<string, string> = { up: "\u2191", down: "\u2193" };

/** Format p-value compactly: p<.0001, p=.003 */
function fmtP(p: number | null): string {
  if (p == null) return "";
  if (p < 0.0001) return "p<.0001";
  if (p < 0.001) return `p=${p.toFixed(4).replace(/^0/, "")}`;
  if (p < 0.01) return `p=${p.toFixed(3).replace(/^0/, "")}`;
  return "";
}

/** Format Cohen's d compactly: |d|=7.8 */
function fmtD(d: number | null): string {
  if (d == null || d < 2.0) return "";
  return `|d|=${d.toFixed(1)}`;
}

/** Compact clinical significance suffix: (p<.0001, d=7.8) */
function clinSig(ep: EndpointAgg): string {
  const parts = [fmtP(ep.minP), fmtD(ep.maxAbsD)].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

/**
 * For MI/MA/OM/TF labels like "SPECIMEN — FINDING", extract a short display form.
 * MI/MA: "finding (specimen)" lowercase. OM: just specimen name. TF: finding portion.
 */
function shortSpecimenLabel(label: string, domain: string): string {
  const sep = label.indexOf(" \u2014 ");
  if (sep < 0) return label.toLowerCase();
  const specimen = label.substring(0, sep).trim().toLowerCase();
  const finding = label.substring(sep + 3).trim().toLowerCase();
  if (domain === "om") return specimen; // "kidney", "liver"
  if (domain === "tf") return finding;  // "carcinoma, hepatocellular, malignant"
  return `${finding} (${specimen})`; // MI/MA: "hypertrophy (liver)"
}

/** Generate key findings for a domain from its aggregated endpoints + mortality data. */
function generateKeyFindings(
  domain: string,
  endpoints: Map<string, EndpointAgg>,
  mortalityData?: StudyMortality,
): string {
  const dom = domain.toLowerCase();

  // DS — use actual cause-of-death from mortality records
  if (dom === "ds") {
    if (!mortalityData?.has_mortality) return "";
    const allDeaths = [...mortalityData.deaths, ...mortalityData.accidentals];
    const byCause = new Map<string, number>();
    for (const d of allDeaths) {
      const label = d.cause
        ? d.cause.toLowerCase()
        : d.relatedness?.toLowerCase() ?? d.disposition.toLowerCase();
      byCause.set(label, (byCause.get(label) ?? 0) + 1);
    }
    return [...byCause.entries()]
      .map(([cause, n]) => n > 1 ? `${n} ${cause}` : cause)
      .join(", ");
  }

  // All other domains: rank endpoints by adverse > TR, then by signal score
  const ranked = [...endpoints.entries()]
    .filter(([, ep]) => ep.tr || ep.adverse)
    .sort(([, a], [, b]) => {
      // Adverse first, then by signal score
      if (a.adverse !== b.adverse) return a.adverse ? -1 : 1;
      if (a.tr !== b.tr) return a.tr ? -1 : 1;
      return b.maxScore - a.maxScore;
    });

  if (ranked.length === 0) {
    // No TR/adverse — for TF, still show tumor types
    if (dom === "tf" && endpoints.size > 0) {
      return [...endpoints.keys()]
        .map(label => shortSpecimenLabel(label, dom))
        .slice(0, 3)
        .join("; ");
    }
    return "";
  }

  const usesSpecimenFormat = ["mi", "ma", "om", "tf"].includes(dom);
  const top = ranked.slice(0, 3);

  return top.map(([label, ep]) => {
    const dir = DIR_ARROW[ep.direction ?? ""] ?? "";
    const name = usesSpecimenFormat ? shortSpecimenLabel(label, dom) : label;
    const sig = clinSig(ep);
    return `${name} ${dir}${sig}`.trim();
  }).join(", ");
}


interface DomainTableRow {
  code: string;
  fullName: string;
  rowCount: number;
  subjectCount: number | null;
  trCount: number;
  adverseCount: number;
  keyFindings: string;
  tier: number; // 1=adverse, 2=TR, 3=always-visible, 4=data-no-findings, 5=structural
}

function DomainTable({
  studyId,
  domains,
  signalData,
  mortalityData,
}: {
  studyId: string;
  domains: { name: string; label: string; row_count: number; subject_count?: number | null }[];
  signalData: SignalSummaryRow[];
  mortalityData?: StudyMortality;
}) {
  const navigate = useNavigate();
  const [showFolded, setShowFolded] = useState(false);

  const domainSignals = useMemo(() => aggregateDomainSignals(signalData), [signalData]);

  const rows: DomainTableRow[] = useMemo(() => {
    return domains.map((d) => {
      const dom = d.name.toLowerCase();
      const sig = domainSignals[dom];
      const trCount = sig?.trCount ?? 0;
      const adverseCount = sig?.adverseCount ?? 0;
      const isStructural = STRUCTURAL_DOMAINS.has(dom);
      const isAlwaysVisible = ALWAYS_VISIBLE.has(dom);

      let tier: number;
      if (isStructural) tier = 5;
      else if (adverseCount > 0) tier = 1;
      else if (trCount > 0) tier = 2;
      else if (isAlwaysVisible && d.row_count > 0) tier = 3;
      else tier = 4;

      const keyFindings = sig
        ? generateKeyFindings(dom, sig.endpoints, mortalityData)
        : dom === "ds"
          ? generateKeyFindings(dom, new Map(), mortalityData)
          : "";

      return {
        code: d.name,
        fullName: DOMAIN_LABELS[dom] ?? d.label,
        rowCount: d.row_count,
        subjectCount: d.subject_count ?? null,
        trCount,
        adverseCount,
        keyFindings,
        tier,
      };
    }).sort((a, b) => {
      // Sort by tier first, then by adverseCount desc, then trCount desc
      if (a.tier !== b.tier) return a.tier - b.tier;
      if (a.adverseCount !== b.adverseCount) return b.adverseCount - a.adverseCount;
      if (a.trCount !== b.trCount) return b.trCount - a.trCount;
      return b.rowCount - a.rowCount;
    });
  }, [domains, domainSignals, mortalityData]);

  const aboveFold = rows.filter(r => r.tier <= 3);
  const belowFold = rows.filter(r => r.tier > 3);
  const displayed = showFolded ? rows : aboveFold;

  const handleRowClick = (code: string) => {
    navigate(`/studies/${encodeURIComponent(studyId)}/findings?domain=${code.toLowerCase()}`);
  };

  /** Format the Subjects cell — special for DS and TF */
  const formatSubjectsCell = (row: DomainTableRow) => {
    const dom = row.code.toLowerCase();
    if (dom === "ds" && mortalityData?.has_mortality) {
      // total_deaths only counts main-study non-accidental; use full arrays for real total
      const totalEvents = mortalityData.deaths.length + mortalityData.accidentals.length;
      return `${totalEvents} death${totalEvents !== 1 ? "s" : ""}`;
    }
    if (dom === "tf") {
      // Count unique endpoint labels as proxy for tumor count
      const sig = domainSignals[dom];
      const count = sig ? sig.endpoints.size : 0;
      return count > 0 ? `${count} type${count !== 1 ? "s" : ""}` : row.subjectCount != null ? String(row.subjectCount) : "\u2014";
    }
    return row.subjectCount != null ? String(row.subjectCount) : "\u2014";
  };

  return (
    <>
      <div className="max-h-72 overflow-auto rounded-md border">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="border-b bg-muted/30">
              <th className="px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Domain
              </th>
              <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: "1px", whiteSpace: "nowrap" }}>
                Subjects
              </th>
              <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: "1px", whiteSpace: "nowrap" }}>
                Signals
              </th>
              <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: "1px", whiteSpace: "nowrap" }}>
                Adverse
              </th>
              <th className="px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Key findings
              </th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((row) => (
              <tr
                key={row.code}
                className="cursor-pointer border-b last:border-b-0 hover:bg-muted/30"
                onClick={() => handleRowClick(row.code)}
              >
                <td className="px-1.5 py-px" style={{ width: "1px", whiteSpace: "nowrap" }}>
                  <Link
                    to={`/studies/${studyId}/domains/${row.code}`}
                    className="text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="font-mono">{row.code.toUpperCase()}</span>
                    <span className="ml-1.5 text-muted-foreground">{row.fullName}</span>
                  </Link>
                </td>
                <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground" style={{ width: "1px", whiteSpace: "nowrap" }}>
                  {formatSubjectsCell(row)}
                </td>
                <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground" style={{ width: "1px", whiteSpace: "nowrap" }}>
                  {row.trCount > 0 ? `${row.trCount} TR` : "\u2014"}
                </td>
                <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground" style={{ width: "1px", whiteSpace: "nowrap" }}>
                  {row.adverseCount > 0 ? `${row.adverseCount} adv` : "\u2014"}
                </td>
                <td className="px-1.5 py-px text-muted-foreground">
                  {row.keyFindings}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {belowFold.length > 0 && !showFolded && (
        <button
          className="mt-1 text-[10px] text-primary hover:underline"
          onClick={() => setShowFolded(true)}
        >
          + {belowFold.length} more domains (no findings)
        </button>
      )}
      {showFolded && belowFold.length > 0 && (
        <button
          className="mt-1 text-[10px] text-primary hover:underline"
          onClick={() => setShowFolded(false)}
        >
          Hide structural domains
        </button>
      )}
    </>
  );
}

function DetailsTab({
  meta,
  studyId,
  provenanceMessages,
  signalData,
  mortalityData,
}: {
  meta: StudyMetadata | undefined;
  studyId: string;
  provenanceMessages: ProvenanceMessage[] | undefined;
  signalData: SignalSummaryRow[];
  mortalityData: StudyMortality | undefined;
}) {
  const { data: domainData } = useDomains(studyId);
  const { excludedSubjects } = useScheduledOnly();
  const [controlGroup] = useSessionState(`pcc.${studyId}.controlGroup`, "");
  const [organWeightMethod] = useSessionState(`pcc.${studyId}.organWeightMethod`, "absolute");

  if (!meta) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">
          Loading details...
        </span>
      </div>
    );
  }

  // Computed subject breakdown from dose_groups
  const doseGroups = meta.dose_groups ?? [];
  const mainStudyN = doseGroups.reduce((s, dg) => s + dg.n_total, 0);
  const mainMales = doseGroups.reduce((s, dg) => s + dg.n_male, 0);
  const mainFemales = doseGroups.reduce((s, dg) => s + dg.n_female, 0);
  const tkTotal = doseGroups.reduce((s, dg) => s + (dg.tk_count ?? 0), 0);
  const recoveryTotal = doseGroups.reduce((s, dg) => s + (dg.recovery_n ?? 0), 0);
  const hasTk = tkTotal > 0;
  const hasRecovery = recoveryTotal > 0;

  // Filtered provenance: warnings only, excluding Prov-001..004 (now shown elsewhere)
  const filteredProv = (provenanceMessages ?? []).filter(
    (m) => m.icon === "warning" && !["Prov-001", "Prov-002", "Prov-003", "Prov-004"].includes(m.rule_id),
  );

  // Analysis settings summary — read shared session state to mirror context panel
  const excludedCount = excludedSubjects.size;
  const controlLabel = doseGroups.find((dg) => dg.armcd === controlGroup)?.label
    ?? (doseGroups.find((dg) => dg.dose_level === 0)?.label)
    ?? "Vehicle Control";
  const owMethodLabel = organWeightMethod === "ratio-bw" ? "ratio-to-BW"
    : organWeightMethod === "ratio-brain" ? "ratio-to-brain"
    : "absolute";
  const settingsParts: string[] = [];
  if (excludedCount > 0) settingsParts.push(`${excludedCount} subject${excludedCount !== 1 ? "s" : ""} excluded`);
  else settingsParts.push("All animals included");
  settingsParts.push(`control: ${controlLabel}`);
  settingsParts.push(`organ wt: ${owMethodLabel}`);

  // Domain data: prefer live domain list (with subject_count) over meta.domains
  const domainRows = domainData ?? meta.domains.map(d => ({ name: d, label: d.toUpperCase(), row_count: 0, col_count: 0 }));

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="mb-3">
        <h1 className="text-base font-semibold">Study: {meta.study_id}</h1>
        {meta.title && (
          <p className="mt-0.5 text-xs text-muted-foreground">{meta.title}</p>
        )}
      </div>

      <section className="mb-4">
        <h2 className="mb-2 border-b pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Study overview
        </h2>
        <MetadataRow label="Species" value={meta.species} />
        <MetadataRow label="Strain" value={meta.strain} />
        <MetadataRow label="Study type" value={meta.study_type} />
        <MetadataRow label="Design" value={meta.design} />
        <MetadataRow
          label="Subjects"
          value={formatSubjects(meta.subjects, meta.males, meta.females)}
        />
        {/* Subject breakdown — indented under Subjects */}
        {doseGroups.length > 0 && (hasTk || hasRecovery) && (
          <div className="ml-28 space-y-0 text-[10px] text-muted-foreground">
            <div>{"\u251C\u2500"} Main study{" "}<span className="tabular-nums">{mainStudyN} ({mainMales}M, {mainFemales}F)</span></div>
            {hasTk && (
              <div>{hasRecovery ? "\u251C\u2500" : "\u2514\u2500"} TK satellite{" "}<span className="tabular-nums">{tkTotal}</span></div>
            )}
            {hasRecovery && (
              <div>{"\u2514\u2500"} Recovery{" "}<span className="tabular-nums">{recoveryTotal}</span></div>
            )}
          </div>
        )}
        <MetadataRow label="Start date" value={meta.start_date} />
        <MetadataRow label="End date" value={meta.end_date} />
        <MetadataRow
          label="Duration"
          value={
            meta.dosing_duration ? formatDuration(meta.dosing_duration) : null
          }
        />
        {meta.dosing_duration && (() => {
          const wk = meta.dosing_duration.match(/^P(\d+)W$/);
          const dy = meta.dosing_duration.match(/^P(\d+)D$/);
          const days = wk ? parseInt(wk[1]) * 7 : dy ? parseInt(dy[1]) : null;
          return days ? <MetadataRow label="Dosing days" value={`${days}`} /> : null;
        })()}
        {meta.recovery_sacrifice && (
          <MetadataRow label="Recovery period" value={formatDuration(meta.recovery_sacrifice)} />
        )}
      </section>

      <section className="mb-4">
        <h2 className="mb-2 border-b pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Treatment
        </h2>
        <MetadataRow label="Test article" value={meta.treatment} />
        <MetadataRow label="Vehicle" value={meta.vehicle} />
        <MetadataRow label="Route" value={meta.route} />
      </section>


      {doseGroups.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 border-b pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Treatment arms ({doseGroups.length})
          </h2>
          <div className="max-h-60 overflow-auto rounded-md border">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 z-10 bg-background">
                <tr className="border-b bg-muted/30">
                  <th className="px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Arm code</th>
                  <th className="px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Label</th>
                  <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dose</th>
                  <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">M</th>
                  <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">F</th>
                  <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                  {hasTk && (
                    <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">TK</th>
                  )}
                  {hasRecovery && (
                    <th className="px-1.5 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recovery</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {doseGroups.map((dg) => (
                  <tr
                    key={dg.armcd}
                    className="border-b last:border-b-0 border-l-2"
                    style={{ borderLeftColor: getDoseGroupColor(dg.dose_level) }}
                  >
                    <td className="px-1.5 py-px font-mono">{dg.armcd}</td>
                    <td className="px-1.5 py-px">{dg.label}</td>
                    <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground">
                      {dg.dose_value != null
                        ? `${dg.dose_value}${dg.dose_unit ? ` ${dg.dose_unit}` : ""}`
                        : "\u2014"}
                    </td>
                    <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground">{dg.n_male}</td>
                    <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground">{dg.n_female}</td>
                    <td className="px-1.5 py-px text-right tabular-nums font-medium">{dg.n_total}</td>
                    {hasTk && (
                      <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground">
                        {(dg.tk_count ?? 0) > 0 ? dg.tk_count : "\u2014"}
                      </td>
                    )}
                    {hasRecovery && (
                      <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground">
                        {dg.recovery_armcd
                          ? `${dg.recovery_n ?? 0} (${dg.recovery_armcd})`
                          : "\u2014"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Provenance warnings — filtered, with "Configure" link */}
          {filteredProv.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {filteredProv.map((msg) => (
                <div
                  key={msg.rule_id + msg.message}
                  className="flex items-start gap-2 text-xs leading-snug"
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  <span className="text-amber-700">
                    {msg.message}
                    <button
                      className="ml-1.5 text-primary hover:underline"
                      onClick={() => {
                        const panel = document.querySelector("[data-panel='context']");
                        if (panel) panel.scrollIntoView({ behavior: "smooth" });
                      }}
                    >
                      Configure &rarr;
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Analysis settings — compact summary, full table in context panel */}
      <section className="mb-4">
        <h2 className="mb-2 border-b pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Analysis settings
        </h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{settingsParts.join(" \u00b7 ")}</span>
          <button
            className="text-primary hover:underline"
            onClick={() => {
              const panel = document.querySelector("[data-panel='context']");
              if (panel) panel.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Configure &rarr;
          </button>
        </div>
      </section>

      {/* Domain summary table */}
      <section>
        <h2 className="mb-2 border-b pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Domains ({domainRows.length})
        </h2>
        <DomainTable studyId={studyId} domains={domainRows} signalData={signalData} mortalityData={mortalityData} />
      </section>
    </div>
  );
}
