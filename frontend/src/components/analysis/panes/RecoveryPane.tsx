/**
 * Recovery insights pane for FindingsContextPanel.
 * Shows recovery verdict, classification, finding nature,
 * and comparison stats for the selected finding.
 *
 * Both sexes are shown side-by-side (F before M) when data exists.
 * Continuous domains use verdict-first rows; histopath uses incidence badges.
 */
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useOrganRecovery } from "@/hooks/useOrganRecovery";
import type { OrganRecoveryResult } from "@/hooks/useOrganRecovery";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
import type { RecoveryComparisonResponse } from "@/lib/temporal-api";
import { verdictLabel } from "@/lib/recovery-assessment";
import type { RecoveryVerdict } from "@/lib/recovery-assessment";
import { classifyFindingNature, reversibilityLabel } from "@/lib/finding-nature";
import type { FindingNatureInfo } from "@/lib/finding-nature";
import {
  classifyRecovery,
  CLASSIFICATION_LABELS,
  CLASSIFICATION_BORDER,
} from "@/lib/recovery-classification";
import type {
  RecoveryClassification,
  RecoveryContext,
} from "@/lib/recovery-classification";
import type { DoseGroup, UnifiedFinding } from "@/types/analysis";
import { DoseLabel } from "@/components/ui/DoseLabel";
import { formatDoseShortLabel } from "@/lib/severity-colors";
import { Skeleton } from "@/components/ui/skeleton";

// ── Histopath verdict badge ──────────────────────────────

const VERDICT_COLORS: Partial<Record<RecoveryVerdict, string>> = {
  reversed: "text-emerald-700 bg-emerald-50",
  reversing: "text-emerald-600 bg-emerald-50/60",
  persistent: "text-amber-700 bg-amber-50",
  progressing: "text-red-700 bg-red-50",
  recovery_too_short: "text-blue-700 bg-blue-50",
};

function VerdictBadge({ verdict }: { verdict: RecoveryVerdict }) {
  const color = VERDICT_COLORS[verdict] ?? "text-muted-foreground bg-muted/50";
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      {verdictLabel(verdict)}
    </span>
  );
}

// ── Confidence badge ─────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: "High" | "Moderate" | "Low" }) {
  const color = confidence === "High"
    ? "text-emerald-700"
    : confidence === "Moderate"
      ? "text-amber-700"
      : "text-muted-foreground";
  return <span className={`text-[10px] font-medium ${color}`}>{confidence} confidence</span>;
}

// ── Continuous recovery verdict classification ───────────
//
// Uses terminal effect (end-of-dosing) as denominator, consistent
// with regulatory convention for repeat-dose recovery assessment.
// Peak effect surfaced as annotation when materially different.

type ContinuousVerdictType =
  | "resolved"
  | "reversed"
  | "overcorrected"
  | "reversing"
  | "partial"
  | "persistent"
  | "worsening"
  | "below-threshold";

interface ContinuousVerdictResult {
  verdict: ContinuousVerdictType;
  /** % of terminal effect that resolved. Negative = worsened. */
  pctRecovered: number | null;
}

function classifyContinuousRecovery(
  terminalG: number | null,
  recoveryG: number | null,
): ContinuousVerdictResult {
  // If dosing-phase effect was too small, recovery assessment is not meaningful
  if (terminalG == null || Math.abs(terminalG) < 0.5) {
    return { verdict: "below-threshold", pctRecovered: null };
  }
  if (recoveryG == null) {
    return { verdict: "below-threshold", pctRecovered: null };
  }

  // Resolved: recovery effect indistinguishable from control (§4.2)
  if (Math.abs(recoveryG) < 0.5) {
    return { verdict: "resolved", pctRecovered: 100 };
  }

  // Overcorrected: effect reversed direction past control (§4.3)
  if (Math.sign(terminalG) !== Math.sign(recoveryG) && Math.abs(recoveryG) >= 0.5) {
    return { verdict: "overcorrected", pctRecovered: null };
  }

  const pct = (Math.abs(terminalG) - Math.abs(recoveryG)) / Math.abs(terminalG) * 100;

  if (pct < 0) return { verdict: "worsening", pctRecovered: pct };
  if (pct >= 80) return { verdict: "reversed", pctRecovered: pct };
  if (pct >= 50) return { verdict: "reversing", pctRecovered: pct };
  if (pct >= 20) return { verdict: "partial", pctRecovered: pct };
  return { verdict: "persistent", pctRecovered: pct };
}

