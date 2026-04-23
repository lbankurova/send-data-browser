import { createContext, useContext, useCallback, useMemo, useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useSessionState, isOneOf } from "@/hooks/useSessionState";
import { buildSettingsParams } from "@/lib/build-settings-params";
import type { EffectSizeMethod, MultiplicityMethod } from "@/lib/stat-method-transforms";

// ── Allowed values (single source of truth) ──────────────────
// These const arrays define both the runtime validator AND the TS type.

export const RECOVERY_POOLING_VALUES = ["pool", "separate"] as const;
export const EFFECT_SIZE_VALUES = ["hedges-g", "cohens-d", "glass-delta"] as const;
export const MULTIPLICITY_VALUES = ["dunnett-fwer", "bonferroni"] as const;
export const PAIRWISE_TEST_VALUES = ["dunnett", "williams", "steel"] as const;
export const INCIDENCE_PAIRWISE_VALUES = ["boschloo", "fisher"] as const;
export const TREND_TEST_VALUES = ["jonckheere", "cuzick", "williams-trend"] as const;
export const INCIDENCE_TREND_VALUES = ["cochran-armitage", "logistic-slope"] as const;
export const ORGAN_WEIGHT_METHOD_VALUES = ["recommended", "absolute", "ratio-bw", "ratio-brain"] as const;

// ── Types (derived from the arrays) ──────────────────────────

export interface StudySettings {
  scheduledOnly: boolean;
  recoveryPooling: typeof RECOVERY_POOLING_VALUES[number];
  effectSize: EffectSizeMethod;
  multiplicity: MultiplicityMethod;
  // Phase 3 placeholders (accepted, no-op on backend yet)
  controlGroup: string;
  adversityThreshold: string;
  pairwiseTest: typeof PAIRWISE_TEST_VALUES[number];
  incidencePairwise: typeof INCIDENCE_PAIRWISE_VALUES[number];
  trendTest: typeof TREND_TEST_VALUES[number];
  incidenceTrend: typeof INCIDENCE_TREND_VALUES[number];
  organWeightMethod: typeof ORGAN_WEIGHT_METHOD_VALUES[number];
}

export interface StudySettingsContextValue {
  /** Immediate settings — use for UI display (dropdowns, labels). */
  settings: StudySettings;
  /** Debounced query params string — use for API calls and React Query keys.
   *  300ms debounce collapses rapid setting toggles into a single refetch. */
  queryParams: string;
  updateSetting: <K extends keyof StudySettings>(key: K, value: StudySettings[K]) => void;
}

// ── Context ──────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components -- Settings defaults co-located with the Provider that consumes them; not a fast-refresh hazard in practice.
export const SETTINGS_DEFAULTS: StudySettings = {
  scheduledOnly: false,
  recoveryPooling: "pool",
  effectSize: "hedges-g",
  multiplicity: "dunnett-fwer",
  controlGroup: "vehicle",
  adversityThreshold: "grade-ge-2-or-dose-dep",
  pairwiseTest: "dunnett",
  incidencePairwise: "boschloo",
  trendTest: "jonckheere",
  incidenceTrend: "cochran-armitage",
  organWeightMethod: "recommended",
};

const StudySettingsContext = createContext<StudySettingsContextValue>({
  settings: SETTINGS_DEFAULTS,
  queryParams: "",
  updateSetting: () => {},
});

// ── Provider ─────────────────────────────────────────────────

