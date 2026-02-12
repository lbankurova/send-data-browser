import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, FileText, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ViewTabBar } from "@/components/ui/ViewTabBar";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { useNoaelSummary } from "@/hooks/useNoaelSummary";
import { useRuleResults } from "@/hooks/useRuleResults";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { useProvenanceMessages } from "@/hooks/useProvenanceMessages";
import { useInsights } from "@/hooks/useInsights";
import { useResizePanel } from "@/hooks/useResizePanel";
import { PanelResizeHandle } from "@/components/ui/PanelResizeHandle";
import { generateStudyReport } from "@/lib/report-generator";
import { buildSignalsPanelData } from "@/lib/signals-panel-engine";
import type { MetricsLine, PanelStatement, OrganBlock } from "@/lib/signals-panel-engine";
import {
  SignalsOrganRail,
  SignalsEvidencePanel,
  StudyStatementsBar,
} from "./SignalsPanel";
import type { SignalSelection, ProvenanceMessage } from "@/types/analysis-views";
import type { StudyMetadata } from "@/types";
import type { Insight } from "@/hooks/useInsights";

interface StudySummaryViewProps {
  onSelectionChange?: (selection: SignalSelection | null) => void;
  onOrganSelect?: (organSystem: string | null) => void;
}

type Tab = "details" | "signals" | "insights";

