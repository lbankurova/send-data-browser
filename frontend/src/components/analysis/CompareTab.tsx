/**
 * Compare tab — multi-subject comparison surface for the Histopathology view.
 *
 * Four collapsible sections:
 *   1. Finding concordance matrix (from existing subjData — no API call)
 *   2. Lab values comparison (from useSubjectComparison)
 *   3. Body weight chart (ECharts overlay)
 *   4. Clinical observations diff
 */
import { useState, useMemo, useEffect } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getNeutralHeatColor } from "@/components/analysis/HistopathologyView";
import { useSubjectComparison } from "@/hooks/useSubjectComparison";
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import { EChartsWrapper } from "@/components/analysis/charts/EChartsWrapper";
import { buildBWComparisonOption } from "@/components/analysis/charts/comparison-charts";
import type { BWChartMode } from "@/components/analysis/charts/comparison-charts";
import type { SubjectHistopathEntry, ComparisonSubjectProfile } from "@/types/timecourse";
import { FilterSelect } from "@/components/ui/FilterBar";

// ─── Organ → relevant lab tests mapping ─────────────────────

const ORGAN_RELEVANT_TESTS: Record<string, string[]> = {
  LIVER: ["ALT", "AST", "ALP", "ALB", "BILI", "GGT", "TBIL", "TP", "CHOL", "TRIG"],
  KIDNEY: ["BUN", "CREA", "TP", "ALB", "PHOS", "CA", "K", "NA", "CL"],
  "BONE MARROW": ["WBC", "RBC", "HGB", "HCT", "PLT", "NEUT", "LYMPH", "MONO", "EOS", "BASO", "RETIC"],
  SPLEEN: ["WBC", "RBC", "HGB", "HCT", "PLT", "NEUT", "LYMPH"],
  HEART: ["CK", "LDH", "AST", "TROP"],
  ADRENAL: ["NA", "K", "CL", "GLUC", "CHOL"],
};

// ─── CollapsiblePane ─────────────────────────────────────────

