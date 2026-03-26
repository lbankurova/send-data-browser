/**
 * NormalizationHeatmap — organ × dose-group table showing normalization
 * metric and BW confounding tier per organ.
 *
 * Method column uses inline override dropdown matching the findings table
 * pattern override UX: violet-tinted cell, right-click to open dropdown,
 * OverridePill for notes when overridden.
 */

import { useState, useMemo } from "react";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";
import { NORM_MODE_SHORT } from "@/lib/organ-weight-normalization";
import { titleCase } from "@/lib/severity-colors";
import { DoseHeader } from "@/components/ui/DoseLabel";
import { OverridePill } from "@/components/ui/OverridePill";
import type { useNormalizationOverrides } from "@/hooks/useNormalizationOverrides";
import type { NormalizationOverride } from "@/types/analysis";

interface DoseGroupInfo {
  dose_level: number;
  label: string;
  dose_value: number | null;
  armcd: string;
}

const MODE_LABELS: Record<string, string> = {
  absolute: "Absolute",
  body_weight: "Ratio to BW",
  brain_weight: "Ratio to brain",
  ancova: "ANCOVA",
};

const MODE_OPTIONS = [
  { value: "absolute", label: "Absolute" },
  { value: "body_weight", label: "Ratio to BW" },
  { value: "brain_weight", label: "Ratio to brain" },
] as const;

interface NormalizationHeatmapProps {
  contexts: NormalizationContext[];
  /** Dose group metadata for column headers (from study metadata). */
  doseGroups?: DoseGroupInfo[];
  /** Override actions — when provided, the Method column becomes editable. */
  overrides?: ReturnType<typeof useNormalizationOverrides>;
  /** Auto-selected mode per organ (uppercase key → mode string). */
  autoModes?: Map<string, string>;
  /** Whether brain data is available (controls brain_weight option visibility). */
  hasBrainData?: boolean;
  /** Max |effect_size| per organ (uppercase key) — shown as second column. */
  organEffectSizes?: Map<string, number>;
  /** Optional callback when the user clicks an organ row (used by context panels). */
  onOrganClick?: (organ: string) => void;
}

interface OrganRow {
  organ: string;
  maxTier: number;
  byDose: Map<string, NormalizationContext>;
}

