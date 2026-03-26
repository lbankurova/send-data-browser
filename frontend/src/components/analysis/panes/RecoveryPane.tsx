/**
 * Recovery insights pane for FindingsContextPanel.
 * Shows recovery verdict, classification, finding nature,
 * and comparison stats for the selected finding.
 *
 * Both sexes are shown side-by-side (F before M) when data exists.
 * Continuous domains use verdict-first rows; histopath uses incidence badges.
 */
import { useParams } from "react-router-dom";
import { useMemo } from "react";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
import type { DoseGroup, UnifiedFinding } from "@/types/analysis";
import { useStatMethods } from "@/hooks/useStatMethods";
import { getEffectSizeLabel, getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { assessRecoveryAdequacy } from "@/lib/recovery-assessment";
import { classifyFindingNature } from "@/lib/finding-nature";
import { classifyContinuousRecovery } from "@/lib/recovery-verdict";
import { getVerdictLabel } from "@/lib/recovery-labels";
import { Info } from "lucide-react";
import { RecoveryDumbbellChart } from "./RecoveryDumbbellChart";
import { IncidenceRecoveryChart } from "./IncidenceRecoveryChart";
import { RecoveryVerdictOverride } from "./RecoveryVerdictOverride";

// ── Verdict priority for worst-case selection ────────────
// Higher index = more concerning.
const VERDICT_PRIORITY: Record<string, number> = {
  not_assessed: 0,
  reversed: 1,
  overcorrected: 2,
  partially_reversed: 3,
  persistent: 4,
  progressing: 5,
  anomaly: 5,
};

function verdictPriority(v: string): number {
  return VERDICT_PRIORITY[v] ?? 0;
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
      <div className="text-[11px] text-muted-foreground">
        No recovery comparison data available.
      </div>
    );
  }

  // Get rows for this endpoint (both sexes), filtered to the MAX recovery day
  // per dose/sex.  The backend now returns multi-day rows (Phase 2 — multi-day
  // recovery stats); the dumbbell chart expects one row per dose_level×sex.
  // For OM findings, match by specimen (organ) since OMTESTCD is always "WEIGHT".
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
      <div className="text-[11px] text-muted-foreground">
        No recovery data for {finding.finding}.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-muted-foreground flex items-center justify-between">
        <span>
          {allRows[0]?.terminal_day != null && <>Day {allRows[0].terminal_day} (terminal) → </>}
          {recovery.recovery_day != null && <>Day {recovery.recovery_day} (recovery)</>}
          {" · "}Effect size: {getEffectSizeLabel(effectSize)} ({getEffectSizeSymbol(effectSize)})
        </span>
        <span title={"Each column is a dose group. Filled dot = effect size at terminal sacrifice. Horizontal tick = effect size at recovery. Arrow shows direction of change (toward zero = recovering, away = worsening). Line thickness: thick = p<0.05, thin = p\u22650.05. Open triangles mark peak effects during dosing when they materially exceeded the terminal value (|peak| > 1.5\u00d7 |terminal|)."}>
          <Info className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-help" />
        </span>
      </div>

      {/* Dumbbell chart with verdict notes under each sex panel */}
      <RecoveryDumbbellChart
        rows={allRows}
        doseGroups={doseGroups}
        terminalDay={allRows[0]?.terminal_day}
        recoveryDay={recovery.recovery_day}
      />

      {/* Verdict override — uses worst-case across all dose/sex rows */}
      {studyId && (() => {
        // Compute per-row verdicts and find the worst case
        const classified = allRows.map((row) => {
          const tG = row.terminal_effect_same_arm ?? row.terminal_effect;
          const v = classifyContinuousRecovery(tG, row.effect_size, row.treated_n, row.control_n);
          return { terminalG: tG ?? null, recoveryG: row.effect_size ?? null, pctRecovered: v.pctRecovered, verdict: v.verdict };
        });
        const worst = classified.reduce((a, b) => verdictPriority(b.verdict) > verdictPriority(a.verdict) ? b : a, classified[0]);
        return (
          <RecoveryVerdictOverride
            findingId={finding.id}
            studyId={studyId}
            dataType="continuous"
            autoVerdict={worst.verdict}
            terminalG={worst.terminalG}
            recoveryG={worst.recoveryG}
            pctRecovered={worst.pctRecovered}
          />
        );
      })()}

    </div>
  );
}

// ── Incidence recovery section ───────────────────────────

