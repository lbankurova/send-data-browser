import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useLocation } from "react-router-dom";
import { Info, EyeOff } from "lucide-react";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useFindingsAnalyticsResult } from "@/contexts/FindingsAnalyticsContext";
import { useSelection } from "@/contexts/SelectionContext";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { ViewTabBar } from "@/components/ui/ViewTabBar";
import { FindingsTable } from "../FindingsTable";
import { FindingsQuadrantScatter } from "./FindingsQuadrantScatter";
import { DoseResponseChartPanel } from "./DoseResponseChartPanel";
import { DayStepper } from "./DayStepper";
import { SeverityMatrix } from "./SeverityMatrix";
import type { ScatterSelectedPoint } from "./FindingsQuadrantScatter";
import { ViewSection } from "@/components/ui/ViewSection";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutoFitSections } from "@/hooks/useAutoFitSections";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useSessionState, isOneOf } from "@/hooks/useSessionState";
import type { GroupingMode } from "@/lib/findings-rail-engine";
import { CONTINUOUS_DOMAINS } from "@/lib/derive-summaries";
import { formatPValue, formatEffectSize } from "@/lib/severity-colors";
import { getEffectSizeLabel, getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import type { UnifiedFinding } from "@/types/analysis";
import { RecalculatingBanner } from "@/components/ui/RecalculatingBanner";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
import {
  setFindingsRailCallback,
  getFindingsExcludedCallback,
} from "./findings-bridge";

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

export function FindingsView() {
  const { studyId } = useParams<{ studyId: string }>();
  const location = useLocation();
  const { selectStudy } = useSelection();
  const { selectFinding, setEndpointSexes } = useFindingSelection();
  const containerRef = useRef<HTMLDivElement>(null);

  // 50/50 default split: scatter takes half the viewport-estimated container height
  const scatterSections = useMemo(() => {
    const half = Math.round(window.innerHeight * 0.4);
    return [{ id: "scatter", min: 80, max: 2000, defaultHeight: half }];
  }, []);
  const [scatterSection] = useAutoFitSections(containerRef, "findings", scatterSections);

  // Central panel tab: "findings" (scatter/DR+table) or "findings-table" (full-height table)
  type FindingsTab = "findings" | "findings-table";
  const FINDINGS_TABS = ["findings", "findings-table"] as const;
  const [activeViewTab, setActiveViewTab] = useSessionState<FindingsTab>(
    "pcc.findings.viewTab", "findings", isOneOf(FINDINGS_TABS),
  );
  // Track whether the "Findings table" tab is open (separate from which is active,
  // so user can switch between tabs without closing the table tab).
  const [tableTabOpen, setTableTabOpen] = useState(activeViewTab === "findings-table");

  // Mortality data
  const { data: mortalityData } = useStudyMortality(studyId);

  // Scheduled-only exclusion context
  const { setEarlyDeathSubjects, useScheduledOnly: isScheduledOnly } = useScheduledOnly();

  // Recovery comparison data (multi-day stats from Phase 2)
  const { data: recoveryData } = useRecoveryComparison(studyId);
  const studyHasRecovery = !!recoveryData?.available;

  // Left chart tab: dose-response or recovery dumbbell
  type LeftChartTab = "dr" | "recovery";
  const LEFT_TABS = ["dr", "recovery"] as const;
  const [leftChartTab, setLeftChartTab] = useSessionState<LeftChartTab>(
    "pcc.findings.leftTab", "dr", isOneOf(LEFT_TABS),
  );

  // Rail-provided state (single source of truth for filtering)
  const [visibleLabels, setVisibleLabels] = useState<Set<string> | null>(null);
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const [scopeType, setScopeType] = useState<string | null>(null);
  const [filterLabels, setFilterLabels] = useState<string[]>([]);
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null);
  const [activeDomain, setActiveDomain] = useState<string | undefined>(undefined);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [activeGrouping, setActiveGrouping] = useState<GroupingMode | null>(null);

  // Tab labels — reflects current rail selection (endpoint, syndrome, organ, etc.)
  const mainTabLabel = activeEndpoint ?? scopeLabel ?? "Findings";
  const findingsViewTabs = useMemo(() => {
    const tabs: { key: string; label: string; closable?: boolean }[] = [
      { key: "findings", label: mainTabLabel },
    ];
    if (tableTabOpen) {
      const tableLabel = scopeLabel ?? "Findings table";
      tabs.push({ key: "findings-table", label: tableLabel, closable: true });
    }
    return tabs;
  }, [tableTabOpen, scopeLabel, mainTabLabel]);

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
    const cb = getFindingsExcludedCallback();
    if (cb) {
      cb(excludedEndpoints);
    } else if (excludedEndpoints.size > 0) {
      const id = requestAnimationFrame(() => getFindingsExcludedCallback()?.(excludedEndpoints));
      return () => cancelAnimationFrame(id);
    }
  }, [excludedEndpoints]);

  // Sync study selection
  useEffect(() => {
    if (studyId) selectStudy(studyId);
  }, [studyId, selectStudy]);

  // Analytics from Layout-level provider — single derivation shared across view, rail, and context panel
  const { analytics, data, isLoading, isFetching, isPlaceholderData, error } = useFindingsAnalyticsResult();
  const { endpoints: endpointSummaries, syndromes, organCoherence, labMatches,
          signalScores: signalScoreMap, endpointSexes } = analytics;

  // Stable ref to data — avoids recreating handleEndpointSelect on every data change,
  // which would cascade into event bus re-registration and rail state re-push.
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  // Rail endpoint click → select finding in table
  // Synchronous: set activeEndpoint AND select the best finding in the same
  // render batch so the table never shows a stale selection from a different endpoint.
  const handleEndpointSelect = useCallback((endpointLabel: string | null, domain?: string) => {
    setActiveEndpoint(endpointLabel);
    setActiveDomain(domain);
    // Reset selectedDay so chartDay falls through to the computed fallback
    // (activeDay ?? peakDay ?? terminal) on the first render — prevents a
    // transient frame where the stale selectedDay from the previous endpoint
    // drives the day filter and drops findings for the new endpoint.
    setSelectedDay(null);
    setDayCleared(false);
    const currentData = dataRef.current;
    if (endpointLabel && currentData?.findings?.length) {
      let epFindings = currentData.findings.filter(
        (f) => (f.endpoint_label ?? f.finding) === endpointLabel,
      );
      // Scope to clicked domain for multi-domain endpoints (MI + MA)
      if (domain) epFindings = epFindings.filter((f) => f.domain === domain);
      if (epFindings.length > 0) {
        const best = pickBestFinding(epFindings);
        selectFinding(best);
        setActiveDay(best.day);
        return;
      }
    }
    if (!endpointLabel) {
      selectFinding(null);
      setActiveDay(null);
    }
  }, [selectFinding]);

  // Register event bus callback
  useEffect(() => {
    setFindingsRailCallback((state) => {
      if (state.activeEndpoint !== undefined) handleEndpointSelect(state.activeEndpoint, state.activeDomain);
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

  // Consume cross-view navigation state ({ endpoint_label, organ_system })
  useEffect(() => {
    const state = location.state as { endpoint_label?: string; organ_system?: string } | null;
    if (!state) return;
    if (state.endpoint_label) {
      handleEndpointSelect(state.endpoint_label);
    }
    // Clear consumed state so it doesn't re-trigger on re-render
    window.history.replaceState({}, "");
  }, [location.state, handleEndpointSelect]);

  // Auto-select fallback: when data arrives while activeEndpoint is already set
  // (e.g., after initial load or stat method change). The synchronous path in
  // handleEndpointSelect handles the normal rail/scatter click case.
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
    // Exclude fragmentary findings (< 2 dose groups). These arise from
    // single-animal interim sacrifices with only control or only one treated
    // group — no dose-response comparison is possible, and they create a
    // misleading sex imbalance in the table (e.g. 3 M rows vs 1 F row for
    // Albumin when the extra M rows are empty interim timepoints).
    f = f.filter((row) => row.group_stats.length >= 2);
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

  // ── Day navigation metadata for DayStepper (D6) ──────────
  const dayMeta = useMemo(() => {
    if (!activeEndpoint || !tableFindings.length) return null;
    const epFindings = tableFindings.filter(
      (f) => (f.endpoint_label ?? f.finding) === activeEndpoint,
    );
    if (epFindings.length === 0) return null;

    // Collect unique days with group data (control + at least one treated dose)
    const dayDoseSets = new Map<number, Set<number>>();
    for (const f of epFindings) {
      if (f.day == null) continue;
      for (const gs of f.group_stats) {
        let set = dayDoseSets.get(f.day);
        if (!set) { set = new Set(); dayDoseSets.set(f.day, set); }
        set.add(gs.dose_level);
      }
    }
    const groupDays = [...dayDoseSets.entries()]
      .filter(([, dls]) => dls.has(0) && dls.size >= 2)
      .map(([d]) => d)
      .sort((a, b) => a - b);
    if (groupDays.length === 0) return null;

    const terminal = groupDays[groupDays.length - 1];
    const days = groupDays.filter((d) => d <= terminal);
    if (days.length === 0) return null;

    // Peak detection
    const dataType = epFindings[0].data_type;
    let bestDay = terminal;
    if (dataType === "continuous") {
      let bestAbs = -1;
      for (const f of epFindings) {
        if (f.day == null || f.day > terminal) continue;
        const abs = Math.abs(f.max_effect_size ?? 0);
        if (abs > bestAbs) { bestAbs = abs; bestDay = f.day; }
      }
    } else {
      let bestP = Infinity;
      for (const f of epFindings) {
        if (f.day == null || f.day > terminal || f.min_p_adj == null) continue;
        if (f.min_p_adj < bestP) { bestP = f.min_p_adj; bestDay = f.day; }
      }
    }
    const peakDay = bestDay !== terminal ? bestDay : null;

    const dayLabels = new Map<number, string>();
    for (const d of days) {
      if (d === terminal) dayLabels.set(d, "terminal");
      else if (d === peakDay) dayLabels.set(d, "peak");
    }

    return { availableDays: days, peakDay, terminalDay: terminal, dayLabels };
  }, [activeEndpoint, tableFindings]);

  // ── Recovery day metadata for DayStepper (Phase 3) ──────
  const recoveryDayMeta = useMemo(() => {
    if (!activeEndpoint || !recoveryData?.available) return null;
    // recovery_days_available is keyed by test_code (e.g. "ALB", "BW").
    // For OM domain, it's keyed by specimen (e.g. "BRAIN", "HEART").
    // Resolve the lookup key from the active finding.
    const activeFinding = tableFindings.find(
      (f) => (f.endpoint_label ?? f.finding) === activeEndpoint,
    );
    const lookupKey = activeFinding
      ? (activeFinding.domain === "OM" && activeFinding.specimen
          ? activeFinding.specimen
          : activeFinding.test_code)
      : activeEndpoint;
    const epDays = recoveryData.recovery_days_available[lookupKey];
    if (!epDays) return null;
    // Recovery period starts AFTER the main-study terminal sacrifice day.
    // Use the larger of dayMeta.terminalDay (actual last day with main-arm
    // group data) and last_dosing_day — excludes both the dosing period and
    // the terminal sacrifice day itself (Day 92 in PointCross).
    const mainTerminalDay = Math.max(
      dayMeta?.terminalDay ?? 0,
      recoveryData.last_dosing_day ?? 0,
    );
    const allDays = new Set<number>();
    for (const sexDays of Object.values(epDays)) {
      for (const d of sexDays) {
        if (d > mainTerminalDay) allDays.add(d);
      }
    }
    const sortedDays = [...allDays].sort((a, b) => a - b);
    if (sortedDays.length === 0) return null;
    const maxDay = sortedDays[sortedDays.length - 1];
    const dayLabels = new Map<number, string>();
    dayLabels.set(maxDay, "terminal recovery");
    return { availableDays: sortedDays, terminalRecoveryDay: maxDay, dayLabels };
  }, [activeEndpoint, tableFindings, recoveryData, dayMeta?.terminalDay]);

  // ── Active day stepper metadata — switches based on left tab ──
  // When in recovery mode: use recovery days if available, otherwise null
  // (hides stepper — correct for incidence endpoints with no multi-day recovery).
  // Never fall back to main-study dayMeta when recovery tab is active.
  const activeDayMeta = leftChartTab === "recovery"
    ? (recoveryDayMeta
        ? { availableDays: recoveryDayMeta.availableDays, dayLabels: recoveryDayMeta.dayLabels, peakDay: null }
        : null)
    : dayMeta
      ? { availableDays: dayMeta.availableDays, dayLabels: dayMeta.dayLabels, peakDay: dayMeta.peakDay }
      : null;

  // Selected day — user-driven via DayStepper, auto-initialized from rail or peak/terminal.
  // dayCleared tracks when user explicitly clears the day filter — prevents useEffect from
  // immediately re-setting it to the default.
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [selectedRecoveryDay, setSelectedRecoveryDay] = useState<number | null>(null);
  const [dayCleared, setDayCleared] = useState(false);
  useEffect(() => {
    if (dayCleared) return; // user cleared — don't auto-set
    if (dayMeta) {
      setSelectedDay(activeDay ?? dayMeta.peakDay ?? dayMeta.terminalDay);
    } else {
      setSelectedDay(null);
    }
  }, [activeDay, dayMeta, dayCleared]);
  // Auto-set recovery day to terminal recovery when available
  useEffect(() => {
    if (recoveryDayMeta) {
      setSelectedRecoveryDay(recoveryDayMeta.terminalRecoveryDay);
    } else {
      setSelectedRecoveryDay(null);
    }
  }, [recoveryDayMeta]);
  // Reset dayCleared when endpoint changes (new endpoint = new day context)
  useEffect(() => { setDayCleared(false); }, [activeEndpoint]);
  // Chart day: always resolves to a day (charts need a specific day to plot)
  // In recovery mode, use selectedRecoveryDay; otherwise use main study day.
  const chartDay = leftChartTab === "recovery"
    ? (selectedRecoveryDay ?? recoveryDayMeta?.terminalRecoveryDay ?? null)
    : (selectedDay ?? (dayMeta ? (activeDay ?? dayMeta.peakDay ?? dayMeta.terminalDay) : null));
  // (tableDay removed — day filtering now handled by FindingsTable's internal combo-box)

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
      titleText = "All findings";
    } else if (scopeType === "syndrome") {
      titleText = scopeLabel; // syndrome name stands alone
    } else if (scopeType === "finding") {
      titleText = scopeLabel; // individual endpoint label stands alone
    } else {
      titleText = `${scopeLabel} findings`;
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
        <span className="truncate text-[11px] normal-case tracking-normal font-normal text-foreground">
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
              <span className="font-mono" title={!CONTINUOUS_DOMAINS.has(selectedPointData.domain) ? "avg severity (1\u20135 ordinal scale)" : `${getEffectSizeLabel(analytics.activeEffectSizeMethod ?? "hedges-g")} \u2014 standardized effect size. Negative = decrease, positive = increase.`}>{!CONTINUOUS_DOMAINS.has(selectedPointData.domain) ? "sev" : getEffectSizeSymbol(analytics.activeEffectSizeMethod ?? "hedges-g")}={formatEffectSize(selectedPointData.effectSize)}</span>
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
            className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0 text-[10px] text-muted-foreground/70"
          >
            <span className="max-w-[80px] truncate">{label}</span>
            <EyeOff
              className="h-2.5 w-2.5 shrink-0 cursor-pointer hover:text-foreground"
              onClick={(e) => { e.stopPropagation(); handleRestoreEndpoint(label); }}
            />
          </span>
        ))}
        {overflow > 0 && (
          <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0 text-[10px] text-muted-foreground/70">
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
            <div className="text-xs leading-relaxed text-popover-foreground">
              <p>One dot per finding, showing the strongest signal across timepoints and sexes.</p>
              <p className="mt-1.5"><span className="text-muted-foreground">&rarr;</span> Effect size percentile <span className="text-muted-foreground">(continuous and incidence ranked separately)</span></p>
              <p><span className="text-muted-foreground">&uarr;</span> Lower p-value (pairwise vs. control)</p>
              <p className="mt-1.5 italic text-muted-foreground">
                Investigate the upper-right quadrant first.
              </p>
            </div>
          </div>
        )}
      </span>
    </span>
  ), [showInfoTooltip, handleInfoMouseEnter, handleInfoMouseLeave, excludedChips]);

  // Header right for D-R chart section: day stepper + excluded chips + info icon
  const chartHeaderRight = useMemo(() => (
    <span className="flex items-center gap-2">
      {activeDayMeta && (
        <DayStepper
          availableDays={activeDayMeta.availableDays}
          selectedDay={chartDay}
          onDayChange={(d) => {
            if (leftChartTab === "recovery") {
              setSelectedRecoveryDay(d);
            } else {
              setSelectedDay(d);
              setDayCleared(false);
            }
          }}
          dayLabels={activeDayMeta.dayLabels}
          peakDay={activeDayMeta.peakDay}
        />
      )}
      {excludedChips}
    </span>
  ), [activeDayMeta, chartDay, excludedChips, leftChartTab]);

  // Sync endpoint sexes to shared selection context (reaches context panel)
  useEffect(() => {
    setEndpointSexes(endpointSexes);
  }, [endpointSexes, setEndpointSexes]);

  useEffect(() => {
    if (mortalityData) {
      const earlyDeaths = mortalityData.early_death_subjects ?? {};
      // TR IDs for scheduled-only toggle: main-study TR deaths only (recovery animals
      // are already excluded from terminal domains by arm filtering — DATA-01)
      const trIds = new Set(
        mortalityData.deaths
          .filter(d => !d.is_recovery && d.USUBJID in earlyDeaths)
          .map(d => d.USUBJID),
      );
      // Default exclusion: TR deaths + recovery deaths (both default to excluded in UI)
      const recoveryDeathIds = mortalityData.deaths
        .filter(d => d.is_recovery)
        .map(d => d.USUBJID);
      const defaultExcluded = new Set([...trIds, ...recoveryDeathIds]);
      setEarlyDeathSubjects(earlyDeaths, trIds, defaultExcluded);
    }
  }, [mortalityData, setEarlyDeathSubjects]);

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Failed to load analysis: {error.message}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex h-full flex-col overflow-hidden">
      <RecalculatingBanner isRecalculating={isFetching && isPlaceholderData} />
      <ViewTabBar
        tabs={findingsViewTabs}
        value={activeViewTab}
        onChange={(k) => setActiveViewTab(k as FindingsTab)}
        onClose={() => { setTableTabOpen(false); setActiveViewTab("findings"); }}
      />

      {/* Chart section — scope-dependent: D-R charts at endpoint level, scatter at group/overview */}
      {activeViewTab === "findings" && data && (
        activeEndpoint ? (
          /* Endpoint selected → dose-response charts */
          <ViewSection
            title={sectionTitle}
            headerRight={chartHeaderRight}
            mode="fixed"
            height={scatterSection.height}
            onResizePointerDown={scatterSection.onPointerDown}
            contentRef={scatterSection.contentRef}
          >
            <DoseResponseChartPanel
              endpointLabel={activeEndpoint}
              findings={tableFindings}
              doseGroups={data.dose_groups}
              selectedDay={chartDay}
              leftTab={leftChartTab}
              onLeftTabChange={setLeftChartTab}
              hasRecovery={studyHasRecovery}
              recoveryData={recoveryData}
            />
          </ViewSection>
        ) : scopeType === "specimen" && tableFindings.some(f => f.domain === "MI" || f.domain === "MA") ? (
          /* Specimen-scoped → severity matrix */
          <ViewSection
            title={sectionTitle}
            headerRight={headerRight}
            mode="fixed"
            height={scatterSection.height}
            onResizePointerDown={scatterSection.onPointerDown}
            contentRef={scatterSection.contentRef}
          >
            <SeverityMatrix
              findings={tableFindings}
              doseGroups={data.dose_groups}
            />
          </ViewSection>
        ) : endpointSummaries.length > 0 ? (
          /* Group / overview → scatter plot */
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
              effectSizeSymbol={getEffectSizeSymbol(analytics.activeEffectSizeMethod ?? "hedges-g")}
            />
          </ViewSection>
        ) : null
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
          activeDomain={activeDomain}
          activeGrouping={activeGrouping}
          onOpenInTab={activeViewTab === "findings" ? () => { setTableTabOpen(true); setActiveViewTab("findings-table"); } : undefined}
          effectSizeMethod={analytics.activeEffectSizeMethod}
          globalDay={activeEndpoint ? chartDay : undefined}
          globalDayLabels={dayMeta?.dayLabels}
        />
      ) : null}
      </div>
    </div>
  );
}
