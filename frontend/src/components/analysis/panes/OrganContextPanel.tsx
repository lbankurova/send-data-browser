/**
 * OrganContextPanel — group-level context panel shown when an organ group
 * card header is clicked in Organ grouping mode.
 *
 * Displays: Convergence, Organ NOAEL, Related Syndromes, Member Endpoints.
 */

import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useFindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import { useFindings } from "@/hooks/useFindings";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import {
  titleCase,
  getDirectionSymbol,
  formatPValue,
  formatEffectSize,
} from "@/lib/severity-colors";
import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import { getSyndromeNearMissInfo } from "@/lib/cross-domain-syndromes";
import { findClinicalMatchForEndpoint, getClinicalTierTextClass, getClinicalTierCardBorderClass, getClinicalSeverityLabel } from "@/lib/lab-clinical-catalog";
import type { FindingsFilters, UnifiedFinding } from "@/types/analysis";

// ─── Constants ─────────────────────────────────────────────

/** Static empty filters — fetch all findings */
const ALL_FILTERS: FindingsFilters = {
  domain: null, sex: null, severity: null, search: "",
  organ_system: null, endpoint_label: null, dose_response_pattern: null,
};

/** Organ → relevant syndrome IDs, per spec */
const ORGAN_SYNDROME_MAP: Record<string, string[]> = {
  hepatic: ["XS01", "XS02", "XS06"],
  renal: ["XS03"],
  hematologic: ["XS04", "XS05"],
  immune: ["XS07", "XS08"],
  general: ["XS08", "XS09"],
};

/** Domain code → human-readable name for convergence text */
const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  LB: "Blood chemistry",
  BW: "Body weight",
  OM: "Organ weight",
  MI: "Microscopy",
  MA: "Macroscopy",
  CL: "Clinical observations",
  TF: "Tumor findings",
  PM: "Palpable masses",
};

// ─── NOAEL computation ─────────────────────────────────────

/**
 * More robust NOAEL computation using the full findings data.
 * Returns sorted list with dose labels.
 */
interface EndpointNoaelDisplay {
  endpoint_label: string;
  noaelLabel: string;
  noaelDoseLevel: number; // for sorting: -1 = below range, 0+ = dose level, Infinity = all clear
  isDriving: boolean;
}

