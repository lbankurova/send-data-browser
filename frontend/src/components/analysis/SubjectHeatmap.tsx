/**
 * SubjectHeatmap — Subject-level severity matrix for histopathology.
 *
 * One column per subject, grouped by dose group.
 * Cells show severity grade (1-5) color-coded with getNeutralHeatColor().
 * Extracted from HistopathologyView.tsx for modularity.
 */

import { useState, useMemo, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDoseGroupColor, formatDoseShortLabel } from "@/lib/severity-colors";
import { getNeutralHeatColor } from "@/lib/histopathology-helpers";
import type { HistopathSelection } from "@/lib/histopathology-helpers";
import { FilterShowingLine } from "@/components/ui/FilterBar";
import { useResizePanel } from "@/hooks/useResizePanel";
import type { SubjectHistopathEntry } from "@/types/timecourse";

const SEV_LABELS: Record<number, string> = { 1: "Minimal", 2: "Mild", 3: "Moderate", 4: "Marked", 5: "Severe" };

export const MAX_COMPARISON_SUBJECTS = 8;

export function SubjectHeatmap({
  subjData,
  isLoading,
  sexFilter,
  minSeverity,
  selection,
  onHeatmapClick,
  onSubjectClick,
  affectedOnly,
  sortMode = "dose",
  doseGroupFilter = null,
  doseGroupOptions = [],
  severityGradedOnly = false,
  findingSeverityMap,
  controls,
  comparisonSubjects,
  onComparisonChange,
  onCompareClick,
  showLaterality = false,
}: {
  subjData: SubjectHistopathEntry[] | null;
  isLoading: boolean;
  sexFilter: string | null;
  minSeverity: number;
  selection: HistopathSelection | null;
  onHeatmapClick: (finding: string) => void;
  onSubjectClick?: (usubjid: string) => void;
  affectedOnly?: boolean;
  sortMode?: "dose" | "severity";
  doseGroupFilter?: ReadonlySet<string> | null;
  doseGroupOptions?: { key: string; label: string; group?: string }[];
  severityGradedOnly?: boolean;
  findingSeverityMap?: Map<string, { maxSev: number; hasSeverityData: boolean }>;
  controls?: ReactNode;
  comparisonSubjects?: Set<string>;
  onComparisonChange?: (subjects: Set<string>) => void;
  onCompareClick?: () => void;
  showLaterality?: boolean;
}) {
  // Selected subject for column highlight
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  // Track last checked subject for shift+click range select
  const lastCheckedRef = useRef<string | null>(null);
  // Toast state for max subjects message
  const [maxToast, setMaxToast] = useState(false);

  // Resizable finding label column
  const { width: labelColW, onPointerDown: onLabelResize } = useResizePanel(124, 100, 400);

  // Filter subjects: dose group first (so control subjects survive), then sex, then affected-only
  const subjects = useMemo(() => {
    if (!subjData) return [];
    let filtered = subjData;
    if (doseGroupFilter !== null) {
      filtered = filtered.filter((s) => {
        const key = `${s.is_recovery ? "R" : ""}${s.dose_level}`;
        return doseGroupFilter.has(key);
      });
    }
    if (sexFilter) filtered = filtered.filter((s) => s.sex === sexFilter);
    if (affectedOnly) filtered = filtered.filter((s) => Object.keys(s.findings).length > 0);

    // Sort: main arms first, then recovery; within each category, dose_level ascending
    const recOrd = (s: SubjectHistopathEntry) => (s.is_recovery ? 1 : 0);
    if (sortMode === "severity") {
      return [...filtered].sort((a, b) => {
        const r = recOrd(a) - recOrd(b);
        if (r !== 0) return r;
        if (a.dose_level !== b.dose_level) return a.dose_level - b.dose_level;
        const aMax = Math.max(0, ...Object.values(a.findings).map((f) => f.severity_num));
        const bMax = Math.max(0, ...Object.values(b.findings).map((f) => f.severity_num));
        return bMax - aMax || a.usubjid.localeCompare(b.usubjid);
      });
    }
    // Default: recovery last, dose_level asc, then sex, then usubjid
    return [...filtered].sort(
      (a, b) =>
        recOrd(a) - recOrd(b) ||
        a.dose_level - b.dose_level ||
        a.sex.localeCompare(b.sex) ||
        a.usubjid.localeCompare(b.usubjid),
    );
  }, [subjData, sexFilter, affectedOnly, sortMode, doseGroupFilter]);

  // All unique findings (rows) — include non-graded, apply filters
  const findings = useMemo(() => {
    if (!subjects.length) return [];
    const findingMaxSev = new Map<string, number>();
    for (const subj of subjects) {
      for (const [finding, val] of Object.entries(subj.findings)) {
        const sev = val.severity_num;
        const existing = findingMaxSev.get(finding) ?? 0;
        if (sev > existing) findingMaxSev.set(finding, sev);
      }
    }
    let entries = [...findingMaxSev.entries()].map(([f, maxSev]) => {
      const hasGrade = findingSeverityMap?.get(f)?.hasSeverityData ?? (maxSev > 0);
      return { finding: f, maxSev, hasSeverityData: hasGrade };
    });
    if (severityGradedOnly) entries = entries.filter((e) => e.hasSeverityData);
    entries = entries.filter((e) => !e.hasSeverityData || e.maxSev >= minSeverity);
    return entries
      .sort((a, b) => {
        if (a.hasSeverityData && !b.hasSeverityData) return -1;
        if (!a.hasSeverityData && b.hasSeverityData) return 1;
        if (a.hasSeverityData && b.hasSeverityData) return b.maxSev - a.maxSev;
        return a.finding.localeCompare(b.finding);
      })
      .map((e) => e.finding);
  }, [subjects, minSeverity, severityGradedOnly, findingSeverityMap]);

  // Map finding → hasSeverityData for cell rendering
  const findingGradeMap = useMemo(() => {
    const map = new Map<string, boolean>();
    if (!findingSeverityMap) return map;
    for (const [f, meta] of findingSeverityMap) {
      map.set(f, meta.hasSeverityData);
    }
    return map;
  }, [findingSeverityMap]);

  // Group subjects by dose level + recovery status
  const doseGroups = useMemo(() => {
    const groups: { doseLevel: number; doseLabel: string; isRecovery: boolean; subjects: typeof subjects }[] = [];
    let currentKey = "";
    for (const subj of subjects) {
      const key = `${subj.is_recovery ? "R" : ""}${subj.dose_level}`;
      if (key !== currentKey) {
        currentKey = key;
        const label = subj.is_recovery ? `${formatDoseShortLabel(subj.dose_label)} (Recovery)` : formatDoseShortLabel(subj.dose_label);
        groups.push({ doseLevel: subj.dose_level, doseLabel: label, isRecovery: subj.is_recovery, subjects: [] });
      }
      groups[groups.length - 1].subjects.push(subj);
    }
    return groups;
  }, [subjects]);

  const shortId = (id: string) => {
    const parts = id.split("-");
    return parts[parts.length - 1] || id.slice(-4);
  };

  // Flatten all visible subjects for range-select
  const allVisibleSubjects = useMemo(() => doseGroups.flatMap((dg) => dg.subjects), [doseGroups]);

  // Toggle comparison subject (with max enforcement)
  const toggleComparison = useCallback((id: string, shiftKey: boolean) => {
    if (!comparisonSubjects || !onComparisonChange) return;
    const next = new Set(comparisonSubjects);

    if (shiftKey && lastCheckedRef.current) {
      // Range select: all subjects between lastChecked and current
      const ids = allVisibleSubjects.map((s) => s.usubjid);
      const from = ids.indexOf(lastCheckedRef.current);
      const to = ids.indexOf(id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from < to ? [from, to] : [to, from];
        for (let i = lo; i <= hi; i++) {
          if (next.size < MAX_COMPARISON_SUBJECTS) next.add(ids[i]);
        }
      }
    } else {
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_COMPARISON_SUBJECTS) {
          setMaxToast(true);
          setTimeout(() => setMaxToast(false), 3000);
          return;
        }
        next.add(id);
      }
    }
    lastCheckedRef.current = id;
    onComparisonChange(next);
  }, [comparisonSubjects, onComparisonChange, allVisibleSubjects]);

  // Toggle all subjects in a dose group
  const toggleDoseGroup = useCallback((groupSubjects: SubjectHistopathEntry[]) => {
    if (!comparisonSubjects || !onComparisonChange) return;
    const groupIds = groupSubjects.map((s) => s.usubjid);
    const allSelected = groupIds.every((id) => comparisonSubjects.has(id));
    const next = new Set(comparisonSubjects);
    if (allSelected) {
      for (const id of groupIds) next.delete(id);
    } else {
      for (const id of groupIds) {
        if (next.size < MAX_COMPARISON_SUBJECTS) next.add(id);
      }
    }
    onComparisonChange(next);
  }, [comparisonSubjects, onComparisonChange]);

  // Column tint helper
  const colTint = (subjId: string) => {
    const isSingleSelected = selectedSubject === subjId;
    const isCompSelected = comparisonSubjects?.has(subjId) ?? false;
    if (isSingleSelected) return "bg-blue-50/50";
    if (isCompSelected) return "bg-amber-50/40";
    return "";
  };

  // Selection bar summary
  const selectionBarInfo = useMemo(() => {
    if (!comparisonSubjects || comparisonSubjects.size === 0) return null;
    const infos: string[] = [];
    for (const id of comparisonSubjects) {
      const s = allVisibleSubjects.find((sub) => sub.usubjid === id);
      if (s) infos.push(`${shortId(id)} (${s.sex}, ${formatDoseShortLabel(s.dose_label)})`);
      else infos.push(shortId(id));
    }
    return infos;
  }, [comparisonSubjects, allVisibleSubjects]);

  // Empty state message (null = show matrix)
  const emptyMessage = isLoading
    ? null
    : !subjData || subjects.length === 0
      ? "Subject-level data not available for this specimen."
      : findings.length === 0
        ? "No findings match the current filters."
        : null;

  return (
    <div className="relative border-b p-3">
      {/* Active filter summary */}
      {!isLoading && subjData && (() => {
        const parts: string[] = [];
        if (doseGroupFilter !== null) {
          const labels = doseGroupOptions
            .filter((o) => doseGroupFilter.has(o.key))
            .map((o) => o.group ? `${o.label} (R)` : o.label);
          parts.push(labels.join(", "));
        } else {
          parts.push("All groups");
        }
        parts.push(sexFilter ? (sexFilter === "M" ? "Male" : "Female") : "Both sexes");
        if (minSeverity > 0) parts.push(`Severity ${minSeverity}+`);
        if (severityGradedOnly) parts.push("Severity graded only");
        if (affectedOnly) parts.push("Affected only");
        return <FilterShowingLine className="mb-1" parts={parts} />;
      })()}

      {/* Controls */}
      {controls}

      {/* Severity legend */}
      {!isLoading && subjData && (
        <div className="flex items-center gap-1 px-3 pb-2 pt-1 text-[10px] text-muted-foreground">
          <span>Severity:</span>
          {[
            { label: "1 Minimal", color: getNeutralHeatColor(1).bg },
            { label: "2 Mild", color: getNeutralHeatColor(2).bg },
            { label: "3 Moderate", color: getNeutralHeatColor(3).bg },
            { label: "4 Marked", color: getNeutralHeatColor(4).bg },
            { label: "5 Severe", color: getNeutralHeatColor(5).bg },
          ].map(({ label, color }) => (
            <span key={label} className="flex items-center gap-0.5">
              <span className={cn("inline-block h-3 w-3 rounded-sm", color === "transparent" && "border border-border")} style={{ backgroundColor: color }} />
              {label}
            </span>
          ))}
          <span className="ml-2 flex items-center gap-1">
            <span className="text-[10px] text-gray-400">●</span>
            = present (no grade)
          </span>
          <span className="ml-2">&mdash; = examined, no finding</span>
          <span className="ml-2">blank = not examined</span>
        </div>
      )}

      {/* Loading spinner */}
      {isLoading ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Loading subject data&hellip;</span>
        </div>
      ) : emptyMessage ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          {emptyMessage}
        </div>
      ) : (<>

      <div className="mt-1 overflow-x-auto">
        <div className="inline-block">
          {/* Tier 1: Dose group headers */}
          <div className="flex">
            <div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: labelColW }}>
              {/* Resize handle */}
              <div
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/30"
                onPointerDown={onLabelResize}
              />
            </div>
            {doseGroups.map((dg, gi) => {
              const groupIds = dg.subjects.map((s) => s.usubjid);
              const allChecked = comparisonSubjects ? groupIds.every((id) => comparisonSubjects.has(id)) : false;
              const someChecked = comparisonSubjects ? groupIds.some((id) => comparisonSubjects.has(id)) : false;

              return (
              <div
                key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`}
                className={cn(
                  "flex-shrink-0 border-b",
                  gi > 0 && "border-l-2 border-border"
                )}
              >
                <div className="text-center" style={{ width: dg.subjects.length * 32 }}>
                  <div className="h-0.5 rounded-full" style={{ backgroundColor: getDoseGroupColor(dg.doseLevel) }} />
                  <div className="flex items-center justify-center gap-1 px-1 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {comparisonSubjects && onComparisonChange && (
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
                        onChange={() => toggleDoseGroup(dg.subjects)}
                        className="h-3 w-3 rounded-sm border-gray-300"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    {dg.doseLabel} ({dg.subjects.length})
                  </div>
                </div>
              </div>
              );
            })}
          </div>

          {/* Tier 2: Subject IDs */}
          <div className="flex">
            <div className="sticky left-0 z-10 shrink-0 bg-background py-0.5 text-right pr-2 text-[8px] font-semibold text-muted-foreground" style={{ width: labelColW }}>
              Subject ID
            </div>
            {doseGroups.map((dg, gi) => (
              <div key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                {dg.subjects.map((subj) => (
                  <button
                    key={subj.usubjid}
                    className={cn(
                      "w-8 shrink-0 cursor-pointer py-0.5 text-center font-mono text-[9px] text-muted-foreground hover:bg-accent/30",
                      colTint(subj.usubjid),
                    )}
                    onClick={() => {
                      const next = selectedSubject === subj.usubjid ? null : subj.usubjid;
                      setSelectedSubject(next);
                      if (next) onSubjectClick?.(next);
                    }}
                  >
                    {shortId(subj.usubjid)}
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* Laterality header row (paired organs only) */}
          {showLaterality && (
            <div className="flex">
              <div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: labelColW }} />
              {doseGroups.map((dg, gi) => (
                <div key={`lat-${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                  {dg.subjects.map((subj) => {
                    // Compute per-subject laterality summary
                    const latValues = Object.values(subj.findings)
                      .map((f) => f.laterality?.toUpperCase())
                      .filter(Boolean) as string[];
                    const hasLeft = latValues.some((l) => l === "LEFT");
                    const hasRight = latValues.some((l) => l === "RIGHT");
                    const hasBilateral = latValues.some((l) => l === "BILATERAL");
                    const label = hasBilateral ? "B" : (hasLeft && hasRight) ? "B" : hasLeft ? "L" : hasRight ? "R" : "";
                    return (
                      <div
                        key={subj.usubjid}
                        className={cn(
                          "w-8 shrink-0 text-center text-[7px] font-medium text-muted-foreground",
                          colTint(subj.usubjid),
                        )}
                      >
                        {label}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* Checkbox row for comparison selection */}
          {comparisonSubjects && onComparisonChange && (
            <div className="flex">
              <div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: labelColW }} />
              {doseGroups.map((dg, gi) => (
                <div key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                  {dg.subjects.map((subj) => (
                    <div
                      key={subj.usubjid}
                      className={cn(
                        "flex h-5 w-8 shrink-0 items-center justify-center",
                        colTint(subj.usubjid),
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={comparisonSubjects.has(subj.usubjid)}
                        onChange={(e) => toggleComparison(subj.usubjid, (e.nativeEvent as MouseEvent).shiftKey)}
                        className="h-3 w-3 rounded-sm border-gray-300"
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Sex indicator row */}
          {!sexFilter && (
            <div className="flex">
              <div className="sticky left-0 z-10 shrink-0 bg-background py-0.5 text-right pr-2 text-[8px] font-semibold text-muted-foreground" style={{ width: labelColW }}>
                Sex
              </div>
              {doseGroups.map((dg, gi) => (
                <div key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                  {dg.subjects.map((subj) => (
                    <div
                      key={subj.usubjid}
                      className={cn(
                        "flex h-4 w-8 shrink-0 items-center justify-center text-[8px] font-semibold text-muted-foreground",
                        colTint(subj.usubjid),
                      )}
                    >
                      {subj.sex}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Examined row */}
          <div className="flex border-b">
            <div className="sticky left-0 z-10 shrink-0 bg-background py-0.5 text-right pr-2 text-[9px] text-muted-foreground" style={{ width: labelColW }}>
              Examined
            </div>
            {doseGroups.map((dg, gi) => (
              <div key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                {dg.subjects.map((subj) => {
                  const hasAny = Object.keys(subj.findings).length > 0;
                  return (
                    <div
                      key={subj.usubjid}
                      className={cn(
                        "flex h-4 w-8 shrink-0 items-center justify-center text-[9px] text-muted-foreground",
                        colTint(subj.usubjid),
                      )}
                      title={hasAny ? `${subj.usubjid}: examined, has findings` : `${subj.usubjid}: no findings recorded`}
                    >
                      {hasAny ? "E" : ""}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Data rows — one per finding */}
          {findings.map((finding) => (
            <div
              key={finding}
              className={cn(
                "flex cursor-pointer border-t hover:bg-accent/20",
                selection?.finding === finding && "ring-1 ring-primary"
              )}
              onClick={() => onHeatmapClick(finding)}
            >
              {/* Finding label — sticky */}
              <div
                className="sticky left-0 z-10 shrink-0 truncate bg-background py-0.5 pr-2 text-[10px]"
                style={{ width: labelColW }}
                title={finding}
              >
                {finding}
              </div>
              {/* Cells per dose group */}
              {doseGroups.map((dg, gi) => (
                <div key={`${dg.isRecovery ? "R" : ""}${dg.doseLevel}`} className={cn("flex", gi > 0 && "border-l-2 border-border")}>
                  {dg.subjects.map((subj) => {
                    const entry = subj.findings[finding];
                    const sevNum = entry?.severity_num ?? 0;
                    const hasEntry = !!entry;
                    const colors = sevNum > 0 ? getNeutralHeatColor(sevNum) : null;

                    return (
                      <div
                        key={subj.usubjid}
                        className={cn(
                          "flex h-6 w-8 shrink-0 items-center justify-center",
                          colTint(subj.usubjid),
                        )}
                        title={
                          hasEntry
                            ? `${subj.usubjid}: ${finding} \u2014 ${sevNum > 0 ? (entry.severity ?? SEV_LABELS[sevNum] ?? "N/A") : "Present (severity not graded)"}`
                            : `${subj.usubjid}: not observed`
                        }
                      >
                        {sevNum > 0 ? (
                          <div
                            className="relative flex h-5 w-6 items-center justify-center rounded-sm font-mono text-[9px]"
                            style={{ backgroundColor: colors!.bg, color: colors!.text }}
                          >
                            {sevNum}
                            {showLaterality && entry?.laterality && (() => {
                              const lat = entry.laterality!.toUpperCase();
                              if (lat === "BILATERAL") return null;
                              return (
                                <span
                                  className={cn("absolute top-0 h-1.5 w-1.5 rounded-full opacity-70", lat === "LEFT" ? "left-0" : "right-0")}
                                  style={{ backgroundColor: colors!.text }}
                                  title={lat === "LEFT" ? "Left" : "Right"}
                                />
                              );
                            })()}
                          </div>
                        ) : hasEntry && findingGradeMap.get(finding) ? (
                          <span className="text-[9px] text-muted-foreground">&mdash;</span>
                        ) : hasEntry ? (
                          <span className="relative text-[10px] text-gray-400">
                            ●
                            {showLaterality && entry?.laterality && (() => {
                              const lat = entry.laterality!.toUpperCase();
                              if (lat === "BILATERAL") return null;
                              return (
                                <span
                                  className={cn("absolute top-0 h-1 w-1 rounded-full bg-gray-400", lat === "LEFT" ? "-left-1" : "-right-1")}
                                  title={lat === "LEFT" ? "Left" : "Right"}
                                />
                              );
                            })()}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      </>)}

      {/* Selection bar for comparison */}
      {selectionBarInfo && selectionBarInfo.length > 0 && (
        <div className="flex items-center gap-2 border-t bg-muted/30 px-3 py-1.5 text-xs">
          <span className="font-medium text-foreground">
            {comparisonSubjects!.size} subjects selected:
          </span>
          <span
            className="flex-1 truncate text-muted-foreground"
            title={selectionBarInfo.join(", ")}
          >
            {selectionBarInfo.join(", ")}
          </span>
          <button
            disabled={comparisonSubjects!.size < 2}
            onClick={onCompareClick}
            className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
          >
            Compare
          </button>
          <button
            onClick={() => onComparisonChange?.(new Set())}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            Clear
          </button>
        </div>
      )}

      {/* Max subjects toast */}
      {maxToast && (
        <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-muted/90 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          Maximum {MAX_COMPARISON_SUBJECTS} subjects for comparison. Deselect one to add another.
        </div>
      )}
    </div>
  );
}
