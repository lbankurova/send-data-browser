/**
 * NormalizationHeatmap — compact organ × dose-group matrix showing
 * normalization mode and tier for each OM organ at a glance.
 *
 * Placement: CollapsiblePane inside OrganContextPanel or FindingsContextPanel
 * empty state (when OM findings present).
 */

import { useMemo } from "react";
import type { NormalizationContext } from "@/lib/organ-weight-normalization";
import { NORM_MODE_SHORT, NORM_TIER_COLOR } from "@/lib/organ-weight-normalization";
import { titleCase } from "@/lib/severity-colors";

interface NormalizationHeatmapProps {
  contexts: NormalizationContext[];
  /** Optional callback when the user clicks an organ row. */
  onOrganClick?: (organ: string) => void;
}

interface OrganRow {
  organ: string;
  maxTier: number;
  /** Map from setcd → context for this organ. */
  byDose: Map<string, NormalizationContext>;
}

export function NormalizationHeatmap({ contexts, onOrganClick }: NormalizationHeatmapProps) {
  // Derive unique dose groups (ordered by first appearance — typically ascending)
  const doseGroups = useMemo(() => {
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

  // Group contexts by organ, compute max tier per organ
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
    // Sort by tier descending (highest concern first), then organ name
    return [...organMap.values()].sort(
      (a, b) => b.maxTier - a.maxTier || a.organ.localeCompare(b.organ),
    );
  }, [contexts]);

  if (rows.length === 0) return null;

  return (
    <div>
      <p className="mb-1.5 text-[10px] leading-relaxed text-muted-foreground">
        Statistical metric used per organ and dose group. Higher tiers indicate greater body weight confounding.
      </p>
      <div className="overflow-x-auto">
      <table className="w-full text-[9px]">
        <thead>
          <tr className="text-muted-foreground">
            <th className="whitespace-nowrap py-0.5 pr-2 text-left font-medium" title="Organ with OM (organ measurement) findings">Organ</th>
            {doseGroups.map((dg) => (
              <th key={dg} className="whitespace-nowrap px-1 py-0.5 text-center font-medium" title={`Dose group ${dg} — metric selected for effect size computation`}>
                {dg}
              </th>
            ))}
            <th className="whitespace-nowrap py-0.5 pl-2 text-right font-medium" title="BW confounding tier (1 = none, 2 = moderate, 3 = strong, 4 = severe)">Tier</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.organ}
              className={onOrganClick ? "cursor-pointer hover:bg-accent/40" : ""}
              onClick={() => onOrganClick?.(row.organ.toLowerCase())}
            >
              <td className="whitespace-nowrap py-0.5 pr-2 font-medium text-foreground">
                {titleCase(row.organ)}
              </td>
              {doseGroups.map((dg) => {
                const ctx = row.byDose.get(dg);
                if (!ctx) {
                  return (
                    <td key={dg} className="px-1 py-0.5 text-center text-muted-foreground/40">
                      &mdash;
                    </td>
                  );
                }
                const color = NORM_TIER_COLOR[ctx.tier] ?? "#9ca3af";
                return (
                  <td key={dg} className="px-1 py-0.5 text-center">
                    <span
                      className="inline-block rounded px-1 py-px font-mono text-[8px] font-medium"
                      style={{
                        backgroundColor: `${color}18`,
                        color,
                        border: `1px solid ${color}40`,
                      }}
                    >
                      {NORM_MODE_SHORT[ctx.activeMode] ?? ctx.activeMode}
                    </span>
                  </td>
                );
              })}
              <td
                className="whitespace-nowrap py-0.5 pl-2 text-right font-mono font-semibold"
                style={{ color: NORM_TIER_COLOR[row.maxTier] ?? "#9ca3af" }}
              >
                T{row.maxTier}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
