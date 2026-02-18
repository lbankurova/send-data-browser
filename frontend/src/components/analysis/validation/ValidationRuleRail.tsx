import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useValidationCatalog } from "@/hooks/useValidationCatalog";
import { useAnnotations } from "@/hooks/useAnnotations";
import { useRunValidation } from "@/hooks/useRunValidation";
import { FilterSearch, FilterSelect } from "@/components/ui/FilterBar";
import { ValidationRuleCard } from "./ValidationRuleCard";
import type { ValidationRuleResult } from "@/hooks/useValidationResults";
import type { ValidationRuleOverride } from "@/types/annotations";
import { useSearchParams } from "react-router-dom";

type SortMode = "evidence" | "domain" | "category" | "severity" | "source";
type ShowFilter = "" | "triggered" | "clean" | "enabled" | "disabled";
type SevFilter = "" | "Error" | "Warning" | "Info";
type SourceFilter = "" | "custom" | "core";

interface Props {
  studyId: string;
  selectedRuleId: string | null;
  onRuleSelect: (rule: ValidationRuleResult) => void;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export function ValidationRuleRail({
  studyId,
  selectedRuleId,
  onRuleSelect,
}: Props) {
  const { data: catalogData, isLoading } = useValidationCatalog(studyId);
  const { data: overrideAnnotations } = useAnnotations<ValidationRuleOverride>(
    studyId,
    "validation-rule-config"
  );
  const { mutate: runValidation, isPending: isValidating } =
    useRunValidation(studyId);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("evidence");
  const [showFilter, setShowFilter] = useState<ShowFilter>("");
  const [sevFilter, setSevFilter] = useState<SevFilter>("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("");

  // Debounce search input (200ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    debounceRef.current = setTimeout(() => setSearch(searchInput), 200);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  // ?rule= URL param auto-select
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingRuleParam = useRef(searchParams.get("rule"));
  useEffect(() => {
    const ruleParam = pendingRuleParam.current;
    if (!ruleParam || !catalogData?.rules) return;
    const match = catalogData.rules.find((r) => r.rule_id === ruleParam);
    if (match) {
      onRuleSelect(match);
      pendingRuleParam.current = null;
      // Clear the param from URL
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("rule");
        return next;
      }, { replace: true });
    }
  }, [catalogData, onRuleSelect, setSearchParams]);

  const allRules = useMemo(
    () => catalogData?.rules ?? [],
    [catalogData?.rules]
  );

  // Apply disabled status from annotations
  const rulesWithStatus = useMemo(() => {
    return allRules.map((r) => {
      const override = overrideAnnotations?.[r.rule_id];
      if (override?.enabled === false && r.status !== "disabled") {
        return { ...r, status: "disabled" as const };
      }
      return r;
    });
  }, [allRules, overrideAnnotations]);

  // Filter
  const filtered = useMemo(() => {
    let rules = rulesWithStatus;

    // Search
    if (search) {
      const q = search.toLowerCase();
      rules = rules.filter(
        (r) =>
          r.rule_id.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          r.domain.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q)
      );
    }

    // Show filter
    if (showFilter === "triggered")
      rules = rules.filter((r) => r.status === "triggered");
    else if (showFilter === "clean")
      rules = rules.filter((r) => r.status === "clean");
    else if (showFilter === "enabled")
      rules = rules.filter((r) => r.status !== "disabled");
    else if (showFilter === "disabled")
      rules = rules.filter((r) => r.status === "disabled");

    // Severity filter
    if (sevFilter) rules = rules.filter((r) => r.severity === sevFilter);

    // Source filter
    if (sourceFilter) rules = rules.filter((r) => r.source === sourceFilter);

    return rules;
  }, [rulesWithStatus, search, showFilter, sevFilter, sourceFilter]);

  // Sort + group
  const sortKeyFn = useCallback(
    (r: ValidationRuleResult): string => {
      switch (sortMode) {
        case "domain":
          return r.domain;
        case "category":
          return r.category;
        case "severity":
          return r.severity;
        case "source":
          return r.source;
        default:
          return r.status === "triggered" ? "0-triggered" : "1-other";
      }
    },
    [sortMode]
  );

  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const ka = sortKeyFn(a);
      const kb = sortKeyFn(b);
      if (ka !== kb) return ka.localeCompare(kb);
      // Secondary sort: by records_affected desc, then rule_id
      if (b.records_affected !== a.records_affected)
        return b.records_affected - a.records_affected;
      return a.rule_id.localeCompare(b.rule_id);
    });
    return groupBy(sorted, sortKeyFn);
  }, [filtered, sortKeyFn]);

  const maxRecords = useMemo(
    () => Math.max(1, ...allRules.map((r) => r.records_affected)),
    [allRules]
  );


  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Validation rules
        </span>
        <button
          className="rounded bg-primary px-2.5 py-1 text-[10px] font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={isValidating}
          onClick={() => runValidation()}
        >
          {isValidating ? "RUNNING..." : "RUN"}
        </button>
      </div>

      {/* Search */}
      <div className="border-b px-2 py-1.5">
        <FilterSearch
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search rules..."
        />
      </div>

      {/* Sort + filters */}
      <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <FilterSelect
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
          className="text-[10px]"
        >
          <option value="evidence">Sort: Evidence</option>
          <option value="domain">Sort: Domain</option>
          <option value="category">Sort: Category</option>
          <option value="severity">Sort: Severity</option>
          <option value="source">Sort: Source</option>
        </FilterSelect>
        <FilterSelect
          value={showFilter}
          onChange={(e) => setShowFilter(e.target.value as ShowFilter)}
          className="text-[10px]"
        >
          <option value="">Show: All</option>
          <option value="triggered">Triggered</option>
          <option value="clean">Clean</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </FilterSelect>
        <FilterSelect
          value={sevFilter}
          onChange={(e) => setSevFilter(e.target.value as SevFilter)}
          className="text-[10px]"
        >
          <option value="">Sev: All</option>
          <option value="Error">Error</option>
          <option value="Warning">Warning</option>
          <option value="Info">Info</option>
        </FilterSelect>
        <FilterSelect
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
          className="text-[10px]"
        >
          <option value="">Source: All</option>
          <option value="custom">Custom</option>
          <option value="core">CDISC CORE</option>
        </FilterSelect>
      </div>

      {/* Card list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-1.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
            Loading rules...
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No rules match the current filters.
          </div>
        ) : (
          Array.from(grouped.entries()).map(([groupKey, rules]) => (
            <div key={groupKey} className="mb-2">
              {/* Group header — only show if not the default "evidence" sort with single group */}
              {(sortMode !== "evidence" || grouped.size > 1) && (
                <div className="mb-1 px-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {groupKey === "0-triggered"
                    ? "Triggered"
                    : groupKey === "1-other"
                      ? "Clean / disabled"
                      : groupKey}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {rules.map((rule) => (
                  <ValidationRuleCard
                    key={rule.rule_id}
                    rule={rule}
                    isSelected={selectedRuleId === rule.rule_id}
                    isDisabled={rule.status === "disabled"}
                    maxRecords={maxRecords}
                    onClick={() => onRuleSelect(rule)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}
