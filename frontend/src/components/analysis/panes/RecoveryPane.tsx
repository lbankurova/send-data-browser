/**
 * Recovery insights pane for FindingsContextPanel.
 * Shows recovery verdict, classification, finding nature,
 * and comparison stats for the selected finding.
 *
 * MI/MA: Full per-dose assessment blocks with incidence/severity
 * comparisons, guard explanations, and subject details (ported from
 * HistopathologyContextPanel's robust pipeline).
 *
 * CL: Per-dose group data from backend incidence_rows.
 *
 * Continuous: Per-dose verdict summary with effect size comparison.
 *
 * Charts (RecoveryDumbbellChart, IncidenceRecoveryChart) live in the
 * center panel (DoseResponseChartPanel) — this pane shows the
 * non-chart assessment content.
 */
import { useParams } from "react-router-dom";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
import { useHistopathSubjects } from "@/hooks/useHistopathSubjects";
import { useStudyContext } from "@/hooks/useStudyContext";
import type { DoseGroup, UnifiedFinding } from "@/types/analysis";
import { useStatMethods } from "@/hooks/useStatMethods";
import { getEffectSizeLabel, getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import {
  assessRecoveryAdequacy,
  deriveRecoveryAssessmentsSexAware,
  MIN_RECOVERY_N,
  verdictArrow,
  formatRecoveryFraction,
  verdictLabel,
} from "@/lib/recovery-assessment";
import type { RecoveryAssessment, RecoveryDoseAssessment } from "@/lib/recovery-assessment";
import { classifyFindingNature } from "@/lib/finding-nature";
import { classifyContinuousRecovery } from "@/lib/recovery-verdict";
import { getVerdictLabel } from "@/lib/recovery-labels";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

// ── Per-dose assessment block (ported from HistopathologyContextPanel) ──

const SUBJECT_COLLAPSE_THRESHOLD = 4;

function RecoveryDoseBlock({
  assessment: a,
  recoveryDays,
}: {
  assessment: RecoveryDoseAssessment;
  recoveryDays?: number | null;
}) {
  const [expanded, setExpanded] = useState(false);

  // Reset collapsed state on finding change (new subject set)
  const subjectIds = a.recovery.subjectDetails.map((s) => s.id).join(",");
  useEffect(() => {
    setExpanded(false);
  }, [subjectIds]);

  const shortId = (id: string) => {
    const parts = id.split("-");
    return parts[parts.length - 1] || id.slice(-4);
  };

  const periodLabel = recoveryDays != null
    ? recoveryDays >= 7
      ? `${Math.round(recoveryDays / 7)} week${Math.round(recoveryDays / 7) !== 1 ? "s" : ""} recovery`
      : `${recoveryDays} day${recoveryDays !== 1 ? "s" : ""} recovery`
    : null;

  // Inline delta computation (suppress for guard verdicts)
  const showDeltas = a.verdict !== "anomaly" && a.verdict !== "insufficient_n"
    && a.verdict !== "not_examined" && a.verdict !== "low_power";
  const incDelta = showDeltas && a.main.incidence > 0
    ? Math.round(((a.recovery.incidence - a.main.incidence) / a.main.incidence) * 100)
    : null;
  const sevDelta = showDeltas && a.main.avgSeverity > 0
    ? Math.round(((a.recovery.avgSeverity - a.main.avgSeverity) / a.main.avgSeverity) * 100)
    : null;

  // Collapsible subject list
  const subjects = a.recovery.subjectDetails;
  const visible = expanded ? subjects : subjects.slice(0, SUBJECT_COLLAPSE_THRESHOLD);
  const hiddenCount = subjects.length - SUBJECT_COLLAPSE_THRESHOLD;

  return (
    <div>
      {/* Dose label */}
      <div className="mb-1 pt-0.5">
        <span className="text-xs font-medium text-foreground">{a.doseGroupLabel}</span>
        {periodLabel && (
          <>
            <span className="mx-1 text-muted-foreground/30">{"\u00b7"}</span>
            <span className="text-[11px] text-muted-foreground">{periodLabel}</span>
          </>
        )}
      </div>

      {/* Guard verdicts: not_examined, insufficient_n, low_power */}
      {a.verdict === "not_examined" ? (
        <div className="mt-1.5">
          <div className="text-[11px] font-medium text-foreground/70">
            {"\u2205"} Tissue not examined in recovery arm.
          </div>
          <div className="text-[11px] text-muted-foreground italic">
            None of the {a.recovery.n} recovery subject{a.recovery.n !== 1 ? "s" : ""} had this tissue evaluated. No reversibility assessment is possible.
          </div>
        </div>
      ) : a.verdict === "insufficient_n" ? (
        <div className="mt-1.5">
          <div className="text-[11px] font-medium text-foreground/70">
            {"\u2020"} Insufficient sample: only {a.recovery.examined} recovery subject{a.recovery.examined !== 1 ? "s" : ""} examined.
          </div>
          <div className="text-[11px] text-muted-foreground italic">
            Ratios with fewer than {MIN_RECOVERY_N} examined subjects are unreliable.
          </div>
        </div>
      ) : a.verdict === "low_power" ? (
        <div className="mt-1.5">
          <div className="text-[11px] font-medium text-foreground/70">
            ~ Low statistical power.
          </div>
          <div className="text-[11px] text-muted-foreground italic">
            Main-arm incidence ({Math.round(a.main.incidence * 100)}%) too low to assess reversibility with {a.recovery.examined} examined recovery subject{a.recovery.examined !== 1 ? "s" : ""}. Expected {"\u2248"}{(a.main.incidence * a.recovery.examined).toFixed(1)} affected; {a.recovery.affected} observed is not informative.
          </div>
        </div>
      ) : (
        <>
          {/* Incidence + severity comparison lines */}
          <div className="space-y-1 text-[11px]">
            {/* Incidence line: main → recovery with delta */}
            <div className="flex items-center flex-wrap gap-x-1">
              <span className="text-muted-foreground shrink-0">Incidence</span>
              <span className="font-mono text-muted-foreground">
                {formatRecoveryFraction(a.main.affected, a.main.examined, a.main.n)}
              </span>
              <div
                className="inline-block h-1.5 rounded-full bg-gray-400"
                style={{ width: `${Math.min(a.main.incidence * 48, 48)}px` }}
              />
              <span className="text-muted-foreground/40">{"\u2192"}</span>
              <span className="font-mono text-foreground">
                {formatRecoveryFraction(a.recovery.affected, a.recovery.examined, a.recovery.n)}
              </span>
              <div
                className="inline-block h-1.5 rounded-full bg-gray-400/50"
                style={{ width: `${Math.min(a.recovery.incidence * 48, 48)}px` }}
              />
              {incDelta != null && (
                <span className={cn(
                  "ml-1 font-mono",
                  incDelta > 0 ? "font-medium text-foreground/70" :
                  incDelta < 0 ? "text-muted-foreground" :
                  "text-muted-foreground/50",
                )}>
                  {verdictArrow(a.verdict)} {incDelta > 0 ? "+" : ""}{incDelta}%
                </span>
              )}
            </div>

            {/* Severity line: main → recovery with delta */}
            <div className="flex items-center flex-wrap gap-x-1">
              <span className="text-muted-foreground shrink-0">Severity</span>
              <span className="font-mono text-muted-foreground">
                avg {a.main.avgSeverity.toFixed(1)}
              </span>
              <span className="text-muted-foreground/40">{"\u2192"}</span>
              <span className="font-mono text-foreground">
                avg {a.recovery.avgSeverity.toFixed(1)}
              </span>
              {sevDelta != null && (
                <span className={cn(
                  "ml-1 font-mono",
                  sevDelta > 0 ? "font-medium text-foreground/70" :
                  sevDelta < 0 ? "text-muted-foreground" :
                  "text-muted-foreground/50",
                )}>
                  {verdictArrow(a.verdict)} {sevDelta > 0 ? "+" : ""}{sevDelta}%
                </span>
              )}
            </div>
          </div>

          {/* Assessment */}
          <div className="mt-1.5 text-[11px]">
            <span className="text-muted-foreground">Assessment: </span>
            <span className="font-medium">{verdictLabel(a.verdict)}</span>
          </div>

          {/* Anomaly explanation */}
          {a.verdict === "anomaly" && (
            <div className="mt-1.5">
              <div className="text-[11px] font-medium text-foreground/70">
                {"\u26A0"} Anomaly: recovery incidence {Math.round(a.recovery.incidence * 100)}% at a dose level where main arm had 0%.
              </div>
              <div className="text-[11px] text-muted-foreground italic">
                This may indicate delayed onset or a data quality issue. Requires pathologist assessment.
              </div>
            </div>
          )}

          {/* Recovery subjects with severity trajectories */}
          <div className="mt-1 text-[11px] text-muted-foreground">
            {subjects.length > 0 ? (
              <>
                Recovery subjects:{" "}
                {visible.map((s, i) => {
                  const mainPart = s.mainArmSeverity !== null
                    ? `${s.mainArmSeverity}`
                    : s.mainArmAvgSeverity > 0
                      ? `avg ${s.mainArmAvgSeverity.toFixed(1)}`
                      : "\u2014";
                  const unexpected = s.mainArmSeverity !== null
                    ? s.severity >= s.mainArmSeverity
                    : s.mainArmAvgSeverity > 0
                      ? s.severity >= s.mainArmAvgSeverity
                      : false;

                  return (
                    <span key={s.id}>
                      {i > 0 && ", "}
                      <span className="text-primary/70">
                        {shortId(s.id)}
                      </span>
                      <span className={cn("font-mono", unexpected ? "font-medium" : "text-muted-foreground")}>
                        {" "}({mainPart}
                        <span className="text-muted-foreground/40"> {"\u2192"} </span>
                        {s.severity})
                      </span>
                    </span>
                  );
                })}
                {/* Collapse toggle */}
                {hiddenCount > 0 && (
                  <>
                    {" "}
                    <button
                      className="text-[11px] text-primary hover:underline"
                      onClick={() => setExpanded((p) => !p)}
                    >
                      {expanded ? "Show fewer" : `+${hiddenCount} more`}
                    </button>
                  </>
                )}
              </>
            ) : (
              <>none affected (0/{a.recovery.examined} examined{a.recovery.examined < a.recovery.n ? ` of ${a.recovery.n}` : ""})</>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Per-finding recovery content: renders per-dose blocks with verdict-tiered containers. */
function RecoveryPaneContent({
  assessment,
  recoveryDays,
}: {
  assessment: RecoveryAssessment;
  recoveryDays?: number | null;
}) {
  const visible = assessment.assessments.filter(
    (a) => a.verdict !== "not_observed" && a.verdict !== "no_data",
  );

  if (visible.length === 0) return null;

  return (
    <div>
      {visible.map((a, i) => (
        <Fragment key={a.doseLevel}>
          {i > 0 && <div className="border-t border-border/40 my-2" />}
          {/* Container treatment per verdict tier */}
          {a.verdict === "not_examined" ? (
            <div className="rounded border border-red-300/20 bg-red-50/10 px-2 py-1.5 dark:border-red-500/15 dark:bg-red-900/5">
              <RecoveryDoseBlock assessment={a} recoveryDays={recoveryDays} />
            </div>
          ) : a.verdict === "anomaly" ? (
            <div className="rounded border border-amber-300/30 bg-amber-50/20 px-2 py-1.5 dark:border-amber-500/20 dark:bg-amber-900/10">
              <RecoveryDoseBlock assessment={a} recoveryDays={recoveryDays} />
            </div>
          ) : a.verdict === "insufficient_n" || a.verdict === "low_power" ? (
            <div className="rounded border border-border/30 bg-muted/10 px-2 py-1.5">
              <RecoveryDoseBlock assessment={a} recoveryDays={recoveryDays} />
            </div>
          ) : (
            <RecoveryDoseBlock assessment={a} recoveryDays={recoveryDays} />
          )}
        </Fragment>
      ))}
    </div>
  );
}

// ── MI/MA incidence recovery (robust histopath pipeline) ──

function HistopathRecoverySection({
  finding,
}: {
  finding: UnifiedFinding;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: recovery } = useRecoveryComparison(studyId);
  const { data: studyCtx } = useStudyContext(studyId);
  const specimen = finding.specimen ?? "";
  const { data: subjData } = useHistopathSubjects(studyId, specimen);

  // Derive sex-aware recovery assessment for this finding
  const findingRecovery = useMemo((): RecoveryAssessment | null => {
    if (!subjData?.subjects) return null;
    const hasRecoverySubjects = subjData.subjects.some((s) => s.is_recovery);
    if (!hasRecoverySubjects) return null;
    const assessments = deriveRecoveryAssessmentsSexAware(
      [finding.finding],
      subjData.subjects,
      undefined,
      subjData.recovery_days,
      specimen,
      studyCtx?.species ?? null,
    );
    return assessments[0] ?? null;
  }, [subjData, finding.finding, specimen, studyCtx]);

  // Recovery adequacy assessment
  const adequacy = useMemo(() => {
    if (recovery?.recovery_day == null || recovery?.last_dosing_day == null) return null;
    const recoveryDays = recovery.recovery_day - recovery.last_dosing_day;
    const nature = classifyFindingNature(finding.finding, null, finding.specimen ?? null);
    return assessRecoveryAdequacy(recoveryDays, nature);
  }, [recovery?.recovery_day, recovery?.last_dosing_day, finding.finding, finding.specimen]);

  if (!findingRecovery) {
    return (
      <div className="text-xs text-muted-foreground">
        No recovery data for this finding.
      </div>
    );
  }

  const hasVisibleDoses = findingRecovery.assessments.some(
    (a) => a.verdict !== "not_observed" && a.verdict !== "no_data",
  );

  if (!hasVisibleDoses) {
    return (
      <div className="text-xs text-muted-foreground">
        Finding not observed in treated dose groups.
      </div>
    );
  }


  return (
    <div className="space-y-2">
      {/* Recovery adequacy annotation */}
      {adequacy && !adequacy.adequate && (
        <div className="text-[9px] text-amber-700" title={`Expected ${adequacy.expectedWeeks} weeks for ${adequacy.findingNature ?? "this finding type"}; study provided ${adequacy.actualWeeks.toFixed(1)} weeks`}>
          Recovery period may be inadequate for {adequacy.findingNature ?? "this finding type"} ({adequacy.actualWeeks.toFixed(0)}w of ~{adequacy.expectedWeeks}w expected)
        </div>
      )}

      {/* Per-dose assessment blocks */}
      <RecoveryPaneContent
        assessment={findingRecovery}
        recoveryDays={subjData?.recovery_days}
      />

    </div>
  );
}

// ── CL incidence recovery (backend pipeline) ─────────────

function CLRecoverySection({ finding }: { finding: UnifiedFinding }) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: recovery } = useRecoveryComparison(studyId);

  if (!recovery || !recovery.available) {
    return (
      <div className="text-xs text-muted-foreground">
        No recovery arm in this study.
      </div>
    );
  }

  const incRows = recovery.incidence_rows ?? [];
  const findingUpper = finding.finding.toUpperCase();
  const findingSex = finding.sex === "F" || finding.sex === "M" ? finding.sex : null;
  const matched = incRows.filter(
    (r) => r.finding === findingUpper && r.domain === finding.domain
      && (findingSex == null || r.sex === findingSex),
  );

  if (matched.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No recovery data for this endpoint.
      </div>
    );
  }

  // Group by dose_level for structured display
  const doseMap = new Map<number, typeof matched>();
  for (const r of matched) {
    if (r.dose_level === 0) continue; // skip control
    const arr = doseMap.get(r.dose_level) ?? [];
    arr.push(r);
    doseMap.set(r.dose_level, arr);
  }

  return (
    <div className="space-y-2">
      {/* Per-dose group rows */}
      {[...doseMap.entries()].sort(([a], [b]) => a - b).map(([doseLevel, rows]) => {
        const rep = rows[0];
        return (
          <div key={doseLevel}>
            <div className="mb-0.5">
              <span className="text-xs font-medium text-foreground">
                {rep.dose_label ?? `Dose ${doseLevel}`}
              </span>
            </div>
            {rows.sort((a, b) => a.sex.localeCompare(b.sex)).map((r) => (
              <div key={`${r.dose_level}_${r.sex}`} className="flex items-center flex-wrap gap-x-1 text-[11px]">
                <span className="text-muted-foreground w-3">{r.sex}</span>
                <span className="font-mono text-muted-foreground">
                  {r.main_affected}/{r.main_examined ?? r.main_n}
                </span>
                <span className="text-muted-foreground/40">{"\u2192"}</span>
                <span className="font-mono text-foreground">
                  {r.recovery_affected}/{r.recovery_examined ?? r.recovery_n}
                </span>
                {r.verdict && (
                  <span className={cn(
                    "ml-1 text-[10px]",
                    r.verdict === "reversed" ? "text-emerald-700" :
                    r.verdict === "partially_reversed" ? "text-emerald-600" :
                    r.verdict === "progressing" ? "text-red-700" :
                    r.verdict === "anomaly" ? "text-red-700" :
                    "text-muted-foreground",
                  )}>
                    {getVerdictLabel(r.verdict)}
                  </span>
                )}
                {r.confidence === "low" && (
                  <span className="text-[9px] text-muted-foreground/50">(low N)</span>
                )}
              </div>
            ))}
          </div>
        );
      })}

    </div>
  );
}

// ── Continuous recovery section ──────────────────────────

function ContinuousRecoverySection({
  finding,
  doseGroups,
}: {
  finding: UnifiedFinding;
  doseGroups?: DoseGroup[];
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: recovery } = useRecoveryComparison(studyId);
  const { effectSize } = useStatMethods(studyId);

  if (!recovery || !recovery.available) {
    return (
      <div className="text-xs text-muted-foreground">
        No recovery arm in this study.
      </div>
    );
  }

  // Get rows for this endpoint (both sexes), filtered to the MAX recovery day
  // per dose/sex.
  const allRows = (() => {
    const matched = recovery.rows.filter((r) => {
      if (finding.specimen) {
        return r.test_code.toUpperCase() === finding.specimen.toUpperCase();
      }
      return r.test_code.toUpperCase() === finding.test_code.toUpperCase();
    });
    // Keep only the max-day row per dose_level × sex (backward compat)
    const best = new Map<string, typeof matched[number]>();
    for (const r of matched) {
      const key = `${r.sex}_${r.dose_level}`;
      const prev = best.get(key);
      if (!prev || (r.day ?? 0) > (prev.day ?? 0)) best.set(key, r);
    }
    return [...best.values()];
  })();

  if (allRows.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No recovery data for this endpoint.
      </div>
    );
  }

  // Compute per-row verdicts
  const classified = allRows
    .filter((row) => row.dose_level !== 0)
    .map((row) => {
      const tG = row.terminal_effect_same_arm ?? row.terminal_effect;
      const v = classifyContinuousRecovery(tG, row.effect_size, row.treated_n, row.control_n);
      return { row, terminalG: tG ?? null, recoveryG: row.effect_size ?? null, pctRecovered: v.pctRecovered, verdict: v.verdict };
    });

  // Group by dose_level for structured display
  const doseMap = new Map<number, typeof classified>();
  for (const c of classified) {
    const arr = doseMap.get(c.row.dose_level) ?? [];
    arr.push(c);
    doseMap.set(c.row.dose_level, arr);
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground flex items-center justify-between">
        <span>
          {allRows[0]?.terminal_day != null && <>Day {allRows[0].terminal_day} (terminal) → </>}
          {recovery.recovery_day != null && <>Day {recovery.recovery_day} (recovery)</>}
          {" · "}Effect size: {getEffectSizeLabel(effectSize)} ({getEffectSizeSymbol(effectSize)})
        </span>
        <span title={"Charts in center panel. Filled dot = terminal effect, tick = recovery effect. Thick line = p<0.05."}>
          <Info className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-help" />
        </span>
      </div>

      {/* Per-dose verdict summary */}
      {doseMap.size > 0 && (
        <div className="space-y-1">
          {[...doseMap.entries()].sort(([a], [b]) => a - b).map(([doseLevel, rows]) => (
            <div key={doseLevel}>
              {rows.sort((a, b) => a.row.sex.localeCompare(b.row.sex)).map((c) => (
                <div key={`${c.row.dose_level}_${c.row.sex}`} className="flex items-center flex-wrap gap-x-1 text-[11px]">
                  <span className="text-muted-foreground w-3">{c.row.sex}</span>
                  <span className="text-xs font-medium text-foreground">
                    {(() => {
                      const dg = doseGroups?.find((g) => g.dose_level === doseLevel);
                      return dg && dg.dose_value != null && dg.dose_value > 0
                        ? `${dg.dose_value} ${dg.dose_unit ?? ""}`.trim()
                        : `Dose ${doseLevel}`;
                    })()}
                  </span>
                  {c.terminalG != null && (
                    <span className="font-mono text-muted-foreground">
                      {getEffectSizeSymbol(effectSize)} {Math.abs(c.terminalG).toFixed(2)}
                    </span>
                  )}
                  <span className="text-muted-foreground/40">{"\u2192"}</span>
                  {c.recoveryG != null && (
                    <span className="font-mono text-foreground">
                      {Math.abs(c.recoveryG).toFixed(2)}
                    </span>
                  )}
                  {c.pctRecovered != null && (
                    <span className="font-mono text-muted-foreground ml-1">
                      ({c.pctRecovered > 0 ? "+" : ""}{c.pctRecovered.toFixed(0)}%)
                    </span>
                  )}
                  <span className={cn(
                    "ml-1 text-[10px]",
                    c.verdict === "reversed" ? "text-emerald-700" :
                    c.verdict === "partially_reversed" ? "text-emerald-600" :
                    c.verdict === "progressing" ? "text-red-700" :
                    "text-muted-foreground",
                  )}>
                    {getVerdictLabel(c.verdict)}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// ── Main component ───────────────────────────────────────

interface RecoveryPaneProps {
  finding: UnifiedFinding;
  doseGroups?: DoseGroup[];
}

export function RecoveryPane({ finding, doseGroups }: RecoveryPaneProps) {
  // Continuous domains (LB, BW, OM, VS, FW, EG, etc.)
  if (finding.data_type === "continuous") {
    return <ContinuousRecoverySection finding={finding} doseGroups={doseGroups} />;
  }

  // MI/MA: Use the robust histopath pipeline with per-dose assessment blocks
  if (finding.data_type === "incidence" && (finding.domain === "MI" || finding.domain === "MA")) {
    return <HistopathRecoverySection finding={finding} />;
  }

  // CL and other incidence domains: backend pipeline with per-dose display
  if (finding.data_type === "incidence") {
    return <CLRecoverySection finding={finding} />;
  }

  return (
    <div className="text-[11px] text-muted-foreground">
      Recovery assessment not available for {finding.domain} domain.
    </div>
  );
}
