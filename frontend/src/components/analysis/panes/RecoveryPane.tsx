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
import { useStatMethods } from "@/hooks/useStatMethods";
import { getEffectSizeLabel, getEffectSizeSymbol } from "@/lib/stat-method-transforms";
import { Info } from "lucide-react";
import { RecoveryDumbbellChart } from "./RecoveryDumbbellChart";

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

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-muted-foreground flex items-center justify-between">
        <span>
          {allRows[0]?.terminal_day != null && <>Day {allRows[0].terminal_day} (terminal) → </>}
          {recovery.recovery_day != null && <>Day {recovery.recovery_day} (recovery)</>}
          {" · "}Effect size: {getEffectSizeLabel(effectSize)} ({getEffectSizeSymbol(effectSize)})
        </span>
        <span title={"Each row is one dose group. Filled dot = effect size at terminal sacrifice. Vertical bar = effect size at recovery. Arrow direction shows whether the effect shrank (recovering, arrow left toward zero) or grew (worsening, arrow right). Line weight encodes statistical significance: thicker = p<0.05, thinner = p\u22650.05. Amber triangles mark peak effects during dosing when they materially exceeded the terminal value."}>
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
                <span className="w-[60px] shrink-0 inline-flex justify-end">
                  <DoseLabel
                    level={da.doseLevel}
                    label={formatDoseShortLabel(da.doseGroupLabel)}
                    tooltip={da.doseGroupLabel}
                    align="right"
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
