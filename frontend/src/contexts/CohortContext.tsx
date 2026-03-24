/**
 * CohortContext — shared state for the Cohort View.
 *
 * Provided at Layout level so both CohortRail (ShellRailPanel) and
 * CohortView (Outlet) can consume it. Lightweight when not on the cohort route.
 */
import { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useFindings } from "@/hooks/useFindings";
import { useSubjectContext } from "@/hooks/useSubjectContext";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useCrossAnimalFlags } from "@/hooks/useCrossAnimalFlags";
import { buildCohortSubjects, computePresetSubjects, computeOrganSignals, buildCohortFindingRows, computeSharedFindings } from "@/lib/cohort-engine";
import type { CohortPreset, CohortSubject, OrganSignal, CohortFindingRow, SharedFinding } from "@/types/cohort";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";

const EMPTY_FILTERS = { domain: null, severity: null, search: "", sex: null, organ_system: null, endpoint_label: null, dose_response_pattern: null };
const MAX_SUBJECT_COLUMNS = 20;

export interface CohortContextValue {
  // Data loading
  isLoading: boolean;
  // Raw data
  findings: UnifiedFinding[];
  doseGroups: DoseGroup[];
  // Subject roster
  allSubjects: CohortSubject[];
  filteredSubjects: CohortSubject[];
  activeSubjects: CohortSubject[];
  displaySubjects: CohortSubject[];
  // State
  preset: CohortPreset;
  selectedSubjects: Set<string>;
  selectedOrgan: string | null;
  includeTK: boolean;
  doseFilter: Set<number> | null;
  sexFilter: Set<string> | null;
  searchQuery: string;
  hoveredRow: string | null;
  // Derived
  organSignals: OrganSignal[];
  findingRows: CohortFindingRow[];
  sharedFindings: SharedFinding[];
  truncated: boolean;
  // Actions
  setPreset: (p: CohortPreset) => void;
  toggleSubject: (id: string, shiftKey: boolean) => void;
  setSelectedOrgan: (organ: string | null) => void;
  setIncludeTK: (v: boolean) => void;
  setDoseFilter: (v: Set<number> | null) => void;
  setSexFilter: (v: Set<string> | null) => void;
  setSearchQuery: (v: string) => void;
  setHoveredRow: (key: string | null) => void;
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

  // ── Query param initialization ─────────────────────────────
  const initialPreset = (searchParams.get("preset") as CohortPreset) || "all";
  const initialDose = searchParams.get("dose");
  const initialSubjects = searchParams.get("subjects");

  // ── State ──────────────────────────────────────────────────
  const [preset, setPreset] = useState<CohortPreset>(initialPreset);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(
    () => initialSubjects ? new Set(initialSubjects.split(",")) : new Set<string>(),
  );
  const [selectedOrgan, setSelectedOrgan] = useState<string | null>(null);
  const [includeTK, setIncludeTK] = useState(false);
  const [doseFilter, setDoseFilter] = useState<Set<number> | null>(
    () => initialDose != null ? new Set([Number(initialDose)]) : null,
  );
  const [sexFilter, setSexFilter] = useState<Set<string> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const lastClickedIndex = useRef<number>(-1);

  // ── Data fetching (only when studyId present) ──────────────
  const { data: findingsResp, isLoading: findingsLoading } = useFindings(studyId, 1, 10000, EMPTY_FILTERS);
  const { data: subjectContext, isLoading: scLoading } = useSubjectContext(studyId);
  const { data: mortality } = useStudyMortality(studyId);
  const { data: crossAnimalFlags } = useCrossAnimalFlags(studyId);

  const findings: UnifiedFinding[] = findingsResp?.findings ?? [];
  const doseGroups: DoseGroup[] = findingsResp?.dose_groups ?? [];
  const isLoading = findingsLoading || scLoading;

  // ── Derived: subject roster ────────────────────────────────
  const allSubjects = useMemo(
    () => buildCohortSubjects(subjectContext ?? [], mortality ?? null, crossAnimalFlags ?? null, findings),
    [subjectContext, mortality, crossAnimalFlags, findings],
  );

  const presetSubjectIds = useMemo(
    () => computePresetSubjects(allSubjects, preset, includeTK),
    [allSubjects, preset, includeTK],
  );

  const filteredSubjects = useMemo(() => {
    let subjects = allSubjects.filter((s) => presetSubjectIds.has(s.usubjid));
    if (doseFilter) subjects = subjects.filter((s) => doseFilter.has(s.doseGroupOrder));
    if (sexFilter) subjects = subjects.filter((s) => sexFilter.has(s.sex));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      subjects = subjects.filter((s) => s.usubjid.toLowerCase().includes(q));
    }
    return subjects;
  }, [allSubjects, presetSubjectIds, doseFilter, sexFilter, searchQuery]);

  // Auto-select all filtered subjects when preset/filters change
  const prevFilterKey = useRef("");
  const filterKey = `${preset}-${doseFilter ? [...doseFilter].sort().join(",") : "all"}-${sexFilter ? [...sexFilter].sort().join(",") : "all"}-${searchQuery}-${includeTK}`;
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
    const filteredIds = new Set(filteredSubjects.map((s) => s.usubjid));
    return filteredSubjects.filter((s) => selectedSubjects.has(s.usubjid) && filteredIds.has(s.usubjid));
  }, [filteredSubjects, selectedSubjects]);

  const displaySubjects = useMemo(() => {
    if (activeSubjects.length <= MAX_SUBJECT_COLUMNS) return activeSubjects;
    return [...activeSubjects].sort((a, b) => b.doseGroupOrder - a.doseGroupOrder).slice(0, MAX_SUBJECT_COLUMNS);
  }, [activeSubjects]);

  // ── Derived: organ signals and finding rows ────────────────
  const organSignals = useMemo(
    () => computeOrganSignals(findings, activeSubjects),
    [findings, activeSubjects],
  );

  // Auto-select highest-signal organ
  const organAutoSelected = useRef(false);
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

  // ── Handlers ───────────────────────────────────────────────
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
    allSubjects,
    filteredSubjects,
    activeSubjects,
    displaySubjects,
    preset,
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
    toggleSubject,
    setSelectedOrgan,
    setIncludeTK,
    setDoseFilter,
    setSexFilter,
    setSearchQuery,
    setHoveredRow,
  }), [
    isLoading, findings, doseGroups, allSubjects, filteredSubjects,
    activeSubjects, displaySubjects, preset, selectedSubjects,
    selectedOrgan, includeTK, doseFilter, sexFilter, searchQuery,
    hoveredRow, organSignals, findingRows, sharedFindings, toggleSubject,
  ]);

  return <CohortCtx.Provider value={value}>{children}</CohortCtx.Provider>;
}