function computeOrganNoaelDisplay(
  findings: UnifiedFinding[],
  organEndpoints: EndpointSummary[],
  doseGroups?: Array<{ dose_level: number; dose_value: number | null; dose_unit: string | null; label: string }>,
): { organNoael: string; drivingEndpoint: string; endpoints: EndpointNoaelDisplay[] } {
  const endpointLabels = new Set(organEndpoints.map(e => e.endpoint_label));

  // Group findings by endpoint
  const byEndpoint = new Map<string, UnifiedFinding[]>();
  for (const f of findings) {
    const label = f.endpoint_label ?? f.finding;
    if (!endpointLabels.has(label)) continue;
    let list = byEndpoint.get(label);
    if (!list) {
      list = [];
      byEndpoint.set(label, list);
    }
    list.push(f);
  }

  // Build dose_level → human-readable dose label from dose groups
  const doseLabelMap = new Map<number, string>();
  if (doseGroups) {
    for (const dg of doseGroups) {
      if (dg.dose_value != null && dg.dose_unit) {
        doseLabelMap.set(dg.dose_level, `${dg.dose_value} ${dg.dose_unit}`);
      } else if (dg.label) {
        doseLabelMap.set(dg.dose_level, dg.label);
      }
    }
  }

  function getDoseLabel(level: number): string {
    return doseLabelMap.get(level) ?? `Level ${level}`;
  }

  const results: EndpointNoaelDisplay[] = [];
  let minNoaelLevel = Infinity;
  let drivingEndpoint = "";

  for (const epSummary of organEndpoints) {
    const label = epSummary.endpoint_label;
    const epFindings = byEndpoint.get(label);

    if (!epFindings || epFindings.length === 0) {
      results.push({
        endpoint_label: label,
        noaelLabel: "No data",
        noaelDoseLevel: Infinity,
        isDriving: false,
      });
      continue;
    }

    // Aggregate pairwise across ALL findings (both sexes) — take min p-value per dose
    const doseMinP = new Map<number, number>();
    let hasPairwise = false;
    for (const f of epFindings) {
      for (const pw of f.pairwise ?? []) {
        if (pw.dose_level <= 0) continue;
        hasPairwise = true;
        const p = pw.p_value_adj ?? pw.p_value;
        if (p != null) {
          const prev = doseMinP.get(pw.dose_level);
          if (prev == null || p < prev) doseMinP.set(pw.dose_level, p);
        }
      }
    }

    if (!hasPairwise) {
      results.push({
        endpoint_label: label,
        noaelLabel: "No stats",
        noaelDoseLevel: Infinity,
        isDriving: false,
      });
      continue;
    }

    // Sort dose levels ascending
    const sorted = [...doseMinP.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([dose_level, p]) => ({ dose_level, p }));

    // Find LOAEL
    let loaelIdx = -1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].p < 0.05) {
        loaelIdx = i;
        break;
      }
    }

    let noaelLevel: number;
    let noaelLabel: string;

    if (loaelIdx === -1) {
      // No significant doses — NOAEL >= highest dose
      const highestLevel = sorted[sorted.length - 1]?.dose_level ?? 0;
      noaelLevel = highestLevel + 1000; // large sentinel for sorting
      noaelLabel = `>= ${getDoseLabel(highestLevel)}`;
    } else if (loaelIdx === 0) {
      // LOAEL at lowest dose → NOAEL below range
      noaelLevel = -1;
      noaelLabel = `< ${getDoseLabel(sorted[0].dose_level)}`;
    } else {
      // NOAEL = dose just below LOAEL
      noaelLevel = sorted[loaelIdx - 1].dose_level;
      noaelLabel = getDoseLabel(noaelLevel);
    }

    if (noaelLevel < minNoaelLevel) {
      minNoaelLevel = noaelLevel;
      drivingEndpoint = label;
    }

    results.push({
      endpoint_label: label,
      noaelLabel,
      noaelDoseLevel: noaelLevel,
      isDriving: false, // Set below
    });
  }

  // Mark driving endpoint and sort
  for (const r of results) {
    r.isDriving = r.endpoint_label === drivingEndpoint;
  }
  results.sort((a, b) => a.noaelDoseLevel - b.noaelDoseLevel);

  // Organ NOAEL label — use the driving endpoint's label
  let organNoael = "Not established";
  const drivingResult = results.find(r => r.isDriving);
  if (drivingResult) {
    organNoael = drivingResult.noaelLabel;
  }

  return { organNoael, drivingEndpoint, endpoints: results };
}

// ─── Component ─────────────────────────────────────────────

interface OrganContextPanelProps {
  organKey: string;
}

