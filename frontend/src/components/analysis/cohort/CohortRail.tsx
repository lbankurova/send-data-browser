/**
 * CohortRail — subject roster with preset toggle, filters, and multi-select rows.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { PanePillToggle } from "@/components/ui/PanePillToggle";
import { FilterMultiSelect, FilterSearch, FilterClearButton } from "@/components/ui/FilterBar";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { useCohort } from "@/contexts/CohortContext";
import type { CohortPreset, CohortSubject } from "@/types/cohort";

const PRESET_OPTIONS: { value: CohortPreset; label: string }[] = [
  { value: "trs", label: "TRS" },
  { value: "histo", label: "Histo" },
  { value: "recovery", label: "Recovery" },
  { value: "all", label: "All" },
];

const SEX_COLOR: Record<string, string> = { M: "#0891b2", F: "#ec4899" };

const BADGE_STYLES: Record<string, string> = {
  trs: "bg-red-50 text-red-600 border-red-200",
  adverse: "bg-red-50 text-red-600 border-red-200",
  rec: "bg-green-50 text-green-600 border-green-200",
  pattern: "bg-violet-50 text-violet-600 border-violet-200",
  tk: "bg-gray-50 text-gray-500 border-gray-200",
};

export function CohortRail() {
  const {
    preset, setPreset,
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
      {/* Zone 1: Preset toggle */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <PanePillToggle options={PRESET_OPTIONS} value={preset} onChange={setPreset} />
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

      {/* Zone 3: Filters */}
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

      {/* TK toggle (only in All preset) */}
      {preset === "all" && (
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
