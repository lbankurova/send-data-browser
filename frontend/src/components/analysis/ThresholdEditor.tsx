/**
 * TRUST-01p2: Threshold Editor
 * Allows experts to adjust signal scoring weights, pattern scores,
 * thresholds, and NOAEL confidence penalties.
 * Persists via annotation system for audit trail.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { CollapsiblePane } from "./panes/CollapsiblePane";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import {
  SIGNAL_SCORE_WEIGHTS,
  PATTERN_SCORES,
  NOAEL_CONFIDENCE_PENALTIES,
} from "@/lib/rule-definitions";
import type { ThresholdConfig } from "@/types/annotations";

// ---------------------------------------------------------------------------
// Default values (from rule-definitions.ts)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: Omit<ThresholdConfig, "modifiedBy" | "modifiedDate"> = {
  signalScoreWeights: { ...SIGNAL_SCORE_WEIGHTS },
  patternScores: { ...PATTERN_SCORES },
  pValueSignificance: 0.05,
  largeEffect: 1.0,
  moderateEffect: 0.5,
  targetOrganEvidence: 0.3,
  targetOrganSignificant: 1,
  noaelPenalties: {
    singleEndpoint: -0.20,
    sexInconsistency: -0.20,
    pathologyDisagreement: 0,
    largeEffectNonSig: -0.20,
  },
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  studyId: string;
  expandAll?: number;
  collapseAll?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ThresholdEditor({ studyId, expandAll, collapseAll }: Props) {
  const { data: annotations } = useAnnotations<ThresholdConfig>(studyId, "threshold-config");
  const { mutate: save, isPending, isSuccess, reset } = useSaveAnnotation<ThresholdConfig>(studyId, "threshold-config");

  // Auto-reset success flash
  useEffect(() => {
    if (isSuccess) {
      const t = setTimeout(() => reset(), 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, reset]);

  const existing = annotations?.["defaults"];

  // Local state for all editable fields
  const [weights, setWeights] = useState(DEFAULT_CONFIG.signalScoreWeights);
  const [patterns, setPatterns] = useState(DEFAULT_CONFIG.patternScores);
  const [pValSig, setPValSig] = useState(DEFAULT_CONFIG.pValueSignificance);
  const [largeEff, setLargeEff] = useState(DEFAULT_CONFIG.largeEffect);
  const [modEff, setModEff] = useState(DEFAULT_CONFIG.moderateEffect);
  const [toEvidence, setToEvidence] = useState(DEFAULT_CONFIG.targetOrganEvidence);
  const [toSignificant, setToSignificant] = useState(DEFAULT_CONFIG.targetOrganSignificant);
  const [penalties, setPenalties] = useState(DEFAULT_CONFIG.noaelPenalties);

  // Sync from persisted data
  useEffect(() => {
    if (existing) {
      setWeights(existing.signalScoreWeights);
      setPatterns(existing.patternScores);
      setPValSig(existing.pValueSignificance);
      setLargeEff(existing.largeEffect);
      setModEff(existing.moderateEffect);
      setToEvidence(existing.targetOrganEvidence);
      setToSignificant(existing.targetOrganSignificant);
      setPenalties(existing.noaelPenalties);
    }
  }, [existing]);

  // Check if weights sum to 1.0
  const weightSum = weights.pValue + weights.trend + weights.effectSize + weights.pattern;
  const weightSumValid = Math.abs(weightSum - 1.0) < 0.005;

  // Check if anything is modified from defaults
  const isModified = useMemo(() => {
    const d = DEFAULT_CONFIG;
    return (
      weights.pValue !== d.signalScoreWeights.pValue ||
      weights.trend !== d.signalScoreWeights.trend ||
      weights.effectSize !== d.signalScoreWeights.effectSize ||
      weights.pattern !== d.signalScoreWeights.pattern ||
      Object.entries(patterns).some(([k, v]) => v !== d.patternScores[k]) ||
      pValSig !== d.pValueSignificance ||
      largeEff !== d.largeEffect ||
      modEff !== d.moderateEffect ||
      toEvidence !== d.targetOrganEvidence ||
      toSignificant !== d.targetOrganSignificant ||
      penalties.singleEndpoint !== d.noaelPenalties.singleEndpoint ||
      penalties.sexInconsistency !== d.noaelPenalties.sexInconsistency ||
      penalties.pathologyDisagreement !== d.noaelPenalties.pathologyDisagreement ||
      penalties.largeEffectNonSig !== d.noaelPenalties.largeEffectNonSig
    );
  }, [weights, patterns, pValSig, largeEff, modEff, toEvidence, toSignificant, penalties]);

  // Check if different from persisted
  const isDirty = useMemo(() => {
    if (!existing) return isModified; // If no saved config, dirty only if different from defaults
    return (
      weights.pValue !== existing.signalScoreWeights.pValue ||
      weights.trend !== existing.signalScoreWeights.trend ||
      weights.effectSize !== existing.signalScoreWeights.effectSize ||
      weights.pattern !== existing.signalScoreWeights.pattern ||
      Object.entries(patterns).some(([k, v]) => v !== existing.patternScores[k]) ||
      pValSig !== existing.pValueSignificance ||
      largeEff !== existing.largeEffect ||
      modEff !== existing.moderateEffect ||
      toEvidence !== existing.targetOrganEvidence ||
      toSignificant !== existing.targetOrganSignificant ||
      penalties.singleEndpoint !== existing.noaelPenalties.singleEndpoint ||
      penalties.sexInconsistency !== existing.noaelPenalties.sexInconsistency ||
      penalties.pathologyDisagreement !== existing.noaelPenalties.pathologyDisagreement ||
      penalties.largeEffectNonSig !== existing.noaelPenalties.largeEffectNonSig
    );
  }, [existing, weights, patterns, pValSig, largeEff, modEff, toEvidence, toSignificant, penalties, isModified]);

  const handleSave = useCallback(() => {
    save({
      entityKey: "defaults",
      data: {
        signalScoreWeights: weights,
        patternScores: patterns,
        pValueSignificance: pValSig,
        largeEffect: largeEff,
        moderateEffect: modEff,
        targetOrganEvidence: toEvidence,
        targetOrganSignificant: toSignificant,
        noaelPenalties: penalties,
      },
    });
  }, [save, weights, patterns, pValSig, largeEff, modEff, toEvidence, toSignificant, penalties]);

  const handleReset = () => {
    setWeights(DEFAULT_CONFIG.signalScoreWeights);
    setPatterns(DEFAULT_CONFIG.patternScores);
    setPValSig(DEFAULT_CONFIG.pValueSignificance);
    setLargeEff(DEFAULT_CONFIG.largeEffect);
    setModEff(DEFAULT_CONFIG.moderateEffect);
    setToEvidence(DEFAULT_CONFIG.targetOrganEvidence);
    setToSignificant(DEFAULT_CONFIG.targetOrganSignificant);
    setPenalties(DEFAULT_CONFIG.noaelPenalties);
  };

  return (
    <CollapsiblePane
      title="Threshold configuration"
      defaultOpen={false}
      expandAll={expandAll}
      collapseAll={collapseAll}
      headerRight={isModified ? <span className="text-[9px] text-amber-600">(customized)</span> : undefined}
    >
      <div className="space-y-3 text-[11px]">
        {/* Signal score weights */}
        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[10px] font-medium text-muted-foreground">Signal score weights</span>
            <span className={`text-[9px] font-mono ${weightSumValid ? "text-muted-foreground/60" : "text-red-600"}`}>
              sum = {weightSum.toFixed(2)}{!weightSumValid && " (must = 1.00)"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <WeightInput label="p-value" value={weights.pValue} defaultValue={SIGNAL_SCORE_WEIGHTS.pValue}
              onChange={(v) => setWeights((w) => ({ ...w, pValue: v }))} />
            <WeightInput label="Trend" value={weights.trend} defaultValue={SIGNAL_SCORE_WEIGHTS.trend}
              onChange={(v) => setWeights((w) => ({ ...w, trend: v }))} />
            <WeightInput label="Effect size" value={weights.effectSize} defaultValue={SIGNAL_SCORE_WEIGHTS.effectSize}
              onChange={(v) => setWeights((w) => ({ ...w, effectSize: v }))} />
            <WeightInput label="Pattern" value={weights.pattern} defaultValue={SIGNAL_SCORE_WEIGHTS.pattern}
              onChange={(v) => setWeights((w) => ({ ...w, pattern: v }))} />
          </div>
        </div>

        {/* Pattern scores */}
        <div>
          <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">Pattern scores</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {Object.entries(DEFAULT_CONFIG.patternScores).map(([key, def]) => (
              <WeightInput
                key={key}
                label={key.replace(/_/g, " ")}
                value={patterns[key] ?? def}
                defaultValue={def}
                onChange={(v) => setPatterns((p) => ({ ...p, [key]: v }))}
                min={0}
                max={1}
              />
            ))}
          </div>
        </div>

        {/* Key thresholds */}
        <div>
          <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">Key thresholds</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <WeightInput label="P-value significance" value={pValSig} defaultValue={0.05}
              onChange={setPValSig} step={0.01} min={0.001} max={0.1} />
            <WeightInput label="Large effect (|d|)" value={largeEff} defaultValue={1.0}
              onChange={setLargeEff} step={0.1} min={0.1} max={5} />
            <WeightInput label="Moderate effect (|d|)" value={modEff} defaultValue={0.5}
              onChange={setModEff} step={0.1} min={0.1} max={5} />
            <WeightInput label="Target organ evidence" value={toEvidence} defaultValue={0.3}
              onChange={setToEvidence} step={0.05} min={0.05} max={1} />
            <WeightInput label="Target organ n_sig" value={toSignificant} defaultValue={1}
              onChange={setToSignificant} step={1} min={1} max={10} />
          </div>
        </div>

        {/* NOAEL confidence penalties */}
        <div>
          <div className="mb-1.5 text-[10px] font-medium text-muted-foreground">NOAEL confidence penalties</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {NOAEL_CONFIDENCE_PENALTIES.map((p) => {
              const key = p.key as keyof typeof penalties;
              return (
                <WeightInput
                  key={p.key}
                  label={p.name}
                  value={penalties[key]}
                  defaultValue={p.penalty}
                  onChange={(v) => setPenalties((prev) => ({ ...prev, [key]: v }))}
                  step={0.05}
                  min={-1}
                  max={0}
                />
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 border-t pt-2">
          <button
            className={`rounded px-3 py-1 text-[11px] font-medium disabled:opacity-50 ${isSuccess ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
            onClick={handleSave}
            disabled={!isDirty || !weightSumValid || isPending || isSuccess}
          >
            {isPending ? "SAVING..." : isSuccess ? "SAVED" : "SAVE"}
          </button>
          <button
            className="rounded border px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
            onClick={handleReset}
            disabled={!isModified}
          >
            Reset to defaults
          </button>
        </div>

        {/* Footer */}
        {existing?.modifiedBy && (
          <p className="text-[10px] text-muted-foreground">
            Last modified by {existing.modifiedBy} on{" "}
            {new Date(existing.modifiedDate).toLocaleDateString()}
          </p>
        )}

        <p className="text-[9px] text-muted-foreground/60">
          Configuration is saved per-study. Changes do not re-run the analysis pipeline —
          they document expert-preferred thresholds for regulatory review.
        </p>
      </div>
    </CollapsiblePane>
  );
}

// ---------------------------------------------------------------------------
// Inline weight input
// ---------------------------------------------------------------------------

function WeightInput({
  label,
  value,
  defaultValue,
  onChange,
  step = 0.05,
  min = 0,
  max = 1,
}: {
  label: string;
  value: number;
  defaultValue: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const modified = value !== defaultValue;

  return (
    <div className="flex items-center gap-1.5">
      <label className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{label}</label>
      <input
        type="number"
        className={`w-14 rounded border bg-background px-1.5 py-0.5 text-right font-mono text-[10px] ${modified ? "border-amber-300" : ""}`}
        value={value}
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          if (!isNaN(n)) onChange(n);
        }}
        step={step}
        min={min}
        max={max}
      />
      {modified && (
        <span className="text-[8px] text-amber-600" title={`Default: ${defaultValue}`}>*</span>
      )}
    </div>
  );
}