const CONT_VERDICT_LABEL: Record<ContinuousVerdictType, string> = {
  resolved: "Resolved",
  reversed: "Reversed",
  overcorrected: "Overcorrected",
  reversing: "Reversing",
  partial: "Partial",
  persistent: "Persistent",
  worsening: "Worsening",
  "below-threshold": "Not assessed",
};

const CONT_VERDICT_CLASS: Record<ContinuousVerdictType, string> = {
  resolved: "text-emerald-700",
  reversed: "text-emerald-700",
  overcorrected: "text-blue-700",
  reversing: "text-emerald-600",
  partial: "text-muted-foreground",
  persistent: "text-amber-700",
  worsening: "text-red-700",
  "below-threshold": "text-muted-foreground/60",
};

function formatGAbs(g: number): string {
  return Math.abs(g).toFixed(2);
}

function formatVerdictDesc(
  v: ContinuousVerdictResult,
  terminalG: number | null,
  recoveryG: number | null,
  terminalDay: number | null,
  recoveryDay: number | null,
): string {
  const tDay = terminalDay != null ? ` D${terminalDay}` : "";
  const rDay = recoveryDay != null ? ` D${recoveryDay}` : "";
  if (v.verdict === "below-threshold") {
    return terminalG != null ? `terminal |g|\u2009=\u2009${formatGAbs(terminalG)}${tDay}` : "";
  }
  const arrow = `${formatGAbs(terminalG!)}g${tDay} \u2192 ${formatGAbs(recoveryG!)}g${rDay}`;
  switch (v.verdict) {
    case "resolved":
      return `effect indistinguishable from control (${arrow})`;
    case "reversed":
      return `effect resolved (${arrow})`;
    case "overcorrected":
      return `effect reversed direction, now opposite of terminal (${arrow})`;
    case "reversing":
    case "partial":
      return `effect dropped ${Math.round(v.pctRecovered!)}% (${arrow})`;
    case "persistent":
      return `effect persists (${arrow})`;
    case "worsening": {
      const ratio = Math.abs(terminalG!) > 0.01
        ? (Math.abs(recoveryG!) / Math.abs(terminalG!)).toFixed(1)
        : null;
      return ratio ? `effect grew ${ratio}\u00d7 (${arrow})` : `effect grew (${arrow})`;
    }
  }
}

function formatPCompact(p: number): string {
  if (p < 0.001) return "<0.001";
  return p.toFixed(3);
}

// ── Hover tooltip builder (§6.4) ─────────────────────────

type RecoveryRow = RecoveryComparisonResponse["rows"][number];

