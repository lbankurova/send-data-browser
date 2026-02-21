import { useState, useMemo, useCallback, useEffect } from "react";
import { useSessionState } from "@/hooks/useSessionState";
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
import { useStudyMortality } from "@/hooks/useStudyMortality";
import type { StudyMortality, DeathRecord } from "@/types/mortality";
import { ChevronDown } from "lucide-react";
import type { SignalSelection, SignalSummaryRow, ProvenanceMessage, NoaelSummaryRow, RuleResult } from "@/types/analysis-views";
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
  const [tab, setTab] = useSessionState<Tab>("pcc.studySummary.tab", initialTab);

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
      {tab === "details" && <DetailsTab meta={meta} studyId={studyId!} provenanceMessages={provenanceData} mortality={mortalityData} />}
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

/** Tooltip explaining why a subject is defaulted to included or excluded. */
function subjectDataTooltip(d: DeathRecord & { attribution: string }, isExcluded: boolean, isTr: boolean): string {
  const id = d.USUBJID;
  if (d.is_recovery) {
    return isExcluded
      ? `${id}: Recovery arm \u2014 excluded from main-study analysis (separate arm). Click to override.`
      : `${id}: Recovery arm \u2014 included by reviewer override.`;
  }
  if (d.attribution === "Accidental") {
    return isExcluded
      ? `${id}: Accidental death \u2014 excluded by reviewer override. Default: included (valid drug-exposure data through day ${d.study_day ?? "?"}).`
      : `${id}: Accidental death \u2014 included (default). Data valid through death day; not drug-related. Longitudinal data naturally ends at day ${d.study_day ?? "?"}.`;
  }
  if (isTr) {
    return isExcluded
      ? `${id}: TR early death \u2014 excluded (default). Moribund/found-dead terminal data skews group means.`
      : `${id}: TR early death \u2014 included by reviewer override. Default: excluded (terminal data from severely affected animals skews group means).`;
  }
  return isExcluded
    ? `${id}: excluded from terminal stats. Click to include.`
    : `${id}: included in terminal stats. Click to exclude.`;
}

