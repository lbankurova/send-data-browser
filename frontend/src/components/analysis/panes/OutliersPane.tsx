/**
 * Outliers Pane — unified biological outlier + LOO-fragile subject table.
 *
 * Shows: (A) unified subject table with Bio/LOO/|z|/Instab/Conc/Days/What-if columns,
 *        (B) before/after impact preview (unchanged from Phase 1),
 *        (C) apply button with honest global label + read-only cross-endpoint disclosure.
 *
 * Always renders when a continuous or incidence finding is selected.
 * Empty state message when no notable subjects exist.
 */
import { useMemo, useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import { useAnimalExclusion } from "@/contexts/AnimalExclusionContext";
import { useExclusionPreview } from "@/hooks/useExclusionPreview";
import type { ExclusionGroupResult } from "@/hooks/useExclusionPreview";
import { useSubjectSentinel } from "@/hooks/useSubjectSentinel";
import { useAnimalInfluence } from "@/hooks/useAnimalInfluence";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { getDoseLabel } from "@/lib/dose-label-utils";
import { shortId } from "@/lib/chart-utils";
import { mergeOutlierSubjects } from "@/lib/outlier-merge";
import type { MergedOutlierSubject } from "@/lib/outlier-merge";

interface OutliersPaneProps {
  finding: UnifiedFinding;
  allFindings: UnifiedFinding[];
  doseGroups?: DoseGroup[];
}

interface OtherEndpointExclusion {
  endpointLabel: string;
  subjects: Array<{ usubjid: string; sex: string; doseLevel: number }>;
}

const DEFAULT_SHOW_COUNT = 10;

/** Renders |g|, gLower, N rows for one dose group in the impact preview table. */
function ImpactGroupRows({
  grp,
  doseLabel,
  showGroupHeader,
  fmt,
  fmtDelta,
}: {
  grp: ExclusionGroupResult;
  doseLabel: string;
  showGroupHeader: boolean;
  fmt: (v: number | null, dp?: number) => string;
  fmtDelta: (before: number | null, after: number | null, dp?: number) => string;
}) {
  return (
    <>
      {showGroupHeader && (
        <tr className="border-b border-border/30">
          <td colSpan={4} className="pt-1.5 pb-0.5 text-[10px] font-medium text-muted-foreground">
            {doseLabel} &middot; D{grp.day}
          </td>
        </tr>
      )}
      <tr className="border-b border-border/30">
        <td className="py-0.5 text-muted-foreground">|g|</td>
        <td className="py-0.5 text-right font-mono">{fmt(grp.before.g)}</td>
        <td className="py-0.5 text-right font-mono">{fmt(grp.after.g)}</td>
        <td className="py-0.5 text-right font-mono text-muted-foreground">{fmtDelta(grp.before.g, grp.after.g)}</td>
      </tr>
      <tr className="border-b border-border/30">
        <td className="py-0.5 text-muted-foreground">gLower</td>
        <td className="py-0.5 text-right font-mono">{fmt(grp.before.g_lower)}</td>
        <td className="py-0.5 text-right font-mono">{fmt(grp.after.g_lower)}</td>
        <td className="py-0.5 text-right font-mono text-muted-foreground">{fmtDelta(grp.before.g_lower, grp.after.g_lower)}</td>
      </tr>
      <tr className="border-b border-border/30">
        <td className="py-0.5 text-muted-foreground">N (ctrl / treated)</td>
        <td className="py-0.5 text-right font-mono">{grp.before.n_ctrl}/{grp.before.n_treated}</td>
        <td className="py-0.5 text-right font-mono">{grp.after.n_ctrl}/{grp.after.n_treated}</td>
        <td className="py-0.5"></td>
      </tr>
    </>
  );
}

// ── Bio column display ─────────────────────────────────────────

function BioCell({ subject }: { subject: MergedOutlierSubject }) {
  if (subject.bioType === "sole") {
    return <span className="text-[9px] text-muted-foreground">sole</span>;
  }
  if (subject.bioType === "non-resp") {
    return <span className="text-[9px] text-muted-foreground">non-resp</span>;
  }
  if (subject.bioType === "outlier") {
    return <span className="text-[10px] text-muted-foreground">{"\u2713"}</span>;
  }
  return <span className="text-muted-foreground/40">--</span>;
}

// ── LOO column display ─────────────────────────────────────────

function LooCell({ subject }: { subject: MergedOutlierSubject }) {
  if (subject.looTautological) {
    return (
      <span
        className="text-muted-foreground/40 cursor-help"
        title="LOO is tautological for sole findings -- removing the only affected animal always collapses the finding"
      >
        --
      </span>
    );
  }
  if (subject.isLoo) {
    return <span className="text-[10px] text-muted-foreground">{"\u2713"}</span>;
  }
  return <span className="text-muted-foreground/40">--</span>;
}

// ── Concordance display ────────────────────────────────────────

function ConcCell({ poc }: { poc: Record<string, number> | null }) {
  if (!poc) return <span className="text-[10px] text-muted-foreground/40">none</span>;

  const entries = Object.entries(poc)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a);

  if (entries.length === 0) return <span className="text-[10px] text-muted-foreground/40">none</span>;

  const [topOrgan, topCount] = entries[0];
  const display =
    entries.length === 1
      ? `${topOrgan}=${topCount}`
      : `${topOrgan}=${topCount} +${entries.length - 1}`;

  const tooltip = entries.map(([organ, count]) => `${organ}: ${count} domains`).join("\n");

  return (
    <span className="text-[10px] text-muted-foreground cursor-help" title={tooltip}>
      {display}
    </span>
  );
}

