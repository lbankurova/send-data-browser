/**
 * Compact NOAEL determination pane for the FindingsContextPanel.
 * Replaces the full-width NoaelBanner with a context-panel-sized summary.
 * Override via right-click on dose values (violet tint pattern).
 */
import { useState, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { CollapsiblePane } from "../panes/CollapsiblePane";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDoseShortLabel } from "@/lib/severity-colors";
import { computeConfidenceBreakdown } from "@/lib/rule-definitions";
import { generateNoaelNarrative } from "@/lib/noael-narrative";
import { useEffectiveNoael } from "@/hooks/useEffectiveNoael";
import { usePkIntegration } from "@/hooks/usePkIntegration";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import type { NoaelOverride } from "@/types/annotations";
import type { NoaelSummaryRow, AdverseEffectSummaryRow } from "@/types/analysis-views";
import { ExposureSection } from "./ExposureSection";

interface Props {
  aeData: AdverseEffectSummaryRow[];
  expandAll: number;
  collapseAll: number;
}

export function NoaelDeterminationPane({ aeData, expandAll, collapseAll }: Props) {
  const { studyId } = useParams<{ studyId: string }>();
  const { data: noaelData } = useEffectiveNoael(studyId);
  const { data: pkData } = usePkIntegration(studyId);
  const { data: overrideAnnotations } = useAnnotations<NoaelOverride>(studyId, "noael-overrides");
  const saveMutation = useSaveAnnotation<NoaelOverride>(studyId, "noael-overrides");

  const [narrativeExpanded, setNarrativeExpanded] = useState(false);
  const [confidenceExpanded, setConfidenceExpanded] = useState(false);

  // Dose options for override dropdown
  const doseOptions = useMemo(() => {
    const seen = new Map<number, string>();
    for (const r of aeData) {
      if (!seen.has(r.dose_level)) {
        seen.set(r.dose_level, r.dose_label);
      }
    }
    return Array.from(seen.entries())
      .sort(([a], [b]) => a - b)
      .map(([level, label]) => ({ level, label }));
  }, [aeData]);

  if (!noaelData || noaelData.length === 0) return null;

  const combined = noaelData.find((r) => r.sex === "Combined");
  const males = noaelData.find((r) => r.sex === "M");
  const females = noaelData.find((r) => r.sex === "F");
  const sexDivergent = males && females && males.noael_dose_level !== females.noael_dose_level;

  // Narrative
  const primaryRow = combined ?? males ?? females;
  const narrative = primaryRow ? generateNoaelNarrative(primaryRow, aeData, primaryRow.sex as "Combined" | "M" | "F") : null;

  // Confidence breakdown
  const confidenceBreakdown = primaryRow ? computeConfidenceBreakdown(primaryRow, noaelData) : null;

  return (
    <CollapsiblePane title="NOAEL determination" defaultOpen expandAll={expandAll} collapseAll={collapseAll}>
      {/* Per-sex rows */}
      <div className="space-y-1">
        {[combined, males, females].filter(Boolean).map((row) => (
          <NoaelSexRow
            key={row!.sex}
            row={row!}
            override={overrideAnnotations?.[`noael:${row!.sex}`]}
            doseOptions={doseOptions}
            onSave={(data) => saveMutation.mutate({ entityKey: `noael:${row!.sex}`, data })}
          />
        ))}
      </div>

      {/* LOAEL summary */}
      {primaryRow && primaryRow.loael_label && (
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          LOAEL: {formatDoseShortLabel(primaryRow.loael_label)} &middot; {primaryRow.n_adverse_at_loael} adverse finding{primaryRow.n_adverse_at_loael !== 1 ? "s" : ""}
        </div>
      )}

      {/* Expandable narrative */}
      {narrative && (
        <div className="mt-1.5">
          <div className={cn("text-[11px] leading-relaxed text-foreground/80", !narrativeExpanded && "line-clamp-2")}>
            {sexDivergent ? (
              <>
                <span className="font-medium">M:</span> {generateNoaelNarrative(males!, aeData, "M").summary}{" "}
                <span className="font-medium">F:</span> {generateNoaelNarrative(females!, aeData, "F").summary}
              </>
            ) : (
              narrative.summary
            )}
          </div>
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => setNarrativeExpanded((v) => !v)}
          >
            {narrativeExpanded ? "Show less" : "Show more"}
          </button>
        </div>
      )}

      {/* Expandable confidence breakdown */}
      {confidenceBreakdown && (
        <div className="mt-1.5">
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => setConfidenceExpanded((v) => !v)}
          >
            {confidenceExpanded ? "Hide confidence breakdown" : "Confidence breakdown"}
          </button>
          {confidenceExpanded && (
            <div className="mt-1 space-y-0.5 text-[11px] font-mono tabular-nums">
              <div className="flex justify-between">
                <span>Base</span>
                <span>{confidenceBreakdown.base.toFixed(2)}</span>
              </div>
              {confidenceBreakdown.singleEndpointPenalty !== 0 && (
                <PenaltyRow label="Single endpoint" value={confidenceBreakdown.singleEndpointPenalty} detail={confidenceBreakdown.singleEndpointDetail} />
              )}
              {confidenceBreakdown.sexInconsistencyPenalty !== 0 && (
                <PenaltyRow label="Sex inconsistency" value={confidenceBreakdown.sexInconsistencyPenalty} detail={confidenceBreakdown.sexInconsistencyDetail} />
              )}
              {confidenceBreakdown.pathologyPenalty !== 0 && (
                <PenaltyRow label="Pathology disagreement" value={confidenceBreakdown.pathologyPenalty} detail={confidenceBreakdown.pathologyDetail} />
              )}
              {confidenceBreakdown.largeEffectPenalty !== 0 && (
                <PenaltyRow label="Large effect non-sig" value={confidenceBreakdown.largeEffectPenalty} detail={confidenceBreakdown.largeEffectDetail} />
              )}
              <div className="flex justify-between border-t pt-1 font-semibold">
                <span>Confidence</span>
                <span>{confidenceBreakdown.total.toFixed(2)} ({Math.round(confidenceBreakdown.total * 100)}%)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* PK exposure (conditional) */}
      {pkData?.available && (pkData.noael_exposure || pkData.loael_exposure) && (
        <div className="mt-2 border-t pt-2">
          <ExposureSection pkData={pkData} />
        </div>
      )}
    </CollapsiblePane>
  );
}

// ─── Per-sex NOAEL row with right-click override ────────────────────────────

function NoaelSexRow({
  row,
  override,
  doseOptions,
  onSave,
}: {
  row: NoaelSummaryRow;
  override?: NoaelOverride;
  doseOptions: { level: number; label: string }[];
  onSave: (data: NoaelOverride) => void;
}) {
  const [open, setOpen] = useState(false);
  const [overrideDose, setOverrideDose] = useState("");
  const [overrideRationale, setOverrideRationale] = useState("");

  const established = row.noael_dose_value != null;
  const sexLabel = row.sex === "Combined" ? "Combined" : row.sex === "M" ? "Males" : "Females";
  const doseDisplay = override
    ? override.override_dose_value
    : row.noael_dose_value != null
      ? `${row.noael_dose_value} ${row.noael_dose_unit}`
      : "Not established";

  const handleOpen = useCallback(() => {
    setOverrideDose(override?.override_dose_value ?? `${row.noael_dose_value} ${row.noael_dose_unit}`);
    setOverrideRationale(override?.rationale ?? "");
    setOpen(true);
  }, [override, row]);

  const handleSave = useCallback(() => {
    if (!overrideRationale.trim()) return;
    const selectedOption = doseOptions.find((d) => d.label === overrideDose);
    const isNotEstablished = overrideDose === "Not established";
    const currentDoseValue = `${row.noael_dose_value} ${row.noael_dose_unit}`;
    const overrideType: NoaelOverride["override_type"] =
      isNotEstablished ? "not_established"
      : overrideDose === currentDoseValue ? "agree"
      : (selectedOption?.level ?? 0) > row.noael_dose_level ? "higher"
      : "lower";
    onSave({
      sex: row.sex as NoaelOverride["sex"],
      override_dose_level: selectedOption?.level ?? null,
      override_dose_value: overrideDose,
      override_type: overrideType,
      rationale: overrideRationale.trim(),
      timestamp: new Date().toISOString(),
    });
    setOpen(false);
  }, [overrideDose, overrideRationale, doseOptions, row, onSave]);

  const confidenceColor = row.noael_confidence >= 0.8 ? "text-green-700"
    : row.noael_confidence >= 0.6 ? "text-amber-700"
    : "text-red-700";

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="font-medium text-muted-foreground w-16 shrink-0">{sexLabel}</span>

      {/* NOAEL dose — violet tint, right-click to override */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <span
            className={`cursor-context-menu rounded bg-violet-100/50 px-1.5 py-0.5 font-medium${override ? " cell-overridable" : ""}`}
            onContextMenu={(e) => { e.preventDefault(); handleOpen(); }}
            title="Right-click to override"
          >
            {doseDisplay}
            {override && (
              <span className="ml-1 text-[10px] text-blue-600">overridden</span>
            )}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-3" align="start">
          <div className="mb-1.5 text-[11px] font-semibold">Override NOAEL — {sexLabel}</div>
          <div className="space-y-1.5">
            <div>
              <label className="mb-0.5 block text-[11px] text-muted-foreground">NOAEL dose</label>
              <select
                value={overrideDose}
                onChange={(e) => setOverrideDose(e.target.value)}
                className="w-full rounded border bg-background px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {doseOptions.map((d) => (
                  <option key={d.level} value={d.label}>{d.label}</option>
                ))}
                <option value="Not established">Not established</option>
              </select>
            </div>
            <div>
              <label className="mb-0.5 block text-[11px] text-muted-foreground">Rationale</label>
              <textarea
                value={overrideRationale}
                onChange={(e) => setOverrideRationale(e.target.value)}
                placeholder="Required — explain why"
                rows={2}
                className="w-full rounded border bg-background px-1.5 py-1 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!overrideRationale.trim()}
                className="rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                onClick={handleSave}
              >
                Save
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Confidence */}
      {row.noael_confidence != null && !override && (
        <span className={cn("text-[11px] font-medium tabular-nums", confidenceColor)}>
          {Math.round(row.noael_confidence * 100)}%
        </span>
      )}
      {/* Status for non-established or missing confidence */}
      {!established && !override && (
        <span className="text-[11px] font-medium text-red-700">N/E</span>
      )}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function PenaltyRow({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground">&minus; {label}</span>
      <span className="flex items-baseline gap-1.5">
        <span>{value.toFixed(2)}</span>
        <span className="text-[10px] text-muted-foreground">({detail})</span>
      </span>
    </div>
  );
}
