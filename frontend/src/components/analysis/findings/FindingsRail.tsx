/**
 * FindingsRail — hierarchical navigation rail for findings-aware views.
 * Shows signal summary, group cards, and endpoint rows with signal scoring.
 *
 * Mounts on: Findings view (Stage 1), Dose-Response view (Stage 5).
 */

import { useState, useMemo, useCallback, useRef, useEffect, forwardRef } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import {
  ChevronDown,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  CornerRightUp,
  CornerRightDown,
  Activity,
  Minus,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFindingsAnalyticsLocal } from "@/hooks/useFindingsAnalyticsLocal";
import { getEffectSizeLabel } from "@/lib/stat-method-transforms";
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
  getSignalTier,
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
import { getClinicalFloor } from "@/lib/lab-clinical-catalog";
import type { ConfidenceLevel } from "@/lib/endpoint-confidence";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";
import { NORM_MODE_SHORT, NORM_TIER_COLOR } from "@/lib/organ-weight-normalization";
import { formatPValue, titleCase, getDirectionSymbol } from "@/lib/severity-colors";
import { PatternGlyph } from "@/components/ui/PatternGlyph";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterSearch, FilterSelect, FilterMultiSelect } from "@/components/ui/FilterBar";

// ─── Props ─────────────────────────────────────────────────

