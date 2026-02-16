/**
 * Compare tab — multi-subject comparison surface for the Histopathology view.
 *
 * Four collapsible sections:
 *   1. Finding concordance matrix (from existing subjData — no API call)
 *   2. Lab values comparison (from useSubjectComparison)
 *   3. Body weight chart (ECharts overlay)
 *   4. Clinical observations diff
 *
 * Subjects are grouped by dose group + arm (main/recovery) in all sections.
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
import { getDoseGroupColor } from "@/lib/severity-colors";
import { ORGAN_RELEVANT_TESTS } from "@/lib/organ-test-mapping";

// ─── Grouping types ──────────────────────────────────────────

type EnrichedSubject = ComparisonSubjectProfile & { isRecovery: boolean };

interface SubjectGroup {
  doseLevel: number;
  doseLabel: string;
  isRecovery: boolean;
  subjects: EnrichedSubject[];
}

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

// ─── Grouping helpers ────────────────────────────────────────

function buildGroups(
  subjectInfo: ComparisonSubjectProfile[],
  subjData: SubjectHistopathEntry[] | null,
): SubjectGroup[] {
  const recoverySet = new Set<string>();
  if (subjData) {
    for (const s of subjData) {
      if (s.is_recovery) recoverySet.add(s.usubjid);
    }
  }

  const map = new Map<string, SubjectGroup>();
  for (const s of subjectInfo) {
    const isRec = recoverySet.has(s.usubjid);
    const key = `${s.dose_level}-${isRec ? "R" : "M"}`;
    if (!map.has(key)) {
      map.set(key, { doseLevel: s.dose_level, doseLabel: s.dose_label, isRecovery: isRec, subjects: [] });
    }
    map.get(key)!.subjects.push({ ...s, isRecovery: isRec });
  }

  return [...map.values()].sort((a, b) => {
    if (a.doseLevel !== b.doseLevel) return a.doseLevel - b.doseLevel;
    return a.isRecovery ? 1 : -1; // main first
  });
}

/** IDs of subjects that start a new group boundary (excluding first group). */
function getGroupStartSet(groups: SubjectGroup[]): Set<string> {
  const set = new Set<string>();
  let first = true;
  for (const g of groups) {
    if (!first && g.subjects.length > 0) set.add(g.subjects[0].usubjid);
    first = false;
  }
  return set;
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

  // Group subjects by dose group + arm
  const groups = useMemo(() => buildGroups(subjectInfo, subjData), [subjectInfo, subjData]);

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
          {groups.map((g, i) => (
            <span key={`${g.doseLevel}-${g.isRecovery}`}>
              {i > 0 && " \u00B7 "}
              {g.doseLabel} {g.isRecovery ? "recovery" : "main"} ({g.subjects.length})
            </span>
          ))}
        </div>
      </div>

      {/* Section 1: Finding Concordance */}
      <CollapsiblePane title="Finding concordance">
        <FindingConcordance
          groups={groups}
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
            groups={groups}
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
            groups={groups}
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
            groups={groups}
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

type SortMode = "severity" | "concordance" | "alpha";
type FilterMode = "all" | "shared" | "graded";

function FindingConcordance({
  groups,
  subjData,
  onFindingClick,
}: {
  groups: SubjectGroup[];
  subjData: SubjectHistopathEntry[] | null;
  onFindingClick: (finding: string) => void;
}) {
  const [sortMode, setSortMode] = useState<SortMode>("severity");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");

  if (!subjData) return <EmptyState message="Subject data not available." />;

  const orderedSubjects = groups.flatMap((g) => g.subjects);
  const orderedIds = orderedSubjects.map((s) => s.usubjid);
  const N = orderedIds.length;
  const groupStartSet = getGroupStartSet(groups);

  // Filter to selected subjects
  const selected = subjData.filter((s) => orderedIds.includes(s.usubjid));
  if (selected.length === 0) return <EmptyState message="No data for selected subjects." />;

  // Collect all findings across selected subjects
  const findingMaxSev = new Map<string, number>();
  const findingHasGrade = new Map<string, boolean>();
  const findingCount = new Map<string, number>();
  for (const subj of selected) {
    for (const [finding, val] of Object.entries(subj.findings)) {
      const existing = findingMaxSev.get(finding) ?? 0;
      if (val.severity_num > existing) findingMaxSev.set(finding, val.severity_num);
      if (val.severity_num > 0) findingHasGrade.set(finding, true);
      if (!findingHasGrade.has(finding)) findingHasGrade.set(finding, false);
      findingCount.set(finding, (findingCount.get(finding) ?? 0) + 1);
    }
  }

  // Filter findings
  const filteredEntries = [...findingMaxSev.entries()].filter(([f]) => {
    if (filterMode === "shared") return (findingCount.get(f) ?? 0) >= Math.ceil(N / 2);
    if (filterMode === "graded") return findingHasGrade.get(f) ?? false;
    return true;
  });

  // Sort findings
  const findings = filteredEntries
    .sort((a, b) => {
      if (sortMode === "concordance") {
        const ca = findingCount.get(a[0]) ?? 0;
        const cb = findingCount.get(b[0]) ?? 0;
        if (cb !== ca) return cb - ca;
        return a[0].localeCompare(b[0]);
      }
      if (sortMode === "alpha") return a[0].localeCompare(b[0]);
      // severity (default)
      const aGraded = findingHasGrade.get(a[0]) ?? false;
      const bGraded = findingHasGrade.get(b[0]) ?? false;
      if (aGraded && !bGraded) return -1;
      if (!aGraded && bGraded) return 1;
      if (aGraded && bGraded) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
    .map(([f]) => f);

  if (findingMaxSev.size === 0) return <EmptyState message="No findings observed in selected subjects." />;

  return (
    <div>
      {/* Sort + filter toolbar */}
      <div className="mb-1.5 flex items-center gap-3 text-[10px]">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Sort:</span>
          {(["severity", "concordance", "alpha"] as const).map((m) => (
            <button
              key={m}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors",
                sortMode === m ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent/50",
              )}
              onClick={() => setSortMode(m)}
            >
              {m === "alpha" ? "A-Z" : m}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Show:</span>
          {([["all", "all"], ["shared", "\u226550%"], ["graded", "graded"]] as const).map(([val, label]) => (
            <button
              key={val}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors",
                filterMode === val ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent/50",
              )}
              onClick={() => setFilterMode(val)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground/50">{findings.length}/{findingMaxSev.size} findings</span>
      </div>

      {findings.length === 0 ? (
        <EmptyState message="No findings match the current filter." />
      ) : (
      <div className="overflow-x-auto">
      <table className="text-[11px]" style={{ minWidth: orderedSubjects.length * 44 + 260 }}>
        <thead>
          {/* Row 1: Group spanning headers */}
          <tr>
            <th
              rowSpan={2}
              className="sticky left-0 z-[1] min-w-[140px] bg-background pb-1 pr-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Finding
            </th>
            {groups.map((g) => (
              <th
                key={`${g.doseLevel}-${g.isRecovery}`}
                colSpan={g.subjects.length}
                className="border-b border-l border-border/30 pb-0.5 text-center text-[9px] font-medium text-muted-foreground"
              >
                {g.doseLabel} {g.isRecovery ? "rec" : "main"}
              </th>
            ))}
            <th
              rowSpan={2}
              className="min-w-[50px] pb-1 text-center text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
            >
              N
            </th>
          </tr>
          {/* Row 2: Subject IDs + sex */}
          <tr className="border-b">
            {orderedSubjects.map((s) => (
              <th
                key={s.usubjid}
                className={cn(
                  "min-w-[36px] pb-1 text-center",
                  groupStartSet.has(s.usubjid) && "border-l border-border/30",
                )}
              >
                <div className="text-[10px] font-medium leading-tight">{s.short_id}</div>
                <div className="text-[8px] text-muted-foreground/60">{s.sex}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {findings.map((finding) => {
            const count = orderedIds.filter((id) => {
              const subj = selected.find((s) => s.usubjid === id);
              return subj && finding in subj.findings;
            }).length;

            return (
              <tr
                key={finding}
                className="cursor-pointer border-t border-border/20 hover:bg-accent/20"
                onClick={() => onFindingClick(finding)}
              >
                <td className="sticky left-0 z-[1] truncate bg-background py-0.5 pr-2 text-[10px]" title={finding}>
                  {finding}
                </td>
                {orderedIds.map((id) => {
                  const subj = selected.find((s) => s.usubjid === id);
                  const entry = subj?.findings[finding];
                  const sevNum = entry?.severity_num ?? 0;
                  const hasEntry = !!entry;
                  const isGraded = findingHasGrade.get(finding) ?? false;
                  const colors = sevNum > 0 ? getNeutralHeatColor(sevNum) : null;

                  return (
                    <td
                      key={id}
                      className={cn(
                        "py-0.5 text-center",
                        groupStartSet.has(id) && "border-l border-border/30",
                      )}
                    >
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
      )}
    </div>
  );
}

// ─── Section 2: Lab Values Comparison ────────────────────────

function LabValuesComparison({
  groups,
  labValues,
  controlLab,
  availableTimepoints,
  specimen,
}: {
  groups: SubjectGroup[];
  labValues: { usubjid: string; test: string; unit: string; day: number; value: number }[];
  controlLab: Record<string, { mean: number; sd: number; unit: string; n: number; by_sex?: Record<string, { mean: number; sd: number; unit: string; n: number }> }>;
  availableTimepoints: number[];
  specimen: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const [selectedTimepoint, setSelectedTimepoint] = useState<number | null>(null);

  const orderedSubjects = groups.flatMap((g) => g.subjects);
  const orderedIds = orderedSubjects.map((s) => s.usubjid);
  const groupStartSet = getGroupStartSet(groups);

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
      const subjectValues = orderedIds.map((id) => {
        const lv = filtered.find((l) => l.usubjid === id && l.test === test);
        return lv?.value ?? null;
      });

      // Check if any value is abnormal (use sex-specific controls when available)
      const hasAbnormal = ctrl
        ? subjectValues.some((v, si) => {
            if (v == null) return false;
            const sexCtrl = ctrl.by_sex?.[orderedSubjects[si]?.sex] ?? ctrl;
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
  }, [testSet, orderedIds, orderedSubjects, filtered, controlLab, relevantTests, showAll]);

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
        <table className="text-[11px]" style={{ minWidth: orderedSubjects.length * 52 + 240 }}>
          <thead>
            {/* Row 1: Group spanning headers */}
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-[1] bg-background pb-1 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                style={{ width: 1, whiteSpace: "nowrap" }}
              >
                Test
              </th>
              <th
                rowSpan={2}
                className="pb-1 pr-3 text-left text-[10px] text-muted-foreground"
                style={{ width: 1, whiteSpace: "nowrap" }}
              >
                Unit
              </th>
              <th
                rowSpan={2}
                className="min-w-[80px] pb-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Control
                <div className="font-normal normal-case tracking-normal text-[9px] text-muted-foreground/70">(mean{"\u00B1"}SD)</div>
              </th>
              {groups.map((g) => (
                <th
                  key={`${g.doseLevel}-${g.isRecovery}`}
                  colSpan={g.subjects.length}
                  className="border-b border-l border-border/30 pb-0.5 text-center text-[9px] font-medium text-muted-foreground"
                >
                  {g.doseLabel} {g.isRecovery ? "rec" : "main"}
                </th>
              ))}
            </tr>
            {/* Row 2: Subject IDs + sex */}
            <tr className="border-b">
              {orderedSubjects.map((s) => (
                <th
                  key={s.usubjid}
                  className={cn(
                    "min-w-[44px] pb-1 text-center",
                    groupStartSet.has(s.usubjid) && "border-l border-border/30",
                  )}
                >
                  <div className="text-[10px] font-medium leading-tight">{s.short_id}</div>
                  <div className="text-[8px] text-muted-foreground/60">{s.sex}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.test} className="border-t border-border/20">
                <td className="sticky left-0 z-[1] whitespace-nowrap bg-background py-0.5 pr-3 font-mono text-[10px] font-medium">
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
                  const id = orderedIds[i];
                  if (val == null) {
                    return (
                      <td
                        key={id}
                        className={cn(
                          "py-0.5 text-center font-mono text-[10px] text-muted-foreground",
                          groupStartSet.has(id) && "border-l border-border/30",
                        )}
                      >
                        &mdash;
                      </td>
                    );
                  }
                  const sexCtrl = row.ctrl?.by_sex?.[orderedSubjects[i]?.sex] ?? row.ctrl;
                  const isHigh = sexCtrl && val > sexCtrl.mean + 2 * sexCtrl.sd;
                  const isLow = sexCtrl && val < sexCtrl.mean - 2 * sexCtrl.sd;
                  return (
                    <td
                      key={id}
                      className={cn(
                        "py-0.5 text-center font-mono text-[11px]",
                        isHigh ? "font-medium text-red-600/70" : isLow ? "font-medium text-blue-600/70" : "text-foreground",
                        groupStartSet.has(id) && "border-l border-border/30",
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
  groups,
  bodyWeights,
  controlBW,
}: {
  groups: SubjectGroup[];
  bodyWeights: { usubjid: string; day: number; weight: number }[];
  controlBW: Record<string, { mean: number; sd: number; n: number; by_sex?: Record<string, { mean: number; sd: number; n: number }> }>;
}) {
  const subjects = useMemo(() => groups.flatMap((g) => g.subjects), [groups]);

  // Default: baseline for mixed sex, absolute for same sex
  const isMixedSex = new Set(subjects.map((s) => s.sex)).size > 1;
  const [mode, setMode] = useState<BWChartMode>(isMixedSex ? "baseline" : "absolute");

  // Re-init mode when sex composition changes
  useEffect(() => {
    setMode(isMixedSex ? "baseline" : "absolute");
  }, [isMixedSex]);

  if (bodyWeights.length === 0) return <EmptyState message="No body weight data available." />;

  const option = buildBWComparisonOption({ subjects, bodyWeights, controlBW, mode });

  const hasRecovery = subjects.some((s) => s.isRecovery);

  return (
    <div>
      {/* Mode toggle + group legend */}
      <div className="mb-1 flex items-center gap-3">
        <div className="flex items-center gap-1">
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
        {subjects.length > 8 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
            {groups.map((g) => (
              <span key={`${g.doseLevel}-${g.isRecovery}`} className="flex items-center gap-1">
                <span
                  className="inline-block h-[3px] w-3 rounded-full"
                  style={{ backgroundColor: getDoseGroupColor(g.doseLevel) }}
                />
                {g.doseLabel} {g.isRecovery ? "rec" : "main"}
              </span>
            ))}
            {hasRecovery && (
              <span className="text-muted-foreground/50">(dashed = recovery)</span>
            )}
          </div>
        )}
      </div>
      <EChartsWrapper option={option} style={{ width: "100%", height: 180 }} />
    </div>
  );
}

// ─── Section 4: Clinical Observations Diff ───────────────────

function ClinicalObsDiff({
  groups,
  clinicalObs,
}: {
  groups: SubjectGroup[];
  clinicalObs: { usubjid: string; day: number; observation: string }[];
}) {
  const [showAll, setShowAll] = useState(false);

  const orderedSubjects = groups.flatMap((g) => g.subjects);
  const orderedIds = orderedSubjects.map((s) => s.usubjid);
  const groupStartSet = getGroupStartSet(groups);

  // Build day × subject matrix
  const matrix = useMemo(() => {
    const dayMap = new Map<number, Map<string, string>>(); // day → (subject → observation)
    for (const obs of clinicalObs) {
      if (!dayMap.has(obs.day)) dayMap.set(obs.day, new Map());
      dayMap.get(obs.day)!.set(obs.usubjid, obs.observation);
    }

    // Add disposition as terminal row
    for (const s of orderedSubjects) {
      if (s.disposition && s.disposition_day != null) {
        if (!dayMap.has(s.disposition_day)) dayMap.set(s.disposition_day, new Map());
        const existing = dayMap.get(s.disposition_day)!.get(s.usubjid);
        if (!existing || existing.toUpperCase() === "NORMAL") {
          dayMap.get(s.disposition_day)!.set(s.usubjid, s.disposition);
        }
      }
    }

    return [...dayMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([day, subjects]) => ({ day, subjects }));
  }, [clinicalObs, orderedSubjects]);

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

  if (clinicalObs.length === 0 && orderedSubjects.every((s) => !s.disposition)) {
    return <EmptyState message="No clinical observation data available." />;
  }

  if (visibleRows.length === 0) {
    return (
      <div>
        <div className="py-4 text-center text-xs text-muted-foreground">
          All clinical observations normal for selected subjects.
        </div>
        {matrix.length > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="text-[10px] text-primary hover:underline"
          >
            Show all {matrix.length} days
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="text-[11px]" style={{ minWidth: orderedSubjects.length * 52 + 60 }}>
          <thead>
            {/* Row 1: Group spanning headers */}
            <tr>
              <th
                rowSpan={2}
                className="sticky left-0 z-[1] min-w-[40px] bg-background pb-1 text-left font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Day
              </th>
              {groups.map((g) => (
                <th
                  key={`${g.doseLevel}-${g.isRecovery}`}
                  colSpan={g.subjects.length}
                  className="border-b border-l border-border/30 pb-0.5 text-center text-[9px] font-medium text-muted-foreground"
                >
                  {g.doseLabel} {g.isRecovery ? "rec" : "main"}
                </th>
              ))}
            </tr>
            {/* Row 2: Subject IDs + sex */}
            <tr className="border-b">
              {orderedSubjects.map((s) => (
                <th
                  key={s.usubjid}
                  className={cn(
                    "min-w-[44px] pb-1 text-left",
                    groupStartSet.has(s.usubjid) && "border-l border-border/30",
                  )}
                >
                  <div className="text-[10px] font-medium leading-tight">{s.short_id}</div>
                  <div className="text-[8px] text-muted-foreground/60">{s.sex}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.day} className="border-t border-border/20">
                <td className="sticky left-0 z-[1] bg-background py-0.5 font-mono text-[10px] text-muted-foreground">
                  {row.day}
                </td>
                {orderedIds.map((id) => {
                  const obs = row.subjects.get(id);
                  if (!obs) {
                    return (
                      <td
                        key={id}
                        className={cn(
                          "py-0.5 text-[10px] text-muted-foreground/30",
                          groupStartSet.has(id) && "border-l border-border/30",
                        )}
                      >
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
                        groupStartSet.has(id) && "border-l border-border/30",
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
