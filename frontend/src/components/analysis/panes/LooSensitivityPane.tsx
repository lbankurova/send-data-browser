/**
 * LOO Sensitivity Info Pane -- context panel component.
 *
 * Shows: (A) influential subjects table with cross-day aggregation (Days/Worst columns),
 *        (B) before/after impact preview,
 *        (C) apply button with honest global label + read-only cross-endpoint disclosure.
 *
 * Renders only when the selected finding has LOO-fragile subjects (ratio < LOO_THRESHOLD).
 * See docs/_internal/architecture/loo-display-scoping.md for field semantics and scoping
 * decisions — in particular why this pane iterates `loo_per_subject` directly instead of
 * going through `useInfluentialSubjectsMap`.
 */
import { useMemo, useCallback, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import { useAnimalExclusion } from "@/contexts/AnimalExclusionContext";
import { useExclusionPreview } from "@/hooks/useExclusionPreview";
import { getDoseGroupColor } from "@/lib/severity-colors";
import { shortId } from "@/lib/chart-utils";
import { LOO_THRESHOLD } from "@/lib/loo-constants";

interface LooSensitivityPaneProps {
  finding: UnifiedFinding;
  allFindings: UnifiedFinding[];
  doseGroups?: DoseGroup[];
}

interface InfluentialSubject {
  usubjid: string;
  doseLevel: number;
  sex: string;
  /** Days where this subject had ratio < LOO_THRESHOLD, sorted ascending, deduplicated. */
  days: number[];
  /** Min ratio across all contributing days (always defined — subject enters list only after one hit). */
  worstRatio: number;
}

interface OtherEndpointExclusion {
  endpointLabel: string;
  subjects: Array<{ usubjid: string; sex: string; doseLevel: number }>;
}

export function LooSensitivityPane({ finding, allFindings, doseGroups }: LooSensitivityPaneProps) {
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

  // ==========================================================================
  // Hooks — ALL declared before the early return (Rules of Hooks compliance).
  // ==========================================================================

  // Aggregate fragile subjects across all findings for this endpoint (cross-day).
  // Source unchanged: direct iteration over `loo_per_subject`. Shape extended:
  // one row per UNIQUE subject with days[] and worstRatio.
  const influentialSubjects = useMemo<InfluentialSubject[]>(() => {
    const subjectsByUsubjid = new Map<string, InfluentialSubject>();

    for (const f of allFindings) {
      const ep = f.endpoint_label ?? f.finding;
      if (ep !== endpointLabel || f.domain !== finding.domain) continue;
      if (f.day == null) continue; // defensive — per-day LOO requires a day

      const perSubject = f.loo_per_subject;
      if (!perSubject) continue;

      for (const [usubjid, entry] of Object.entries(perSubject)) {
        if (entry.ratio >= LOO_THRESHOLD) continue; // fragility filter

        const existing = subjectsByUsubjid.get(usubjid);
        if (existing) {
          if (!existing.days.includes(f.day)) existing.days.push(f.day);
          if (entry.ratio < existing.worstRatio) existing.worstRatio = entry.ratio;
        } else {
          subjectsByUsubjid.set(usubjid, {
            usubjid,
            doseLevel: entry.dose_level,
            sex: f.sex ?? "",
            days: [f.day],
            worstRatio: entry.ratio,
          });
        }
      }
    }

    // Sort each subject's days ascending for display.
    for (const s of subjectsByUsubjid.values()) s.days.sort((a, b) => a - b);

    // Row order: doseLevel asc -> days.length desc -> worstRatio asc.
    return [...subjectsByUsubjid.values()].sort(
      (a, b) =>
        a.doseLevel - b.doseLevel ||
        b.days.length - a.days.length ||
        a.worstRatio - b.worstRatio,
    );
  }, [allFindings, endpointLabel, finding.domain]);

  // Pending exclusions for THIS endpoint only (existing behavior)
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

  // Impact preview: backend-computed across all timepoints
  const { data: preview } = useExclusionPreview(studyId, endpointLabel, finding.domain, excludedIds);

  // Anti-conservative control exclusion warning
  const hasAntiConservativeWarning = useMemo(() => {
    if (!preview?.before || !preview?.after) return false;
    const anyControlExcluded = influentialSubjects.some(
      s => s.doseLevel === 0 && excludedIds.has(s.usubjid),
    );
    return anyControlExcluded && preview.after.g != null && preview.after.g > preview.before.g;
  }, [preview, influentialSubjects, excludedIds]);

  // Excessive exclusion check
  const excessiveWarning = useMemo(() => {
    if (excludedIds.size === 0 || !doseGroups) return null;
    for (const dg of doseGroups) {
      if (dg.n_total === 0) continue;
      const excluded = influentialSubjects.filter(
        s => s.doseLevel === dg.dose_level && excludedIds.has(s.usubjid),
      ).length;
      if (excluded > 0 && excluded / dg.n_total > 0.2) {
        return `More than ${excluded} of ${dg.n_total} animals excluded from ${dg.label}. Consider study-level exclusion.`;
      }
    }
    return null;
  }, [excludedIds, doseGroups, influentialSubjects]);

  // Cross-endpoint pending exclusions (disclosure data) — NEW in Feature 5.
  // Surfaces the fact that Apply commits globally, even though the pane is per-endpoint.
  // See architecture/loo-display-scoping.md "Apply button mislocation" for deferred rationale.
  const otherEndpointExclusions = useMemo<OtherEndpointExclusion[]>(() => {
    const out: OtherEndpointExclusion[] = [];
    for (const [otherEp, ids] of pendingExclusions) {
      if (otherEp === endpointLabel) continue;
      if (ids.size === 0) continue;
      const subjects: Array<{ usubjid: string; sex: string; doseLevel: number }> = [];
      for (const usubjid of ids) {
        // Metadata lookup from the FULL findings list (allFindings is unfiltered — see
        // FindingsContextPanel.tsx:2461 where it is passed as findingsData?.findings ?? []).
        // Fall back to bare usubjid for the edge case where a subject no longer appears
        // in any finding (e.g., post-regeneration cleanup).
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

  // Disclosure open/closed state
  const [disclosureOpen, setDisclosureOpen] = useState(false);

  // Non-rodent small-N check (pure derivation, but kept above early return with the rest)
  const hasSmallN = doseGroups?.some(dg => dg.n_total > 0 && dg.n_total <= 5) ?? false;

  // ==========================================================================
  // Early return AFTER all hooks.
  // ==========================================================================
  if (influentialSubjects.length === 0) return null;

  const fmt = (v: number | null, dp: number = 2) => v != null ? v.toFixed(dp) : "--";
  const fmtDelta = (before: number | null, after: number | null, dp: number = 2) => {
    if (before == null || after == null) return "";
    const d = after - before;
    return (d >= 0 ? "+" : "") + d.toFixed(dp);
  };

  return (
    <div>
      {/* Section A: Influential Subjects Table */}
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b text-[10px] text-muted-foreground">
            <th className="py-0.5 text-left font-medium">Subject</th>
            <th className="py-0.5 text-left font-medium">Type</th>
            <th className="py-0.5 text-left font-medium cursor-help" title="Timepoints where this subject is influential. If only early days appear, the effect is stable at later timepoints.">Days</th>
            <th className="py-0.5 text-right font-medium cursor-help" title="Lowest % of effect size (|g|) retained after removing this subject, across all timepoints">Retained effect</th>
            <th className="py-0.5 text-center font-medium w-8">Excl</th>
          </tr>
        </thead>
        <tbody>
          {influentialSubjects.map((s) => {
            const color = getDoseGroupColor(s.doseLevel);
            const checked = isExcluded(endpointLabel, s.usubjid);
            const dayLabels = s.days.map((d) => `D${d}`);
            const daysDisplay =
              s.days.length <= 3
                ? dayLabels.join(" ")
                : `${dayLabels[0]} ${dayLabels[1]} +${s.days.length - 2}`;
            const daysTitle = s.days.length > 3 ? dayLabels.join(", ") : undefined;
            return (
              <tr key={s.usubjid} className="border-b border-border/30">
                <td className="py-0.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-[3px] h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                    <span className="font-mono text-[10px]">{shortId(s.usubjid)}</span>
                    <span className="text-muted-foreground text-[9px]">{s.sex}</span>
                  </div>
                </td>
                <td className="py-0.5 text-left">
                  <span
                    className="text-[10px] text-muted-foreground cursor-help"
                    title="Subjects whose removal changes effect size by >20%"
                  >
                    LOO sig.
                  </span>
                </td>
                <td className="py-0.5 text-left">
                  <span className="text-[10px] text-muted-foreground" title={daysTitle}>
                    {daysDisplay}
                  </span>
                </td>
                <td className="py-0.5 text-right font-mono">
                  <span className={s.worstRatio < 0.5 ? "text-foreground font-medium" : "text-muted-foreground"}>
                    {(s.worstRatio * 100).toFixed(0)}%
                  </span>
                </td>
                <td className="py-0.5 text-center">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggle(s.usubjid)}
                    className="w-3 h-3 cursor-pointer"
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {hasSmallN && influentialSubjects.length >= 3 && (
        <p className="text-[9px] text-muted-foreground/60 mt-1 italic">
          At small group sizes (N&lt;=5), LOO sensitivity is expected to be high for all animals.
        </p>
      )}

      {/* Section B: Impact Preview Table */}
      {excludedIds.size > 0 && (
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
            Impact preview{preview?.day != null ? ` on D${preview.day}` : ""}
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
              {preview?.before && preview.after ? (
                <>
                  <tr className="border-b border-border/30">
                    <td className="py-0.5 text-muted-foreground">|g|</td>
                    <td className="py-0.5 text-right font-mono">{fmt(preview.before.g)}</td>
                    <td className="py-0.5 text-right font-mono">{fmt(preview.after.g)}</td>
                    <td className="py-0.5 text-right font-mono text-muted-foreground">{fmtDelta(preview.before.g, preview.after.g)}</td>
                  </tr>
                  <tr className="border-b border-border/30">
                    <td className="py-0.5 text-muted-foreground">gLower</td>
                    <td className="py-0.5 text-right font-mono">{fmt(preview.before.g_lower)}</td>
                    <td className="py-0.5 text-right font-mono">{fmt(preview.after.g_lower)}</td>
                    <td className="py-0.5 text-right font-mono text-muted-foreground">{fmtDelta(preview.before.g_lower, preview.after.g_lower)}</td>
                  </tr>
                  <tr className="border-b border-border/30">
                    <td className="py-0.5 text-muted-foreground">N (ctrl / treated)</td>
                    <td className="py-0.5 text-right font-mono">{preview.before.n_ctrl}/{preview.before.n_treated}</td>
                    <td className="py-0.5 text-right font-mono">{preview.after.n_ctrl}/{preview.after.n_treated}</td>
                    <td className="py-0.5"></td>
                  </tr>
                </>
              ) : (
                <tr className="border-b border-border/30">
                  <td className="py-0.5 text-muted-foreground/40 italic" colSpan={4}>
                    Computing...
                  </td>
                </tr>
              )}
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
