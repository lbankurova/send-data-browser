import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { Info, EyeOff } from "lucide-react";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useTumorSummary } from "@/hooks/useTumorSummary";
import { useStudyContext } from "@/hooks/useStudyContext";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
import { usePkIntegration } from "@/hooks/usePkIntegration";
import { useCrossAnimalFlags } from "@/hooks/useCrossAnimalFlags";
import { useFindingsAnalyticsLocal } from "@/hooks/useFindingsAnalyticsLocal";
import { useSelection } from "@/contexts/SelectionContext";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { FilterBar } from "@/components/ui/FilterBar";
import { StudyBanner } from "@/components/analysis/StudyBanner";
import { MortalityBanner } from "@/components/analysis/MortalityBanner";
import { FindingsTable } from "../FindingsTable";
import { FindingsQuadrantScatter } from "./FindingsQuadrantScatter";
import type { ScatterSelectedPoint } from "./FindingsQuadrantScatter";
import type { RailVisibleState } from "./FindingsRail";
import { ViewSection } from "@/components/ui/ViewSection";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutoFitSections } from "@/hooks/useAutoFitSections";
import { FindingsAnalyticsProvider } from "@/contexts/FindingsAnalyticsContext";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import type { GroupingMode } from "@/lib/findings-rail-engine";
import { formatPValue, formatEffectSize } from "@/lib/severity-colors";
import { getEffectSizeLabel, getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import type { UnifiedFinding } from "@/types/analysis";

/** Pick the most-significant finding row: min p-value (primary), max |effect size| (secondary). */
function pickBestFinding(findings: UnifiedFinding[]): UnifiedFinding {
  return findings.reduce((best, f) => {
    const bestP = best.min_p_adj ?? Infinity;
    const fP = f.min_p_adj ?? Infinity;
    if (fP < bestP) return f;
    if (fP === bestP) {
      const bestE = Math.abs(best.max_effect_size ?? 0);
      const fE = Math.abs(f.max_effect_size ?? 0);
      if (fE > bestE) return f;
    }
    return best;
  });
}

// ─── Event bus (simplified) ───────────────────────────────

interface FindingsCallbackState {
  activeEndpoint?: string | null;
  activeGrouping?: GroupingMode;
  visibleEndpoints?: RailVisibleState;
  restoreEndpoint?: string;
}

let _findingsRailCallback: ((state: FindingsCallbackState) => void) | null = null;
let _findingsClearScopeCallback: (() => void) | null = null;

export function setFindingsRailCallback(cb: typeof _findingsRailCallback) {
  _findingsRailCallback = cb;
}
export function getFindingsRailCallback() {
  return _findingsRailCallback;
}
export function setFindingsClearScopeCallback(cb: typeof _findingsClearScopeCallback) {
  _findingsClearScopeCallback = cb;
}
export function getFindingsClearScopeCallback() {
  return _findingsClearScopeCallback;
}

let _findingsExcludedCallback: ((excluded: ReadonlySet<string>) => void) | null = null;
export function setFindingsExcludedCallback(cb: typeof _findingsExcludedCallback) {
  _findingsExcludedCallback = cb;
}

export function FindingsView() {
  const { studyId } = useParams<{ studyId: string }>();
  const { selectStudy } = useSelection();
  const { selectFinding, setEndpointSexes } = useFindingSelection();
  const containerRef = useRef<HTMLDivElement>(null);

  // 50/50 default split: scatter takes half the viewport-estimated container height
  const scatterSections = useMemo(() => {
    const half = Math.round(window.innerHeight * 0.4);
    return [{ id: "scatter", min: 80, max: 2000, defaultHeight: half }];
  }, []);
  const [scatterSection] = useAutoFitSections(containerRef, "findings", scatterSections);

  // Mortality data
  const { data: mortalityData } = useStudyMortality(studyId);

  // Tumor summary for StudyBanner
  const { data: tumorSummary } = useTumorSummary(studyId);

  // Cross-animal flags for StudyBanner
  const { data: crossAnimalFlags } = useCrossAnimalFlags(studyId);

  // Study context for StudyBanner
  const { data: studyContext } = useStudyContext(studyId);
  const { data: studyMeta } = useStudyMetadata(studyId ?? "");
  const { data: pkData } = usePkIntegration(studyId);
  const doseGroupCount = studyMeta?.dose_groups?.length ?? 0;

  // Scheduled-only exclusion context
  const { setEarlyDeathSubjects, useScheduledOnly: isScheduledOnly } = useScheduledOnly();

  // Rail-provided state (single source of truth for filtering)
  const [visibleLabels, setVisibleLabels] = useState<Set<string> | null>(null);
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<string | null>(null);
  const [filterLabels, setFilterLabels] = useState<string[]>([]);
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null);
  const [activeGrouping, setActiveGrouping] = useState<GroupingMode | null>(null);

  // Local UI state
  const [selectedPointData, setSelectedPointData] = useState<ScatterSelectedPoint | null>(null);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const infoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [excludedEndpoints, setExcludedEndpoints] = useState<Set<string>>(new Set());

  const handleSelectedPointChange = useCallback((pt: ScatterSelectedPoint | null) => {
    setSelectedPointData(pt);
  }, []);

  const handleInfoMouseEnter = useCallback(() => {
    if (infoHideTimerRef.current) { clearTimeout(infoHideTimerRef.current); infoHideTimerRef.current = null; }
    setShowInfoTooltip(true);
  }, []);

  const handleInfoMouseLeave = useCallback(() => {
    infoHideTimerRef.current = setTimeout(() => setShowInfoTooltip(false), 150);
  }, []);

  const handleExcludeEndpoint = useCallback((label: string) => {
    setExcludedEndpoints((prev) => { const next = new Set(prev); next.add(label); return next; });
  }, []);

  const handleRestoreEndpoint = useCallback((label: string) => {
    setExcludedEndpoints((prev) => { const next = new Set(prev); next.delete(label); return next; });
  }, []);

  // Sync excluded endpoints to rail via reverse callback
  useEffect(() => {
    if (_findingsExcludedCallback) {
      _findingsExcludedCallback(excludedEndpoints);
    } else if (excludedEndpoints.size > 0) {
      const id = requestAnimationFrame(() => _findingsExcludedCallback?.(excludedEndpoints));
      return () => cancelAnimationFrame(id);
    }
  }, [excludedEndpoints]);

  // Sync study selection
  useEffect(() => {
    if (studyId) selectStudy(studyId);
  }, [studyId, selectStudy]);

  // Rail endpoint click → select finding in table
  const handleEndpointSelect = useCallback((endpointLabel: string | null) => {
    setActiveEndpoint(endpointLabel);
  }, []);

  // Register event bus callback
  useEffect(() => {
    setFindingsRailCallback((state) => {
      if (state.activeEndpoint !== undefined) handleEndpointSelect(state.activeEndpoint);
      if (state.activeGrouping !== undefined) setActiveGrouping(state.activeGrouping);
      if (state.restoreEndpoint !== undefined) handleRestoreEndpoint(state.restoreEndpoint);
      if (state.visibleEndpoints !== undefined) {
        const ve = state.visibleEndpoints;
        setVisibleLabels(new Set(ve.labels));
        setScopeLabel(ve.scopeLabel);
        setScopeType(ve.scopeType);
        setFilterLabels(ve.filterLabels);
      }
    });
    return () => setFindingsRailCallback(null);
  }, [handleEndpointSelect, handleRestoreEndpoint]);

  // Shared analytics derivation — single source of truth for all findings consumers
  const { analytics, data, isLoading, error } = useFindingsAnalyticsLocal(studyId);
  const { endpoints: endpointSummaries, syndromes, organCoherence, labMatches,
          signalScores: signalScoreMap, endpointSexes } = analytics;

  // Auto-select first finding when endpoint is selected
  useEffect(() => {
    if (activeEndpoint && data?.findings?.length) {
      const epFindings = data.findings.filter((f) => (f.endpoint_label ?? f.finding) === activeEndpoint);
      if (epFindings.length > 0) {
        selectFinding(pickBestFinding(epFindings));
      }
    } else if (!activeEndpoint) {
      selectFinding(null);
    }
  }, [activeEndpoint, data, selectFinding]);

  // Scatter endpoints — filtered by rail's visible set, then by user exclusions
  const railFilteredEndpoints = useMemo(() => {
    if (!visibleLabels) return endpointSummaries;
    return endpointSummaries.filter((ep) => visibleLabels.has(ep.endpoint_label));
  }, [endpointSummaries, visibleLabels]);

  const scatterEndpoints = useMemo(() => {
    if (excludedEndpoints.size === 0) return railFilteredEndpoints;
    return railFilteredEndpoints.filter((ep) => !excludedEndpoints.has(ep.endpoint_label));
  }, [railFilteredEndpoints, excludedEndpoints]);

  // Table findings — filtered by rail's visible set + scheduled-only exclusion
  const tableFindings = useMemo(() => {
    if (!data?.findings) return [];
    let f = data.findings;
    if (visibleLabels) {
      f = f.filter((row) => visibleLabels.has(row.endpoint_label ?? row.finding));
    }
    // Hide findings that vanish under scheduled-only mode (empty scheduled_group_stats)
    if (isScheduledOnly) {
      f = f.filter((row) =>
        !row.scheduled_group_stats || row.scheduled_group_stats.length > 0,
      );
    }
    return f;
  }, [data, visibleLabels, isScheduledOnly]);

  // Plottable count: endpoints with both effect size and p-value
  const plottableCount = useMemo(() =>
    scatterEndpoints.filter(ep => ep.maxEffectSize != null && ep.minPValue != null).length,
    [scatterEndpoints],
  );

  // Section title: dynamic based on scope type
  const sectionTitle = useMemo(() => {
    const sep = <span className="text-muted-foreground/40"> · </span>;

    // Dynamic title based on scope
    let titleText: string;
    if (!scopeLabel) {
      titleText = "All endpoints";
    } else if (scopeType === "syndrome") {
      titleText = scopeLabel; // syndrome name stands alone
    } else if (scopeType === "finding") {
      titleText = scopeLabel; // individual endpoint label stands alone
    } else {
      titleText = `${scopeLabel} endpoints`;
    }

    // Count: (plottable/total) when they differ, (plottable) when equal
    const total = railFilteredEndpoints.length;
    const countText = plottableCount !== total
      ? `(${plottableCount}/${total})`
      : `(${plottableCount})`;

    const hasFilters = filterLabels.length > 0;

    return (
      <span className="flex items-baseline gap-1.5">
        <span>{titleText}</span>
        <span className="truncate text-[10px] normal-case tracking-normal font-normal text-foreground">
          <span className="text-muted-foreground/50">{countText}</span>
          {hasFilters && filterLabels.map((label) => (
            <span key={label}>
              {sep}
              <span className="text-muted-foreground">{label}</span>
            </span>
          ))}
          {selectedPointData && (
            <>
              {sep}
              <span className="text-muted-foreground/60">{"\u2605"}</span>
              {" "}
              <span className="font-medium">{selectedPointData.label}</span>
              {sep}
              <span className="font-mono" title={`${getEffectSizeLabel(analytics.activeEffectSizeMethod ?? "hedges-g")} — standardized effect size. Negative = decrease, positive = increase.`}>{getEffectSizeSymbol(analytics.activeEffectSizeMethod ?? "hedges-g")}={formatEffectSize(selectedPointData.effectSize)}</span>
              {sep}
              <span className="font-mono">
                p={formatPValue(selectedPointData.rawP)}
                {" "}
                <span className="font-normal text-muted-foreground/60">
                  ({["LB", "BW", "OM", "FW"].includes(selectedPointData.domain) ? "Dunnett\u2019s" : "Fisher\u2019s"})
                </span>
              </span>
            </>
          )}
        </span>
      </span>
    );
  }, [scopeLabel, scopeType, filterLabels, selectedPointData, plottableCount, railFilteredEndpoints.length]);

  // Excluded endpoint chips for header
  const excludedChips = useMemo(() => {
    if (excludedEndpoints.size === 0) return null;
    const labels = [...excludedEndpoints];
    const showLabels = labels.length > 3 ? labels.slice(0, 2) : labels;
    const overflow = labels.length > 3 ? labels.length - 2 : 0;
    return (
      <span className="flex items-center gap-1 mr-1.5">
        {showLabels.map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0 text-[9px] text-muted-foreground/70"
          >
            <span className="max-w-[80px] truncate">{label}</span>
            <EyeOff
              className="h-2.5 w-2.5 shrink-0 cursor-pointer hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); handleRestoreEndpoint(label); }}
            />
          </span>
        ))}
        {overflow > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0 text-[9px] text-muted-foreground/70">
            <span>+{overflow} more</span>
            <EyeOff
              className="h-2.5 w-2.5 shrink-0 cursor-pointer hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); setExcludedEndpoints(new Set()); }}
            />
          </span>
        )}
      </span>
    );
  }, [excludedEndpoints, handleRestoreEndpoint]);

  // Header right: excluded chips + info tooltip icon
  const headerRight = useMemo(() => (
    <span className="flex items-center">
      {excludedChips}
      <span
        className="relative shrink-0"
        onMouseEnter={handleInfoMouseEnter}
        onMouseLeave={handleInfoMouseLeave}
      >
        <Info className="h-3 w-3 cursor-help text-muted-foreground/50 hover:text-muted-foreground" />
        {showInfoTooltip && (
          <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-md border bg-popover px-3 py-2 shadow-md">
            <div className="text-[11px] leading-relaxed text-popover-foreground">
              <p>Each dot is one endpoint (e.g., "ALT", "Liver weight").</p>
              <p className="mt-1.5 font-medium">Position shows signal strength:</p>
              <p><span className="text-muted-foreground">&rarr;</span> Right = larger effect ({getEffectSizeLabel(analytics.activeEffectSizeMethod ?? "hedges-g")})</p>
              <p><span className="text-muted-foreground">&uarr;</span> Up = more statistically significant</p>
              <p className="mt-1.5 font-medium">Reference lines:</p>
              <p><span className="text-muted-foreground">&mdash;</span> Vertical at |d| = 0.8 (large effect)</p>
              <p><span className="text-muted-foreground">&mdash;</span> Horizontal at p = 0.05 (significance)</p>
              <p className="mt-1.5 font-medium">Dot color:</p>
              <p><span className="text-muted-foreground">&bull;</span> Gray = effect at higher doses only</p>
              <p><span style={{ color: "rgba(248,113,113,0.8)" }}>&bull;</span> Warm = NOAEL below lowest tested dose</p>
              <p className="pl-3 text-muted-foreground">(effect present at all doses)</p>
              <p className="mt-1.5 italic text-muted-foreground">
                Upper-right quadrant = investigate first. Dots show the strongest result across all timepoints and sexes for each endpoint.
              </p>
            </div>
          </div>
        )}
      </span>
    </span>
  ), [showInfoTooltip, handleInfoMouseEnter, handleInfoMouseLeave, excludedChips]);

  // Sync endpoint sexes to shared selection context (reaches context panel)
  useEffect(() => {
    setEndpointSexes(endpointSexes);
  }, [endpointSexes, setEndpointSexes]);

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Failed to load analysis: {error.message}
      </div>
    );
  }

  useEffect(() => {
    if (mortalityData) {
      const earlyDeaths = mortalityData.early_death_subjects ?? {};
      // TR early deaths: from mortality.deaths (not recovery), present in early_death_subjects
      const trIds = new Set(
        mortalityData.deaths
          .filter(d => !d.is_recovery && d.USUBJID in earlyDeaths)
          .map(d => d.USUBJID),
      );
      setEarlyDeathSubjects(earlyDeaths, trIds);
    }
  }, [mortalityData, setEarlyDeathSubjects]);

  return (
    <FindingsAnalyticsProvider value={analytics}>
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden">
      {/* Study context banner */}
      {studyContext && <StudyBanner studyContext={studyContext} doseGroupCount={doseGroupCount} tumorCount={tumorSummary?.total_tumor_animals} tkSubjectCount={pkData?.tk_design?.n_tk_subjects} mortality={mortalityData} crossAnimalFlags={crossAnimalFlags} />}
      {/* Mortality banner */}
      {mortalityData && <MortalityBanner mortality={mortalityData} />}
      {/* Header */}
      <FilterBar>
        <span className="text-xs font-semibold">Findings</span>
        {data && (
          <span className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{data.summary.total_adverse} adverse</span>
            <span>{data.summary.total_warning} warning</span>
            <span>{data.summary.total_normal} normal</span>
          </span>
        )}
      </FilterBar>

      {/* Quadrant scatter */}
      {data && endpointSummaries.length > 0 && (
        <ViewSection
          title={sectionTitle}
          headerRight={headerRight}
          mode="fixed"
          height={scatterSection.height}
          onResizePointerDown={scatterSection.onPointerDown}
          contentRef={scatterSection.contentRef}
        >
          <FindingsQuadrantScatter
            endpoints={scatterEndpoints}
            selectedEndpoint={activeEndpoint}
            onSelect={handleEndpointSelect}
            onExclude={handleExcludeEndpoint}
            onSelectedPointChange={handleSelectedPointChange}
            organCoherence={organCoherence}
            syndromes={syndromes}
            labMatches={labMatches}
          />
        </ViewSection>
      )}

      {/* Table */}
      <div className="flex-1 overflow-hidden">
      {isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-10 w-full" />
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : data ? (
        <FindingsTable
          findings={tableFindings}
          doseGroups={data.dose_groups}
          signalScores={signalScoreMap}
          excludedEndpoints={excludedEndpoints}
          onToggleExclude={handleRestoreEndpoint}
          activeEndpoint={activeEndpoint}
          activeGrouping={activeGrouping}
        />
      ) : null}
      </div>
    </div>
    </FindingsAnalyticsProvider>
  );
}
