import { useMemo, useCallback } from "react";
import type { UnifiedFinding } from "@/types/analysis";
import { DEFAULT_FILTER_STATE } from "./table-filters";
import type { TableFilterState } from "./table-filters";

// ─── FilterSection ────────────────────────────────────────────
function FilterSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border/30 py-1.5">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

// ─── CategoricalFilter ───────────────────────────────────────
function CategoricalFilter({
  values,
  selected,
  onChange,
}: {
  values: string[];
  selected: string[] | null;
  onChange: (selected: string[] | null) => void;
}) {
  const toggle = useCallback(
    (val: string) => {
      if (selected == null) {
        // Currently "all" — deselect this one (filter it out)
        const next = values.filter((v) => v !== val);
        onChange(next.length === 0 ? null : next);
      } else if (selected.includes(val)) {
        const next = selected.filter((v) => v !== val);
        // If nothing selected, reset to null (= all)
        onChange(next.length === 0 ? null : next);
      } else {
        const next = [...selected, val];
        // If all now selected, reset to null
        onChange(next.length === values.length ? null : next);
      }
    },
    [selected, values, onChange],
  );

  return (
    <div className="flex flex-col gap-0.5">
      {values.map((v) => {
        const checked = selected == null || selected.includes(v);
        return (
          <label
            key={v}
            className="flex cursor-pointer items-center gap-1.5 rounded px-0.5 py-px hover:bg-accent/30"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(v)}
              className="h-2.5 w-2.5 accent-primary"
            />
            <span className="text-[10px] text-foreground/80">{v}</span>
          </label>
        );
      })}
    </div>
  );
}

// ─── ToggleRangeFilter ───────────────────────────────────────
/** Numerical range filter with enable checkbox and smart defaults. */
function ToggleRangeFilter({
  label,
  enabled,
  value,
  defaultValue,
  onToggle,
  onChange,
  step,
  minPlaceholder,
  maxPlaceholder,
}: {
  label: string;
  enabled: boolean;
  value: [number | null, number | null];
  defaultValue: [number | null, number | null];
  onToggle: (on: boolean) => void;
  onChange: (v: [number | null, number | null]) => void;
  step: number;
  minPlaceholder?: string;
  maxPlaceholder?: string;
}) {
  return (
    <div className="py-1.5 border-t border-border/30">
      <label className="mb-1 flex cursor-pointer items-center gap-1.5">
        <input
          type="checkbox"
          checked={enabled}
          onChange={() => {
            if (enabled) {
              // Turning off — clear range
              onChange([null, null]);
              onToggle(false);
            } else {
              // Turning on — apply defaults
              onChange(defaultValue);
              onToggle(true);
            }
          }}
          className="h-2.5 w-2.5 accent-primary"
        />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
      </label>
      {enabled && (
        <div className="flex items-center gap-1 pl-4">
          <input
            type="number"
            step={step}
            value={value[0] ?? ""}
            onChange={(e) =>
              onChange([
                e.target.value ? Number(e.target.value) : null,
                value[1],
              ])
            }
            placeholder={minPlaceholder ?? "min"}
            className="w-14 rounded border border-border/50 bg-transparent px-1 py-0.5 text-[10px] outline-none"
          />
          <span className="text-[8px] text-muted-foreground">{"\u2013"}</span>
          <input
            type="number"
            step={step}
            value={value[1] ?? ""}
            onChange={(e) =>
              onChange([
                value[0],
                e.target.value ? Number(e.target.value) : null,
              ])
            }
            placeholder={maxPlaceholder ?? "max"}
            className="w-14 rounded border border-border/50 bg-transparent px-1 py-0.5 text-[10px] outline-none"
          />
        </div>
      )}
    </div>
  );
}

// ─── Main panel component ─────────────────────────────────────
interface FindingsTableFilterPanelProps {
  findings: UnifiedFinding[];
  filterState: TableFilterState;
  onFilterChange: (next: TableFilterState) => void;
  /** Called when "Clear all" is pressed — parent should also clear the day stepper filter. */
  onClearDayFilter?: () => void;
  /** Whether a day filter is active from the day stepper (shown as clearable chip). */
  activeDayLabel?: string | null;
  /** Effect size symbol for filter label (e.g., "g" for Hedges' g, "d" for Cohen's d). */
  effectSizeSymbol?: string;
}