function IncidenceRecoverySection({ finding }: { finding: UnifiedFinding; doseGroups?: DoseGroup[] }) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: recovery } = useRecoveryComparison(studyId);

  if (!recovery || !recovery.available) {
    return (
      <div className="text-[11px] text-muted-foreground">
        No recovery comparison data available.
      </div>
    );
  }

  const incRows = recovery.incidence_rows ?? [];
  // Match by finding name (uppercased in both unified_findings and backend)
  // CL findings are per-sex; filter to the finding's sex when specific
  const findingUpper = finding.finding.toUpperCase();
  const findingSex = finding.sex === "F" || finding.sex === "M" ? finding.sex : null;
  const matched = incRows.filter(
    (r) => r.finding === findingUpper && r.domain === finding.domain
      && (findingSex == null || r.sex === findingSex),
  );

  if (matched.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground">
        No recovery data for {finding.finding}.
      </div>
    );
  }

  // Recovery adequacy assessment (study-design-level, not per-dose)
  const adequacy = useMemo(() => {
    if (recovery.recovery_day == null || recovery.last_dosing_day == null) return null;
    // Only assess for MI/MA where finding-nature classification is reliable
    if (finding.domain !== "MI" && finding.domain !== "MA") return null;
    const recoveryDays = recovery.recovery_day - recovery.last_dosing_day;
    const nature = classifyFindingNature(finding.finding, null, finding.specimen ?? null);
    return assessRecoveryAdequacy(recoveryDays, nature);
  }, [recovery.recovery_day, recovery.last_dosing_day, finding.finding, finding.specimen, finding.domain]);

  // Anomaly annotation: check if any dose has anomaly verdict
  const hasAnomaly = matched.some((r) => r.verdict === "anomaly");
  const anomalyContext = useMemo(() => {
    if (!hasAnomaly) return null;
    const nature = classifyFindingNature(finding.finding, null, finding.specimen ?? null);
    // Check dose-response: does the anomaly appear at multiple dose levels?
    const anomalyDoses = matched.filter((r) => r.verdict === "anomaly");
    const doseDependent = anomalyDoses.length > 1 &&
      new Set(anomalyDoses.map((r) => r.dose_level)).size > 1;
    return { nature, doseDependent, count: anomalyDoses.length };
  }, [hasAnomaly, matched, finding.finding, finding.specimen]);

  return (
    <div className="space-y-1">
      <IncidenceRecoveryChart
        rows={matched}
        recoveryDay={recovery.recovery_day}
        compact
      />

      {/* Recovery adequacy annotation (MI/MA only) */}
      {adequacy && !adequacy.adequate && (
        <div className="text-[9px] text-amber-700" title={`Expected ${adequacy.expectedWeeks} weeks for ${adequacy.findingNature ?? "this finding type"}; study provided ${adequacy.actualWeeks.toFixed(1)} weeks`}>
          Recovery period may be inadequate for {adequacy.findingNature ?? "this finding type"} ({adequacy.actualWeeks.toFixed(0)}w of ~{adequacy.expectedWeeks}w expected)
        </div>
      )}

      {/* Anomaly discrimination annotation */}
      {anomalyContext && (
        <div className="text-[9px] text-muted-foreground">
          <span className="font-medium text-red-700">{getVerdictLabel("anomaly")}</span>
          {" — "}
          {anomalyContext.doseDependent
            ? "dose-dependent pattern suggests delayed onset"
            : "single dose level — spontaneous or delayed onset unclear"}
          {anomalyContext.nature.nature !== "unknown" && (
            <> ({anomalyContext.nature.nature}: {anomalyContext.nature.expected_reversibility === "none" ? "not typically delayed" : `${anomalyContext.nature.expected_reversibility} delayed-onset propensity`})</>
          )}
        </div>
      )}

      {/* Verdict override — uses worst-case across matched incidence rows */}
      {studyId && (() => {
        const worst = matched.reduce((a, b) => verdictPriority(b.verdict ?? "not_assessed") > verdictPriority(a.verdict ?? "not_assessed") ? b : a, matched[0]);
        return (
          <RecoveryVerdictOverride
            findingId={finding.id}
            studyId={studyId}
            dataType="incidence"
            autoVerdict={worst.verdict ?? "not_assessed"}
            incidenceRow={{
              main_affected: worst.main_affected,
              main_n: worst.main_n,
              recovery_affected: worst.recovery_affected,
              recovery_n: worst.recovery_n,
              verdict: worst.verdict,
              confidence: worst.confidence,
              main_avg_severity: worst.main_avg_severity,
              recovery_avg_severity: worst.recovery_avg_severity,
              main_examined: worst.main_examined,
              recovery_examined: worst.recovery_examined,
            }}
          />
        );
      })()}
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

  // All incidence domains (MI, MA, CL) — unified via incidence_rows
  if (finding.data_type === "incidence") {
    return <IncidenceRecoverySection finding={finding} doseGroups={doseGroups} />;
  }

  return (
    <div className="text-[11px] text-muted-foreground">
      Recovery assessment not available for {finding.domain} domain.
    </div>
  );
}
