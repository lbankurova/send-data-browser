import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { useFindings } from "@/hooks/useFindings";
import { useSelection } from "@/contexts/SelectionContext";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { FindingsFilterBar } from "../FindingsFilterBar";
import { FindingsTable } from "../FindingsTable";
import { FindingsQuadrantScatter } from "./FindingsQuadrantScatter";
import { FilterBar, FilterBarCount } from "@/components/ui/FilterBar";
import { ViewSection } from "@/components/ui/ViewSection";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutoFitSections } from "@/hooks/useAutoFitSections";
import { deriveEndpointSummaries, deriveOrganCoherence } from "@/lib/derive-summaries";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import { evaluateLabRules } from "@/lib/lab-clinical-catalog";
import { getClinicalFloor } from "@/lib/lab-clinical-catalog";
import { FindingsAnalyticsProvider } from "@/contexts/FindingsAnalyticsContext";
import type { FindingsFilters } from "@/types/analysis";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import { getDomainFullLabel, getPatternLabel, withSignalScores, classifyEndpointConfidence, getConfidenceMultiplier } from "@/lib/findings-rail-engine";
import type { GroupingMode, SignalBoosts } from "@/lib/findings-rail-engine";
import { titleCase } from "@/lib/severity-colors";
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
let _findingsRailCallback: ((state: Partial<Pick<AERailState, "activeGroupScope" | "activeEndpoint" | "activeGrouping">>) => void) | null = null;
/** Reverse channel: Findings view → ShellRailPanel (for clearing rail scope from filter bar chip). */
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

  // Sync study selection
  useEffect(() => {
    if (studyId) selectStudy(studyId);
  }, [studyId, selectStudy]);

  // Clear finding selection when non-endpoint filters change
  const nonEndpointFilters = `${filters.domain}|${filters.sex}|${filters.severity}|${filters.search}|${filters.organ_system}|${filters.dose_response_pattern}`;
  useEffect(() => {
    selectFinding(null);
  }, [nonEndpointFilters, selectFinding]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rail group scope → update API filters
  const handleGroupScopeChange = useCallback((scope: { type: GroupingMode; value: string } | null) => {
    if (!scope) {
      // Clear ALL rail-driven filters (domain included — it may have been set by domain grouping)
      setFilters((prev) => ({ ...prev, domain: null, organ_system: null, endpoint_label: null, dose_response_pattern: null }));
    } else if (scope.type === "organ") {
      setFilters((prev) => ({ ...prev, organ_system: scope.value, domain: null, endpoint_label: null, dose_response_pattern: null }));
    } else if (scope.type === "domain") {
      setFilters((prev) => ({ ...prev, domain: scope.value, organ_system: null, endpoint_label: null, dose_response_pattern: null }));
    } else if (scope.type === "pattern") {
      setFilters((prev) => ({ ...prev, dose_response_pattern: scope.value, domain: null, organ_system: null, endpoint_label: null }));
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
        : null;

  const clearScope = useCallback(() => {
    handleGroupScopeChange(null);
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

  // Phase 3: organ coherence, cross-domain syndromes, lab clinical rules
  const organCoherence = useMemo(() => deriveOrganCoherence(endpointSummaries), [endpointSummaries]);
  const syndromes = useMemo(() => detectCrossDomainSyndromes(endpointSummaries), [endpointSummaries]);
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
          mode="fixed"
          height={scatterSection.height}
          onResizePointerDown={scatterSection.onPointerDown}
          contentRef={scatterSection.contentRef}
        >
          <FindingsQuadrantScatter
            endpoints={endpointSummaries}
            selectedEndpoint={filters.endpoint_label}
            onSelect={handleEndpointSelect}
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
          findings={data.findings}
          doseGroups={data.dose_groups}
          signalScores={signalScoreMap}
        />
      ) : null}
      </div>
    </div>
    </FindingsAnalyticsProvider>
  );
}
