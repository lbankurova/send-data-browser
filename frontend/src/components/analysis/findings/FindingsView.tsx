import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { Info } from "lucide-react";
import { useFindings } from "@/hooks/useFindings";
import { useSelection } from "@/contexts/SelectionContext";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { FindingsFilterBar } from "../FindingsFilterBar";
import { FindingsTable } from "../FindingsTable";
import { FindingsQuadrantScatter } from "./FindingsQuadrantScatter";
import type { ScatterSelectedPoint } from "./FindingsQuadrantScatter";
import { FilterBar, FilterBarCount } from "@/components/ui/FilterBar";
import { ViewSection } from "@/components/ui/ViewSection";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutoFitSections } from "@/hooks/useAutoFitSections";
import { deriveEndpointSummaries, deriveOrganCoherence } from "@/lib/derive-summaries";
import type { EndpointSummary } from "@/lib/derive-summaries";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import { evaluateLabRules } from "@/lib/lab-clinical-catalog";
import { getClinicalFloor } from "@/lib/lab-clinical-catalog";
import { FindingsAnalyticsProvider } from "@/contexts/FindingsAnalyticsContext";
import type { FindingsFilters } from "@/types/analysis";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import { getDomainFullLabel, getPatternLabel, withSignalScores, classifyEndpointConfidence, getConfidenceMultiplier } from "@/lib/findings-rail-engine";
import type { GroupingMode, SignalBoosts } from "@/lib/findings-rail-engine";
import { titleCase, formatPValue, formatEffectSize } from "@/lib/severity-colors";
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

/** Context bridge so ShellRailPanel can pass rail callbacks to the AE view. */
export interface AERailState {
  activeGroupScope: { type: GroupingMode; value: string } | null;
  activeEndpoint: string | null;
  activeGrouping: GroupingMode;
  onGroupScopeChange: (scope: { type: GroupingMode; value: string } | null) => void;
  onEndpointSelect: (endpointLabel: string | null) => void;
}

// Singleton event bus — rail and view are siblings, not parent-child.
// ShellRailPanel renders FindingsRail, Layout renders FindingsView via Outlet.
// We use a simple callback registry so the rail can communicate scope changes.
let _findingsRailCallback: ((state: Partial<Pick<AERailState, "activeGroupScope" | "activeEndpoint" | "activeGrouping"> & { clinicalS2Plus?: boolean }>) => void) | null = null;
/** Reverse channel: Findings view → ShellRailPanel (for clearing rail scope from filter bar chip). */
let _findingsClearScopeCallback: (() => void) | null = null;
/** Reverse channel: Findings view → FindingsRail (for clearing clinical filter from filter bar chip). */
let _findingsClearClinicalCallback: (() => void) | null = null;

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
export function setFindingsClearClinicalCallback(cb: typeof _findingsClearClinicalCallback) {
  _findingsClearClinicalCallback = cb;
}
export function getFindingsClearClinicalCallback() {
  return _findingsClearClinicalCallback;
}

const SCATTER_SECTIONS = [{ id: "scatter", min: 80, max: 220, defaultHeight: 140 }];

