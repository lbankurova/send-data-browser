import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { Info } from "lucide-react";
import { useFindings } from "@/hooks/useFindings";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useStudyContext } from "@/hooks/useStudyContext";
import { useStudyMetadata } from "@/hooks/useStudyMetadata";
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
import { deriveEndpointSummaries, deriveOrganCoherence, computeEndpointNoaelMap } from "@/lib/derive-summaries";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import { evaluateLabRules } from "@/lib/lab-clinical-catalog";
import { getClinicalFloor } from "@/lib/lab-clinical-catalog";
import { FindingsAnalyticsProvider } from "@/contexts/FindingsAnalyticsContext";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import type { FindingsFilters } from "@/types/analysis";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import { withSignalScores, classifyEndpointConfidence, getConfidenceMultiplier } from "@/lib/findings-rail-engine";
import type { GroupingMode, SignalBoosts } from "@/lib/findings-rail-engine";
import { formatPValue, formatEffectSize } from "@/lib/severity-colors";
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

// Static empty filters — fetch all findings, filter client-side
const ALL_FILTERS: FindingsFilters = {
  domain: null, sex: null, severity: null, search: "",
  organ_system: null, endpoint_label: null, dose_response_pattern: null,
};

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

  // Study context for StudyBanner
  const { data: studyContext } = useStudyContext(studyId);
  const { data: studyMeta } = useStudyMetadata(studyId ?? "");
  const doseGroupCount = studyMeta?.dose_groups?.length ?? 0;

  // Rail-provided state (single source of truth for filtering)
  const [visibleLabels, setVisibleLabels] = useState<Set<string> | null>(null);
  const [scopeLabel, setScopeLabel] = useState<string | null>(null);
  const [filterLabels, setFilterLabels] = useState<string[]>([]);
  const [activeEndpoint, setActiveEndpoint] = useState<string | null>(null);

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
    _findingsExcludedCallback?.(excludedEndpoints);
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
      if (state.restoreEndpoint !== undefined) handleRestoreEndpoint(state.restoreEndpoint);
      if (state.visibleEndpoints !== undefined) {
        const ve = state.visibleEndpoints;
        setVisibleLabels(new Set(ve.labels));
        setScopeLabel(ve.scopeLabel);
        setFilterLabels(ve.filterLabels);
      }
    });
    return () => setFindingsRailCallback(null);
  }, [handleEndpointSelect, handleRestoreEndpoint]);

  // Fetch ALL findings (no API-level filtering — rail handles all filtering client-side)
  const { data, isLoading, error } = useFindings(studyId, 1, 10000, ALL_FILTERS);

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

  // Derive endpoint summaries for scatter plot from UnifiedFinding[]
  const endpointSummaries = useMemo(() => {
    if (!data?.findings?.length) return [];
    const rows: AdverseEffectSummaryRow[] = data.findings.map((f) => {
      // Compute max incidence across treated dose groups (dose_level > 0)
      const treatedStats = (f.group_stats ?? []).filter((g) => g.dose_level > 0);
      const maxInc = treatedStats.reduce<number | null>((max, g) => {
        if (g.incidence == null) return max;
        return max === null ? g.incidence : Math.max(max, g.incidence);
      }, null);
      return {
        endpoint_label: f.endpoint_label ?? f.finding,
        endpoint_type: f.data_type,
        domain: f.domain,
        organ_system: f.organ_system ?? "unknown",
        dose_level: 0,
        dose_label: "",
        sex: f.sex,
        p_value: f.min_p_adj,
        effect_size: f.max_effect_size,
        direction: f.direction,
        severity: f.severity,
        treatment_related: f.treatment_related,
        dose_response_pattern: f.dose_response_pattern ?? "flat",
        test_code: f.test_code,
        specimen: f.specimen,
        finding: f.finding,
        max_incidence: maxInc,
        max_fold_change: f.max_fold_change ?? null,
      };
    });
    const summaries = deriveEndpointSummaries(rows);
    // Enrich with per-endpoint NOAEL tiers
    if (data.dose_groups) {
      const noaelMap = computeEndpointNoaelMap(data.findings, data.dose_groups);
      for (const ep of summaries) {
        const noael = noaelMap.get(ep.endpoint_label);
        if (noael) {
          ep.noaelTier = noael.combined.tier;
          ep.noaelDoseValue = noael.combined.doseValue;
          ep.noaelDoseUnit = noael.combined.doseUnit;
          if (noael.sexDiffers) ep.noaelBySex = noael.bySex;
        }
      }
    }
    return summaries;
  }, [data]);

  // Phase 3: organ coherence, cross-domain syndromes, lab clinical rules
  const organCoherence = useMemo(() => deriveOrganCoherence(endpointSummaries), [endpointSummaries]);
  const syndromes = useMemo(() => detectCrossDomainSyndromes(endpointSummaries), [endpointSummaries]);
  const labMatches = useMemo(
    () => evaluateLabRules(endpointSummaries, organCoherence, syndromes),
    [endpointSummaries, organCoherence, syndromes],
  );

  // Scatter endpoints — filtered by rail's visible set, then by user exclusions
  const railFilteredEndpoints = useMemo(() => {
    if (!visibleLabels) return endpointSummaries;
    return endpointSummaries.filter((ep) => visibleLabels.has(ep.endpoint_label));
  }, [endpointSummaries, visibleLabels]);

  const scatterEndpoints = useMemo(() => {
    if (excludedEndpoints.size === 0) return railFilteredEndpoints;
    return railFilteredEndpoints.filter((ep) => !excludedEndpoints.has(ep.endpoint_label));
  }, [railFilteredEndpoints, excludedEndpoints]);

  // Table findings — filtered by rail's visible set
  const tableFindings = useMemo(() => {
    if (!data?.findings) return [];
    let f = data.findings;
    if (visibleLabels) {
      f = f.filter((row) => visibleLabels.has(row.endpoint_label ?? row.finding));
    }
    return f;
  }, [data, visibleLabels]);

  // Section title with info tooltip
  const sectionTitle = useMemo(() => {
    const sep = <span className="text-muted-foreground/40"> · </span>;
    const hasMeta = scopeLabel || filterLabels.length > 0;
    return (
      <span className="flex items-baseline gap-1.5">
        <span>Findings</span>
        {(hasMeta || selectedPointData) && (
          <span className="truncate text-[10px] normal-case tracking-normal font-normal text-foreground">
            {scopeLabel && <span className="font-medium">{scopeLabel}</span>}
            {scopeLabel && filterLabels.length > 0 && sep}
            {filterLabels.map((label, i) => (
              <span key={label}>
                {i > 0 && sep}
                <span className="text-muted-foreground">{label}</span>
              </span>
            ))}
            {hasMeta && selectedPointData && sep}
            {selectedPointData && (
              <>
                <span className="text-muted-foreground/60">{"\u2605"}</span>
                {" "}
                <span className="font-medium">{selectedPointData.label}</span>
                {sep}
                <span className="font-mono">|d|={formatEffectSize(selectedPointData.effectSize)}</span>
                {sep}
                <span className="font-mono">
                  p={formatPValue(selectedPointData.rawP)}
                  {" "}
                  <span className="font-normal text-muted-foreground/60">
                    ({["LB", "BW", "OM", "FW"].includes(selectedPointData.domain) ? "Welch\u2019s" : "Fisher\u2019s"})
                  </span>
                </span>
              </>
            )}
            {!selectedPointData && hasMeta && (
              <span className="text-muted-foreground/50"> ({tableFindings.length})</span>
            )}
          </span>
        )}
      </span>
    );
  }, [scopeLabel, filterLabels, selectedPointData, tableFindings.length]);

  // Header right: info tooltip icon
  const headerRight = useMemo(() => (
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
            <p><span className="text-muted-foreground">&rarr;</span> Right = larger effect (Cohen&apos;s d)</p>
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
  ), [showInfoTooltip, handleInfoMouseEnter, handleInfoMouseLeave]);

  // Build signal boosts from analytics layers
  const boostMap = useMemo(() => {
    const map = new Map<string, SignalBoosts>();
    const syndromeEndpoints = new Set<string>();
    for (const syn of syndromes) {
      for (const m of syn.matchedEndpoints) syndromeEndpoints.add(m.endpoint_label);
    }
    const clinicalFloors = new Map<string, number>();
    for (const match of labMatches) {
      const floor = getClinicalFloor(match.severity);
      for (const ep of match.matchedEndpoints) {
        const existing = clinicalFloors.get(ep) ?? 0;
        if (floor > existing) clinicalFloors.set(ep, floor);
      }
    }
    for (const ep of endpointSummaries) {
      const coh = organCoherence.get(ep.organ_system);
      const cohBoost = coh ? (coh.domainCount >= 3 ? 2 : coh.domainCount >= 2 ? 1 : 0) : 0;
      const synBoost = syndromeEndpoints.has(ep.endpoint_label) ? 3 : 0;
      const floor = clinicalFloors.get(ep.endpoint_label) ?? 0;
      const conf = classifyEndpointConfidence(ep);
      const confMult = getConfidenceMultiplier(conf);
      if (cohBoost > 0 || synBoost > 0 || floor > 0 || confMult !== 1) {
        map.set(ep.endpoint_label, { syndromeBoost: synBoost, coherenceBoost: cohBoost, clinicalFloor: floor, confidenceMultiplier: confMult });
      }
    }
    return map;
  }, [endpointSummaries, organCoherence, syndromes, labMatches]);

  // Signal score map for tier encoding on severity column
  const signalScoreMap = useMemo(() => {
    const scored = withSignalScores(endpointSummaries, boostMap);
    const map = new Map<string, number>();
    for (const ep of scored) map.set(ep.endpoint_label, ep.signal);
    return map;
  }, [endpointSummaries, boostMap]);

  // Endpoint → aggregate sexes map
  const endpointSexes = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ep of endpointSummaries) {
      map.set(ep.endpoint_label, ep.sexes);
    }
    return map;
  }, [endpointSummaries]);

  // Sync endpoint sexes to shared selection context (reaches context panel)
  useEffect(() => {
    setEndpointSexes(endpointSexes);
  }, [endpointSexes, setEndpointSexes]);

  // Analytics context value for context panel consumption
  const analyticsValue = useMemo(() => ({
    endpoints: endpointSummaries,
    syndromes,
    organCoherence,
    labMatches,
    signalScores: signalScoreMap,
    endpointSexes,
  }), [endpointSummaries, syndromes, organCoherence, labMatches, signalScoreMap, endpointSexes]);

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Failed to load analysis: {error.message}
      </div>
    );
  }

  const hasEarlyDeaths = !!mortalityData && Object.keys(mortalityData.early_death_subjects ?? {}).length > 0;
  const { setHasEarlyDeaths } = useScheduledOnly();
  useEffect(() => {
    setHasEarlyDeaths(hasEarlyDeaths);
    return () => setHasEarlyDeaths(false);
  }, [hasEarlyDeaths, setHasEarlyDeaths]);

  return (
    <FindingsAnalyticsProvider value={analyticsValue}>
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden">
      {/* Study context banner */}
      {studyContext && <StudyBanner studyContext={studyContext} doseGroupCount={doseGroupCount} />}
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
            totalEndpoints={railFilteredEndpoints.length}
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
        />
      ) : null}
      </div>
    </div>
    </FindingsAnalyticsProvider>
  );
}