export function StudySummaryView({
  onSelectionChange,
  onOrganSelect,
}: StudySummaryViewProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const [searchParams] = useSearchParams();
  const { data: signalData, isLoading, error } = useStudySignalSummary(studyId);
  const { data: targetOrgans } = useTargetOrganSummary(studyId);
  const { data: noaelData } = useNoaelSummary(studyId);
  const { data: ruleResults } = useRuleResults(studyId);
  const { data: meta } = useStudyMetadata(studyId!);
  const { data: provenanceData } = useProvenanceMessages(studyId);

  // Initialize tab from URL query parameter if present
  const initialTab = (searchParams.get("tab") as Tab) || "details";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [selection, setSelection] = useState<SignalSelection | null>(null);
  const [selectedOrgan, setSelectedOrganState] = useState<string | null>(null);

  // Propagate selection changes to parent (SignalSelectionContext)
  useEffect(() => {
    onSelectionChange?.(selection);
  }, [selection, onSelectionChange]);

  useEffect(() => {
    onOrganSelect?.(selectedOrgan);
  }, [selectedOrgan, onOrganSelect]);

  // Mutually exclusive selection
  const handleSetSelection = useCallback((sel: SignalSelection | null) => {
    setSelection(sel);
    if (sel) setSelectedOrganState(null);
  }, []);

  const handleOrganClick = useCallback(
    (organ: string) => {
      setSelectedOrganState(organ);
      setSelection(null);
    },
    []
  );

  // Build panel data
  const panelData = useMemo(() => {
    if (!signalData || !targetOrgans || !noaelData) return null;
    return buildSignalsPanelData(noaelData, targetOrgans, signalData);
  }, [signalData, targetOrgans, noaelData]);

  // Resizable rail
  const { width: railWidth, onPointerDown: onRailResize } = useResizePanel(300, 180, 500);

  // Sorted organs (targets first, then by evidence_score desc)
  const sortedOrgans = useMemo(() => {
    if (!targetOrgans) return [];
    return [...targetOrgans].sort((a, b) => {
      if (a.target_organ_flag !== b.target_organ_flag) return a.target_organ_flag ? -1 : 1;
      return b.evidence_score - a.evidence_score;
    });
  }, [targetOrgans]);

  // Keyboard: Escape clears selection, ↑/↓ navigates organ rail
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (tab !== "signals") return;
      if (e.key === "Escape") {
        setSelection(null);
        setSelectedOrganState(null);
        return;
      }
      if ((e.key === "ArrowUp" || e.key === "ArrowDown") && sortedOrgans.length > 0) {
        e.preventDefault();
        const currentIdx = selectedOrgan
          ? sortedOrgans.findIndex((o) => o.organ_system === selectedOrgan)
          : -1;
        let nextIdx: number;
        if (e.key === "ArrowDown") {
          nextIdx = currentIdx < sortedOrgans.length - 1 ? currentIdx + 1 : 0;
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : sortedOrgans.length - 1;
        }
        handleOrganClick(sortedOrgans[nextIdx].organ_system);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, selectedOrgan, sortedOrgans, handleOrganClick]);

  // Max evidence score (for rail bar normalization)
  const maxEvidenceScore = useMemo(
    () =>
      sortedOrgans.length > 0
        ? Math.max(...sortedOrgans.map((o) => o.evidence_score))
        : 1,
    [sortedOrgans]
  );

  // OrganBlock map
  const organBlocksMap = useMemo(() => {
    const map = new Map<string, OrganBlock>();
    if (panelData?.organBlocks) {
      for (const ob of panelData.organBlocks) {
        map.set(ob.organKey, ob);
      }
    }
    return map;
  }, [panelData]);

  // Auto-select top organ when data loads
  useEffect(() => {
    if (
      tab === "signals" &&
      selectedOrgan === null &&
      sortedOrgans.length > 0
    ) {
      setSelectedOrganState(sortedOrgans[0].organ_system);
    }
  }, [tab, selectedOrgan, sortedOrgans]);

  // Selected organ data
  const selectedOrganData = useMemo(() => {
    if (!selectedOrgan || !targetOrgans) return null;
    return targetOrgans.find((o) => o.organ_system === selectedOrgan) ?? null;
  }, [selectedOrgan, targetOrgans]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="mb-4 rounded-lg bg-red-50 p-6">
          <h1 className="mb-2 text-xl font-semibold text-red-700">
            Analysis data not available
          </h1>
          <p className="text-sm text-red-600">
            Run the generator to produce analysis data:
          </p>
          <code className="mt-2 block rounded bg-red-100 px-3 py-1.5 text-xs text-red-800">
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
      {tab === "details" && <DetailsTab meta={meta} studyId={studyId!} provenanceMessages={provenanceData} />}
      {tab === "insights" && <CrossStudyInsightsTab studyId={studyId!} />}
      {tab === "signals" && panelData && (
        <div className="flex h-full flex-col overflow-hidden">
          {/* Decision Bar — persistent */}
          <DecisionBar
            statements={panelData.decisionBar}
            metrics={panelData.metrics}
          />

          {/* Study-level statements + study-level flags */}
          <StudyStatementsBar
            statements={panelData.studyStatements}
            modifiers={panelData.modifiers}
            caveats={panelData.caveats}
          />

          {/* Two-panel master-detail */}
          <div className="flex flex-1 overflow-hidden max-[1200px]:flex-col">
            <SignalsOrganRail
              organs={sortedOrgans}
              organBlocksMap={organBlocksMap}
              selectedOrgan={selectedOrgan}
              maxEvidenceScore={maxEvidenceScore}
              onOrganClick={handleOrganClick}
              signalData={signalData}
              width={railWidth}
            />
            <div className="max-[1200px]:hidden"><PanelResizeHandle onPointerDown={onRailResize} /></div>
            {selectedOrganData && signalData && (
              <SignalsEvidencePanel
                organ={selectedOrganData}
                signalData={signalData}
                ruleResults={ruleResults ?? []}
                modifiers={panelData.modifiers}
                caveats={panelData.caveats}
                selection={selection}
                onSelect={handleSetSelection}
                studyId={studyId!}
              />
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
  const { data: insights, isLoading } = useInsights(studyId);
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
// Decision Bar — persistent across both modes
// ---------------------------------------------------------------------------

function DecisionBar({
  statements,
  metrics,
}: {
  statements: PanelStatement[];
  metrics: MetricsLine;
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
          {metrics.noaelConfidence != null && (
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
          )}
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

function DetailsTab({
  meta,
  studyId,
  provenanceMessages,
}: {
  meta: StudyMetadata | undefined;
  studyId: string;
  provenanceMessages: ProvenanceMessage[] | undefined;
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
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Arm code</th>
                  <th className="px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Label</th>
                  <th className="px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Dose</th>
                  <th className="px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">M</th>
                  <th className="px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">F</th>
                  <th className="px-2 py-1 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {meta.dose_groups.map((dg) => (
                  <tr key={dg.armcd} className="border-b last:border-b-0">
                    <td className="px-2 py-1 font-mono text-xs">{dg.armcd}</td>
                    <td className="px-2 py-1">{dg.label}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                      {dg.dose_value != null
                        ? `${dg.dose_value}${dg.dose_unit ? ` ${dg.dose_unit}` : ""}`
                        : "—"}
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{dg.n_male}</td>
                    <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">{dg.n_female}</td>
                    <td className="px-2 py-1 text-right tabular-nums font-medium">{dg.n_total}</td>
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
