import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { UnifiedFinding } from "@/types/analysis";

interface FindingSelectionState {
  selectedFindingId: string | null;
  selectedFinding: UnifiedFinding | null;
  selectFinding: (finding: UnifiedFinding | null) => void;
}

const FindingSelectionContext = createContext<FindingSelectionState>({
  selectedFindingId: null,
  selectedFinding: null,
  selectFinding: () => {},
});

export function FindingSelectionProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedFinding, setSelectedFinding] =
    useState<UnifiedFinding | null>(null);

  const selectFinding = useCallback((finding: UnifiedFinding | null) => {
    setSelectedFinding(finding);
  }, []);

  return (
    <FindingSelectionContext.Provider
      value={{
        selectedFindingId: selectedFinding?.id ?? null,
        selectedFinding,
        selectFinding,
      }}
    >
      {children}
    </FindingSelectionContext.Provider>
  );
}

export function useFindingSelection() {
  return useContext(FindingSelectionContext);
}
