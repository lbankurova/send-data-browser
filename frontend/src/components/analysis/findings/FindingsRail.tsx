/**
 * FindingsRail — hierarchical navigation rail for findings-aware views.
 * Shows signal summary, group cards, and endpoint rows with signal scoring.
 *
 * Mounts on: Findings view (Stage 1), Dose-Response view (Stage 5).
 */

import { useState, useMemo, useCallback, useRef, useEffect, forwardRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  CornerRightUp,
  Activity,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFindings } from "@/hooks/useFindings";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { FindingsFilters } from "@/types/analysis";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";
import {
  withSignalScores,
  computeSignalSummary,
  groupEndpoints,
  groupEndpointsBySyndrome,
  buildMultiSyndromeIndex,
  filterEndpoints,
  sortEndpoints,
  buildEndpointToGroupIndex,
  isFiltered,
  getDomainFullLabel,
  getPatternLabel,
  EMPTY_RAIL_FILTERS,
} from "@/lib/findings-rail-engine";
import type {
  GroupingMode,
  SortMode,
  RailFilters,
  GroupCard,
  EndpointWithSignal,
  SignalSummaryStats,
} from "@/lib/findings-rail-engine";
import { deriveOrganCoherence } from "@/lib/derive-summaries";
import { detectCrossDomainSyndromes } from "@/lib/cross-domain-syndromes";
import { evaluateLabRules, getClinicalFloor } from "@/lib/lab-clinical-catalog";
import { formatPValue, titleCase, getDomainBadgeColor } from "@/lib/severity-colors";
import { PatternGlyph } from "@/components/ui/PatternGlyph";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterSearch, FilterSelect, FilterMultiSelect } from "@/components/ui/FilterBar";

// Static empty filters — fetch all findings, filter client-side (same as FindingsView)
const ALL_FINDINGS_FILTERS: FindingsFilters = {
  domain: null, sex: null, severity: null, search: "",
  organ_system: null, endpoint_label: null, dose_response_pattern: null,
};

// ─── Props ─────────────────────────────────────────────────

/** Payload sent from rail to view — the rail is the single source of truth for filtering. */
export interface RailVisibleState {
  labels: string[];
  scopeLabel: string | null;
  filterLabels: string[];
}

interface FindingsRailProps {
  studyId: string;
  /** Active group scope — set by rail click, consumed by parent view. */
  activeGroupScope?: { type: GroupingMode; value: string } | null;
  /** Active endpoint selection — set by rail click or center panel. */
  activeEndpoint?: string | null;
  /** Callback when a group card is clicked (for table filtering). */
  onGroupScopeChange?: (scope: { type: GroupingMode; value: string } | null) => void;
  /** Callback when an endpoint row is clicked (for table filtering + context panel). */
  onEndpointSelect?: (endpointLabel: string | null) => void;
  /** Callback when the grouping mode changes (for context). */
  onGroupingChange?: (mode: GroupingMode) => void;
  /** Callback with the rail's fully-filtered visible endpoint set + display metadata. */
  onVisibleEndpointsChange?: (state: RailVisibleState) => void;
}

// ─── Component ─────────────────────────────────────────────

