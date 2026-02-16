import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAdverseEffects } from "@/hooks/useAdverseEffects";
import { useSelection } from "@/contexts/SelectionContext";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { FindingsFilterBar } from "../FindingsFilterBar";
import { FindingsTable } from "../FindingsTable";
import { FilterBar, FilterBarCount } from "@/components/ui/FilterBar";
import { Skeleton } from "@/components/ui/skeleton";
import type { AdverseEffectsFilters } from "@/types/analysis";
import { getDomainFullLabel, getPatternLabel } from "@/lib/findings-rail-engine";
import type { GroupingMode } from "@/lib/findings-rail-engine";
import { titleCase } from "@/lib/severity-colors";

/** Context bridge so ShellRailPanel can pass rail callbacks to the AE view. */
export interface AERailState {
  activeGroupScope: { type: GroupingMode; value: string } | null;
  activeEndpoint: string | null;
  activeGrouping: GroupingMode;
  onGroupScopeChange: (scope: { type: GroupingMode; value: string } | null) => void;
  onEndpointSelect: (endpointLabel: string | null) => void;
}

// Singleton event bus — rail and view are siblings, not parent-child.
// ShellRailPanel renders FindingsRail, Layout renders AdverseEffectsView via Outlet.
// We use a simple callback registry so the rail can communicate scope changes.
let _aeRailCallback: ((state: Partial<Pick<AERailState, "activeGroupScope" | "activeEndpoint" | "activeGrouping">>) => void) | null = null;
/** Reverse channel: AE view → ShellRailPanel (for clearing rail scope from filter bar chip). */
let _aeClearScopeCallback: (() => void) | null = null;

export function setAERailCallback(cb: typeof _aeRailCallback) {
  _aeRailCallback = cb;
}
export function getAERailCallback() {
  return _aeRailCallback;
}
export function setAEClearScopeCallback(cb: typeof _aeClearScopeCallback) {
  _aeClearScopeCallback = cb;
}
export function getAEClearScopeCallback() {
  return _aeClearScopeCallback;
}

export function AdverseEffectsView() {
  const { studyId } = useParams<{ studyId: string }>();
  const { selectStudy } = useSelection();
  const { selectFinding } = useFindingSelection();

  const [filters, setFilters] = useState<AdverseEffectsFilters>({
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
    setAERailCallback((state) => {
      if (state.activeGroupScope !== undefined) handleGroupScopeChange(state.activeGroupScope);
      if (state.activeEndpoint !== undefined) handleEndpointSelect(state.activeEndpoint);
      if (state.activeGrouping !== undefined) setActiveGrouping(state.activeGrouping);
    });
    return () => setAERailCallback(null);
  }, [handleGroupScopeChange, handleEndpointSelect]);

  const { data, isLoading, error } = useAdverseEffects(
    studyId,
    1,
    10000,
    filters
  );

  // Auto-select first finding when rail endpoint filter is applied and data arrives
  useEffect(() => {
    if (filters.endpoint_label && data?.findings?.length) {
      selectFinding(data.findings[0]);
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
    _aeClearScopeCallback?.();
  }, [handleGroupScopeChange]);

  if (error) {
    return (
      <div className="p-6 text-destructive">
        Failed to load analysis: {error.message}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
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
        />
      ) : null}
      </div>
    </div>
  );
}
