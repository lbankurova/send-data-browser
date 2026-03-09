import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { useSaveAnnotation } from "@/hooks/useAnnotations";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import type { UnifiedFinding } from "@/types/analysis";
import { defaultOnsetForPattern } from "@/lib/onset-dose";

// Direction-independent override options (matches backend VALID_PATTERN_OVERRIDES)
const OVERRIDE_OPTIONS = [
  { value: "no_change", label: "No change" },
  { value: "monotonic", label: "Monotonic" },
  { value: "threshold", label: "Threshold" },
  { value: "non_monotonic", label: "Non-monotonic" },
  { value: "u_shaped", label: "U-shaped" },
] as const;

/** Map direction-independent override key to the full backend pattern string. */
function overrideToFullPattern(override: string, direction: string | null): string {
  switch (override) {
    case "no_change": return "flat";
    case "monotonic": return direction === "up" ? "monotonic_increase" : "monotonic_decrease";
    case "threshold": return direction === "up" ? "threshold_increase" : "threshold_decrease";
    case "non_monotonic": return "non_monotonic";
    case "u_shaped": return "u_shaped";
    default: return "flat";
  }
}

/** Map a backend pattern string to the direction-independent override key. */
export function patternToOverrideKey(pattern: string | null): string | null {
  if (!pattern) return null;
  if (pattern === "flat") return "no_change";
  if (pattern.startsWith("monotonic")) return "monotonic";
  if (pattern.startsWith("threshold")) return "threshold";
  if (pattern === "non_monotonic") return "non_monotonic";
  if (pattern === "u_shaped") return "u_shaped";
  return null;
}

const CLASS_LABELS: Record<string, string> = {
  not_treatment_related: "Not TR",
  tr_non_adverse: "TR non-adverse",
  tr_adaptive: "TR adaptive",
  tr_adverse: "TR adverse",
  equivocal: "Equivocal",
};

const PATTERN_LABELS: Record<string, string> = {
  flat: "No change",
  monotonic_increase: "Monotonic",
  monotonic_decrease: "Monotonic",
  threshold_increase: "Threshold",
  threshold_decrease: "Threshold",
  non_monotonic: "Non-monotonic",
  u_shaped: "U-shaped",
};

interface PreviewResult {
  treatment_related: { original: boolean; proposed: boolean; changed: boolean };
  finding_class: { original: string; proposed: string; changed: boolean };
}

interface Props {
  finding: UnifiedFinding;
}

