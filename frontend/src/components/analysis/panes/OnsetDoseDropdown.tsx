import { useState } from "react";
import { useParams } from "react-router-dom";
import { formatOnsetDose } from "@/lib/onset-dose";
import { OverridePill } from "@/components/ui/OverridePill";
import type { DoseGroup, UnifiedFinding } from "@/types/analysis";
import {
  usePatternOverrideActions,
  deriveOnsetState,
  getSystemOnsetLevel,
} from "@/hooks/usePatternOverrideActions";

interface Props {
  finding: UnifiedFinding;
  doseGroups: DoseGroup[];
}

export function OnsetDoseDropdown({ finding, doseGroups }: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const actions = usePatternOverrideActions(studyId);

  const [open, setOpen] = useState(false);

  const treatmentGroups = doseGroups.filter(g => g.dose_level > 0);
  const state = deriveOnsetState(finding, doseGroups, actions.annotations);
  const systemOnsetLevel = getSystemOnsetLevel(finding);
  const hasOnsetOverride = state.onset?.source === "override";

  function handleSelect(doseLevel: number) {
    setOpen(false);
    actions.selectOnset(finding, doseLevel);
  }

  function handleResetOnset() {
    setOpen(false);
    actions.resetOnset(finding);
  }

  return (
    <div
      className={`relative flex items-center gap-0.5${state.needsAttention ? " border-b border-red-500" : ""}${state.isOverridden ? " cell-overridable" : ""}`}
      title={state.needsAttention ? "Onset dose needs selection" : undefined}
      onContextMenu={(e) => { e.preventDefault(); setOpen(!open); }}
    >
      <span
        className={`flex-1 text-right font-mono py-0.5 cursor-context-menu${state.onset ? "" : " text-muted-foreground/60"}`}
        title={state.needsAttention ? "Onset dose needs selection" : state.overrideTooltip ?? "Right-click to override onset dose"}
      >
        {state.displayLabel}
      </span>
      <div className="w-3 shrink-0">
        <OverridePill
          isOverridden={state.isOverridden}
          note={state.annotation?.onset_note}
          user={state.annotation?.pathologist}
          timestamp={state.annotation?.reviewDate ? new Date(state.annotation.reviewDate).toLocaleDateString() : undefined}
          onSaveNote={(text) => actions.saveOnsetNote(finding, text)}
          placeholder="Onset at dose 2 — earliest statistically significant effect"
          popoverSide="top"
          popoverAlign="end"
        />
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[100px] rounded border border-border bg-background py-1 shadow-md">
            {treatmentGroups.map((g) => {
              const isSystem = g.dose_level === systemOnsetLevel;
              return (
                <button
                  key={g.dose_level}
                  onClick={() => handleSelect(g.dose_level)}
                  disabled={actions.isPending}
                  className={`flex w-full items-center px-3 py-1 text-left text-[11px] transition-colors ${
                    state.onset && g.dose_level === state.onset.doseLevel
                      ? "bg-muted/50 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <span>{formatOnsetDose(g.dose_level, doseGroups)}</span>
                  {isSystem && hasOnsetOverride && (
                    <span className="ml-auto text-[11px] text-muted-foreground/50">system</span>
                  )}
                </button>
              );
            })}
            {hasOnsetOverride && (
              <button
                onClick={handleResetOnset}
                disabled={actions.isPending}
                className="flex w-full items-center px-3 py-1 text-left text-[11px] text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-colors border-t border-border/40"
              >
                Reset to system
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
