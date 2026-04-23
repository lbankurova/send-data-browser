/**
 * Lightweight context for sharing SubjectValue[] between the distribution
 * chart (CenterDistribution / DistributionPane) and the LOO Sensitivity
 * info pane. The chart writes; the pane reads for impact preview computation.
 *
 * Falls back gracefully: if the chart isn't mounted (collapsed/different tab),
 * the values are empty and the preview shows "updates on apply."
 */
import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";

interface SubjectEntry {
  usubjid: string;
  value: number;
  dose_level: number;
}

interface DistributionSubjectsContextValue {
  /** Control-group subject values for the current endpoint. */
  controlValues: SubjectEntry[];
  /** Treated-group subject values for the current endpoint (all dose levels). */
  treatedValues: SubjectEntry[];
  /** Endpoint label the values belong to. */
  endpointLabel: string | null;
  /** Called by distribution chart to publish its computed arrays. */
  setSubjectValues: (endpointLabel: string, control: SubjectEntry[], treated: SubjectEntry[]) => void;
}

const DistributionSubjectsContext = createContext<DistributionSubjectsContextValue>({
  controlValues: [],
  treatedValues: [],
  endpointLabel: null,
  setSubjectValues: () => {},
});

export function DistributionSubjectsProvider({ children }: { children: ReactNode }) {
  const [controlValues, setControlValues] = useState<SubjectEntry[]>([]);
  const [treatedValues, setTreatedValues] = useState<SubjectEntry[]>([]);
  const [endpointLabel, setEndpointLabel] = useState<string | null>(null);

  const setSubjectValues = useCallback(
    (ep: string, control: SubjectEntry[], treated: SubjectEntry[]) => {
      setEndpointLabel(ep);
      setControlValues(control);
      setTreatedValues(treated);
    },
    [],
  );

  const value = useMemo(
    () => ({ controlValues, treatedValues, endpointLabel, setSubjectValues }),
    [controlValues, treatedValues, endpointLabel, setSubjectValues],
  );

  return (
    <DistributionSubjectsContext.Provider value={value}>
      {children}
    </DistributionSubjectsContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- Co-located hook with Provider is the canonical React Context pattern; HMR penalty accepted.
export function useDistributionSubjects(): DistributionSubjectsContextValue {
  return useContext(DistributionSubjectsContext);
}

export type { SubjectEntry };
