/**
 * CohortRail — subject roster with preset checkboxes, filter pills, and multi-select rows.
 */
import { useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterMultiSelect, FilterSearch, FilterClearButton } from "@/components/ui/FilterBar";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { useCohort } from "@/contexts/CohortContext";
import { FilterPanel } from "./FilterPanel";
import type { CohortPreset, CohortSubject, FilterPredicate } from "@/types/cohort";

const PRESET_OPTIONS: { value: CohortPreset; label: string }[] = [
  { value: "all", label: "All" },
  { value: "trs", label: "TRS" },
  { value: "histo", label: "Histo" },
  { value: "recovery", label: "Recovery" },
];

const SEX_COLOR: Record<string, string> = { M: "#0891b2", F: "#ec4899" };

const BADGE_STYLES: Record<string, string> = {
  trs: "bg-red-50 text-red-600 border-red-200",
  adverse: "bg-red-50 text-red-600 border-red-200",
  rec: "bg-green-50 text-green-600 border-green-200",
  pattern: "bg-violet-50 text-violet-600 border-violet-200",
  tk: "bg-gray-50 text-gray-500 border-gray-200",
};

// ── Predicate label formatting ────────────────────────────────

function getPredicateLabel(p: FilterPredicate): string {
  switch (p.type) {
    case "dose":
      return `Dose: ${[...p.values].join(", ")}`;
    case "sex":
      return `Sex: ${[...p.values].join(", ")}`;
    case "organ":
      return `Organ: ${p.organName}${p.role && p.role !== "any" ? ` (${p.role})` : ""}`;
    case "domain":
      return `Domain: ${p.domain}`;
    case "syndrome":
      return `Syndrome: ${p.syndromeId}${p.matchType !== "any" ? ` (${p.matchType})` : ""}`;
    case "severity":
      return `MI grade >= ${p.minGrade}`;
    case "bw_change":
      return `BW: >= ${p.minPct}% ${p.direction}`;
    case "organ_count":
      return `Organs >= ${p.min}`;
    case "disposition":
      return `Disposition: ${[...p.values].join(", ")}`;
    case "recovery":
      return "Recovery";
    case "tk":
      return "TK";
    case "search":
      return `Search: ${p.query}`;
    case "onset_day":
      return "Onset day";
    case "recovery_verdict":
      return "Recovery verdict";
  }
}

// ── FilterPill ────────────────────────────────────────────────

