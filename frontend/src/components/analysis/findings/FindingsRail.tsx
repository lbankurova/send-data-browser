/**
 * FindingsRail — hierarchical navigation rail for findings-aware views.
 * Shows signal summary, group cards, and endpoint rows with signal scoring.
 *
 * Mounts on: Findings view (Stage 1), Dose-Response view (Stage 5).
 */

import { useState, useMemo, useCallback, useRef, useEffect, forwardRef } from "react";
import { useSessionState, isOneOf } from "@/hooks/useSessionState";
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
  Info,
  Fingerprint,
  ChevronsUpDown,
  ChevronsDownUp,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useFindingsAnalyticsResult } from "@/contexts/FindingsAnalyticsContext";
import { usePrefetchFindingContext } from "@/hooks/usePrefetchFindingContext";
import {
  withSignalScores,
  computeSignalSummary,
  groupEndpoints,
  groupEndpointsBySyndrome,
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
import { titleCase, formatDoseShortLabel } from "@/lib/severity-colors";
import { Skeleton } from "@/components/ui/skeleton";
import { FilterSearch, FilterSelect, FilterMultiSelect } from "@/components/ui/FilterBar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { useSyndromeCorrelationSummaries } from "@/hooks/useSyndromeCorrelationSummaries";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import type { StudyMortality } from "@/types/mortality";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useTargetOrganSummary } from "@/hooks/useTargetOrganSummary";
import type { SyndromeCorrelationSummary } from "@/types/analysis";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";

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
  /** Domain of the active endpoint (for multi-domain endpoints like MI + MA). */
  activeDomain?: string;
  /** Callback when a group card is clicked (for table filtering). */
  onGroupScopeChange?: (scope: { type: GroupingMode; value: string } | null) => void;
  /** Callback when an endpoint row is clicked (for table filtering + context panel). */
  onEndpointSelect?: (endpointLabel: string | null, domain?: string) => void;
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
  activeDomain,
  onGroupScopeChange,
  onEndpointSelect,
  onGroupingChange,
  onVisibleEndpointsChange,
  excludedEndpoints,
  onRestoreEndpoint,
}: FindingsRailProps) {
  // Analytics from Layout-level provider — single derivation shared across view, rail, and context panel
  const { analytics, activeFindings, isLoading, error } = useFindingsAnalyticsResult();
  const { endpoints: endpointSummaries, syndromes, labMatches } = analytics;

  // Mortality data for rail header
  const { data: mortalityData } = useStudyMortality(studyId);
  const { data: targetOrgans } = useTargetOrganSummary(studyId);
  // Scheduled-only toggle moved to MethodologyPanel; mortality indicator now opens subject profile
  useScheduledOnly(); // keep hook call for context subscription

  // Target organ set for organ rail card badges
  const targetOrganSet = useMemo(() => {
    if (!targetOrgans) return new Set<string>();
    return new Set(targetOrgans.filter((t) => t.target_organ_flag).map((t) => t.organ_system));
  }, [targetOrgans]);

  // GAP-68: Eagerly fetch co-variation summaries for all syndromes in one batch request
  const { data: syndromeCovariation } = useSyndromeCorrelationSummaries(studyId, syndromes);

  // Prefetch finding context on endpoint hover
  const prefetchContext = usePrefetchFindingContext(studyId);
  const bestFindingIdByLabel = useMemo(() => {
    const map = new Map<string, string>();
    if (!activeFindings.length) return map;
    // Group findings by endpoint_label, pick best (min p-value, max |effect|)
    const grouped = new Map<string, typeof activeFindings>();
    for (const f of activeFindings) {
      const label = f.endpoint_label ?? f.finding;
      let arr = grouped.get(label);
      if (!arr) { arr = []; grouped.set(label, arr); }
      arr.push(f);
    }
    for (const [label, fArr] of grouped) {
      const best = fArr.reduce((b, f) => {
        const bP = b.min_p_adj ?? Infinity;
        const fP = f.min_p_adj ?? Infinity;
        if (fP < bP) return f;
        if (fP === bP && Math.abs(f.max_effect_size ?? 0) > Math.abs(b.max_effect_size ?? 0)) return f;
        return b;
      });
      map.set(label, best.id);
    }
    return map;
  }, [activeFindings]);
  const handleEndpointHover = useCallback((endpointLabel: string) => {
    const id = bestFindingIdByLabel.get(endpointLabel);
    if (id) prefetchContext(id);
  }, [bestFindingIdByLabel, prefetchContext]);

  // ── Local state ────────────────────────────────────────
  // Grouping & sort persist across view navigations (user preference)
  const [grouping, setGrouping] = useSessionState<GroupingMode>(
    "pcc.findings.rail.grouping", "finding",
    isOneOf(["organ", "finding", "syndrome", "specimen"] as const),
  );
  const [sortMode, setSortMode] = useSessionState<SortMode>(
    "pcc.findings.rail.sort", "signal",
    isOneOf(["signal", "pvalue", "effect", "az"] as const),
  );
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
      // Skip endpoints without specimen in specimen grouping mode
      if (grouping === "specimen" && !ep.specimen) continue;
      const key =
        grouping === "organ" ? ep.organ_system
        : grouping === "domain" ? ep.domain
        : grouping === "specimen" ? ep.specimen!
        : ep.pattern;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    // Sort by count descending
    const entries = [...seen.entries()].sort((a, b) => b[1] - a[1]);
    return entries.map(([key]) => ({
      key,
      label:
        grouping === "organ" ? titleCase(key)
        : grouping === "specimen" ? key.toUpperCase()
        : grouping === "domain" ? getDomainFullLabel(key)
        : getPatternLabel(key),
    }));
  }, [endpointsWithSignal, grouping, syndromes]);

  // Domain filter options — derived from unique domains in the dataset
  const domainFilterOptions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const ep of endpointsWithSignal) {
      seen.set(ep.domain, (seen.get(ep.domain) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => ({ key, label: getDomainFullLabel(key) }));
  }, [endpointsWithSignal]);

  // Pattern filter options — derived from unique patterns in the dataset
  const patternFilterOptions = useMemo(() => {
    const seen = new Map<string, number>();
    for (const ep of endpointsWithSignal) {
      seen.set(ep.pattern, (seen.get(ep.pattern) ?? 0) + 1);
    }
    return [...seen.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => ({ key, label: getPatternLabel(key) }));
  }, [endpointsWithSignal]);

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
      } else if (activeGroupScope.type === "specimen") {
        eps = eps.filter((ep) => ep.specimen === activeGroupScope.value);
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
    if (activeGroupScope.type === "specimen") return activeGroupScope.value.toUpperCase();
    return null;
  }, [activeGroupScope, syndromes]);

  const railFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (railFilters.trOnly) labels.push("TR only");
    if (railFilters.sigOnly) labels.push("Sig only");
    if (railFilters.clinicalS2Plus) labels.push("Clinical S2+");
    if (railFilters.domains) {
      const domLabels = [...railFilters.domains].map((d) => getDomainFullLabel(d));
      labels.push(domLabels.join(", "));
    }
    if (railFilters.pattern) {
      const patLabels = [...railFilters.pattern].map((p) => getPatternLabel(p));
      labels.push(patLabels.join(", "));
    }
    if (railFilters.severity) {
      const sevLabels = [...railFilters.severity].map((s) => s.charAt(0).toUpperCase() + s.slice(1));
      labels.push(sevLabels.join(", "));
    }
    if (railFilters.noaelRole) {
      labels.push(`NOAEL: ${railFilters.noaelRole}`);
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
    // Multi-domain endpoints use composite keys in endpointRefs
    const refKey = activeDomain ? `${activeEndpoint}\0${activeDomain}` : activeEndpoint;
    requestAnimationFrame(() => {
      const el = endpointRefs.current.get(refKey);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  }, [activeEndpoint, activeDomain, endpointToGroup]);

  // ── Navigation history (back/forward) ──────────────────
  type RailSnapshot = {
    grouping: GroupingMode;
    scope: { type: GroupingMode; value: string } | null;
    endpoint: string | null;
    domain: string | undefined;
    expanded: Set<string>;
  };

  const historyRef = useRef<{ stack: RailSnapshot[]; cursor: number }>({ stack: [], cursor: -1 });
  const isRestoringRef = useRef(false);
  const pendingFromRef = useRef<RailSnapshot | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);

  const takeSnapshot = useCallback((): RailSnapshot => ({
    grouping,
    scope: activeGroupScope ?? null,
    endpoint: activeEndpoint ?? null,
    domain: activeDomain,
    expanded: new Set(expanded),
  }), [grouping, activeGroupScope, activeEndpoint, activeDomain, expanded]);

  const snapshotsEqual = (a: RailSnapshot, b: RailSnapshot) =>
    a.grouping === b.grouping && a.endpoint === b.endpoint &&
    a.scope?.value === b.scope?.value && a.scope?.type === b.scope?.type;

  // Phase 1: called synchronously at start of navigation — captures "from" state
  const beginNavigation = useCallback(() => {
    if (isRestoringRef.current) return;
    pendingFromRef.current = takeSnapshot();
  }, [takeSnapshot]);

  // Phase 2: effect fires after state settles — pushes "from" + "to" onto stack
  useEffect(() => {
    const from = pendingFromRef.current;
    if (!from || isRestoringRef.current) return;
    pendingFromRef.current = null;

    const h = historyRef.current;
    const to = takeSnapshot();

    // Skip if state didn't actually change
    if (snapshotsEqual(from, to)) return;

    // Seed "from" if stack is empty or different from current top
    if (h.cursor < 0) {
      h.stack = [from];
      h.cursor = 0;
    } else if (!snapshotsEqual(h.stack[h.cursor], from)) {
      // Truncate forward history, push from
      h.stack = h.stack.slice(0, h.cursor + 1);
      h.stack.push(from);
      h.cursor = h.stack.length - 1;
    }

    // Truncate forward history, push "to"
    h.stack = h.stack.slice(0, h.cursor + 1);
    h.stack.push(to);
    if (h.stack.length > 50) { h.stack.shift(); }
    h.cursor = h.stack.length - 1;
    setHistoryVersion((v) => v + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouping, activeGroupScope, activeEndpoint]);

  const restoreSnapshot = useCallback((snap: RailSnapshot) => {
    isRestoringRef.current = true;
    setGrouping(snap.grouping);
    setExpanded(snap.expanded);
    onGroupScopeChange?.(snap.scope);
    onEndpointSelect?.(snap.endpoint, snap.domain);
    onGroupingChange?.(snap.grouping);
    setHistoryVersion((v) => v + 1);
    setTimeout(() => { isRestoringRef.current = false; }, 0);
  }, [onGroupScopeChange, onEndpointSelect, onGroupingChange]);

  const canGoBack = historyVersion >= 0 && historyRef.current.cursor > 0;
  const canGoForward = historyVersion >= 0 && historyRef.current.cursor < historyRef.current.stack.length - 1;

  const goBack = useCallback(() => {
    const h = historyRef.current;
    if (h.cursor <= 0) return;
    h.cursor--;
    restoreSnapshot(h.stack[h.cursor]);
  }, [restoreSnapshot]);

  const goForward = useCallback(() => {
    const h = historyRef.current;
    if (h.cursor >= h.stack.length - 1) return;
    h.cursor++;
    restoreSnapshot(h.stack[h.cursor]);
  }, [restoreSnapshot]);

  // ── Handlers ───────────────────────────────────────────
  const handleGroupingChange = useCallback((mode: GroupingMode) => {
    beginNavigation();
    setGrouping(mode);
    setExpanded(new Set());
    setRailFilters((prev) => ({ ...prev, groupFilter: null }));
    onGroupScopeChange?.(null);
    onEndpointSelect?.(null);
    onGroupingChange?.(mode);
  }, [beginNavigation,onGroupScopeChange, onEndpointSelect, onGroupingChange]);

  const handleCardSelect = useCallback((card: GroupCard) => {
    beginNavigation();
    // Always scope to clicked group (no toggle-off)
    onGroupScopeChange?.({ type: grouping, value: card.key });
    // Auto-expand selected group so endpoints are visible
    setExpanded((prev) => new Set(prev).add(card.key));
  }, [beginNavigation,grouping, onGroupScopeChange]);

  const handleCardToggleExpand = useCallback((card: GroupCard) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(card.key)) next.delete(card.key);
      else next.add(card.key);
      return next;
    });
  }, []);

  const handleEndpointClick = useCallback((endpointLabel: string, domain?: string) => {
    beginNavigation();
    // Always select (no toggle-off)
    onEndpointSelect?.(endpointLabel, domain);
  }, [beginNavigation,onEndpointSelect]);

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
      {/* Zone 1: Signal summary + mortality (fixed) */}
      <SignalSummarySection
        stats={signalSummary}
        mortalityData={mortalityData}
        grouping={grouping}
        hasSyndromes={syndromes.length > 0}
        onGroupingChange={handleGroupingChange}
      />

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
        domainFilterOptions={domainFilterOptions}
        patternFilterOptions={patternFilterOptions}
        hasClinicalEndpoints={clinicalEndpoints.size > 0}
        clinicalS2Plus={railFilters.clinicalS2Plus ?? false}
        onFiltersChange={setRailFilters}
        onSortChange={setSortMode}
        mostExpanded={grouping !== "finding" && sortedCards.length > 1 ? expanded.size > sortedCards.length / 2 : null}
        onToggleExpandAll={() => {
          if (expanded.size > sortedCards.length / 2) setExpanded(new Set());
          else setExpanded(new Set(sortedCards.map((c) => c.key)));
        }}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onGoBack={goBack}
        onGoForward={goForward}
      />

      {/* Zone 5: Card list (scrollable) */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {sortedCards.length === 0 && railIsFiltered && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No findings match current filters.
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
                  key={ep.domains ? `${ep.endpoint_label}\0${ep.domain}` : ep.endpoint_label}
                  endpoint={ep}
                  isSelected={activeEndpoint === ep.endpoint_label && (!ep.domains || activeDomain === ep.domain)}
                  isExcluded={excludedEndpoints?.has(ep.endpoint_label)}
                  onClick={() => handleEndpointClick(ep.endpoint_label, ep.domains ? ep.domain : undefined)}
                  onHover={() => handleEndpointHover(ep.endpoint_label)}
                  onRestore={onRestoreEndpoint}
                  ref={(el) => registerEndpointRef(ep.domains ? `${ep.endpoint_label}\0${ep.domain}` : ep.endpoint_label, el)}
                  clinicalTier={clinicalTierMap.get(ep.endpoint_label)}
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
              activeDomain={activeDomain}
              unfilteredTotal={unfilteredGroupTotals.get(card.key) ?? card.totalEndpoints}
              showFilteredCount={railIsFiltered}
              onHeaderSelect={() => handleCardSelect(card)}
              onToggleExpand={() => handleCardToggleExpand(card)}
              onSyndromeClick={(synId) => {
                beginNavigation();
                setGrouping("syndrome");
                setExpanded(new Set([synId]));
                setRailFilters((prev) => ({ ...prev, groupFilter: null }));
                onGroupScopeChange?.({ type: "syndrome", value: synId });
                onEndpointSelect?.(null);
                onGroupingChange?.("syndrome");
              }}
              onEndpointClick={handleEndpointClick}
              onEndpointHover={handleEndpointHover}
              registerEndpointRef={registerEndpointRef}
              excludedEndpoints={excludedEndpoints}
              onRestoreEndpoint={onRestoreEndpoint}
              clinicalTierMap={clinicalTierMap}
              normalizationContexts={analytics.normalizationContexts}
              syndromeCovariation={grouping === "syndrome" ? syndromeCovariation?.get(card.key) : undefined}
              syndromeConfidence={grouping === "syndrome" ? syndromes.find((s) => s.id === card.key)?.confidence : undefined}
              syndromes={grouping === "specimen" ? syndromes : undefined}
              isTargetOrgan={grouping === "organ" && targetOrganSet.has(card.key)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Signal Summary ────────────────────────────────────────

const GROUPING_TOGGLES: { value: GroupingMode; label: string; tooltip?: string; stub?: boolean }[] = [
  { value: "finding", label: "Endpoint" },
  { value: "specimen", label: "Specimen" },
  { value: "organ", label: "Organ Sys.", tooltip: "Group by organ system" },
  { value: "syndrome", label: "Syndrome" },
];

function SignalSummarySection({ stats, mortalityData, grouping, hasSyndromes, onGroupingChange }: {
  stats: SignalSummaryStats;
  mortalityData?: StudyMortality | null;
  grouping: GroupingMode;
  hasSyndromes: boolean;
  onGroupingChange: (mode: GroupingMode) => void;
}) {
  const { setSelectedSubject } = useViewSelection();
  const [deathDropdownOpen, setDeathDropdownOpen] = useState(false);
  const deathDropdownRef = useRef<HTMLDivElement>(null);

  // Close death dropdown on outside click
  useEffect(() => {
    if (!deathDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (deathDropdownRef.current && !deathDropdownRef.current.contains(e.target as Node)) setDeathDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [deathDropdownOpen]);

  const deaths = mortalityData?.deaths ?? [];
  const mainDeaths = deaths.filter(d => !d.is_recovery);
  const recovDeaths = deaths.filter(d => d.is_recovery);
  const totalDeaths = mainDeaths.length + recovDeaths.length;
  const [selectedDeaths, setSelectedDeaths] = useState<Set<string>>(new Set());
  const allDeathIds = useMemo(() => deaths.map(d => d.USUBJID), [deaths]);
  const allSelected = allDeathIds.length > 0 && allDeathIds.every(id => selectedDeaths.has(id));
  const someSelected = allDeathIds.some(id => selectedDeaths.has(id));
  const toggleDeath = (id: string) => setSelectedDeaths(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllDeaths = () => setSelectedDeaths(allSelected ? new Set() : new Set(allDeathIds));

  /** Truncate USUBJID: strip study prefix, keep last segment */
  const truncateId = (id: string) => {
    const parts = id.split("-");
    return parts.length > 1 ? `SUBJ-${parts[parts.length - 1]}` : id;
  };

  return (
    <div className="shrink-0 border-b px-3 pb-2 pt-3">
      {/* Grouping toggles — serves as rail title */}
      <div className="flex items-center gap-1">
        <div className="flex flex-wrap rounded bg-muted/50 p-0.5">
          {GROUPING_TOGGLES.filter(t => t.value !== "syndrome" || hasSyndromes).map((t) => (
            <button
              key={t.value}
              type="button"
              className={cn(
                "rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider transition-colors",
                grouping === t.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
                t.stub && "cursor-not-allowed opacity-30",
              )}
              onClick={() => { if (!t.stub) onGroupingChange(t.value); }}
              title={t.tooltip ?? `Group by ${t.label.toLowerCase()}`}
              disabled={t.stub}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <button className="ml-auto text-muted-foreground/40 hover:text-muted-foreground transition-colors" aria-label="How to read the findings rail">
              <Info className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-80 text-xs leading-relaxed">
            <div className="space-y-2">
              <p className="font-semibold text-foreground">How to read the findings rail</p>
              <p className="text-muted-foreground">
                Each row is one finding (measured variable) aggregated across both sexes. Severity, p-value,
                and effect size reflect the worst/strongest value across M and F.
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Left border</span> encodes signal
                strength: thick = strong, thin = weak. Red = adverse, amber = warning, invisible = normal.
              </p>
              <p className="text-muted-foreground">
                <span className="font-medium text-foreground">Click</span> a row to select it in the
                context panel. <span className="font-medium text-foreground">Group cards</span> scope
                the scatter plot and table to that group.
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Counts + mortality — compact, color-coded */}
      <div className="mt-1 flex items-center gap-2 text-[11px]">
        {grouping === "finding" ? (
          <>
            <span title={`${stats.adverseCount} endpoints classified as adverse`}>
              <span className="font-semibold" style={{ color: "#dc2626" }}>{stats.adverseCount}</span>
              <span className="text-muted-foreground"> adverse</span>
            </span>
            <span title={`${stats.warningCount} endpoints classified as warning`}>
              <span className="font-semibold" style={{ color: "#d97706" }}>{stats.warningCount}</span>
              <span className="text-muted-foreground"> warning</span>
            </span>
            <span className="text-muted-foreground" title={`${stats.totalEndpoints} total endpoints`}>
              {stats.totalEndpoints} endpoints
            </span>
          </>
        ) : (
          /* Reserve space for non-endpoint groupings — content TBD */
          <span className="text-muted-foreground">{stats.totalEndpoints} endpoints</span>
        )}

        {/* Mortality indicator */}
        {totalDeaths > 0 && (
          <div className="relative ml-auto" ref={deathDropdownRef}>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setDeathDropdownOpen(!deathDropdownOpen)}
              title={`${mainDeaths.length} main arm, ${recovDeaths.length} recovery arm`}
            >
              <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />
              <span>{totalDeaths} death{totalDeaths !== 1 ? "s" : ""}</span>
              <ChevronDown className={cn("h-3 w-3 transition-transform", deathDropdownOpen && "rotate-180")} />
            </button>

            {deathDropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[240px] rounded border bg-popover shadow-md">
                {/* Select all header */}
                <div className="flex items-center gap-1.5 border-b border-border/40 px-2 py-1">
                  <input
                    type="checkbox"
                    className="h-3 w-3 shrink-0 rounded border-gray-300"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={toggleAllDeaths}
                  />
                  <span className="text-[11px] font-medium text-muted-foreground" title="Click a name to view in Context Panel. Check boxes to select for comparison.">Select all</span>
                  <button
                    type="button"
                    className="ml-auto cursor-not-allowed text-[11px] text-muted-foreground/40"
                    title="Coming soon — open selected subjects in a comparison tab"
                    disabled
                  >
                    View in tab
                  </button>
                </div>
                {/* Death rows */}
                {[...mainDeaths.map(d => ({ ...d, armLabel: "main" as const })), ...recovDeaths.map(d => ({ ...d, armLabel: "recov." as const }))].map((d) => (
                  <div
                    key={d.USUBJID}
                    className="flex w-full items-center gap-1.5 px-2 py-1 hover:bg-accent/50"
                    title={`${d.disposition}${d.cause ? `, ${d.cause}` : ""} (day ${d.study_day ?? "?"})`}
                  >
                    <input
                      type="checkbox"
                      className="h-3 w-3 shrink-0 rounded border-gray-300"
                      checked={selectedDeaths.has(d.USUBJID)}
                      onChange={() => toggleDeath(d.USUBJID)}
                    />
                    <button
                      type="button"
                      className="text-left text-xs text-blue-600 hover:underline"
                      onClick={() => { setSelectedSubject(d.USUBJID); setDeathDropdownOpen(false); }}
                    >
                      {truncateId(d.USUBJID)} @ {formatDoseShortLabel(d.dose_label)} ({d.armLabel})
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
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
      <span className="text-muted-foreground">&middot; {endpointCount} findings</span>
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
        <span className="min-w-0 truncate font-semibold">All findings</span>
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {showFilteredCount ? `${totalEndpoints}/${unfilteredTotal}` : adverseCount}
        </span>
        <span className="text-muted-foreground/40">&middot;</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          {trCount}
        </span>
        <button
          className="ml-1 shrink-0 rounded p-0.5 hover:bg-accent/60 transition-colors"
          onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "Collapse findings" : "Expand findings"}
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
  specimen: "All specimens",
};

function RailFiltersSection({
  filters,
  sortMode,
  grouping,
  groupFilterOptions,
  domainFilterOptions,
  patternFilterOptions,
  hasClinicalEndpoints,
  clinicalS2Plus,
  onFiltersChange,
  onSortChange,
  mostExpanded,
  onToggleExpandAll,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
}: {
  filters: RailFilters;
  sortMode: SortMode;
  grouping: GroupingMode;
  groupFilterOptions: { key: string; label: string }[];
  domainFilterOptions: { key: string; label: string }[];
  patternFilterOptions: { key: string; label: string }[];
  hasClinicalEndpoints: boolean;
  clinicalS2Plus: boolean;
  onFiltersChange: (f: RailFilters) => void;
  onSortChange: (s: SortMode) => void;
  mostExpanded: boolean | null;
  onToggleExpandAll: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
}) {
  return (
    <div className="shrink-0 space-y-1.5 border-b bg-muted/30 px-4 py-2">
      {/* Row 1 (top — least used): Group filter + domain + pattern + severity */}
      <div className="flex flex-wrap items-center gap-1.5">
        {grouping !== "finding" && (
          <FilterMultiSelect
            options={groupFilterOptions}
            selected={filters.groupFilter}
            onChange={(next) => onFiltersChange({ ...filters, groupFilter: next })}
            allLabel={GROUPING_ALL_LABELS[grouping] ?? "All"}
          />
        )}
        <FilterMultiSelect
          options={domainFilterOptions}
          selected={filters.domains}
          onChange={(next) => onFiltersChange({ ...filters, domains: next })}
          allLabel="All domains"
        />
        <FilterMultiSelect
          options={patternFilterOptions}
          selected={filters.pattern}
          onChange={(next) => onFiltersChange({ ...filters, pattern: next })}
          allLabel="All patterns"
        />
        <FilterMultiSelect
          options={SEVERITY_OPTIONS}
          selected={filters.severity}
          onChange={(next) => onFiltersChange({ ...filters, severity: next })}
          allLabel="All classes"
        />
      </div>

      {/* Row 2 (middle): Quick toggles + NOAEL role + sort */}
      <div className="flex items-center gap-1.5">
        <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground" title="Treatment-related endpoints only">
          <input
            type="checkbox"
            checked={filters.trOnly}
            onChange={(e) => onFiltersChange({ ...filters, trOnly: e.target.checked })}
            className="h-3 w-3 rounded border-gray-300"
          />
          TR
        </label>
        <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground" title="Statistically significant (p < 0.05) endpoints only">
          <input
            type="checkbox"
            checked={filters.sigOnly}
            onChange={(e) => onFiltersChange({ ...filters, sigOnly: e.target.checked })}
            className="h-3 w-3 rounded border-gray-300"
          />
          Sig
        </label>
        {hasClinicalEndpoints && (
          <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground" title="Clinical severity grade 2 or higher">
            <input
              type="checkbox"
              checked={clinicalS2Plus}
              onChange={(e) => onFiltersChange({ ...filters, clinicalS2Plus: e.target.checked })}
              className="h-3 w-3 rounded border-gray-300"
            />
            S2+
          </label>
        )}
        <FilterSelect
          value={filters.noaelRole ?? ""}
          onChange={(e) => onFiltersChange({ ...filters, noaelRole: (e.target.value || null) as RailFilters["noaelRole"] })}
          title="Filter by NOAEL contribution role"
        >
          <option value="">NOAEL: All</option>
          <option value="determining">Determining</option>
          <option value="contributing">Contributing</option>
          <option value="supporting">Supporting</option>
          <option value="excluded">Excluded</option>
        </FilterSelect>
        <div className="w-[110px] shrink-0">
          <FilterSelect
            value={sortMode}
            onChange={(e) => onSortChange(e.target.value as SortMode)}
          >
            <option value="signal">Sort: Signal</option>
            <option value="pvalue">Sort: P-value</option>
            <option value="effect">Sort: Effect</option>
            <option value="az">Sort: A{"\u2013"}Z</option>
          </FilterSelect>
        </div>
      </div>

      {/* Row 3 (bottom — closest to cards): Search + back/forward + expand/collapse */}
      <div className="flex items-center gap-1.5">
        <FilterSearch
          value={filters.search}
          onChange={(v) => onFiltersChange({ ...filters, search: v })}
          placeholder="Search…"
        />
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className={cn("rounded p-0.5 transition-colors", canGoBack ? "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/40" : "text-muted-foreground/20 cursor-default")}
            title="Back"
            onClick={onGoBack}
            disabled={!canGoBack}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cn("rounded p-0.5 transition-colors", canGoForward ? "text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/40" : "text-muted-foreground/20 cursor-default")}
            title="Forward"
            onClick={onGoForward}
            disabled={!canGoForward}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {mostExpanded !== null && (
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground/60 hover:text-muted-foreground hover:bg-accent/40 transition-colors"
              title={mostExpanded ? "Collapse all groups" : "Expand all groups"}
              onClick={onToggleExpandAll}
            >
              {mostExpanded
                ? <ChevronsDownUp className="h-3.5 w-3.5" />
                : <ChevronsUpDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Group Card ────────────────────────────────────────────

// NORM_MODE_SHORT and NORM_TIER_COLOR imported from organ-weight-normalization.ts

/** Highest normalization tier across dose groups for organs in this card.
 *  Matches OM endpoint specimens against NormalizationContext.organ (both SEND specimen names). */
export function computeOrganNormSummary(
  endpoints: EndpointWithSignal[],
  contexts: NormalizationContext[],
): { tier: number; mode: string; modeShort: string } | null {
  // Collect unique OM specimens from this card's endpoints
  const omSpecimens = new Set<string>();
  for (const ep of endpoints) {
    if (ep.domain === "OM" && ep.specimen) omSpecimens.add(ep.specimen.toUpperCase());
  }
  if (omSpecimens.size === 0) return null;

  let bestTier = 0;
  let bestMode = "absolute";
  for (const ctx of contexts) {
    if (omSpecimens.has(ctx.organ) && ctx.tier > bestTier) {
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
    if (level !== "high") {
      for (const f of eci.integrated.limitingFactors) factors.add(f);
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
  activeDomain,
  unfilteredTotal,
  showFilteredCount,
  onHeaderSelect,
  onToggleExpand,
  onSyndromeClick,
  onEndpointClick,
  onEndpointHover,
  registerEndpointRef,
  excludedEndpoints,
  onRestoreEndpoint,
  clinicalTierMap,
  normalizationContexts,
  syndromeCovariation,
  syndromeConfidence,
  syndromes,
  isTargetOrgan,
}: {
  card: GroupCard;
  grouping: GroupingMode;
  isExpanded: boolean;
  isScoped: boolean;
  activeEndpoint: string | null;
  activeDomain?: string;
  unfilteredTotal: number;
  showFilteredCount: boolean;
  onHeaderSelect: () => void;
  onToggleExpand: () => void;
  onSyndromeClick?: (syndromeId: string) => void;
  onEndpointClick: (label: string, domain?: string) => void;
  onEndpointHover?: (label: string) => void;
  registerEndpointRef: (label: string, el: HTMLElement | null) => void;
  excludedEndpoints?: ReadonlySet<string>;
  onRestoreEndpoint?: (label: string) => void;
  clinicalTierMap?: Map<string, string>;
  normalizationContexts?: NormalizationContext[];
  syndromeCovariation?: SyndromeCorrelationSummary;
  syndromeConfidence?: "HIGH" | "MODERATE" | "LOW";
  syndromes?: CrossDomainSyndrome[];
  isTargetOrgan?: boolean;
}) {
  // Compute organ confidence only for organ grouping mode
  const organConf = grouping === "organ"
    ? computeOrganConfidence(card.endpoints)
    : null;

  // Compute normalization summary for organ grouping mode (highest tier across dose groups)
  const organNorm = grouping === "organ" && normalizationContexts
    ? computeOrganNormSummary(card.endpoints, normalizationContexts)
    : null;

  // NOAEL role dots for organ cards (max 3: determining, contributing, supporting)
  const noaelRoles = grouping === "organ" ? (() => {
    let det = 0, cont = 0, sup = 0;
    for (const ep of card.endpoints) {
      const label = ep.endpointConfidence?.noaelContribution?.label;
      if (label === "determining") det++;
      else if (label === "contributing") cont++;
      else if (label === "supporting") sup++;
    }
    return { determining: det, contributing: cont, supporting: sup };
  })() : null;

  // Specimen data for specimen grouping mode
  const specimenData = useMemo(() => {
    if (grouping !== "specimen") return null;
    // Find all syndromes containing any endpoint from this card
    const matched = syndromes?.filter((s) =>
      s.matchedEndpoints.some((m) =>
        card.endpoints.some((ep) => ep.endpoint_label === m.endpoint_label),
      ),
    ) ?? [];
    return {
      endpoints: card.endpoints,
      syndromes: matched.map(s => ({ name: s.name, id: s.id })),
      // Backward compat for CardLabel
      syndromeName: matched[0]?.name,
      syndromeId: matched[0]?.id,
    };
  }, [grouping, card.endpoints, syndromes]);

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
        onSyndromeClick={onSyndromeClick}
        organConfidence={organConf}
        organNorm={organNorm}
        noaelRoles={noaelRoles}
        isTargetOrgan={isTargetOrgan}
        syndromeCovariation={syndromeCovariation}
        syndromeConfidence={syndromeConfidence}
        specimenData={specimenData}
      />
      {isExpanded && (
        <div>
          {card.endpoints.map((ep) => {
            return (
              <EndpointRow
                key={ep.domains ? `${ep.endpoint_label}\0${ep.domain}` : ep.endpoint_label}
                endpoint={ep}
                isSelected={activeEndpoint === ep.endpoint_label && (!ep.domains || activeDomain === ep.domain)}
                isExcluded={excludedEndpoints?.has(ep.endpoint_label)}
                onClick={() => onEndpointClick(ep.endpoint_label, ep.domains ? ep.domain : undefined)}
                onHover={onEndpointHover ? () => onEndpointHover(ep.endpoint_label) : undefined}
                onRestore={onRestoreEndpoint}
                ref={(el) => registerEndpointRef(ep.domains ? `${ep.endpoint_label}\0${ep.domain}` : ep.endpoint_label, el)}
                clinicalTier={clinicalTierMap?.get(ep.endpoint_label)}
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
  onSyndromeClick,
  organConfidence,
  organNorm,
  noaelRoles,
  isTargetOrgan,
  syndromeCovariation,
  syndromeConfidence,
  specimenData,
}: {
  card: GroupCard;
  grouping: GroupingMode;
  isExpanded: boolean;
  isScoped: boolean;
  unfilteredTotal: number;
  showFilteredCount: boolean;
  onSelect: () => void;
  onToggleExpand: () => void;
  onSyndromeClick?: (syndromeId: string) => void;
  organConfidence?: { level: ConfidenceLevel; limitingFactors: string[] } | null;
  organNorm?: { tier: number; mode: string; modeShort: string } | null;
  noaelRoles?: { determining: number; contributing: number; supporting: number } | null;
  isTargetOrgan?: boolean;
  syndromeCovariation?: SyndromeCorrelationSummary;
  syndromeConfidence?: "HIGH" | "MODERATE" | "LOW";
  specimenData?: { endpoints: EndpointWithSignal[]; syndromes: { name: string; id: string }[]; syndromeName?: string; syndromeId?: string } | null;
}) {
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  // Specimen mode: pipe encodes worst severity across all findings
  const specimenPipeColor = grouping === "specimen"
    ? (card.adverseCount > 0
      ? "#dc2626"
      : card.endpoints.some((ep) => ep.worstSeverity === "warning")
        ? "#facc15"
        : "transparent")
    : undefined;

  return (
    <div
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors",
        isScoped
          ? "border-l-2 border-primary bg-accent/50"
          : "hover:bg-accent/30",
        grouping === "specimen" && !isScoped && specimenPipeColor !== "transparent" && "border-l-2",
      )}
      style={grouping === "specimen" && !isScoped && specimenPipeColor && specimenPipeColor !== "transparent" ? { borderLeftColor: specimenPipeColor } : undefined}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
    >
      <CardLabel grouping={grouping} value={card.key} syndromeLabel={grouping === "syndrome" ? card.label : undefined} organConfidence={organConfidence} organNorm={organNorm} syndromeCovariation={syndromeCovariation} syndromeConfidence={syndromeConfidence} specimenData={specimenData} />
      {/* NOAEL role dots + Target badge (organ mode only) */}
      {noaelRoles && (noaelRoles.determining > 0 || noaelRoles.contributing > 0 || noaelRoles.supporting > 0) && (
        <span className="shrink-0 flex items-center gap-0.5" title={[
          noaelRoles.determining > 0 ? `${noaelRoles.determining} determining` : null,
          noaelRoles.contributing > 0 ? `${noaelRoles.contributing} contributing` : null,
          noaelRoles.supporting > 0 ? `${noaelRoles.supporting} supporting` : null,
        ].filter(Boolean).join(", ")}>
          {noaelRoles.determining > 0 && <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ backgroundColor: "rgba(248,113,113,0.7)" }} />}
          {noaelRoles.contributing > 0 && <span className="inline-block h-[6px] w-[6px] rounded-full bg-gray-400" />}
          {noaelRoles.supporting > 0 && <span className="inline-block h-[6px] w-[6px] rounded-full border border-gray-400" />}
        </span>
      )}
      {isTargetOrgan && (
        <span className="shrink-0 rounded-sm border border-gray-200 bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-600">Target</span>
      )}
      {grouping === "specimen" ? (
        <span className="ml-auto shrink-0 flex flex-col items-end gap-0.5">
          {specimenData?.syndromes && specimenData.syndromes.length > 0 && (
            <div className="flex flex-col items-end gap-0.5">
              {specimenData.syndromes.map(syn => (
                <button
                  key={syn.id}
                  type="button"
                  className="flex items-center gap-0.5 text-[10px] text-primary hover:underline cursor-pointer"
                  title={`${syn.name}\nClick to view in syndrome grouping`}
                  onClick={(e) => { e.stopPropagation(); onSyndromeClick?.(syn.id); }}
                >
                  <Fingerprint className="size-2.5 shrink-0" />
                  <span className="truncate max-w-[120px]">{syn.name}</span>
                </button>
              ))}
            </div>
          )}
        </span>
      ) : (
        <>
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {showFilteredCount ? `${card.totalEndpoints}/${unfilteredTotal}` : card.adverseCount}
          </span>
          <span className="text-muted-foreground/40">&middot;</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {card.trCount}
          </span>
        </>
      )}
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

/** GAP-67: Adjust displayed syndrome confidence based on co-variation strength. */
function adjustSyndromeConfidence(
  confidence: "HIGH" | "MODERATE" | "LOW",
  covariation: SyndromeCorrelationSummary,
): { level: ConfidenceLevel; caveat: string | null } {
  const label = covariation.validation_label;
  if (label === "Strong co-variation") {
    // Strong co-variation can upgrade confidence one tier
    if (confidence === "MODERATE") return { level: "high", caveat: null };
    if (confidence === "LOW") return { level: "moderate", caveat: null };
    return { level: "high", caveat: null };
  }
  if (label === "Weak co-variation") {
    // Weak co-variation adds a caveat but doesn't downgrade
    const level = confidence.toLowerCase() as ConfidenceLevel;
    return { level, caveat: "Weak finding co-variation" };
  }
  // Moderate co-variation or insufficient data — no adjustment
  return { level: confidence.toLowerCase() as ConfidenceLevel, caveat: null };
}

function CardLabel({ grouping, value, syndromeLabel, organConfidence, organNorm, syndromeCovariation, syndromeConfidence, specimenData }: {
  grouping: GroupingMode;
  value: string;
  syndromeLabel?: string;
  organConfidence?: { level: ConfidenceLevel; limitingFactors: string[] } | null;
  organNorm?: { tier: number; mode: string; modeShort: string } | null;
  syndromeCovariation?: SyndromeCorrelationSummary;
  syndromeConfidence?: "HIGH" | "MODERATE" | "LOW";
  specimenData?: { endpoints: EndpointWithSignal[]; syndromes: { name: string; id: string }[]; syndromeName?: string; syndromeId?: string } | null;
}) {
  if (grouping === "domain") {
    const domainCode = value.toUpperCase();
    return (
      <span className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
        <span className="text-[10px] font-semibold shrink-0 text-muted-foreground">
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

    // GAP-67: Compute adjusted confidence
    const adjusted = !isNoSyndrome && syndromeConfidence && syndromeCovariation
      ? adjustSyndromeConfidence(syndromeConfidence, syndromeCovariation)
      : null;

    // GAP-66: Short co-variation label for the badge
    const covLabel = !isNoSyndrome && syndromeCovariation
      ? syndromeCovariation.validation_label.replace(" co-variation", "")
      : null;

    const tooltipLines = [label];
    if (adjusted) {
      tooltipLines.push(`Confidence: ${CONF_SHORT[adjusted.level]}${adjusted.caveat ? ` (${adjusted.caveat})` : ""}`);
    }
    if (covLabel && covLabel !== "Insufficient data") {
      tooltipLines.push(`Co-variation: ${covLabel}`);
    }

    return (
      <span className={cn("flex min-w-0 items-center gap-1.5 truncate font-semibold", isNoSyndrome && "text-muted-foreground/70")} title={tooltipLines.join("\n")}>
        {!isNoSyndrome && <Fingerprint className="size-3 shrink-0 text-muted-foreground" />}
        <span className="truncate">{label}</span>
        {adjusted && (
          <span
            className="shrink-0 text-[10px] font-medium text-muted-foreground pb-px"
            style={{ borderBottom: `1.5px dashed ${RAG_COLOR[adjusted.level]}` }}
          >
            {CONF_SHORT[adjusted.level]}
          </span>
        )}
        {covLabel && covLabel !== "Insufficient data" && (
          <span className="shrink-0 text-[10px] bg-gray-100 text-gray-600 border border-gray-200 rounded px-1 py-px">
            {covLabel}
          </span>
        )}
      </span>
    );
  }

  if (grouping === "specimen") {
    // Specimen card: name + domain badges (syndrome moved to CardHeader metric area)
    const specimenEndpoints = specimenData?.endpoints;
    const domains = specimenEndpoints
      ? [...new Set(specimenEndpoints.map((ep) => ep.domain))].sort()
      : [];

    return (
      <span className="flex min-w-0 flex-1 flex-col" title={value.toUpperCase()}>
        <span className="truncate font-semibold">{value.toUpperCase()}</span>
        {domains.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {domains.join(", ")}
          </span>
        )}
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
          className="shrink-0 text-[10px] font-medium text-muted-foreground pb-px"
          style={{ borderBottom: `1.5px dashed ${RAG_COLOR[organConfidence.level]}` }}
        >
          Conf: {CONF_SHORT[organConfidence.level]}
        </span>
      )}
      {organNorm && (
        <span
          className="shrink-0 text-[10px] font-medium text-muted-foreground pb-px"
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

const EndpointRow = forwardRef<HTMLButtonElement, {
  endpoint: EndpointWithSignal;
  isSelected: boolean;
  isExcluded?: boolean;
  onClick: () => void;
  onHover?: () => void;
  onRestore?: (label: string) => void;
  clinicalTier?: string;
}>(function EndpointRow({ endpoint, isSelected, isExcluded, onClick, onHover, onRestore, clinicalTier }, ref) {
  const tier = getSignalTier(endpoint.signal);
  const isNormal = endpoint.worstSeverity === "normal";
  const pipeWeight = isNormal ? "border-l" : tier === 3 ? "border-l-4" : tier === 2 ? "border-l-2" : "border-l";
  const pipeColor = endpoint.worstSeverity === "adverse" ? "#dc2626" : endpoint.worstSeverity === "warning" ? "#facc15" : "transparent";
  const tierLabel = tier === 3 ? "strong" : tier === 2 ? "moderate" : "weak";
  const pipeTooltip = isNormal ? "Normal" : `${sevLabel(endpoint.worstSeverity)} · ${tierLabel} signal`;

  // Sex divergence: directions differ OR patterns differ
  const bySex = endpoint.bySex;
  const sexesDiffer = bySex && bySex.size >= 2 && (() => {
    const vals = [...bySex.values()];
    const dirs = vals.map(s => s.direction).filter(d => d === "up" || d === "down");
    if (dirs.includes("up") && dirs.includes("down")) return true;
    return new Set(vals.map(s => s.pattern)).size > 1;
  })();

  return (
    <button
      ref={ref}
      className={cn(
        "flex w-full items-center cursor-pointer transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/30",
      )}
      onClick={onClick}
      onMouseEnter={onHover}
      aria-selected={isSelected}
    >
      <div className="flex w-full items-center gap-1 px-3 py-1.5 pl-6">
        {isExcluded && (
          <span role="button" tabIndex={0}
            className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground"
            title="Restore to scatter plot"
            onClick={(e) => { e.stopPropagation(); onRestore?.(endpoint.endpoint_label); }}>
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
          title={`${endpoint.endpoint_label}${endpoint.domains ? ` (${endpoint.domains.join(" · ")})` : ""}\n${pipeTooltip}`}
        >
          {endpoint.domains && (
            <span className="text-[10px] font-semibold text-muted-foreground mr-1">{endpoint.domain}</span>
          )}
          {endpoint.endpoint_label}
          {endpoint.qualifierTags && (
            <span className="text-muted-foreground"> &mdash; {endpoint.qualifierTags}</span>
          )}
        </span>
        {/* --- Indicator columns: fixed-width slots for vertical alignment --- */}
        {/* Clinical tier — w-[22px] reserves space for "S2"/"S3"/"S4" */}
        <span className="shrink-0 w-[22px] flex items-center justify-center">
          {clinicalTier ? (
            <span className="rounded bg-gray-100 px-1 py-0.5 text-[11px] font-medium text-gray-600 border border-gray-200" title={`Clinical tier ${clinicalTier} — sentinel safety biomarker`}>
              {clinicalTier}
            </span>
          ) : null}
        </span>
        {/* NOAEL contribution dot — w-[10px] reserves space for 6px dot */}
        <span className="shrink-0 w-[10px] flex items-center justify-center">
          {(() => {
            const nc = endpoint.endpointConfidence?.noaelContribution;
            if (!nc || nc.label === "excluded") return null;
            const tooltipLines = [
              `NOAEL ${nc.label} (weight ${nc.weight})`,
              nc.canSetNOAEL ? "Can constrain NOAEL" : "Does not constrain NOAEL",
              nc.requiresCorroboration ? "Requires corroboration" : null,
              ...nc.caveats.map(c => `Caveat: ${c}`),
            ].filter(Boolean).join("\n");
            if (nc.label === "determining") return (
              <span className="inline-block h-[6px] w-[6px] rounded-full" style={{ backgroundColor: "rgba(248,113,113,0.7)" }} title={tooltipLines} />
            );
            if (nc.label === "contributing") return (
              <span className="inline-block h-[6px] w-[6px] rounded-full bg-gray-400" title={tooltipLines} />
            );
            return (
              <span className="inline-block h-[6px] w-[6px] rounded-full border border-gray-400" title={tooltipLines} />
            );
          })()}
        </span>
        {/* Sex divergence — w-[24px] reserves space for "F≠M" */}
        <span className="shrink-0 w-[24px] flex items-center justify-center">
          {sexesDiffer ? (
            <span className="font-mono text-[10px] text-muted-foreground/60" title="Findings differ between sexes (direction or pattern)">
              F≠M
            </span>
          ) : null}
        </span>
      </div>
    </button>
  );
});
