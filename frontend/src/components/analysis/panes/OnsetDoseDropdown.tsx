import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useSaveAnnotation } from "@/hooks/useAnnotations";
import { resolveOnsetDose, formatOnsetDose, onsetNeedsAttention } from "@/lib/onset-dose";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { DoseGroup, UnifiedFinding } from "@/types/analysis";
import { patternToOverrideKey } from "./PatternOverrideDropdown";

interface Props {
  finding: UnifiedFinding;
  doseGroups: DoseGroup[];
}

/** Compute the system-generated onset dose level (ignoring any user override). */
function getSystemOnsetLevel(finding: UnifiedFinding): number | null {
  const override = finding._pattern_override;
  // When override exists, the backend already overwrites finding.onset_dose_level,
  // so use the stored original value instead.
  const algorithmicLevel = override != null
    ? override.original_onset_dose_level
    : finding.onset_dose_level;
  if (algorithmicLevel != null) return algorithmicLevel;
  // Pvalue fallback
  const pw = finding.pairwise;
  if (pw && pw.length > 0) {
    const sorted = [...pw].sort((a, b) => a.dose_level - b.dose_level);
    for (const p of sorted) {
      const pv = p.p_value_adj ?? p.p_value;
      if (pv != null && pv < 0.05) return p.dose_level;
    }
  }
  return null;
}

