import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { BookmarkStar } from "@/components/ui/BookmarkStar";
import {
  formatPValue,
  titleCase,
} from "@/lib/severity-colors";
import { useEndpointBookmarks, useToggleBookmark } from "@/hooks/useEndpointBookmarks";
import type { DoseResponseRow } from "@/types/analysis-views";

// ─── Types ────────────────────────────────────────────────

interface EndpointPickerSummary {
  endpoint_label: string;
  organ_system: string;
  domain: string;
  dose_response_pattern: string;
  min_trend_p: number | null;
  max_effect_size: number | null;
  direction: "up" | "down" | "mixed" | null;
  signal_score: number;
  adverse_count: number;
}

interface OrganPickerGroup {
  organ_system: string;
  endpoints: EndpointPickerSummary[];
}

const PATTERN_SHORT: Record<string, string> = {
  monotonic_increase: "Mon↑",
  monotonic_decrease: "Mon↓",
  threshold: "Thresh",
  non_monotonic: "Non-mon",
  flat: "Flat",
  insufficient_data: "Insuf",
};

// ─── Helpers ──────────────────────────────────────────────

function derivePickerSummaries(data: DoseResponseRow[]): EndpointPickerSummary[] {
  const map = new Map<string, DoseResponseRow[]>();
  for (const row of data) {
    const existing = map.get(row.endpoint_label);
    if (existing) existing.push(row);
    else map.set(row.endpoint_label, [row]);
  }

  const summaries: EndpointPickerSummary[] = [];
  for (const [label, rows] of map) {
    const first = rows[0];
    let minTrendP: number | null = null;
    let maxEffect: number | null = null;
    let hasUp = false;
    let hasDown = false;
    let adverseCount = 0;

    for (const r of rows) {
      if (r.trend_p != null && (minTrendP === null || r.trend_p < minTrendP)) minTrendP = r.trend_p;
      if (r.effect_size != null) {
        const abs = Math.abs(r.effect_size);
        if (maxEffect === null || abs > maxEffect) maxEffect = abs;
        if (r.effect_size > 0) hasUp = true;
        if (r.effect_size < 0) hasDown = true;
      }
      if (r.p_value != null && r.p_value < 0.05) adverseCount++;
    }

    // Determine dominant pattern
    const patternCounts = new Map<string, number>();
    for (const r of rows) {
      patternCounts.set(r.dose_response_pattern, (patternCounts.get(r.dose_response_pattern) ?? 0) + 1);
    }
    let bestPattern = first.dose_response_pattern;
    let bestCount = 0;
    for (const [p, c] of patternCounts) {
      if (p !== "flat" && p !== "insufficient_data" && c > bestCount) {
        bestPattern = p;
        bestCount = c;
      }
    }
    if (bestCount === 0) {
      for (const [p, c] of patternCounts) {
        if (c > bestCount) {
          bestPattern = p;
          bestCount = c;
        }
      }
    }

    const pPart = minTrendP != null && minTrendP > 0 ? -Math.log10(minTrendP) : 0;
    const ePart = maxEffect != null ? Math.abs(maxEffect) : 0;

    summaries.push({
      endpoint_label: label,
      organ_system: first.organ_system,
      domain: first.domain,
      dose_response_pattern: bestPattern,
      min_trend_p: minTrendP,
      max_effect_size: maxEffect,
      direction: hasUp && hasDown ? "mixed" : hasUp ? "up" : hasDown ? "down" : null,
      signal_score: pPart + ePart,
      adverse_count: adverseCount,
    });
  }

  return summaries.sort((a, b) => b.signal_score - a.signal_score);
}

function groupByOrgan(
  summaries: EndpointPickerSummary[],
  organFilter: string | null,
): OrganPickerGroup[] {
  let filtered = summaries;
  if (organFilter) {
    filtered = summaries.filter((s) => s.organ_system === organFilter);
  }

  const map = new Map<string, EndpointPickerSummary[]>();
  for (const s of filtered) {
    const existing = map.get(s.organ_system);
    if (existing) existing.push(s);
    else map.set(s.organ_system, [s]);
  }

  const groups: OrganPickerGroup[] = [];
  for (const [organ, endpoints] of map) {
    groups.push({ organ_system: organ, endpoints });
  }

  return groups.sort((a, b) => {
    const aMax = Math.max(...a.endpoints.map((e) => e.signal_score));
    const bMax = Math.max(...b.endpoints.map((e) => e.signal_score));
    return bMax - aMax;
  });
}

function directionGlyph(dir: "up" | "down" | "mixed" | null): string {
  if (dir === "up") return "↑";
  if (dir === "down") return "↓";
  if (dir === "mixed") return "↕";
  return "";
}

// ─── Component ────────────────────────────────────────────