function buildRowTooltip(
  row: RecoveryRow,
  doseStr: string,
  v: ContinuousVerdictResult,
  desc: string,
): string {
  const lines: string[] = [`${doseStr} \u00b7 ${row.sex} \u00b7 Recovery`];
  lines.push("");

  if (row.control_mean_terminal != null && row.control_mean != null) {
    const tDay = row.terminal_day != null ? ` (D${row.terminal_day})` : "";
    const rDay = ` (D${row.recovery_day})`;
    lines.push(`Terminal${tDay}     Recovery${rDay}`);
    lines.push(
      `Treated:  ${row.treated_mean_terminal?.toFixed(2) ?? "\u2014"}     Treated:  ${row.mean?.toFixed(2) ?? "\u2014"}`,
    );
    lines.push(
      `Control:  ${row.control_mean_terminal.toFixed(2)}     Control:  ${row.control_mean.toFixed(2)}`,
    );
    if (row.terminal_effect != null && row.effect_size != null) {
      lines.push(
        `g:        ${formatGAbs(row.terminal_effect)}     g:        ${formatGAbs(row.effect_size)}`,
      );
    }
  } else if (row.terminal_effect != null && row.effect_size != null) {
    const tDay = row.terminal_day != null ? `D${row.terminal_day}` : "terminal";
    const rDay = `D${row.recovery_day}`;
    lines.push(`g at ${tDay}: ${formatGAbs(row.terminal_effect)}`);
    lines.push(`g at ${rDay}: ${formatGAbs(row.effect_size)}`);
  }

  if (v.verdict !== "below-threshold") {
    lines.push("");
    lines.push(`Recovery: ${desc}`);
  }

  return lines.join("\n");
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

  if (!recovery || !recovery.available) {
    return (
      <div className="text-[10px] text-muted-foreground">
        No recovery comparison data available.
      </div>
    );
  }

  // Get ALL rows for this endpoint (both sexes).
  // For OM findings, match by specimen (organ) since OMTESTCD is always "WEIGHT".
  const allRows = recovery.rows.filter((r) => {
    if (finding.specimen) {
      return r.test_code.toUpperCase() === finding.specimen.toUpperCase();
    }
    return r.test_code.toUpperCase() === finding.test_code.toUpperCase();
  });

  if (allRows.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground">
        No recovery data for {finding.finding}.
      </div>
    );
  }

  // Group by sex (alphabetical: F before M)
  const sexes = [...new Set(allRows.map(r => r.sex))].sort();
  const showSexHeaders = sexes.length > 1;

  return (
    <div className="space-y-3">
      {recovery.recovery_day != null && (
        <div className="text-[10px] text-muted-foreground">
          {recovery.recovery_day}d post-dosing
        </div>
      )}

      {sexes.map(sex => {
        const sexRows = allRows
          .filter(r => r.sex === sex)
          .sort((a, b) => a.dose_level - b.dose_level);

        // Check for peak annotation: any row where |peak| > |terminal| * 1.5
        const peakAnnotations = sexRows
          .filter(r =>
            r.peak_effect != null && r.terminal_effect != null &&
            Math.abs(r.peak_effect) > Math.abs(r.terminal_effect) * 1.5 &&
            Math.abs(r.peak_effect) > 1.0 &&
            Math.abs(r.terminal_effect) >= 0.5,
          )
          .map(r => ({
            doseLevel: r.dose_level,
            peakG: r.peak_effect!,
            peakDay: r.peak_day,
            terminalG: r.terminal_effect!,
            terminalDay: r.terminal_day,
            recoveryG: r.effect_size,
            recoveryDay: r.recovery_day,
          }));

        return (
          <div key={sex}>
            {showSexHeaders && (
              <div className="text-[10px] font-semibold text-foreground mb-1">{sex}</div>
            )}

            <div className="space-y-0.5">
              {sexRows.map(row => {
                const dg = doseGroups?.find(g => g.dose_level === row.dose_level);
                const doseStr = dg && dg.dose_value != null && dg.dose_value > 0
                  ? `${dg.dose_value} ${dg.dose_unit ?? ""}`.trim()
                  : `Dose ${row.dose_level}`;

                {/* §10.5: n=1 suppression */}
                if (row.insufficient_n) {
                  return (
                    <div key={row.dose_level} className="text-[10px] leading-relaxed">
                      <span className="inline-flex items-baseline gap-1.5">
                        <DoseLabel level={row.dose_level} label={doseStr} className="text-[10px]" />
                        <span className="text-muted-foreground/60">
                          n={row.treated_n ?? 1} — insufficient for classification
                        </span>
                        {row.mean != null && (
                          <span className="text-muted-foreground/40 font-mono">
                            (value: {row.mean.toFixed(2)})
                          </span>
                        )}
                      </span>
                    </div>
                  );
                }

                {/* §10.4: no concurrent control */}
                if (row.no_concurrent_control) {
                  return (
                    <div key={row.dose_level} className="text-[10px] leading-relaxed">
                      <span className="inline-flex items-baseline gap-1.5">
                        <DoseLabel level={row.dose_level} label={doseStr} className="text-[10px]" />
                        <span className="text-muted-foreground">
                          mean: {row.mean?.toFixed(2) ?? "\u2014"}
                        </span>
                      </span>
                      <div className="text-[9px] text-amber-700/70 mt-0.5 ml-5">
                        No concurrent control at recovery — based on raw change
                      </div>
                    </div>
                  );
                }

                const v = classifyContinuousRecovery(row.terminal_effect, row.effect_size);
                const desc = formatVerdictDesc(v, row.terminal_effect, row.effect_size, row.terminal_day, row.recovery_day);
                const pStr = row.p_value != null && row.p_value < 0.1
                  ? formatPCompact(row.p_value)
                  : null;

                {/* §6.4: hover tooltip */}
                const rowTooltip = buildRowTooltip(row, doseStr, v, desc);

                {/* §12: element tooltips */}
                const verdictTooltip = v.verdict === "below-threshold"
                  ? "Terminal effect too small to meaningfully evaluate recovery."
                  : `${CONT_VERDICT_LABEL[v.verdict]}: control-normalized effect ${desc} during recovery period`;

                return (
                  <div key={row.dose_level} className="text-[10px] leading-relaxed" title={rowTooltip}>
                    <span className="inline-flex items-baseline gap-1.5">
                      <DoseLabel level={row.dose_level} label={doseStr} className="text-[10px]" />
                      <span
                        className={`font-medium ${CONT_VERDICT_CLASS[v.verdict]}`}
                        title={verdictTooltip}
                      >
                        {CONT_VERDICT_LABEL[v.verdict]}
                      </span>
                      {v.verdict !== "below-threshold" && (
                        <span
                          className="text-muted-foreground"
                          title="Change in effect size (Hedges' g, SD units from control) between terminal and recovery. Positive = resolving."
                        >
                          &mdash; {desc}
                        </span>
                      )}
                      {v.verdict !== "below-threshold" && pStr && (
                        <span
                          className="text-muted-foreground"
                          title="Statistical significance of recovery-vs-terminal comparison. Shown when p < 0.1."
                        >
                          &middot; p&#x2009;=&#x2009;{pStr}
                        </span>
                      )}
                      {v.verdict === "below-threshold" && desc && (
                        <span className="text-muted-foreground/60">
                          ({desc})
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* §4.3: Control drift warning */}
            {(() => {
              const withCtrl = sexRows.filter(
                r => r.control_mean_terminal != null && r.control_mean != null && !r.insufficient_n && !r.no_concurrent_control,
              );
              if (withCtrl.length === 0) return null;
              const row0 = withCtrl[0];
              const ctrlTerminal = row0.control_mean_terminal!;
              const ctrlRecovery = row0.control_mean!;
              if (Math.abs(ctrlTerminal) < 0.001) return null;
              const driftPct = Math.abs(ctrlRecovery - ctrlTerminal) / Math.abs(ctrlTerminal) * 100;
              if (driftPct <= 15) return null;
              return (
                <div className="text-[9px] text-muted-foreground/70 mt-1">
                  Control group shifted {Math.round(driftPct)}% between terminal and recovery ({ctrlTerminal.toFixed(2)} {"\u2192"} {ctrlRecovery.toFixed(2)}). Interpretation may be affected.
                </div>
              );
            })()}

            {/* Peak annotation when dosing-phase peak materially exceeded terminal */}
            {peakAnnotations.length > 0 && (
              <div
                className="mt-1.5 text-[9px] text-muted-foreground/70 leading-snug space-y-1"
                title="Largest effect during dosing phase. Shown when peak materially exceeded terminal value."
              >
                {peakAnnotations.map(pa => {
                  const dg = doseGroups?.find(g => g.dose_level === pa.doseLevel);
                  const doseStr = dg && dg.dose_value != null && dg.dose_value > 0
                    ? `${dg.dose_value} ${dg.dose_unit ?? ""}`.trim()
                    : `Dose ${pa.doseLevel}`;
                  const dayStr = pa.peakDay != null ? ` at Day ${pa.peakDay}` : "";

                  // Trajectory summary when all three data points exist (§5.4)
                  const hasTrajectory =
                    pa.recoveryG != null && pa.terminalDay != null && pa.recoveryDay != null;
                  const dosingPct = hasTrajectory
                    ? Math.round((Math.abs(pa.peakG) - Math.abs(pa.terminalG)) / Math.abs(pa.peakG) * 100)
                    : null;
                  const recoveryPct = hasTrajectory
                    ? Math.round((Math.abs(pa.terminalG) - Math.abs(pa.recoveryG!)) / Math.abs(pa.terminalG) * 100)
                    : null;

                  return (
                    <div key={pa.doseLevel}>
                      <div>
                        {doseStr}: peak during dosing was larger (|g|{"\u2009"}={"\u2009"}{formatGAbs(pa.peakG)}{dayStr}),
                        partially resolved before terminal (|g|{"\u2009"}={"\u2009"}{formatGAbs(pa.terminalG)}).
                      </div>
                      {hasTrajectory && dosingPct != null && recoveryPct != null && (
                        <div className="mt-0.5 font-mono">
                          <span>Peak{pa.peakDay != null ? ` (D${pa.peakDay})` : ""}: {formatGAbs(pa.peakG)}g</span>
                          <span> {"\u2192"} Terminal{pa.terminalDay != null ? ` (D${pa.terminalDay})` : ""}: {formatGAbs(pa.terminalG)}g</span>
                          <span> {"\u2192"} Recovery (D{pa.recoveryDay}): {formatGAbs(pa.recoveryG!)}g</span>
                          <div className="pl-4">
                            <span>{"\u2570\u2500\u2500"} {dosingPct}% resolved during dosing {"\u2500\u256F"}</span>
                            {"  "}
                            <span>{"\u2570\u2500\u2500"} {recoveryPct >= 0 ? `${recoveryPct}% resolved` : `${Math.abs(recoveryPct)}% worsened`} {"\u2500\u256F"}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Histopath recovery: both-sex wrapper ─────────────────

function HistopathRecoveryAllSexes({
  finding,
  specimen,
}: {
  finding: UnifiedFinding;
  specimen: string;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const specimensArr = useMemo(() => [specimen], [specimen]);

  // Always call both hooks (React rules — must be unconditional)
  const recoveryF = useOrganRecovery(studyId, specimensArr, "F");
  const recoveryM = useOrganRecovery(studyId, specimensArr, "M");

  if (recoveryF.isLoading || recoveryM.isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }

  const sections: { sex: string; recovery: OrganRecoveryResult }[] = [];
  if (recoveryF.hasRecovery) sections.push({ sex: "F", recovery: recoveryF });
  if (recoveryM.hasRecovery) sections.push({ sex: "M", recovery: recoveryM });

  if (sections.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground">
        No recovery arm data for this specimen.
      </div>
    );
  }

  const showSexHeaders = sections.length > 1;

  return (
    <div className="space-y-3">
      {sections.map(({ sex, recovery }) => (
        <HistopathSexSection
          key={sex}
          sex={sex}
          finding={finding}
          specimen={specimen}
          recovery={recovery}
          showSexHeader={showSexHeaders}
        />
      ))}
    </div>
  );
}

// ── Histopath recovery: per-sex rendering ────────────────

function HistopathSexSection({
  sex,
  finding,
  specimen,
  recovery,
  showSexHeader,
}: {
  sex: string;
  finding: UnifiedFinding;
  specimen: string;
  recovery: OrganRecoveryResult;
  showSexHeader: boolean;
}) {
  const findingName = finding.finding;
  const label = `${specimen} \u2014 ${findingName}`;
  const assessment = recovery.assessmentByLabel.get(label);
  const verdict = recovery.byEndpointLabel.get(label);
  const recoveryDays = recovery.recoveryDaysBySpecimen.get(specimen);

  if (!assessment || !verdict) {
    return showSexHeader ? (
      <div>
        <div className="text-[10px] font-semibold text-foreground mb-1">{sex}</div>
        <div className="text-[10px] text-muted-foreground">
          Finding not observed in recovery-arm subjects.
        </div>
      </div>
    ) : (
      <div className="text-[10px] text-muted-foreground">
        Finding not observed in recovery-arm subjects.
      </div>
    );
  }

  // Finding nature classification
  const maxSev = Math.max(
    ...assessment.assessments.map((a) => a.main.maxSeverity),
    ...assessment.assessments.map((a) => a.recovery.maxSeverity),
  );
  const nature = classifyFindingNature(findingName, maxSev > 0 ? maxSev : null);

  // Recovery classification
  const classContext = buildClassificationContext(finding, nature, recoveryDays ?? null);
  const classification = classifyRecovery(assessment, classContext);

  return (
    <div className="space-y-2">
      {showSexHeader && (
        <div className="text-[10px] font-semibold text-foreground">{sex}</div>
      )}

      {/* Verdict */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Verdict:</span>
        <VerdictBadge verdict={verdict} />
        {recoveryDays != null && (
          <span className="text-[10px] text-muted-foreground">
            ({recoveryDays}d recovery)
          </span>
        )}
      </div>

      {/* Per-dose assessments */}
      {assessment.assessments.length > 0 && (
        <div className="space-y-0.5">
          {assessment.assessments.map((da) => {
            {/* §9.2: severity grade shift annotation */}
            const incDelta = da.recovery.affected / Math.max(da.recovery.examined, 1)
              - da.main.affected / Math.max(da.main.examined, 1);
            const incUnchanged = Math.abs(incDelta) < 0.01;
            const incDecreased = incDelta < -0.01;
            const sevDelta = da.recovery.avgSeverity - da.main.avgSeverity;
            let sevShift: string | null = null;
            if (da.main.avgSeverity > 0) {
              if (incUnchanged && sevDelta < -0.5) sevShift = "Severity improving";
              else if (incUnchanged && sevDelta > 0.5) sevShift = "Severity progressing";
              else if (incDecreased && sevDelta < 0) sevShift = "Reducing (incidence + severity)";
              else if (incDecreased && sevDelta > 0.5) sevShift = "Mixed — incidence decreased but severity increased";
            }

            return (
              <div key={da.doseLevel} className="flex items-center gap-2 text-[10px]">
                <span className="w-20 shrink-0">
                  <DoseLabel
                    level={da.doseLevel}
                    label={formatDoseShortLabel(da.doseGroupLabel)}
                    tooltip={da.doseGroupLabel}
                    className="text-[10px]"
                  />
                </span>
                <VerdictBadge verdict={da.verdict} />
                <span className="font-mono text-muted-foreground">
                  {da.main.affected}/{da.main.examined} → {da.recovery.affected}/{da.recovery.examined}
                </span>
                {sevShift && (
                  <span className="text-[9px] text-muted-foreground">{sevShift}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Classification */}
      <ClassificationSection classification={classification} />

      {/* Finding nature */}
      <FindingNatureSection nature={nature} />

      {/* Concordance check — flag discordance between nature and verdict */}
      <ConcordanceNote nature={nature} verdict={verdict} />
    </div>
  );
}

// ── Classification display ───────────────────────────────

function ClassificationSection({ classification }: { classification: RecoveryClassification }) {
  const borderClass = CLASSIFICATION_BORDER[classification.classification];
  return (
    <div className={`pl-2 ${borderClass}`}>
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium">
          {CLASSIFICATION_LABELS[classification.classification]}
        </span>
        <ConfidenceBadge confidence={classification.confidence} />
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
        {classification.rationale}
      </div>
      {classification.qualifiers.length > 0 && (
        <div className="mt-0.5 text-[10px] text-muted-foreground/80">
          {classification.qualifiers.join(". ")}
        </div>
      )}
      {classification.recommendedAction && (
        <div className="mt-0.5 text-[10px] italic text-muted-foreground/70">
          {classification.recommendedAction}
        </div>
      )}
    </div>
  );
}

// ── Finding nature display ───────────────────────────────

function FindingNatureSection({ nature }: { nature: FindingNatureInfo }) {
  if (nature.nature === "unknown") return null;

  return (
    <div className="space-y-0.5">
      <div className="text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground">Finding nature: </span>
        {nature.nature}
        {nature.source === "ct_mapped" && nature.normalizedTerm && (
          <span className="text-muted-foreground/60"> ({nature.normalizedTerm})</span>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground">
        <span className="font-medium text-foreground">Reversibility: </span>
        {reversibilityLabel(nature)}
      </div>
    </div>
  );
}

// ── Concordance check (spec §11.3) ───────────────────────

function ConcordanceNote({
  nature,
  verdict,
}: {
  nature: FindingNatureInfo;
  verdict: RecoveryVerdict;
}) {
  if (nature.nature === "unknown") return null;

  const qualifier = nature.reversibilityQualifier;
  let message: string | null = null;

  if (
    qualifier === "expected" &&
    (verdict === "persistent" || verdict === "progressing")
  ) {
    message =
      "\u26a0 Expected to resolve but persisting \u2014 may indicate ongoing toxicity or insufficient recovery duration";
  } else if (
    (qualifier === "unlikely" || qualifier === "none") &&
    (verdict === "reversed" || verdict === "reversing")
  ) {
    message =
      "Finding nature suggests persistence; recovery may reflect sampling variability or secondary changes";
  }

  if (!message) return null;

  return (
    <div className="text-[9px] text-muted-foreground/70 leading-snug">
      {message}
    </div>
  );
}

// ── Context builder ──────────────────────────────────────

function buildClassificationContext(
  finding: UnifiedFinding,
  nature: FindingNatureInfo,
  recoveryDays: number | null,
): RecoveryContext {
  // Determine dose consistency from dose_response_pattern
  const pattern = finding.dose_response_pattern?.toLowerCase() ?? "";
  let doseConsistency: RecoveryContext["doseConsistency"] = "Weak";
  if (pattern.includes("monotonic")) doseConsistency = "Strong";
  else if (pattern.includes("threshold") || pattern.includes("sublinear")) doseConsistency = "Moderate";
  else if (pattern.includes("non_monotonic") || pattern.includes("non-monotonic")) doseConsistency = "NonMonotonic";

  return {
    isAdverse: finding.severity === "adverse",
    doseConsistency,
    doseResponsePValue: finding.trend_p,
    clinicalClass: null,
    signalClass: finding.severity,
    findingNature: nature,
    historicalControlIncidence: null,
    crossDomainCorroboration: null,
    recoveryPeriodDays: recoveryDays,
  };
}

// ── Main component ───────────────────────────────────────

interface RecoveryPaneProps {
  finding: UnifiedFinding;
  doseGroups?: DoseGroup[];
}

export function RecoveryPane({ finding, doseGroups }: RecoveryPaneProps) {
  const isHistopath = finding.domain === "MI" || finding.domain === "MA";
  const specimen = finding.specimen;

  if (isHistopath && specimen) {
    return <HistopathRecoveryAllSexes finding={finding} specimen={specimen} />;
  }

  // Continuous domains (LB, BW, OM, etc.)
  if (finding.data_type === "continuous") {
    return <ContinuousRecoverySection finding={finding} doseGroups={doseGroups} />;
  }

  return (
    <div className="text-[10px] text-muted-foreground">
      Recovery assessment not available for {finding.domain} domain.
    </div>
  );
}