export function OnsetDoseDropdown({ finding, doseGroups }: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const queryClient = useQueryClient();
  const saveMutation = useSaveAnnotation<{
    pattern: string;
    onset_dose_level: number | null;
    original_pattern?: string;
    original_direction?: string | null;
  }>(studyId, "pattern-overrides");

  const [open, setOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  const treatmentGroups = doseGroups.filter(g => g.dose_level > 0);
  const lowestDoseLevel = treatmentGroups.length > 0 ? treatmentGroups[0].dose_level : 1;

  // Resolve current onset from override → algorithm → pvalue chain
  const onset = resolveOnsetDose(finding);

  // For pattern override: determine current effective pattern key
  const override = finding._pattern_override;
  const effectivePatternKey = override?.pattern
    ?? patternToOverrideKey(finding.dose_response_pattern) ?? "no_change";
  const isDirectional = effectivePatternKey !== "no_change";

  // System-generated onset (what the backend/algorithm produced, before any user override)
  const systemOnsetLevel = getSystemOnsetLevel(finding);

  // Show asterisk when user override differs from system value
  const isOverridden = onset?.source === "override"
    && onset.doseLevel !== systemOnsetLevel;

  // Red border hint: directional override with pending or mismatched onset
  const needsAttention = isDirectional && override != null
    && onsetNeedsAttention(override.pattern, override.onset_dose_level, lowestDoseLevel);

  // Build the override note (stored in annotation as extra field)
  const overrideNote = (override as Record<string, unknown> | undefined)?.onset_note as string | undefined;

  function handleSelect(doseLevel: number) {
    if (!studyId) return;
    setOpen(false);

    const patternKey = override?.pattern ?? patternToOverrideKey(finding.dose_response_pattern) ?? "no_change";
    const originalPattern = override?.original_pattern ?? finding.dose_response_pattern ?? "flat";
    const originalDirection = override?.original_direction ?? finding.direction ?? null;

    // Optimistic update
    queryClient.setQueriesData<{ findings: UnifiedFinding[] }>(
      { queryKey: ["findings", studyId] },
      (old) => {
        if (!old?.findings) return old;
        return {
          ...old,
          findings: old.findings.map((f) =>
            f.id === finding.id
              ? {
                  ...f,
                  _pattern_override: {
                    ...(f._pattern_override ?? {
                      pattern: patternKey,
                      original_pattern: originalPattern,
                      original_direction: originalDirection,
                      original_onset_dose_level: f.onset_dose_level ?? null,
                      timestamp: new Date().toISOString(),
                    }),
                    onset_dose_level: doseLevel,
                  },
                }
              : f,
          ),
        };
      },
    );

    saveMutation.mutate(
      {
        entityKey: finding.id,
        data: {
          pattern: patternKey,
          onset_dose_level: doseLevel,
          original_pattern: originalPattern,
          original_direction: originalDirection,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["findings", studyId] });
        },
      },
    );
  }

  function handleResetOnset() {
    if (!studyId || !override) return;
    setOpen(false);

    queryClient.setQueriesData<{ findings: UnifiedFinding[] }>(
      { queryKey: ["findings", studyId] },
      (old) => {
        if (!old?.findings) return old;
        return {
          ...old,
          findings: old.findings.map((f) =>
            f.id === finding.id && f._pattern_override
              ? {
                  ...f,
                  _pattern_override: {
                    ...f._pattern_override,
                    onset_dose_level: null,
                  },
                }
              : f,
          ),
        };
      },
    );

    saveMutation.mutate(
      {
        entityKey: finding.id,
        data: {
          pattern: override.pattern,
          onset_dose_level: null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["findings", studyId] });
        },
      },
    );
  }

  function handleSaveNote(text: string) {
    if (!studyId) return;
    const patternKey = override?.pattern ?? patternToOverrideKey(finding.dose_response_pattern) ?? "no_change";
    saveMutation.mutate({
      entityKey: finding.id,
      data: {
        pattern: patternKey,
        onset_dose_level: override?.onset_dose_level ?? onset?.doseLevel ?? null,
        onset_note: text || undefined,
      } as Record<string, unknown>,
    });
  }

  const displayLabel = onset
    ? formatOnsetDose(onset.doseLevel, doseGroups)
    : "n.s.";

  const systemOnsetLabel = systemOnsetLevel != null
    ? formatOnsetDose(systemOnsetLevel, doseGroups)
    : null;
  const overrideTooltip = isOverridden && systemOnsetLabel
    ? `Overridden (was: ${systemOnsetLabel})`
    : isOverridden
      ? "Overridden (was: n.s.)"
      : undefined;

  const hasOnsetOverride = onset?.source === "override";

  return (
    <div className="relative">
      {/* Text — flush right, matches non-dropdown cell alignment */}
      <button
        onClick={() => setOpen(!open)}
        className={`block w-full text-right font-mono py-0.5 hover:bg-muted/50 rounded transition-colors ${
          needsAttention ? "border-b-2 border-red-500" : ""
        }`}
        title={needsAttention ? "Onset dose needs selection" : overrideTooltip}
      >
        <span className={onset ? "" : "text-muted-foreground/60"}>{displayLabel}</span>
      </button>
      {/* Asterisk + chevron — absolutely positioned, outside text flow */}
      <span className="absolute right-[-20px] top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {isOverridden ? (
          <Popover open={noteOpen} onOpenChange={(v) => { setNoteOpen(v); if (v) setNoteDraft(overrideNote ?? ""); }}>
            <PopoverTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                className="text-[10px] text-primary/70 hover:text-primary leading-none cursor-pointer"
                title={overrideTooltip}
                onClick={(e) => { e.stopPropagation(); setNoteOpen(true); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setNoteOpen(true); } }}
              >
                *
              </span>
            </PopoverTrigger>
            <PopoverContent align="end" side="top" className="w-56 p-2">
              <div className="mb-1 text-[10px] font-medium text-muted-foreground">Override note</div>
              <textarea
                className="w-full rounded border bg-background px-1.5 py-1 text-[11px] leading-snug placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                rows={2}
                placeholder="e.g., Consistent downward drift from first dose"
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveNote(noteDraft);
                    setNoteOpen(false);
                  }
                }}
              />
              <div className="mt-1 flex justify-end gap-1">
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted"
                  onClick={() => setNoteOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
                  onClick={() => { handleSaveNote(noteDraft); setNoteOpen(false); }}
                >
                  Save
                </button>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
        <ChevronDown
          className="h-2.5 w-2.5 text-muted-foreground/40 cursor-pointer"
          onClick={() => setOpen(!open)}
        />
      </span>

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
                  disabled={saveMutation.isPending}
                  className={`flex w-full items-center px-3 py-1 text-left text-[10px] transition-colors ${
                    onset && g.dose_level === onset.doseLevel
                      ? "bg-muted/50 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <span>{formatOnsetDose(g.dose_level, doseGroups)}</span>
                  {isSystem && hasOnsetOverride && (
                    <span className="ml-auto text-[9px] text-muted-foreground/50">system</span>
                  )}
                </button>
              );
            })}
            {hasOnsetOverride && (
              <button
                onClick={handleResetOnset}
                disabled={saveMutation.isPending}
                className="flex w-full items-center px-3 py-1 text-left text-[10px] text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-colors border-t border-border/40"
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
