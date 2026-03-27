/**
 * TRUST-01p2: Signal Scoring Parameters Editor
 * Allows experts to adjust signal scoring weights (continuous & incidence),
 * pattern scores, thresholds, and NOAEL confidence penalties.
 * Saved params are read by the backend pipeline at computation time.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { Info } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { CollapsiblePane } from "./panes/CollapsiblePane";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { useStudySummaryTab } from "@/hooks/useStudySummaryTab";
import {
  SIGNAL_SCORE_WEIGHTS,
  INCIDENCE_SCORE_WEIGHTS,
  PATTERN_SCORES,
  NOAEL_CONFIDENCE_PENALTIES,
} from "@/lib/rule-definitions";
import type { ThresholdConfig } from "@/types/annotations";

// ---------------------------------------------------------------------------
// Default values
// ---------------------------------------------------------------------------

const DEFAULT_CONT = { ...SIGNAL_SCORE_WEIGHTS };
const DEFAULT_INC = { ...INCIDENCE_SCORE_WEIGHTS };

type Penalties = {
  singleEndpoint: number;
  sexInconsistency: number;
  pathologyDisagreement: number;
  largeEffectNonSig: number;
};

const DEFAULT_PENALTIES: Penalties = {
  singleEndpoint: -0.20,
  sexInconsistency: -0.20,
  pathologyDisagreement: 0,
  largeEffectNonSig: -0.20,
};

const DEFAULT_CONFIG = {
  continuousWeights: DEFAULT_CONT as { pValue: number; trend: number; effectSize: number; pattern: number },
  incidenceWeights: DEFAULT_INC as { pValue: number; trend: number; pattern: number; severityModifier: number },
  patternScores: { ...PATTERN_SCORES } as Record<string, number>,
  pValueSignificance: 0.05,
  largeEffect: 1.0,
  moderateEffect: 0.5,
  targetOrganEvidence: 0.3,
  targetOrganSignificant: 1,
  noaelPenalties: DEFAULT_PENALTIES,
};

// ---------------------------------------------------------------------------
// Backward compat: migrate old signalScoreWeights → continuousWeights
// ---------------------------------------------------------------------------

function migrateConfig(raw: ThresholdConfig): ThresholdConfig {
  if (raw.continuousWeights) return raw;
  // Old format: signalScoreWeights only → becomes continuousWeights
  return {
    ...raw,
    continuousWeights: raw.signalScoreWeights ?? { ...DEFAULT_CONT },
    incidenceWeights: { ...DEFAULT_INC },
  };
}

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
  const queryClient = useQueryClient();
  const [, setStudyTab] = useStudySummaryTab();
  const { data: annotations } = useAnnotations<ThresholdConfig>(studyId, "threshold-config");
  const { mutate: save, isPending, isSuccess, reset } = useSaveAnnotation<ThresholdConfig>(studyId, "threshold-config");

  // Auto-reset success flash
  useEffect(() => {
    if (isSuccess) {
      const t = setTimeout(() => reset(), 2000);
      return () => clearTimeout(t);
    }
  }, [isSuccess, reset]);

  const existing = useMemo(() => {
    const raw = annotations?.["defaults"];
    if (!raw) return undefined;
    return migrateConfig(raw);
  }, [annotations]);

  // Local state
  const [contWeights, setContWeights] = useState(DEFAULT_CONFIG.continuousWeights);
  const [incWeights, setIncWeights] = useState(DEFAULT_CONFIG.incidenceWeights);
  const [patterns, setPatterns] = useState<Record<string, number>>(DEFAULT_CONFIG.patternScores);
  const [pValSig, setPValSig] = useState<number>(DEFAULT_CONFIG.pValueSignificance);
  const [largeEff, setLargeEff] = useState<number>(DEFAULT_CONFIG.largeEffect);
  const [modEff, setModEff] = useState<number>(DEFAULT_CONFIG.moderateEffect);
  const [toEvidence, setToEvidence] = useState<number>(DEFAULT_CONFIG.targetOrganEvidence);
  const [toSignificant, setToSignificant] = useState<number>(DEFAULT_CONFIG.targetOrganSignificant);
  const [penalties, setPenalties] = useState(DEFAULT_CONFIG.noaelPenalties);

  // Sync from persisted data
  useEffect(() => {
    if (existing) {
      setContWeights(existing.continuousWeights);
      setIncWeights(existing.incidenceWeights);
      setPatterns(existing.patternScores);
      setPValSig(existing.pValueSignificance);
      setLargeEff(existing.largeEffect);
      setModEff(existing.moderateEffect);
      setToEvidence(existing.targetOrganEvidence);
      setToSignificant(existing.targetOrganSignificant);
      setPenalties(existing.noaelPenalties);
    }
  }, [existing]);

  // Sums
  const contSum = contWeights.pValue + contWeights.trend + contWeights.effectSize + contWeights.pattern;
  const contSumValid = Math.abs(contSum - 1.0) < 0.005;
  const incSum = incWeights.pValue + incWeights.trend + incWeights.pattern;
  const incSumValid = Math.abs(incSum - 1.0) < 0.005;

  // Modified from defaults?
  const isModified = useMemo(() => {
    const d = DEFAULT_CONFIG;
    return (
      JSON.stringify(contWeights) !== JSON.stringify(d.continuousWeights) ||
      JSON.stringify(incWeights) !== JSON.stringify(d.incidenceWeights) ||
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
  }, [contWeights, incWeights, patterns, pValSig, largeEff, modEff, toEvidence, toSignificant, penalties]);

  // Dirty (different from persisted)?
  const isDirty = useMemo(() => {
    if (!existing) return isModified;
    return (
      JSON.stringify(contWeights) !== JSON.stringify(existing.continuousWeights) ||
      JSON.stringify(incWeights) !== JSON.stringify(existing.incidenceWeights) ||
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
  }, [existing, contWeights, incWeights, patterns, pValSig, largeEff, modEff, toEvidence, toSignificant, penalties, isModified]);

  const handleSave = useCallback(() => {
    save({
      entityKey: "defaults",
      data: {
        continuousWeights: contWeights,
        incidenceWeights: incWeights,
        patternScores: patterns,
        pValueSignificance: pValSig,
        largeEffect: largeEff,
        moderateEffect: modEff,
        targetOrganEvidence: toEvidence,
        targetOrganSignificant: toSignificant,
        noaelPenalties: penalties,
      },
    }, {
      onSuccess: () => {
        // Invalidate analysis data so UI re-fetches with new scoring params
        queryClient.invalidateQueries({ queryKey: ["study", studyId] });
        queryClient.invalidateQueries({ queryKey: ["analysis"] });
      },
    });
  }, [save, queryClient, studyId, contWeights, incWeights, patterns, pValSig, largeEff, modEff, toEvidence, toSignificant, penalties]);

  const handleReset = () => {
    setContWeights({ ...DEFAULT_CONFIG.continuousWeights });
    setIncWeights({ ...DEFAULT_CONFIG.incidenceWeights });
    setPatterns({ ...DEFAULT_CONFIG.patternScores });
    setPValSig(DEFAULT_CONFIG.pValueSignificance);
    setLargeEff(DEFAULT_CONFIG.largeEffect);
    setModEff(DEFAULT_CONFIG.moderateEffect);
    setToEvidence(DEFAULT_CONFIG.targetOrganEvidence);
    setToSignificant(DEFAULT_CONFIG.targetOrganSignificant);
    setPenalties({ ...DEFAULT_CONFIG.noaelPenalties });
  };

  return (
    <CollapsiblePane
      title="Signal scoring parameters"
      defaultOpen={false}
      sessionKey="pcc.studySettings.scoringParams"
      expandAll={expandAll}
      collapseAll={collapseAll}
      headerRight={isModified ? <span className="text-[10px] text-amber-600">(customized)</span> : undefined}
      badge={
        <span title="Configure signal scoring weights, pattern scores, thresholds, and NOAEL penalties. Changes are saved per-study and applied to all analysis computations.">
          <Info className="h-3 w-3 shrink-0 cursor-help text-muted-foreground/40" />
        </span>
      }
    >
      <div className="space-y-3 text-xs">
        {/* Continuous weights */}
        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Continuous weights</span>
            <span className={`text-[10px] font-mono ${contSumValid ? "text-muted-foreground/60" : "text-red-600"}`}>
              sum = {contSum.toFixed(2)}{!contSumValid && " (must = 1.00)"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <WeightInput label="p-value" value={contWeights.pValue} defaultValue={DEFAULT_CONT.pValue}
              onChange={(v) => setContWeights((w) => ({ ...w, pValue: v }))} />
            <WeightInput label="Trend" value={contWeights.trend} defaultValue={DEFAULT_CONT.trend}
              onChange={(v) => setContWeights((w) => ({ ...w, trend: v }))} />
            <WeightInput label="Effect size" value={contWeights.effectSize} defaultValue={DEFAULT_CONT.effectSize}
              onChange={(v) => setContWeights((w) => ({ ...w, effectSize: v }))} />
            <WeightInput label="Pattern" value={contWeights.pattern} defaultValue={DEFAULT_CONT.pattern}
              onChange={(v) => setContWeights((w) => ({ ...w, pattern: v }))} />
          </div>
        </div>

        {/* Incidence weights */}
        <div>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[11px] font-medium text-muted-foreground">Incidence weights</span>
            <span className={`text-[10px] font-mono ${incSumValid ? "text-muted-foreground/60" : "text-red-600"}`}>
              sum = {incSum.toFixed(2)}{!incSumValid && " (must = 1.00)"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <WeightInput label="p-value" value={incWeights.pValue} defaultValue={DEFAULT_INC.pValue}
              onChange={(v) => setIncWeights((w) => ({ ...w, pValue: v }))} />
            <WeightInput label="Trend" value={incWeights.trend} defaultValue={DEFAULT_INC.trend}
              onChange={(v) => setIncWeights((w) => ({ ...w, trend: v }))} />
            <WeightInput label="Pattern" value={incWeights.pattern} defaultValue={DEFAULT_INC.pattern}
              onChange={(v) => setIncWeights((w) => ({ ...w, pattern: v }))} />
            <WeightInput label="MI severity cap" value={incWeights.severityModifier} defaultValue={DEFAULT_INC.severityModifier}
              onChange={(v) => setIncWeights((w) => ({ ...w, severityModifier: v }))} />
          </div>
        </div>

        {/* Pattern scores */}
        <div>
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Pattern scores</div>
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
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">Key thresholds</div>
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
          <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">NOAEL confidence penalties</div>
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
            className={`rounded px-3 py-1 text-xs font-medium disabled:opacity-50 ${isSuccess ? "bg-green-600 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"}`}
            onClick={handleSave}
            disabled={!isDirty || !contSumValid || !incSumValid || isPending || isSuccess}
          >
            {isPending ? "SAVING..." : isSuccess ? "SAVED" : "SAVE"}
          </button>
          <button
            className="rounded border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/50 disabled:opacity-50"
            onClick={handleReset}
            disabled={!isModified}
          >
            Reset to defaults
          </button>
          <button
            className="ml-auto text-[11px] text-primary hover:underline"
            onClick={() => setStudyTab("rules")}
          >
            View rules & classification
          </button>
        </div>

        {/* Footer */}
        {existing?.modifiedBy && (
          <p className="text-[11px] text-muted-foreground">
            Last modified by {existing.modifiedBy} on{" "}
            {new Date(existing.modifiedDate).toLocaleDateString()}
          </p>
        )}

        <p className="text-[10px] text-muted-foreground/60">
          Configuration is saved per-study. Changes affect signal scores,
          target organ flags, and NOAEL confidence on next data load.
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
      <label className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{label}</label>
      <input
        type="number"
        className={`w-14 rounded border bg-background px-1.5 py-0.5 text-right font-mono text-[11px] ${modified ? "border-amber-300" : ""}`}
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
