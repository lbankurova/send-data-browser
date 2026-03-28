import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

interface SelectionState {
  selectedStudyId: string | null;
  selectStudy: (studyId: string | null) => void;
  /** Set when portfolio mode has a program selected — drives portfolio context panel */
  selectedProjectId: string | null;
  selectProject: (projectId: string | null) => void;
}

const SelectionContext = createContext<SelectionState>({
  selectedStudyId: null,
  selectStudy: () => {},
  selectedProjectId: null,
  selectProject: () => {},
});

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const selectStudy = useCallback((studyId: string | null) => {
    setSelectedStudyId(studyId);
  }, []);

  const selectProject = useCallback((projectId: string | null) => {
    setSelectedProjectId(projectId);
  }, []);

  return (
    <SelectionContext.Provider value={{ selectedStudyId, selectStudy, selectedProjectId, selectProject }}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection() {
  return useContext(SelectionContext);
}
