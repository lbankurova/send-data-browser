import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySelection = Record<string, any> | null;

interface ViewSelectionState {
  selection: AnySelection;
  setSelection: (sel: AnySelection) => void;
}

const ViewSelectionContext = createContext<ViewSelectionState>({
  selection: null,
  setSelection: () => {},
});

export function ViewSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionRaw] = useState<AnySelection>(null);
  const setSelection = useCallback((sel: AnySelection) => setSelectionRaw(sel), []);

  return (
    <ViewSelectionContext.Provider value={{ selection, setSelection }}>
      {children}
    </ViewSelectionContext.Provider>
  );
}

export function useViewSelection() {
  return useContext(ViewSelectionContext);
}