/** Payload sent from rail to view — the rail is the single source of truth for filtering. */
export interface RailVisibleState {
  labels: string[];
  scopeLabel: string | null;
  scopeType: GroupingMode | null;
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
  /** Endpoints excluded from the scatter plot (double-click to hide). */
  excludedEndpoints?: ReadonlySet<string>;
  /** Callback to restore an excluded endpoint back to the scatter plot. */
  onRestoreEndpoint?: (label: string) => void;
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
  excludedEndpoints,
  onRestoreEndpoint,
}: FindingsRailProps) {
  // Shared analytics derivation — single source of truth
  const { analytics, isLoading, error } = useFindingsAnalyticsLocal(studyId);
  const { endpoints: endpointSummaries, syndromes, labMatches } = analytics;

  // ── Local state ────────────────────────────────────────
  // Grouping & sort persist across view navigations (user preference)
  const [grouping, setGrouping] = useSessionState<GroupingMode>("pcc.findings.rail.grouping", "syndrome");
  const [sortMode, setSortMode] = useSessionState<SortMode>("pcc.findings.rail.sort", "signal");
  // Filters & expanded state are study-specific — reset on study change
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [railFilters, setRailFilters] = useState<RailFilters>(EMPTY_RAIL_FILTERS);

  // Reset study-specific state on study change (grouping/sort persist)
  const prevStudyRef = useRef(studyId);
  useEffect(() => {
    if (studyId !== prevStudyRef.current) {
      prevStudyRef.current = studyId;
      setExpanded(new Set());
      setRailFilters(EMPTY_RAIL_FILTERS);
    }
  }, [studyId]);

  // ── Rail-specific derived data ──────
  const endpointsWithSignal = useMemo(
    () => withSignalScores(endpointSummaries),
    [endpointSummaries],
  );

  // Multi-syndrome index: endpoint_label → list of syndrome IDs
  const multiSyndromeIndex = useMemo(
    () => buildMultiSyndromeIndex(syndromes),
    [syndromes],
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

  // Clinical tier per endpoint (S2+ only) — for badge display in rail endpoint rows
  const clinicalTierMap = useMemo(() => {
    const map = new Map<string, string>(); // endpoint_label -> tier (S2, S3, S4)
    const sevOrder: Record<string, number> = { S4: 4, S3: 3, S2: 2, S1: 1 };
    for (const match of labMatches) {
      if (sevOrder[match.severity] < 2) continue; // S1 = too noisy
      for (const epLabel of match.matchedEndpoints) {
        const existing = map.get(epLabel);
        if (!existing || sevOrder[match.severity] > sevOrder[existing]) {
          map.set(epLabel, match.severity);
        }
      }
    }
    return map;
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
      scopeType: activeGroupScope?.type ?? null,
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
      const firstKey = grouping === "finding" ? "__all_endpoints__" : sortedCards[0].key;
      setExpanded(new Set([firstKey]));
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

  const handleCardSelect = useCallback((card: GroupCard) => {
    // Always scope to clicked group (no toggle-off)
    onGroupScopeChange?.({ type: grouping, value: card.key });
    // Auto-expand selected group so endpoints are visible
    setExpanded((prev) => new Set(prev).add(card.key));
  }, [grouping, onGroupScopeChange]);

  const handleCardToggleExpand = useCallback((card: GroupCard) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(card.key)) next.delete(card.key);
      else next.add(card.key);
      return next;
    });
  }, []);

  const handleEndpointClick = useCallback((endpointLabel: string) => {
    // Always select (no toggle-off)
    onEndpointSelect?.(endpointLabel);
  }, [onEndpointSelect]);

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
          /* Single "All endpoints" group card wrapping the flat endpoint list */
          <AllEndpointsCard
            isExpanded={expanded.has("__all_endpoints__")}
            totalEndpoints={filteredEndpoints.length}
            adverseCount={signalSummary.adverseCount}
            trCount={signalSummary.trCount}
            showFilteredCount={railIsFiltered}
            unfilteredTotal={endpointsWithSignal.length}
            onToggleExpand={() => setExpanded((prev) => {
              const next = new Set(prev);
              if (next.has("__all_endpoints__")) next.delete("__all_endpoints__");
              else next.add("__all_endpoints__");
              return next;
            })}
          >
            {sortedCards.flatMap((card) =>
              card.endpoints.map((ep) => (
                <EndpointRow
                  key={ep.endpoint_label}
                  endpoint={ep}
                  isSelected={activeEndpoint === ep.endpoint_label}
                  isExcluded={excludedEndpoints?.has(ep.endpoint_label)}
                  onClick={() => handleEndpointClick(ep.endpoint_label)}
                  onRestore={onRestoreEndpoint}
                  ref={(el) => registerEndpointRef(ep.endpoint_label, el)}
                  clinicalTier={clinicalTierMap.get(ep.endpoint_label)}
                  effectSizeLabel={getEffectSizeLabel(analytics.activeEffectSizeMethod ?? "hedges-g")}
                />
              ))
            )}
          </AllEndpointsCard>
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
              onHeaderSelect={() => handleCardSelect(card)}
              onToggleExpand={() => handleCardToggleExpand(card)}
              onEndpointClick={handleEndpointClick}
              registerEndpointRef={registerEndpointRef}
              multiSyndromeIndex={grouping === "syndrome" ? multiSyndromeIndex : undefined}
              currentSyndromeId={grouping === "syndrome" ? card.key : undefined}
              excludedEndpoints={excludedEndpoints}
              onRestoreEndpoint={onRestoreEndpoint}
              clinicalTierMap={clinicalTierMap}
              effectSizeLabel={getEffectSizeLabel(analytics.activeEffectSizeMethod ?? "hedges-g")}
              normalizationContexts={analytics.normalizationContexts}
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

// ─── All Endpoints Card ──────────────────────────────────────

function AllEndpointsCard({
  isExpanded,
  totalEndpoints,
  adverseCount,
  trCount,
  showFilteredCount,
  unfilteredTotal,
  onToggleExpand,
  children,
}: {
  isExpanded: boolean;
  totalEndpoints: number;
  adverseCount: number;
  trCount: number;
  showFilteredCount: boolean;
  unfilteredTotal: number;
  onToggleExpand: () => void;
  children: React.ReactNode;
}) {
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <div>
      <div
        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors border-l-2 border-primary bg-accent/50"
        role="button"
        tabIndex={0}
        onClick={onToggleExpand}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleExpand(); } }}
      >
        <span className="min-w-0 truncate font-semibold">All endpoints</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {showFilteredCount ? `${totalEndpoints}/${unfilteredTotal}` : adverseCount}
        </span>
        <span className="text-muted-foreground/40">&middot;</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {trCount}
        </span>
        <button
          className="ml-1 shrink-0 rounded p-0.5 hover:bg-accent/60 transition-colors"
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse endpoints" : "Expand endpoints"}
        >
          <Chevron className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>
      {isExpanded && children}
    </div>
  );
}

