import type { FindingContext, UnifiedFinding } from "@/types/analysis";
import type { FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import { titleCase, formatPValue } from "@/lib/severity-colors";
import { resolveCanonical } from "@/lib/lab-clinical-catalog";

// ─── Types ─────────────────────────────────────────────────

interface Props {
  finding: UnifiedFinding;
  analytics?: FindingsAnalytics;
  statistics?: FindingContext["statistics"];
  effectSize?: FindingContext["effect_size"];
}

interface Bullet {
  text: string;
  important: boolean;
}

// ─── Deduplicated bullet builder ────────────────────────────
// Each bullet must add info NOT already in Verdict.
// Dropped: confidence classification, pattern label, effect size number,
//          trend p number, % change number.

function buildDedupedBullets(
  finding: UnifiedFinding,
  analytics: FindingsAnalytics | undefined,
  statistics: FindingContext["statistics"] | undefined,
  effectSize: FindingContext["effect_size"] | undefined,
): Bullet[] {
  const bullets: Bullet[] = [];
  const isContinuous = statistics?.data_type === "continuous";

  // 1. Significance comparison — which doses did/didn't reach significance
  if (statistics?.rows && statistics.rows.length >= 2) {
    const sigDoses: string[] = [];
    const nonSigDoses: string[] = [];
    const testName = isContinuous ? "Dunnett\u2019s" : "Fisher\u2019s exact";

    for (let i = 1; i < statistics.rows.length; i++) {
      const row = statistics.rows[i];
      const p = row.p_value_adj ?? row.p_value;
      const doseStr = row.dose_value != null
        ? `${row.dose_value} ${row.dose_unit ?? "mg/kg"}`.trim()
        : row.label;
      if (p != null && p < 0.05) {
        sigDoses.push(`${doseStr} (p${formatPValue(p) === "<0.0001" ? "<0.0001" : `=${formatPValue(p)}`}, ${testName})`);
      } else {
        nonSigDoses.push(doseStr);
      }
    }

    if (sigDoses.length > 0) {
      const sigPart = `Significant at ${sigDoses.join(", ")}`;
      const nonSigPart = nonSigDoses.length > 0 ? `, not at ${nonSigDoses.join(" or ")}` : "";
      bullets.push({ text: `${sigPart}${nonSigPart}`, important: false });
    } else {
      bullets.push({ text: "No dose groups reached significance", important: false });
    }
  }

  // 2. Trend confirmation — interpretation, not the number
  const trendP = statistics?.trend_p;
  if (trendP != null && trendP < 0.05) {
    bullets.push({ text: "Trend test confirms dose-dependence", important: false });
  }

  // 3. Regulatory threshold — only for BW endpoints when |%| > 10
  if (statistics?.rows && statistics.rows.length >= 2) {
    const domain = finding.domain;
    if (domain === "BW") {
      const control = statistics.rows[0];
      const highest = statistics.rows[statistics.rows.length - 1];
      if (control.mean != null && highest.mean != null && control.mean !== 0) {
        const pct = Math.abs(((highest.mean - control.mean) / Math.abs(control.mean)) * 100);
        if (pct > 10) {
          bullets.push({ text: `BW decrease exceeds 10% regulatory threshold`, important: true });
        }
      }
    }
  }

  // 4. Effect rank — comparative context
  if (effectSize?.largest_effects && effectSize.largest_effects.length > 0) {
    const findingId = finding.id;
    const rank = effectSize.largest_effects.findIndex((e) => e.finding_id === findingId);
    if (rank >= 0) {
      const rankText = rank === 0
        ? `Effect is largest of ${effectSize.total_with_effects} findings (#1 by |d|)`
        : `Effect ranks #${rank + 1} of ${effectSize.total_with_effects} findings by |d|`;
      bullets.push({
        text: rankText,
        important: rank === 0,
      });
    }
  }

  // 5. Clinical lab matches (unique — fold change provenance)
  if (analytics?.labMatches.length) {
    const endpointLabel = finding.endpoint_label ?? finding.finding;
    const canonical = resolveCanonical(endpointLabel);
    if (canonical) {
      for (const match of analytics.labMatches) {
        if (match.matchedEndpoints.some((e) => resolveCanonical(e) === canonical)) {
          const fcDetails = Object.entries(match.foldChanges)
            .map(([k, v]) => `${k} ${v.toFixed(1)}x`)
            .join(", ");
          const fcSuffix = fcDetails ? ` \u2014 ${fcDetails}` : "";
          bullets.push({ text: `${match.severityLabel}: ${match.ruleName}${fcSuffix}`, important: false });
        }
      }
    }
  }

  // 6. Syndrome membership (unique — cross-domain pattern)
  if (analytics?.syndromes.length) {
    const endpointLabel = (finding.endpoint_label ?? finding.finding).toLowerCase();
    for (const syn of analytics.syndromes) {
      if (syn.matchedEndpoints.some((m) => m.endpoint_label.toLowerCase() === endpointLabel)) {
        const others = syn.matchedEndpoints
          .filter((m) => m.endpoint_label.toLowerCase() !== endpointLabel)
          .map((m) => m.endpoint_label)
          .slice(0, 3);
        const suffix = others.length > 0 ? `: ${others.join(", ")}` : "";
        bullets.push({ text: `Part of ${syn.name} syndrome (${syn.confidence.toLowerCase()})${suffix}`, important: false });
      }
    }
  }

  // 7. Organ coherence (unique — multi-domain convergence)
  if (analytics?.organCoherence && finding.organ_system) {
    const coh = analytics.organCoherence.get(finding.organ_system);
    if (coh && coh.domainCount >= 2) {
      bullets.push({ text: `${coh.domainCount}-domain convergence in ${titleCase(coh.organ_system)}: ${coh.domains.join(", ")}`, important: false });
    }
  }

  return bullets;
}

// ─── Component ──────────────────────────────────────────────

export function EvidencePane({ finding, analytics, statistics, effectSize }: Props) {
  const bullets = buildDedupedBullets(finding, analytics, statistics, effectSize);

  if (bullets.length === 0) {
    return (
      <div className="text-xs text-muted-foreground">
        No additional evidence to highlight.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {bullets.map((b, i) => (
        <div
          key={i}
          className={`border-l-2 pl-2 text-xs text-foreground/80 ${
            b.important ? "border-amber-400" : "border-primary/30"
          }`}
        >
          {b.text}
        </div>
      ))}
    </div>
  );
}
