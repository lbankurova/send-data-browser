import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { UnifiedFinding } from "@/types/analysis";
import { useViewSelection } from "@/contexts/ViewSelectionContext";

export type GroupSelectionType = "organ" | "syndrome" | null;

interface FindingSelectionState {
  selectedFindingId: string | null;
  selectedFinding: UnifiedFinding | null;
  selectFinding: (finding: UnifiedFinding | null) => void;
  /** Aggregate sexes per endpoint_label, set by FindingsView. */
  endpointSexes: Map<string, string[]>;
  setEndpointSexes: (map: Map<string, string[]>) => void;
  /** Group-level selection: organ or syndrome card header clicked. */
  selectedGroupType: GroupSelectionType;
  selectedGroupKey: string | null;
  selectGroup: (type: GroupSelectionType, key: string | null) => void;
}

const FindingSelectionContext = createContext<FindingSelectionState>({
  selectedFindingId: null,
  selectedFinding: null,
  selectFinding: () => {},
  endpointSexes: new Map(),
  setEndpointSexes: () => {},
  selectedGroupType: null,
  selectedGroupKey: null,
  selectGroup: () => {},
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
  const [selectedGroupType, setSelectedGroupType] = useState<GroupSelectionType>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const { setSelectedSubject } = useViewSelection();

  const selectFinding = useCallback((finding: UnifiedFinding | null) => {
    setSelectedFinding(finding);
    // Endpoint selection clears group selection (priority 1 > priority 2)
    if (finding) {
      setSelectedGroupType(null);
      setSelectedGroupKey(null);
      setSelectedSubject(null); // clear subject panel
    }
  }, [setSelectedSubject]);

  const selectGroup = useCallback((type: GroupSelectionType, key: string | null) => {
    setSelectedGroupType(type);
    setSelectedGroupKey(key);
    // Group selection clears endpoint selection
    if (type && key) {
      setSelectedFinding(null);
      setSelectedSubject(null); // clear subject panel
    }
  }, [setSelectedSubject]);

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
        selectedGroupType,
        selectedGroupKey,
        selectGroup,
      }}
    >
      {children}
    </FindingSelectionContext.Provider>
  );
}

export function useFindingSelection() {
  return useContext(FindingSelectionContext);
}
