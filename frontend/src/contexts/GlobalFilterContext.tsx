import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import { useStudySelection } from "./StudySelectionContext";

// ---------------------------------------------------------------------------
// Filter shape
// ---------------------------------------------------------------------------

export interface GlobalFilters {
  sex: string | null;         // "M" | "F" | null (all)
  adverseOnly: boolean;
  significantOnly: boolean;
  minSeverity: number;        // 0 = no filter
  search: string;
}

const DEFAULT_FILTERS: GlobalFilters = {
  sex: null,
  adverseOnly: false,
  significantOnly: false,
  minSeverity: 0,
  search: "",
};

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

interface GlobalFilterContextValue {
  filters: GlobalFilters;
  setFilters: (update: Partial<GlobalFilters>) => void;
  resetFilters: () => void;
  /** Number of active filters (for badge display). */
  activeCount: number;
}

const GlobalFilterContext = createContext<GlobalFilterContextValue>({
  filters: DEFAULT_FILTERS,
  setFilters: () => {},
  resetFilters: () => {},
  activeCount: 0,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function GlobalFilterProvider({ children }: { children: ReactNode }) {
  const { selection, navigateTo } = useStudySelection();
  const [filters, setFiltersState] = useState<GlobalFilters>(DEFAULT_FILTERS);

  // Reset filters on study switch
  const prevStudyId = useRef(selection.studyId);
  if (selection.studyId !== prevStudyId.current) {
    prevStudyId.current = selection.studyId;
    setFiltersState(DEFAULT_FILTERS);
  }

  // Bidirectional sex sync: StudySelection.sex → filters.sex
  useEffect(() => {
    if (selection.sex !== undefined && selection.sex !== filters.sex) {
      setFiltersState((f) => ({ ...f, sex: selection.sex ?? null }));
    }
    // Only sync when selection.sex changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.sex]);

  const setFilters = useCallback(
    (update: Partial<GlobalFilters>) => {
      setFiltersState((prev) => {
        const next = { ...prev, ...update };
        // Bidirectional: filters.sex → StudySelection.sex
        if ("sex" in update && update.sex !== prev.sex) {
          navigateTo({ sex: update.sex ?? undefined });
        }
        return next;
      });
    },
    [navigateTo],
  );

  const resetFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS);
    navigateTo({ sex: undefined });
  }, [navigateTo]);

  const activeCount =
    (filters.sex ? 1 : 0) +
    (filters.adverseOnly ? 1 : 0) +
    (filters.significantOnly ? 1 : 0) +
    (filters.minSeverity > 0 ? 1 : 0) +
    (filters.search ? 1 : 0);

  return (
    <GlobalFilterContext.Provider
      value={{ filters, setFilters, resetFilters, activeCount }}
    >
      {children}
    </GlobalFilterContext.Provider>
  );
}

export function useGlobalFilters() {
  return useContext(GlobalFilterContext);
}