export function FindingsTableFilterPanel({
  findings,
  filterState,
  onFilterChange,
  onClearDayFilter,
  activeDayLabel,
  effectSizeSymbol = "g",
}: FindingsTableFilterPanelProps) {
  // Derive unique values from the full findings array
  const uniqueDomains = useMemo(
    () => [...new Set(findings.map((f) => f.domain))].sort(),
    [findings],
  );
  const uniquePatterns = useMemo(
    () =>
      [
        ...new Set(
          findings
            .map((f) => f.dose_response_pattern)
            .filter((p): p is string => p != null),
        ),
      ].sort(),
    [findings],
  );
  const uniqueDays = useMemo(
    () =>
      [
        ...new Set(
          findings.map((f) => f.day).filter((d): d is number => d != null),
        ),
      ].sort((a, b) => a - b),
    [findings],
  );

  const clearAll = useCallback(() => {
    onFilterChange(DEFAULT_FILTER_STATE);
    onClearDayFilter?.();
  }, [onFilterChange, onClearDayFilter]);

  const update = useCallback(
    <K extends keyof TableFilterState>(
      key: K,
      val: TableFilterState[K],
    ) => {
      onFilterChange({ ...filterState, [key]: val });
    },
    [filterState, onFilterChange],
  );

  // Track which numerical filters are toggled on
  const pEnabled = filterState.pValueRange[0] != null || filterState.pValueRange[1] != null;
  const trendEnabled = filterState.trendPRange[0] != null || filterState.trendPRange[1] != null;
  const esEnabled = filterState.effectSizeRange[0] != null || filterState.effectSizeRange[1] != null;
  const fcEnabled = filterState.foldChangeRange[0] != null || filterState.foldChangeRange[1] != null;

  return (
    <div className="flex flex-col gap-0 overflow-y-auto border-r bg-muted/10 px-2 py-1.5">
      {/* Clear all */}
      <button
        type="button"
        onClick={clearAll}
        className="mb-1.5 rounded border border-border/50 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Clear all filters
      </button>

      {/* Active day filter from stepper (clearable) */}
      {activeDayLabel && (
        <div className="mb-1 flex items-center gap-1.5">
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {activeDayLabel}
          </span>
          {onClearDayFilter && (
            <button
              type="button"
              onClick={onClearDayFilter}
              className="flex h-4 w-4 items-center justify-center rounded-full text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Clear day filter"
            >
              {"\u00d7"}
            </button>
          )}
        </div>
      )}

      {/* Text search */}
      <FilterSection title="Finding">
        <input
          type="text"
          value={filterState.findingSearch}
          onChange={(e) => update("findingSearch", e.target.value)}
          placeholder="Search..."
          className="w-full rounded border border-border/50 bg-transparent px-1.5 py-0.5 text-[10px] outline-none placeholder:text-muted-foreground/50"
        />
      </FilterSection>

      {/* Categorical filters */}
      <FilterSection title="Domain">
        <CategoricalFilter
          values={uniqueDomains}
          selected={filterState.domain}
          onChange={(v) => update("domain", v)}
        />
      </FilterSection>

      <FilterSection title="Sex">
        <CategoricalFilter
          values={["F", "M"]}
          selected={filterState.sex}
          onChange={(v) => update("sex", v)}
        />
      </FilterSection>

      <FilterSection title="Severity">
        <CategoricalFilter
          values={["adverse", "warning", "normal"]}
          selected={filterState.severity}
          onChange={(v) => update("severity", v)}
        />
      </FilterSection>

      <FilterSection title="Direction">
        <CategoricalFilter
          values={["up", "down"]}
          selected={filterState.direction}
          onChange={(v) => update("direction", v)}
        />
      </FilterSection>

      <FilterSection title="Pattern">
        <CategoricalFilter
          values={uniquePatterns}
          selected={filterState.pattern}
          onChange={(v) => update("pattern", v)}
        />
      </FilterSection>

      <FilterSection title="Type">
        <CategoricalFilter
          values={["continuous", "incidence"]}
          selected={filterState.dataType}
          onChange={(v) => update("dataType", v)}
        />
      </FilterSection>

      {uniqueDays.length > 1 && (
        <FilterSection title="Day">
          <CategoricalFilter
            values={uniqueDays.map(String)}
            selected={filterState.days?.map(String) ?? null}
            onChange={(v) =>
              update("days", v ? v.map(Number) : null)
            }
          />
        </FilterSection>
      )}

      {/* Numerical range filters with enable checkbox + smart defaults */}
      <ToggleRangeFilter
        label="Pairwise p"
        enabled={pEnabled}
        value={filterState.pValueRange}
        defaultValue={[null, 0.05]}
        onToggle={() => {}}
        onChange={(v) => update("pValueRange", v)}
        step={0.001}
        maxPlaceholder="0.05"
      />

      <ToggleRangeFilter
        label="Trend p"
        enabled={trendEnabled}
        value={filterState.trendPRange}
        defaultValue={[null, 0.05]}
        onToggle={() => {}}
        onChange={(v) => update("trendPRange", v)}
        step={0.001}
        maxPlaceholder="0.05"
      />

      <ToggleRangeFilter
        label={`|${effectSizeSymbol}| effect size`}
        enabled={esEnabled}
        value={filterState.effectSizeRange}
        defaultValue={[0.8, null]}
        onToggle={() => {}}
        onChange={(v) => update("effectSizeRange", v)}
        step={0.1}
        minPlaceholder="0.8"
      />

      <ToggleRangeFilter
        label="Fold change"
        enabled={fcEnabled}
        value={filterState.foldChangeRange}
        defaultValue={[1.5, null]}
        onToggle={() => {}}
        onChange={(v) => update("foldChangeRange", v)}
        step={0.1}
        minPlaceholder="1.5"
      />
    </div>
  );
}
