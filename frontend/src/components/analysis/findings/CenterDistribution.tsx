/**
 * CenterDistribution — strip/dot plot for the center panel Distribution tab.
 *
 * Shows individual subject values at the global day stepper's selected day.
 * Replaces the context-panel DistributionPane for findings view.
 *
 * Unlike the former DistributionPane, this has no mode selector — day is
 * driven by the parent chart panel's stepper.  A Recovery checkbox
 * (Phase 3) will swap the displayed population to recovery-arm animals.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTimecourseSubject } from "@/hooks/useTimecourse";
import { useRecoveryPooling } from "@/hooks/useRecoveryPooling";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useViewSelection } from "@/contexts/ViewSelectionContext";
import { useFindingsAnalyticsResult } from "@/contexts/FindingsAnalyticsContext";
import { useAnimalExclusion } from "@/contexts/AnimalExclusionContext";
import { useDistributionSubjects } from "@/contexts/DistributionSubjectsContext";
import { useInfluentialSubjectsMap } from "@/hooks/useInfluentialSubjects";
import { useSubjectSentinel } from "@/hooks/useSubjectSentinel";
import { useHcdBySex } from "@/hooks/useHcdReferences";
import { StripPlotChart } from "../panes/StripPlotChart";
import type { DetectionWindow } from "../panes/StripPlotChart";
import { BivarScatterChart } from "../panes/BivarScatterChart";
import type { BivarSubjectValue } from "../panes/BivarScatterChart";
import { PanePillToggle } from "@/components/ui/PanePillToggle";
import { Skeleton } from "@/components/ui/skeleton";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { shortDoseLabel } from "@/lib/dose-label-utils";
import { Info } from "lucide-react";
import type { UnifiedFinding } from "@/types/analysis";
import type { TimecourseSubject } from "@/types/timecourse";

// Same allowlist as the former DistributionPane
const ALLOWED_DOMAINS = new Set(["BW", "LB", "OM", "FW", "BG", "EG", "VS"]);

interface CenterDistributionProps {
  finding: UnifiedFinding;
  /** Study day to display — from the global DayStepper. */
  selectedDay: number | null;
  /** Whether the left chart tab is in recovery mode — auto-checks the recovery checkbox. */
  isRecoveryMode?: boolean;
}

