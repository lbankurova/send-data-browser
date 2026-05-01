/**
 * OrganContextPanel — group-level context panel shown when an organ group
 * card header is clicked in Organ grouping mode.
 *
 * Displays: Convergence, Organ NOAEL, Related Syndromes, Member Endpoints.
 */

import { useMemo, useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useFindingSelection } from "@/contexts/FindingSelectionContext";
import { useFindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import { useFindings } from "@/hooks/useFindings";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { CollapsiblePane } from "./CollapsiblePane";
import { ContextPanelHeader } from "./ContextPanelHeader";
import { titleCase } from "@/lib/severity-colors";
import type { EndpointSummary } from "@/lib/derive-summaries";
import { findClinicalMatchForEndpoint, getClinicalTierTextClass, getClinicalTierCardBorderClass, getClinicalSeverityLabel } from "@/lib/lab-clinical-catalog";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { useNormalizationOverrides } from "@/hooks/useNormalizationOverrides";
import { OverridePill } from "@/components/ui/OverridePill";
import { useStatMethods } from "@/hooks/useStatMethods";
import { getTierSeverityLabel, getOrganCorrelationCategory } from "@/lib/organ-weight-normalization";
import { NormalizationHeatmap } from "./NormalizationHeatmap";
import { CorrelationMatrixPane } from "./CorrelationMatrixPane";
import { useOrganCorrelations } from "@/hooks/useOrganCorrelations";
import { computeOrganNoaelDisplay } from "@/lib/organ-noael";
import type { FindingsFilters, NormalizationOverride } from "@/types/analysis";

// ─── Constants ─────────────────────────────────────────────

/** Static empty filters — fetch all findings */
const ALL_FILTERS: FindingsFilters = {
  domain: null, sex: null, severity: null, search: "",
  organ_system: null, endpoint_label: null, dose_response_pattern: null,
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

// ─── Component ─────────────────────────────────────────────

interface OrganContextPanelProps {
  organKey: string;
  nav?: { canGoBack: boolean; canGoForward: boolean; onBack: () => void; onForward: () => void; };
}

// ─── Normalization mode labels ────────────────────────────
const MODE_LABELS: Record<string, string> = {
  absolute: "Absolute weight",
  body_weight: "Ratio to body weight",
  brain_weight: "Ratio to brain weight",
  ancova: "ANCOVA-adjusted",
};

const MODE_OPTIONS: NormalizationOverride["mode"][] = [
  "absolute", "body_weight", "brain_weight", "ancova",
];

// ─── Normalization display sub-component ─────────────────
function NormalizationModeDisplay({
  decision,
  normalization,
  categoryLabel,
}: {
  decision: NonNullable<ReturnType<ReturnType<typeof useOrganWeightNormalization>["getDecision"]>>;
  normalization: ReturnType<typeof useOrganWeightNormalization>;
  categoryLabel: string;
}) {
  return (
    <>
      <div className="text-xs">
        <span className="font-semibold">Normalization: </span>
        {MODE_LABELS[decision.mode] ?? decision.mode}
        {decision.userOverridden ? "" : " (auto-selected)"}
      </div>
      <div className="text-xs">
        <span className="font-semibold">Tier: </span>
        {decision.tier} — {getTierSeverityLabel(decision.tier)} BW effect
      </div>
      <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
        <div>BW effect (worst group): g = {normalization.worstBwG.toFixed(2)}</div>
        <div>
          Brain weight: {normalization.worstBrainG != null
            ? `g = ${normalization.worstBrainG.toFixed(2)} (${decision.brainAffected ? "affected" : "unaffected"})`
            : "not collected"}
        </div>
        <div>Organ category: {categoryLabel}</div>
      </div>
      {decision.rationale.length > 0 && (
        <div className="mt-2 border-t pt-2">
          <div className="mb-1 text-[11px] font-semibold text-muted-foreground">Rationale</div>
          <ul className="space-y-0.5 text-[11px] text-muted-foreground">
            {decision.rationale.map((r, i) => (
              <li key={i}>• {r}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="text-[10px] text-muted-foreground/60">
        Ref: Bailey et al. 2004, Sellers et al. 2007, Creasy 2013
      </div>
    </>
  );
}

// ─── Override form sub-component ──────────────────────────
function NormalizationOverrideForm({
  specimen,
  currentAutoMode,
  existingOverride,
  hasBrainData,
  hasAncovaData,
  overrides,
}: {
  specimen: string;
  currentAutoMode: string;
  existingOverride: NormalizationOverride | null;
  hasBrainData: boolean;
  hasAncovaData: boolean;
  overrides: ReturnType<typeof useNormalizationOverrides>;
}) {
  const [editing, setEditing] = useState(false);
  const [selectedMode, setSelectedMode] = useState<NormalizationOverride["mode"]>(
    existingOverride?.mode ?? (currentAutoMode as NormalizationOverride["mode"]),
  );
  const [reason, setReason] = useState(existingOverride?.reason ?? "");
  const [saved, setSaved] = useState(false);

  // Sync form state when specimen or override changes
  useEffect(() => {
    setSelectedMode(existingOverride?.mode ?? (currentAutoMode as NormalizationOverride["mode"]));
    setReason(existingOverride?.reason ?? "");
    setEditing(false);
    setSaved(false);
  }, [specimen, existingOverride, currentAutoMode]);

  // Auto-clear saved flash
  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [saved]);

  const handleSave = async () => {
    if (!reason.trim()) return;
    await overrides.saveOverride(specimen, selectedMode, reason.trim());
    setEditing(false);
    setSaved(true);
  };

  const handleClear = async () => {
    await overrides.removeOverride(specimen);
    setEditing(false);
    setSaved(false);
  };

  // Available modes — filter by data availability
  const availableModes = MODE_OPTIONS.filter(m => {
    if (m === "brain_weight" && !hasBrainData) return false;
    if (m === "ancova" && !hasAncovaData) return false;
    return true;
  });

  const isOverridden = existingOverride && existingOverride.reason !== "__cleared__";

  return (
    <div className="mt-2 border-t pt-2">
      {!editing ? (
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-[11px] font-medium text-primary hover:underline"
            onClick={() => setEditing(true)}
          >
            {isOverridden ? "Edit override" : "Override mode"}
          </button>
          {isOverridden && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:text-destructive"
              onClick={handleClear}
            >
              Clear override
            </button>
          )}
          {saved && (
            <span className="text-[11px] font-medium text-green-600">Saved</span>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold text-muted-foreground">Override normalization mode</div>
          <div className="flex flex-wrap gap-1">
            {availableModes.map(m => (
              <button
                key={m}
                type="button"
                className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                  selectedMode === m
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
                onClick={() => setSelectedMode(m)}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <textarea
            className="w-full rounded border border-border bg-background px-2 py-1 text-[11px] placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
            rows={2}
            placeholder="Reason for override (required)"
            value={reason}
            onChange={e => setReason(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!reason.trim() || overrides.isSaving}
              className="rounded bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
              onClick={handleSave}
            >
              {overrides.isSaving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              className="text-[11px] text-muted-foreground hover:underline"
              onClick={() => {
                setEditing(false);
                setSelectedMode(existingOverride?.mode ?? (currentAutoMode as NormalizationOverride["mode"]));
                setReason(existingOverride?.reason ?? "");
              }}
            >
              Cancel
            </button>
          </div>
          {isOverridden && existingOverride.reviewDate && (
            <div className="text-[10px] text-muted-foreground/60">
              Last overridden: {new Date(existingOverride.reviewDate).toLocaleString()}
              {existingOverride.pathologist && ` by ${existingOverride.pathologist}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Map organ_system key → potential OM specimen names for normalization lookup */
const ORGAN_SYSTEM_TO_SPECIMENS: Record<string, string[]> = {
  hepatic: ["LIVER"],
  renal: ["KIDNEY", "KIDNEYS"],
  hematologic: ["SPLEEN"],
  immune: ["THYMUS", "ADRENAL", "ADRENALS"],
  general: ["HEART", "LUNG", "LUNGS"],
  reproductive: ["TESTES", "TESTIS", "OVARY", "OVARIES", "UTERUS", "PROSTATE", "EPIDID"],
  endocrine: ["THYROID", "PITUITARY", "ADRENAL", "ADRENALS"],
  neurological: ["BRAIN"],
};

export function OrganContextPanel({ organKey, nav }: OrganContextPanelProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { selectFinding, selectGroup } = useFindingSelection();
  const analytics = useFindingsAnalytics();
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // Fetch all findings data (shared cache with FindingsView)
  const { data: rawData } = useFindings(studyId, 1, 10000, ALL_FILTERS);

  // Correlation matrix — for "Endpoint correlations" pane
  const { data: corrMatrix } = useOrganCorrelations(studyId, organKey);

  // Normalization engine — for "Organ weight normalization" pane
  const { effectSize } = useStatMethods(studyId);
  const normalization = useOrganWeightNormalization(studyId, true, effectSize);
  const normOverrides = useNormalizationOverrides(studyId);

  // Use shared derivation — single source of truth (includes all fields)
  const organEndpoints = useMemo(
    () => analytics.endpoints.filter(ep => ep.organ_system === organKey),
    [analytics.endpoints, organKey],
  );

  // Coherence data from analytics context
  const coherence = analytics.organCoherence.get(organKey);

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

  // Related-syndromes computation + ORGAN_SYNDROME_MAP removed per F12
  // (covered by RelatedSyndromesTable in the center pane).

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
      <ContextPanelHeader
        title={titleCase(organKey)}
        subtitle={
          <>
            {totalEndpoints} endpoint{totalEndpoints !== 1 ? "s" : ""} · {domains.length} domain{domains.length !== 1 ? "s" : ""} ({domains.join(", ")}) · {adverseCount} adverse
          </>
        }
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        headerActions={
          <button
            className="rounded p-0.5 text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            onClick={handleClose}
            title="Close"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M2 2l8 8M10 2l-8 8" />
            </svg>
          </button>
        }
        canGoBack={nav?.canGoBack}
        canGoForward={nav?.canGoForward}
        onBack={nav?.onBack}
        onForward={nav?.onForward}
      />

      {/* Pane 1: CONVERGENCE — narrative only (per-domain endpoint list moved
          to DomainDoseRollup in the center pane per radar-forest-cleanup F12). */}
      <div className="border-b px-4 py-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Convergence
        </div>
        <div className="mb-2 text-xs font-semibold">{convergenceLabel}</div>
        {domainBreakdown.length > 0 && (
          <p className="text-xs leading-relaxed text-foreground/80">
            {convergenceInterpretation}
          </p>
        )}
      </div>

      {/* Pane 1b: ENDPOINT CORRELATIONS (matrix of within-organ Spearman correlations) */}
      {corrMatrix && corrMatrix.endpoints.length >= 2 && (
        <CollapsiblePane
          title="Endpoint correlations"
          defaultOpen={false}
          sessionKey="pcc.organ.correlations"
          expandAll={expandGen}
          collapseAll={collapseGen}
          headerRight={
            <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
              {corrMatrix.summary.coherence_label}
            </span>
          }
        >
          <CorrelationMatrixPane
            data={corrMatrix}
            onCellClick={handleEndpointClick}
          />
        </CollapsiblePane>
      )}

      {/* Pane 1c: ORGAN WEIGHT NORMALIZATION (only when organ has OM endpoints and tier >= 2) */}
      {(() => {
        if (normalization.highestTier < 2) return null;
        const specimens = ORGAN_SYSTEM_TO_SPECIMENS[organKey.toLowerCase()] ?? [];
        let bestDecision: ReturnType<typeof normalization.getDecision> = null;
        let matchedSpecimen = "";
        for (const sp of specimens) {
          const d = normalization.getDecision(sp);
          if (d && (!bestDecision || d.tier > bestDecision.tier)) {
            bestDecision = d;
            matchedSpecimen = sp;
          }
        }
        if (!bestDecision || bestDecision.tier < 2) return null;
        const category = getOrganCorrelationCategory(matchedSpecimen);
        const categoryLabels: Record<string, string> = {
          strong_bw: "Strong BW correlation (liver, thyroid)",
          moderate_bw: "Moderate BW correlation (heart, kidney, spleen, lung)",
          weak_bw: "Weak BW correlation — brain normalization preferred (adrenals, thymus)",
          brain: "Brain organ — cannot normalize to itself",
          gonadal: "Gonadal (testes) — BW-spared, absolute weight only",
          androgen_dependent: "Androgen-dependent — correlate with hormonal status",
          female_reproductive: "Female reproductive — cycle-dominated, low confidence",
        };
        const existingOverride = normOverrides.getOverride(matchedSpecimen);
        return (
          <CollapsiblePane
            title="Organ weight normalization"
            defaultOpen={false}
            sessionKey="pcc.organ.normalization"
            expandAll={expandGen}
            collapseAll={collapseGen}
            headerRight={
              <OverridePill
                isOverridden={bestDecision.userOverridden}
                note={existingOverride?.reason}
                user={existingOverride?.pathologist}
                timestamp={existingOverride?.reviewDate ? new Date(existingOverride.reviewDate).toLocaleDateString() : undefined}
                onSaveNote={(text) => normOverrides.saveOverride(matchedSpecimen, existingOverride?.mode ?? bestDecision.mode, text)}
                placeholder="Reason for overriding normalization mode"
                popoverSide="left"
              />
            }
          >
            <div className="space-y-2">
              <NormalizationModeDisplay
                decision={bestDecision}
                normalization={normalization}
                categoryLabel={categoryLabels[category] ?? category}
              />
              <NormalizationOverrideForm
                specimen={matchedSpecimen}
                currentAutoMode={bestDecision.mode}
                existingOverride={existingOverride}
                hasBrainData={normalization.worstBrainG != null}
                hasAncovaData={bestDecision.tier >= 3}
                overrides={normOverrides}
              />
            </div>
          </CollapsiblePane>
        );
      })()}

      {/* Pane 1c: NORMALIZATION HEATMAP (all organs at a glance, only when normalization tier >= 2) */}
      {analytics.normalizationContexts && analytics.normalizationContexts.length > 0
        && analytics.normalizationContexts.some(c => c.tier >= 2) && (
        <CollapsiblePane title="Normalization overview" defaultOpen={false} sessionKey="pcc.organ.norm-overview" expandAll={expandGen} collapseAll={collapseGen}>
          <NormalizationHeatmap
            contexts={analytics.normalizationContexts.filter(c => c.tier >= 2)}
            onOrganClick={(organ) => selectGroup("organ", organ)}
          />
        </CollapsiblePane>
      )}

      {/* Pane 2: PER-ENDPOINT NOAEL (was "Organ NOAEL")
          F12: headline value moved to ScopeBanner (FindingsView wires
          noaelLabel via computeOrganNoaelDisplay). The per-endpoint list +
          clinical-tier annotation stays here -- unique analytical content
          not surfaced in any center-pane component (rule-14 science
          preservation; see .lattice/research-temp/F12-coverage-proof.md). */}
      <CollapsiblePane title="Per-endpoint NOAEL" defaultOpen={false} sessionKey="pcc.organ.noael" expandAll={expandGen} collapseAll={collapseGen}>
        {noaelData ? (
          <div>
            {worstClinical && (
              <div className={`mb-2 text-xs font-medium ${getClinicalTierTextClass(worstClinical.tier)}`}>
                Worst clinical: {worstClinical.tier} {getClinicalSeverityLabel(worstClinical.tier)} ({worstClinical.endpoint}, rule {worstClinical.ruleId})
              </div>
            )}
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
                      <span className={`shrink-0 font-mono text-[10px] ${getClinicalTierTextClass(clinical.tier)}`}>
                        {clinical.tier} {clinical.ruleId}
                      </span>
                    ) : (
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/40">{"\u2014"}</span>
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

      {/* RELATED SYNDROMES pane dropped per F12 -- covered by RelatedSyndromesTable
          in the center pane (28f1af0e). Click-to-navigate paths preserved through
          F8 cross-scope navigation wiring. */}

      {/* MEMBER ENDPOINTS pane dropped per F12 -- covered by FindingsTable
          (organ-filtered via scopedEndpoints in FindingsView). selectFinding
          callback path preserved end-to-end. */}
    </div>
  );
}

// SYNDROME_NAMES, RelatedSyndromeRow, MemberEndpointRow, SeverityDot removed
// per F12 -- their host panes (RELATED SYNDROMES, MEMBER ENDPOINTS) are
// dropped because the same content is now in RelatedSyndromesTable and
// FindingsTable in the center pane.
