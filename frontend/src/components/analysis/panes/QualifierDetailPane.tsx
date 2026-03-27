/**
 * QualifierDetailPane — full SUPP qualifier breakdown for MI/MA findings.
 *
 * Shows distribution, temporality, and location counts per qualifier value
 * with subject fractions. The table's Dist/Temp columns show only the dominant
 * value or "mixed" — this pane shows the full picture.
 */

import type { UnifiedFinding } from "@/types/analysis";

interface QualifierDetailPaneProps {
  finding: UnifiedFinding;
}

interface QualifierSection {
  label: string;
  counts: Record<string, number>;
  dominant: string | null;
  nTotal: number;
}

export function QualifierDetailPane({ finding }: QualifierDetailPaneProps) {
  const mp = finding.modifier_profile;
  if (!mp) return null;

  const nTotal = mp.n_total ?? mp.n_with_modifiers ?? 0;
  if (nTotal === 0) return null;

  const sections: QualifierSection[] = [];

  if (mp.distribution && Object.keys(mp.distribution).length > 0) {
    sections.push({
      label: "Distribution",
      counts: mp.distribution,
      dominant: mp.dominant_distribution ?? null,
      nTotal,
    });
  }

  if (mp.temporality && Object.keys(mp.temporality).length > 0) {
    sections.push({
      label: "Temporality",
      counts: mp.temporality,
      dominant: mp.dominant_temporality ?? null,
      nTotal,
    });
  }

  if (mp.location && Object.keys(mp.location).length > 0) {
    sections.push({
      label: "Location",
      counts: mp.location,
      dominant: null,
      nTotal,
    });
  }

  if (mp.laterality && Object.keys(mp.laterality).length > 0) {
    sections.push({
      label: "Laterality",
      counts: mp.laterality,
      dominant: null,
      nTotal,
    });
  }

  if (sections.length === 0) return null;

  return (
    <div className="space-y-3 text-xs">
      <div className="text-[10px] text-muted-foreground">
        {mp.n_with_modifiers ?? 0} of {nTotal} subjects with qualifiers recorded
      </div>
      {sections.map(section => (
        <QualifierTable key={section.label} section={section} />
      ))}
    </div>
  );
}

function QualifierTable({ section }: { section: QualifierSection }) {
  const sorted = Object.entries(section.counts).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {section.label}
      </div>
      <table className="w-full text-xs">
        <tbody>
          {sorted.map(([value, count]) => {
            const pct = section.nTotal > 0 ? Math.round((count / section.nTotal) * 100) : 0;
            const isDominant = section.dominant === value;
            return (
              <tr key={value} className="border-b border-border/30 last:border-0">
                <td className="py-0.5 pr-2">
                  {value}
                  {isDominant && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground">(dominant)</span>
                  )}
                </td>
                <td className="py-0.5 text-right font-mono text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                  {count}/{section.nTotal}
                </td>
                <td className="py-0.5 pl-1.5 text-right font-mono text-muted-foreground" style={{ width: 1, whiteSpace: "nowrap" }}>
                  {pct}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
