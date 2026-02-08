import { useState, useMemo, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStudySignalSummary } from "@/hooks/useStudySignalSummary";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import { useNoaelSummary } from "@/hooks/useNoaelSummary";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { generateStudyReport } from "@/lib/report-generator";
import { buildSignalsPanelData, buildFilteredMetrics } from "@/lib/signals-panel-engine";
import type { MetricsLine, PanelStatement } from "@/lib/signals-panel-engine";
import { FindingsView } from "./SignalsPanel";
import { OrganGroupedHeatmap } from "./charts/OrganGroupedHeatmap";
import type { PendingNavigation } from "./charts/OrganGroupedHeatmap";
import { StudySummaryFilters } from "./StudySummaryFilters";
import { StudySummaryGrid } from "./StudySummaryGrid";
import type {
  StudySummaryFilters as Filters,
  SignalSelection,
} from "@/types/analysis-views";

interface StudySummaryViewProps {
  onSelectionChange?: (selection: SignalSelection | null) => void;
  onOrganSelect?: (organSystem: string | null) => void;
}

type Tab = "details" | "signals";
type CenterPanelMode = "findings" | "heatmap";

export function StudySummaryView({ onSelectionChange, onOrganSelect }: StudySummaryViewProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: signalData, isLoading, error } = useStudySignalSummary(studyId);
  const { data: targetOrgans } = useTargetOrganSummary(studyId);
  const { data: noaelData } = useNoaelSummary(studyId);
  const { data: meta } = useStudyMetadata(studyId!);

  const [tab, setTab] = useState<Tab>("details");
  const [centerMode, setCenterMode] = useState<CenterPanelMode>("findings");
  const [filters, setFilters] = useState<Filters>({
    endpoint_type: null,
    organ_system: null,
    signal_score_min: 0,
    sex: null,
    significant_only: false,
  });

  const [selection, setSelection] = useState<SignalSelection | null>(null);
  const [organSelection, setOrganSelectionState] = useState<string | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<PendingNavigation | null>(null);
  const [showGrid, setShowGrid] = useState(false);

  // Heatmap expanded organs — target organs start expanded
  const [heatmapExpandedOrgans, setHeatmapExpandedOrgans] = useState<Set<string>>(new Set());

  // Initialize expanded organs when targetOrgans data loads
  useEffect(() => {
    if (!targetOrgans) return;
    const targets = targetOrgans
      .filter((t) => t.target_organ_flag)
      .map((t) => t.organ_system);
    setHeatmapExpandedOrgans(new Set(targets));
  }, [targetOrgans]);

  // Propagate selection changes to parent (SignalSelectionContext)
  useEffect(() => {
    onSelectionChange?.(selection);
  }, [selection, onSelectionChange]);

  useEffect(() => {
    onOrganSelect?.(organSelection);
  }, [organSelection, onOrganSelect]);

  // Mutually exclusive selection
  const handleSetSelection = useCallback((sel: SignalSelection | null) => {
    setSelection(sel);
    if (sel) setOrganSelectionState(null);
  }, []);

  const handleSetOrganSelection = useCallback((organ: string | null) => {
    setOrganSelectionState(organ);
    if (organ) setSelection(null);
  }, []);

  // Cross-mode navigation: organ click in Findings → switch to Heatmap
  const handleOrganNavigate = useCallback((organKey: string) => {
    handleSetOrganSelection(organKey);
    setCenterMode("heatmap");
    setPendingNavigation({ targetOrgan: organKey });
  }, [handleSetOrganSelection]);

  // Endpoint click in Decision Bar
  const handleDecisionBarEndpointClick = useCallback((endpointLabel: string) => {
    if (!signalData) return;
    const match = signalData.find(
      (s) => s.endpoint_label === endpointLabel
    );
    if (match) {
      handleSetSelection({
        endpoint_label: match.endpoint_label,
        dose_level: match.dose_level,
        sex: match.sex,
        domain: match.domain,
        test_code: match.test_code,
        organ_system: match.organ_system,
      });
      // Per spec: if in Findings, stay in Findings. If in Heatmap, scroll to endpoint.
      if (centerMode === "heatmap") {
        setPendingNavigation({
          targetOrgan: match.organ_system,
          targetEndpoint: match.endpoint_label,
        });
      }
    }
  }, [signalData, centerMode, handleSetSelection]);

  // Heatmap organ select
  const handleHeatmapOrganSelect = useCallback((organKey: string) => {
    handleSetOrganSelection(organKey);
  }, [handleSetOrganSelection]);

  const handleToggleOrgan = useCallback((organKey: string) => {
    setHeatmapExpandedOrgans((prev) => {
      const next = new Set(prev);
      if (next.has(organKey)) next.delete(organKey);
      else next.add(organKey);
      return next;
    });
  }, []);

  const handleNavigationConsumed = useCallback(() => {
    setPendingNavigation(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (tab !== "signals") return;
        if (centerMode === "heatmap") {
          // Return to Findings, preserve selection
          setCenterMode("findings");
        } else {
          // Clear selection
          setSelection(null);
          setOrganSelectionState(null);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, centerMode]);

  // Filter data
  const filteredData = useMemo(() => {
    if (!signalData) return [];
    return signalData.filter((row) => {
      if (filters.endpoint_type && row.endpoint_type !== filters.endpoint_type)
        return false;
      if (filters.organ_system && row.organ_system !== filters.organ_system)
        return false;
      if (row.signal_score < filters.signal_score_min) return false;
      if (filters.sex && row.sex !== filters.sex) return false;
      if (
        filters.significant_only &&
        (row.p_value === null || row.p_value >= 0.05)
      )
        return false;
      return true;
    });
  }, [signalData, filters]);

  // Build panel data
  const panelData = useMemo(() => {
    if (!signalData || !targetOrgans || !noaelData) return null;
    return buildSignalsPanelData(noaelData, targetOrgans, signalData);
  }, [signalData, targetOrgans, noaelData]);

  // Filter-responsive metrics
  const displayMetrics = useMemo(() => {
    if (!panelData) return null;
    return buildFilteredMetrics(panelData.metrics, filteredData);
  }, [panelData, filteredData]);

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
      <div className="flex items-center border-b">
        <div className="flex">
          {([
            { key: "details" as Tab, label: "Study details" },
            { key: "signals" as Tab, label: "Signals" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "relative px-4 py-2.5 text-xs font-medium transition-colors",
                tab === key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
              {tab === key && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>
        <div className="ml-auto px-3 py-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent/50"
            onClick={() => studyId && generateStudyReport(studyId)}
          >
            <FileText className="h-3.5 w-3.5" />
            Generate report
          </button>
        </div>
      </div>

      {/* Tab content */}
      {tab === "details" && <DetailsTab meta={meta} studyId={studyId!} />}
      {tab === "signals" && panelData && (
        <div className="flex h-full flex-col overflow-hidden">
          {/* Decision Bar — persistent */}
          <DecisionBar
            statements={panelData.decisionBar}
            metrics={displayMetrics ?? panelData.metrics}
            onEndpointClick={handleDecisionBarEndpointClick}
          />

          {/* Mode toggle + filter bar */}
          <div className="flex items-center gap-3 border-b px-4 py-1.5">
            {/* Segmented control */}
            <div className="flex rounded-md border">
              <button
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors",
                  centerMode === "findings"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setCenterMode("findings")}
              >
                Findings
              </button>
              <button
                className={cn(
                  "px-3 py-1 text-xs font-medium transition-colors",
                  centerMode === "heatmap"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setCenterMode("heatmap")}
              >
                Heatmap
              </button>
            </div>

            {/* Filters — visible in both modes, dimmed in Findings */}
            <div
              className={cn(
                "flex-1 transition-opacity",
                centerMode === "findings" && "pointer-events-none opacity-40"
              )}
              title={
                centerMode === "findings"
                  ? "Filters apply to Heatmap view"
                  : undefined
              }
            >
              <StudySummaryFilters
                data={signalData}
                filters={filters}
                onChange={setFilters}
              />
            </div>
          </div>

          {/* Center content */}
          {centerMode === "findings" ? (
            <FindingsView
              data={panelData}
              organSelection={organSelection}
              onOrganNavigate={handleOrganNavigate}
              onOrganSelect={handleSetOrganSelection}
              onEndpointClick={handleDecisionBarEndpointClick}
            />
          ) : (
            <div className="flex-1 overflow-auto">
              {targetOrgans && (
                <OrganGroupedHeatmap
                  data={filteredData}
                  targetOrgans={targetOrgans}
                  selection={selection}
                  organSelection={organSelection}
                  onSelect={handleSetSelection}
                  onOrganSelect={handleHeatmapOrganSelect}
                  expandedOrgans={heatmapExpandedOrgans}
                  onToggleOrgan={handleToggleOrgan}
                  pendingNavigation={pendingNavigation}
                  onNavigationConsumed={handleNavigationConsumed}
                />
              )}

              {/* Toggle for signal table */}
              <div className="border-t px-4 py-2">
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setShowGrid((v) => !v)}
                >
                  {showGrid
                    ? "Hide signal table"
                    : `Show signal table (${filteredData.length} rows)`}
                </button>
              </div>
              {showGrid && (
                <div className="border-t">
                  <StudySummaryGrid
                    data={filteredData}
                    selection={selection}
                    onSelect={handleSetSelection}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Decision Bar — persistent across both modes
// ---------------------------------------------------------------------------

function DecisionBar({
  statements,
  metrics,
  onEndpointClick,
}: {
  statements: PanelStatement[];
  metrics: MetricsLine;
  onEndpointClick?: (endpointLabel: string) => void;
}) {
  return (
    <div className="shrink-0 border-b px-4 py-2.5">
      {/* NOAEL statement(s) */}
      <div className="space-y-0.5">
        {statements.map((s, i) => {
          const isAlert = s.icon === "warning" || s.icon === "review-flag";
          const isMainLine = i === 0;
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-2 leading-snug",
                isMainLine ? "text-sm font-medium" : "text-sm",
                isAlert && "text-amber-700"
              )}
            >
              <span
                className={cn(
                  "shrink-0",
                  isAlert
                    ? "mt-0.5 text-[11px] text-amber-600"
                    : "mt-[5px] text-[8px] text-blue-500"
                )}
              >
                {isAlert ? "\u25B2" : "\u25CF"}
              </span>
              <span>
                {s.clickEndpoint ? (
                  <DecisionBarClickableText
                    text={s.text}
                    clickEndpoint={s.clickEndpoint}
                    onEndpointClick={onEndpointClick}
                  />
                ) : (
                  s.text
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Metrics line */}
      <div className="mt-1 flex flex-wrap gap-x-1.5 text-xs text-muted-foreground">
        <span>
          <span className="font-medium">NOAEL</span>{" "}
          <span
            className={cn(
              "font-semibold",
              metrics.noael === "Not established" || metrics.noael === "Control"
                ? "text-amber-600"
                : "text-foreground"
            )}
          >
            {metrics.noael}
          </span>
          {metrics.noaelSex && (
            <span className="text-muted-foreground"> ({metrics.noaelSex})</span>
          )}
        </span>
        <span>&middot;</span>
        <span>
          {metrics.targets} target{metrics.targets !== 1 ? "s" : ""}
        </span>
        <span>&middot;</span>
        <span>{metrics.significantRatio} significant</span>
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

function DecisionBarClickableText({
  text,
  clickEndpoint,
  onEndpointClick,
}: {
  text: string;
  clickEndpoint: string;
  onEndpointClick?: (ep: string) => void;
}) {
  const idx = text.indexOf(clickEndpoint);
  if (idx === -1) return <>{text}</>;

  const before = text.slice(0, idx);
  const after = text.slice(idx + clickEndpoint.length);

  return (
    <>
      {before}
      <button
        className="font-semibold text-blue-600 hover:underline"
        onClick={() => onEndpointClick?.(clickEndpoint)}
      >
        {clickEndpoint}
      </button>
      {after}
    </>
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
    <div className="flex gap-3 py-1 text-sm">
      <span className="w-36 shrink-0 text-muted-foreground">{label}</span>
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

import type { StudyMetadata } from "@/types";

function DetailsTab({ meta, studyId }: { meta: StudyMetadata | undefined; studyId: string }) {
  if (!meta) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading details...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Study: {meta.study_id}</h1>
        {meta.title && (
          <p className="mt-1 text-muted-foreground">{meta.title}</p>
        )}
      </div>

      <section className="mb-6">
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
          value={meta.dosing_duration ? formatDuration(meta.dosing_duration) : null}
        />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Treatment
        </h2>
        <MetadataRow label="Test article" value={meta.treatment} />
        <MetadataRow label="Vehicle" value={meta.vehicle} />
        <MetadataRow label="Route" value={meta.route} />
      </section>

      <section className="mb-6">
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Administration
        </h2>
        <MetadataRow label="Sponsor" value={meta.sponsor} />
        <MetadataRow label="Test facility" value={meta.test_facility} />
        <MetadataRow label="Study director" value={meta.study_director} />
        <MetadataRow label="GLP" value={meta.glp} />
        <MetadataRow label="SEND version" value={meta.send_version} />
      </section>

      <section>
        <h2 className="mb-3 border-b pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Domains ({meta.domain_count})
        </h2>
        <div className="flex flex-wrap gap-2">
          {meta.domains.map((d) => (
            <Link
              key={d}
              to={`/studies/${studyId}/domains/${d}`}
              className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs hover:bg-primary/20 transition-colors"
            >
              {d}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