export function DoseResponseEndpointPicker({
  data,
  studyId,
  selectedEndpoint,
  organFilter,
  onSelect,
}: {
  data: DoseResponseRow[];
  studyId: string | undefined;
  selectedEndpoint: string | null;
  organFilter: string | null;
  onSelect: (endpointLabel: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [bookmarkFilter, setBookmarkFilter] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: bookmarksData } = useEndpointBookmarks(studyId);
  const toggleBookmark = useToggleBookmark(studyId);
  const bookmarks = bookmarksData ?? {};

  const summaries = useMemo(() => derivePickerSummaries(data), [data]);

  const groups = useMemo(() => {
    let filtered = summaries;

    // Bookmark filter
    if (bookmarkFilter) {
      filtered = filtered.filter((s) => bookmarks[s.endpoint_label]?.bookmarked);
    }

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.endpoint_label.toLowerCase().includes(q) ||
          s.organ_system.toLowerCase().includes(q) ||
          s.domain.toLowerCase().includes(q),
      );
    }

    return groupByOrgan(filtered, organFilter);
  }, [summaries, organFilter, search, bookmarkFilter, bookmarks]);

  const bookmarkCount = useMemo(
    () => Object.values(bookmarks).filter((b) => b.bookmarked).length,
    [bookmarks],
  );

  const totalCount = useMemo(() => {
    if (organFilter) return summaries.filter((s) => s.organ_system === organFilter).length;
    return summaries.length;
  }, [summaries, organFilter]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Auto-select top endpoint when organFilter changes
  const prevOrganRef = useRef(organFilter);
  useEffect(() => {
    if (prevOrganRef.current !== organFilter && data.length > 0) {
      prevOrganRef.current = organFilter;
      const filtered = organFilter
        ? summaries.filter((s) => s.organ_system === organFilter)
        : summaries;
      if (filtered.length > 0 && filtered[0].endpoint_label !== selectedEndpoint) {
        onSelect(filtered[0].endpoint_label);
      }
    }
  }, [organFilter, summaries, selectedEndpoint, onSelect, data.length]);

  const handleSelect = useCallback(
    (label: string) => {
      onSelect(label);
      setOpen(false);
      setSearch("");
    },
    [onSelect],
  );

  const selectedLabel = selectedEndpoint ?? "Select endpoint";
  const selectedOrgan = summaries.find((s) => s.endpoint_label === selectedEndpoint)?.organ_system;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        className={cn(
          "flex items-center gap-1.5 rounded border px-2 py-1 text-left text-xs transition-colors",
          open
            ? "border-primary bg-accent"
            : "border-border hover:border-primary/50 hover:bg-accent/50",
        )}
        onClick={() => setOpen(!open)}
      >
        <span className="max-w-[280px] truncate font-medium">{selectedLabel}</span>
        {selectedOrgan && (
          <span className="text-[10px] text-muted-foreground">{titleCase(selectedOrgan)}</span>
        )}
        <span className="ml-1 text-[10px] text-muted-foreground/60">
          ({totalCount})
        </span>
        <ChevronDown className={cn("ml-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[420px] rounded-md border bg-popover shadow-lg">
          {/* Search + bookmark toggle */}
          <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
            <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search endpoints..."
              className="min-w-0 flex-1 bg-transparent py-0.5 text-xs focus:outline-none"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {bookmarkCount > 0 && (
              <button
                className={cn(
                  "flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                  bookmarkFilter
                    ? "border-amber-300 bg-amber-100 text-amber-800"
                    : "border-border text-muted-foreground hover:bg-accent/50",
                )}
                onClick={() => setBookmarkFilter(!bookmarkFilter)}
              >
                <Star className="h-2.5 w-2.5" fill={bookmarkFilter ? "currentColor" : "none"} />
                {bookmarkCount}
              </button>
            )}
          </div>

          {/* Grouped endpoint list */}
          <div className="max-h-[360px] overflow-y-auto">
            {groups.length === 0 && (
              <div className="p-3 text-center text-xs text-muted-foreground">
                No endpoints match.
              </div>
            )}
            {groups.map((group) => (
              <div key={group.organ_system}>
                {/* Group header */}
                <div className="sticky top-0 z-10 flex items-center gap-1.5 border-b bg-muted/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {titleCase(group.organ_system)}
                  <span className="font-normal">({group.endpoints.length})</span>
                </div>

                {/* Endpoint rows */}
                {group.endpoints.map((ep) => {
                  const isSelected = ep.endpoint_label === selectedEndpoint;
                  return (
                    <button
                      key={ep.endpoint_label}
                      className={cn(
                        "flex w-full items-center gap-2 border-b border-dashed px-3 py-1.5 text-left text-xs transition-colors",
                        isSelected
                          ? "bg-accent font-medium"
                          : "hover:bg-accent/50",
                      )}
                      onClick={() => handleSelect(ep.endpoint_label)}
                    >
                      {/* Name + domain */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate" title={ep.endpoint_label}>
                            {ep.endpoint_label}
                          </span>
                          <DomainLabel domain={ep.domain} />
                        </div>
                      </div>

                      {/* Direction + pattern */}
                      {ep.direction && (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {directionGlyph(ep.direction)}
                        </span>
                      )}
                      <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[9px] font-medium text-gray-500">
                        {PATTERN_SHORT[ep.dose_response_pattern] ?? ep.dose_response_pattern.split("_")[0]}
                      </span>

                      {/* p-value + effect size */}
                      <span className={cn(
                        "shrink-0 font-mono text-[10px] text-muted-foreground",
                        ep.min_trend_p != null && ep.min_trend_p < 0.01 && "font-semibold",
                      )}>
                        p={formatPValue(ep.min_trend_p)}
                      </span>
                      {ep.max_effect_size != null && (
                        <span className={cn(
                          "shrink-0 font-mono text-[10px] text-muted-foreground",
                          ep.max_effect_size >= 0.8 && "font-semibold",
                        )}>
                          |d|={ep.max_effect_size.toFixed(2)}
                        </span>
                      )}

                      {/* Bookmark */}
                      <BookmarkStar
                        bookmarked={!!bookmarks[ep.endpoint_label]?.bookmarked}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBookmark(ep.endpoint_label, !!bookmarks[ep.endpoint_label]?.bookmarked);
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