// ─── Grouping Toggle ───────────────────────────────────────

const PATTERN_ICONS: Record<string, typeof TrendingUp> = {
  monotonic_increase: TrendingUp,
  monotonic_decrease: TrendingDown,
  threshold_increase: CornerRightUp,
  threshold_decrease: CornerRightDown,
  threshold: CornerRightUp,  // backward compat
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
          <option value="finding">Group: Endpoint</option>
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

// NORM_MODE_SHORT and NORM_TIER_COLOR imported from organ-weight-normalization.ts

/** Highest normalization tier across dose groups for an organ.
 *  card.key is organ_system (lowercase); NormalizationContext.organ is SEND specimen (uppercase). */
function computeOrganNormSummary(
  organKey: string,
  contexts: NormalizationContext[],
): { tier: number; mode: string; modeShort: string } | null {
  const key = organKey.toUpperCase();
  let bestTier = 0;
  let bestMode = "absolute";
  for (const ctx of contexts) {
    if (ctx.organ === key && ctx.tier > bestTier) {
      bestTier = ctx.tier;
      bestMode = ctx.activeMode;
    }
  }
  if (bestTier < 2) return null; // Only show indicator for tier >= 2
  return { tier: bestTier, mode: bestMode, modeShort: NORM_MODE_SHORT[bestMode] ?? bestMode };
}

/** Best integrated confidence across TR endpoints in a group (organ mode).
 *  Non-TR endpoints are excluded — their low statistical confidence is expected
 *  and doesn't reflect organ evidence quality. */
function computeOrganConfidence(endpoints: EndpointWithSignal[]): { level: ConfidenceLevel; limitingFactors: string[] } | null {
  const ORDER: Record<ConfidenceLevel, number> = { high: 2, moderate: 1, low: 0 };
  let best: ConfidenceLevel | null = null;
  const factors = new Set<string>();
  for (const ep of endpoints) {
    const eci = ep.endpointConfidence;
    if (!eci || !ep.treatmentRelated) continue;
    const level = eci.integrated.integrated;
    if (best === null || ORDER[level] > ORDER[best]) best = level;
    if (eci.integrated.limitingFactor !== "None" && level !== "high") {
      factors.add(eci.integrated.limitingFactor);
    }
  }
  if (best === null) return null;
  return { level: best, limitingFactors: [...factors] };
}

function CardSection({
  card,
  grouping,
  isExpanded,
  isScoped,
  activeEndpoint,
  unfilteredTotal,
  showFilteredCount,
  onHeaderSelect,
  onToggleExpand,
  onEndpointClick,
  registerEndpointRef,
  multiSyndromeIndex,
  currentSyndromeId,
  excludedEndpoints,
  onRestoreEndpoint,
  clinicalTierMap,
  effectSizeLabel,
  normalizationContexts,
}: {
  card: GroupCard;
  grouping: GroupingMode;
  isExpanded: boolean;
  isScoped: boolean;
  activeEndpoint: string | null;
  unfilteredTotal: number;
  showFilteredCount: boolean;
  onHeaderSelect: () => void;
  onToggleExpand: () => void;
  onEndpointClick: (label: string) => void;
  registerEndpointRef: (label: string, el: HTMLElement | null) => void;
  multiSyndromeIndex?: Map<string, string[]>;
  currentSyndromeId?: string;
  excludedEndpoints?: ReadonlySet<string>;
  onRestoreEndpoint?: (label: string) => void;
  clinicalTierMap?: Map<string, string>;
  effectSizeLabel?: string;
  normalizationContexts?: NormalizationContext[];
}) {
  // Compute organ confidence only for organ grouping mode
  const organConf = grouping === "organ"
    ? computeOrganConfidence(card.endpoints)
    : null;

  // Compute normalization summary for organ grouping mode (highest tier across dose groups)
  const organNorm = grouping === "organ" && normalizationContexts
    ? computeOrganNormSummary(card.key, normalizationContexts)
    : null;

  return (
    <div>
      <CardHeader
        card={card}
        grouping={grouping}
        isExpanded={isExpanded}
        isScoped={isScoped}
        unfilteredTotal={unfilteredTotal}
        showFilteredCount={showFilteredCount}
        onSelect={onHeaderSelect}
        onToggleExpand={onToggleExpand}
        organConfidence={organConf}
        organNorm={organNorm}
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
                isExcluded={excludedEndpoints?.has(ep.endpoint_label)}
                onClick={() => onEndpointClick(ep.endpoint_label)}
                onRestore={onRestoreEndpoint}
                ref={(el) => registerEndpointRef(ep.endpoint_label, el)}
                otherSyndromes={otherSyndromes}
                clinicalTier={clinicalTierMap?.get(ep.endpoint_label)}
                effectSizeLabel={effectSizeLabel}
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
  onSelect,
  onToggleExpand,
  organConfidence,
  organNorm,
}: {
  card: GroupCard;
  grouping: GroupingMode;
  isExpanded: boolean;
  isScoped: boolean;
  unfilteredTotal: number;
  showFilteredCount: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  organConfidence?: { level: ConfidenceLevel; limitingFactors: string[] } | null;
  organNorm?: { tier: number; mode: string; modeShort: string } | null;
}) {
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors",
        isScoped
          ? "border-l-2 border-primary bg-accent/50"
          : "hover:bg-accent/30",
      )}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
    >
      <CardLabel grouping={grouping} value={card.key} syndromeLabel={grouping === "syndrome" ? card.label : undefined} organConfidence={organConfidence} organNorm={organNorm} />
      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
        {showFilteredCount ? `${card.totalEndpoints}/${unfilteredTotal}` : card.adverseCount}
      </span>
      <span className="text-muted-foreground/40">&middot;</span>
      <span className="font-mono text-[10px] text-muted-foreground">
        {card.trCount}
      </span>
      <button
        className="ml-1 shrink-0 rounded p-0.5 hover:bg-accent/60 transition-colors"
        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
        aria-expanded={isExpanded}
        aria-label={isExpanded ? "Collapse group" : "Expand group"}
      >
        <Chevron className="h-3 w-3 text-muted-foreground" />
      </button>
    </div>
  );
}

