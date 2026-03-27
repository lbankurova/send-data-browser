import { useState, useMemo, useCallback } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { DomainLabel } from "@/components/ui/DomainLabel";
import { formatDoseShortLabel } from "@/lib/severity-colors";
import { ConfidencePopover } from "../ScoreBreakdown";
import { generateNoaelNarrative } from "@/lib/noael-narrative";
import type { NoaelNarrative } from "@/lib/noael-narrative";
import { useAnnotations, useSaveAnnotation } from "@/hooks/useAnnotations";
import type { NoaelOverride } from "@/types/annotations";
import type { NoaelSummaryRow, AdverseEffectSummaryRow, PkIntegration } from "@/types/analysis-views";
import { ExposureSection } from "./ExposureSection";

export function NoaelBanner({ data, aeData, studyId, onFindingClick, pkData }: { data: NoaelSummaryRow[]; aeData: AdverseEffectSummaryRow[]; studyId: string; onFindingClick?: (finding: string, organSystem: string) => void; pkData?: PkIntegration }) {
  const combined = data.find((r) => r.sex === "Combined");
  const males = data.find((r) => r.sex === "M");
  const females = data.find((r) => r.sex === "F");

  // Override annotations
  const { data: overrideAnnotations } = useAnnotations<NoaelOverride>(studyId, "noael-overrides");
  const saveMutation = useSaveAnnotation<NoaelOverride>(studyId, "noael-overrides");
  const [editingSex, setEditingSex] = useState<string | null>(null);
  const [overrideDose, setOverrideDose] = useState("");
  const [overrideRationale, setOverrideRationale] = useState("");
  const [narrativeExpanded, setNarrativeExpanded] = useState(false);

  // Unique dose labels from AE data for dropdown
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

  const handleStartEdit = useCallback((sex: string, currentRow: NoaelSummaryRow) => {
    const existing = overrideAnnotations?.[`noael:${sex}`];
    setEditingSex(sex);
    setOverrideDose(existing?.override_dose_value ?? `${currentRow.noael_dose_value} ${currentRow.noael_dose_unit}`);
    setOverrideRationale(existing?.rationale ?? "");
  }, [overrideAnnotations]);

  const handleSave = useCallback((sex: string, currentRow: NoaelSummaryRow) => {
    if (!overrideRationale.trim()) return;
    const selectedOption = doseOptions.find((d) => d.label === overrideDose);
    const isNotEstablished = overrideDose === "Not established";
    const currentDoseValue = `${currentRow.noael_dose_value} ${currentRow.noael_dose_unit}`;
    const overrideType: NoaelOverride["override_type"] =
      isNotEstablished ? "not_established"
      : overrideDose === currentDoseValue ? "agree"
      : (selectedOption?.level ?? 0) > currentRow.noael_dose_level ? "higher"
      : "lower";
    saveMutation.mutate({
      entityKey: `noael:${sex}`,
      data: {
        sex: sex as NoaelOverride["sex"],
        override_dose_level: isNotEstablished ? null : (selectedOption?.level ?? currentRow.noael_dose_level),
        override_dose_value: overrideDose,
        rationale: overrideRationale.trim(),
        override_type: overrideType,
        timestamp: new Date().toISOString(),
      },
    });
    setEditingSex(null);
  }, [overrideDose, overrideRationale, doseOptions, saveMutation]);

  // Check if males and females have different NOAEL levels
  const sexDivergent =
    males && females && males.noael_dose_level !== females.noael_dose_level;

  // Single consolidated narrative computation — generates all narratives in one pass
  const { narrative, maleNarrative, femaleNarrative, cardNarratives } = useMemo(() => {
    const map = new Map<string, NoaelNarrative>();
    for (const row of data) {
      map.set(row.sex, generateNoaelNarrative(row, aeData, row.sex as "Combined" | "M" | "F"));
    }
    const primaryRow = combined ?? males ?? females;
    return {
      narrative: primaryRow ? (map.get(primaryRow.sex) ?? null) : null,
      maleNarrative: sexDivergent && males ? (map.get("M") ?? null) : null,
      femaleNarrative: sexDivergent && females ? (map.get("F") ?? null) : null,
      cardNarratives: map,
    };
  }, [data, aeData, combined, males, females, sexDivergent]);

  return (
    <div className="shrink-0 border-b bg-muted/20 px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        NOAEL determination
      </h2>
      <div className="flex flex-wrap gap-3">
        {[combined, males, females].filter(Boolean).map((row) => {
          const r = row!;
          const established = r.noael_dose_value != null;
          const cardNarr = cardNarratives.get(r.sex);
          const override = overrideAnnotations?.[`noael:${r.sex}`];
          const isEditing = editingSex === r.sex;
          return (
            <div
              key={r.sex}
              className="flex-1 rounded-lg border p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold">
                  {r.sex === "Combined" ? "Combined" : r.sex === "M" ? "Males" : "Females"}
                </span>
                <div className="flex items-center gap-1.5">
                  {override ? (
                    <span className="text-[11px] font-medium text-blue-600">Overridden</span>
                  ) : (
                    <span
                      className="text-[11px] font-medium"
                      style={{ color: established ? "#15803d" : "#dc2626" }}
                    >
                      {established ? "Established" : "Not established"}
                    </span>
                  )}
                  <button
                    type="button"
                    className="text-muted-foreground/40 hover:text-muted-foreground"
                    onClick={() => isEditing ? setEditingSex(null) : handleStartEdit(r.sex, r)}
                    title="Override NOAEL determination"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              </div>
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">NOAEL</span>
                  <span className="font-medium">
                    {override ? (
                      <>
                        {override.override_dose_value}
                        <span className="ml-1.5 text-[11px] text-muted-foreground line-through">
                          {r.noael_dose_value} {r.noael_dose_unit}
                        </span>
                      </>
                    ) : (
                      <>{r.noael_dose_value} {r.noael_dose_unit}</>
                    )}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">LOAEL</span>
                  <span className="font-medium">{formatDoseShortLabel(r.loael_label)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Adverse at LOAEL</span>
                  <span className="font-medium">{r.n_adverse_at_loael}</span>
                </div>
                {/* Override rationale display */}
                {override && !isEditing && (
                  <div className="mt-0.5 text-[11px] italic text-muted-foreground line-clamp-2" title={override.rationale}>
                    {override.rationale}
                  </div>
                )}
                {/* LOAEL dose-limiting findings callout (#4) */}
                {cardNarr && cardNarr.loael_findings.length > 0 && (
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {cardNarr.loael_details.slice(0, 3).map((f, i) => {
                      const organSystem = aeData.find(a => a.endpoint_label === f.finding)?.organ_system;
                      return (
                        <button
                          key={f.finding}
                          type="button"
                          className="hover:text-foreground hover:underline"
                          onClick={() => onFindingClick?.(f.finding, organSystem ?? "")}
                        >
                          {i > 0 && " \u00b7 "}
                          {f.finding} (<DomainLabel domain={f.domain} />)
                        </button>
                      );
                    })}
                    {cardNarr.loael_findings.length > 3 && (
                      <span className="ml-1">+{cardNarr.loael_findings.length - 3} more</span>
                    )}
                  </div>
                )}
                {r.noael_confidence != null && !override && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Confidence</span>
                    <ConfidencePopover row={r} allNoael={data}>
                      <span
                        className={cn(
                          "font-medium",
                          r.noael_confidence >= 0.8 ? "text-green-700" :
                          r.noael_confidence >= 0.6 ? "text-amber-700" :
                          "text-red-700"
                        )}
                      >
                        {Math.round(r.noael_confidence * 100)}%
                      </span>
                    </ConfidencePopover>
                  </div>
                )}
                {r.adverse_domains_at_loael.length > 0 && !override && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r.adverse_domains_at_loael.map((d) => (
                      <DomainLabel key={d} domain={d} />
                    ))}
                  </div>
                )}
                {/* PK exposure at NOAEL (or LOAEL fallback) */}
                {pkData?.available && (pkData.noael_exposure || pkData.loael_exposure) && r.sex === "Combined" && (
                  <ExposureSection pkData={pkData} />
                )}
              </div>
              {/* Inline override form */}
              {isEditing && (
                <div className="mt-2 rounded-md border border-dashed border-primary/30 bg-muted/10 p-2">
                  <div className="mb-1.5 text-[11px] font-semibold">Override NOAEL determination</div>
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
                        placeholder="Required — explain why the system determination is being overridden"
                        rows={2}
                        className="w-full rounded border bg-background px-1.5 py-1 text-xs placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        className="rounded px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40"
                        onClick={() => setEditingSex(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={
                          !overrideRationale.trim() ||
                          (override != null &&
                            overrideDose === override.override_dose_value &&
                            overrideRationale.trim() === override.rationale)
                        }
                        className="rounded bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                        onClick={() => handleSave(r.sex, r)}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Narrative summary (#2) — expand/collapse */}
      {narrative && (
        <div className="mt-2">
          <div className={cn("text-xs leading-relaxed text-foreground/80", !narrativeExpanded && "line-clamp-3")}>
            {sexDivergent && maleNarrative && femaleNarrative ? (
              <>
                <div><span className="font-medium">Males:</span> {maleNarrative.summary}</div>
                <div><span className="font-medium">Females:</span> {femaleNarrative.summary}</div>
              </>
            ) : (
              narrative.summary
            )}
          </div>
          <button
            type="button"
            className="mt-0.5 text-[11px] font-medium text-primary hover:underline"
            onClick={() => setNarrativeExpanded((v) => !v)}
          >
            {narrativeExpanded ? "Show less" : "Show more"}
          </button>
        </div>
      )}
    </div>
  );
}