export function FindingsRail({
  studyId,
  activeGroupScope = null,
  activeEndpoint = null,
  onGroupScopeChange,
  onEndpointSelect,
  onGroupingChange,
  onVisibleEndpointsChange,
}: FindingsRailProps) {
  // Same data source as FindingsView — React Query shares the cache
  const { data: rawData, isLoading, error } = useFindings(studyId, 1, 10000, ALL_FINDINGS_FILTERS);

  // ── Local state ────────────────────────────────────────
  const [grouping, setGrouping] = useState<GroupingMode>("organ");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [railFilters, setRailFilters] = useState<RailFilters>(EMPTY_RAIL_FILTERS);
  const [sortMode, setSortMode] = useState<SortMode>("signal");

  // Reset local state on study change
  const prevStudyRef = useRef(studyId);
  useEffect(() => {
    if (studyId !== prevStudyRef.current) {
      prevStudyRef.current = studyId;
      setGrouping("organ");
      setExpanded(new Set());
      setRailFilters(EMPTY_RAIL_FILTERS);
      setSortMode("signal");
    }
  }, [studyId]);

  // ── Derived data (same pipeline as FindingsView) ──────
  const endpointSummaries = useMemo<EndpointSummary[]>(() => {
    if (!rawData?.findings?.length) return [];
    const rows: AdverseEffectSummaryRow[] = rawData.findings.map((f) => ({
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
  }, [rawData]);

  const endpointsWithSignal = useMemo(
    () => withSignalScores(endpointSummaries),
    [endpointSummaries],
  );

  // Syndrome detection (Layer B) — needed for syndrome grouping mode
  const syndromes = useMemo(
    () => detectCrossDomainSyndromes(endpointSummaries),
    [endpointSummaries],
  );

  // Multi-syndrome index: endpoint_label → list of syndrome IDs
  const multiSyndromeIndex = useMemo(
    () => buildMultiSyndromeIndex(syndromes),
    [syndromes],
  );

  // Clinical severity data (Layer D) — needed for Clinical S2+ filter
  const organCoherence = useMemo(() => deriveOrganCoherence(endpointSummaries), [endpointSummaries]);
  const labMatches = useMemo(
    () => evaluateLabRules(endpointSummaries, organCoherence, syndromes),
    [endpointSummaries, organCoherence, syndromes],
  );

  // Clinical S2+ endpoints: endpoints with clinical severity >= S2
  const clinicalEndpoints = useMemo(() => {
    const set = new Set<string>();
    for (const match of labMatches) {
      const floor = getClinicalFloor(match.severity);
      if (floor >= 4) { // S2=4, S3=8, S4=15
        for (const ep of match.matchedEndpoints) set.add(ep);
      }
    }
    return set;
  }, [labMatches]);

  // Dynamic group filter options — derived from unique values in the current grouping dimension
  const groupFilterOptions = useMemo(() => {
    if (grouping === "syndrome") {
      // Syndrome mode: options are syndrome names + "No Syndrome"
      const opts: { key: string; label: string }[] = syndromes.map((s) => ({
        key: s.id,
        label: s.name,
      }));
      opts.push({ key: "no_syndrome", label: "No Syndrome" });
      return opts;
    }
    const seen = new Map<string, number>();
    for (const ep of endpointsWithSignal) {
      const key =
        grouping === "organ" ? ep.organ_system
        : grouping === "domain" ? ep.domain
        : ep.pattern;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    // Sort by count descending
    const entries = [...seen.entries()].sort((a, b) => b[1] - a[1]);
    return entries.map(([key]) => ({
      key,
      label:
        grouping === "organ" ? titleCase(key)
        : grouping === "domain" ? getDomainFullLabel(key)
        : getPatternLabel(key),
    }));
  }, [endpointsWithSignal, grouping, syndromes]);

  // Signal summary — always full dataset, unfiltered
  const signalSummary = useMemo<SignalSummaryStats>(
    () => computeSignalSummary(endpointSummaries),
    [endpointSummaries],
  );

  // Apply rail filters → then group → then sort within each card
  const filteredEndpoints = useMemo(
    () => filterEndpoints(endpointsWithSignal, railFilters, grouping, clinicalEndpoints),
    [endpointsWithSignal, railFilters, grouping, clinicalEndpoints],
  );

  // ── Visible endpoint set (filters + scope) → sent to view ──

  const visibleEndpointLabels = useMemo(() => {
    let eps = filteredEndpoints;
    if (activeGroupScope) {
      if (activeGroupScope.type === "organ") {
        eps = eps.filter((ep) => ep.organ_system === activeGroupScope.value);
      } else if (activeGroupScope.type === "domain") {
        eps = eps.filter((ep) => ep.domain === activeGroupScope.value);
      } else if (activeGroupScope.type === "pattern") {
        eps = eps.filter((ep) => (ep as EndpointWithSignal & { pattern: string }).pattern === activeGroupScope.value);
      } else if (activeGroupScope.type === "syndrome") {
        const syn = syndromes.find((s) => s.id === activeGroupScope.value);
        if (syn) {
          const labels = new Set(syn.matchedEndpoints.map((m) => m.endpoint_label));
          eps = eps.filter((ep) => labels.has(ep.endpoint_label));
        } else if (activeGroupScope.value === "no_syndrome") {
          const inSyn = new Set<string>();
          for (const s of syndromes) for (const m of s.matchedEndpoints) inSyn.add(m.endpoint_label);
          eps = eps.filter((ep) => !inSyn.has(ep.endpoint_label));
        }
      } else if (activeGroupScope.type === "finding") {
        eps = eps.filter((ep) => ep.endpoint_label === activeGroupScope.value);
      }
    }
    return eps.map((ep) => ep.endpoint_label);
  }, [filteredEndpoints, activeGroupScope, syndromes]);

  const railScopeLabel = useMemo(() => {
    if (!activeGroupScope) return null;
    if (activeGroupScope.type === "organ") return titleCase(activeGroupScope.value);
    if (activeGroupScope.type === "domain") return getDomainFullLabel(activeGroupScope.value);
    if (activeGroupScope.type === "pattern") return getPatternLabel(activeGroupScope.value);
    if (activeGroupScope.type === "syndrome") {
      const syn = syndromes.find((s) => s.id === activeGroupScope.value);
      return syn?.name ?? (activeGroupScope.value === "no_syndrome" ? "No Syndrome" : null);
    }
    if (activeGroupScope.type === "finding") return activeGroupScope.value;
    return null;
  }, [activeGroupScope, syndromes]);

  const railFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (railFilters.trOnly) labels.push("TR only");
    if (railFilters.sigOnly) labels.push("Sig only");
    if (railFilters.clinicalS2Plus) labels.push("Clinical S2+");
    if (railFilters.sex) labels.push(railFilters.sex === "M" ? "Male" : "Female");
    if (railFilters.severity) {
      const sevLabels = [...railFilters.severity].map((s) => s.charAt(0).toUpperCase() + s.slice(1));
      labels.push(sevLabels.join(", "));
    }
    return labels;
  }, [railFilters]);

  // Send visible state to view whenever it changes
  useEffect(() => {
    onVisibleEndpointsChange?.({
      labels: visibleEndpointLabels,
      scopeLabel: railScopeLabel,
      filterLabels: railFilterLabels,
    });
  }, [visibleEndpointLabels, railScopeLabel, railFilterLabels, onVisibleEndpointsChange]);

  const cards = useMemo(
    () => grouping === "syndrome"
      ? groupEndpointsBySyndrome(filteredEndpoints, syndromes)
      : groupEndpoints(filteredEndpoints, grouping),
    [filteredEndpoints, grouping, syndromes],
  );

  // Sort endpoints within each card
  const sortedCards = useMemo<GroupCard[]>(
    () => cards.map((c) => ({ ...c, endpoints: sortEndpoints(c.endpoints, sortMode) })),
    [cards, sortMode],
  );

  // Total endpoints per group (unfiltered) for filtered count display
  const unfilteredGroupTotals = useMemo(() => {
    const totals = new Map<string, number>();
    const unfilteredCards = grouping === "syndrome"
      ? groupEndpointsBySyndrome(endpointsWithSignal, syndromes)
      : groupEndpoints(endpointsWithSignal, grouping);
    for (const card of unfilteredCards) {
      totals.set(card.key, card.totalEndpoints);
    }
    return totals;
  }, [endpointsWithSignal, grouping, syndromes]);

  // Reverse index: endpoint_label → group key
  const endpointToGroup = useMemo(() => {
    if (grouping === "syndrome") {
      // For syndrome mode, map endpoint → first syndrome ID it belongs to
      const index = new Map<string, string>();
      for (const syn of syndromes) {
        for (const m of syn.matchedEndpoints) {
          if (!index.has(m.endpoint_label)) index.set(m.endpoint_label, syn.id);
        }
      }
      // Anything not in a syndrome → "no_syndrome"
      for (const ep of endpointsWithSignal) {
        if (!index.has(ep.endpoint_label)) index.set(ep.endpoint_label, "no_syndrome");
      }
      return index;
    }
    return buildEndpointToGroupIndex(endpointsWithSignal, grouping);
  }, [endpointsWithSignal, grouping, syndromes]);

  // Ref map for scrolling endpoint rows into view
  const endpointRefs = useRef<Map<string, HTMLElement>>(new Map());
  const registerEndpointRef = useCallback((label: string, el: HTMLElement | null) => {
    if (el) endpointRefs.current.set(label, el);
    else endpointRefs.current.delete(label);
  }, []);

  // ── Auto-expand top card on initial load / grouping change ─
  const prevGroupingRef = useRef(grouping);
  useEffect(() => {
    if (sortedCards.length > 0 && (expanded.size === 0 || prevGroupingRef.current !== grouping)) {
      setExpanded(new Set([sortedCards[0].key]));
      prevGroupingRef.current = grouping;
    }
  }, [sortedCards, grouping]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-expand parent card + scroll when activeEndpoint changes externally ─
  useEffect(() => {
    if (!activeEndpoint) return;
    const parentGroup = endpointToGroup.get(activeEndpoint);
    if (!parentGroup) return;

    // Expand parent card if collapsed
    setExpanded((prev) => {
      if (prev.has(parentGroup)) return prev;
      return new Set(prev).add(parentGroup);
    });

    // Scroll endpoint into view (defer to next frame so expansion renders)
    requestAnimationFrame(() => {
      const el = endpointRefs.current.get(activeEndpoint);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [activeEndpoint, endpointToGroup]);

  // ── Handlers ───────────────────────────────────────────
  const handleGroupingChange = useCallback((mode: GroupingMode) => {
    setGrouping(mode);
    setExpanded(new Set());
    setRailFilters((prev) => ({ ...prev, groupFilter: null }));
    onGroupScopeChange?.(null);
    onEndpointSelect?.(null);
    onGroupingChange?.(mode);
  }, [onGroupScopeChange, onEndpointSelect, onGroupingChange]);

  const handleCardClick = useCallback((card: GroupCard) => {
    const isExpanded = expanded.has(card.key);
    const isScopedToThis = activeGroupScope?.value === card.key;

    if (!isExpanded && !activeGroupScope) {
      // State 1: Collapsed, no filter → Expand + apply scope
      setExpanded((prev) => new Set(prev).add(card.key));
      onGroupScopeChange?.({ type: grouping, value: card.key });
    } else if (isExpanded && isScopedToThis) {
      // State 2: Expanded + scoped same → Collapse + clear scope
      setExpanded((prev) => { const n = new Set(prev); n.delete(card.key); return n; });
      onGroupScopeChange?.(null);
    } else if (isExpanded && !isScopedToThis) {
      // State 3: Expanded, not scoped (or different group) → Apply scope (stay expanded)
      // Also collapse previously scoped card if different
      if (activeGroupScope) {
        setExpanded((prev) => { const n = new Set(prev); n.delete(activeGroupScope.value); n.add(card.key); return n; });
      }
      onGroupScopeChange?.({ type: grouping, value: card.key });
    } else {
      // State 4: Collapsed, different group scoped → Collapse old, expand this, apply new scope
      setExpanded((prev) => {
        const n = new Set(prev);
        if (activeGroupScope) n.delete(activeGroupScope.value);
        n.add(card.key);
        return n;
      });
      onGroupScopeChange?.({ type: grouping, value: card.key });
    }
  }, [expanded, activeGroupScope, grouping, onGroupScopeChange]);

  const handleEndpointClick = useCallback((endpointLabel: string) => {
    if (activeEndpoint === endpointLabel) {
      onEndpointSelect?.(null);
    } else {
      onEndpointSelect?.(endpointLabel);
    }
  }, [activeEndpoint, onEndpointSelect]);

  // ── Loading / Error / Empty states ─────────────────────
  if (isLoading) {
    return (
      <div className="flex h-full flex-col px-3 pt-3">
        <Skeleton className="mb-2 h-4 w-2/3" />
        <Skeleton className="mb-3 h-1 w-full" />
        <Skeleton className="mb-3 h-5 w-40" />
        <div className="space-y-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-4 text-xs text-destructive">
        Failed to load findings summary
      </div>
    );
  }

  if (endpointSummaries.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-muted-foreground">
        No adverse or warning findings for this study.
      </div>
    );
  }

  const railIsFiltered = isFiltered(railFilters);

  return (
    <div className="flex h-full flex-col overflow-hidden" aria-label="Findings navigation">
      {/* Zone 1: Signal summary (fixed) */}
      <SignalSummarySection stats={signalSummary} />

      {/* Zone 2: Scope indicator (conditional) */}
      {activeGroupScope && (
        <ScopeIndicator
          scope={activeGroupScope}
          grouping={grouping}
          endpointCount={unfilteredGroupTotals.get(activeGroupScope.value) ?? 0}
          onClear={() => onGroupScopeChange?.(null)}
          syndromeName={
            grouping === "syndrome"
              ? (activeGroupScope.value === "no_syndrome"
                ? "No Syndrome"
                : syndromes.find((s) => s.id === activeGroupScope.value)?.name)
              : undefined
          }
        />
      )}

      {/* Zone 3+4: Rail filters (grouping dropdown merged in) */}
      <RailFiltersSection
        filters={railFilters}
        sortMode={sortMode}
        grouping={grouping}
        groupFilterOptions={groupFilterOptions}
        filteredCount={filteredEndpoints.length}
        totalCount={endpointsWithSignal.length}
        isFiltered={railIsFiltered}
        hasSyndromes={syndromes.length > 0}
        hasClinicalEndpoints={clinicalEndpoints.size > 0}
        clinicalS2Plus={railFilters.clinicalS2Plus ?? false}
        onGroupingChange={handleGroupingChange}
        onFiltersChange={setRailFilters}
        onSortChange={setSortMode}
      />

      {/* Zone 5: Card list (scrollable) */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sortedCards.length === 0 && railIsFiltered && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No endpoints match current filters.
          </div>
        )}
        {grouping === "finding" ? (
          /* Flat list — no card headers */
          sortedCards.flatMap((card) =>
            card.endpoints.map((ep) => (
              <EndpointRow
                key={ep.endpoint_label}
                endpoint={ep}
                isSelected={activeEndpoint === ep.endpoint_label}
                onClick={() => handleEndpointClick(ep.endpoint_label)}
                ref={(el) => registerEndpointRef(ep.endpoint_label, el)}
              />
            ))
          )
        ) : (
          sortedCards.map((card) => (
            <CardSection
              key={card.key}
              card={card}
              grouping={grouping}
              isExpanded={expanded.has(card.key)}
              isScoped={activeGroupScope?.value === card.key}
              activeEndpoint={activeEndpoint}
              unfilteredTotal={unfilteredGroupTotals.get(card.key) ?? card.totalEndpoints}
              showFilteredCount={railIsFiltered}
              onHeaderClick={() => handleCardClick(card)}
              onEndpointClick={handleEndpointClick}
              registerEndpointRef={registerEndpointRef}
              multiSyndromeIndex={grouping === "syndrome" ? multiSyndromeIndex : undefined}
              currentSyndromeId={grouping === "syndrome" ? card.key : undefined}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Signal Summary ────────────────────────────────────────

function SignalSummarySection({ stats }: { stats: SignalSummaryStats }) {
  const trPct = stats.totalEndpoints > 0
    ? (stats.trCount / stats.totalEndpoints) * 100
    : 0;

  return (
    <div className="shrink-0 border-b px-3 pb-2 pt-3">
      {/* Header */}
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Findings
      </div>

      {/* Line 1: Classification counts */}
      <div className="mt-1 flex items-center gap-2 text-xs">
        <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-600">
          {stats.adverseCount} adverse
        </span>
        <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-600">
          {stats.warningCount} warning
        </span>
      </div>

      {/* Line 2: TR ratio bar */}
      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-gray-400"
            style={{ width: `${trPct}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-[10px] text-muted-foreground">
          {stats.trCount} TR / {stats.totalEndpoints} endpoints
        </span>
      </div>
    </div>
  );
}

// ─── Scope Indicator ───────────────────────────────────────

function ScopeIndicator({
  scope,
  grouping,
  endpointCount,
  onClear,
  syndromeName,
}: {
  scope: { type: GroupingMode; value: string };
  grouping: GroupingMode;
  endpointCount: number;
  onClear: () => void;
  syndromeName?: string;
}) {
  let label: string;
  if (grouping === "organ") label = titleCase(scope.value);
  else if (grouping === "domain") label = getDomainFullLabel(scope.value);
  else if (grouping === "syndrome") label = syndromeName ?? scope.value;
  else label = getPatternLabel(scope.value);

  return (
    <div className="flex shrink-0 items-center gap-2 border-b bg-accent/30 px-3 py-1.5 text-xs">
      <span className="font-semibold">{label}</span>
      <span className="text-muted-foreground">&middot; {endpointCount} endpoints</span>
      <button
        className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={onClear}
        title="Clear scope"
      >
        <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M2 2l8 8M10 2l-8 8" />
        </svg>
      </button>
    </div>
  );
}

// ─── Grouping Toggle ───────────────────────────────────────

const PATTERN_ICONS: Record<string, typeof TrendingUp> = {
  monotonic_increase: TrendingUp,
  monotonic_decrease: TrendingDown,
  threshold: CornerRightUp,
  non_monotonic: Activity,
  flat: Minus,
};

// ─── Rail Filters ──────────────────────────────────────────

const SEVERITY_OPTIONS = [
  { key: "adverse", label: "Adverse" },
  { key: "warning", label: "Warning" },
  { key: "normal", label: "Normal" },
];

const GROUPING_ALL_LABELS: Partial<Record<GroupingMode, string>> = {
  organ: "All organs",
  domain: "All domains",
  pattern: "All patterns",
  syndrome: "All syndromes",
};

function RailFiltersSection({
  filters,
  sortMode,
  grouping,
  groupFilterOptions,
  filteredCount,
  totalCount,
  isFiltered: hasActiveFilters,
  hasSyndromes,
  hasClinicalEndpoints,
  clinicalS2Plus,
  onGroupingChange,
  onFiltersChange,
  onSortChange,
}: {
  filters: RailFilters;
  sortMode: SortMode;
  grouping: GroupingMode;
  groupFilterOptions: { key: string; label: string }[];
  filteredCount: number;
  totalCount: number;
  isFiltered: boolean;
  hasSyndromes: boolean;
  hasClinicalEndpoints: boolean;
  clinicalS2Plus: boolean;
  onGroupingChange: (mode: GroupingMode) => void;
  onFiltersChange: (f: RailFilters) => void;
  onSortChange: (s: SortMode) => void;
}) {
  return (
    <div className="shrink-0 space-y-1.5 border-b bg-muted/30 px-4 py-2">
      {/* Row 1: Search */}
      <FilterSearch
        value={filters.search}
        onChange={(v) => onFiltersChange({ ...filters, search: v })}
        placeholder="Search findings…"
      />

      {/* Row 2: Group by + group filter + sort by */}
      <div className="flex items-center gap-1.5">
        <FilterSelect
          value={grouping}
          onChange={(e) => onGroupingChange(e.target.value as GroupingMode)}
        >
          <option value="organ">Group: Organ</option>
          <option value="domain">Group: Domain</option>
          <option value="pattern">Group: Pattern</option>
          <option value="finding">Group: Finding</option>
          {hasSyndromes && <option value="syndrome">Group: Syndrome</option>}
        </FilterSelect>
        {grouping !== "finding" && (
          <FilterMultiSelect
            options={groupFilterOptions}
            selected={filters.groupFilter}
            onChange={(next) => onFiltersChange({ ...filters, groupFilter: next })}
            allLabel={GROUPING_ALL_LABELS[grouping] ?? "All"}
          />
        )}
        <FilterSelect
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as SortMode)}
        >
          <option value="signal">Sort: Signal</option>
          <option value="pvalue">Sort: P-value</option>
          <option value="effect">Sort: Effect</option>
          <option value="az">Sort: A–Z</option>
        </FilterSelect>
      </div>

      {/* Row 3: Sex + Severity + Quick toggles */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterSelect
          value={filters.sex ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, sex: e.target.value || null })}
        >
          <option value="">All sexes</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
        </FilterSelect>
        <FilterMultiSelect
          options={SEVERITY_OPTIONS}
          selected={filters.severity}
          onChange={(next) => onFiltersChange({ ...filters, severity: next })}
          allLabel="All classes"
        />
        <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.trOnly}
            onChange={(e) => onFiltersChange({ ...filters, trOnly: e.target.checked })}
            className="h-3 w-3 rounded border-gray-300"
          />
          TR
        </label>
        <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.sigOnly}
            onChange={(e) => onFiltersChange({ ...filters, sigOnly: e.target.checked })}
            className="h-3 w-3 rounded border-gray-300"
          />
          Sig
        </label>
        {hasClinicalEndpoints && (
          <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={clinicalS2Plus}
              onChange={(e) => onFiltersChange({ ...filters, clinicalS2Plus: e.target.checked })}
              className="h-3 w-3 rounded border-gray-300"
            />
            S2+
          </label>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          {hasActiveFilters ? `${filteredCount}/${totalCount}` : totalCount}
        </span>
      </div>
    </div>
  );
}

// ─── Group Card ────────────────────────────────────────────

function CardSection({
  card,
  grouping,
  isExpanded,
  isScoped,
  activeEndpoint,
  unfilteredTotal,
  showFilteredCount,
  onHeaderClick,
  onEndpointClick,
  registerEndpointRef,
  multiSyndromeIndex,
  currentSyndromeId,
}: {
  card: GroupCard;
  grouping: GroupingMode;
  isExpanded: boolean;
  isScoped: boolean;
  activeEndpoint: string | null;
  unfilteredTotal: number;
  showFilteredCount: boolean;
  onHeaderClick: () => void;
  onEndpointClick: (label: string) => void;
  registerEndpointRef: (label: string, el: HTMLElement | null) => void;
  multiSyndromeIndex?: Map<string, string[]>;
  currentSyndromeId?: string;
}) {
  return (
    <div>
      <CardHeader
        card={card}
        grouping={grouping}
        isExpanded={isExpanded}
        isScoped={isScoped}
        unfilteredTotal={unfilteredTotal}
        showFilteredCount={showFilteredCount}
        onClick={onHeaderClick}
      />
      {isExpanded && (
        <div>
          {card.endpoints.map((ep) => {
            // In syndrome mode, show other syndrome IDs this endpoint belongs to
            const otherSyndromes = (grouping === "syndrome" && multiSyndromeIndex && currentSyndromeId)
              ? (multiSyndromeIndex.get(ep.endpoint_label) ?? []).filter((id) => id !== currentSyndromeId)
              : undefined;
            return (
              <EndpointRow
                key={ep.endpoint_label}
                endpoint={ep}
                isSelected={activeEndpoint === ep.endpoint_label}
                onClick={() => onEndpointClick(ep.endpoint_label)}
                ref={(el) => registerEndpointRef(ep.endpoint_label, el)}
                otherSyndromes={otherSyndromes}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Card Header ───────────────────────────────────────────

function CardHeader({
  card,
  grouping,
  isExpanded,
  isScoped,
  unfilteredTotal,
  showFilteredCount,
  onClick,
}: {
  card: GroupCard;
  grouping: GroupingMode;
  isExpanded: boolean;
  isScoped: boolean;
  unfilteredTotal: number;
  showFilteredCount: boolean;
  onClick: () => void;
}) {
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <button
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors",
        isScoped
          ? "border-l-2 border-primary bg-accent/50"
          : "hover:bg-accent/30",
      )}
      onClick={onClick}
      aria-expanded={isExpanded}
    >
      <Chevron className="h-3 w-3 shrink-0 text-muted-foreground" />
      <CardLabel grouping={grouping} value={card.key} syndromeLabel={grouping === "syndrome" ? card.label : undefined} />
      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
        {showFilteredCount ? `${card.totalEndpoints}/${unfilteredTotal}` : card.adverseCount}
      </span>
      <span className="text-muted-foreground/40">&middot;</span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {card.trCount}
      </span>
    </button>
  );
}

// ─── Card Label Variants ───────────────────────────────────

function CardLabel({ grouping, value, syndromeLabel }: { grouping: GroupingMode; value: string; syndromeLabel?: string }) {
  if (grouping === "domain") {
    const domainCode = value.toUpperCase();
    const color = getDomainBadgeColor(domainCode);
    return (
      <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
        <span className={cn("text-[9px] font-semibold shrink-0", color.text)}>
          {domainCode}
        </span>
        <span className="truncate" title={getDomainFullLabel(domainCode)}>{getDomainFullLabel(domainCode)}</span>
      </span>
    );
  }

  if (grouping === "pattern") {
    const PatternIcon = PATTERN_ICONS[value] ?? Minus;
    return (
      <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
        <PatternIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate" title={getPatternLabel(value)}>{getPatternLabel(value)}</span>
      </span>
    );
  }

  if (grouping === "syndrome") {
    const isNoSyndrome = value === "no_syndrome";
    const label = syndromeLabel ?? value;
    return (
      <span className={cn("flex min-w-0 items-center gap-1.5 truncate font-semibold", isNoSyndrome && "text-muted-foreground/70")}>
        {!isNoSyndrome && <span className="shrink-0">{"\uD83D\uDD17"}</span>}
        <span className="truncate" title={label}>{label}</span>
      </span>
    );
  }

  // Organ (default)
  return <span className="min-w-0 truncate font-semibold" title={titleCase(value)}>{titleCase(value)}</span>;
}

// ─── Endpoint Row ──────────────────────────────────────────

const EndpointRow = forwardRef<HTMLDivElement, {
  endpoint: EndpointWithSignal;
  isSelected: boolean;
  onClick: () => void;
  otherSyndromes?: string[];
}>(function EndpointRow({ endpoint, isSelected, onClick, otherSyndromes }, ref) {
  const dirSymbol = endpoint.direction === "up" ? "▲" : endpoint.direction === "down" ? "▼" : "—";

  const sevColor =
    endpoint.worstSeverity === "adverse"
      ? "bg-red-500"
      : endpoint.worstSeverity === "warning"
        ? "bg-amber-500"
        : "bg-gray-400";

  return (
    <div ref={ref}>
      {/* Line 1: Identity + Signals */}
      <button
        className={cn(
          "flex w-full items-center gap-1.5 px-3 py-1 pl-6 cursor-pointer transition-colors",
          isSelected ? "bg-accent" : "hover:bg-accent/30",
        )}
        onClick={onClick}
        aria-selected={isSelected}
      >
        <span className="shrink-0 text-[10px] text-muted-foreground">{dirSymbol}</span>
        <PatternGlyph pattern={endpoint.pattern} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left text-xs" title={endpoint.endpoint_label}>
          {endpoint.endpoint_label}
        </span>
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", sevColor)} />
        {endpoint.treatmentRelated && (
          <span className="shrink-0 text-[9px] font-medium text-muted-foreground">TR</span>
        )}
        {otherSyndromes && otherSyndromes.length > 0 && (
          <span className="shrink-0 text-[8px] text-muted-foreground/50">
            {otherSyndromes.map((id) => `+${id}`).join(" ")}
          </span>
        )}
      </button>

      {/* Line 2: Metrics */}
      <div className="flex items-center gap-2 px-3 pb-1 pl-8 font-mono text-[10px] text-muted-foreground">
        {endpoint.maxEffectSize !== null && (
          <span>{endpoint.maxEffectSize.toFixed(2)}</span>
        )}
        {endpoint.minPValue !== null && (
          <span>p{formatPValue(endpoint.minPValue)}</span>
        )}
        <span>{endpoint.sexes.join(" ")}</span>
      </div>
    </div>
  );
});
