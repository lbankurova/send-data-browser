import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { SignalSelection } from "@/types/analysis-views";

interface SignalSelectionContextValue {
  selection: SignalSelection | null;
  setSelection: (sel: SignalSelection | null) => void;
}

const SignalSelectionContext = createContext<SignalSelectionContextValue>({
  selection: null,
  setSelection: () => {},
});

export function SignalSelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelectionState] = useState<SignalSelection | null>(null);

  const setSelection = useCallback((sel: SignalSelection | null) => {
    setSelectionState(sel);
  }, []);

  return (
    <SignalSelectionContext.Provider value={{ selection, setSelection }}>
      {children}
    </SignalSelectionContext.Provider>
  );
}

export function useSignalSelection() {
  return useContext(SignalSelectionContext);
}