export function OutliersPane({ finding, allFindings, doseGroups }: OutliersPaneProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const queryClient = useQueryClient();
  const {
    pendingExclusions,
    toggleExclusion,
    isExcluded,
    pendingCount,
    applyExclusions,
    isApplying,
  } = useAnimalExclusion();

  const endpointLabel = finding.endpoint_label ?? finding.finding;

  // ── Data hooks ─────────────────────────────────────────────────
  const { data: sentinelData } = useSubjectSentinel(studyId);
  const { data: influenceData } = useAnimalInfluence(studyId);

  // ── Merged subject list ────────────────────────────────────────
  const mergedSubjects = useMemo(
    () =>
      mergeOutlierSubjects(finding, allFindings, sentinelData, influenceData),
    [finding, allFindings, sentinelData, influenceData],
  );

  // ── Truncation state ───────────────────────────────────────────
  const [showAll, setShowAll] = useState(false);
  const displayedSubjects = showAll
    ? mergedSubjects
    : mergedSubjects.slice(0, DEFAULT_SHOW_COUNT);
  const isTruncated = mergedSubjects.length > DEFAULT_SHOW_COUNT && !showAll;

  // ── Exclusion state (unchanged from Phase 1) ───────────────────
  const excludedIds = useMemo(() => {
    const set = pendingExclusions.get(endpointLabel);
    return set && set.size > 0 ? set : new Set<string>();
  }, [pendingExclusions, endpointLabel]);

  const handleToggle = useCallback(
    (usubjid: string) => toggleExclusion(endpointLabel, usubjid),
    [toggleExclusion, endpointLabel],
  );

  const handleApply = useCallback(async () => {
    if (!studyId) return;
    await applyExclusions(studyId);
    queryClient.invalidateQueries({ queryKey: ["findings", studyId] });
  }, [studyId, applyExclusions, queryClient]);

  // Impact preview
  const { data: preview, isError: previewError } = useExclusionPreview(
    studyId,
    endpointLabel,
    finding.domain,
    excludedIds,
  );

  // Anti-conservative control exclusion warning
  const hasAntiConservativeWarning = useMemo(() => {
    if (!preview?.groups?.length) return false;
    const anyControlExcluded = mergedSubjects.some(
      (s) => s.doseLevel === 0 && s.isLoo && excludedIds.has(s.usubjid),
    );
    if (!anyControlExcluded) return false;
    return preview.groups.some((g) => g.after?.g != null && g.after.g > g.before.g);
  }, [preview, mergedSubjects, excludedIds]);

  // Excessive exclusion check
  const excessiveWarning = useMemo(() => {
    if (excludedIds.size === 0 || !doseGroups) return null;
    for (const dg of doseGroups) {
      if (dg.n_total === 0) continue;
      const excluded = mergedSubjects.filter(
        (s) => s.doseLevel === dg.dose_level && excludedIds.has(s.usubjid),
      ).length;
      if (excluded > 0 && excluded / dg.n_total > 0.2) {
        return `More than ${excluded} of ${dg.n_total} animals excluded from ${dg.label}. Consider study-level exclusion.`;
      }
    }
    return null;
  }, [excludedIds, doseGroups, mergedSubjects]);

  // Cross-endpoint pending exclusions (disclosure)
  const otherEndpointExclusions = useMemo<OtherEndpointExclusion[]>(() => {
    const out: OtherEndpointExclusion[] = [];
    for (const [otherEp, ids] of pendingExclusions) {
      if (otherEp === endpointLabel) continue;
      if (ids.size === 0) continue;
      const subjects: Array<{ usubjid: string; sex: string; doseLevel: number }> = [];
      for (const usubjid of ids) {
        let meta: { sex: string; doseLevel: number } | null = null;
        for (const f of allFindings) {
          if ((f.endpoint_label ?? f.finding) !== otherEp) continue;
          const per = f.loo_per_subject?.[usubjid];
          if (per) {
            meta = { sex: f.sex ?? "", doseLevel: per.dose_level };
            break;
          }
        }
        if (meta) {
          subjects.push({ usubjid, sex: meta.sex, doseLevel: meta.doseLevel });
        } else {
          subjects.push({ usubjid, sex: "", doseLevel: -1 });
        }
      }
      out.push({ endpointLabel: otherEp, subjects });
    }
    return out;
  }, [pendingExclusions, endpointLabel, allFindings]);

  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const hasSmallN = doseGroups?.some((dg) => dg.n_total > 0 && dg.n_total <= 5) ?? false;
  const isIncidence = finding.data_type === "incidence";

  // ── Empty state ────────────────────────────────────────────────
  if (mergedSubjects.length === 0) {
    return (
      <div className="text-xs text-muted-foreground text-center py-3">
        No biological outliers or LOO-influential subjects for this endpoint.
      </div>
    );
  }

  const fmt = (v: number | null, dp: number = 2) => (v != null ? v.toFixed(dp) : "--");
  const fmtDelta = (before: number | null, after: number | null, dp: number = 2) => {
    if (before == null || after == null) return "";
    const d = after - before;
    return (d >= 0 ? "+" : "") + d.toFixed(dp);
  };

  return (
    <div>
      {/* Section A: Unified Subject Table */}
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b text-[10px] text-muted-foreground">
            <th className="py-0.5 text-left font-medium">Subject</th>
            <th className="py-0.5 text-right font-medium w-10 cursor-help" title="Biological outlier flag. Checkmark for |z| > 3.5 (continuous), 'sole' for sole finding, 'non-resp' for non-responder (incidence).">Bio</th>
            <th className="py-0.5 text-right font-medium w-8 cursor-help" title="Leave-one-out sensitivity. Checkmark indicates this subject's removal changes the effect size by >20%.">LOO</th>
            {!isIncidence && (
              <th className="py-0.5 text-right font-medium cursor-help" title="Biological deviation from dose group (robust |z-score|). Higher values indicate the animal is more extreme relative to its groupmates.">Bio dev.</th>
            )}
            {!isIncidence && (
              <th className="py-0.5 text-right font-medium cursor-help" title="Lowest % of effect size (|g|) retained after removing this subject, across timepoints where it is LOO-influential.">Retained effect</th>
            )}
            <th className="py-0.5 text-right font-medium w-14 cursor-help" title="Pattern of concordance -- how many domains show correlated findings for this animal in the same organ system. Higher counts suggest a systemic effect rather than an isolated measurement.">POC</th>
            {!isIncidence && (
              <th className="py-0.5 text-right font-medium cursor-help" title="Timepoints where this subject is LOO-influential">Days</th>
            )}
            <th className="py-0.5 text-right font-medium w-8 cursor-help" title="What-if exclusion preview (LOO-fragile only)">Excl.</th>
          </tr>
        </thead>
        <tbody>
          {displayedSubjects.map((s) => {
            const color = getDoseGroupColor(s.doseLevel);
            const checked = isExcluded(endpointLabel, s.usubjid);
            const dayLabels = s.days.map((d) => `D${d}`);
            const daysDisplay =
              s.days.length === 0
                ? null
                : s.days.length <= 3
                  ? dayLabels.join(" ")
                  : `${dayLabels[0]} ${dayLabels[1]} +${s.days.length - 2}`;
            const daysTitle = s.days.length > 3 ? dayLabels.join(", ") : undefined;

            return (
              <tr key={s.usubjid} className="border-b border-border/30">
                {/* Subject */}
                <td className="py-0.5">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-[3px] h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-mono text-[10px]">{shortId(s.usubjid)}</span>
                    <span className="text-muted-foreground text-[9px]">{s.sex}</span>
                  </div>
                </td>
                {/* Bio */}
                <td className="py-0.5 text-right">
                  <BioCell subject={s} />
                </td>
                {/* LOO */}
                <td className="py-0.5 text-right">
                  <LooCell subject={s} />
                </td>
                {/* Bio dev. */}
                {!isIncidence && (
                  <td className="py-0.5 text-right font-mono">
                    {s.zScore != null ? (
                      <span className={Math.abs(s.zScore) > 3.5 ? "text-foreground font-medium" : "text-muted-foreground/40"}>
                        {Math.abs(s.zScore).toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">--</span>
                    )}
                  </td>
                )}
                {/* Retained effect */}
                {!isIncidence && (
                  <td className="py-0.5 text-right font-mono">
                    {s.worstRatio != null ? (
                      <span className={s.worstRatio < 0.5 ? "text-foreground font-medium" : "text-muted-foreground"}>
                        {(s.worstRatio * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">--</span>
                    )}
                  </td>
                )}
                {/* POC */}
                <td className="py-0.5 text-right">
                  <ConcCell poc={s.poc} />
                </td>
                {/* Days */}
                {!isIncidence && (
                  <td className="py-0.5 text-right">
                    {daysDisplay ? (
                      <span className="text-[10px] text-muted-foreground" title={daysTitle}>
                        {daysDisplay}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40">--</span>
                    )}
                  </td>
                )}
                {/* What-if checkbox */}
                <td className="py-0.5 text-right">
                  {s.isLoo ? (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggle(s.usubjid)}
                      className="w-3 h-3 cursor-pointer"
                    />
                  ) : (
                    <span className="text-muted-foreground/40">--</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Truncation link */}
      {isTruncated && (
        <button
          type="button"
          className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground mt-1"
          onClick={() => setShowAll(true)}
        >
          Show all {mergedSubjects.length} subjects
        </button>
      )}

      {hasSmallN && mergedSubjects.filter((s) => s.isLoo).length >= 3 && (
        <p className="text-[9px] text-muted-foreground/60 mt-1 italic">
          At small group sizes (N&lt;=5), LOO sensitivity is expected to be high for all animals.
        </p>
      )}

      {/* Section B: Impact Preview Table -- per dose group (unchanged from Phase 1) */}
      {excludedIds.size > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            {preview?.groups?.length === 1 && preview.groups[0].day != null
              ? `Impact preview on D${preview.groups[0].day}`
              : "Impact preview"}
          </div>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b text-[10px] text-muted-foreground">
                <th className="py-0.5 text-left font-medium"></th>
                <th className="py-0.5 text-right font-medium">Before</th>
                <th className="py-0.5 text-right font-medium">After</th>
                <th className="py-0.5 text-right font-medium">Delta</th>
              </tr>
            </thead>
            <tbody>
              {preview?.groups?.length ? (
                <>
                  {preview.groups.map((grp) => (
                    <ImpactGroupRows
                      key={grp.dose_level}
                      grp={grp}
                      doseLabel={getDoseLabel(grp.dose_level, doseGroups)}
                      showGroupHeader={preview.groups.length > 1}
                      fmt={fmt}
                      fmtDelta={fmtDelta}
                    />
                  ))}
                  <tr className="border-b border-border/30">
                    <td className="py-0.5 text-muted-foreground/40 italic">Trend p</td>
                    <td className="py-0.5" colSpan={3}>
                      <span className="text-muted-foreground/40 italic text-[10px]">updates on apply</span>
                    </td>
                  </tr>
                  <tr className="border-b border-border/30">
                    <td className="py-0.5 text-muted-foreground/40 italic">NOAEL</td>
                    <td className="py-0.5" colSpan={3}>
                      <span className="text-muted-foreground/40 italic text-[10px]">updates on apply</span>
                    </td>
                  </tr>
                </>
              ) : (
                <tr className="border-b border-border/30">
                  <td className="py-0.5 text-muted-foreground/40 italic" colSpan={4}>
                    {!preview && !previewError
                      ? "Computing..."
                      : "Preview unavailable -- apply exclusion to see full reanalysis"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {hasAntiConservativeWarning && (
            <p className="text-[9px] text-amber-600 mt-1">
              Excluding this control animal increases the apparent treatment effect.
              Control exclusion is anti-conservative -- review the biological justification.
            </p>
          )}
          {excessiveWarning && (
            <p className="text-[9px] text-amber-600 mt-1">{excessiveWarning}</p>
          )}
        </div>
      )}

      {/* Section C: Apply Button + read-only cross-endpoint disclosure */}
      {pendingCount > 0 && (
        <div className="mt-3 flex flex-col items-end gap-1">
          <button
            className="px-3 py-1 text-[11px] font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleApply}
            disabled={isApplying}
          >
            {isApplying
              ? "Applying..."
              : `Apply ${pendingCount} pending exclusion${pendingCount > 1 ? "s" : ""}`}
          </button>
          {otherEndpointExclusions.length > 0 && (
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => setDisclosureOpen((v) => !v)}
            >
              <span>{disclosureOpen ? "\u25BE" : "\u25B8"}</span>
              <span>
                {otherEndpointExclusions.reduce((n, e) => n + e.subjects.length, 0)} other pending on{" "}
                {otherEndpointExclusions.length} endpoint
                {otherEndpointExclusions.length > 1 ? "s" : ""}
              </span>
            </button>
          )}
          {disclosureOpen && otherEndpointExclusions.length > 0 && (
            <div className="w-full mt-1 text-[10px] border border-border/30 rounded p-1.5 bg-muted/5">
              {otherEndpointExclusions.map((ep) => (
                <div key={ep.endpointLabel} className="mb-1.5 last:mb-0">
                  <div className="font-medium text-muted-foreground">{ep.endpointLabel}</div>
                  <ul className="pl-2">
                    {ep.subjects.map((s) => (
                      <li key={s.usubjid} className="flex items-center gap-1.5 py-0.5">
                        {s.doseLevel >= 0 && (
                          <div
                            className="w-[3px] h-3 rounded-sm shrink-0"
                            style={{ backgroundColor: getDoseGroupColor(s.doseLevel) }}
                          />
                        )}
                        <span className="font-mono text-[10px]">{shortId(s.usubjid)}</span>
                        {s.sex && (
                          <span className="text-muted-foreground/60 text-[9px]">{s.sex}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
