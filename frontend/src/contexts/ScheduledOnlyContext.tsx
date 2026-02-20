import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import type { UnifiedFinding, GroupStat, PairwiseResult } from "@/types/analysis";

interface ScheduledOnlyContextValue {
  /** Set of USUBJIDs currently excluded from terminal stats. */
  excludedSubjects: Set<string>;
  /** Toggle a single subject's exclusion status. */
  toggleSubjectExclusion: (id: string) => void;
  /** Replace the entire excluded set. */
  setExcludedSubjects: (s: Set<string>) => void;
  /** The early-death subject map from mortality data: {USUBJID: disposition}. */
  earlyDeathSubjects: Record<string, string>;
  /** The subset of early-death subject IDs that are treatment-related. */
  trEarlyDeathIds: Set<string>;
  /**
   * Set by the view that knows about mortality data.
   * @param subjects Full early-death subject map {USUBJID: disposition}
   * @param trIds Set of USUBJIDs that are treatment-related early deaths
   *
   * Auto-initializes exclusions: TR early deaths excluded, accidental included.
   */
  setEarlyDeathSubjects: (subjects: Record<string, string>, trIds: Set<string>) => void;
  /** Derived: true when any TR early-death subject is excluded → scheduled stats active. */
  useScheduledOnly: boolean;
  /** Bulk control: true → exclude all TR early deaths (default), false → include all. */
  setUseScheduledOnly: (v: boolean) => void;
  /** Derived: true when the study has any early-death subjects. */
  hasEarlyDeaths: boolean;
  /** Return the active group stats based on exclusion state. */
  getActiveGroupStats: (finding: UnifiedFinding) => GroupStat[];
  /** Return the active pairwise results based on exclusion state. */
  getActivePairwise: (finding: UnifiedFinding) => PairwiseResult[];
  /** Return the active direction based on exclusion state. */
  getActiveDirection: (finding: UnifiedFinding) => UnifiedFinding["direction"];
}

const EMPTY_SET = new Set<string>();
const EMPTY_SUBJECTS: Record<string, string> = {};

const ScheduledOnlyContext = createContext<ScheduledOnlyContextValue>({
  excludedSubjects: EMPTY_SET,
  toggleSubjectExclusion: () => {},
  setExcludedSubjects: () => {},
  earlyDeathSubjects: EMPTY_SUBJECTS,
  trEarlyDeathIds: EMPTY_SET,
  setEarlyDeathSubjects: () => {},
  useScheduledOnly: true,
  setUseScheduledOnly: () => {},
  hasEarlyDeaths: false,
  getActiveGroupStats: (f) => f.group_stats,
  getActivePairwise: (f) => f.pairwise,
  getActiveDirection: (f) => f.direction,
});

export function ScheduledOnlyProvider({ children }: { children: ReactNode }) {
  const [excludedSubjects, setExcludedSubjects] = useState<Set<string>>(EMPTY_SET);
  const [earlyDeathSubjects, setEarlyDeathSubjectsRaw] = useState<Record<string, string>>(EMPTY_SUBJECTS);
  const [trEarlyDeathIds, setTrEarlyDeathIdsRaw] = useState<Set<string>>(EMPTY_SET);

  const hasEarlyDeaths = useMemo(
    () => Object.keys(earlyDeathSubjects).length > 0,
    [earlyDeathSubjects],
  );

  // Scheduled stats active when any TR early-death subject is excluded.
  // Accidental-only exclusions don't trigger the switch because:
  // (a) accidental deaths are included by default (valid drug-exposure data)
  // (b) the binary pre-computed scheduled_group_stats can't represent partial exclusion
  const anyTrExcluded = useMemo(
    () => [...trEarlyDeathIds].some((id) => excludedSubjects.has(id)),
    [trEarlyDeathIds, excludedSubjects],
  );

  /**
   * Initialize from mortality data. Default exclusions follow regulatory tox convention:
   * - TR deaths (moribund sacrifice, found dead): excluded — terminal data skews group means
   * - Accidental deaths (gavage error, procedural): included — valid drug-exposure data
   * - Recovery deaths: handled by arm filtering, not subject exclusion
   */
  const setEarlyDeathSubjects = useCallback(
    (subjects: Record<string, string>, trIds: Set<string>) => {
      setEarlyDeathSubjectsRaw(subjects);
      setTrEarlyDeathIdsRaw(trIds);
      // Default: exclude only TR early deaths
      setExcludedSubjects(trIds.size > 0 ? new Set(trIds) : EMPTY_SET);
    },
    [],
  );

  const toggleSubjectExclusion = useCallback(
    (id: string) => {
      setExcludedSubjects((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [],
  );

  // Bulk control: true = exclude all TR early deaths (default), false = include all
  const setUseScheduledOnly = useCallback(
    (v: boolean) => {
      if (v) {
        setExcludedSubjects(new Set(trEarlyDeathIds));
      } else {
        setExcludedSubjects(EMPTY_SET);
      }
    },
    [trEarlyDeathIds],
  );

  const getActiveGroupStats = useCallback(
    (finding: UnifiedFinding): GroupStat[] => {
      if (anyTrExcluded && finding.scheduled_group_stats) {
        return finding.scheduled_group_stats;
      }
      return finding.group_stats;
    },
    [anyTrExcluded],
  );

  const getActivePairwise = useCallback(
    (finding: UnifiedFinding): PairwiseResult[] => {
      if (anyTrExcluded && finding.scheduled_pairwise) {
        return finding.scheduled_pairwise;
      }
      return finding.pairwise;
    },
    [anyTrExcluded],
  );

  const getActiveDirection = useCallback(
    (finding: UnifiedFinding): UnifiedFinding["direction"] => {
      if (anyTrExcluded && finding.scheduled_direction !== undefined) {
        return finding.scheduled_direction;
      }
      return finding.direction;
    },
    [anyTrExcluded],
  );

  return (
    <ScheduledOnlyContext.Provider
      value={{
        excludedSubjects,
        toggleSubjectExclusion,
        setExcludedSubjects,
        earlyDeathSubjects,
        trEarlyDeathIds,
        setEarlyDeathSubjects,
        useScheduledOnly: anyTrExcluded,
        setUseScheduledOnly,
        hasEarlyDeaths,
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