export function CenterDistribution({ finding, selectedDay, isRecoveryMode }: CenterDistributionProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { setSelectedSubject } = useViewSelection();
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  const isVisible =
    finding.data_type === "continuous" && ALLOWED_DOMAINS.has(finding.domain);

  // Canonical recovery-pooling and mortality exclusion (shared with other panes)
  const { hasRecovery, includeRecovery } = useRecoveryPooling();
  const { excludedSubjects } = useScheduledOnly();
  const { toggleExclusion, pendingExclusions } = useAnimalExclusion();
  const endpointLabel = finding.endpoint_label ?? finding.finding;
  const excludedForEndpoint = useMemo(() => {
    const set = pendingExclusions.get(endpointLabel);
    return set && set.size > 0 ? set : undefined;
  }, [pendingExclusions, endpointLabel]);
  const handleToggleExclusion = useCallback(
    (usubjid: string) => toggleExclusion(endpointLabel, usubjid),
    [toggleExclusion, endpointLabel],
  );

  // Auto-check recovery when parent enters recovery mode
  const showRecoveryAnimals = recoveryChecked || !!isRecoveryMode;

  // Always fetch with recovery subjects included so the checkbox can toggle them.
  // (includeRecovery from pooling settings controls default behavior; we need
  // the data available regardless for the Recovery checkbox.)
  // OM domain: test_code is always "WEIGHT" but the backend accepts specimen
  // names (e.g. "TESTIS") to return per-organ data.
  const effectiveTestCode = finding.domain === "OM" && finding.specimen
    ? finding.specimen
    : finding.test_code;
  const { data: subjectData, isLoading, isError } = useTimecourseSubject(
    isVisible ? studyId : undefined,
    isVisible ? finding.domain : undefined,
    isVisible ? effectiveTestCode : undefined,
    undefined, // all sexes
    true, // always include recovery subjects in fetch
  );

  const shouldIncludeSubject = useCallback(
    (s: TimecourseSubject) => {
      if (excludedSubjects.has(s.usubjid)) return false;
      if (showRecoveryAnimals) {
        // Recovery mode: show only recovery-arm subjects
        return !!s.is_recovery;
      }
      // Default: exclude recovery-arm subjects unless pooled
      if (s.is_recovery && !includeRecovery) return false;
      return true;
    },
    [showRecoveryAnimals, includeRecovery, excludedSubjects],
  );

  // Dose groups from visible subjects
  const doseGroupsForChart = useMemo(() => {
    if (!subjectData) return [];
    const map = new Map<number, string>();
    for (const s of subjectData.subjects) {
      if (!shouldIncludeSubject(s)) continue;
      if (!map.has(s.dose_level)) map.set(s.dose_level, s.dose_label);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a - b)
      .map(([doseLevel, doseLabel]) => ({ doseLevel, doseLabel }));
  }, [subjectData, shouldIncludeSubject]);

  // Filter subjects to selected day
  const { subjects, sexes, unit } = useMemo(() => {
    if (!subjectData || selectedDay == null)
      return { subjects: [] as { usubjid: string; sex: string; dose_level: number; dose_label: string; value: number }[], sexes: [] as string[], unit: "" };

    const sexSet = new Set<string>();
    const subjs: { usubjid: string; sex: string; dose_level: number; dose_label: string; value: number }[] = [];

    for (const s of subjectData.subjects) {
      if (!shouldIncludeSubject(s)) continue;
      if (s.values.length === 0) continue;

      // Find value at the selected day
      const match = s.values.find((v) => v.day === selectedDay);
      if (match == null) continue;

      sexSet.add(s.sex);
      subjs.push({
        usubjid: s.usubjid,
        sex: s.sex,
        dose_level: s.dose_level,
        dose_label: s.dose_label,
        value: match.value,
      });
    }

    return {
      subjects: subjs,
      sexes: [...sexSet].sort(),
      unit: subjectData.unit,
    };
  }, [subjectData, selectedDay, shouldIncludeSubject]);

  // Publish subject values for LooSensitivityPane impact preview
  const { setSubjectValues } = useDistributionSubjects();
  useEffect(() => {
    if (subjects.length === 0) return;
    const ctrl = subjects.filter(s => s.dose_level === 0).map(s => ({ usubjid: s.usubjid, value: s.value, dose_level: s.dose_level }));
    const treat = subjects.filter(s => s.dose_level > 0).map(s => ({ usubjid: s.usubjid, value: s.value, dose_level: s.dose_level }));
    setSubjectValues(endpointLabel, ctrl, treat);
  }, [subjects, endpointLabel, setSubjectValues]);

  // Collect LOO influential subjects for this endpoint, scoped to the displayed time slice:
  // - Main mode: day-scoped to selectedDay so brown dots match the day the strip plot shows
  //   AND passed through the hook's fragility filter (ratio < LOO_THRESHOLD).
  // - Recovery mode: endpoint-union (undefined) — the data model does not expose a canonical
  //   recovery sacrifice day, and selectedDay is shared across tabs so it likely points to a
  //   main-study day. Fragility filter still applies. See architecture/loo-display-scoping.md.
  const influentialSubjects = useInfluentialSubjectsMap(finding, {
    day: showRecoveryAnimals ? undefined : selectedDay,
  });
  const { data: analyticsData } = useFindingsAnalyticsResult();

  // OM domain: check if terminal_bw data is available for bivariate scatter
  const hasBW = useMemo(
    () => finding.domain === "OM" && (subjectData?.subjects.some((s) => s.terminal_bw != null) ?? false),
    [finding.domain, subjectData],
  );

  const [scatterMode, setScatterMode] = useState(false);
  const [hiddenDoses, setHiddenDoses] = useState<Set<number>>(new Set());
  const [looIsolated, setLooIsolated] = useState(false);
  // Reset scatter mode and dose filter when finding changes
  useEffect(() => {
    setScatterMode(false);
    setHiddenDoses(new Set());
    setLooIsolated(false);
  }, [finding.test_code, finding.domain]);
  const activeScatter = scatterMode && hasBW;

  // Detection window bands from subject sentinel metadata (React Query cache — no extra fetch)
  const { data: sentinelData } = useSubjectSentinel(studyId);
  const detectionWindows = useMemo((): DetectionWindow[] | undefined => {
    const dm = sentinelData?.detection_metadata;
    if (!dm) return undefined;
    const windows: DetectionWindow[] = [];
    for (const sex of sexes) {
      const keyParts = [finding.domain, finding.test_code, ...(finding.specimen ? [finding.specimen] : []), sex]
        .filter(Boolean)
        .map((s) => s.toLowerCase());
      const key = keyParts.join(":");
      const meta = dm[key];
      if (!meta) continue;
      for (const g of meta.groups) {
        windows.push({ doseLevel: g.dose_level, sex, windowLo: g.window_lo, windowHi: g.window_hi });
      }
    }
    return windows.length > 0 ? windows : undefined;
  }, [sentinelData, finding.domain, finding.test_code, finding.specimen, sexes]);

  // HCD references for strip plot
  const hcdBySex = useHcdBySex(studyId, finding.test_code, sexes);

  // Terminal sacrifice day for bivariate scatter
  const terminalDay = subjectData?.terminal_sacrifice_day ?? null;

  // Bivariate scatter data: pair organ weight at terminal day with terminal_bw
  const bivarSubjects = useMemo((): BivarSubjectValue[] => {
    if (!activeScatter || !subjectData || !terminalDay) return [];
    const result: BivarSubjectValue[] = [];
    for (const s of subjectData.subjects) {
      if (!shouldIncludeSubject(s)) continue;
      if (s.terminal_bw == null) continue;
      const match = s.values.find((v) => v.day === terminalDay);
      if (match == null) continue;
      result.push({
        usubjid: s.usubjid,
        sex: s.sex,
        dose_level: s.dose_level,
        dose_label: s.dose_label,
        organ_weight: match.value,
        body_weight: s.terminal_bw,
      });
    }
    return result;
  }, [activeScatter, subjectData, terminalDay, shouldIncludeSubject]);

  // Sexes for bivar chart (may differ from strip plot sexes due to day filtering)
  const bivarSexes = useMemo(() => {
    const set = new Set(bivarSubjects.map((s) => s.sex));
    return [...set].sort();
  }, [bivarSubjects]);

  // Filter bivar subjects by hidden doses
  const visibleBivarSubjects = useMemo(
    () => hiddenDoses.size === 0 ? bivarSubjects : bivarSubjects.filter((s) => !hiddenDoses.has(s.dose_level)),
    [bivarSubjects, hiddenDoses],
  );

  const toggleDose = useCallback((doseLevel: number) => {
    setHiddenDoses((prev) => {
      const next = new Set(prev);
      if (next.has(doseLevel)) next.delete(doseLevel);
      else next.add(doseLevel);
      return next;
    });
  }, []);

  const handleSubjectClick = useCallback(
    (usubjid: string) => setSelectedSubject(usubjid),
    [setSelectedSubject],
  );

  const hasControlSideInfluential = useMemo(() => {
    if (!influentialSubjects) return false;
    for (const info of influentialSubjects.values()) {
      if (info.isControlSide) return true;
    }
    return false;
  }, [influentialSubjects]);

  if (!isVisible) return null;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Skeleton className="h-3/4 w-3/4" />
      </div>
    );
  }

  // In scatter mode, check bivar data instead of strip data
  if (!activeScatter && (isError || subjects.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {showRecoveryAnimals
          ? "No recovery-arm subjects at this timepoint."
          : "No individual data at this timepoint."}
      </div>
    );
  }

  const hasInfluential = !!influentialSubjects && influentialSubjects.size > 0;

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar: mode toggle + recovery checkbox + LOO legend */}
      <div className="flex shrink-0 items-center gap-3 pb-1">
        {hasBW && (
          <>
            <PanePillToggle
              value={activeScatter ? "scatter" : "dist"}
              options={[
                { value: "dist" as const, label: "Distribution" },
                { value: "scatter" as const, label: "vs BW" },
              ]}
              onChange={(v) => setScatterMode(v === "scatter")}
            />
            {activeScatter && (
              <span title={"Organ weight vs body weight scatter (Kluxen 2019).\n\nDots = individual subjects, colored by dose group.\nLines = linear regression per group (requires n \u2265 4).\n\nHow to read:\n\u2022 Lines shift up/down but stay parallel \u2192 direct organ effect\n\u2022 Dots follow the same line across groups \u2192 BW-mediated (ratio artifact)\n\u2022 Lines diverge (different slopes) \u2192 joint organ + BW effect\n\u2022 No clear pattern \u2192 organ weight independent of BW"}>
                <Info className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-help" />
              </span>
            )}
          </>
        )}
        {!activeScatter && hasRecovery && (
          <label className="flex items-center gap-1 cursor-pointer text-[10px] text-muted-foreground hover:text-foreground/70">
            <input
              type="checkbox"
              checked={showRecoveryAnimals}
              onChange={(e) => setRecoveryChecked(e.target.checked)}
              className="h-3 w-3 rounded border-gray-300 accent-primary"
            />
            Recovery animals
          </label>
        )}
        {hasInfluential && (
          <button
            type="button"
            className={`flex items-center gap-1 text-[9px] transition-opacity ${looIsolated ? "text-foreground font-medium opacity-100" : "text-muted-foreground opacity-100"}`}
            onClick={() => setLooIsolated((v) => !v)}
            title={hasControlSideInfluential ? "Treated-side (amber) and control-side (gray, ring = affected dose group) fragile subjects" : "LOO-fragile subjects"}
          >
            {hasControlSideInfluential ? (
              <svg width="16" height="8" className="shrink-0">
                <circle cx="4" cy="4" r="2.5" fill="#92400e" />
                <circle cx="12" cy="4" r="2.5" fill="#6b7280" stroke="#9ca3af" strokeWidth={1.2} />
              </svg>
            ) : (
              <svg width="8" height="8" className="shrink-0"><circle cx="4" cy="4" r="2.5" fill="#92400e" /></svg>
            )}
            <span>LOO influential</span>
          </button>
        )}
        {!activeScatter && detectionWindows && selectedDay === terminalDay && (
          <div
            className="flex items-center gap-1 text-[9px] text-muted-foreground cursor-help"
            title="Outlier detection window: the range where individual values are indistinguishable from normal group variation (|z| < 3.5). Wider band = lower detection power. Based on robust dispersion (Qn/MAD)."
          >
            <svg width="14" height="8" className="shrink-0">
              <rect x="0" y="1" width="6" height="6" fill="#ec4899" opacity={0.15} rx={1} />
              <rect x="7" y="1" width="6" height="6" fill="#0891b2" opacity={0.15} rx={1} />
            </svg>
            <span>Detection window</span>
          </div>
        )}
        {!activeScatter && hcdBySex && (
          <div
            className="flex items-center gap-1 text-[9px] text-muted-foreground cursor-help"
            title="Left margin: historical control distribution per sex. Shows where control-animal values typically fall for this endpoint, strain, and study duration."
          >
            <svg width="16" height="10" viewBox="0 0 16 10" className="shrink-0">
              <path d="M15,1 C13,1 11,3 10,5 C9,7 8,9 6,9 L15,9 Z" fill="#ec4899" opacity={0.35} />
              <path d="M15,0 C12,0 9,2 8,5 C7,8 5,10 2,10 L15,10 Z" fill="#0891b2" opacity={0.3} />
            </svg>
            <span>HCD distribution</span>
          </div>
        )}
        {activeScatter && (
          <div className="ml-auto flex flex-wrap gap-1">
            {doseGroupsForChart.map((dg) => {
              const visible = !hiddenDoses.has(dg.doseLevel);
              return (
                <button
                  key={dg.doseLevel}
                  type="button"
                  className={`flex items-center gap-0.5 px-1 py-0.5 text-[9px] rounded transition-opacity ${visible ? "opacity-100" : "opacity-30"}`}
                  onClick={() => toggleDose(dg.doseLevel)}
                >
                  <span
                    className="inline-block rounded-full"
                    style={{ width: 5, height: 5, backgroundColor: getDoseGroupColor(dg.doseLevel) }}
                  />
                  <span className="text-muted-foreground">{shortDoseLabel(dg.doseLabel, analyticsData?.dose_groups)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {activeScatter ? (
          <BivarScatterChart
            subjects={visibleBivarSubjects}
            organUnit={unit}
            bwUnit={subjectData?.terminal_bw_unit ?? "g"}
            sexes={bivarSexes}
            doseGroups={doseGroupsForChart.filter((dg) => !hiddenDoses.has(dg.doseLevel))}
            onSubjectClick={handleSubjectClick}
            influentialSubject={finding.loo_influential_subject ?? undefined}
          />
        ) : (
          <StripPlotChart
            subjects={subjects}
            unit={unit}
            sexes={sexes}
            doseGroups={doseGroupsForChart}
            onSubjectClick={handleSubjectClick}
            mode={showRecoveryAnimals ? "recovery" : "terminal"}
            interleaved
            influentialSubjects={influentialSubjects}
            isolateInfluential={looIsolated}
            endpointLabel={endpointLabel}
            excludedSubjects={excludedForEndpoint}
            onToggleExclusion={handleToggleExclusion}
            detectionWindows={selectedDay === terminalDay ? detectionWindows : undefined}
            hcdBySex={hcdBySex}
          />
        )}
      </div>
    </div>
  );
}