export function OrganContextPanel({ organKey }: OrganContextPanelProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { selectFinding, selectGroup } = useFindingSelection();
  const analytics = useFindingsAnalytics();
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // Fetch all findings data (shared cache with FindingsView)
  const { data: rawData } = useFindings(studyId, 1, 10000, ALL_FILTERS);

  // Use shared derivation — single source of truth (includes all fields)
  const organEndpoints = useMemo(
    () => analytics.endpoints.filter(ep => ep.organ_system === organKey),
    [analytics.endpoints, organKey],
  );

  // Coherence data from analytics context
  const coherence = analytics.organCoherence.get(organKey);

  // Signal scores for sorting member endpoints
  const sortedEndpoints = useMemo(() => {
    return [...organEndpoints].sort((a, b) => {
      const sa = analytics.signalScores.get(a.endpoint_label) ?? 0;
      const sb = analytics.signalScores.get(b.endpoint_label) ?? 0;
      return sb - sa;
    });
  }, [organEndpoints, analytics.signalScores]);

  // Stats
  const totalEndpoints = organEndpoints.length;
  const adverseCount = organEndpoints.filter(e => e.worstSeverity === "adverse").length;
  const domains = [...new Set(organEndpoints.map(e => e.domain))].sort();

  // ── Convergence pane data ────────────────────────────────
  const domainBreakdown = useMemo(() => {
    const map = new Map<string, EndpointSummary[]>();
    for (const ep of organEndpoints) {
      if (ep.worstSeverity !== "adverse" && ep.worstSeverity !== "warning") continue;
      let list = map.get(ep.domain);
      if (!list) {
        list = [];
        map.set(ep.domain, list);
      }
      list.push(ep);
    }
    return [...map.entries()]
      .map(([domain, eps]) => ({
        domain,
        endpoints: eps.map(e => e.endpoint_label),
        count: eps.length,
      }))
      .sort((a, b) => b.count - a.count);
  }, [organEndpoints]);

  const convergenceLabel = coherence?.convergenceLabel ?? (
    domains.length >= 3 ? "3-domain convergence" :
    domains.length >= 2 ? "2-domain convergence" :
    "Single domain"
  );

  const convergenceInterpretation = useMemo(() => {
    const significantDomains = domainBreakdown.map(d => d.domain);
    const domainNames = significantDomains.map(d => DOMAIN_DESCRIPTIONS[d.toUpperCase()] ?? d);
    const organName = titleCase(organKey);

    // Domains present in the organ but all findings are normal
    const normalOnlyDomains = domains.filter(d => !significantDomains.includes(d));
    const normalSuffix = normalOnlyDomains.length > 0
      ? ` ${normalOnlyDomains.join(", ")} findings all normal.`
      : "";

    if (significantDomains.length >= 3) {
      return `${domainNames.join(", ")} all indicate ${organName.toLowerCase()} effects. This cross-domain convergence strengthens the weight of evidence for ${organName.toLowerCase()} as a target organ.${normalSuffix}`;
    }
    if (significantDomains.length === 2) {
      return `${domainNames[0]} and ${domainNames[1]} both show ${organName.toLowerCase()} effects, providing convergent evidence.${normalSuffix}`;
    }
    if (significantDomains.length === 1) {
      return `Evidence limited to ${domainNames[0]} findings only. No corroborating data from other domains.${normalSuffix}`;
    }
    return "No adverse or warning findings in this organ system.";
  }, [domainBreakdown, domains, organKey]);

  // ── Organ NOAEL pane data ────────────────────────────────
  const noaelData = useMemo(() => {
    if (!rawData?.findings) return null;
    return computeOrganNoaelDisplay(rawData.findings, organEndpoints, rawData.dose_groups);
  }, [rawData, organEndpoints]);

  // ── Clinical severity per endpoint ──────────────────────
  const clinicalMap = useMemo(() => {
    const map = new Map<string, { tier: string; ruleId: string }>();
    for (const ep of organEndpoints) {
      const match = findClinicalMatchForEndpoint(ep.endpoint_label, analytics.labMatches, ep.testCode);
      if (match) {
        map.set(ep.endpoint_label, { tier: match.severity, ruleId: match.ruleId });
      }
    }
    return map;
  }, [organEndpoints, analytics.labMatches]);

  // Worst clinical across all endpoints in this organ
  const worstClinical = useMemo(() => {
    const sevOrder: Record<string, number> = { S4: 4, S3: 3, S2: 2, S1: 1 };
    let worst: { tier: string; ruleId: string; endpoint: string } | null = null;
    for (const [label, { tier, ruleId }] of clinicalMap) {
      if (!worst || (sevOrder[tier] ?? 0) > (sevOrder[worst.tier] ?? 0)) {
        worst = { tier, ruleId, endpoint: label };
      }
    }
    return worst;
  }, [clinicalMap]);

  // ── Related syndromes ────────────────────────────────────
  const relevantSyndromeIds = useMemo(
    () => ORGAN_SYNDROME_MAP[organKey.toLowerCase()] ?? [],
    [organKey],
  );
  const hasRelevantSyndromes = relevantSyndromeIds.length > 0;

  const relatedSyndromes = useMemo(() => {
    if (!hasRelevantSyndromes) return [];
    return relevantSyndromeIds.map(id => {
      const detected = analytics.syndromes.find(s => s.id === id);
      return { id, detected };
    });
  }, [relevantSyndromeIds, hasRelevantSyndromes, analytics.syndromes]);

  // ── Handlers ─────────────────────────────────────────────
  const handleEndpointClick = (endpointLabel: string) => {
    if (!rawData?.findings) return;
    // Find the best finding for this endpoint and select it
    const epFindings = rawData.findings.filter(
      f => (f.endpoint_label ?? f.finding) === endpointLabel
    );
    if (epFindings.length === 0) return;
    // Pick best: min p-value, then max effect size
    const best = epFindings.reduce((b, f) => {
      const bestP = b.min_p_adj ?? Infinity;
      const fP = f.min_p_adj ?? Infinity;
      if (fP < bestP) return f;
      if (fP === bestP && Math.abs(f.max_effect_size ?? 0) > Math.abs(b.max_effect_size ?? 0)) return f;
      return b;
    });
    selectFinding(best);
  };

  const handleClose = () => {
    selectGroup(null, null);
  };

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{titleCase(organKey)}</h3>
          <div className="flex items-center gap-1">
            <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
            <button
              className="rounded p-0.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              onClick={handleClose}
              title="Close"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {totalEndpoints} endpoint{totalEndpoints !== 1 ? "s" : ""} · {domains.length} domain{domains.length !== 1 ? "s" : ""} ({domains.join(", ")}) · {adverseCount} adverse
        </p>
      </div>

      {/* Pane 1: CONVERGENCE — always visible, not collapsible */}
      <div className="border-b px-4 py-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Convergence
        </div>
        <div className="mb-2 text-xs font-semibold">{convergenceLabel}</div>
        {domainBreakdown.map(({ domain, endpoints, count }) => (
          <div key={domain} className="flex items-start gap-2 py-0.5">
            <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">
              {domain.toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={endpoints.join(", ")}>
              {endpoints.join(", ")}
            </span>
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {count} endpt
            </span>
          </div>
        ))}
        {domainBreakdown.length > 0 && (
          <p className="mt-2 text-xs leading-relaxed text-foreground/80">
            {convergenceInterpretation}
          </p>
        )}
      </div>

      {/* Pane 2: ORGAN NOAEL */}
      <CollapsiblePane title="Organ NOAEL" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {noaelData ? (
          <div>
            <div className="text-sm font-semibold">
              NOAEL: {noaelData.organNoael}
            </div>
            {noaelData.drivingEndpoint && (
              <div className="text-[10px] text-muted-foreground">
                (driven by {noaelData.drivingEndpoint} — lowest endpoint NOAEL)
              </div>
            )}
            {worstClinical && (
              <div className={`mb-2 text-xs font-medium ${getClinicalTierTextClass(worstClinical.tier)}`}>
                Worst clinical: {worstClinical.tier} {getClinicalSeverityLabel(worstClinical.tier)} ({worstClinical.endpoint}, rule {worstClinical.ruleId})
              </div>
            )}
            {!worstClinical && noaelData.drivingEndpoint && <div className="mb-2" />}
            <div className="space-y-0.5">
              {noaelData.endpoints.map(ep => {
                const clinical = clinicalMap.get(ep.endpoint_label);
                return (
                  <div
                    key={ep.endpoint_label}
                    className={`flex items-center gap-1 text-xs ${
                      clinical ? `pl-1.5 ${getClinicalTierCardBorderClass(clinical.tier)}` : ""
                    } ${ep.isDriving ? "font-medium text-foreground" : "text-muted-foreground"}`}
                  >
                    <span className="min-w-0 flex-1 truncate">{ep.endpoint_label}</span>
                    <span className="shrink-0">{ep.noaelLabel}</span>
                    {clinical ? (
                      <span className={`shrink-0 font-mono text-[9px] ${getClinicalTierTextClass(clinical.tier)}`}>
                        {clinical.tier} {clinical.ruleId}
                      </span>
                    ) : (
                      <span className="shrink-0 font-mono text-[9px] text-muted-foreground/40">{"\u2014"}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No NOAEL data available.</p>
        )}
      </CollapsiblePane>

      {/* Pane 3: RELATED SYNDROMES (only for organs with syndrome associations) */}
      {hasRelevantSyndromes && (
        <CollapsiblePane title="Related syndromes" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-2">
            {relatedSyndromes.map(({ id, detected }) => (
              <RelatedSyndromeRow
                key={id}
                syndromeId={id}
                detected={detected ?? null}
                organEndpoints={organEndpoints}
                onSyndromeClick={(sid) => selectGroup("syndrome", sid)}
              />
            ))}
          </div>
        </CollapsiblePane>
      )}

      {/* Pane 4: MEMBER ENDPOINTS */}
      <CollapsiblePane title="Member endpoints" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-0.5">
          {sortedEndpoints.map(ep => (
            <MemberEndpointRow
              key={ep.endpoint_label}
              endpoint={ep}
              onClick={() => handleEndpointClick(ep.endpoint_label)}
            />
          ))}
          {sortedEndpoints.length === 0 && (
            <p className="text-xs text-muted-foreground">No endpoints in this organ.</p>
          )}
        </div>
      </CollapsiblePane>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

/** Syndrome name map for display */
const SYNDROME_NAMES: Record<string, string> = {
  XS01: "Hepatocellular injury",
  XS02: "Cholestatic injury",
  XS03: "Nephrotoxicity",
  XS04: "Myelosuppression",
  XS05: "Hemolytic anemia",
  XS06: "Phospholipidosis",
  XS07: "Immunotoxicity",
  XS08: "Stress response",
  XS09: "Target organ wasting",
};

function RelatedSyndromeRow({
  syndromeId,
  detected,
  organEndpoints,
  onSyndromeClick,
}: {
  syndromeId: string;
  detected: CrossDomainSyndrome | null;
  organEndpoints: EndpointSummary[];
  onSyndromeClick: (id: string) => void;
}) {
  const name = detected?.name ?? SYNDROME_NAMES[syndromeId] ?? syndromeId;

  if (detected) {
    // Detected syndrome: show confidence + member endpoints from this organ
    const organLabels = organEndpoints.map(e => e.endpoint_label);
    const memberEps = detected.matchedEndpoints
      .filter(m => organLabels.includes(m.endpoint_label))
      .map(m => m.endpoint_label);

    return (
      <div>
        <div className="flex items-center gap-2">
          <button
            className="text-xs font-medium text-foreground hover:underline"
            onClick={() => onSyndromeClick(syndromeId)}
          >
            {name} ({syndromeId})
          </button>
          <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
            {detected.confidence}
          </span>
        </div>
        {memberEps.length > 0 && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {memberEps.join(", ")}
          </div>
        )}
      </div>
    );
  }

  // Not detected — show as near-miss with explanation
  const nearMiss = getSyndromeNearMissInfo(syndromeId, organEndpoints);

  return (
    <div>
      <div className="flex items-center gap-2">
        <button
          className="text-xs text-muted-foreground hover:underline"
          onClick={() => onSyndromeClick(syndromeId)}
        >
          {name} ({syndromeId})
        </button>
        <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
          not detected
        </span>
      </div>
      {nearMiss && (
        <div className="mt-0.5 space-y-0.5 text-[10px] text-muted-foreground">
          <div>Would require: {nearMiss.wouldRequire}</div>
          {nearMiss.matched.length > 0 && nearMiss.missing.length > 0 && (
            <div>
              {nearMiss.matched.join(", ")} present but {nearMiss.missing.join(", ")} not found
            </div>
          )}
          {nearMiss.matched.length === 0 && (
            <div>None of the required terms found</div>
          )}
        </div>
      )}
    </div>
  );
}

function MemberEndpointRow({
  endpoint,
  onClick,
}: {
  endpoint: EndpointSummary;
  onClick: () => void;
}) {
  const dirSymbol = getDirectionSymbol(endpoint.direction);
  return (
    <button
      className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">
        {endpoint.domain.toUpperCase()}
      </span>
      <span className="min-w-0 flex-1 truncate" title={endpoint.endpoint_label}>
        {endpoint.endpoint_label}
      </span>
      <span className="shrink-0 text-muted-foreground">{dirSymbol}</span>
      {endpoint.maxEffectSize != null && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          |d|={formatEffectSize(endpoint.maxEffectSize)}
        </span>
      )}
      {endpoint.minPValue != null && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          p={formatPValue(endpoint.minPValue)}
        </span>
      )}
      <SeverityDot severity={endpoint.worstSeverity} />
    </button>
  );
}

function SeverityDot({ severity }: { severity: "adverse" | "warning" | "normal" }) {
  const color =
    severity === "adverse" ? "bg-red-500" :
    severity === "warning" ? "bg-amber-500" :
    "bg-gray-400";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${color}`} />;
}