export function StudySettingsProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ studyId: string }>();
  const studyId = params.studyId ?? "__none__";

  // scheduledOnly comes from ScheduledOnlyContext (must be above in tree)
  const { useScheduledOnly: scheduledOnly } = useScheduledOnly();

  // Session-persisted settings — each keyed by studyId.
  // Validators reject stale sessionStorage values from previous code versions.
  const [recoveryPooling, setRecoveryPooling] = useSessionState(
    `pcc.${studyId}.recoveryPooling`, SETTINGS_DEFAULTS.recoveryPooling,
    isOneOf(RECOVERY_POOLING_VALUES),
  );
  const [effectSize, setEffectSize] = useSessionState(
    `pcc.${studyId}.effectSize`, SETTINGS_DEFAULTS.effectSize,
    isOneOf(EFFECT_SIZE_VALUES),
  );
  const [multiplicity, setMultiplicity] = useSessionState(
    `pcc.${studyId}.multiplicity`, SETTINGS_DEFAULTS.multiplicity,
    isOneOf(MULTIPLICITY_VALUES),
  );
  const [controlGroup, setControlGroup] = useSessionState<string>(
    `pcc.${studyId}.controlGroup`, SETTINGS_DEFAULTS.controlGroup,
  );
  const [adversityThreshold, setAdversityThreshold] = useSessionState<string>(
    `pcc.${studyId}.adversityThreshold`, SETTINGS_DEFAULTS.adversityThreshold,
  );
  const [pairwiseTest, setPairwiseTest] = useSessionState(
    `pcc.${studyId}.pairwiseTest`, SETTINGS_DEFAULTS.pairwiseTest,
    isOneOf(PAIRWISE_TEST_VALUES),
  );
  const [incidencePairwise, setIncidencePairwise] = useSessionState(
    `pcc.${studyId}.incidencePairwise`, SETTINGS_DEFAULTS.incidencePairwise,
    isOneOf(INCIDENCE_PAIRWISE_VALUES),
  );
  const [trendTest, setTrendTest] = useSessionState(
    `pcc.${studyId}.trendTest`, SETTINGS_DEFAULTS.trendTest,
    isOneOf(TREND_TEST_VALUES),
  );
  const [incidenceTrend, setIncidenceTrend] = useSessionState(
    `pcc.${studyId}.incidenceTrend`, SETTINGS_DEFAULTS.incidenceTrend,
    isOneOf(INCIDENCE_TREND_VALUES),
  );
  const [organWeightMethod, setOrganWeightMethod] = useSessionState(
    `pcc.${studyId}.organWeightMethod`, SETTINGS_DEFAULTS.organWeightMethod,
    isOneOf(ORGAN_WEIGHT_METHOD_VALUES),
  );

  const settings = useMemo<StudySettings>(
    () => ({
      scheduledOnly,
      recoveryPooling,
      effectSize,
      multiplicity,
      controlGroup,
      adversityThreshold,
      pairwiseTest,
      incidencePairwise,
      trendTest,
      incidenceTrend,
      organWeightMethod,
    }),
    [scheduledOnly, recoveryPooling, effectSize, multiplicity, controlGroup,
     adversityThreshold, pairwiseTest, incidencePairwise, trendTest, incidenceTrend, organWeightMethod],
  );

  // Setter dispatch table
  const setterMap = useMemo(() => ({
    scheduledOnly: () => {}, // read-only from ScheduledOnlyContext
    recoveryPooling: setRecoveryPooling,
    effectSize: setEffectSize,
    multiplicity: setMultiplicity,
    controlGroup: setControlGroup,
    adversityThreshold: setAdversityThreshold,
    pairwiseTest: setPairwiseTest,
    incidencePairwise: setIncidencePairwise,
    trendTest: setTrendTest,
    incidenceTrend: setIncidenceTrend,
    organWeightMethod: setOrganWeightMethod,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const updateSetting = useCallback(
    <K extends keyof StudySettings>(key: K, value: StudySettings[K]) => {
      const setter = setterMap[key];
      if (setter) (setter as (v: StudySettings[K]) => void)(value);
    },
    [setterMap],
  );

  // Debounced query params: collapses rapid setting changes into one refetch.
  // Immediate params (for the first render / initial load) skip the delay.
  const immediateParams = useMemo(() => buildSettingsParams(settings), [settings]);
  const [queryParams, setQueryParams] = useState(immediateParams);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setQueryParams(immediateParams), 300);
    return () => clearTimeout(timerRef.current);
  }, [immediateParams]);

  // On first mount, sync immediately (no 300ms wait for initial load)
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      setQueryParams(immediateParams);
    }
  }, [immediateParams]);

  const ctxValue = useMemo(
    () => ({ settings, queryParams, updateSetting }),
    [settings, queryParams, updateSetting],
  );

  return (
    <StudySettingsContext.Provider value={ctxValue}>
      {children}
    </StudySettingsContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────

// eslint-disable-next-line react-refresh/only-export-components -- Co-located hook with Provider is the canonical React Context pattern; HMR penalty accepted.
export function useStudySettings(): StudySettingsContextValue {
  return useContext(StudySettingsContext);
}
