import { Fragment, useState } from "react";
import { cn } from "@/lib/utils";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { CollapsiblePane } from "@/components/analysis/panes/CollapsiblePane";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { StudyMortality, DeathRecord } from "@/types/mortality";

// ── Helpers ──────────────────────────────────────────────────

/** Whether this subject is in an override state (not at default). */
function isOverride(d: DeathRecord & { attribution: string }, isExcluded: boolean, isTr: boolean): boolean {
  if (d.is_recovery) return !isExcluded; // default: excluded
  if (d.attribution === "Accidental") return isExcluded; // default: included
  if (isTr) return !isExcluded; // default: excluded
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

  // TR early death — default: excluded
  if (isTr) {
    return isExcluded
      ? `${id}: Excluded (default). Terminal data from moribund/found-dead animals skews group means.`
      : `${id}: Included by reviewer override. Default: excluded — terminal data from moribund/found-dead animals skews group means.`;
  }

  // Generic fallback
  return isExcluded
    ? `${id}: Excluded from terminal statistics.`
    : `${id}: Included in terminal statistics.`;
}

// ── Override Comment Popover ─────────────────────────────────

function OverrideDot({
  subjectId,
  comments,
  onSave,
  autoOpen,
  onAutoOpened,
}: {
  subjectId: string;
  comments: Record<string, string>;
  onSave: (id: string, text: string) => void;
  autoOpen?: boolean;
  onAutoOpened?: () => void;
}) {
  const existing = comments[subjectId] ?? "";
  const [draft, setDraft] = useState(existing);
  const [open, setOpen] = useState(autoOpen ?? false);
  // Handle auto-open trigger
  if (autoOpen && !open) {
    setOpen(true);
    setDraft(existing);
    onAutoOpened?.();
  }
  const hasComment = existing.length > 0;
  const PLACEHOLDER = "Death on D90 near terminal sacrifice \u2014 included in stats";

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) setDraft(existing); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-4 w-3 items-center justify-center"
          title={hasComment ? `Note: ${existing}` : "Add override note"}
        >
          <span
            className={cn(
              "block h-[6px] w-[6px] rounded-full",
              hasComment
                ? "bg-primary"
                : "bg-muted-foreground/30 hover:bg-muted-foreground/60",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="right" className="w-56 p-2">
        <div className="mb-1 text-[10px] font-medium text-muted-foreground">Override note</div>
        <textarea
          className="w-full rounded border bg-background px-1.5 py-1 text-[11px] leading-snug placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
          rows={3}
          placeholder={`e.g., ${PLACEHOLDER}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Tab-complete when empty
            if (e.key === "Tab" && !draft.trim()) {
              e.preventDefault();
              setDraft(PLACEHOLDER);
              return;
            }
            // Enter saves (Shift+Enter for newline)
            if (e.key === "Enter" && !e.shiftKey && draft !== existing) {
              e.preventDefault();
              onSave(subjectId, draft);
              setOpen(false);
            }
          }}
        />
        <div className="mt-1 flex justify-end gap-1">
          <button
            type="button"
            className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={draft === existing}
            onClick={() => { onSave(subjectId, draft); setOpen(false); }}
          >
            Save
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Main Component ───────────────────────────────────────────

/** Mortality info pane — top-level CollapsiblePane with per-subject table. */
export function MortalityInfoPane({ mortality }: { mortality?: StudyMortality | null }) {
  const { excludedSubjects, toggleSubjectExclusion, trEarlyDeathIds } = useScheduledOnly();
  const [overrideComments, setOverrideComments] = useState<Record<string, string>>({});

  const saveComment = (id: string, text: string) => {
    setOverrideComments((prev) => {
      const next = { ...prev };
      if (text) next[id] = text;
      else delete next[id];
      return next;
    });
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

  // Combine all deaths: TR (main + recovery) + accidental, sorted by study_day
  const allDeaths: (DeathRecord & { attribution: string })[] = mortality
    ? [
        ...mortality.deaths.map(d => ({ ...d, attribution: "TR" as const })),
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
      <CollapsiblePane title="Mortality"  defaultOpen={false}>
        <div className="text-[10px] text-muted-foreground">No mortality events recorded.</div>
      </CollapsiblePane>
    );
  }

  return (
    <CollapsiblePane title="Mortality"  headerRight={summary}>
      {/* Per-subject table — standard orientation matching SubjectContextPanel */}
      {mortality && (
        <div className="-mx-4 overflow-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b">
                <th className="px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Include</th>
                <th className="px-1.5 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Subject</th>
                <th className="px-1.5 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Group</th>
                <th className="px-1.5 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sex</th>
                <th className="px-1.5 py-0.5 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Day</th>
                <th className="px-1.5 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                <th className="px-1.5 py-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cause</th>
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
                      d.attribution === "TR" && "bg-amber-50/50",
                    )}
                  >
                    {/* Include: dot (override indicator) + checkbox */}
                    <td className="px-1.5 py-1">
                      <div className="flex items-center justify-center gap-0.5">
                        {/* Fixed-width slot for override dot — keeps checkbox aligned */}
                        <div className="w-3 shrink-0">
                          {(overridden || hasComment) && (
                            <OverrideDot
                              subjectId={d.USUBJID}
                              comments={overrideComments}
                              onSave={saveComment}
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
                    {/* Type */}
                    <td className={cn("px-1.5 py-1", d.attribution === "TR" ? "font-medium" : "text-muted-foreground")}>
                      {d.attribution}
                    </td>
                    {/* Cause */}
                    <td className="px-1.5 py-1 text-muted-foreground" title={cause.length > 20 ? cause : undefined}>
                      {truncCause}
                    </td>
                  </tr>
                  {pendingRevert === d.USUBJID && (
                    <tr className="bg-muted/40">
                      <td colSpan={7} className="px-2 py-1.5">
                        <div className="flex items-center gap-2 text-[10px]">
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
