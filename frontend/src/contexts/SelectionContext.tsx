import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

interface SelectionState {
  selectedStudyId: string | null;
  selectStudy: (studyId: string | null) => void;
}

const SelectionContext = createContext<SelectionState>({
  selectedStudyId: null,
  selectStudy: () => {},
});

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);

  const selectStudy = useCallback((studyId: string | null) => {
    setSelectedStudyId(studyId);
  }, []);

  return (
    <SelectionContext.Provider value={{ selectedStudyId, selectStudy }}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  return useContext(SelectionContext);
}
