/**
 * CohortContext — shared state for the Cohort View.
 *
 * Provided at Layout level so both CohortRail (ShellRailPanel) and
 * CohortView (Outlet) can consume it. Lightweight when not on the cohort route.
 *
 * Filtering uses the composable filter engine (evaluateFilter) with FilterGroup.
 * The old computePresetSubjects + manual cascading filters are replaced by:
 *   1. buildPresetFilterGroup combines active presets into a FilterGroup
 *   2. Convenience filters (dose, sex, search) add predicates on top
 *   3. evaluateFilter evaluates the combined filter against each subject
 */
import { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useFindings } from "@/hooks/useFindings";
import { useSubjectContext } from "@/hooks/useSubjectContext";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useCrossAnimalFlags } from "@/hooks/useCrossAnimalFlags";
import { buildCohortSubjects, buildPresetFilterGroup, computeOrganSignals, buildCohortFindingRows, computeSharedFindings, computeSubjectOrganCounts } from "@/lib/cohort-engine";
import { evaluateFilter } from "@/lib/filter-engine";
import type { FilterContext } from "@/lib/filter-engine";
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import { useSubjectSyndromes } from "@/hooks/useSubjectSyndromes";
import type { CohortPreset, CohortSubject, OrganSignal, CohortFindingRow, SharedFinding, FilterGroup, FilterOperator, FilterPredicate } from "@/types/cohort";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";

const EMPTY_FILTERS = { domain: null, severity: null, search: "", sex: null, organ_system: null, endpoint_label: null, dose_response_pattern: null };
const MAX_SUBJECT_COLUMNS = 20;
const EMPTY_FILTER_GROUP: FilterGroup = { operator: "and", predicates: [] };

export interface CohortContextValue {
  // Data loading
  isLoading: boolean;
  // Raw data
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  /** Subjects with missing organ examinations — USUBJID -> set of missing organ/specimen names. */
  missingExamMap: Map<string, Set<string>>;
  /** Per-subject histopath data for the selected organ (MI/MA severity grades). */
  histopathMap: Map<string, Map<string, { severity_num: number; severity: string | null }>>;
  /** True when histopath subjects data has loaded for the current organ. */
  hasHistopathData: boolean;
  /** Per-subject organ involvement count (for rail signal density). */
  subjectOrganCounts: Map<string, number>;
  // Subject roster
  allSubjects: CohortSubject[];
  filteredSubjects: CohortSubject[];
  activeSubjects: CohortSubject[];
  displaySubjects: CohortSubject[];
  // State — backward compatible
  preset: CohortPreset;
  selectedSubjects: Set<string>;
  selectedOrgan: string | null;
  includeTK: boolean;
  doseFilter: Set<number> | null;
  sexFilter: Set<string> | null;
  searchQuery: string;
  hoveredRow: string | null;
  // State — new composable filter
  activePresets: Set<CohortPreset>;
  filterGroup: FilterGroup;
  // Derived
  organSignals: OrganSignal[];
  findingRows: CohortFindingRow[];
  sharedFindings: SharedFinding[];
  truncated: boolean;
  // Actions — backward compatible
  setPreset: (p: CohortPreset) => void;
  toggleSubject: (id: string, shiftKey: boolean) => void;
  setSelectedOrgan: (organ: string | null) => void;
  setIncludeTK: (v: boolean) => void;
  setDoseFilter: (v: Set<number> | null) => void;
  setSexFilter: (v: Set<string> | null) => void;
  setSearchQuery: (v: string) => void;
  setHoveredRow: (key: string | null) => void;
  // Actions — new composable filter
  togglePreset: (p: CohortPreset) => void;
  setFilterGroup: (fg: FilterGroup) => void;
  setFilterOperator: (op: FilterOperator) => void;
  addPredicate: (p: FilterPredicate) => void;
  removePredicate: (index: number) => void;
}

const CohortCtx = createContext<CohortContextValue | null>(null);

export function useCohort(): CohortContextValue {
  const ctx = useContext(CohortCtx);
  if (!ctx) throw new Error("useCohort must be used within CohortProvider");
  return ctx;
}

/** Lightweight check — returns null when not on cohort route. */
export function useCohortMaybe(): CohortContextValue | null {
  return useContext(CohortCtx);
}

