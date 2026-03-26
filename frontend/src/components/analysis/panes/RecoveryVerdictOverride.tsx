/**
 * RecoveryVerdictOverride — inline override dropdown for recovery verdicts.
 *
 * Shows:
 * 1. Transparency line explaining why the auto-verdict was chosen
 * 2. Verdict display with right-click dropdown for override selection
 * 3. Override indicator with bg-violet-50/40 tint when overridden
 * 4. OverridePill dot for note entry when overridden
 * 5. "Reset to auto" option when overridden
 *
 * Used in both ContinuousRecoverySection and IncidenceRecoverySection
 * of RecoveryPane.
 */
import { useState } from "react";
import { OverridePill } from "@/components/ui/OverridePill";
import {
  useRecoveryOverrideActions,
  RECOVERY_OVERRIDE_OPTIONS,
} from "@/hooks/useRecoveryOverrideActions";
import { getVerdictLabel, RECOVERY_VERDICT_CLASS } from "@/lib/recovery-labels";
import { formatContinuousTransparency, formatIncidenceTransparency } from "@/lib/verdict-transparency";
import type { IncidenceTransparencyRow } from "@/lib/verdict-transparency";

// ── Props ─────────────────────────────────────────────────

interface RecoveryVerdictOverrideProps {
  findingId: string;
  studyId: string;
  dataType: "continuous" | "incidence";
  autoVerdict: string;
  // Continuous-specific for transparency
  terminalG?: number | null;
  recoveryG?: number | null;
  pctRecovered?: number | null;
  // Incidence-specific for transparency
  incidenceRow?: IncidenceTransparencyRow;
}

// ── Component ────────────────────────────────────────────

export function RecoveryVerdictOverride({
  findingId,
  studyId,
  dataType,
  autoVerdict,
  terminalG,
  recoveryG,
  pctRecovered,
  incidenceRow,
}: RecoveryVerdictOverrideProps) {
  const actions = useRecoveryOverrideActions(studyId);
  const [open, setOpen] = useState(false);

  const annotation = actions.annotations?.[findingId];
  const isOverridden = annotation != null;
  const effectiveVerdict = isOverridden ? annotation.verdict : autoVerdict;

  // Build transparency line
  const transparencyText =
    dataType === "continuous"
      ? formatContinuousTransparency(terminalG ?? null, recoveryG ?? null, pctRecovered ?? null, autoVerdict)
      : incidenceRow
        ? formatIncidenceTransparency(incidenceRow)
        : "No transparency data";

  function handleSelect(value: string) {
    setOpen(false);
    actions.selectVerdict(findingId, autoVerdict, dataType, value);
  }

  function handleReset() {
    setOpen(false);
    actions.resetVerdict(findingId);
  }

  return (
    <div className="space-y-1">
      {/* Transparency line */}
      <div className="text-[9px] text-muted-foreground leading-snug">
        {transparencyText}
      </div>

      {/* Verdict row */}
      <div
        className={`relative flex items-center gap-1 rounded px-2 py-1 cursor-context-menu ${
          isOverridden ? "bg-violet-100/50 cell-overridable" : ""
        }`}
        onContextMenu={(e) => { e.preventDefault(); setOpen(!open); }}
        title="Right-click to override verdict"
      >
        {/* Override indicator: show both auto and override when overridden */}
        {isOverridden ? (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground line-through">
              {getVerdictLabel(autoVerdict)}
            </span>
            <span className="text-muted-foreground/50">&rarr;</span>
            <span className={RECOVERY_VERDICT_CLASS[effectiveVerdict] ?? "text-foreground"}>
              {getVerdictLabel(effectiveVerdict)}
            </span>
          </div>
        ) : (
          <span className={`text-xs ${RECOVERY_VERDICT_CLASS[effectiveVerdict] ?? "text-foreground"}`}>
            {getVerdictLabel(effectiveVerdict)}
          </span>
        )}

        {/* OverridePill for note entry */}
        <div className="w-3 shrink-0 ml-auto">
          <OverridePill
            isOverridden={isOverridden}
            note={annotation?.note}
            user={annotation?.pathologist}
            timestamp={annotation?.reviewDate ? new Date(annotation.reviewDate).toLocaleDateString() : undefined}
            onSaveNote={(text) => actions.saveNote(findingId, autoVerdict, dataType, text)}
            placeholder="Clinical judgment override rationale"
            popoverSide="top"
            popoverAlign="end"
          />
        </div>

        {/* Dropdown menu */}
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded border border-border bg-background py-1 shadow-md">
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
    </div>
  );
}
