/**
 * Shared hook for pattern and onset dose override actions.
 *
 * Consolidates annotation CRUD, optimistic cache updates, and preview logic
 * so that both the context panel dropdowns and the findings table context menus
 * share the same mutation path and annotation store ("pattern-overrides").
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAnnotations, useSaveAnnotation, useDeleteAnnotation } from "@/hooks/useAnnotations";
import { defaultOnsetForPattern, resolveOnsetDose, formatOnsetDose, onsetNeedsAttention } from "@/lib/onset-dose";
import type { OnsetResult } from "@/lib/onset-dose";
import type { UnifiedFinding, DoseGroup } from "@/types/analysis";

// ── Shared types & constants ──────────────────────────────────

export interface PatternAnnotation {
  pattern: string;
  original_pattern: string;
  original_direction: string | null;
  onset_dose_level?: number | null;
  original_onset_dose_level?: number | null;
  pattern_note?: string;
  onset_note?: string;
  pathologist?: string;
  reviewDate?: string;
}

export const OVERRIDE_OPTIONS = [
  { value: "no_change", label: "No change" },
  { value: "monotonic", label: "Monotonic" },
  { value: "threshold", label: "Threshold" },
  { value: "non_monotonic", label: "Non-monotonic" },
  { value: "u_shaped", label: "U-shaped" },
] as const;

export const PATTERN_LABELS: Record<string, string> = {
  flat: "No change",
  monotonic_increase: "Monotonic \u2191",
  monotonic_decrease: "Monotonic \u2193",
  threshold_increase: "Threshold \u2191",
  threshold_decrease: "Threshold \u2193",
  non_monotonic: "Non-monotonic",
  u_shaped: "U-shaped",
};

const CLASS_LABELS: Record<string, string> = {
  not_treatment_related: "Not TR",
  tr_non_adverse: "TR non-adverse",
  tr_adaptive: "TR adaptive",
  tr_adverse: "TR adverse",
  equivocal: "Equivocal",
};

/** Map direction-independent override key to the full backend pattern string. */
export function overrideToFullPattern(override: string, direction: string | null): string {
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

/** Compute the system-generated onset dose level (ignoring any user override). */
export function getSystemOnsetLevel(finding: UnifiedFinding): number | null {
  const override = finding._pattern_override;
  const algorithmicLevel = override != null
    ? override.original_onset_dose_level
    : finding.onset_dose_level;
  if (algorithmicLevel != null) return algorithmicLevel;
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

// ── Preview result type ───────────────────────────────────────

export interface PreviewResult {
  treatment_related: { original: boolean; proposed: boolean; changed: boolean };
  finding_class: { original: string; proposed: string; changed: boolean };
}

export function buildPreviewText(preview: PreviewResult | null): string | null {
  if (!preview) return null;
  const parts: string[] = [];
  if (preview.treatment_related.changed) {
    parts.push(preview.treatment_related.proposed ? "\u2192 TR" : "\u2192 Not TR");
  }
  if (preview.finding_class.changed) {
    parts.push(CLASS_LABELS[preview.finding_class.proposed] ?? preview.finding_class.proposed);
  }
  return parts.length > 0 ? parts.join(" \u00b7 ") : null;
}

// ── Derived state helpers (pure functions) ────────────────────

export interface PatternOverrideState {
  currentOverrideKey: string | null;
  originalKey: string | null;
  originalPattern: string | null;
  patternChanged: boolean;
  hasOverride: boolean;
  direction: string | null;
  currentLabel: string;
  originalLabel: string | null;
  annotation: PatternAnnotation | undefined;
}

export function derivePatternState(
  finding: UnifiedFinding,
  annotations: Record<string, PatternAnnotation> | undefined,
): PatternOverrideState {
  const override = finding._pattern_override;
  const hasOverride = !!override;
  const currentOverrideKey = hasOverride
    ? override.pattern
    : patternToOverrideKey(finding.dose_response_pattern);
  const originalPattern = hasOverride
    ? override.original_pattern
    : finding.dose_response_pattern;
  const originalKey = patternToOverrideKey(originalPattern);
  const patternChanged = hasOverride && originalKey != null && override.pattern !== originalKey;
  const direction = finding.direction ?? null;
  const annotation = annotations?.[finding.id];

  const base = OVERRIDE_OPTIONS.find(o => o.value === currentOverrideKey)?.label
    ?? finding.dose_response_pattern ?? "\u2014";
  let currentLabel = base;
  if (direction === "up" && (currentOverrideKey === "monotonic" || currentOverrideKey === "threshold")) currentLabel = `${base} \u2191`;
  if (direction === "down" && (currentOverrideKey === "monotonic" || currentOverrideKey === "threshold")) currentLabel = `${base} \u2193`;

  const originalLabel = originalPattern
    ? (PATTERN_LABELS[originalPattern] ?? originalPattern)
    : null;

  return {
    currentOverrideKey,
    originalKey,
    originalPattern,
    patternChanged,
    hasOverride,
    direction,
    currentLabel,
    originalLabel,
    annotation,
  };
}

export interface OnsetOverrideState {
  onset: OnsetResult | null;
  systemOnsetLevel: number | null;
  isOverridden: boolean;
  needsAttention: boolean;
  displayLabel: string;
  overrideTooltip: string | undefined;
  annotation: PatternAnnotation | undefined;
}

export function deriveOnsetState(
  finding: UnifiedFinding,
  doseGroups: DoseGroup[],
  annotations: Record<string, PatternAnnotation> | undefined,
): OnsetOverrideState {
  const onset = resolveOnsetDose(finding);
  const override = finding._pattern_override;
  const effectivePatternKey = override?.pattern
    ?? patternToOverrideKey(finding.dose_response_pattern) ?? "no_change";
  const isDirectional = effectivePatternKey !== "no_change";
  const systemOnsetLevel = getSystemOnsetLevel(finding);
  const treatmentGroups = doseGroups.filter(g => g.dose_level > 0);
  const lowestDoseLevel = treatmentGroups.length > 0 ? treatmentGroups[0].dose_level : 1;

  const isOverridden = onset?.source === "override"
    && onset.doseLevel !== systemOnsetLevel;
  const needsAttention = isDirectional && override != null
    && onsetNeedsAttention(override.pattern, override.onset_dose_level, lowestDoseLevel);

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

  const annotation = annotations?.[finding.id];

  return { onset, systemOnsetLevel, isOverridden, needsAttention, displayLabel, overrideTooltip, annotation };
}

// ── The hook ──────────────────────────────────────────────────

export function usePatternOverrideActions(studyId: string | undefined) {
  const queryClient = useQueryClient();
  const { data: annotations } = useAnnotations<PatternAnnotation>(studyId, "pattern-overrides");
  const saveMutation = useSaveAnnotation<PatternAnnotation>(studyId, "pattern-overrides");
  const deleteMutation = useDeleteAnnotation(studyId, "pattern-overrides");

  const selectPattern = useCallback((finding: UnifiedFinding, value: string) => {
    if (!studyId) return;
    const override = finding._pattern_override;
    const hasOverride = !!override;
    const originalPattern = hasOverride ? override.original_pattern : finding.dose_response_pattern;
    const direction = finding.direction ?? null;

    // If selecting the original pattern, treat as reset
    const origKey = patternToOverrideKey(originalPattern ?? finding.dose_response_pattern);
    if (value === origKey && hasOverride) {
      resetPattern(finding);
      return;
    }
    if (value === origKey && !hasOverride) return;

    // Determine onset_dose_level for the new pattern
    const currentOverrideKey = hasOverride
      ? override.pattern
      : patternToOverrideKey(finding.dose_response_pattern);
    const prevIsDirectional = currentOverrideKey != null && currentOverrideKey !== "no_change";
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
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["findings", studyId] }); } },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId, queryClient, saveMutation]);

  const resetPattern = useCallback((finding: UnifiedFinding) => {
    if (!studyId || !finding._pattern_override) return;
    queryClient.setQueriesData<{ findings: UnifiedFinding[] }>(
      { queryKey: ["findings", studyId] },
      (old) => {
        if (!old?.findings) return old;
        return {
          ...old,
          findings: old.findings.map((f) =>
            f.id === finding.id ? { ...f, _pattern_override: undefined } : f,
          ),
        };
      },
    );
    deleteMutation.mutate(finding.id, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["findings", studyId] }); },
    });
  }, [studyId, queryClient, deleteMutation]);

  const savePatternNote = useCallback((finding: UnifiedFinding, text: string) => {
    if (!studyId) return;
    const override = finding._pattern_override;
    const originalPattern = override?.original_pattern ?? finding.dose_response_pattern;
    const direction = finding.direction ?? null;
    queryClient.setQueryData<Record<string, PatternAnnotation>>(
      ["annotations", studyId, "pattern-overrides"],
      (old) => {
        const next = { ...(old ?? {}) };
        if (text) {
          next[finding.id] = { ...next[finding.id], pattern_note: text };
        } else if (next[finding.id]) {
          const { pattern_note: _, ...rest } = next[finding.id];
          next[finding.id] = rest as PatternAnnotation;
        }
        return next;
      },
    );
    saveMutation.mutate({
      entityKey: finding.id,
      data: {
        pattern: override?.pattern ?? patternToOverrideKey(finding.dose_response_pattern) ?? "no_change",
        original_pattern: originalPattern ?? "flat",
        original_direction: direction,
        pattern_note: text,
      } as Partial<PatternAnnotation>,
    });
  }, [studyId, queryClient, saveMutation]);

  const selectOnset = useCallback((finding: UnifiedFinding, doseLevel: number) => {
    if (!studyId) return;
    const override = finding._pattern_override;
    const patternKey = override?.pattern ?? patternToOverrideKey(finding.dose_response_pattern) ?? "no_change";
    const originalPattern = override?.original_pattern ?? finding.dose_response_pattern ?? "flat";
    const originalDirection = override?.original_direction ?? finding.direction ?? null;

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
        data: { pattern: patternKey, onset_dose_level: doseLevel, original_pattern: originalPattern, original_direction: originalDirection },
      },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["findings", studyId] }); } },
    );
  }, [studyId, queryClient, saveMutation]);

  const resetOnset = useCallback((finding: UnifiedFinding) => {
    if (!studyId || !finding._pattern_override) return;
    const override = finding._pattern_override;
    queryClient.setQueriesData<{ findings: UnifiedFinding[] }>(
      { queryKey: ["findings", studyId] },
      (old) => {
        if (!old?.findings) return old;
        return {
          ...old,
          findings: old.findings.map((f) =>
            f.id === finding.id && f._pattern_override
              ? { ...f, _pattern_override: { ...f._pattern_override, onset_dose_level: null } }
              : f,
          ),
        };
      },
    );
    saveMutation.mutate(
      { entityKey: finding.id, data: { pattern: override.pattern, onset_dose_level: null } },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["findings", studyId] }); } },
    );
  }, [studyId, queryClient, saveMutation]);

  const saveOnsetNote = useCallback((finding: UnifiedFinding, text: string) => {
    if (!studyId) return;
    const override = finding._pattern_override;
    const onset = resolveOnsetDose(finding);
    queryClient.setQueryData<Record<string, PatternAnnotation>>(
      ["annotations", studyId, "pattern-overrides"],
      (old) => {
        const next = { ...(old ?? {}) };
        if (text) {
          next[finding.id] = { ...next[finding.id], onset_note: text };
        } else if (next[finding.id]) {
          const { onset_note: _, ...rest } = next[finding.id];
          next[finding.id] = rest as PatternAnnotation;
        }
        return next;
      },
    );
    saveMutation.mutate({
      entityKey: finding.id,
      data: {
        pattern: override?.pattern ?? patternToOverrideKey(finding.dose_response_pattern) ?? "no_change",
        onset_dose_level: override?.onset_dose_level ?? onset?.doseLevel ?? null,
        onset_note: text,
      } as Partial<PatternAnnotation>,
    });
  }, [studyId, queryClient, saveMutation]);

  const fetchPreview = useCallback(async (findingId: string, proposedPattern: string, signal: AbortSignal): Promise<PreviewResult | null> => {
    if (!studyId) return null;
    try {
      const res = await fetch(
        `/api/studies/${encodeURIComponent(studyId)}/analyses/pattern-override-preview`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ finding_id: findingId, proposed_pattern: proposedPattern }),
          signal,
        },
      );
      if (!res.ok || signal.aborted) return null;
      return await res.json() as PreviewResult;
    } catch {
      return null;
    }
  }, [studyId]);

  return {
    annotations,
    isPending: saveMutation.isPending || deleteMutation.isPending,
    selectPattern,
    resetPattern,
    savePatternNote,
    selectOnset,
    resetOnset,
    saveOnsetNote,
    fetchPreview,
  };
}
