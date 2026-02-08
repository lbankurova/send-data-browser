import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { SignalSelection } from "@/types/analysis-views";

interface SignalSelectionContextValue {
  selection: SignalSelection | null;
  setSelection: (sel: SignalSelection | null) => void;
  organSelection: string | null;
  setOrganSelection: (organ: string | null) => void;
}

const SignalSelectionContext = createContext<SignalSelectionContextValue>({
  selection: null,
  setSelection: () => {},
  organSelection: null,
  setOrganSelection: () => {},
});

export function SignalSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionState] = useState<SignalSelection | null>(null);
  const [organSelection, setOrganState] = useState<string | null>(null);

  const setSelection = useCallback((sel: SignalSelection | null) => {
    setSelectionState(sel);
    if (sel) setOrganState(null); // endpoint selection clears organ selection
  }, []);

  const setOrganSelection = useCallback((organ: string | null) => {
    setOrganState(organ);
    if (organ) setSelectionState(null); // organ selection clears endpoint selection
  }, []);

  return (
    <SignalSelectionContext.Provider
      value={{ selection, setSelection, organSelection, setOrganSelection }}
    >
      {children}
    </SignalSelectionContext.Provider>
  );
}

export function useSignalSelection() {
  return useContext(SignalSelectionContext);
}
