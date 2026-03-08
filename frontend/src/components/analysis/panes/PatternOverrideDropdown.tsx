import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Pencil } from "lucide-react";
import { useSaveAnnotation } from "@/hooks/useAnnotations";
import type { UnifiedFinding } from "@/types/analysis";
import { PatternGlyph } from "@/components/ui/PatternGlyph";

// Direction-independent override options (matches backend VALID_PATTERN_OVERRIDES)
const OVERRIDE_OPTIONS = [
  { value: "no_change", label: "No change" },
  { value: "monotonic", label: "Monotonic" },
  { value: "threshold", label: "Threshold" },
  { value: "non_monotonic", label: "Non-monotonic" },
  { value: "u_shaped", label: "U-shaped" },
] as const;

// Map direction-independent override to the pattern string used by PatternGlyph
function overrideToGlyphPattern(override: string, direction: string | null): string {
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
function patternToOverrideKey(pattern: string | null): string | null {
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
  }>(studyId, "pattern-overrides");

  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const override = finding._pattern_override;
  const hasOverride = !!override;

  // Current effective pattern (override or algorithmic)
  const currentOverrideKey = hasOverride
    ? override.pattern
    : patternToOverrideKey(finding.dose_response_pattern);

  // Original algorithmic pattern (for tooltip)
  const originalPattern = hasOverride
    ? override.original_pattern
    : finding.dose_response_pattern;

  const direction = finding.direction ?? null;

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

    // Optimistically update the finding's pattern in the findings cache
    const resolvedPattern = overrideToGlyphPattern(value, direction);
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
        },
      },
      {
        onSuccess: () => {
          // Background invalidation to sync full re-derivation (TR, ECETOC, confidence)
          queryClient.invalidateQueries({ queryKey: ["findings", studyId] });
        },
      },
    );
  }

  const currentLabel = OVERRIDE_OPTIONS.find(o => o.value === currentOverrideKey)?.label
    ?? finding.dose_response_pattern ?? "—";

  // Build preview text
  const previewText = (() => {
    if (!preview) return null;
    const parts: string[] = [];
    if (preview.treatment_related.changed) {
      parts.push(preview.treatment_related.proposed ? "→ TR" : "→ Not TR");
    }
    if (preview.finding_class.changed) {
      parts.push(CLASS_LABELS[preview.finding_class.proposed] ?? preview.finding_class.proposed);
    }
    if (parts.length === 0) return null;
    return parts.join(" · ");
  })();

  return (
    <div className="relative inline-flex items-center gap-1">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/50 transition-colors"
        title={hasOverride ? `Overridden (was: ${originalPattern})` : "Click to override pattern"}
      >
        <PatternGlyph
          pattern={hasOverride
            ? overrideToGlyphPattern(override.pattern, direction)
            : (finding.dose_response_pattern ?? "flat")}
          className="text-muted-foreground"
        />
        <span>{currentLabel}</span>
        {hasOverride ? (
          <Pencil className="h-2.5 w-2.5 text-muted-foreground/60" />
        ) : (
          <ChevronDown className="h-2.5 w-2.5 text-muted-foreground/40" />
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* Dropdown */}
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded border border-border bg-background py-1 shadow-md">
            {OVERRIDE_OPTIONS.map((opt) => {
              const isActive = opt.value === currentOverrideKey;
              const glyphPattern = overrideToGlyphPattern(opt.value, direction);
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
                  <PatternGlyph pattern={glyphPattern} className="text-muted-foreground" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
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
