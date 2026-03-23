import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { OverridePill } from "@/components/ui/OverridePill";
import type { UnifiedFinding } from "@/types/analysis";
import {
  usePatternOverrideActions,
  derivePatternState,
  buildPreviewText,
  OVERRIDE_OPTIONS,
} from "@/hooks/usePatternOverrideActions";
import type { PreviewResult } from "@/hooks/usePatternOverrideActions";

// Re-export for consumers that import from this file
export { patternToOverrideKey } from "@/hooks/usePatternOverrideActions";

interface Props {
  finding: UnifiedFinding;
}

export function PatternOverrideDropdown({ finding }: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const actions = usePatternOverrideActions(studyId);

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const state = derivePatternState(finding, actions.annotations);

  // Fetch preview when hovering a non-current option
  useEffect(() => {
    if (!hoveredOption || hoveredOption === state.currentOverrideKey) {
      setPreview(null);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    actions.fetchPreview(finding.id, hoveredOption, ac.signal)
      .then(result => { if (result && !ac.signal.aborted) setPreview(result); });
    return () => { ac.abort(); };
  }, [hoveredOption, state.currentOverrideKey, finding.id, actions]);

  // Clear preview when dropdown closes
  useEffect(() => {
    if (!open) { setPreview(null); setHoveredOption(null); }
  }, [open]);

  function handleSelect(value: string) {
    setOpen(false);
    actions.selectPattern(finding, value);
  }

  function handleReset() {
    setOpen(false);
    actions.resetPattern(finding);
  }

  const previewText = buildPreviewText(preview);

  return (
    <div className="relative flex items-center gap-0.5">
      <button
        onClick={() => setOpen(!open)}
        className="flex-1 text-right font-mono py-0.5 text-muted-foreground hover:bg-muted/50 rounded transition-colors"
        title={state.patternChanged
          ? `Overridden (was: ${state.originalLabel ?? state.originalPattern})`
          : "Click to override pattern"}
      >
        {state.currentLabel}
      </button>
      <div className="w-3 shrink-0">
        <OverridePill
          isOverridden={state.patternChanged}
          note={state.annotation?.pattern_note}
          user={state.annotation?.pathologist}
          timestamp={state.annotation?.reviewDate ? new Date(state.annotation.reviewDate).toLocaleDateString() : undefined}
          onSaveNote={(text) => actions.savePatternNote(finding, text)}
          placeholder="Consistent downward drift from first dose"
          popoverSide="top"
          popoverAlign="end"
        />
      </div>
      <ChevronDown
        className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40 cursor-pointer"
        onClick={() => setOpen(!open)}
      />

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded border border-border bg-background py-1 shadow-md">
            {OVERRIDE_OPTIONS.map((opt) => {
              const isActive = opt.value === state.currentOverrideKey;
              const isSystem = opt.value === state.originalKey;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => setHoveredOption(opt.value)}
                  disabled={actions.isPending}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                    isActive
                      ? "bg-muted/50 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSystem && state.patternChanged && (
                    <span className="ml-auto text-[11px] text-muted-foreground/50">system</span>
                  )}
                </button>
              );
            })}
            {state.patternChanged && (
              <button
                onClick={handleReset}
                disabled={actions.isPending}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-colors border-t border-border/40"
              >
                Reset to system
              </button>
            )}
            {previewText && (
              <div className="border-t border-border/40 px-3 py-1.5 text-[11px] text-muted-foreground">
                {previewText}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
