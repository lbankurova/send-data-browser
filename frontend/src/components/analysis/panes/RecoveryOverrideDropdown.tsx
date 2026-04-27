import { useState } from "react";
import { useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { OverridePill } from "@/components/ui/OverridePill";
import { getVerdictLabel } from "@/lib/recovery-labels";
import { shortDoseLabel } from "@/lib/dose-label-utils";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";
import type { FindingVerdictInfo } from "@/lib/recovery-table-verdicts";
import {
  useRecoveryOverrideActions,
  RECOVERY_OVERRIDE_OPTIONS,
} from "@/hooks/useRecoveryOverrideActions";

interface Props {
  finding: UnifiedFinding;
  verdictInfo: FindingVerdictInfo;
  /** Dose groups for the study; used to label the worst-case driving dose (GAP-293). Optional for backward compat. */
  doseGroups?: DoseGroup[];
}

export function RecoveryOverrideDropdown({ finding, verdictInfo, doseGroups }: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const actions = useRecoveryOverrideActions(studyId);
  const [open, setOpen] = useState(false);

  const { verdict: autoVerdict, isOverridden, effectiveVerdict, dataType, lowConfidence, worstDoseLevel } = verdictInfo;
  const label = getVerdictLabel(effectiveVerdict);
  const displayLabel = lowConfidence && !isOverridden ? `${label} *` : label;
  // GAP-293: surface the dose that drove the worst-case aggregate verdict.
  const driverDoseLabel: string | null = worstDoseLevel != null
    ? (() => {
        const dg = doseGroups?.find((g) => g.dose_level === worstDoseLevel);
        if (dg?.label) return shortDoseLabel(dg.label, doseGroups);
        return `dose level ${worstDoseLevel}`;
      })()
    : null;

  function handleSelect(value: string) {
    setOpen(false);
    if (!studyId) return;
    actions.selectVerdict(finding.id, finding.sex, autoVerdict, dataType, value);
  }

  function handleReset() {
    setOpen(false);
    actions.resetVerdict(finding.id, finding.sex);
  }

  return (
    <div
      className={cn("relative flex items-center justify-end gap-0.5", isOverridden && "cell-overridable")}
      onContextMenu={(e) => { e.preventDefault(); setOpen(!open); }}
    >
      <span
        className={cn(
          "flex-1 text-right py-0.5 cursor-context-menu text-muted-foreground",
          isOverridden && "italic",
        )}
        title={(() => {
          if (lowConfidence && !isOverridden) {
            return `Low confidence: n < 5 in recovery group. Right-click to override`;
          }
          if (isOverridden) {
            return `Override: ${label} (auto: ${getVerdictLabel(autoVerdict)})`;
          }
          // GAP-293: aggregate verdict picks worst-across-doses; surface the driving dose.
          const drivenBy = driverDoseLabel ? ` (driven by ${driverDoseLabel})` : "";
          return `Worst-case across dose groups${drivenBy}. Right-click to override.`;
        })()}
      >
        {displayLabel}
      </span>
      <div className="w-3 shrink-0">
        <OverridePill
          isOverridden={isOverridden}
          note={undefined}
          onSaveNote={(text) => actions.saveNote(finding.id, finding.sex, autoVerdict, dataType, text)}
          placeholder="Clinical judgment override rationale"
          popoverSide="left"
          popoverAlign="start"
        />
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[150px] rounded border border-border bg-background py-1 shadow-md">
            {RECOVERY_OVERRIDE_OPTIONS.map((opt) => {
              const isActive = opt.value === effectiveVerdict;
              const isAuto = opt.value === autoVerdict;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  disabled={actions.isPending}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                    isActive
                      ? "bg-muted/50 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isAuto && isOverridden && (
                    <span className="ml-auto text-[11px] text-muted-foreground/50">auto</span>
                  )}
                </button>
              );
            })}
            {isOverridden && (
              <button
                onClick={handleReset}
                disabled={actions.isPending}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-colors border-t border-border/40"
              >
                Reset to auto
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