function CollapsiblePane({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

// ─── CompareTab ──────────────────────────────────────────────

interface CompareTabProps {
  studyId: string;
  specimen: string;
  subjectIds: string[];
  onEditSelection: () => void;
  onFindingClick: (finding: string) => void;
}

export function CompareTab({
  studyId,
  specimen,
  subjectIds,
  onEditSelection,
  onFindingClick,
}: CompareTabProps) {
  const { data: compData, isLoading } = useSubjectComparison(studyId, subjectIds);
  const { data: histopathData } = useHistopathSubjects(studyId, specimen);
  const subjData: SubjectHistopathEntry[] | null = histopathData?.subjects ?? null;

  // Subject profiles from comparison API (or derive from subjData)
  const profiles: ComparisonSubjectProfile[] = compData?.subjects ?? [];

  // Short ID helper
  const shortId = (id: string) => {
    const parts = id.split("-");
    return parts[parts.length - 1] || id.slice(-4);
  };

  // Profile lookup by ID
  const profileMap = useMemo(() => {
    const m = new Map<string, ComparisonSubjectProfile>();
    for (const p of profiles) m.set(p.usubjid, p);
    return m;
  }, [profiles]);

  // Derive subject info from subjData when comparison API is still loading
  const subjectInfo = useMemo(() => {
    return subjectIds.map((id) => {
      const prof = profileMap.get(id);
      if (prof) return prof;
      // Fallback from subjData
      const entry = subjData?.find((s) => s.usubjid === id);
      return {
        usubjid: id,
        short_id: shortId(id),
        sex: entry?.sex ?? "?",
        dose_level: entry?.dose_level ?? 0,
        dose_label: entry?.dose_label ?? "?",
        disposition: null,
        disposition_day: null,
      };
    });
  }, [subjectIds, profileMap, subjData]);

  return (
    <div className="flex-1 overflow-auto">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-foreground">
            Comparing {subjectIds.length} subjects in {specimen.replace(/_/g, " ")}
          </div>
          <button onClick={onEditSelection} className="text-xs text-primary hover:underline">
            Edit
          </button>
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          {subjectInfo.map((s) => `${s.short_id} (${s.sex}, ${s.dose_label})`).join("  \u00B7  ")}
        </div>
      </div>

      {/* Section 1: Finding Concordance */}
      <CollapsiblePane title="Finding concordance">
        <FindingConcordance
          subjectIds={subjectIds}
          subjectInfo={subjectInfo}
          subjData={subjData}
          onFindingClick={onFindingClick}
        />
      </CollapsiblePane>

      {/* Section 2: Lab Values */}
      <CollapsiblePane title="Lab values">
        {isLoading ? (
          <LoadingSpinner />
        ) : compData ? (
          <LabValuesComparison
            subjectIds={subjectIds}
            subjectInfo={subjectInfo}
            labValues={compData.lab_values}
            controlLab={compData.control_stats.lab}
            availableTimepoints={compData.available_timepoints}
            specimen={specimen}
          />
        ) : (
          <EmptyState message="Lab data not available." />
        )}
      </CollapsiblePane>

      {/* Section 3: Body Weight */}
      <CollapsiblePane title="Body weight">
        {isLoading ? (
          <LoadingSpinner />
        ) : compData ? (
          <BodyWeightSection
            subjects={subjectInfo}
            bodyWeights={compData.body_weights}
            controlBW={compData.control_stats.bw}
          />
        ) : (
          <EmptyState message="Body weight data not available." />
        )}
      </CollapsiblePane>

      {/* Section 4: Clinical Observations */}
      <CollapsiblePane title="Clinical observations">
        {isLoading ? (
          <LoadingSpinner />
        ) : compData ? (
          <ClinicalObsDiff
            subjectIds={subjectIds}
            subjectInfo={subjectInfo}
            clinicalObs={compData.clinical_obs}
          />
        ) : (
          <EmptyState message="Clinical observation data not available." />
        )}
      </CollapsiblePane>
    </div>
  );
}

// ─── Shared small components ─────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground">Loading&hellip;</span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="py-4 text-center text-xs text-muted-foreground">{message}</div>;
}

// ─── Section 1: Finding Concordance Matrix ───────────────────

function FindingConcordance({
  subjectIds,
  subjectInfo,
  subjData,
  onFindingClick,
}: {
  subjectIds: string[];
  subjectInfo: ComparisonSubjectProfile[];
  subjData: SubjectHistopathEntry[] | null;
  onFindingClick: (finding: string) => void;
}) {
  if (!subjData) return <EmptyState message="Subject data not available." />;

  // Filter to selected subjects
  const selected = subjData.filter((s) => subjectIds.includes(s.usubjid));
  if (selected.length === 0) return <EmptyState message="No data for selected subjects." />;

  // Collect all findings across selected subjects
  const findingMaxSev = new Map<string, number>();
  const findingHasGrade = new Map<string, boolean>();
  for (const subj of selected) {
    for (const [finding, val] of Object.entries(subj.findings)) {
      const existing = findingMaxSev.get(finding) ?? 0;
      if (val.severity_num > existing) findingMaxSev.set(finding, val.severity_num);
      if (val.severity_num > 0) findingHasGrade.set(finding, true);
      if (!findingHasGrade.has(finding)) findingHasGrade.set(finding, false);
    }
  }

  // Sort: severity-graded first (max severity desc), then non-graded alphabetical
  const findings = [...findingMaxSev.entries()]
    .sort((a, b) => {
      const aGraded = findingHasGrade.get(a[0]) ?? false;
      const bGraded = findingHasGrade.get(b[0]) ?? false;
      if (aGraded && !bGraded) return -1;
      if (!aGraded && bGraded) return 1;
      if (aGraded && bGraded) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([f]) => f);

  if (findings.length === 0) return <EmptyState message="No findings observed in selected subjects." />;

  const N = subjectIds.length;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b">
            <th className="w-48 shrink-0 pb-1 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Finding
            </th>
            {subjectInfo.map((s) => (
              <th key={s.usubjid} className="w-20 shrink-0 pb-1 text-center">
                <div className="text-[10px] font-medium">
                  {s.short_id}
                </div>
                <div className="text-[9px] text-muted-foreground">
                  {s.sex} / {s.dose_label}
                </div>
              </th>
            ))}
            <th className="w-20 shrink-0 pb-1 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              Concordance
            </th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding) => {
            const count = subjectIds.filter((id) => {
              const subj = selected.find((s) => s.usubjid === id);
              return subj && finding in subj.findings;
            }).length;

            return (
              <tr
                key={finding}
                className="cursor-pointer border-t border-border/20 hover:bg-accent/20"
                onClick={() => onFindingClick(finding)}
              >
                <td className="truncate py-0.5 pr-2 text-[10px]" title={finding}>
                  {finding}
                </td>
                {subjectIds.map((id) => {
                  const subj = selected.find((s) => s.usubjid === id);
                  const entry = subj?.findings[finding];
                  const sevNum = entry?.severity_num ?? 0;
                  const hasEntry = !!entry;
                  const isGraded = findingHasGrade.get(finding) ?? false;
                  const colors = sevNum > 0 ? getNeutralHeatColor(sevNum) : null;

                  return (
                    <td key={id} className="py-0.5 text-center">
                      {sevNum > 0 ? (
                        <div
                          className="mx-auto flex h-5 w-6 items-center justify-center rounded-sm font-mono text-[9px]"
                          style={{ backgroundColor: colors!.bg, color: colors!.text }}
                        >
                          {sevNum}
                        </div>
                      ) : hasEntry && isGraded ? (
                        <span className="text-[9px] text-muted-foreground">&mdash;</span>
                      ) : hasEntry ? (
                        <span className="text-[10px] text-gray-400">&#x25CF;</span>
                      ) : null}
                    </td>
                  );
                })}
                <td className="py-0.5 text-center">
                  {count === N ? (
                    <span className="text-[9px] font-medium text-foreground/70">
                      all ({N}/{N})
                    </span>
                  ) : (
                    <span className={cn("text-[9px]", count === 1 ? "text-muted-foreground/50" : "text-muted-foreground")}>
                      {count}/{N}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section 2: Lab Values Comparison ────────────────────────

function LabValuesComparison({
  subjectIds,
  subjectInfo,
  labValues,
  controlLab,
  availableTimepoints,
  specimen,
}: {
  subjectIds: string[];
  subjectInfo: ComparisonSubjectProfile[];
  labValues: { usubjid: string; test: string; unit: string; day: number; value: number }[];
  controlLab: Record<string, { mean: number; sd: number; unit: string; n: number; by_sex?: Record<string, { mean: number; sd: number; unit: string; n: number }> }>;
  availableTimepoints: number[];
  specimen: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [selectedTimepoint, setSelectedTimepoint] = useState<number | null>(null);

  // Default timepoint: the day with the most subjects represented
  const defaultDay = useMemo(() => {
    if (availableTimepoints.length === 0) return null;
    let bestDay = availableTimepoints[availableTimepoints.length - 1]; // fallback: terminal
    let bestCount = 0;
    for (const day of availableTimepoints) {
      const count = new Set(labValues.filter((lv) => lv.day === day).map((lv) => lv.usubjid)).size;
      if (count > bestCount) {
        bestCount = count;
        bestDay = day;
      }
    }
    return bestDay;
  }, [availableTimepoints, labValues]);
  const activeDay = selectedTimepoint ?? defaultDay;

  // Filter lab values to active timepoint
  const filtered = useMemo(() => {
    if (activeDay == null) return labValues;
    return labValues.filter((lv) => lv.day === activeDay);
  }, [labValues, activeDay]);

  // Collect all tests
  const testSet = useMemo(() => {
    const tests = new Map<string, string>(); // test → unit
    for (const lv of filtered) {
      if (!tests.has(lv.test)) tests.set(lv.test, lv.unit);
    }
    return tests;
  }, [filtered]);

  // Organ-relevant tests
  const specimenUpper = specimen.replace(/_/g, " ").toUpperCase();
  const relevantTests = Object.entries(ORGAN_RELEVANT_TESTS).find(
    ([organ]) => specimenUpper.includes(organ),
  )?.[1] ?? [];

  // Build rows
  const rows = useMemo(() => {
    const allTests = [...testSet.entries()].map(([test, unit]) => {
      const isRelevant = relevantTests.includes(test);
      const ctrl = controlLab[test];
      const subjectValues = subjectIds.map((id) => {
        const lv = filtered.find((l) => l.usubjid === id && l.test === test);
        return lv?.value ?? null;
      });

      // Check if any value is abnormal (use sex-specific controls when available)
      const hasAbnormal = ctrl
        ? subjectValues.some((v, si) => {
            if (v == null) return false;
            const sexCtrl = ctrl.by_sex?.[subjectInfo[si]?.sex] ?? ctrl;
            return v > sexCtrl.mean + 2 * sexCtrl.sd || v < sexCtrl.mean - 2 * sexCtrl.sd;
          })
        : false;

      return { test, unit, isRelevant, ctrl, subjectValues, hasAbnormal };
    });

    // Sort: relevant first (in order), then abnormal, then alphabetical
    const relevantOrder = new Map(relevantTests.map((t, i) => [t, i]));
    allTests.sort((a, b) => {
      if (a.isRelevant && !b.isRelevant) return -1;
      if (!a.isRelevant && b.isRelevant) return 1;
      if (a.isRelevant && b.isRelevant) return (relevantOrder.get(a.test) ?? 0) - (relevantOrder.get(b.test) ?? 0);
      if (a.hasAbnormal && !b.hasAbnormal) return -1;
      if (!a.hasAbnormal && b.hasAbnormal) return 1;
      return a.test.localeCompare(b.test);
    });

    if (showAll) return allTests;
    // Show relevant + abnormal
    return allTests.filter((r) => r.isRelevant || r.hasAbnormal);
  }, [testSet, subjectIds, filtered, controlLab, relevantTests, showAll]);

  if (labValues.length === 0) return <EmptyState message="No lab data available for selected subjects." />;

  return (
    <div>
      {/* Timepoint selector */}
      {availableTimepoints.length > 1 && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Timepoint:</span>
          <FilterSelect
            value={String(activeDay ?? "")}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setSelectedTimepoint(Number(e.target.value))
            }
          >
            {availableTimepoints.map((day) => (
              <option key={day} value={day}>
                Day {day}{day === availableTimepoints[availableTimepoints.length - 1] ? " (terminal)" : ""}
              </option>
            ))}
          </FilterSelect>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b">
              <th className="pb-1 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                Test
              </th>
              <th className="pb-1 pr-3 text-left text-[10px] text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                Unit
              </th>
              <th className="w-24 pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Control
                <div className="font-normal normal-case tracking-normal text-[9px] text-muted-foreground/70">(mean±SD)</div>
              </th>
              {subjectInfo.map((s) => (
                <th key={s.usubjid} className="w-20 pb-1 text-center">
                  <span className="text-[10px] font-medium">
                    {s.short_id}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.test} className="border-t border-border/20">
                <td className="whitespace-nowrap py-0.5 pr-3 font-mono text-[10px] font-medium">
                  {row.test}
                </td>
                <td className="whitespace-nowrap py-0.5 pr-3 text-[10px] text-muted-foreground">
                  {row.unit}
                </td>
                <td className="py-0.5 text-center font-mono text-[10px] text-muted-foreground">
                  {row.ctrl ? (
                    row.ctrl.by_sex ? (
                      <span className="flex flex-col items-center leading-tight">
                        {Object.entries(row.ctrl.by_sex).map(([sex, s]) => (
                          <span key={sex}>{sex}: {s.mean.toFixed(1)}{"\u00B1"}{s.sd.toFixed(1)}</span>
                        ))}
                      </span>
                    ) : (
                      `${row.ctrl.mean.toFixed(1)}\u00B1${row.ctrl.sd.toFixed(1)}`
                    )
                  ) : "\u2014"}
                </td>
                {row.subjectValues.map((val, i) => {
                  if (val == null) {
                    return (
                      <td key={subjectIds[i]} className="py-0.5 text-center font-mono text-[10px] text-muted-foreground">
                        &mdash;
                      </td>
                    );
                  }
                  const sexCtrl = row.ctrl?.by_sex?.[subjectInfo[i]?.sex] ?? row.ctrl;
                  const isHigh = sexCtrl && val > sexCtrl.mean + 2 * sexCtrl.sd;
                  const isLow = sexCtrl && val < sexCtrl.mean - 2 * sexCtrl.sd;
                  return (
                    <td
                      key={subjectIds[i]}
                      className={cn(
                        "py-0.5 text-center font-mono text-[11px]",
                        isHigh ? "font-medium text-red-600/70" : isLow ? "font-medium text-blue-600/70" : "text-foreground",
                      )}
                    >
                      {isHigh ? "\u2191" : isLow ? "\u2193" : ""}{val.toFixed(val >= 100 ? 0 : val >= 1 ? 1 : 3)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show all toggle */}
      <button
        onClick={() => setShowAll(!showAll)}
        className="mt-1 text-[10px] text-primary hover:underline"
      >
        {showAll ? "Show relevant only" : `Show all ${testSet.size} tests`}
      </button>
    </div>
  );
}

// ─── Section 3: Body Weight Chart ────────────────────────────

function BodyWeightSection({
  subjects,
  bodyWeights,
  controlBW,
}: {
  subjects: ComparisonSubjectProfile[];
  bodyWeights: { usubjid: string; day: number; weight: number }[];
  controlBW: Record<string, { mean: number; sd: number; n: number; by_sex?: Record<string, { mean: number; sd: number; n: number }> }>;
}) {
  // Default: baseline for mixed sex, absolute for same sex
  const isMixedSex = new Set(subjects.map((s) => s.sex)).size > 1;
  const [mode, setMode] = useState<BWChartMode>(isMixedSex ? "baseline" : "absolute");

  // Re-init mode when sex composition changes (e.g., adding opposite-sex subject)
  useEffect(() => {
    setMode(isMixedSex ? "baseline" : "absolute");
  }, [isMixedSex]);

  if (bodyWeights.length === 0) return <EmptyState message="No body weight data available." />;

  const option = buildBWComparisonOption({
    subjects,
    bodyWeights,
    controlBW,
    mode,
  });

  return (
    <div>
      {/* Mode toggle */}
      <div className="mb-1 flex items-center gap-1">
        {(["baseline", "absolute"] as const).map((m) => (
          <button
            key={m}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
              mode === m ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent/50",
            )}
            onClick={() => setMode(m)}
          >
            {m === "baseline" ? "% Baseline" : "Absolute"}
          </button>
        ))}
      </div>
      <EChartsWrapper option={option} style={{ width: "100%", height: 180 }} />
    </div>
  );
}

// ─── Section 4: Clinical Observations Diff ───────────────────

function ClinicalObsDiff({
  subjectIds,
  subjectInfo,
  clinicalObs,
}: {
  subjectIds: string[];
  subjectInfo: ComparisonSubjectProfile[];
  clinicalObs: { usubjid: string; day: number; observation: string }[];
}) {
  const [showAll, setShowAll] = useState(false);

  // Build day × subject matrix
  const matrix = useMemo(() => {
    const dayMap = new Map<number, Map<string, string>>(); // day → (subject → observation)
    for (const obs of clinicalObs) {
      if (!dayMap.has(obs.day)) dayMap.set(obs.day, new Map());
      dayMap.get(obs.day)!.set(obs.usubjid, obs.observation);
    }

    // Add disposition as terminal row
    for (const s of subjectInfo) {
      if (s.disposition && s.disposition_day != null) {
        if (!dayMap.has(s.disposition_day)) dayMap.set(s.disposition_day, new Map());
        const existing = dayMap.get(s.disposition_day)!.get(s.usubjid);
        // Only set if no existing entry or existing is NORMAL
        if (!existing || existing.toUpperCase() === "NORMAL") {
          dayMap.get(s.disposition_day)!.set(s.usubjid, s.disposition);
        }
      }
    }

    return [...dayMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([day, subjects]) => ({ day, subjects }));
  }, [clinicalObs, subjectInfo]);

  // Filter rows: only show days where at least one subject has non-NORMAL observation
  const visibleRows = useMemo(() => {
    if (showAll) return matrix;
    return matrix.filter((row) => {
      for (const [, obs] of row.subjects) {
        if (obs.toUpperCase() !== "NORMAL") return true;
      }
      return false;
    });
  }, [matrix, showAll]);

  if (clinicalObs.length === 0 && subjectInfo.every((s) => !s.disposition)) {
    return <EmptyState message="No clinical observation data available." />;
  }

  if (visibleRows.length === 0) {
    return (
      <div>
        <div className="py-4 text-center text-xs text-muted-foreground">
          All clinical observations normal for selected subjects.
        </div>
        <button
          onClick={() => setShowAll(true)}
          className="text-[10px] text-primary hover:underline"
        >
          Show all {matrix.length} days
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b">
              <th className="w-12 pb-1 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Day
              </th>
              {subjectInfo.map((s) => (
                <th key={s.usubjid} className="pb-1 text-left">
                  <span className="text-[10px] font-medium">
                    {s.short_id}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.day} className="border-t border-border/20">
                <td className="py-0.5 font-mono text-[10px] text-muted-foreground">
                  {row.day}
                </td>
                {subjectIds.map((id) => {
                  const obs = row.subjects.get(id);
                  if (!obs) {
                    return (
                      <td key={id} className="py-0.5 text-[10px] text-muted-foreground/30">
                        &mdash;
                      </td>
                    );
                  }
                  const upper = obs.toUpperCase();
                  const isNormal = upper === "NORMAL";
                  const isFoundDead = upper.includes("FOUND DEAD");
                  const isMoribund = upper.includes("MORIBUND");

                  return (
                    <td
                      key={id}
                      className={cn(
                        "py-0.5 text-[10px]",
                        isNormal
                          ? "text-muted-foreground/40"
                          : isFoundDead
                            ? "font-medium text-red-600/70"
                            : isMoribund
                              ? "font-medium text-orange-500/70"
                              : "font-medium text-foreground",
                      )}
                    >
                      {obs}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Show all toggle */}
      <button
        onClick={() => setShowAll(!showAll)}
        className="mt-1 text-[10px] text-primary hover:underline"
      >
        {showAll ? "Show abnormal only" : `Show all ${matrix.length} days`}
      </button>
    </div>
  );
}