export function NormalizationHeatmap({ contexts, doseGroups, overrides, autoModes, hasBrainData, organEffectSizes, onOrganClick }: NormalizationHeatmapProps) {
  const doseKeys = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const ctx of contexts) {
      if (!seen.has(ctx.setcd)) {
        seen.add(ctx.setcd);
        result.push(ctx.setcd);
      }
    }
    return result;
  }, [contexts]);

  const doseInfoMap = useMemo(() => {
    const map = new Map<string, DoseGroupInfo>();
    if (doseGroups) {
      for (const dg of doseGroups) {
        map.set(String(dg.dose_level), dg);
      }
    }
    return map;
  }, [doseGroups]);

  const rows = useMemo(() => {
    const organMap = new Map<string, OrganRow>();
    for (const ctx of contexts) {
      let row = organMap.get(ctx.organ);
      if (!row) {
        row = { organ: ctx.organ, maxTier: ctx.tier, byDose: new Map() };
        organMap.set(ctx.organ, row);
      }
      if (ctx.tier > row.maxTier) row.maxTier = ctx.tier;
      row.byDose.set(ctx.setcd, ctx);
    }
    return [...organMap.values()].sort((a, b) => {
      const aG = organEffectSizes?.get(a.organ) ?? 0;
      const bG = organEffectSizes?.get(b.organ) ?? 0;
      return bG - aG || a.organ.localeCompare(b.organ);
    });
  }, [contexts, organEffectSizes]);

  if (rows.length === 0) return null;

  const thClass = "px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";
  const editable = !!overrides;

  return (
    <div className={editable ? "" : "overflow-x-auto"}>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className={`${thClass} text-left`}>Organ</th>
            {organEffectSizes && (
              <th className={`${thClass} text-right`} title="Max organ weight effect size (Hedges' g) across dose groups and sexes">|g|</th>
            )}
            {doseKeys.map((dk) => {
              const info = doseInfoMap.get(dk);
              return (
                <th key={dk} className={`${thClass} text-center`}>
                  {info ? (
                    <DoseHeader
                      level={info.dose_level}
                      label={info.dose_value != null ? String(info.dose_value) : info.label}
                      tooltip={info.label}
                    />
                  ) : dk}
                </th>
              );
            })}
            {editable && (
              <th className={`${thClass} text-right`}>Method</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const override = overrides?.getOverride(row.organ);
            const isOverridden = !!override && override.reason !== "__cleared__";
            const autoMode = autoModes?.get(row.organ) ?? "body_weight";
            const activeMode = isOverridden ? override.mode : autoMode;

            return (
              <tr
                key={row.organ}
                className={[
                  "border-b border-dashed border-border/30",
                  onOrganClick ? "cursor-pointer hover:bg-accent/40" : "",
                ].filter(Boolean).join(" ")}
                onClick={onOrganClick ? () => onOrganClick(row.organ.toLowerCase()) : undefined}
              >
                <td className="whitespace-nowrap px-1.5 py-1 font-medium text-foreground" style={{ width: 1 }}>
                  {titleCase(row.organ)}
                </td>
                {organEffectSizes && (() => {
                  const g = organEffectSizes.get(row.organ);
                  return (
                    <td className="whitespace-nowrap px-1.5 py-1 text-right font-mono text-muted-foreground" style={{ width: 1 }}
                      title={g != null ? `Max organ weight effect size: ${g.toFixed(3)}` : "No effect size data"}
                    >
                      {g != null ? g.toFixed(2) : "\u2014"}
                    </td>
                  );
                })()}
                {doseKeys.map((dk) => {
                  const ctx = row.byDose.get(dk);
                  if (!ctx) {
                    return (
                      <td key={dk} className="px-1.5 py-1 text-center text-muted-foreground/40">
                        &mdash;
                      </td>
                    );
                  }
                  return (
                    <td key={dk} className="px-1.5 py-1 text-center font-mono text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                      {NORM_MODE_SHORT[ctx.activeMode] ?? ctx.activeMode}
                    </td>
                  );
                })}
                {editable && (
                  <td className="px-1.5 py-0.5 bg-violet-50/40" style={{ width: 1, whiteSpace: "nowrap" }}>
                    <NormMethodDropdown
                      organ={row.organ}
                      activeMode={activeMode}
                      autoMode={autoMode}
                      isOverridden={isOverridden}
                      override={override ?? null}
                      overrides={overrides}
                      hasBrainData={hasBrainData ?? false}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Inline Method Override Dropdown ─────────────────────────

function NormMethodDropdown({
  organ,
  activeMode,
  autoMode,
  isOverridden,
  override,
  overrides,
  hasBrainData,
}: {
  organ: string;
  activeMode: string;
  autoMode: string;
  isOverridden: boolean;
  override: NormalizationOverride | null;
  overrides: ReturnType<typeof useNormalizationOverrides>;
  hasBrainData: boolean;
}) {
  const [open, setOpen] = useState(false);

  const availableOptions = MODE_OPTIONS.filter(o => {
    if (o.value === "brain_weight" && !hasBrainData) return false;
    return true;
  });

  const handleSelect = async (value: NormalizationOverride["mode"]) => {
    setOpen(false);
    if (value === autoMode) {
      if (isOverridden) await overrides.removeOverride(organ);
    } else {
      await overrides.saveOverride(organ, value, override?.reason || "Manual override");
    }
  };

  const handleReset = async () => {
    setOpen(false);
    await overrides.removeOverride(organ);
  };

  return (
    <div
      className="relative flex items-center gap-0.5"
      onContextMenu={(e) => { e.preventDefault(); setOpen(!open); }}
    >
      <span
        className="flex-1 text-right font-mono py-0.5 text-muted-foreground cursor-context-menu"
        title={isOverridden
          ? `Overridden (auto: ${MODE_LABELS[autoMode] ?? autoMode})`
          : "Right-click to override method"}
      >
        {MODE_LABELS[activeMode] ?? activeMode}
      </span>
      <div className="w-3 shrink-0">
        <OverridePill
          isOverridden={isOverridden}
          note={override?.reason !== "Manual override" ? override?.reason : undefined}
          user={override?.pathologist}
          timestamp={override?.reviewDate ? new Date(override.reviewDate).toLocaleDateString() : undefined}
          onSaveNote={(text) => overrides.saveOverride(organ, (override?.mode ?? activeMode) as NormalizationOverride["mode"], text)}
          placeholder="BW effect is transient — ratio is acceptable"
          popoverSide="top"
          popoverAlign="end"
        />
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 min-w-[140px] rounded border border-border bg-background py-1 shadow-md">
            {availableOptions.map((opt) => {
              const isActive = opt.value === activeMode;
              const isAuto = opt.value === autoMode;
              return (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  disabled={overrides.isSaving}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                    isActive
                      ? "bg-muted/50 font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isAuto && isOverridden && (
                    <span className="ml-auto text-[11px] text-muted-foreground/50">auto</span>
                  )}
                </button>
              );
            })}
            {isOverridden && (
              <button
                onClick={handleReset}
                disabled={overrides.isSaving}
                className="flex w-full items-center px-3 py-1.5 text-left text-xs text-muted-foreground/60 hover:bg-muted/30 hover:text-foreground transition-colors border-t border-border/40"
              >
                Reset to auto
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
