import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { UnifiedFinding } from "@/types/analysis";

interface FindingSelectionState {
  selectedFindingId: string | null;
  selectedFinding: UnifiedFinding | null;
  selectFinding: (finding: UnifiedFinding | null) => void;
  /** Aggregate sexes per endpoint_label, set by FindingsView. */
  endpointSexes: Map<string, string[]>;
  setEndpointSexes: (map: Map<string, string[]>) => void;
}

const FindingSelectionContext = createContext<FindingSelectionState>({
  selectedFindingId: null,
  selectedFinding: null,
  selectFinding: () => {},
  endpointSexes: new Map(),
  setEndpointSexes: () => {},
});

export function FindingSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedFinding, setSelectedFinding] =
    useState<UnifiedFinding | null>(null);
  const [endpointSexes, setEndpointSexes] = useState<Map<string, string[]>>(
    () => new Map(),
  );

  const selectFinding = useCallback((finding: UnifiedFinding | null) => {
    setSelectedFinding(finding);
  }, []);

  const stableSetEndpointSexes = useCallback(
    (map: Map<string, string[]>) => setEndpointSexes(map),
    [],
  );

  return (
    <FindingSelectionContext.Provider
      value={{
        selectedFindingId: selectedFinding?.id ?? null,
        selectedFinding,
        selectFinding,
        endpointSexes,
        setEndpointSexes: stableSetEndpointSexes,
      }}
    >
      {children}
    </FindingSelectionContext.Provider>
  );
}

export function useFindingSelection() {
  return useContext(FindingSelectionContext);
}
