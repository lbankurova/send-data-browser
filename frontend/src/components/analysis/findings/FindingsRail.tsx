/**
 * FindingsRail — hierarchical navigation rail for findings-aware views.
 * Shows signal summary, group cards, and endpoint rows with signal scoring.
 *
 * Mounts on: Adverse Effects view (Stage 1), Dose-Response view (Stage 5).
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
import { useAdverseEffectSummary } from "@/hooks/useAdverseEffectSummary";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { EndpointSummary } from "@/lib/derive-summaries";
import {
  withSignalScores,
  computeSignalSummary,
  groupEndpoints,
  filterEndpoints,
  sortEndpoints,
  buildEndpointToGroupIndex,
  isFiltered,
  getDomainFullLabel,
  getPatternLabel,
} from "@/lib/findings-rail-engine";
import type {
  GroupingMode,
  SortMode,
  RailFilters,
  GroupCard,
  EndpointWithSignal,
  SignalSummaryStats,
} from "@/lib/findings-rail-engine";
import { formatPValue, titleCase, getDomainBadgeColor, getDirectionColor } from "@/lib/severity-colors";
import { PatternGlyph } from "@/components/ui/PatternGlyph";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterSearch, FilterSelect, FilterMultiSelect } from "@/components/ui/FilterBar";

// ─── Props ─────────────────────────────────────────────────

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
  /** Callback when the grouping mode changes (for filter bar coordination). */
  onGroupingChange?: (mode: GroupingMode) => void;
}

// ─── Component ─────────────────────────────────────────────

export function FindingsRail({
  studyId,
  activeGroupScope = null,
  activeEndpoint = null,
  onGroupScopeChange,
  onEndpointSelect,
  onGroupingChange,
}: FindingsRailProps) {
  const { data: rawData, isLoading, error } = useAdverseEffectSummary(studyId);

  // ── Local state ────────────────────────────────────────
  const [grouping, setGrouping] = useState<GroupingMode>("organ");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [railFilters, setRailFilters] = useState<RailFilters>({
    search: "",
    trOnly: false,
    sigOnly: false,
    groupFilter: null,
  });
  const [sortMode, setSortMode] = useState<SortMode>("signal");

  // Reset local state on study change
  const prevStudyRef = useRef(studyId);
  useEffect(() => {
    if (studyId !== prevStudyRef.current) {
      prevStudyRef.current = studyId;
      setGrouping("organ");
      setExpanded(new Set());
      setRailFilters({ search: "", trOnly: false, sigOnly: false, groupFilter: null });
      setSortMode("signal");
    }
  }, [studyId]);

  // ── Derived data ───────────────────────────────────────
  const endpointSummaries = useMemo<EndpointSummary[]>(
    () => (rawData ? deriveEndpointSummaries(rawData) : []),
    [rawData],
  );

  const endpointsWithSignal = useMemo(
    () => withSignalScores(endpointSummaries),
    [endpointSummaries],
  );

  // Dynamic group filter options — derived from unique values in the current grouping dimension
  const groupFilterOptions = useMemo(() => {
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
  }, [endpointsWithSignal, grouping]);

  // Signal summary — always full dataset, unfiltered
  const signalSummary = useMemo<SignalSummaryStats>(
    () => computeSignalSummary(endpointSummaries),
    [endpointSummaries],
  );

  // Apply rail filters → then group → then sort within each card
  const filteredEndpoints = useMemo(
    () => filterEndpoints(endpointsWithSignal, railFilters, grouping),
    [endpointsWithSignal, railFilters, grouping],
  );

  const cards = useMemo(
    () => groupEndpoints(filteredEndpoints, grouping),
    [filteredEndpoints, grouping],
  );

  // Sort endpoints within each card
  const sortedCards = useMemo<GroupCard[]>(
    () => cards.map((c) => ({ ...c, endpoints: sortEndpoints(c.endpoints, sortMode) })),
    [cards, sortMode],
  );

  // Total endpoints per group (unfiltered) for filtered count display
  const unfilteredGroupTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const card of groupEndpoints(endpointsWithSignal, grouping)) {
      totals.set(card.key, card.totalEndpoints);
    }
    return totals;
  }, [endpointsWithSignal, grouping]);

  // Reverse index: endpoint_label → group key
  const endpointToGroup = useMemo(
    () => buildEndpointToGroupIndex(endpointsWithSignal, grouping),
    [endpointsWithSignal, grouping],
  );

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
        />
      )}

      {/* Zone 3+4: Rail filters (grouping dropdown merged in) */}
      <RailFiltersSection
        filters={railFilters}
        sortMode={sortMode}
        grouping={grouping}
        groupFilterOptions={groupFilterOptions}
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
        {sortedCards.map((card) => (
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
          />
        ))}
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
}: {
  scope: { type: GroupingMode; value: string };
  grouping: GroupingMode;
  endpointCount: number;
  onClear: () => void;
}) {
  let label: string;
  if (grouping === "organ") label = titleCase(scope.value);
  else if (grouping === "domain") label = getDomainFullLabel(scope.value);
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

const GROUPING_ALL_LABELS: Record<GroupingMode, string> = {
  organ: "All organs",
  domain: "All domains",
  pattern: "All patterns",
};

function RailFiltersSection({
  filters,
  sortMode,
  grouping,
  groupFilterOptions,
  onGroupingChange,
  onFiltersChange,
  onSortChange,
}: {
  filters: RailFilters;
  sortMode: SortMode;
  grouping: GroupingMode;
  groupFilterOptions: { key: string; label: string }[];
  onGroupingChange: (mode: GroupingMode) => void;
  onFiltersChange: (f: RailFilters) => void;
  onSortChange: (s: SortMode) => void;
}) {
  return (
    <div className="shrink-0 space-y-1.5 border-b px-3 py-1.5">
      {/* Row 1: Search */}
      <FilterSearch
        value={filters.search}
        onChange={(v) => onFiltersChange({ ...filters, search: v })}
        placeholder="Search findings…"
      />

      {/* Row 2: Group by + group filter + sort */}
      <div className="flex items-center gap-1.5">
        <FilterSelect
          value={grouping}
          onChange={(e) => onGroupingChange(e.target.value as GroupingMode)}
        >
          <option value="organ">Organ</option>
          <option value="domain">Domain</option>
          <option value="pattern">Pattern</option>
        </FilterSelect>
        <FilterMultiSelect
          options={groupFilterOptions}
          selected={filters.groupFilter}
          onChange={(next) => onFiltersChange({ ...filters, groupFilter: next })}
          allLabel={GROUPING_ALL_LABELS[grouping]}
        />
        <FilterSelect
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as SortMode)}
        >
          <option value="signal">Signal</option>
          <option value="pvalue">P-value</option>
          <option value="effect">Effect size</option>
          <option value="az">A–Z</option>
        </FilterSelect>
      </div>

      {/* Row 3: Quick toggles */}
      <div className="flex items-center gap-3">
        <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.trOnly}
            onChange={(e) => onFiltersChange({ ...filters, trOnly: e.target.checked })}
            className="h-3 w-3 rounded border-gray-300"
          />
          TR only
        </label>
        <label className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground">
          <input
            type="checkbox"
            checked={filters.sigOnly}
            onChange={(e) => onFiltersChange({ ...filters, sigOnly: e.target.checked })}
            className="h-3 w-3 rounded border-gray-300"
          />
          Sig only
        </label>
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
          {card.endpoints.map((ep) => (
            <EndpointRow
              key={ep.endpoint_label}
              endpoint={ep}
              isSelected={activeEndpoint === ep.endpoint_label}
              onClick={() => onEndpointClick(ep.endpoint_label)}
              ref={(el) => registerEndpointRef(ep.endpoint_label, el)}
            />
          ))}
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
      <CardLabel grouping={grouping} value={card.key} />
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

