import { Fragment, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { CollapsiblePane } from "@/components/analysis/panes/CollapsiblePane";
import { OverridePill } from "@/components/ui/OverridePill";
import type { StudyMortality, DeathRecord } from "@/types/mortality";

// ── Helpers ──────────────────────────────────────────────────

/** Whether this subject is in an override state (not at default). */
function isOverride(d: DeathRecord & { attribution: string }, isExcluded: boolean, isTr: boolean): boolean {
  if (d.is_recovery) return !isExcluded; // default: excluded
  if (d.attribution === "Accidental") return isExcluded; // default: included
  if (isTr) return !isExcluded; // default: excluded (in early_death_subjects)
  return false;
}

/** Tooltip explaining the subject's current inclusion state. */
function subjectTooltip(d: DeathRecord & { attribution: string }, isExcluded: boolean, isTr: boolean): string {
  const id = d.USUBJID;

  // Recovery — default: excluded (separate arm)
  if (d.is_recovery) {
    return isExcluded
      ? `${id}: Excluded (default). Recovery arm subjects analyzed separately from main study.`
      : `${id}: Included by reviewer override. Default: excluded — recovery arm subjects analyzed separately.`;
  }

  // Accidental death — default: included
  if (d.attribution === "Accidental") {
    return isExcluded
      ? `${id}: Excluded by reviewer override. Default: included — valid drug-exposure data through day ${d.study_day ?? "?"}.`
      : `${id}: Included (default). Valid drug-exposure data through day ${d.study_day ?? "?"}; death not treatment-related.`;
  }

  // Non-accidental death in early_death_subjects — default: excluded from terminal stats
  if (isTr) {
    return isExcluded
      ? `${id}: Excluded (default). Unscheduled death — terminal data excluded from group statistics.`
      : `${id}: Included by reviewer override. Default: excluded — unscheduled death.`;
  }

  // Generic fallback
  return isExcluded
    ? `${id}: Excluded from terminal statistics.`
    : `${id}: Included in terminal statistics.`;
}

// ── Qualification Section ────────────────────────────────────

function MortalityQualification({ q }: { q: import("@/types/mortality").MortalityQualification }) {
  if (q.control_mortality_rate == null) {
    return (
      <div className="mb-2 text-[11px] text-muted-foreground">
        No concurrent control -- mortality qualification not applicable
      </div>
    );
  }

  const pct = (q.control_mortality_rate * 100).toFixed(1);
  const dur = q.duration_weeks != null ? `${q.duration_weeks}w` : "unknown duration";

  return (
    <div className="mb-2 space-y-1">
      <div className="mb-1 text-[11px] text-muted-foreground">
        Control mortality: {pct}% ({q.control_deaths}/{q.control_n}) in {dur} study
      </div>
      {q.qualification_flags.map((flag, i) => (
        <div
          key={i}
          className={cn(
            "mb-0.5 flex items-start gap-1 text-[11px] leading-snug",
            flag.severity === "critical" ? "text-red-700" : "text-amber-700",
          )}
        >
          <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          <span>{flag.message}</span>
        </div>
      ))}
      {q.suppress_noael && (
        <div className="mb-1 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-[11px] text-red-800">
          NOAEL determination suppressed due to critical control mortality.
        </div>
      )}
    </div>
  );
}


// ── Main Component ───────────────────────────────────────────

/** Mortality info pane — top-level CollapsiblePane with per-subject table. */
export function MortalityInfoPane({ mortality, expandAll, collapseAll }: { mortality?: StudyMortality | null; expandAll?: number; collapseAll?: number }) {
  const { studyId } = useParams<{ studyId: string }>();
  const queryClient = useQueryClient();
  const { excludedSubjects, toggleSubjectExclusion, trEarlyDeathIds } = useScheduledOnly();

  // Mortality override comments — persisted via annotation API
  // Backend injects pathologist + reviewDate on every save
  const { data: commentAnnotations } = useAnnotations<{ comment: string; pathologist?: string; reviewDate?: string }>(studyId, "mortality-overrides");
  const saveCommentMutation = useSaveAnnotation<{ comment: string; pathologist?: string; reviewDate?: string }>(studyId, "mortality-overrides");

  const overrideComments = useMemo<Record<string, string>>(() => {
    if (!commentAnnotations) return {};
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(commentAnnotations)) {
      if (val.comment) out[key] = val.comment;
    }
    return out;
  }, [commentAnnotations]);

  const saveComment = (id: string, text: string) => {
    // Optimistic update
    queryClient.setQueryData<Record<string, { comment: string; pathologist?: string; reviewDate?: string }>>(
      ["annotations", studyId, "mortality-overrides"],
      (old) => {
        const next = { ...(old ?? {}) };
        if (text) next[id] = { ...next[id], comment: text };
        else delete next[id];
        return next;
      },
    );
    saveCommentMutation.mutate({ entityKey: id, data: { comment: text } });
  };

  // Pending confirmation when reverting a subject with a comment
  const [pendingRevert, setPendingRevert] = useState<string | null>(null);
  // Auto-open the comment popover for this subject after revert
  const [autoOpenComment, setAutoOpenComment] = useState<string | null>(null);

  /** Toggle inclusion — if reverting an override with a comment, ask inline. */
  const handleToggle = (d: DeathRecord & { attribution: string }) => {
    const id = d.USUBJID;
    const isExcluded = excludedSubjects.has(id);
    const isTr = trEarlyDeathIds.has(id);
    const currentlyOverridden = isOverride(d, isExcluded, isTr);

    if (currentlyOverridden && overrideComments[id]) {
      setPendingRevert(id);
      return; // wait for inline confirmation
    }
    toggleSubjectExclusion(id);
  };

  const confirmRevert = (clearComment: boolean) => {
    if (!pendingRevert) return;
    if (clearComment) saveComment(pendingRevert, "");
    toggleSubjectExclusion(pendingRevert);
    setPendingRevert(null);
  };

  // Combine all deaths + accidentals, sorted by study_day.
  // The only classification the engine can make is accidental vs non-accidental
  // (from DS.DSDECOD or DD.DDRESCAT). Treatment-relatedness requires pathologist
  // judgment informed by necropsy, dose-response pattern, and clinical observations.
  const allDeaths: (DeathRecord & { attribution: string })[] = mortality
    ? [
        ...mortality.deaths.map(d => ({ ...d, attribution: "Death" as const })),
        ...mortality.accidentals.map(d => ({ ...d, attribution: "Accidental" as const })),
      ].sort((a, b) => (a.study_day ?? 999) - (b.study_day ?? 999))
    : [];

  const hasMortality = mortality?.has_mortality && allDeaths.length > 0;
  const unit = mortality?.mortality_loael_label?.match(/\d[\d.]*\s*(mg\/kg|mg|µg\/kg|µg|g\/kg|g)/)?.[1] ?? "";

  // Summary reflects current inclusion state
  const includedCount = allDeaths.filter(d => !excludedSubjects.has(d.USUBJID)).length;
  const excludedCount = allDeaths.length - includedCount;
  const summary = hasMortality
    ? excludedCount > 0
      ? `${allDeaths.length} deaths \u00b7 ${includedCount} included \u00b7 ${excludedCount} excluded`
      : `${allDeaths.length} death${allDeaths.length !== 1 ? "s" : ""}`
    : undefined;

  if (!hasMortality) {
    return (
      <CollapsiblePane title="Mortality" defaultOpen={false} sessionKey="pcc.studySettings.mortality" expandAll={expandAll} collapseAll={collapseAll}>
        <div className="text-[11px] text-muted-foreground">No mortality events recorded.</div>
      </CollapsiblePane>
    );
  }

  return (
    <CollapsiblePane title="Mortality" defaultOpen={false} sessionKey="pcc.studySettings.mortality" headerRight={summary} expandAll={expandAll} collapseAll={collapseAll}>
      {/* Qualification summary (Phase B) */}
      {mortality?.qualification && <MortalityQualification q={mortality.qualification} />}

      {/* Per-subject table — standard orientation matching SubjectContextPanel */}
      {mortality && (
        <div className="-mx-4 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="px-1.5 py-0.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Include</th>
                <th className="px-1.5 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Subject</th>
                <th className="px-1.5 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Group</th>
                <th className="px-1.5 py-0.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sex</th>
                <th className="px-1.5 py-0.5 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Day</th>
                <th className="px-1.5 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-1.5 py-0.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Cause</th>
              </tr>
            </thead>
            <tbody>
              {allDeaths.map(d => {
                const isExcluded = excludedSubjects.has(d.USUBJID);
                const isTr = trEarlyDeathIds.has(d.USUBJID);
                const dg = mortality.by_dose.find(b => b.dose_level === d.dose_level);
                const baseDose = dg?.dose_value != null && unit ? `${dg.dose_value} ${unit}` : d.dose_label;
                const cause = d.cause ?? d.disposition;
                const truncCause = cause.length > 20 ? cause.slice(0, 19) + "\u2026" : cause;
                const overridden = isOverride(d, isExcluded, isTr);
                const hasComment = !!overrideComments[d.USUBJID];

                return (
                  <Fragment key={d.USUBJID}>
                  <tr
                    className={cn(
                      "border-b border-dashed border-border/30",
                      d.attribution === "Death" && excludedSubjects.has(d.USUBJID) && "bg-amber-50/50",
                    )}
                  >
                    {/* Include: dot (override indicator) + checkbox */}
                    <td className="px-1.5 py-1">
                      <div className="flex items-center justify-center gap-0.5">
                        {/* Fixed-width slot for override dot — keeps checkbox aligned */}
                        <div className="w-3 shrink-0">
                          {(overridden || hasComment) && (
                            <OverridePill
                              isOverridden
                              note={overrideComments[d.USUBJID]}
                              user={commentAnnotations?.[d.USUBJID]?.pathologist}
                              timestamp={commentAnnotations?.[d.USUBJID]?.reviewDate ? new Date(commentAnnotations[d.USUBJID].reviewDate!).toLocaleDateString() : undefined}
                              onSaveNote={(text) => saveComment(d.USUBJID, text)}
                              placeholder="Death on D90 near terminal sacrifice — included in stats"
                              autoOpen={autoOpenComment === d.USUBJID}
                              onAutoOpened={() => setAutoOpenComment(null)}
                            />
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => handleToggle(d)}
                          title={subjectTooltip(d, isExcluded, isTr)}
                          className="h-3 w-3 rounded border-gray-300"
                        />
                      </div>
                    </td>
                    {/* Subject ID */}
                    <td className="px-1.5 py-1 font-mono tabular-nums">
                      {d.USUBJID.slice(-4)}
                    </td>
                    {/* Group */}
                    <td className="px-1.5 py-1 font-mono tabular-nums font-medium" style={{ color: getDoseGroupColor(d.dose_level) }}>
                      {baseDose}{d.is_recovery && <span className="ml-1 font-normal text-muted-foreground">(R)</span>}
                    </td>
                    {/* Sex */}
                    <td className="px-1.5 py-1 text-center font-mono tabular-nums">{d.sex}</td>
                    {/* Day */}
                    <td className="px-1.5 py-1 text-right font-mono tabular-nums">{d.study_day ?? "\u2014"}</td>
                    {/* Type + cause category badge */}
                    <td className={cn("px-1.5 py-1", d.attribution === "TR" ? "font-medium" : "text-muted-foreground")}>
                      <span>{d.attribution}</span>
                      {d.cause_category === "strain_pathology" && (
                        <span className="ml-1 rounded bg-gray-100 px-1 py-0.5 text-[9px] text-gray-600">Strain</span>
                      )}
                      {d.cause_category === "intercurrent" && (
                        <span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[9px] text-amber-700">Intercurrent</span>
                      )}
                    </td>
                    {/* Cause */}
                    <td className="px-1.5 py-1 text-muted-foreground" title={cause.length > 20 ? cause : undefined}>
                      {truncCause}
                    </td>
                  </tr>
                  {pendingRevert === d.USUBJID && (
                    <tr className="bg-muted/40">
                      <td colSpan={7} className="px-2 py-1.5">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="text-muted-foreground">Override note exists. Select what happens to it:</span>
                          <button
                            type="button"
                            className="font-medium text-primary hover:text-primary/80"
                            onClick={() => confirmRevert(true)}
                          >
                            Clear
                          </button>
                          <button
                            type="button"
                            className="font-medium text-primary hover:text-primary/80"
                            onClick={() => confirmRevert(false)}
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            className="font-medium text-primary hover:text-primary/80"
                            onClick={() => { toggleSubjectExclusion(d.USUBJID); setPendingRevert(null); setAutoOpenComment(d.USUBJID); }}
                          >
                            Update
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </CollapsiblePane>
  );
}
