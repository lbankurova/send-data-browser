import { createContext, useContext, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useSessionState } from "@/hooks/useSessionState";
import type { EffectSizeMethod, MultiplicityMethod } from "@/lib/stat-method-transforms";

// ── Types ────────────────────────────────────────────────────

export interface StudySettings {
  scheduledOnly: boolean;
  recoveryPooling: "pool" | "separate";
  effectSize: EffectSizeMethod;
  multiplicity: MultiplicityMethod;
  // Phase 3 placeholders (accepted, no-op on backend yet)
  controlGroup: string;
  adversityThreshold: string;
  pairwiseTest: "dunnett" | "williams" | "steel";
  trendTest: "jonckheere" | "cuzick" | "williams-trend";
  incidenceTrend: "cochran-armitage" | "logistic-slope";
  organWeightMethod: "absolute" | "ratio-bw" | "ratio-brain";
}

export interface StudySettingsContextValue {
  settings: StudySettings;
  updateSetting: <K extends keyof StudySettings>(key: K, value: StudySettings[K]) => void;
}

// ── Context ──────────────────────────────────────────────────

const DEFAULTS: StudySettings = {
  scheduledOnly: false,
  recoveryPooling: "pool",
  effectSize: "hedges-g",
  multiplicity: "dunnett-fwer",
  controlGroup: "vehicle",
  adversityThreshold: "grade-ge-2-or-dose-dep",
  pairwiseTest: "dunnett",
  trendTest: "jonckheere",
  incidenceTrend: "cochran-armitage",
  organWeightMethod: "absolute",
};

const StudySettingsContext = createContext<StudySettingsContextValue>({
  settings: DEFAULTS,
  updateSetting: () => {},
});

// ── Provider ─────────────────────────────────────────────────

export function StudySettingsProvider({ children }: { children: ReactNode }) {
  const params = useParams<{ studyId: string }>();
  const studyId = params.studyId ?? "__none__";

  // scheduledOnly comes from ScheduledOnlyContext (must be above in tree)
  const { useScheduledOnly: scheduledOnly } = useScheduledOnly();

  // Session-persisted settings — each keyed by studyId
  const [recoveryPooling, setRecoveryPooling] = useSessionState<"pool" | "separate">(
    `pcc.${studyId}.recoveryPooling`, "pool",
  );
  const [effectSize, setEffectSize] = useSessionState<EffectSizeMethod>(
    `pcc.${studyId}.effectSize`, "hedges-g",
  );
  const [multiplicity, setMultiplicity] = useSessionState<MultiplicityMethod>(
    `pcc.${studyId}.multiplicity`, "dunnett-fwer",
  );
  const [controlGroup, setControlGroup] = useSessionState<string>(
    `pcc.${studyId}.controlGroup`, "vehicle",
  );
  const [adversityThreshold, setAdversityThreshold] = useSessionState<string>(
    `pcc.${studyId}.adversityThreshold`, "grade-ge-2-or-dose-dep",
  );
  const [pairwiseTest, setPairwiseTest] = useSessionState<"dunnett" | "williams" | "steel">(
    `pcc.${studyId}.pairwiseTest`, "dunnett",
  );
  const [trendTest, setTrendTest] = useSessionState<"jonckheere" | "cuzick" | "williams-trend">(
    `pcc.${studyId}.trendTest`, "jonckheere",
  );
  const [incidenceTrend, setIncidenceTrend] = useSessionState<"cochran-armitage" | "logistic-slope">(
    `pcc.${studyId}.incidenceTrend`, "cochran-armitage",
  );
  const [organWeightMethod, setOrganWeightMethod] = useSessionState<"absolute" | "ratio-bw" | "ratio-brain">(
    `pcc.${studyId}.organWeightMethod`, "absolute",
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
      trendTest,
      incidenceTrend,
      organWeightMethod,
    }),
    [scheduledOnly, recoveryPooling, effectSize, multiplicity, controlGroup,
     adversityThreshold, pairwiseTest, trendTest, incidenceTrend, organWeightMethod],
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

  const ctxValue = useMemo(
    () => ({ settings, updateSetting }),
    [settings, updateSetting],
  );

  return (
    <StudySettingsContext.Provider value={ctxValue}>
      {children}
    </StudySettingsContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────

export function useStudySettings(): StudySettingsContextValue {
  return useContext(StudySettingsContext);
}