export function FindingsView() {
  const { studyId } = useParams<{ studyId: string }>();
  const { selectStudy } = useSelection();
  const { selectFinding, setEndpointSexes } = useFindingSelection();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scatterSection] = useAutoFitSections(containerRef, "findings", SCATTER_SECTIONS);

  const [filters, setFilters] = useState<FindingsFilters>({
    domain: null,
    sex: null,
    severity: null,
    search: "",
    organ_system: null,
    endpoint_label: null,
    dose_response_pattern: null,
  });
  const [activeGrouping, setActiveGrouping] = useState<GroupingMode>("organ");
  const [selectedPointData, setSelectedPointData] = useState<ScatterSelectedPoint | null>(null);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const infoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [clinicalFilterActive, setClinicalFilterActive] = useState(false);

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

  // Sync study selection
  useEffect(() => {
    if (studyId) selectStudy(studyId);
  }, [studyId, selectStudy]);

  // Clear finding selection when non-endpoint filters change
  const nonEndpointFilters = `${filters.domain}|${filters.sex}|${filters.severity}|${filters.search}|${filters.organ_system}|${filters.dose_response_pattern}`;
  useEffect(() => {
    selectFinding(null);
  }, [nonEndpointFilters, selectFinding]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track syndrome endpoint labels for client-side filtering
  const [syndromeEndpointLabels, setSyndromeEndpointLabels] = useState<string[] | null>(null);
  const [syndromeScopeLabel, setSyndromeScopeLabel] = useState<string | null>(null);

  // Refs for syndrome/endpoint data — used by handleGroupScopeChange to avoid
  // forward-reference issues (syndromes/endpointSummaries defined after useMemo below)
  const syndromesRef = useRef<CrossDomainSyndrome[]>([]);
  const endpointSummariesRef = useRef<EndpointSummary[]>([]);

  // Rail group scope → update API filters
  const handleGroupScopeChange = useCallback((scope: { type: GroupingMode; value: string } | null) => {
    if (!scope) {
      // Clear ALL rail-driven filters (domain included — it may have been set by domain grouping)
      setFilters((prev) => ({ ...prev, domain: null, organ_system: null, endpoint_label: null, dose_response_pattern: null }));
      setSyndromeEndpointLabels(null);
      setSyndromeScopeLabel(null);
    } else if (scope.type === "organ") {
      setFilters((prev) => ({ ...prev, organ_system: scope.value, domain: null, endpoint_label: null, dose_response_pattern: null }));
      setSyndromeEndpointLabels(null);
      setSyndromeScopeLabel(null);
    } else if (scope.type === "domain") {
      setFilters((prev) => ({ ...prev, domain: scope.value, organ_system: null, endpoint_label: null, dose_response_pattern: null }));
      setSyndromeEndpointLabels(null);
      setSyndromeScopeLabel(null);
    } else if (scope.type === "pattern") {
      setFilters((prev) => ({ ...prev, dose_response_pattern: scope.value, domain: null, organ_system: null, endpoint_label: null }));
      setSyndromeEndpointLabels(null);
      setSyndromeScopeLabel(null);
    } else if (scope.type === "syndrome") {
      // Syndrome scope: clear standard filters, use client-side endpoint list filtering
      setFilters((prev) => ({ ...prev, domain: null, organ_system: null, endpoint_label: null, dose_response_pattern: null }));
      // Look up syndrome's matched endpoints (via ref — avoids forward reference)
      const currentSyndromes = syndromesRef.current;
      const syn = currentSyndromes.find((s) => s.id === scope.value);
      if (syn) {
        setSyndromeEndpointLabels(syn.matchedEndpoints.map((m) => m.endpoint_label));
        setSyndromeScopeLabel(syn.name);
      } else if (scope.value === "no_syndrome") {
        const inSyndrome = new Set<string>();
        for (const s of currentSyndromes) {
          for (const m of s.matchedEndpoints) inSyndrome.add(m.endpoint_label);
        }
        const allLabels = endpointSummariesRef.current.map((ep) => ep.endpoint_label);
        setSyndromeEndpointLabels(allLabels.filter((l) => !inSyndrome.has(l)));
        setSyndromeScopeLabel("No Syndrome");
      } else {
        setSyndromeEndpointLabels(null);
        setSyndromeScopeLabel(null);
      }
    }
  }, []);

  // Rail endpoint click → filter table + select finding
  const handleEndpointSelect = useCallback((endpointLabel: string | null) => {
    if (endpointLabel) {
      setFilters((prev) => ({ ...prev, endpoint_label: endpointLabel }));
    } else {
      // Deselect: revert to group scope filter if active
      setFilters((prev) => ({ ...prev, endpoint_label: null }));
    }
  }, []);

  // Register callback so FindingsRail (in ShellRailPanel) can communicate
  useEffect(() => {
    setFindingsRailCallback((state) => {
      if (state.activeGroupScope !== undefined) handleGroupScopeChange(state.activeGroupScope);
      if (state.activeEndpoint !== undefined) handleEndpointSelect(state.activeEndpoint);
      if (state.activeGrouping !== undefined) setActiveGrouping(state.activeGrouping);
      if (state.clinicalS2Plus !== undefined) setClinicalFilterActive(state.clinicalS2Plus);
    });
    return () => setFindingsRailCallback(null);
  }, [handleGroupScopeChange, handleEndpointSelect]);

  const { data, isLoading, error } = useFindings(
    studyId,
    1,
    10000,
    filters
  );

  // Auto-select first finding when rail endpoint filter is applied and data arrives
  useEffect(() => {
    if (filters.endpoint_label && data?.findings?.length) {
      selectFinding(pickBestFinding(data.findings));
    } else if (!filters.endpoint_label) {
      selectFinding(null);
    }
  }, [filters.endpoint_label, data, selectFinding]);

  // Derive scope label for filter bar chip
  const scopeLabel = filters.organ_system
    ? titleCase(filters.organ_system)
    : filters.domain
      ? getDomainFullLabel(filters.domain)
      : filters.dose_response_pattern
        ? getPatternLabel(filters.dose_response_pattern)
        : syndromeScopeLabel;

  // Build section header right content — selection label + info tooltip
  const headerRight = useMemo(() => (
    <span className="flex items-center gap-1.5">
      {selectedPointData && (
        <span className="ml-2 min-w-0 flex-1 truncate text-[10px] text-foreground">
          <span className="text-muted-foreground/60">{"\u2605"}</span>
          {" "}
          <span className="font-medium">{selectedPointData.label}</span>
          <span className="text-muted-foreground/60"> · </span>
          <span className="font-mono">|d|={formatEffectSize(selectedPointData.effectSize)}</span>
          <span className="text-muted-foreground/60"> · </span>
          <span className="font-mono">p={formatPValue(selectedPointData.rawP)}</span>
        </span>
      )}
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
              <p className="mt-1.5 italic text-muted-foreground">
                Upper-right quadrant = investigate first. Dots show the strongest result across all timepoints and sexes for each endpoint.
              </p>
            </div>
          </div>
        )}
      </span>
    </span>
  ), [selectedPointData, showInfoTooltip, handleInfoMouseEnter, handleInfoMouseLeave]);

  const clearScope = useCallback(() => {
    handleGroupScopeChange(null);
    setSyndromeEndpointLabels(null);
    setSyndromeScopeLabel(null);
    _findingsClearScopeCallback?.();
  }, [handleGroupScopeChange]);

  // Derive endpoint summaries for scatter plot from UnifiedFinding[]
  const endpointSummaries = useMemo(() => {
    if (!data?.findings?.length) return [];
    // Map UnifiedFinding → AdverseEffectSummaryRow shape for deriveEndpointSummaries
    const rows: AdverseEffectSummaryRow[] = data.findings.map((f) => ({
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
    }));
    return deriveEndpointSummaries(rows);
  }, [data]);

  // Sync refs for handleGroupScopeChange (avoids forward-reference issue)
  endpointSummariesRef.current = endpointSummaries;

  // Phase 3: organ coherence, cross-domain syndromes, lab clinical rules
  const organCoherence = useMemo(() => deriveOrganCoherence(endpointSummaries), [endpointSummaries]);
  const syndromes = useMemo(() => detectCrossDomainSyndromes(endpointSummaries), [endpointSummaries]);
  syndromesRef.current = syndromes;
  const labMatches = useMemo(
    () => evaluateLabRules(endpointSummaries, organCoherence, syndromes),
    [endpointSummaries, organCoherence, syndromes],
  );

  // Build signal boosts from analytics layers
  const boostMap = useMemo(() => {
    const map = new Map<string, SignalBoosts>();

    // Index syndrome endpoints
    const syndromeEndpoints = new Set<string>();
    for (const syn of syndromes) {
      for (const m of syn.matchedEndpoints) syndromeEndpoints.add(m.endpoint_label);
    }

    // Index lab clinical floors by endpoint
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

  // Endpoint → aggregate sexes map (from endpointSummaries which already merge rows)
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
    syndromes,
    organCoherence,
    labMatches,
    signalScores: signalScoreMap,
    endpointSexes,
  }), [syndromes, organCoherence, labMatches, signalScoreMap, endpointSexes]);

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Failed to load analysis: {error.message}
      </div>
    );
  }

  return (
    <FindingsAnalyticsProvider value={analyticsValue}>
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden">
      {/* Filter bar — aligned with other views */}
      <FilterBar>
        <FindingsFilterBar
          filters={filters}
          onFiltersChange={setFilters}
          hideDomain={activeGrouping === "domain"}
          scopeLabel={scopeLabel}
          onClearScope={clearScope}
          clinicalFilterActive={clinicalFilterActive}
          onClearClinicalFilter={() => {
            setClinicalFilterActive(false);
            _findingsClearClinicalCallback?.();
          }}
        />
        {data && (
          <>
            <span className="rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
              {data.summary.total_adverse} adverse
            </span>
            <span className="rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
              {data.summary.total_warning} warning
            </span>
            <span className="rounded border border-border px-1 py-0.5 text-[10px] font-medium text-muted-foreground">
              {data.summary.total_normal} normal
            </span>
            <FilterBarCount>{data.summary.total_findings} total</FilterBarCount>
          </>
        )}
      </FilterBar>

      {/* Quadrant scatter — fixed height between filter bar and table */}
      {data && endpointSummaries.length > 0 && (
        <ViewSection
          title="Findings"
          headerRight={headerRight}
          mode="fixed"
          height={scatterSection.height}
          onResizePointerDown={scatterSection.onPointerDown}
          contentRef={scatterSection.contentRef}
        >
          <FindingsQuadrantScatter
            endpoints={endpointSummaries}
            selectedEndpoint={filters.endpoint_label}
            onSelect={handleEndpointSelect}
            onSelectedPointChange={handleSelectedPointChange}
            organCoherence={organCoherence}
            syndromes={syndromes}
            labMatches={labMatches}
            scopeFilter={filters.organ_system ?? filters.domain ?? filters.dose_response_pattern ?? undefined}
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
          findings={syndromeEndpointLabels
            ? data.findings.filter((f) => syndromeEndpointLabels.includes(f.endpoint_label ?? f.finding))
            : data.findings}
          doseGroups={data.dose_groups}
          signalScores={signalScoreMap}
        />
      ) : null}
      </div>
    </div>
    </FindingsAnalyticsProvider>
  );
}