function FilterPill({ predicate, onRemove }: { predicate: FilterPredicate; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">
      <span className="truncate max-w-[120px]">{getPredicateLabel(predicate)}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="ml-0.5 rounded-sm hover:bg-gray-200 p-0.5"
        title="Remove filter"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

// ── CohortRail ────────────────────────────────────────────────

export function CohortRail() {
  const {
    activePresets, togglePreset,
    filterGroup, removePredicate, setFilterOperator,
    filteredSubjects, selectedSubjects, toggleSubject,
    includeTK, setIncludeTK,
    doseFilter, setDoseFilter,
    sexFilter, setSexFilter,
    searchQuery, setSearchQuery,
    subjectOrganCounts,
  } = useCohort();

  // Summary counts
  const selected = filteredSubjects.filter((s) => selectedSubjects.has(s.usubjid));
  const doseGroupCount = new Set(selected.map((s) => s.doseGroupOrder)).size;
  const maleCount = selected.filter((s) => s.sex === "M").length;
  const femaleCount = selected.filter((s) => s.sex === "F").length;

  // Dose group options for filter
  const doseOptions = useMemo(() => {
    const groups = new Map<number, string>();
    for (const s of filteredSubjects) {
      if (!groups.has(s.doseGroupOrder)) groups.set(s.doseGroupOrder, s.doseLabel);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([order, label]) => ({ key: String(order), label }));
  }, [filteredSubjects]);

  const isDirty = doseFilter !== null || sexFilter !== null || searchQuery !== "";

  return (
    <div className="flex h-full flex-col">
      {/* Zone 1: Preset checkboxes */}
      <div className="flex items-center gap-3 border-b px-3 py-2">
        {PRESET_OPTIONS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-1 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={activePresets.has(opt.value)}
              onChange={() => togglePreset(opt.value)}
              className="h-3 w-3 rounded border-gray-300"
            />
            <span className={cn(
              "font-medium",
              activePresets.has(opt.value) ? "text-foreground" : "text-muted-foreground"
            )}>
              {opt.label}
            </span>
          </label>
        ))}
      </div>

      {/* Zone 2: Summary line */}
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5 text-[10px] text-muted-foreground">
        <span className="font-medium">{selected.length} subjects</span>
        <span>&middot;</span>
        <span>{doseGroupCount} dose grp{doseGroupCount !== 1 ? "s" : ""}</span>
        <span>&middot;</span>
        <span style={{ color: SEX_COLOR.M }}>M {maleCount}</span>
        <span>/</span>
        <span style={{ color: SEX_COLOR.F }}>F {femaleCount}</span>
      </div>

      {/* Filter pills zone */}
      {filterGroup.predicates.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 border-b px-3 py-1.5">
          {filterGroup.predicates.map((p, i) => (
            <FilterPill key={i} predicate={p} onRemove={() => removePredicate(i)} />
          ))}
          <button
            type="button"
            onClick={() => setFilterOperator(filterGroup.operator === "and" ? "or" : "and")}
            className="text-[10px] font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10 hover:bg-primary/20"
          >
            {filterGroup.operator.toUpperCase()}
          </button>
        </div>
      )}

      {/* Zone 3: Quick-access filters */}
      <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-1.5">
        <FilterMultiSelect
          options={doseOptions}
          selected={doseFilter ? new Set([...doseFilter].map(String)) : null}
          onChange={(val) => setDoseFilter(val ? new Set([...val].map(Number)) : null)}
        />
        <FilterMultiSelect
          options={[{ key: "M", label: "M" }, { key: "F", label: "F" }]}
          selected={sexFilter}
          onChange={(val) => setSexFilter(val ? new Set(val) as Set<string> : null)}
        />
        <FilterSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="USUBJID"
        />
        <FilterClearButton
          dirty={isDirty}
          onClear={() => { setDoseFilter(null); setSexFilter(null); setSearchQuery(""); }}
        />
      </div>

      {/* TK toggle (shown when "all" is active or no specific preset selected) */}
      {(activePresets.has("all") || activePresets.size === 0) && (
        <label className="flex items-center gap-1.5 border-b px-3 py-1 text-[10px] text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={includeTK}
            onChange={(e) => setIncludeTK(e.target.checked)}
            className="h-3 w-3 rounded border-gray-300"
          />
          Include TK satellites
        </label>
      )}

      {/* FilterPanel: collapsible advanced filters */}
      <FilterPanel />

      {/* Zone 4: Subject rows */}
      <div className="flex-1 overflow-y-auto">
        {filteredSubjects.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No subjects match the current preset and filters. Try a different preset or clear filters.
          </div>
        ) : (
          filteredSubjects.map((s) => (
            <SubjectRow
              key={s.usubjid}
              subject={s}
              isSelected={selectedSubjects.has(s.usubjid)}
              onToggle={toggleSubject}
              organCount={subjectOrganCounts.get(s.usubjid) ?? 0}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SubjectRow({
  subject: s,
  isSelected,
  onToggle,
  organCount,
}: {
  subject: CohortSubject;
  isSelected: boolean;
  onToggle: (id: string, shiftKey: boolean) => void;
  organCount: number;
}) {
  const pipeColor = getDoseGroupColor(s.doseGroupOrder);
  const isEarly = s.sacrificeDay != null && s.plannedDay != null && s.sacrificeDay < s.plannedDay;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-1.5 px-2 py-1 text-left transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/30",
      )}
      style={{ borderLeft: `3px solid ${pipeColor}` }}
      onClick={(e) => onToggle(s.usubjid, e.shiftKey)}
    >
      {/* USUBJID */}
      <span className="min-w-0 flex-1 truncate font-mono text-xs font-semibold">
        {s.usubjid}
      </span>

      {/* Sex */}
      <span
        className="text-xs font-semibold"
        style={{ color: SEX_COLOR[s.sex] ?? undefined }}
      >
        {s.sex}
      </span>

      {/* Badge */}
      {s.badge && (
        <span className={cn("rounded border px-1 text-[10px] font-semibold uppercase", BADGE_STYLES[s.badge])}>
          {s.badge.toUpperCase()}
        </span>
      )}

      {/* Organ involvement count */}
      {organCount > 0 && (
        <span className="font-mono text-[9px] text-muted-foreground" title={`Findings in ${organCount} organ${organCount !== 1 ? "s" : ""}`}>
          {organCount}org
        </span>
      )}

      {/* Disposition day */}
      <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
        {s.isRecovery && s.recoveryStartDay != null ? (
          <>Rec d{s.sacrificeDay != null ? s.sacrificeDay - s.recoveryStartDay : "?"}/{s.plannedDay != null ? s.plannedDay - s.recoveryStartDay : "?"}</>
        ) : (
          <>
            d<span className={isEarly ? "text-foreground font-medium" : ""}>{s.sacrificeDay ?? "?"}</span>
            /{s.plannedDay ?? "?"}
          </>
        )}
      </span>
    </button>
  );
}
