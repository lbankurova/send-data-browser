import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySelection = Record<string, any> | null;

interface ViewSelectionState {
  selection: AnySelection;
  setSelection: (sel: AnySelection) => void;
  selectedSubject: string | null;
  setSelectedSubject: (usubjid: string | null) => void;
}

const ViewSelectionContext = createContext<ViewSelectionState>({
  selection: null,
  setSelection: () => {},
  selectedSubject: null,
  setSelectedSubject: () => {},
});

export function ViewSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionRaw] = useState<AnySelection>(null);
  const [selectedSubject, setSelectedSubjectRaw] = useState<string | null>(null);
  const setSelection = useCallback((sel: AnySelection) => setSelectionRaw(sel), []);
  const setSelectedSubject = useCallback((usubjid: string | null) => setSelectedSubjectRaw(usubjid), []);

  return (
    <ViewSelectionContext.Provider value={{ selection, setSelection, selectedSubject, setSelectedSubject }}>
      {children}
    </ViewSelectionContext.Provider>
  );
}

export function useViewSelection() {
  return useContext(ViewSelectionContext);
}
