/**
 * CausalityWorksheet — Bradford Hill causality assessment for an endpoint.
 *
 * Extracted from DoseResponseView to be shared by both D-R and Findings context panels.
 * 5 auto-computed criteria + 4 expert criteria + overall determination.
 * Persisted via useAnnotations<CausalAssessment>.
 */

import { useState, useEffect } from "react";
import { Edit2, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import { OverridePill } from "@/components/ui/OverridePill";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { effectSizeLabel } from "@/lib/domain-types";
import { titleCase } from "@/lib/severity-colors";
import type { RuleResult, SignalSummaryRow } from "@/types/analysis-views";

// ─── Types ───────────────────────────────────────────────────

/** Minimal summary needed by the compute functions. Both D-R EndpointSummary
 *  and UnifiedFinding can be projected onto this shape. */
export interface CausalitySummary {
  endpoint_label: string;
  organ_system: string;
  domain: string;
  /** "continuous" or "categorical" (D-R) / "incidence" (Findings) */
  data_type: string;
  dose_response_pattern: string | null;
  min_trend_p: number | null;
  max_effect_size: number | null;
  min_p_value: number | null;
  sexes: string[];
}

interface CausalAssessment {
  overrides: Record<string, { level: number; justification: string }>;
  expert: Record<string, { level: number; rationale: string }>;
  overall: string;
  comment: string;
}

// ─── Constants ───────────────────────────────────────────────

const STRENGTH_LABELS: Record<number, string> = {
  0: "Not assessed",
  1: "Weak",
  2: "Weak-moderate",
  3: "Moderate",
  4: "Strong",
  5: "Very strong",
};

const STRENGTH_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

const EXPERT_CRITERIA = [
  { key: "temporality", label: "Temporality", guidance: "Is the timing of onset consistent with treatment exposure? Consider recovery group data if available." },
  { key: "biological_plausibility", label: "Biological plausibility", guidance: "Is there a known biological mechanism? Reference published literature or compound class effects." },
  { key: "experiment", label: "Experiment", guidance: "Do the controlled study conditions support a causal interpretation? Consider study design adequacy." },
  { key: "analogy", label: "Analogy", guidance: "Do similar compounds in the same class produce similar effects?" },
] as const;

// ─── Computed criteria ───────────────────────────────────────

type Level = 0 | 1 | 2 | 3 | 4 | 5;

export function computeBiologicalGradient(ep: CausalitySummary): { level: Level; evidence: string } {
  const pattern = ep.dose_response_pattern ?? "";
  let base = 1;
  if (pattern === "monotonic_increase" || pattern === "monotonic_decrease") base = 4;
  else if (pattern === "threshold") base = 3;
  else if (pattern === "non_monotonic" || pattern === "u_shaped") base = 2;

  if (ep.min_trend_p != null && ep.min_trend_p < 0.01) base = Math.min(base + 1, 5);

  const patternLabel = pattern.replace(/_/g, " ") || "unknown";
  const trendText = ep.min_trend_p != null ? ` · trend p ${ep.min_trend_p < 0.001 ? "< 0.001" : `= ${ep.min_trend_p.toFixed(3)}`}` : "";
  return { level: base as Level, evidence: `${patternLabel}${trendText}` };
}

// Categorical/ordinal endpoints (MI, MA, CL, TF, DS) use p-value-driven strength
// because their max_effect_size is avg_severity (1-5), not Cohen's d — applying
// Cohen's d thresholds would inflate their apparent strength. Cap at level 3
// (moderate) even with highly significant p-values; levels 4-5 require the
// continuous-domain magnitude evidence that Cohen's d provides.
const CATEGORICAL_MAX_STRENGTH_LEVEL = 3 as const;

export function computeStrength(ep: CausalitySummary, esSymbol = "g"): { level: Level; evidence: string } {
  const d = ep.max_effect_size != null ? Math.abs(ep.max_effect_size) : 0;
  const isContinuous = ep.data_type === "continuous";
  let level: Level;
  if (isContinuous) {
    if (d >= 1.2) level = 5;
    else if (d >= 0.8) level = 4;
    else if (d >= 0.5) level = 3;
    else if (d >= 0.2) level = 2;
    else level = 1;
  } else {
    level = ep.min_p_value != null && ep.min_p_value < 0.01
      ? CATEGORICAL_MAX_STRENGTH_LEVEL
      : ep.min_p_value != null && ep.min_p_value < 0.05 ? 2 : 1;
  }

  const metricLabel = isContinuous ? `|${esSymbol}|` : effectSizeLabel(ep.domain);
  const pText = ep.min_p_value != null ? ` · p ${ep.min_p_value < 0.001 ? "< 0.001" : `= ${ep.min_p_value.toFixed(3)}`}` : "";
  return { level, evidence: `${metricLabel} = ${d.toFixed(2)}${pText}` };
}

function computeConsistency(ep: CausalitySummary): { level: Level; evidence: string } {
  const both = ep.sexes.length >= 2;
  return {
    level: both ? 4 : 2,
    evidence: both ? `Both sexes affected (${ep.sexes.join(", ")})` : `${ep.sexes[0] === "M" ? "Males" : "Females"} only`,
  };
}

function computeSpecificity(ep: CausalitySummary, signalSummary: SignalSummaryRow[]): { level: Level; evidence: string } {
  const organs = new Set<string>();
  for (const s of signalSummary) {
    if (s.endpoint_label === ep.endpoint_label && s.signal_score > 0) {
      organs.add(s.organ_system);
    }
  }
  const count = Math.max(organs.size, 1);
  let level: Level;
  if (count === 1) level = 4;
  else if (count === 2) level = 3;
  else if (count === 3) level = 2;
  else level = 1;

  const organList = organs.size > 0 ? ` (${[...organs].map(titleCase).join(", ")})` : "";
  return { level, evidence: `Signals in ${count} organ system${count !== 1 ? "s" : ""}${organList}` };
}

function computeCoherence(ep: CausalitySummary, ruleResults: RuleResult[]): { level: Level; evidence: string } {
  const r16Count = ruleResults.filter(
    (r) => r.rule_id === "R16" && r.organ_system === ep.organ_system
  ).length;

  let level: Level;
  if (r16Count >= 3) level = 4;
  else if (r16Count >= 1) level = 3;
  else level = 1;

  return {
    level,
    evidence: r16Count > 0
      ? `${r16Count} correlated endpoint${r16Count !== 1 ? "s" : ""} in ${titleCase(ep.organ_system)} (R16 rules)`
      : `No correlated endpoints in ${titleCase(ep.organ_system)}`,
  };
}

// ─── Sub-components ──────────────────────────────────────────

function DotGauge({ level }: { level: Level }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          className={cn(
            "inline-block h-1.5 w-1.5 rounded-full",
            i <= level ? "bg-foreground/70" : "bg-foreground/15"
          )}
        />
      ))}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────

