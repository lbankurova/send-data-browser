import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { SignalSelection, SignalViewSelection } from "@/types/analysis-views";

interface SignalSelectionContextValue {
  /** Unified selection state — discriminated union with 'none', 'organ', 'endpoint' levels. */
  viewSelection: SignalViewSelection;
  setOrganSelection: (organSystem: string) => void;
  setEndpointSelection: (sel: SignalSelection) => void;
  clearSelection: () => void;

  // Backward-compat: derived getters for consumers that haven't migrated yet.
  selection: SignalSelection | null;
  setSelection: (sel: SignalSelection | null) => void;
  organSelection: string | null;
  setOrganSelection_legacy: (organ: string | null) => void;
}

const SignalSelectionContext = createContext<SignalSelectionContextValue>({
  viewSelection: { level: "none" },
  setOrganSelection: () => {},
  setEndpointSelection: () => {},
  clearSelection: () => {},
  selection: null,
  setSelection: () => {},
  organSelection: null,
  setOrganSelection_legacy: () => {},
});

export function SignalSelectionProvider({ children }: { children: ReactNode }) {
  const [viewSelection, setViewSelection] = useState<SignalViewSelection>({ level: "none" });

  const setOrganSelection = useCallback((organSystem: string) => {
    setViewSelection({ level: "organ", organSystem });
  }, []);

  const setEndpointSelection = useCallback((sel: SignalSelection) => {
    setViewSelection({ level: "endpoint", endpoint: sel });
  }, []);

  const clearSelection = useCallback(() => {
    setViewSelection({ level: "none" });
  }, []);

  // Backward-compat wrappers
  const selection = viewSelection.level === "endpoint" ? viewSelection.endpoint : null;
  const organSelection = viewSelection.level === "organ" ? viewSelection.organSystem : null;

  const setSelection = useCallback((sel: SignalSelection | null) => {
    if (sel) setViewSelection({ level: "endpoint", endpoint: sel });
    else setViewSelection({ level: "none" });
  }, []);

  const setOrganSelection_legacy = useCallback((organ: string | null) => {
    if (organ) setViewSelection({ level: "organ", organSystem: organ });
    else setViewSelection({ level: "none" });
  }, []);

  return (
    <SignalSelectionContext.Provider
      value={{
        viewSelection,
        setOrganSelection,
        setEndpointSelection,
        clearSelection,
        selection,
        setSelection,
        organSelection,
        setOrganSelection_legacy,
      }}
    >
      {children}
    </SignalSelectionContext.Provider>
  );
}

export function useSignalSelection() {
  return useContext(SignalSelectionContext);
}
