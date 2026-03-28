/**
 * CohortRail — subject roster with preset checkboxes, saved cohorts,
 * reference indicator, filter pills, and multi-select rows.
 */
import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { X, Pin, PinOff, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FilterMultiSelect, FilterSearch, FilterClearButton } from "@/components/ui/FilterBar";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { useCohort } from "@/contexts/CohortContext";
import { FilterPanel, FilterPanelToggle } from "./FilterPanel";
import type { CohortPreset, CohortSubject, FilterPredicate, SavedCohort } from "@/types/cohort";

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
    // Reference
    referenceGroup, referenceLabel,
    setAsReference, setAsReferenceFromCohort, clearReference,
    // Saved cohorts
    savedCohorts, activeSavedCohortId,
    saveCohort, loadSavedCohort, deleteSavedCohort,
    renameSavedCohort, togglePinSavedCohort,
  } = useCohort();

  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [showMoreSaved, setShowMoreSaved] = useState(false);

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
  const hasFilters = !activePresets.has("all") || activePresets.size > 1 || filterGroup.predicates.length > 0 || isDirty;

  // Saved cohorts: pinned vs unpinned
  const pinnedCohorts = savedCohorts.filter((c) => c.pinned);
  const unpinnedCohorts = savedCohorts.filter((c) => !c.pinned);

  const handleSave = useCallback(() => {
    const trimmed = saveName.trim();
    if (!trimmed) return;
    saveCohort(trimmed);
    setSaveName("");
    setShowSaveInput(false);
  }, [saveName, saveCohort]);

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
        {/* Save... link (visible when filters are active) */}
        {hasFilters && !showSaveInput && (
          <button
            type="button"
            onClick={() => setShowSaveInput(true)}
            className="ml-auto text-xs text-primary hover:text-primary/80"
          >
            Save...
          </button>
        )}
      </div>

      {/* Inline save input */}
      {showSaveInput && (
        <div className="flex items-center gap-1.5 border-b px-3 py-1.5">
          <input
            type="text"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setShowSaveInput(false); }}
            placeholder="Cohort name"
            className="flex-1 rounded border border-gray-200 bg-background px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
          <button type="button" onClick={() => setShowSaveInput(false)} className="text-[10px] text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={!saveName.trim()} className="rounded bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground disabled:opacity-50">
            Save
          </button>
        </div>
      )}

      {/* Saved cohorts section */}
      {savedCohorts.length > 0 && (
        <div className="border-b px-3 py-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Saved
          </div>
          {pinnedCohorts.map((c) => (
            <SavedCohortRow
              key={c.id}
              cohort={c}
              isActive={activeSavedCohortId === c.id}
              onLoad={loadSavedCohort}
              onDelete={deleteSavedCohort}
              onRename={renameSavedCohort}
              onTogglePin={togglePinSavedCohort}
              onUseAsRef={setAsReferenceFromCohort}
            />
          ))}
          {unpinnedCohorts.length > 0 && !showMoreSaved && (
            <button
              type="button"
              onClick={() => setShowMoreSaved(true)}
              className="text-[10px] text-primary hover:text-primary/80 mt-0.5"
            >
              + {unpinnedCohorts.length} more
            </button>
          )}
          {showMoreSaved && unpinnedCohorts.map((c) => (
            <SavedCohortRow
              key={c.id}
              cohort={c}
              isActive={activeSavedCohortId === c.id}
              onLoad={loadSavedCohort}
              onDelete={deleteSavedCohort}
              onRename={renameSavedCohort}
              onTogglePin={togglePinSavedCohort}
              onUseAsRef={setAsReferenceFromCohort}
            />
          ))}
        </div>
      )}

      {/* Zone 2: Summary / Reference indicator */}
      {referenceGroup ? (
        <div className="border-b px-3 py-1.5 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold uppercase tracking-wider text-muted-foreground">Ref</span>
            <span className="font-medium text-foreground">{referenceLabel}</span>
            <button type="button" onClick={clearReference} className="ml-auto text-primary hover:text-primary/80">Clear</button>
          </div>
          <div className="text-muted-foreground mt-0.5">
            vs {selected.length} subjects &middot;{" "}
            <span style={{ color: SEX_COLOR.M }}>M {maleCount}</span> /{" "}
            <span style={{ color: SEX_COLOR.F }}>F {femaleCount}</span>
          </div>
          <button
            type="button"
            onClick={setAsReference}
            className="text-primary hover:text-primary/80 mt-0.5"
          >
            Change ref
          </button>
        </div>
      ) : (
        <div className="border-b px-3 py-1.5 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{selected.length} subjects</span>
            <span>&middot;</span>
            <span>{doseGroupCount} dose grp{doseGroupCount !== 1 ? "s" : ""}</span>
            <span>&middot;</span>
            <span style={{ color: SEX_COLOR.M }}>M {maleCount}</span>
            <span>/</span>
            <span style={{ color: SEX_COLOR.F }}>F {femaleCount}</span>
          </div>
          <button
            type="button"
            onClick={setAsReference}
            className="text-primary hover:text-primary/80 mt-0.5"
          >
            Set as reference
          </button>
        </div>
      )}

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

      {/* Zone 3: Quick-access filters + filter panel toggle */}
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
        <FilterPanelToggle
          predicateCount={filterGroup.predicates.length}
          isOpen={showFilterPanel}
          onToggle={() => setShowFilterPanel((p) => !p)}
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

      {/* FilterPanel: side panel for adding advanced filter predicates */}
      {showFilterPanel && (
        <FilterPanel onClose={() => setShowFilterPanel(false)} />
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

// ── SavedCohortRow with right-click context menu ─────────────

function SavedCohortRow({
  cohort,
  isActive,
  onLoad,
  onDelete,
  onRename,
  onTogglePin,
  onUseAsRef,
}: {
  cohort: SavedCohort;
  isActive: boolean;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onTogglePin: (id: string) => void;
  onUseAsRef: (cohortId: string) => void;
}) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(cohort.name);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuPos) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuPos]);

  if (renaming) {
    return (
      <div className="flex items-center gap-1 py-0.5">
        <input
          type="text"
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onRename(cohort.id, renameName.trim()); setRenaming(false); }
            if (e.key === "Escape") setRenaming(false);
          }}
          className="flex-1 rounded border border-gray-200 bg-background px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div className="relative">
      <label
        className="flex items-center gap-1.5 py-0.5 text-xs cursor-context-menu"
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuPos({ x: e.clientX, y: e.clientY });
        }}
      >
        <input
          type="checkbox"
          checked={isActive}
          onChange={() => onLoad(cohort.id)}
          className="h-3 w-3 rounded border-gray-300"
        />
        <span className={cn(
          "font-medium truncate",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}>
          {cohort.name}
        </span>
      </label>

      {/* Context menu */}
      {menuPos && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[140px] rounded border border-gray-200 bg-background py-1 shadow-lg"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          <ContextMenuItem onClick={() => { onLoad(cohort.id); setMenuPos(null); }}>
            Load cohort
          </ContextMenuItem>
          <ContextMenuItem onClick={() => { onUseAsRef(cohort.id); setMenuPos(null); }}>
            Use as reference
          </ContextMenuItem>
          <div className="my-0.5 border-t border-gray-100" />
          <ContextMenuItem onClick={() => { onTogglePin(cohort.id); setMenuPos(null); }}>
            {cohort.pinned ? (
              <><PinOff className="h-3 w-3" /> Unpin</>
            ) : (
              <><Pin className="h-3 w-3" /> Pin to top</>
            )}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => { setRenaming(true); setRenameName(cohort.name); setMenuPos(null); }}>
            <Pencil className="h-3 w-3" /> Rename
          </ContextMenuItem>
          <ContextMenuItem onClick={() => { onDelete(cohort.id); setMenuPos(null); }} className="text-red-600 hover:bg-red-50">
            <Trash2 className="h-3 w-3" /> Delete
          </ContextMenuItem>
        </div>
      )}
    </div>
  );
}

function ContextMenuItem({ children, onClick, className }: { children: React.ReactNode; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      className={cn("flex w-full items-center gap-1.5 px-3 py-1 text-xs hover:bg-accent/50 text-left", className)}
      onClick={onClick}
    >
      {children}
    </button>
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