interface CausalityWorksheetProps {
  studyId: string | undefined;
  selectedEndpoint: string | null;
  selectedSummary: CausalitySummary | null;
  ruleResults: RuleResult[];
  signalSummary: SignalSummaryRow[];
  effectSizeSymbol?: string;
  /** Per-sex summaries for gradient/strength breakdown. Keys are sex codes ("F", "M"). */
  perSexSummaries?: Record<string, CausalitySummary>;
}

export function CausalityWorksheet({
  studyId,
  selectedEndpoint,
  selectedSummary,
  ruleResults,
  signalSummary,
  effectSizeSymbol = "g",
  perSexSummaries,
}: CausalityWorksheetProps) {
  const { data: savedAnnotations } = useAnnotations<CausalAssessment>(studyId, "causal-assessment");
  const saveMutation = useSaveAnnotation<CausalAssessment>(studyId, "causal-assessment");

  const [overrides, setOverrides] = useState<Record<string, { level: number; justification: string }>>({});
  const [expert, setExpert] = useState<Record<string, { level: number; rationale: string }>>({});
  const [overall, setOverall] = useState("Not assessed");
  const [comment, setComment] = useState("");
  const [editingOverride, setEditingOverride] = useState<string | null>(null);
  const [expandedGuidance, setExpandedGuidance] = useState<Set<string>>(new Set());
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!selectedEndpoint || !savedAnnotations) {
      setOverrides({});
      setExpert({});
      setOverall("Not assessed");
      setComment("");
      setLastSaved(null);
      setDirty(false);
      return;
    }
    const saved = savedAnnotations[selectedEndpoint];
    if (saved) {
      setOverrides(saved.overrides ?? {});
      setExpert(saved.expert ?? {});
      setOverall(saved.overall ?? "Not assessed");
      setComment(saved.comment ?? "");
      setLastSaved("Previously saved");
    } else {
      setOverrides({});
      setExpert({});
      setOverall("Not assessed");
      setComment("");
      setLastSaved(null);
    }
    setDirty(false);
  }, [selectedEndpoint, savedAnnotations]);

  if (!selectedEndpoint || !selectedSummary) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Select an endpoint to assess causality.
      </div>
    );
  }

  const consistency = computeConsistency(selectedSummary);
  const specificity = computeSpecificity(selectedSummary, signalSummary);
  const coherence = computeCoherence(selectedSummary, ruleResults);

  // Gradient and strength: per-sex rows when both sexes exist, single row otherwise
  const sexCodes = perSexSummaries ? Object.keys(perSexSummaries).sort() : [];
  const isPerSex = sexCodes.length >= 2;

  const computedCriteria: { key: string; label: string; level: Level; evidence: string }[] = [];
  if (isPerSex) {
    for (const sex of sexCodes) {
      const g = computeBiologicalGradient(perSexSummaries![sex]);
      computedCriteria.push({ key: `biological_gradient_${sex}`, label: `Biological gradient (${sex})`, ...g });
    }
    for (const sex of sexCodes) {
      const s = computeStrength(perSexSummaries![sex], effectSizeSymbol);
      computedCriteria.push({ key: `strength_${sex}`, label: `Strength of association (${sex})`, ...s });
    }
  } else {
    computedCriteria.push({ key: "biological_gradient", label: "Biological gradient", ...computeBiologicalGradient(selectedSummary) });
    computedCriteria.push({ key: "strength", label: "Strength of association", ...computeStrength(selectedSummary, effectSizeSymbol) });
  }
  computedCriteria.push(
    { key: "consistency", label: "Consistency", ...consistency },
    { key: "specificity", label: "Specificity", ...specificity },
    { key: "coherence", label: "Coherence", ...coherence },
  );

  const handleSave = () => {
    if (!studyId || !selectedEndpoint) return;
    const payload: CausalAssessment = { overrides, expert, overall, comment };
    saveMutation.mutate(
      { entityKey: selectedEndpoint, data: payload },
      {
        onSuccess: () => {
          setLastSaved(`User · ${new Date().toLocaleDateString()}`);
          setDirty(false);
        },
        onError: () => {
          setLastSaved("Save failed");
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold">Causality: {selectedSummary.endpoint_label}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <DomainLabel domain={selectedSummary.domain} />
          {" · "}
          {titleCase(selectedSummary.organ_system)}
        </p>
      </div>

      {/* Computed evidence section */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Computed evidence
        </p>
        <div className="rounded-md border">
          {computedCriteria.map((c, idx) => {
            const override = overrides[c.key];
            const isEditing = editingOverride === c.key;
            const displayLevel = (override ? override.level : c.level) as Level;

            return (
              <div key={c.key} className={cn("px-3 py-2.5", idx < computedCriteria.length - 1 && "border-b")}>
                {/* Label + gauge + strength + override toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{c.label}</span>
                  <div className="flex items-center gap-2">
                    <OverridePill
                      isOverridden={!!override}
                      note={override?.justification}
                      onSaveNote={(text) => {
                        setOverrides((prev) => ({ ...prev, [c.key]: { ...prev[c.key], justification: text } }));
                        setDirty(true);
                      }}
                      placeholder="Reason for overriding computed score"
                    />
                    <DotGauge level={displayLevel} />
                    <span className="w-20 text-right text-[10px] font-medium text-muted-foreground">
                      {STRENGTH_LABELS[displayLevel]}
                    </span>
                    <button
                      className="text-muted-foreground/50 transition-colors hover:text-muted-foreground"
                      title="Override computed score"
                      onClick={() => {
                        if (isEditing) {
                          setEditingOverride(null);
                        } else {
                          setEditingOverride(c.key);
                          if (!override) {
                            setOverrides((prev) => ({ ...prev, [c.key]: { level: c.level, justification: "" } }));
                            setDirty(true);
                          }
                        }
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Evidence line */}
                <p className="mt-0.5 text-[10px] text-muted-foreground">{c.evidence}</p>

                {/* Override editor */}
                {isEditing && (
                  <div className="mt-2 space-y-1.5 rounded border bg-muted/20 p-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-muted-foreground">Override:</label>
                      <select
                        className="rounded border bg-background px-1.5 py-0.5 text-xs"
                        value={override?.level ?? c.level}
                        onChange={(e) => {
                          const level = Number(e.target.value);
                          setOverrides((prev) => ({
                            ...prev,
                            [c.key]: { ...prev[c.key], level, justification: prev[c.key]?.justification ?? "" },
                          }));
                          setDirty(true);
                        }}
                      >
                        {STRENGTH_OPTIONS.map((v) => (
                          <option key={v} value={v}>{STRENGTH_LABELS[v]}</option>
                        ))}
                      </select>
                      <button
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setOverrides((prev) => {
                            const next = { ...prev };
                            delete next[c.key];
                            return next;
                          });
                          setEditingOverride(null);
                          setDirty(true);
                        }}
                      >
                        Clear
                      </button>
                    </div>
                    <textarea
                      className="w-full rounded border px-2 py-1.5 text-xs"
                      rows={2}
                      placeholder="Reason for override..."
                      value={override?.justification ?? ""}
                      onChange={(e) => {
                        setOverrides((prev) => ({
                          ...prev,
                          [c.key]: { ...prev[c.key], level: prev[c.key]?.level ?? c.level, justification: e.target.value },
                        }));
                        setDirty(true);
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Expert assessment section */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Expert assessment
        </p>
        <div className="rounded-md border">
          {EXPERT_CRITERIA.map((c, idx) => {
            const val = expert[c.key] ?? { level: 0, rationale: "" };
            const isGuidanceOpen = expandedGuidance.has(c.key);

            return (
              <div key={c.key} className={cn("px-3 py-2.5", idx < EXPERT_CRITERIA.length - 1 && "border-b")}>
                {/* Label + help toggle */}
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium">{c.label}</span>
                  <button
                    className="text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                    title="Show guidance"
                    onClick={() => {
                      setExpandedGuidance((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.key)) next.delete(c.key);
                        else next.add(c.key);
                        return next;
                      });
                    }}
                  >
                    <HelpCircle className="h-3 w-3" />
                  </button>
                </div>

                {/* Dot gauge + dropdown */}
                <div className="mt-1 flex items-center gap-2">
                  <DotGauge level={val.level as Level} />
                  <select
                    className="rounded border bg-background px-1.5 py-0.5 text-xs"
                    value={val.level}
                    onChange={(e) => {
                      const level = Number(e.target.value);
                      setExpert((prev) => ({
                        ...prev,
                        [c.key]: { ...prev[c.key], level, rationale: prev[c.key]?.rationale ?? "" },
                      }));
                      setDirty(true);
                    }}
                  >
                    {STRENGTH_OPTIONS.map((v) => (
                      <option key={v} value={v}>{STRENGTH_LABELS[v]}</option>
                    ))}
                  </select>
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {STRENGTH_LABELS[val.level as keyof typeof STRENGTH_LABELS] ?? "Not assessed"}
                  </span>
                </div>

                {/* Guidance text */}
                {isGuidanceOpen && (
                  <p className="mt-0.5 text-[10px] italic text-muted-foreground">{c.guidance}</p>
                )}

                {/* Rationale text area */}
                <textarea
                  className="mt-1 w-full rounded border px-2 py-1.5 text-xs"
                  rows={2}
                  placeholder="Notes..."
                  value={val.rationale}
                  onChange={(e) => {
                    setExpert((prev) => ({
                      ...prev,
                      [c.key]: { ...prev[c.key], level: prev[c.key]?.level ?? 0, rationale: e.target.value },
                    }));
                    setDirty(true);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Overall assessment section */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Overall assessment
        </p>
        <div className="rounded-md border px-3 py-2.5">
          <div className="flex flex-col gap-1.5">
            {["Likely causal", "Possibly causal", "Unlikely causal", "Not assessed"].map((opt) => (
              <label key={opt} className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="radio"
                  name="overall-assessment"
                  className="accent-primary"
                  checked={overall === opt}
                  onChange={() => {
                    setOverall(opt);
                    setDirty(true);
                  }}
                />
                {opt}
              </label>
            ))}
          </div>

          <textarea
            className="mt-2 w-full rounded border px-2 py-1.5 text-xs"
            rows={2}
            placeholder="Overall assessment notes..."
            value={comment}
            onChange={(e) => {
              setComment(e.target.value);
              setDirty(true);
            }}
          />

          {/* Save button + footer */}
          <div className="mt-3 flex items-center justify-between">
            <button
              className={cn(
                "rounded bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase text-primary-foreground transition-colors hover:bg-primary/90",
                (!dirty || saveMutation.isPending) && "cursor-not-allowed opacity-50"
              )}
              disabled={!dirty || saveMutation.isPending}
              onClick={handleSave}
            >
              {saveMutation.isPending ? "Saving..." : "SAVE"}
            </button>
            {lastSaved && (
              <span className="text-[10px] text-muted-foreground">{lastSaved}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