export function PatternOverrideDropdown({ finding }: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const queryClient = useQueryClient();
  const saveMutation = useSaveAnnotation<{
    pattern: string;
    original_pattern: string;
    original_direction: string | null;
    onset_dose_level?: number | null;
  }>(studyId, "pattern-overrides");

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const override = finding._pattern_override;
  const hasOverride = !!override;

  // Current effective pattern (override or algorithmic)
  const currentOverrideKey = hasOverride
    ? override.pattern
    : patternToOverrideKey(finding.dose_response_pattern);

  // Original algorithmic pattern (for tooltip/reset)
  const originalPattern = hasOverride
    ? override.original_pattern
    : finding.dose_response_pattern;

  // Has the pattern actually been changed from algorithmic?
  const originalKey = patternToOverrideKey(originalPattern);
  const patternChanged = hasOverride && override.pattern !== originalKey;

  const direction = finding.direction ?? null;

  // Override note (stored in annotation)
  const overrideNote = (override as Record<string, unknown> | undefined)?.pattern_note as string | undefined;

  // Fetch preview when hovering a non-current option
  const fetchPreview = useCallback(async (proposedPattern: string) => {
    if (!studyId) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch(
        `/api/studies/${encodeURIComponent(studyId)}/analyses/pattern-override-preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ finding_id: finding.id, proposed_pattern: proposedPattern }),
          signal: ac.signal,
        },
      );
      if (!res.ok || ac.signal.aborted) return;
      const data = await res.json();
      if (!ac.signal.aborted) setPreview(data);
    } catch {
      // aborted or network error — ignore
    }
  }, [studyId, finding.id]);

  useEffect(() => {
    if (!hoveredOption || hoveredOption === currentOverrideKey) {
      setPreview(null);
      return;
    }
    fetchPreview(hoveredOption);
    return () => { abortRef.current?.abort(); };
  }, [hoveredOption, currentOverrideKey, fetchPreview]);

  // Clear preview when dropdown closes
  useEffect(() => {
    if (!open) {
      setPreview(null);
      setHoveredOption(null);
    }
  }, [open]);

  function handleSelect(value: string) {
    if (!studyId) return;
    setOpen(false);

    // Determine onset_dose_level for the new pattern
    const prevOverrideKey = currentOverrideKey;
    const prevIsDirectional = prevOverrideKey != null && prevOverrideKey !== "no_change";
    const newIsDirectional = value !== "no_change";
    const currentOnset = override?.onset_dose_level ?? null;

    let onsetDoseLevel: number | null = null;
    if (!newIsDirectional) {
      onsetDoseLevel = null;
    } else if (prevIsDirectional && currentOnset != null) {
      onsetDoseLevel = currentOnset;
    } else {
      onsetDoseLevel = defaultOnsetForPattern(value);
    }

    // Optimistically update the finding's pattern in the findings cache
    const resolvedPattern = overrideToFullPattern(value, direction);
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
                  dose_response_pattern: resolvedPattern,
                  _pattern_override: {
                    pattern: value,
                    original_pattern: originalPattern ?? "flat",
                    original_direction: direction,
                    onset_dose_level: onsetDoseLevel,
                    original_onset_dose_level: override?.original_onset_dose_level ?? f.onset_dose_level ?? null,
                    timestamp: new Date().toISOString(),
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
          pattern: value,
          original_pattern: originalPattern ?? "flat",
          original_direction: direction,
          onset_dose_level: onsetDoseLevel,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["findings", studyId] });
        },
      },
    );
  }

  function handleReset() {
    if (!studyId || !hasOverride) return;
    setOpen(false);

    // Restore algorithmic pattern — remove override from annotation
    queryClient.setQueriesData<{ findings: UnifiedFinding[] }>(
      { queryKey: ["findings", studyId] },
      (old) => {
        if (!old?.findings) return old;
        return {
          ...old,
          findings: old.findings.map((f) =>
            f.id === finding.id
              ? { ...f, _pattern_override: undefined }
              : f,
          ),
        };
      },
    );

    // Save the original pattern back (effectively clearing the override)
    const origKey = patternToOverrideKey(originalPattern) ?? "no_change";
    saveMutation.mutate(
      {
        entityKey: finding.id,
        data: {
          pattern: origKey,
          original_pattern: originalPattern ?? "flat",
          original_direction: direction,
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
    saveMutation.mutate({
      entityKey: finding.id,
      data: {
        pattern: override?.pattern ?? patternToOverrideKey(finding.dose_response_pattern) ?? "no_change",
        original_pattern: originalPattern ?? "flat",
        original_direction: direction,
        pattern_note: text || undefined,
      } as Record<string, unknown>,
    });
  }

  const currentLabel = OVERRIDE_OPTIONS.find(o => o.value === currentOverrideKey)?.label
    ?? finding.dose_response_pattern ?? "\u2014";

  // Original pattern label for tooltip
  const originalLabel = originalPattern
    ? (PATTERN_LABELS[originalPattern] ?? originalPattern)
    : null;

  // Build preview text
  const previewText = (() => {
    if (!preview) return null;
    const parts: string[] = [];
    if (preview.treatment_related.changed) {
      parts.push(preview.treatment_related.proposed ? "\u2192 TR" : "\u2192 Not TR");
    }
    if (preview.finding_class.changed) {
      parts.push(CLASS_LABELS[preview.finding_class.proposed] ?? preview.finding_class.proposed);
    }
    if (parts.length === 0) return null;
    return parts.join(" \u00b7 ");
  })();

  return (
    <div className="relative">
      {/* Text — flush right, matches non-dropdown cell alignment */}
      <button
        onClick={() => setOpen(!open)}
        className="block w-full text-right font-mono py-0.5 text-muted-foreground hover:bg-muted/50 rounded transition-colors"
        title={patternChanged
          ? `Overridden (was: ${originalLabel ?? originalPattern})`
          : "Click to override pattern"}
      >
        {currentLabel}
      </button>
      {/* Asterisk + chevron — absolutely positioned, outside text flow */}
      <span className="absolute right-[-20px] top-1/2 -translate-y-1/2 flex items-center gap-0.5">
        {patternChanged ? (
          <Popover open={noteOpen} onOpenChange={(v) => { setNoteOpen(v); if (v) setNoteDraft(overrideNote ?? ""); }}>
            <PopoverTrigger asChild>
              <span
                role="button"
                tabIndex={0}
                className="text-[10px] text-primary/70 hover:text-primary leading-none cursor-pointer"
                title={`Overridden (was: ${originalLabel ?? originalPattern})`}
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
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded border border-border bg-background py-1 shadow-md">
            {OVERRIDE_OPTIONS.map((opt) => {
              const isActive = opt.value === currentOverrideKey;
              const isSystem = opt.value === originalKey;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => setHoveredOption(opt.value)}
                  disabled={saveMutation.isPending}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors ${
                    isActive
                      ? "bg-muted/50 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSystem && patternChanged && (
                    <span className="ml-auto text-[9px] text-muted-foreground/50">system</span>
                  )}
                </button>
              );
            })}
            {/* Reset to system value */}
            {patternChanged && (
              <button
                onClick={handleReset}
                disabled={saveMutation.isPending}
                className="flex w-full items-center px-3 py-1.5 text-left text-[11px] text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-colors border-t border-border/40"
              >
                Reset to system
              </button>
            )}
            {/* Inline preview */}
            {previewText && (
              <div className="border-t border-border/40 px-3 py-1.5 text-[9px] text-muted-foreground">
                {previewText}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