export function CohortProvider({ studyId, children }: { studyId: string | undefined; children: ReactNode }) {
  const [searchParams] = useSearchParams();

  // -- Query param initialization -----------------------------------------
  const initialPreset = (searchParams.get("preset") as CohortPreset) || "all";
  const initialDose = searchParams.get("dose");
  const initialSubjects = searchParams.get("subjects");
  const initialOrgan = searchParams.get("organ");

  // -- State --------------------------------------------------------------
  const [activePresets, setActivePresets] = useState<Set<CohortPreset>>(
    () => new Set([initialPreset]),
  );
  const [filterGroup, setFilterGroup] = useState<FilterGroup>(EMPTY_FILTER_GROUP);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(
    () => initialSubjects ? new Set(initialSubjects.split(",")) : new Set<string>(),
  );
  const [selectedOrgan, setSelectedOrgan] = useState<string | null>(initialOrgan);
  const [includeTK, setIncludeTK] = useState(false);
  const [doseFilter, setDoseFilter] = useState<Set<number> | null>(
    () => initialDose != null ? new Set([Number(initialDose)]) : null,
  );
  const [sexFilter, setSexFilter] = useState<Set<string> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const lastClickedIndex = useRef<number>(-1);

  // -- Backward-compatible derived `preset` value -------------------------
  // Returns the single active preset (for CohortRail's PanePillToggle)
  const preset: CohortPreset = useMemo(() => {
    if (activePresets.size === 1) return [...activePresets][0];
    if (activePresets.has("all")) return "all";
    return [...activePresets][0]; // fallback: first preset
  }, [activePresets]);

  // -- Backward-compatible setPreset (exclusive behavior) -----------------
  const setPreset = useCallback((p: CohortPreset) => {
    setActivePresets(new Set([p]));
  }, []);

  // -- New: togglePreset (multi-select behavior) --------------------------
  const togglePreset = useCallback((p: CohortPreset) => {
    setActivePresets((prev) => {
      const next = new Set(prev);
      if (p === "all") {
        // Selecting "all" clears other presets
        return new Set<CohortPreset>(["all"]);
      }
      // Remove "all" when selecting a specific preset
      next.delete("all");
      if (next.has(p)) {
        next.delete(p);
        // If nothing left, revert to "all"
        if (next.size === 0) return new Set<CohortPreset>(["all"]);
      } else {
        next.add(p);
      }
      return next;
    });
  }, []);

  // -- New: filter group actions ------------------------------------------
  const setFilterOperator = useCallback((op: FilterOperator) => {
    setFilterGroup((prev) => ({ ...prev, operator: op }));
  }, []);

  const addPredicate = useCallback((p: FilterPredicate) => {
    setFilterGroup((prev) => ({
      ...prev,
      predicates: [...prev.predicates, p],
    }));
  }, []);

  const removePredicate = useCallback((index: number) => {
    setFilterGroup((prev) => ({
      ...prev,
      predicates: prev.predicates.filter((_, i) => i !== index),
    }));
  }, []);

  // -- Sync state when URL params change after mount (e.g. "See subjects" nav) --
  const prevSubjectsParam = useRef(initialSubjects);
  useEffect(() => {
    if (initialSubjects !== prevSubjectsParam.current) {
      prevSubjectsParam.current = initialSubjects;
      if (initialSubjects) {
        setSelectedSubjects(new Set(initialSubjects.split(",")));
        setActivePresets(new Set([initialPreset]));
      } else {
        // Cleared subjects param — let auto-select take over
        setSelectedSubjects(new Set<string>());
      }
    }
  }, [initialSubjects, initialPreset]);

  // -- Data fetching (only when studyId present) --------------------------
  const { data: findingsResp, isLoading: findingsLoading } = useFindings(studyId, 1, 10000, EMPTY_FILTERS);
  const { data: subjectContext, isLoading: scLoading } = useSubjectContext(studyId);
  const { data: mortality } = useStudyMortality(studyId);
  const { data: crossAnimalFlags } = useCrossAnimalFlags(studyId);
  const { data: syndromesData } = useSubjectSyndromes(studyId);

  const findings: UnifiedFinding[] = findingsResp?.findings ?? [];
  const doseGroups: DoseGroup[] = findingsResp?.dose_groups ?? [];
  const isLoading = findingsLoading || scLoading;

  // -- Histopath per-subject severity for MI/MA cells ---------------------
  const histopathSpecimen = selectedOrgan?.toUpperCase() ?? null;
  const { data: histopathSubjects } = useHistopathSubjects(studyId, histopathSpecimen);

  const histopathMap = useMemo(() => {
    const map = new Map<string, Map<string, { severity_num: number; severity: string | null }>>();
    if (!histopathSubjects?.subjects) return map;
    for (const s of histopathSubjects.subjects) {
      const findingMap = new Map<string, { severity_num: number; severity: string | null }>();
      for (const [name, data] of Object.entries(s.findings)) {
        findingMap.set(name.toUpperCase(), { severity_num: data.severity_num, severity: data.severity });
      }
      map.set(s.usubjid, findingMap);
    }
    return map;
  }, [histopathSubjects]);
  const hasHistopathData = histopathMap.size > 0;

  // -- Derived: tissue battery gap map ------------------------------------
  const missingExamMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    if (!crossAnimalFlags) return map;
    for (const a of crossAnimalFlags.tissue_battery.flagged_animals) {
      if (a.missing_target_organs.length > 0 || a.missing_specimens.length > 0) {
        const organs = new Set([...a.missing_target_organs, ...a.missing_specimens]);
        map.set(a.animal_id, organs);
      }
    }
    return map;
  }, [crossAnimalFlags]);

  // -- Derived: subject roster --------------------------------------------
  const allSubjects = useMemo(
    () => buildCohortSubjects(subjectContext ?? [], mortality ?? null, crossAnimalFlags ?? null, findings),
    [subjectContext, mortality, crossAnimalFlags, findings],
  );

  const subjectOrganCounts = useMemo(
    () => computeSubjectOrganCounts(findings, allSubjects),
    [findings, allSubjects],
  );

  // Note: filter-engine predicates (organ, domain, bw_change) now use
  // allFindings (UnifiedFinding[]) directly, so no CohortFindingRow conversion
  // is needed for the filter context.

  // -- Build combined filter and evaluate ---------------------------------
  const presetFilter = useMemo(
    () => buildPresetFilterGroup(activePresets, filterGroup, includeTK),
    [activePresets, filterGroup, includeTK],
  );

  // Build the convenience filter (dose, sex, search) as a separate AND group
  const convenienceFilter = useMemo((): FilterGroup => {
    const predicates: FilterPredicate[] = [];
    if (doseFilter) predicates.push({ type: "dose", values: doseFilter });
    if (sexFilter) predicates.push({ type: "sex", values: sexFilter });
    if (searchQuery) predicates.push({ type: "search", query: searchQuery });
    return { operator: "and", predicates };
  }, [doseFilter, sexFilter, searchQuery]);

  // Build the FilterContext for evaluateFilter
  const filterCtx = useMemo((): FilterContext => ({
    syndromes: syndromesData?.subjects ?? {},
    allFindings: findings,
    subjectOrganCounts,
    histopathMap,
  }), [syndromesData, findings, subjectOrganCounts, histopathMap]);

  const filteredSubjects = useMemo(() => {
    // Two-stage filtering:
    // 1. Preset filter (may be OR for multi-preset, or AND for single)
    // 2. Convenience filters (always AND)
    let subjects = allSubjects.filter((s) => evaluateFilter(s, presetFilter, filterCtx));

    // Apply convenience filters as second pass (for multi-preset OR case)
    if (convenienceFilter.predicates.length > 0) {
      subjects = subjects.filter((s) => evaluateFilter(s, convenienceFilter, filterCtx));
    }

    // When navigated with explicit subject list, filter to just those subjects
    if (initialSubjects) {
      const target = new Set(initialSubjects.split(","));
      subjects = subjects.filter((s) => target.has(s.usubjid));
    }
    return subjects;
  }, [allSubjects, presetFilter, convenienceFilter, filterCtx, initialSubjects]);

  // Auto-select all filtered subjects when preset/filters change
  const prevFilterKey = useRef("");
  const filterKey = `${[...activePresets].sort().join("+")}-${filterGroup.predicates.length}-${filterGroup.operator}-${doseFilter ? [...doseFilter].sort().join(",") : "all"}-${sexFilter ? [...sexFilter].sort().join(",") : "all"}-${searchQuery}-${includeTK}`;
  if (filterKey !== prevFilterKey.current) {
    prevFilterKey.current = filterKey;
    if (!initialSubjects) {
      const newSelected = new Set(filteredSubjects.map((s) => s.usubjid));
      // Only set if actually different to avoid infinite loops
      setSelectedSubjects((prev) => {
        if (newSelected.size !== prev.size || [...newSelected].some((id) => !prev.has(id))) {
          return newSelected;
        }
        return prev;
      });
    }
  }

  const activeSubjects = useMemo(() => {
    const active = filteredSubjects.filter((s) => selectedSubjects.has(s.usubjid));
    // Fallback: if selection is empty but subjects exist, the auto-select state
    // update hasn't taken effect yet (same render cycle). Use all filtered.
    if (active.length === 0 && filteredSubjects.length > 0 && !initialSubjects) {
      return filteredSubjects;
    }
    return active;
  }, [filteredSubjects, selectedSubjects, initialSubjects]);

  const displaySubjects = useMemo(() => {
    if (activeSubjects.length <= MAX_SUBJECT_COLUMNS) return activeSubjects;
    return [...activeSubjects].sort((a, b) => b.doseGroupOrder - a.doseGroupOrder).slice(0, MAX_SUBJECT_COLUMNS);
  }, [activeSubjects]);

  // -- Derived: organ signals and finding rows ----------------------------
  const organSignals = useMemo(
    () => computeOrganSignals(findings, activeSubjects),
    [findings, activeSubjects],
  );

  // Auto-select highest-signal organ (skip if entry point specified one)
  const organAutoSelected = useRef(initialOrgan != null);
  if (!organAutoSelected.current && selectedOrgan === null && organSignals.length > 0) {
    organAutoSelected.current = true;
    const best = organSignals.reduce((a, b) => {
      if (a.worstSeverity === "adverse" && b.worstSeverity !== "adverse") return a;
      if (b.worstSeverity === "adverse" && a.worstSeverity !== "adverse") return b;
      return b.findingCount > a.findingCount ? b : a;
    });
    setSelectedOrgan(best.organName);
  }

  const findingRows = useMemo(
    () => selectedOrgan ? buildCohortFindingRows(findings, selectedOrgan, activeSubjects) : [],
    [findings, selectedOrgan, activeSubjects],
  );

  const sharedFindings = useMemo(
    () => activeSubjects.length >= 2 ? computeSharedFindings(findings, activeSubjects) : [],
    [findings, activeSubjects],
  );

  // -- Handlers -----------------------------------------------------------
  const toggleSubject = useCallback((usubjid: string, shiftKey: boolean) => {
    setSelectedSubjects((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastClickedIndex.current >= 0) {
        const clickedIdx = filteredSubjects.findIndex((s) => s.usubjid === usubjid);
        if (clickedIdx >= 0) {
          const start = Math.min(lastClickedIndex.current, clickedIdx);
          const end = Math.max(lastClickedIndex.current, clickedIdx);
          for (let i = start; i <= end; i++) {
            next.add(filteredSubjects[i].usubjid);
          }
        }
      } else {
        if (next.has(usubjid)) {
          if (next.size > 1) next.delete(usubjid);
        } else {
          next.add(usubjid);
        }
      }
      return next;
    });
    lastClickedIndex.current = filteredSubjects.findIndex((s) => s.usubjid === usubjid);
  }, [filteredSubjects]);

  const value: CohortContextValue = useMemo(() => ({
    isLoading,
    findings,
    doseGroups,
    missingExamMap,
    histopathMap,
    hasHistopathData,
    subjectOrganCounts,
    allSubjects,
    filteredSubjects,
    activeSubjects,
    displaySubjects,
    preset,
    activePresets,
    filterGroup,
    selectedSubjects,
    selectedOrgan,
    includeTK,
    doseFilter,
    sexFilter,
    searchQuery,
    hoveredRow,
    organSignals,
    findingRows,
    sharedFindings,
    truncated: activeSubjects.length > MAX_SUBJECT_COLUMNS,
    setPreset,
    togglePreset,
    setFilterGroup,
    setFilterOperator,
    addPredicate,
    removePredicate,
    toggleSubject,
    setSelectedOrgan,
    setIncludeTK,
    setDoseFilter,
    setSexFilter,
    setSearchQuery,
    setHoveredRow,
  }), [
    isLoading, findings, doseGroups, missingExamMap, histopathMap, hasHistopathData,
    subjectOrganCounts, allSubjects, filteredSubjects,
    activeSubjects, displaySubjects, preset, activePresets, filterGroup,
    selectedSubjects, selectedOrgan, includeTK, doseFilter, sexFilter, searchQuery,
    hoveredRow, organSignals, findingRows, sharedFindings,
    setPreset, togglePreset, setFilterGroup, setFilterOperator,
    addPredicate, removePredicate, toggleSubject,
  ]);

  return <CohortCtx.Provider value={value}>{children}</CohortCtx.Provider>;
}