/** Collapsible data settings section with per-subject mortality table. */
function MortalityDataSettings({ mortality }: { mortality?: StudyMortality | null }) {
  const [open, setOpen] = useState(false);
  const { excludedSubjects, toggleSubjectExclusion, setUseScheduledOnly, trEarlyDeathIds } = useScheduledOnly();

  // Combine all deaths: TR (main + recovery) + accidental, sorted by study_day
  const allDeaths: (DeathRecord & { attribution: string })[] = mortality
    ? [
        ...mortality.deaths.map(d => ({ ...d, attribution: "TR" as const })),
        ...mortality.accidentals.map(d => ({ ...d, attribution: "Accidental" as const })),
      ].sort((a, b) => (a.study_day ?? 999) - (b.study_day ?? 999))
    : [];

  const hasMortality = mortality?.has_mortality && allDeaths.length > 0;
  const unit = mortality?.mortality_loael_label?.match(/\d[\d.]*\s*(mg\/kg|mg|µg\/kg|µg|g\/kg|g)/)?.[1] ?? "";

  // NOAEL cap
  const capLevel = mortality?.mortality_loael != null ? mortality.mortality_loael - 1 : null;
  const capDose = capLevel != null ? mortality?.by_dose.find(b => b.dose_level === capLevel) : null;
  const capLabel = capDose?.dose_value != null && unit ? `${capDose.dose_value} ${unit}` : null;

  const excludedCount = excludedSubjects.size;
  const allTrExcluded = trEarlyDeathIds.size > 0 && [...trEarlyDeathIds].every(id => excludedSubjects.has(id));

  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mb-2 flex w-full items-center gap-1.5 border-b pb-0.5"
      >
        <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform", !open && "-rotate-90")} />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Data settings
        </span>
        <span className="ml-2 text-[10px] text-muted-foreground">
          {excludedCount > 0
            ? `${excludedCount} subject${excludedCount !== 1 ? "s" : ""} excluded`
            : "All animals included"}
          {hasMortality && ` \u00b7 ${allDeaths.length} death${allDeaths.length !== 1 ? "s" : ""}`}
        </span>
      </button>

      {open && (
        <div className="space-y-3">
          {/* Bulk toggle — controls TR early deaths only */}
          {trEarlyDeathIds.size > 0 && (
            <label
              className="flex items-center gap-2 text-xs"
              title="Exclude treatment-related early deaths from terminal group statistics. Accidental deaths remain included (valid drug-exposure data)."
            >
              <input
                type="checkbox"
                checked={allTrExcluded}
                onChange={(e) => setUseScheduledOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-gray-300"
              />
              <span>Exclude TR early deaths from terminal stats</span>
              <span className="text-[10px] text-muted-foreground">
                ({trEarlyDeathIds.size} subject{trEarlyDeathIds.size !== 1 ? "s" : ""})
              </span>
            </label>
          )}

          {/* Per-subject table */}
          {hasMortality && mortality && (
            <div className="overflow-auto">
              <table className="border-collapse text-[10px]">
                <tbody>
                  {/* Subj. ID */}
                  <tr>
                    <td className="whitespace-nowrap pr-3 py-px text-[9px] text-muted-foreground">Subj. ID</td>
                    {allDeaths.map(d => (
                      <td key={d.USUBJID} className="whitespace-nowrap px-2 py-px text-center font-mono tabular-nums font-medium" style={{ color: "#3b82f6" }}>
                        {d.USUBJID.slice(-4)}
                      </td>
                    ))}
                  </tr>
                  {/* Group */}
                  <tr>
                    <td className="whitespace-nowrap pr-3 py-px text-[9px] text-muted-foreground">Group</td>
                    {allDeaths.map(d => {
                      const dg = mortality.by_dose.find(b => b.dose_level === d.dose_level);
                      const doseStr = dg?.dose_value != null && unit ? `${dg.dose_value} ${unit}` : d.dose_label;
                      return (
                        <td key={d.USUBJID} className="whitespace-nowrap px-2 py-px text-center font-mono tabular-nums font-medium" style={{ color: getDoseGroupColor(d.dose_level) }}>
                          {doseStr}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Sex */}
                  <tr>
                    <td className="whitespace-nowrap pr-3 py-px text-[9px] text-muted-foreground">Sex</td>
                    {allDeaths.map(d => (
                      <td key={d.USUBJID} className="whitespace-nowrap px-2 py-px text-center font-mono tabular-nums">{d.sex}</td>
                    ))}
                  </tr>
                  {/* Day */}
                  <tr>
                    <td className="whitespace-nowrap pr-3 py-px text-[9px] text-muted-foreground">Day</td>
                    {allDeaths.map(d => (
                      <td key={d.USUBJID} className="whitespace-nowrap px-2 py-px text-center font-mono tabular-nums">{d.study_day != null ? String(d.study_day) : "\u2014"}</td>
                    ))}
                  </tr>
                  {/* Phase */}
                  <tr>
                    <td className="whitespace-nowrap pr-3 py-px text-[9px] text-muted-foreground">Phase</td>
                    {allDeaths.map(d => (
                      <td key={d.USUBJID} className="whitespace-nowrap px-2 py-px text-center font-mono tabular-nums">{d.is_recovery ? "Recovery" : "Treatment"}</td>
                    ))}
                  </tr>
                  {/* Attribution */}
                  <tr>
                    <td className="whitespace-nowrap pr-3 py-px text-[9px] text-muted-foreground">Attribution</td>
                    {allDeaths.map(d => (
                      <td key={d.USUBJID} className={`whitespace-nowrap px-2 py-px text-center font-mono tabular-nums ${d.attribution === "TR" ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {d.attribution}
                      </td>
                    ))}
                  </tr>
                  {/* Cause */}
                  <tr>
                    <td className="whitespace-nowrap pr-3 py-px text-[9px] text-muted-foreground">Cause</td>
                    {allDeaths.map(d => {
                      const cause = d.cause ?? d.disposition;
                      const truncated = cause.length > 25 ? cause.slice(0, 24) + "\u2026" : cause;
                      return (
                        <td key={d.USUBJID} className="whitespace-nowrap px-2 py-px text-center font-mono tabular-nums" title={cause.length > 25 ? cause : undefined}>
                          {truncated}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Data — per-subject YES/NO toggles with attribution reasoning */}
                  <tr>
                    <td className="whitespace-nowrap pr-3 py-px text-[9px] text-muted-foreground">Data</td>
                    {allDeaths.map(d => {
                      const isExcluded = excludedSubjects.has(d.USUBJID);
                      const isTr = trEarlyDeathIds.has(d.USUBJID);
                      return (
                        <td key={d.USUBJID} className="whitespace-nowrap px-2 py-px text-center">
                          <button
                            type="button"
                            className="inline-flex cursor-pointer gap-0.5 text-[9px]"
                            onClick={() => toggleSubjectExclusion(d.USUBJID)}
                            title={subjectDataTooltip(d, isExcluded, isTr)}
                          >
                            <span className={!isExcluded ? "font-medium text-foreground" : "text-muted-foreground/40"}>YES</span>
                            <span className="text-muted-foreground/30">|</span>
                            <span className={isExcluded ? "font-medium text-foreground" : "text-muted-foreground/40"}>NO</span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                  {/* Default reason — shows why each subject is defaulted */}
                  <tr>
                    <td className="whitespace-nowrap pr-3 py-px text-[9px] text-muted-foreground">Default</td>
                    {allDeaths.map(d => {
                      const isTr = trEarlyDeathIds.has(d.USUBJID);
                      let reason: string;
                      let cls: string;
                      if (d.is_recovery) {
                        reason = "Separate arm";
                        cls = "text-muted-foreground/60";
                      } else if (d.attribution === "Accidental") {
                        reason = "Included";
                        cls = "text-muted-foreground";
                      } else if (isTr) {
                        reason = "Excluded";
                        cls = "text-foreground/70 font-medium";
                      } else {
                        reason = "Included";
                        cls = "text-muted-foreground";
                      }
                      return (
                        <td key={d.USUBJID} className={`whitespace-nowrap px-2 py-px text-center text-[9px] ${cls}`}>
                          {reason}
                        </td>
                      );
                    })}
                  </tr>
                  {/* NOAEL impact */}
                  <tr>
                    <td className="whitespace-nowrap pr-3 py-px text-[9px] text-muted-foreground">NOAEL impact</td>
                    {allDeaths.map(d => {
                      if (d.is_recovery) return <td key={d.USUBJID} className="whitespace-nowrap px-2 py-px text-center font-mono tabular-nums text-muted-foreground">None (recovery)</td>;
                      if (d.attribution === "Accidental") return <td key={d.USUBJID} className="whitespace-nowrap px-2 py-px text-center font-mono tabular-nums text-muted-foreground">None</td>;
                      if (mortality.mortality_loael != null && d.dose_level === mortality.mortality_loael && capLabel) {
                        return <td key={d.USUBJID} className="whitespace-nowrap px-2 py-px text-center font-mono tabular-nums font-medium text-foreground">Capped {"\u2264"} {capLabel}</td>;
                      }
                      return <td key={d.USUBJID} className="whitespace-nowrap px-2 py-px text-center font-mono tabular-nums text-muted-foreground">None</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Empty state */}
          {!hasMortality && (
            <div className="text-[10px] text-muted-foreground/60">No mortality events recorded in this study.</div>
          )}
        </div>
      )}
    </section>
  );
}

function DetailsTab({
  meta,
  studyId,
  provenanceMessages,
  mortality,
}: {
  meta: StudyMetadata | undefined;
  studyId: string;
  provenanceMessages: ProvenanceMessage[] | undefined;
  mortality?: StudyMortality | null;
}) {
  const navigate = useNavigate();
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
        <MetadataRow label="Start date" value={meta.start_date} />
        <MetadataRow label="End date" value={meta.end_date} />
        <MetadataRow
          label="Duration"
          value={
            meta.dosing_duration ? formatDuration(meta.dosing_duration) : null
          }
        />
      </section>

      <section className="mb-4">
        <h2 className="mb-2 border-b pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Treatment
        </h2>
        <MetadataRow label="Test article" value={meta.treatment} />
        <MetadataRow label="Vehicle" value={meta.vehicle} />
        <MetadataRow label="Route" value={meta.route} />
      </section>


      {meta.dose_groups && meta.dose_groups.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 border-b pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Treatment arms ({meta.dose_groups.length})
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
                </tr>
              </thead>
              <tbody>
                {meta.dose_groups.map((dg) => (
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
                        : "—"}
                    </td>
                    <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground">{dg.n_male}</td>
                    <td className="px-1.5 py-px text-right tabular-nums text-muted-foreground">{dg.n_female}</td>
                    <td className="px-1.5 py-px text-right tabular-nums font-medium">{dg.n_total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Provenance messages — below treatment arms table */}
          {provenanceMessages && provenanceMessages.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {provenanceMessages.map((msg) => (
                <div
                  key={msg.rule_id + msg.message}
                  className="flex items-start gap-2 text-xs leading-snug"
                >
                  {msg.icon === "warning" ? (
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  ) : (
                    <Info className="mt-0.5 h-3 w-3 shrink-0 text-blue-400" />
                  )}
                  <span
                    className={cn(
                      msg.icon === "warning"
                        ? "text-amber-700"
                        : "text-muted-foreground"
                    )}
                  >
                    {msg.message}
                    {msg.link_to_rule && (
                      <button
                        className="ml-1.5 text-primary hover:underline"
                        onClick={() =>
                          navigate(
                            `/studies/${studyId}/validation?mode=study-design&rule=${msg.link_to_rule}`
                          )
                        }
                      >
                        Review &rarr;
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <MortalityDataSettings mortality={mortality} />

      <section>
        <h2 className="mb-2 border-b pb-0.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Domains ({meta.domain_count})
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {meta.domains.map((d) => (
            <Link
              key={d}
              to={`/studies/${studyId}/domains/${d}`}
              className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs transition-colors hover:bg-primary/20"
            >
              {d}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
