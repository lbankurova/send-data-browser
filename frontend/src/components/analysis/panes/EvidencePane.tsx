import type { FindingContext, UnifiedFinding } from "@/types/analysis";
import type { FindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import { titleCase, formatPValue } from "@/lib/severity-colors";
import {
  resolveCanonical,
  findClinicalMatchForEndpoint,
  getClinicalTierBadgeClasses,
  getClinicalTierCardBorderClass,
  getClinicalTierCardBgClass,
  describeThreshold,
  findNextThreshold,
  getRelatedRules,
  isLiverParameter,
  getThresholdNumericValue,
} from "@/lib/lab-clinical-catalog";

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

function buildDedupedBullets(
  finding: UnifiedFinding,
  analytics: FindingsAnalytics | undefined,
  statistics: FindingContext["statistics"] | undefined,
  effectSize: FindingContext["effect_size"] | undefined,
): Bullet[] {
  const bullets: Bullet[] = [];
  const isContinuous = statistics?.data_type === "continuous";

  // 1. Significance comparison
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

  // 2. Trend confirmation
  const trendP = statistics?.trend_p;
  if (trendP != null && trendP < 0.05) {
    bullets.push({ text: "Trend test confirms dose-dependence", important: false });
  }

  // 3. Regulatory threshold (BW only)
  if (statistics?.rows && statistics.rows.length >= 2) {
    const domain = finding.domain;
    if (domain === "BW") {
      const control = statistics.rows[0];
      const highest = statistics.rows[statistics.rows.length - 1];
      if (control.mean != null && highest.mean != null && control.mean !== 0) {
        const pct = Math.abs(((highest.mean - control.mean) / Math.abs(control.mean)) * 100);
        if (pct > 10) {
          bullets.push({ text: "BW decrease exceeds 10% regulatory threshold", important: true });
        }
      }
    }
  }

  // 4. Effect rank
  if (effectSize?.largest_effects && effectSize.largest_effects.length > 0) {
    const findingId = finding.id;
    const rank = effectSize.largest_effects.findIndex((e) => e.finding_id === findingId);
    if (rank >= 0) {
      const rankText = rank === 0
        ? `Effect is largest of ${effectSize.total_with_effects} findings (#1 by |d|)`
        : `Effect ranks #${rank + 1} of ${effectSize.total_with_effects} findings by |d|`;
      bullets.push({ text: rankText, important: rank === 0 });
    }
  }

  // 5. (Clinical lab matches moved to dedicated CLINICAL SIGNIFICANCE section below)

  // 6. Syndrome membership
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

  // 7. Organ coherence
  if (analytics?.organCoherence && finding.organ_system) {
    const coh = analytics.organCoherence.get(finding.organ_system);
    if (coh && coh.domainCount >= 2) {
      bullets.push({ text: `${coh.domainCount}-domain convergence in ${titleCase(coh.organ_system)}: ${coh.domains.join(", ")}`, important: false });
    }
  }

  return bullets;
}

// ─── Clinical Significance Section ────────────────────────────

interface ClinicalSection {
  match: LabClinicalMatch | null;
  canonical: string | null;
  isLabEndpoint: boolean;
  relatedRules: { id: string; name: string; severity: string; severityLabel: string; category: string }[];
  firedRuleIds: Set<string>;
}

function buildClinicalSection(
  finding: UnifiedFinding,
  analytics: FindingsAnalytics | undefined,
): ClinicalSection {
  const endpointLabel = finding.endpoint_label ?? finding.finding;
  const canonical = resolveCanonical(endpointLabel);
  const isLabEndpoint = finding.domain === "LB";

  if (!canonical || !analytics?.labMatches.length) {
    return { match: null, canonical, isLabEndpoint, relatedRules: [], firedRuleIds: new Set() };
  }

  const match = findClinicalMatchForEndpoint(endpointLabel, analytics.labMatches);
  const relatedRules = getRelatedRules(canonical);

  const firedRuleIds = new Set<string>();
  for (const m of analytics.labMatches) {
    if (m.matchedEndpoints.some((e) => resolveCanonical(e) === canonical)) {
      firedRuleIds.add(m.ruleId);
    }
  }

  return { match, canonical, isLabEndpoint, relatedRules, firedRuleIds };
}

function ClinicalSignificanceSection({ section }: { section: ClinicalSection }) {
  const { match, canonical, isLabEndpoint, relatedRules, firedRuleIds } = section;

  if (!isLabEndpoint) return null;

  // LB endpoint with no match
  if (!match) {
    const evaluated = canonical ? relatedRules.filter((r) => r.category !== "governance") : [];
    if (evaluated.length === 0 && !canonical) return null;

    return (
      <div className="mt-3 space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Clinical significance
        </div>
        <div className="text-xs text-muted-foreground">
          No clinical thresholds reached
        </div>
        {evaluated.length > 0 && (
          <div className="text-[10px] text-muted-foreground">
            Evaluated: {evaluated.map((r) => `${r.id} (${r.name})`).join(", ")} {"\u2014"} Grade 0
          </div>
        )}
      </div>
    );
  }

  // LB endpoint with a clinical match
  const foldChange = canonical ? match.foldChanges[canonical] : null;
  const thresholdDesc = canonical ? describeThreshold(match.ruleId, canonical) : null;
  const nextThreshold = canonical ? findNextThreshold(match.ruleId, canonical) : null;

  const nonFiredRelated = relatedRules.filter(
    (r) => !firedRuleIds.has(r.id) && r.category !== "governance"
  );

  // Check which non-fired rules are "approaching" (within 20% of threshold)
  const approachingSet = new Set<string>();
  if (foldChange != null && canonical) {
    for (const r of nonFiredRelated) {
      const t = getThresholdNumericValue(r.id, canonical);
      if (t && t.value > 0) {
        const ratio = foldChange / t.value;
        if (ratio >= 0.8) approachingSet.add(r.id);
      }
    }
  }

  const isLiver = canonical ? isLiverParameter(canonical) : false;
  const hysLawRules = isLiver
    ? nonFiredRelated.filter((r) => r.id === "L03" || r.id === "L07" || r.id === "L08")
    : [];
  const otherNonFired = nonFiredRelated.filter(
    (r) => !hysLawRules.some((h) => h.id === r.id)
  );

  return (
    <div className="mt-3 space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Clinical significance
      </div>

      {/* Rule citation card */}
      <div className={`rounded p-2.5 ${getClinicalTierCardBorderClass(match.severity)} ${getClinicalTierCardBgClass(match.severity)}`}>
        <div className="flex items-center justify-between">
          <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${getClinicalTierBadgeClasses(match.severity)}`}>
            {match.severity} {match.severityLabel}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground">Rule {match.ruleId}</span>
        </div>

        {foldChange != null && canonical && (
          <div className="mt-1.5 text-xs text-foreground/80">
            {canonical} {foldChange.toFixed(1)}{"\u00d7"} concurrent control
          </div>
        )}

        {thresholdDesc && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            Threshold: {thresholdDesc}
          </div>
        )}

        <div className="mt-0.5 text-[10px] text-muted-foreground">
          Source: {match.source}
        </div>

        {nextThreshold && (
          <div className="mt-1.5 text-[10px] text-muted-foreground/80">
            Next threshold: {nextThreshold.threshold} {"\u2192"} {nextThreshold.severity} {nextThreshold.severityLabel}
          </div>
        )}
      </div>

      {/* Related rules section */}
      {(hysLawRules.length > 0 || otherNonFired.length > 0) && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Related rules
          </div>
          {hysLawRules.map((r) => {
            const approaching = approachingSet.has(r.id);
            return (
              <div key={r.id} className="text-[10px] text-muted-foreground">
                <span className="font-mono">{r.id}</span> {r.name}:{" "}
                {approaching
                  ? <span className="font-medium text-amber-600">APPROACHING</span>
                  : <span className="font-medium text-green-600">NOT triggered</span>}
                {r.id === "L03" && (
                  <div className="ml-3 text-[9px]">
                    Concurrent ALT + bilirubin elevation required
                  </div>
                )}
                {r.id === "L07" && (
                  <div className="ml-3 text-[9px]">
                    Classic Hy{"\u2019"}s Law pattern not met (ALT + bilirubin {"\u2191"} without ALP {"\u2191"})
                  </div>
                )}
                {r.id === "L08" && (
                  <div className="ml-3 text-[9px]">
                    Nonclinical Hy{"\u2019"}s Law-like pattern not met
                  </div>
                )}
              </div>
            );
          })}
          {otherNonFired.map((r) => {
            const approaching = approachingSet.has(r.id);
            return (
              <div key={r.id} className="text-[10px] text-muted-foreground">
                <span className="font-mono">{r.id}</span> {r.name}:{" "}
                {approaching
                  ? <span className="font-medium text-amber-600">APPROACHING</span>
                  : <>NOT triggered</>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────

export function EvidencePane({ finding, analytics, statistics, effectSize }: Props) {
  const bullets = buildDedupedBullets(finding, analytics, statistics, effectSize);
  const clinicalSection = buildClinicalSection(finding, analytics);

  const hasBullets = bullets.length > 0;
  const hasClinical = clinicalSection.isLabEndpoint;

  if (!hasBullets && !hasClinical) {
    return (
      <div className="text-xs text-muted-foreground">
        No additional evidence to highlight.
      </div>
    );
  }

  return (
    <div>
      {hasBullets && (
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
      )}

      <ClinicalSignificanceSection section={clinicalSection} />
    </div>
  );
}