function CardLabel({ grouping, value }: { grouping: GroupingMode; value: string }) {
  if (grouping === "domain") {
    const domainCode = value.toUpperCase();
    const color = getDomainBadgeColor(domainCode);
    return (
      <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
        <span className={cn("text-[9px] font-semibold shrink-0", color.text)}>
          {domainCode}
        </span>
        <span className="truncate">{getDomainFullLabel(domainCode)}</span>
      </span>
    );
  }

  if (grouping === "pattern") {
    const PatternIcon = PATTERN_ICONS[value] ?? Minus;
    return (
      <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
        <PatternIcon className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{getPatternLabel(value)}</span>
      </span>
    );
  }

  // Organ (default)
  return <span className="min-w-0 truncate font-semibold">{titleCase(value)}</span>;
}

// ─── Endpoint Row ──────────────────────────────────────────

const EndpointRow = forwardRef<HTMLDivElement, {
  endpoint: EndpointWithSignal;
  isSelected: boolean;
  onClick: () => void;
}>(function EndpointRow({ endpoint, isSelected, onClick }, ref) {
  const dirColor = getDirectionColor(endpoint.direction);
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
        <span className={cn("shrink-0 text-[10px]", dirColor)}>{dirSymbol}</span>
        <PatternGlyph pattern={endpoint.pattern} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-left text-xs" title={endpoint.endpoint_label}>
          {endpoint.endpoint_label}
        </span>
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", sevColor)} />
        {endpoint.treatmentRelated && (
          <span className="shrink-0 text-[9px] font-medium text-muted-foreground">TR</span>
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