// ─── Card Label Variants ───────────────────────────────────

const RAG_COLOR: Record<ConfidenceLevel, string> = {
  high: "#10B981",
  moderate: "#F59E0B",
  low: "#EF4444",
};

const CONF_SHORT: Record<ConfidenceLevel, string> = {
  high: "High",
  moderate: "Med",
  low: "Low",
};

function CardLabel({ grouping, value, syndromeLabel, organConfidence, organNorm }: {
  grouping: GroupingMode;
  value: string;
  syndromeLabel?: string;
  organConfidence?: { level: ConfidenceLevel; limitingFactors: string[] } | null;
  organNorm?: { tier: number; mode: string; modeShort: string } | null;
}) {
  if (grouping === "domain") {
    const domainCode = value.toUpperCase();
    return (
      <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
        <span className="text-[9px] font-semibold shrink-0 text-muted-foreground">
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

  // Organ (default) — with confidence label + normalization indicator
  const tooltipLines = [titleCase(value)];
  if (organConfidence) {
    tooltipLines.push(`Confidence: ${organConfidence.level}`);
    if (organConfidence.limitingFactors.length > 0) {
      tooltipLines.push(`Limited by: ${organConfidence.limitingFactors.join(", ")}`);
    }
  }
  if (organNorm) {
    tooltipLines.push(`Normalization: ${organNorm.mode} (Tier ${organNorm.tier})`);
  }

  return (
    <span className="flex min-w-0 items-center gap-1.5 font-semibold" title={tooltipLines.join("\n")}>
      <span className="truncate">{titleCase(value)}</span>
      {organConfidence && (
        <span
          className="shrink-0 text-[9px] font-medium text-muted-foreground pb-px"
          style={{ borderBottom: `1.5px dashed ${RAG_COLOR[organConfidence.level]}` }}
        >
          Conf: {CONF_SHORT[organConfidence.level]}
        </span>
      )}
      {organNorm && (
        <span
          className="shrink-0 text-[9px] font-medium text-muted-foreground pb-px"
          style={{ borderBottom: `1.5px dashed ${NORM_TIER_COLOR[organNorm.tier] ?? "#9ca3af"}` }}
        >
          Norm: {organNorm.modeShort}
        </span>
      )}
    </span>
  );
}


// ─── Endpoint Row ──────────────────────────────────────────

/** Severity label for pipe tooltip */
function sevLabel(s: string): string {
  return s === "adverse" ? "Adverse" : s === "warning" ? "Warning" : "Normal";
}

/** Compact effect size: drop leading zero (.62 instead of 0.62) */
function formatEffectCompact(d: number): string {
  const s = d.toFixed(2);
  if (s.startsWith("0.")) return s.slice(1);     // "0.62" → ".62"
  if (s.startsWith("-0.")) return "-" + s.slice(2); // "-0.62" → "-.62"
  return s; // "1.24" stays as-is
}

/** Effect size → typographic weight (bigger effect = heavier type) */
function effectTypography(d: number | null): string {
  if (d === null) return "text-muted-foreground";
  const abs = Math.abs(d);
  if (abs >= 0.8) return "font-semibold text-foreground";
  if (abs >= 0.5) return "font-medium text-foreground/80";
  return "text-muted-foreground";
}

const EndpointRow = forwardRef<HTMLButtonElement, {
  endpoint: EndpointWithSignal;
  isSelected: boolean;
  isExcluded?: boolean;
  onClick: () => void;
  onRestore?: (label: string) => void;
  otherSyndromes?: string[];
  clinicalTier?: string;
  effectSizeLabel?: string;
}>(function EndpointRow({ endpoint, isSelected, isExcluded, onClick, onRestore, otherSyndromes, clinicalTier, effectSizeLabel }, ref) {
  // Pipe weight from signal tier (matches FindingsTable severity column)
  const tier = getSignalTier(endpoint.signal);
  const isNormal = endpoint.worstSeverity === "normal";
  const pipeWeight = isNormal ? "border-l" : tier === 3 ? "border-l-4" : tier === 2 ? "border-l-2" : "border-l";
  // Greyscale pipe — color encodes severity class, width encodes signal strength
  const pipeColor = endpoint.worstSeverity === "adverse" ? "#4B5563" : endpoint.worstSeverity === "warning" ? "#D1D5DB" : "transparent";
  const tierLabel = tier === 3 ? "strong" : tier === 2 ? "moderate" : "weak";
  const pipeTooltip = isNormal ? "Normal" : `${sevLabel(endpoint.worstSeverity)} · ${tierLabel} signal`;

  return (
    <button
      ref={ref}
      className={cn(
        "flex w-full flex-col cursor-pointer transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/30",
      )}
      onClick={onClick}
      aria-selected={isSelected}
    >
      {/* Line 1: Name + right-aligned key signals (tier → TR → d → pattern) */}
      <div className="flex w-full items-center gap-1 px-3 py-1 pl-6">
        {isExcluded && (
          <span
            role="button"
            tabIndex={0}
            className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground"
            title="Restore to scatter plot"
            onClick={(e) => { e.stopPropagation(); onRestore?.(endpoint.endpoint_label); }}
          >
            <EyeOff className="h-3 w-3" />
          </span>
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-left text-xs pl-1.5",
            pipeWeight,
            isExcluded && "text-muted-foreground/50",
          )}
          style={{ borderLeftColor: pipeColor }}
          title={`${endpoint.endpoint_label}\n${pipeTooltip}`}
        >
          {endpoint.endpoint_label}
        </span>
        {/* Clinical tier — sentinel safety marker */}
        {clinicalTier && (
          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-200" title={`Clinical tier ${clinicalTier} — sentinel safety biomarker (regulatory significance)`}>
            {clinicalTier}
          </span>
        )}
        {/* TR — treatment-related assignment */}
        {endpoint.treatmentRelated && (
          <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 border border-gray-200" title="Treatment-related — assigned by study pathologist">
            TR
          </span>
        )}
        {/* Effect size — typographic weight encodes magnitude */}
        <span
          className={cn("w-6 shrink-0 text-right font-mono text-[10px]", effectTypography(endpoint.maxEffectSize))}
          title={endpoint.maxEffectSize !== null ? `${effectSizeLabel ?? "Hedges\u2019 g"} = ${endpoint.maxEffectSize.toFixed(3)}\nLargest effect size across all dose groups and sexes` : undefined}
        >
          {endpoint.maxEffectSize !== null ? formatEffectCompact(endpoint.maxEffectSize) : ""}
        </span>
        {/* Dose-response pattern (overall — follows strongest signal row) */}
        <span className="shrink-0" title={(() => {
          const base = `Dose-response pattern: ${getPatternLabel(endpoint.pattern)}`;
          const bySex = endpoint.bySex;
          const hasDivergence = bySex && bySex.size >= 2 && new Set([...bySex.values()].map(s => s.pattern)).size > 1;
          return hasDivergence
            ? `${base}\nPer-sex breakdown shown below — trends differ between sexes`
            : `${base}\nSame pattern for both sexes`;
        })()}>
          <PatternGlyph pattern={endpoint.pattern} className="text-muted-foreground" />
        </span>
      </div>

      {/* Line 2: Supporting evidence (p-value, domain, syndromes left — per-sex trends right-aligned under line 1 glyph) */}
      <div className="flex items-center gap-2 px-3 pb-1.5 pt-0.5 pl-8 text-[10px] text-muted-foreground">
        {endpoint.minPValue !== null && (
          <span className="font-mono" title={`p = ${endpoint.minPValue.toExponential(2)}\nMost significant p-value across all dose groups and sexes`}>
            p{formatPValue(endpoint.minPValue)}
          </span>
        )}
        <span className="font-mono" title={`SEND domain: ${getDomainFullLabel(endpoint.domain)}`}>{endpoint.domain.toUpperCase()}</span>
        {otherSyndromes && otherSyndromes.length > 0 && (
          <span className="text-[8px] text-muted-foreground/50" title={`Also in syndromes: ${otherSyndromes.join(", ")}`}>
            {otherSyndromes.map((id) => `+${id}`).join(" ")}
          </span>
        )}
        {/* Per-sex pattern divergence — right-aligned under line 1 pattern glyph */}
        {(() => {
          const bySex = endpoint.bySex;
          if (bySex && bySex.size >= 2) {
            const patterns = [...bySex.values()].map(s => s.pattern);
            if (new Set(patterns).size > 1) {
              // Sort so the sex matching the overall pattern is rightmost (under line 1 glyph)
              const sorted = [...bySex.entries()].sort(([, a], [, b]) => {
                const aMatch = a.pattern === endpoint.pattern ? 1 : 0;
                const bMatch = b.pattern === endpoint.pattern ? 1 : 0;
                return aMatch - bMatch;
              });
              return (
                <span className="ml-auto inline-flex items-center gap-1.5">
                  {sorted.map(([sex, s]) => (
                    <span key={sex} className="inline-flex items-center gap-0.5" title={`${sex === "M" ? "Males" : sex === "F" ? "Females" : sex}: ${getPatternLabel(s.pattern)} ${getDirectionSymbol(s.direction)}`}>
                      <span className="font-mono text-[9px]">{sex}</span>
                      <PatternGlyph pattern={s.pattern} className="text-muted-foreground/70" />
                    </span>
                  ))}
                </span>
              );
            }
          }
          return null;
        })()}
      </div>
    </button>
  );
});
