import { createContext, useContext, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { UnifiedFinding, GroupStat, PairwiseResult } from "@/types/analysis";

interface ScheduledOnlyContextValue {
  /** When true, display scheduled-only stats (early-death subjects excluded). */
  useScheduledOnly: boolean;
  setUseScheduledOnly: (v: boolean) => void;
  /** Return the active group stats based on toggle state. */
  getActiveGroupStats: (finding: UnifiedFinding) => GroupStat[];
  /** Return the active pairwise results based on toggle state. */
  getActivePairwise: (finding: UnifiedFinding) => PairwiseResult[];
  /** Return the active direction based on toggle state. */
  getActiveDirection: (finding: UnifiedFinding) => UnifiedFinding["direction"];
}

const ScheduledOnlyContext = createContext<ScheduledOnlyContextValue>({
  useScheduledOnly: true,
  setUseScheduledOnly: () => {},
  getActiveGroupStats: (f) => f.group_stats,
  getActivePairwise: (f) => f.pairwise,
  getActiveDirection: (f) => f.direction,
});

export function ScheduledOnlyProvider({
  children,
  hasEarlyDeaths,
}: {
  children: ReactNode;
  /** Only enable toggling when the study has early-death subjects. */
  hasEarlyDeaths: boolean;
}) {
  const [useScheduledOnly, setUseScheduledOnly] = useState(true);

  const getActiveGroupStats = useCallback(
    (finding: UnifiedFinding): GroupStat[] => {
      if (useScheduledOnly && hasEarlyDeaths && finding.scheduled_group_stats) {
        return finding.scheduled_group_stats;
      }
      return finding.group_stats;
    },
    [useScheduledOnly, hasEarlyDeaths],
  );

  const getActivePairwise = useCallback(
    (finding: UnifiedFinding): PairwiseResult[] => {
      if (useScheduledOnly && hasEarlyDeaths && finding.scheduled_pairwise) {
        return finding.scheduled_pairwise;
      }
      return finding.pairwise;
    },
    [useScheduledOnly, hasEarlyDeaths],
  );

  const getActiveDirection = useCallback(
    (finding: UnifiedFinding): UnifiedFinding["direction"] => {
      if (useScheduledOnly && hasEarlyDeaths && finding.scheduled_direction !== undefined) {
        return finding.scheduled_direction;
      }
      return finding.direction;
    },
    [useScheduledOnly, hasEarlyDeaths],
  );

  return (
    <ScheduledOnlyContext.Provider
      value={{
        useScheduledOnly,
        setUseScheduledOnly,
        getActiveGroupStats,
        getActivePairwise,
        getActiveDirection,
      }}
    >
      {children}
    </ScheduledOnlyContext.Provider>
  );
}

export function useScheduledOnly(): ScheduledOnlyContextValue {
  return useContext(ScheduledOnlyContext);
}
