/**
 * Recovery insights pane for FindingsContextPanel.
 * Shows recovery verdict, classification, finding nature,
 * and comparison stats for the selected finding.
 */
import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useOrganRecovery } from "@/hooks/useOrganRecovery";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
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
import type { UnifiedFinding } from "@/types/analysis";
import { Skeleton } from "@/components/ui/skeleton";

// ── Verdict badge colors ─────────────────────────────────

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

// ── Histopath recovery section ───────────────────────────

function HistopathRecoverySection({
  finding,
  specimen,
}: {
  finding: UnifiedFinding;
  specimen: string;
}) {
  const { studyId } = useParams<{ studyId: string }>();
  const specimens = useMemo(() => [specimen], [specimen]);
  const recovery = useOrganRecovery(studyId, specimens);

  if (recovery.isLoading) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (!recovery.hasRecovery) {
    return (
      <div className="text-[10px] text-muted-foreground">
        No recovery arm data for this specimen.
      </div>
    );
  }

  const findingName = finding.finding;
  const label = `${specimen} \u2014 ${findingName}`;
  const assessment = recovery.assessmentByLabel.get(label);
  const verdict = recovery.byEndpointLabel.get(label);
  const recoveryDays = recovery.recoveryDaysBySpecimen.get(specimen);

  if (!assessment || !verdict) {
    return (
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
          {assessment.assessments.map((da) => (
            <div key={da.doseLevel} className="flex items-center gap-2 text-[10px]">
              <span className="w-12 text-muted-foreground">{da.doseGroupLabel.split(",")[0]}</span>
              <VerdictBadge verdict={da.verdict} />
              <span className="font-mono text-muted-foreground">
                {da.main.affected}/{da.main.examined} → {da.recovery.affected}/{da.recovery.examined}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Classification */}
      <ClassificationSection classification={classification} />

      {/* Finding nature */}
      <FindingNatureSection nature={nature} />
    </div>
  );
}

// ── Continuous recovery section ──────────────────────────

function ContinuousRecoverySection({
  finding,
}: {
  finding: UnifiedFinding;
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

  // Filter to this finding's test code and sex
  const rows = recovery.rows.filter(
    (r) =>
      r.test_code.toUpperCase() === finding.test_code.toUpperCase() &&
      r.sex === finding.sex,
  );

  if (rows.length === 0) {
    return (
      <div className="text-[10px] text-muted-foreground">
        No recovery data for {finding.finding} ({finding.sex}).
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Recovery comparison:</span>
        {recovery.recovery_day != null && (
          <span className="text-[10px] text-muted-foreground">
            ({recovery.recovery_day}d post-dosing)
          </span>
        )}
      </div>

      {/* Per-dose comparison table */}
      <div className="space-y-0.5">
        <div className="flex gap-2 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
          <span className="w-12">Dose</span>
          <span className="w-16 text-right">Recovery</span>
          <span className="w-16 text-right">Terminal</span>
          <span className="w-14 text-right">p-value</span>
        </div>
        {rows.map((r) => (
          <div key={`${r.dose_level}-${r.sex}`} className="flex gap-2 text-[10px]">
            <span className="w-12 text-muted-foreground">Dose {r.dose_level}</span>
            <span className="w-16 text-right font-mono">
              {r.effect_size != null ? (r.effect_size > 0 ? "+" : "") + r.effect_size.toFixed(2) + "g" : "\u2014"}
            </span>
            <span className="w-16 text-right font-mono">
              {r.terminal_effect != null ? (r.terminal_effect > 0 ? "+" : "") + r.terminal_effect.toFixed(2) + "g" : "\u2014"}
            </span>
            <span className={`w-14 text-right font-mono ${r.p_value != null && r.p_value < 0.05 ? "text-red-600" : "text-muted-foreground"}`}>
              {r.p_value != null ? r.p_value.toFixed(3) : "\u2014"}
            </span>
          </div>
        ))}
      </div>

      {/* Interpretation */}
      {rows.some((r) => r.terminal_effect != null && r.effect_size != null) && (() => {
        const allReversing = rows.every(
          (r) => r.terminal_effect != null && r.effect_size != null &&
            Math.abs(r.effect_size) < Math.abs(r.terminal_effect) * 0.5,
        );
        const anyWorsening = rows.some(
          (r) => r.terminal_effect != null && r.effect_size != null &&
            Math.abs(r.effect_size) > Math.abs(r.terminal_effect) * 1.1,
        );
        return (
          <div className="text-[10px] text-muted-foreground">
            {allReversing && "Effect size reduced by >50% during recovery — trending toward reversal."}
            {anyWorsening && "Effect size increased during recovery — persistent or worsening effect."}
            {!allReversing && !anyWorsening && "Partial recovery observed — effect partially attenuated."}
          </div>
        );
      })()}
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
}

export function RecoveryPane({ finding }: RecoveryPaneProps) {
  const isHistopath = finding.domain === "MI" || finding.domain === "MA";
  const specimen = finding.specimen;

  if (isHistopath && specimen) {
    return <HistopathRecoverySection finding={finding} specimen={specimen} />;
  }

  // Continuous domains (LB, BW, etc.)
  if (finding.data_type === "continuous") {
    return <ContinuousRecoverySection finding={finding} />;
  }

  return (
    <div className="text-[10px] text-muted-foreground">
      Recovery assessment not available for {finding.domain} domain.
    </div>
  );
}
