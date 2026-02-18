/**
 * SyndromeContextPanel — group-level context panel shown when a syndrome
 * card header is clicked in Syndrome grouping mode.
 *
 * Displays: Interpretation, Evidence Summary, Differential, Member Endpoints.
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
  getDomainBadgeColor,
  getDirectionSymbol,
  formatPValue,
  formatEffectSize,
} from "@/lib/severity-colors";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { EndpointSummary } from "@/lib/derive-summaries";
import { getSyndromeTermReport, getSyndromeDefinition } from "@/lib/cross-domain-syndromes";
import type { TermReportEntry, CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import { findClinicalMatchForEndpoint, getClinicalTierTextClass } from "@/lib/lab-clinical-catalog";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import { interpretSyndrome, mapDeathRecordsToDispositions } from "@/lib/syndrome-interpretation";
import type { SyndromeInterpretation, DiscriminatingFinding, HistopathCrossRef, MortalityContext, TumorFinding, FoodConsumptionContext } from "@/lib/syndrome-interpretation";
import { useLesionSeveritySummary } from "@/hooks/useLesionSeveritySummary";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useTumorSummary } from "@/hooks/useTumorSummary";
import { useFoodConsumptionSummary } from "@/hooks/useFoodConsumptionSummary";
import { useStudyContext } from "@/hooks/useStudyContext";
import type { FindingsFilters, UnifiedFinding, DoseGroup } from "@/types/analysis";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";

// ─── Helpers ────────────────────────────────────────────────

/** Format p-value with correct prefix: "p<0.0001" or "p=0.040" */
function formatPValueWithPrefix(p: number | null | undefined): string {
  if (p == null) return "";
  const formatted = formatPValue(p);
  // formatPValue returns "<0.0001" for very small values — use "p" prefix directly
  if (formatted.startsWith("<")) return `p${formatted}`;
  return `p=${formatted}`;
}

// ─── Static data ────────────────────────────────────────────

/** Static empty filters — fetch all findings */
const ALL_FILTERS: FindingsFilters = {
  domain: null, sex: null, severity: null, search: "",
  organ_system: null, endpoint_label: null, dose_response_pattern: null,
};

/** Authored interpretation content per syndrome (from spec lines 82-92) */
const SYNDROME_INTERPRETATIONS: Record<string, {
  description: string;
  regulatory: string;
  discriminator: string | null;
}> = {
  XS01: {
    description: "Hepatocellular injury indicates direct drug toxicity to liver cells, typically presenting as elevated transaminases (ALT, AST) with confirmatory histopathology (necrosis, hypertrophy). Multi-domain convergence (blood + weights + microscopy) strengthens confidence.",
    regulatory: "Most scrutinized toxicity in drug development. EMA DILI reflection paper and FDA DILI guidance define thresholds. Concurrent ALT + bilirubin elevation triggers Hy's Law assessment (L03). May require liver monitoring in FIH protocol.",
    discriminator: "ALT-predominant pattern (R-ratio \u22655) distinguishes from cholestatic injury (XS02, R-ratio \u22642). If both ALT and ALP elevated, calculate R-ratio for classification.",
  },
  XS02: {
    description: "Cholestatic/hepatobiliary injury indicates drug interference with bile formation or flow, presenting as elevated ALP and GGT with bile duct changes histologically. Different mechanism and clinical outcome from hepatocellular (XS01).",
    regulatory: "Often dose-limiting but generally more reversible than hepatocellular injury. Distinguish from enzyme induction, which also raises ALP without biliary damage.",
    discriminator: "ALP-predominant pattern (R-ratio \u22642) distinguishes from hepatocellular (XS01). GGT or 5\u2019NT elevation confirms biliary origin rather than bone ALP.",
  },
  XS03: {
    description: "Nephrotoxicity indicates drug-induced kidney injury, typically presenting as elevated BUN/creatinine with tubular damage histologically. May manifest as concentrating defect (low specific gravity) before overt azotemia.",
    regulatory: "Kidney monitoring (BUN, creatinine, urinalysis) required in clinical protocols. Reversibility assessment critical \u2014 irreversible renal damage may be dose-limiting.",
    discriminator: "Prerenal azotemia (BUN\u2191 without creatinine\u2191, often with dehydration) should be distinguished from intrinsic renal damage (both elevated, with histopathology). Check BUN:creatinine ratio.",
  },
  XS04: {
    description: "Myelosuppression indicates the drug is suppressing blood cell production in the bone marrow. Typically presents as decreased neutrophils, platelets, or red blood cells, with decreased reticulocytes confirming the marrow as the source rather than peripheral destruction.",
    regulatory: "Dose-limiting toxicity in many programs. Requires hematology monitoring in clinical trials. Severe neutropenia or thrombocytopenia may limit MRSD calculation. Recovery kinetics from the recovery group are critical for clinical dose scheduling.",
    discriminator: "Reticulocyte direction distinguishes from hemolytic anemia (XS05): \u2193 = marrow failure (this syndrome), \u2191 = peripheral destruction (hemolysis).",
  },
  XS05: {
    description: "Hemolytic anemia indicates the drug is causing red blood cell destruction in the periphery. The hallmark is decreased RBCs with INCREASED reticulocytes \u2014 the marrow is healthy and compensating by producing more cells. Often accompanied by bilirubin elevation (from heme breakdown) and spleen changes (where destroyed RBCs are cleared).",
    regulatory: "Requires Coombs test in clinical program to determine if immune-mediated. Haptoglobin monitoring recommended. Mechanism investigation (immune vs oxidative vs direct membrane damage) guides risk assessment.",
    discriminator: "Reticulocyte direction distinguishes from myelosuppression (XS04): \u2191 = peripheral destruction with marrow compensation (this syndrome), \u2193 = marrow failure (myelosuppression).",
  },
  XS06: {
    description: "Phospholipidosis indicates drug accumulation within cells, presenting as elevated phospholipids with foamy macrophages histologically. Often a class effect of cationic amphiphilic drugs.",
    regulatory: "Historically a regulatory concern, but consensus has evolved. Not inherently adverse unless accompanied by functional impairment. STP position paper (2012) recommends assessing whether phospholipidosis is associated with organ dysfunction rather than treating it as adverse per se.",
    discriminator: "Distinguish functional phospholipidosis (with organ damage) from adaptive (storage without dysfunction). Presence of concurrent organ toxicity markers determines regulatory significance.",
  },
  XS07: {
    description: "Immunotoxicity indicates drug-mediated suppression of the immune system, presenting as decreased white blood cells or lymphocytes with lymphoid organ changes (thymus/spleen atrophy).",
    regulatory: "ICH S8 immunotoxicity guideline applies. May require immunotoxicity studies (TDAR assay, NK cell activity) if standard endpoints are affected. Weight-of-evidence approach per ICH S8 decision tree.",
    discriminator: "Distinguish from stress-induced lymphopenia (XS08) by checking adrenal weight. If adrenal weight \u2191 + lymphocytes \u2193, consider stress response before concluding direct immunotoxicity.",
  },
  XS08: {
    description: "Stress response indicates generalized physiological stress rather than direct target organ toxicity. Hallmark is adrenal hypertrophy (HPA axis activation) with secondary thymus involution and lymphopenia. Often accompanied by decreased body weight.",
    regulatory: "Generally not considered direct drug toxicity \u2014 represents a non-specific response. However, persistent stress response at low doses may indicate poor tolerability. Distinguish from direct adrenal toxicity (which shows adrenal histopathology, not just weight increase).",
    discriminator: "If body weight is significantly decreased (>10%), stress response findings may be secondary to inanition (XS09) rather than a separate mechanism. Check food consumption.",
  },
  XS09: {
    description: "Target organ wasting indicates generalized toxicity with decreased body weight, food consumption, and secondary organ weight reductions. May represent non-specific malaise or palatability issues rather than direct organ toxicity.",
    regulatory: "Confounds interpretation of organ weight changes \u2014 organ weights should be evaluated both as absolute and as ratio-to-body-weight. Body weight decrease >10% typically requires noting as a confounder in all organ weight assessments.",
    discriminator: "Organ weight decreases proportional to body weight decrease are likely secondary (not direct toxicity). Organ weights that decrease MORE than body weight, or that INCREASE despite BW decrease, suggest direct target organ effects on top of the general wasting.",
  },
};

/** Differential pairs — which syndromes have close differentials */
interface DifferentialPair {
  vsId: string;
  vsName: string;
  discriminators: Array<{
    label: string;         // what to check
    expectThisDir: string; // expected direction for THIS syndrome
    expectOtherDir: string; // expected direction for the OTHER syndrome
    testCodes?: string[];  // LB test codes to search
    specimenTerms?: { specimen: string[]; finding: string[] }; // MI match
    organWeightTerms?: { specimen: string[] }; // OM match
    domain: string;
  }>;
}

const DIFFERENTIAL_PAIRS: Record<string, DifferentialPair> = {
  XS01: {
    vsId: "XS02", vsName: "Cholestatic injury",
    discriminators: [
      { label: "ALT predominance", testCodes: ["ALT", "ALAT"], domain: "LB", expectThisDir: "up", expectOtherDir: "normal" },
      { label: "ALP predominance", testCodes: ["ALP", "ALKP"], domain: "LB", expectThisDir: "normal", expectOtherDir: "up" },
    ],
  },
  XS02: {
    vsId: "XS01", vsName: "Hepatocellular injury",
    discriminators: [
      { label: "ALP predominance", testCodes: ["ALP", "ALKP"], domain: "LB", expectThisDir: "up", expectOtherDir: "normal" },
      { label: "GGT/5\u2019NT presence", testCodes: ["GGT", "5NT"], domain: "LB", expectThisDir: "up", expectOtherDir: "absent" },
    ],
  },
  XS04: {
    vsId: "XS05", vsName: "Hemolytic anemia",
    discriminators: [
      { label: "Reticulocytes", testCodes: ["RETIC", "RET"], domain: "LB", expectThisDir: "down", expectOtherDir: "up" },
      { label: "Bilirubin", testCodes: ["BILI", "TBILI"], domain: "LB", expectThisDir: "absent", expectOtherDir: "up" },
      { label: "Spleen weight", organWeightTerms: { specimen: ["spleen"] }, domain: "OM", expectThisDir: "down", expectOtherDir: "up" },
    ],
  },
  XS05: {
    vsId: "XS04", vsName: "Myelosuppression",
    discriminators: [
      { label: "Reticulocytes", testCodes: ["RETIC", "RET"], domain: "LB", expectThisDir: "up", expectOtherDir: "down" },
      { label: "Bone marrow cellularity", specimenTerms: { specimen: ["bone marrow"], finding: ["hypocellularity", "hypocellular", "decreased cellularity", "aplasia"] }, domain: "MI", expectThisDir: "absent", expectOtherDir: "present" },
    ],
  },
  XS07: {
    vsId: "XS08", vsName: "Stress response",
    discriminators: [
      { label: "Adrenal weight", organWeightTerms: { specimen: ["adrenal"] }, domain: "OM", expectThisDir: "absent", expectOtherDir: "up" },
      { label: "Body weight decrease", testCodes: ["BW"], domain: "BW", expectThisDir: "absent", expectOtherDir: "down" },
    ],
  },
  XS08: {
    vsId: "XS09", vsName: "Target organ wasting",
    discriminators: [
      { label: "Food consumption", testCodes: ["FC"], domain: "BW", expectThisDir: "normal", expectOtherDir: "down" },
      { label: "Organ weight proportionality", organWeightTerms: { specimen: [] }, domain: "OM", expectThisDir: "down", expectOtherDir: "down" },
    ],
  },
};

// ─── Component ────────────────────────────────────────────

interface SyndromeContextPanelProps {
  syndromeId: string;
}

export function SyndromeContextPanel({ syndromeId }: SyndromeContextPanelProps) {
  const { studyId } = useParams<{ studyId: string }>();
  const { selectFinding, selectGroup } = useFindingSelection();
  const analytics = useFindingsAnalytics();
  const { expandGen, collapseGen, expandAll, collapseAll } = useCollapseAll();

  // Fetch all findings data (shared cache with FindingsView)
  const { data: rawData } = useFindings(studyId, 1, 10000, ALL_FILTERS);

  // Find the detected syndrome from analytics
  const detected = analytics.syndromes.find((s) => s.id === syndromeId) ?? null;
  const syndromeDef = getSyndromeDefinition(syndromeId);
  const name = detected?.name ?? syndromeDef?.name ?? syndromeId;

  // Derive all endpoint summaries for evidence/term report
  const allEndpoints = useMemo<EndpointSummary[]>(() => {
    if (!rawData?.findings?.length) return [];
    const rows: AdverseEffectSummaryRow[] = rawData.findings.map((f) => ({
      endpoint_label: f.endpoint_label ?? f.finding,
      endpoint_type: f.data_type,
      domain: f.domain,
      organ_system: f.organ_system ?? "unknown",
      dose_level: 0,
      dose_label: "",
      sex: f.sex,
      p_value: f.min_p_adj,
      effect_size: f.max_effect_size,
      direction: f.direction,
      severity: f.severity,
      treatment_related: f.treatment_related,
      dose_response_pattern: f.dose_response_pattern ?? "flat",
    }));
    return deriveEndpointSummaries(rows);
  }, [rawData]);

  // Evidence Summary: term report
  const syndromeSexes = detected?.sexes;
  const termReport = useMemo(
    () => getSyndromeTermReport(syndromeId, allEndpoints, syndromeSexes),
    [syndromeId, allEndpoints, syndromeSexes],
  );

  // Member endpoints — the detected syndrome's matched endpoints enriched with EndpointSummary data
  const memberEndpoints = useMemo<EndpointSummary[]>(() => {
    if (!detected) return [];
    const results: EndpointSummary[] = [];
    for (const m of detected.matchedEndpoints) {
      const epSummary = allEndpoints.find((ep) => ep.endpoint_label === m.endpoint_label);
      if (epSummary) results.push(epSummary);
    }
    results.sort((a, b) => {
      const sa = analytics.signalScores.get(a.endpoint_label) ?? 0;
      const sb = analytics.signalScores.get(b.endpoint_label) ?? 0;
      return sb - sa;
    });
    return results;
  }, [detected, allEndpoints, analytics.signalScores]);

  // Multi-syndrome membership: which other syndromes share endpoints
  const otherSyndromeMembership = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const ep of memberEndpoints) {
      const others = analytics.syndromes
        .filter((s) => s.id !== syndromeId && s.matchedEndpoints.some((m) => m.endpoint_label === ep.endpoint_label))
        .map((s) => s.id);
      if (others.length > 0) {
        map.set(ep.endpoint_label, others);
      }
    }
    return map;
  }, [memberEndpoints, analytics.syndromes, syndromeId]);

  // Header stats
  const endpointCount = detected?.matchedEndpoints.length ?? 0;
  const domainCount = detected?.domainsCovered.length ?? 0;

  // Histopath data for interpretation layer
  const { data: histopathData } = useLesionSeveritySummary(studyId);

  // Study context for interpretation layer (real data from TS domain)
  const { data: studyContext } = useStudyContext(studyId);

  // Mortality data for interpretation layer
  const { data: mortalityRaw } = useStudyMortality(studyId);

  // Food consumption data for interpretation layer
  const { data: foodConsumptionSummary } = useFoodConsumptionSummary(studyId);

  // Tumor data for interpretation layer
  const { data: tumorSummary } = useTumorSummary(studyId);
  const tumorFindings = useMemo<TumorFinding[]>(() => {
    if (!tumorSummary?.has_tumors) return [];
    // Expand summaries into per-animal TumorFinding entries
    const findings: TumorFinding[] = [];
    for (const s of tumorSummary.summaries) {
      for (const byDose of s.by_dose) {
        for (let i = 0; i < byDose.affected; i++) {
          findings.push({
            organ: s.organ,
            morphology: s.morphology,
            behavior: s.behavior === "MALIGNANT" ? "MALIGNANT" : "BENIGN",
            animalId: `${s.organ}-${s.morphology}-${byDose.dose_level}-${i}`,
            doseGroup: byDose.dose_level,
          });
        }
      }
    }
    return findings;
  }, [tumorSummary]);

  // Compute syndrome interpretation (Phase A + Phase B mortality/tumor + Phase C)
  const syndromeInterp = useMemo<SyndromeInterpretation | null>(() => {
    if (!detected || allEndpoints.length === 0 || !studyContext) return null;
    const mortalityDispositions = mortalityRaw
      ? mapDeathRecordsToDispositions(mortalityRaw)
      : [];
    return interpretSyndrome(
      detected,
      allEndpoints,
      histopathData ?? [],
      [], // recovery data (not available yet)
      [], // organ weights
      tumorFindings,
      mortalityDispositions,
      foodConsumptionSummary ?? { available: false, water_consumption: null },
      [], // clinical observations (not available yet)
      studyContext,
      mortalityRaw?.mortality_noael_cap,
    );
  }, [detected, allEndpoints, histopathData, studyContext, mortalityRaw, tumorFindings, foodConsumptionSummary]);

  // Interpretation content
  const interpretation = SYNDROME_INTERPRETATIONS[syndromeId];

  // Differential pair
  const differential = DIFFERENTIAL_PAIRS[syndromeId] ?? null;

  // ── Handlers ─────────────────────────────────────────────
  const handleEndpointClick = (endpointLabel: string) => {
    if (!rawData?.findings) return;
    const epFindings = rawData.findings.filter(
      (f) => (f.endpoint_label ?? f.finding) === endpointLabel,
    );
    if (epFindings.length === 0) return;
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
          <h3 className="text-sm font-semibold">{name}</h3>
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
          {syndromeId} · {endpointCount} endpoint{endpointCount !== 1 ? "s" : ""} · {domainCount} domain{domainCount !== 1 ? "s" : ""}
          {detected?.sexes && detected.sexes.length > 0 && (
            <> · Detected in: {detected.sexes.length === 1
              ? `${detected.sexes[0] === "M" ? "\u2642" : "\u2640"} ${detected.sexes[0]} only`
              : detected.sexes.map(s => `${s === "M" ? "\u2642" : "\u2640"} ${s}`).join(", ")}</>
          )}
        </p>
        {/* Dual badges: Pattern confidence + Mechanism certainty */}
        {syndromeInterp && (
          <div className="mt-1.5 flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground">Pattern</span>
            <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
              {syndromeInterp.patternConfidence}
            </span>
            <span className="text-[9px] text-muted-foreground">Mechanism</span>
            <CertaintyBadge certainty={syndromeInterp.mechanismCertainty} />
          </div>
        )}
      </div>

      {/* Pane 1: INTERPRETATION — always visible, not collapsible */}
      {interpretation && (
        <div className="border-b px-4 py-3">
          <p className="text-xs leading-relaxed text-foreground/80">
            {interpretation.description}
          </p>
          <div className="mt-3 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Regulatory significance
          </div>
          <p className="text-xs leading-relaxed text-foreground/80">
            {interpretation.regulatory}
          </p>
          {interpretation.discriminator && (
            <>
              <div className="mt-3 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                Key discriminator
              </div>
              <p className="text-xs leading-relaxed text-foreground/80">
                {interpretation.discriminator}
              </p>
            </>
          )}
        </div>
      )}

      {/* Pane: CERTAINTY ASSESSMENT (Phase A, Component 1) */}
      {syndromeInterp && syndromeInterp.discriminatingEvidence.length > 0 && (
        <CollapsiblePane title="Certainty assessment" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <CertaintyAssessmentPane interp={syndromeInterp} />
        </CollapsiblePane>
      )}

      {/* Pane 2: EVIDENCE SUMMARY */}
      <CollapsiblePane title="Evidence summary" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        {termReport ? (
          <EvidenceSummaryContent
            report={termReport}
            confidence={detected?.confidence ?? "LOW"}
            labMatches={analytics.labMatches}
            syndromeId={syndromeId}
            allEndpoints={allEndpoints}
            rawFindings={rawData?.findings}
            doseGroups={rawData?.dose_groups}
          />
        ) : (
          <p className="text-xs text-muted-foreground">No evidence data available.</p>
        )}
      </CollapsiblePane>

      {/* Pane 3: DIFFERENTIAL (only shown when pair exists) */}
      {differential && (
        <CollapsiblePane title="Differential" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <DifferentialContent
            syndromeName={name}
            pair={differential}
            allEndpoints={allEndpoints}
            detectedSyndromes={analytics.syndromes}
          />
        </CollapsiblePane>
      )}

      {/* Pane: HISTOPATHOLOGY CONTEXT (Phase A, Component 2) */}
      {syndromeInterp && syndromeInterp.histopathContext.length > 0 && (
        <CollapsiblePane title="Histopathology context" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <HistopathContextPane crossRefs={syndromeInterp.histopathContext} />
        </CollapsiblePane>
      )}

      {/* Pane: CLINICAL OBSERVATIONS (Phase C) */}
      {syndromeInterp && syndromeInterp.clinicalObservationSupport.assessment !== "no_cl_data" && (
        <CollapsiblePane title="Clinical observations" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <ClinicalObservationsPane support={syndromeInterp.clinicalObservationSupport} />
        </CollapsiblePane>
      )}

      {/* Pane: RECOVERY (Phase A, Component 3) */}
      {syndromeInterp && (
        <CollapsiblePane title="Recovery" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <RecoveryPane recovery={syndromeInterp.recovery} />
        </CollapsiblePane>
      )}

      {/* Pane: MORTALITY CONTEXT (Phase B) */}
      {syndromeInterp && syndromeInterp.mortalityContext.treatmentRelatedDeaths > 0 && (
        <CollapsiblePane title="Mortality context" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <MortalityContextPane mortality={syndromeInterp.mortalityContext} />
        </CollapsiblePane>
      )}

      {/* Pane: FOOD CONSUMPTION CONTEXT (Phase B) */}
      {syndromeInterp && syndromeInterp.foodConsumptionContext.available &&
        syndromeInterp.foodConsumptionContext.bwFwAssessment !== "not_applicable" && (
        <CollapsiblePane title="Food consumption" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <FoodConsumptionPane
            context={syndromeInterp.foodConsumptionContext}
            rawData={foodConsumptionSummary}
          />
        </CollapsiblePane>
      )}

      {/* Pane: STUDY DESIGN (Phase B, Component 7) */}
      {syndromeInterp && syndromeInterp.studyDesignNotes.length > 0 && (
        <CollapsiblePane title="Study design" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <div className="space-y-1.5">
            {syndromeInterp.studyDesignNotes.map((note, i) => (
              <p key={i} className="text-xs leading-relaxed text-foreground/80">{note}</p>
            ))}
          </div>
        </CollapsiblePane>
      )}

      {/* Pane 4: MEMBER ENDPOINTS */}
      <CollapsiblePane title="Member endpoints" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-0.5">
          {memberEndpoints.map((ep) => (
            <MemberEndpointRow
              key={ep.endpoint_label}
              endpoint={ep}
              otherSyndromes={otherSyndromeMembership.get(ep.endpoint_label)}
              onClick={() => handleEndpointClick(ep.endpoint_label)}
            />
          ))}
          {memberEndpoints.length === 0 && (
            <p className="text-xs text-muted-foreground">No matched endpoints.</p>
          )}
        </div>
      </CollapsiblePane>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

/** Evidence Summary pane content */
function EvidenceSummaryContent({
  report,
  confidence,
  labMatches,
  syndromeId,
  allEndpoints,
  rawFindings,
  doseGroups,
}: {
  report: NonNullable<ReturnType<typeof getSyndromeTermReport>>;
  confidence: "HIGH" | "MODERATE" | "LOW";
  labMatches: LabClinicalMatch[];
  syndromeId: string;
  allEndpoints: EndpointSummary[];
  rawFindings?: UnifiedFinding[];
  doseGroups?: DoseGroup[];
}) {
  const isHepatic = syndromeId === "XS01" || syndromeId === "XS02";

  // Cap confidence based on opposite (counter-evidence) count
  const cappedConfidence: "HIGH" | "MODERATE" | "LOW" =
    report.oppositeCount >= 2 ? "LOW"
    : report.oppositeCount >= 1 && confidence === "HIGH" ? "MODERATE"
    : confidence;

  return (
    <div>
      {/* Confidence badge */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Confidence:</span>
        <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
          {cappedConfidence}
        </span>
        {report.oppositeCount > 0 && (
          <span className="text-[9px] text-amber-600">
            ({report.oppositeCount} argue{report.oppositeCount === 1 ? "s" : ""} against)
          </span>
        )}
      </div>

      {/* Required findings */}
      <div className="mb-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Required findings:</span>
          <span className="text-muted-foreground">
            {report.requiredLogicType === "compound"
              ? report.requiredLogicText
              : `${report.requiredMetCount} of ${report.requiredTotal} met`}
          </span>
        </div>
        <div className="mt-1 space-y-0.5">
          {report.requiredEntries.map((entry, i) => (
            <TermChecklistRow key={`req-${i}`} entry={entry} labMatches={labMatches} />
          ))}
        </div>
      </div>

      {/* Supporting findings */}
      {report.supportingEntries.length > 0 && (
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Supporting findings:</span>
            <span className="text-muted-foreground">{report.supportingMetCount} of {report.supportingTotal} checked</span>
          </div>
          <div className="mt-1 space-y-0.5">
            {report.supportingEntries.map((entry, i) => (
              <TermChecklistRow key={`sup-${i}`} entry={entry} labMatches={labMatches} />
            ))}
          </div>
        </div>
      )}

      {/* Hy's Law assessment — XS01 and XS02 only */}
      {isHepatic && (
        <HysLawAssessment
          labMatches={labMatches}
          allEndpoints={allEndpoints}
          rawFindings={rawFindings}
          doseGroups={doseGroups}
        />
      )}

      {/* Domain coverage */}
      {report.domainsCovered.length > 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          Domains covered: {report.domainsCovered.join(", ")}
        </div>
      )}
      {report.missingDomains.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Missing domains: {report.missingDomains.join(", ")} (would strengthen to HIGH)
        </div>
      )}
    </div>
  );
}

/** Hy's Law assessment block — shown for XS01 and XS02 syndromes */
function HysLawAssessment({
  labMatches,
  allEndpoints,
  rawFindings,
  doseGroups,
}: {
  labMatches: LabClinicalMatch[];
  allEndpoints: EndpointSummary[];
  rawFindings?: UnifiedFinding[];
  doseGroups?: DoseGroup[];
}) {
  // Hy's Law rules: L03 (concurrent ALT+Bilirubin), L07 (classic), L08 (animal pattern)
  const HYS_RULES = ["L03", "L07", "L08"] as const;

  // Build dose label map for dose context
  const doseLabelMap = new Map<number, string>();
  if (doseGroups) {
    for (const dg of doseGroups) {
      if (dg.dose_value != null && dg.dose_unit) {
        doseLabelMap.set(dg.dose_level, `${dg.dose_value} ${dg.dose_unit}`);
      }
    }
  }

  // Find the lowest significant dose for an endpoint (by test codes)
  function findSignificantDose(testCodes: string[]): string | null {
    if (!rawFindings) return null;
    const codes = testCodes.map((c) => c.toUpperCase());
    const epFindings = rawFindings.filter(
      (f) => f.domain === "LB" && codes.includes(f.test_code?.toUpperCase() ?? ""),
    );
    for (const f of epFindings) {
      const pairwise = f.pairwise ?? [];
      const sorted = [...pairwise].filter((p) => p.dose_level > 0).sort((a, b) => a.dose_level - b.dose_level);
      for (const pw of sorted) {
        const p = pw.p_value_adj ?? pw.p_value;
        if (p != null && p < 0.05) {
          return doseLabelMap.get(pw.dose_level) ?? `dose level ${pw.dose_level}`;
        }
      }
    }
    return null;
  }

  // Get endpoint severity for dose context annotation
  function getEndpointSeverity(testCodes: string[]): string | null {
    const codes = testCodes.map((c) => c.toUpperCase());
    const ep = allEndpoints.find(
      (e) => e.domain === "LB" && codes.includes(e.testCode?.toUpperCase() ?? ""),
    );
    return ep?.worstSeverity ?? null;
  }

  // Build dose context string for an endpoint: "ALT ↑ present at 200 mg/kg (adverse)"
  function doseContext(name: string, testCodes: string[], direction: "up" | "down"): string {
    const arrow = direction === "up" ? " \u2191" : " \u2193";
    const dose = findSignificantDose(testCodes);
    const sev = getEndpointSeverity(testCodes);
    const parts = [`${name}${arrow} present`];
    if (dose) parts[0] += ` at ${dose}`;
    if (sev) parts[0] += ` (${sev})`;
    return parts[0];
  }

  // Check which endpoints are present/elevated
  const altEp = allEndpoints.find(
    (ep) => ep.domain === "LB" && ["ALT", "ALAT"].includes(ep.testCode?.toUpperCase() ?? ""),
  );
  const astEp = allEndpoints.find(
    (ep) => ep.domain === "LB" && ["AST", "ASAT"].includes(ep.testCode?.toUpperCase() ?? ""),
  );
  const biliEp = allEndpoints.find(
    (ep) => ep.domain === "LB" && ["BILI", "TBILI"].includes(ep.testCode?.toUpperCase() ?? ""),
  );
  const alpUp = allEndpoints.some(
    (ep) => ep.domain === "LB" && ["ALP", "ALKP"].includes(ep.testCode?.toUpperCase() ?? "") && ep.direction === "up",
  );

  const altUp = altEp?.direction === "up";
  const astUp = astEp?.direction === "up";
  const biliUp = biliEp?.direction === "up";
  const biliPresent = !!biliEp;

  // APPROACHING detection: one Hy's Law condition met, other is borderline
  // Bilirubin approaching = present + effect size > 0.8 (approaching significance)
  // or p-value between 0.05 and 0.1
  const biliApproaching = biliPresent && !biliUp && (
    (biliEp.maxEffectSize != null && Math.abs(biliEp.maxEffectSize) > 0.8) ||
    (biliEp.minPValue != null && biliEp.minPValue < 0.1)
  );

  const ruleStatuses = HYS_RULES.map((ruleId) => {
    const matched = labMatches.find((m) => m.ruleId === ruleId);

    if (matched) {
      // TRIGGERED — show with dose context
      const explanationParts: string[] = [];
      if (altUp) explanationParts.push(doseContext("ALT", ["ALT", "ALAT"], "up"));
      else if (astUp) explanationParts.push(doseContext("AST", ["AST", "ASAT"], "up"));
      if (biliUp) explanationParts.push(doseContext("Bilirubin", ["BILI", "TBILI"], "up"));
      return {
        ruleId,
        status: "TRIGGERED" as const,
        label: getRuleName(ruleId),
        explanation: explanationParts.length > 0 ? explanationParts.join("; ") : `${matched.matchedEndpoints.join(", ")} elevated concurrently`,
      };
    }

    // Not triggered — explain why, with dose context
    if (ruleId === "L03") {
      if (!altUp && !astUp) {
        return { ruleId, status: "NOT TRIGGERED" as const, label: "Concurrent ALT + bilirubin", explanation: "ALT/AST not elevated" };
      }
      if (!biliPresent) {
        return { ruleId, status: "NOT EVALUATED" as const, label: "Concurrent ALT + bilirubin", explanation: "Bilirubin not measured in study" };
      }
      // APPROACHING: ALT/AST elevated but bilirubin borderline
      if (biliApproaching) {
        const transaminase = altUp ? doseContext("ALT", ["ALT", "ALAT"], "up") : doseContext("AST", ["AST", "ASAT"], "up");
        const biliDetail = biliEp.minPValue != null
          ? `Bilirubin borderline (p=${formatPValue(biliEp.minPValue)}, |d|=${formatEffectSize(Math.abs(biliEp.maxEffectSize ?? 0))})`
          : "Bilirubin approaching threshold";
        return { ruleId, status: "APPROACHING" as const, label: "Concurrent ALT + bilirubin", explanation: `${transaminase}; ${biliDetail}` };
      }
      if (!biliUp) {
        const transaminase = altUp ? doseContext("ALT", ["ALT", "ALAT"], "up") : doseContext("AST", ["AST", "ASAT"], "up");
        return { ruleId, status: "NOT TRIGGERED" as const, label: "Concurrent ALT + bilirubin", explanation: `${transaminase}, but bilirubin within normal range` };
      }
      return { ruleId, status: "NOT TRIGGERED" as const, label: "Concurrent ALT + bilirubin", explanation: "Concurrent elevation conditions not met" };
    }
    if (ruleId === "L07") {
      if (alpUp) {
        return { ruleId, status: "NOT TRIGGERED" as const, label: "Classic Hy's Law", explanation: "ALP \u2191 present \u2014 cholestatic component excludes classic pattern" };
      }
      if (!altUp && !astUp) {
        return { ruleId, status: "NOT TRIGGERED" as const, label: "Classic Hy's Law", explanation: "ALT/AST not elevated" };
      }
      return { ruleId, status: "NOT EVALUATED" as const, label: "Classic Hy's Law", explanation: "ULN-relative not computed; concurrent control comparison used instead per L26" };
    }
    // L08
    if (!altUp && !astUp) {
      return { ruleId, status: "NOT TRIGGERED" as const, label: "Modified Hy's Law (animal)", explanation: "ALT/AST not elevated" };
    }
    if (!biliPresent) {
      return { ruleId, status: "NOT EVALUATED" as const, label: "Modified Hy's Law (animal)", explanation: "Bilirubin not available" };
    }
    // APPROACHING for L08: same logic as L03
    if (biliApproaching) {
      const transaminase = altUp ? doseContext("ALT", ["ALT", "ALAT"], "up") : doseContext("AST", ["AST", "ASAT"], "up");
      const biliDetail = biliEp.minPValue != null
        ? `Bilirubin borderline (p=${formatPValue(biliEp.minPValue)}, |d|=${formatEffectSize(Math.abs(biliEp.maxEffectSize ?? 0))})`
        : "Bilirubin approaching threshold";
      return { ruleId, status: "APPROACHING" as const, label: "Modified Hy's Law (animal)", explanation: `${transaminase}; ${biliDetail}` };
    }
    if (!biliUp) {
      const transaminase = altUp ? doseContext("ALT", ["ALT", "ALAT"], "up") : doseContext("AST", ["AST", "ASAT"], "up");
      return { ruleId, status: "NOT TRIGGERED" as const, label: "Modified Hy's Law (animal)", explanation: `${transaminase}, but bilirubin not elevated` };
    }
    return { ruleId, status: "NOT TRIGGERED" as const, label: "Modified Hy's Law (animal)", explanation: "Conditions not fully met" };
  });

  const statusColorClass = (status: string) => {
    switch (status) {
      case "TRIGGERED": return "text-red-600 font-semibold";
      case "NOT TRIGGERED": return "text-green-600";
      case "NOT EVALUATED": return "text-muted-foreground";
      case "APPROACHING": return "text-amber-600";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="mt-3 border-t pt-2">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        Hy&apos;s Law assessment
      </div>
      <div className="space-y-1.5">
        {ruleStatuses.map((rs) => (
          <div key={rs.ruleId}>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-mono text-muted-foreground">{rs.ruleId}</span>
              <span className="text-foreground">{rs.label}:</span>
              <span className={statusColorClass(rs.status)}>{rs.status}</span>
            </div>
            <div className="ml-6 text-[10px] text-muted-foreground">
              {rs.explanation}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function getRuleName(ruleId: string): string {
  switch (ruleId) {
    case "L03": return "Concurrent ALT + bilirubin";
    case "L07": return "Classic Hy's Law";
    case "L08": return "Modified Hy's Law (animal)";
    default: return ruleId;
  }
}

/** Single row in the term checklist */
function TermChecklistRow({ entry, labMatches }: { entry: TermReportEntry; labMatches: LabClinicalMatch[] }) {
  // Look up clinical match for matched endpoints
  const clinicalTag = entry.status === "matched" && entry.matchedEndpoint
    ? findClinicalMatchForEndpoint(entry.matchedEndpoint, labMatches)
    : null;

  if (entry.status === "matched") {
    return (
      <div className="flex items-center gap-1.5 text-xs">
        <span className="shrink-0 text-green-600">{"\u2713"}</span>
        <span className="min-w-0 flex-1 truncate">{entry.label}{entry.sex && <span className="text-[9px] text-muted-foreground"> ({entry.sex})</span>}</span>
        <span className={`shrink-0 text-[9px] font-semibold ${getDomainBadgeColor(entry.domain).text}`}>
          {entry.domain}
        </span>
        {entry.pValue != null && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {formatPValueWithPrefix(entry.pValue)}
          </span>
        )}
        {entry.severity && (
          <span className="shrink-0 text-[9px] text-muted-foreground">{entry.severity}</span>
        )}
        {clinicalTag ? (
          <span className={`shrink-0 font-mono text-[9px] ${getClinicalTierTextClass(clinicalTag.severity)}`}>
            {clinicalTag.severity} {clinicalTag.ruleId}
          </span>
        ) : (
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground/40">{"\u2014"}</span>
        )}
      </div>
    );
  }

  if (entry.status === "opposite") {
    const dirArrow = entry.foundDirection === "up" ? "\u2191" : entry.foundDirection === "down" ? "\u2193" : "";
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-600">
        <span className="shrink-0">{"\u2298"}</span>
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        <span className={`shrink-0 text-[9px] font-semibold ${getDomainBadgeColor(entry.domain).text}`}>
          {entry.domain}
        </span>
        <span className="shrink-0 text-[9px] italic">found {dirArrow} (argues against)</span>
      </div>
    );
  }

  if (entry.status === "not_significant") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">{"\u2014"}</span>
        <span className="min-w-0 flex-1 truncate">{entry.label}</span>
        <span className={`shrink-0 text-[9px] font-semibold ${getDomainBadgeColor(entry.domain).text}`}>
          {entry.domain}
        </span>
        <span className="shrink-0 text-[9px] italic text-muted-foreground">present, not significant</span>
      </div>
    );
  }

  // not_measured
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground/40">
      <span className="shrink-0">{"\u2717"}</span>
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      <span className={`shrink-0 text-[9px] font-semibold ${getDomainBadgeColor(entry.domain).text}`}>
        {entry.domain}
      </span>
      <span className="shrink-0 text-[9px] italic text-muted-foreground">not measured</span>
    </div>
  );
}

/** Differential pane content */
function DifferentialContent({
  syndromeName,
  pair,
  allEndpoints,
  detectedSyndromes,
}: {
  syndromeName: string;
  pair: DifferentialPair;
  allEndpoints: EndpointSummary[];
  detectedSyndromes: CrossDomainSyndrome[];
}) {
  // Check each discriminating finding against the data
  const findings = pair.discriminators.map((disc) => {
    // Search endpoints for the discriminating finding
    let found: EndpointSummary | null = null;
    for (const ep of allEndpoints) {
      if (ep.domain.toUpperCase() !== disc.domain) continue;
      if (disc.testCodes) {
        const epCode = ep.testCode?.toUpperCase();
        if (epCode && disc.testCodes.includes(epCode)) {
          found = ep;
          break;
        }
      }
      if (disc.specimenTerms) {
        const specimen = (ep.specimen ?? "").toLowerCase();
        const finding = (ep.finding ?? "").toLowerCase();
        const specMatch = disc.specimenTerms.specimen.length === 0 ||
          disc.specimenTerms.specimen.some((s) => specimen.includes(s));
        const findMatch = disc.specimenTerms.finding.some((f) => finding.includes(f));
        if (specMatch && findMatch) {
          found = ep;
          break;
        }
      }
      if (disc.organWeightTerms) {
        const specimen = (ep.specimen ?? ep.endpoint_label).toLowerCase();
        const specMatch = disc.organWeightTerms.specimen.length === 0 ||
          disc.organWeightTerms.specimen.some((s) => specimen.includes(s));
        if (specMatch) {
          found = ep;
          break;
        }
      }
    }

    let assessment: string;
    if (!found) {
      // Absence can be diagnostically meaningful:
      // - If this syndrome expects "absent", absence supports this syndrome
      // - If the other syndrome expects presence, absence argues against it
      if (disc.expectThisDir === "absent" || disc.expectThisDir === "normal") {
        assessment = `supports ${syndromeName.toLowerCase()}`;
      } else if (disc.expectOtherDir === "absent" || disc.expectOtherDir === "normal") {
        assessment = `argues against ${syndromeName.toLowerCase()}`;
      } else {
        assessment = `not found \u2014 cannot distinguish`;
      }
    } else if (found.direction === disc.expectThisDir) {
      assessment = `supports ${syndromeName.toLowerCase()}`;
    } else if (found.direction === disc.expectOtherDir) {
      assessment = `argues against ${syndromeName.toLowerCase()}`;
    } else {
      assessment = `present (${found.direction ?? "no direction"})`;
    }

    return {
      label: disc.label,
      found,
      assessment,
    };
  });

  // Check if the differential syndrome is also detected
  const otherDetected = detectedSyndromes.find((s) => s.id === pair.vsId);

  // Overall assessment
  const supportsThis = findings.filter((f) => f.assessment.startsWith("supports")).length;
  const arguesAgainst = findings.filter((f) => f.assessment.startsWith("argues")).length;
  const cannotDistinguish = findings.filter((f) => f.assessment.startsWith("not found")).length;

  let overallAssessment: string;
  if (otherDetected) {
    overallAssessment = `Both syndromes detected \u2014 review discriminating findings to distinguish.`;
  } else if (supportsThis > arguesAgainst) {
    overallAssessment = `${syndromeName} favored over ${pair.vsName.toLowerCase()}`;
  } else if (arguesAgainst > supportsThis) {
    overallAssessment = `${pair.vsName} may be more likely than ${syndromeName.toLowerCase()}`;
  } else if (cannotDistinguish === findings.length) {
    overallAssessment = `Cannot distinguish \u2014 discriminating findings not available`;
  } else {
    overallAssessment = `Inconclusive \u2014 mixed evidence`;
  }

  return (
    <div>
      <div className="mb-2 text-xs font-medium">
        vs {pair.vsName} ({pair.vsId})
      </div>

      <div className="mb-2 text-[10px] text-muted-foreground">This study:</div>
      <div className="space-y-0.5">
        {findings.map((f, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className="min-w-0 flex-1">
              <span className="text-foreground">
                {f.found
                  ? `${f.label} ${getDirectionSymbol(f.found.direction)}`
                  : `No ${f.label.toLowerCase()}`}
              </span>
              <span className="ml-1 text-muted-foreground">{"\u2192"} {f.assessment}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 text-xs font-medium text-foreground/80">
        Assessment: {overallAssessment}
      </div>
    </div>
  );
}

/** Member endpoint row — duplicated from OrganContextPanel (small, tightly coupled) */
function MemberEndpointRow({
  endpoint,
  otherSyndromes,
  onClick,
}: {
  endpoint: EndpointSummary;
  otherSyndromes?: string[];
  onClick: () => void;
}) {
  const dirSymbol = getDirectionSymbol(endpoint.direction);
  const domainColor = getDomainBadgeColor(endpoint.domain);

  return (
    <button
      className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-accent/50 transition-colors"
      onClick={onClick}
    >
      <span className={`shrink-0 text-[9px] font-semibold ${domainColor.text}`}>
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
          {formatPValueWithPrefix(endpoint.minPValue)}
        </span>
      )}
      <SeverityDot severity={endpoint.worstSeverity} />
      {otherSyndromes && otherSyndromes.length > 0 && (
        <span className="shrink-0 text-[9px] text-muted-foreground">
          +{otherSyndromes.join(",")}
        </span>
      )}
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

// ─── Interpretation layer sub-components ────────────────────

/** Mechanism certainty badge with icon + color */
function CertaintyBadge({ certainty }: { certainty: SyndromeInterpretation["mechanismCertainty"] }) {
  const label =
    certainty === "mechanism_confirmed" ? "CONFIRMED"
    : certainty === "mechanism_uncertain" ? "UNCERTAIN"
    : "PATTERN ONLY";
  const colorClass =
    certainty === "mechanism_confirmed" ? "text-green-600"
    : certainty === "mechanism_uncertain" ? "text-amber-600"
    : "text-muted-foreground";
  const icon =
    certainty === "mechanism_confirmed" ? "\u2713"
    : certainty === "mechanism_uncertain" ? "?"
    : "\u2014";

  return (
    <span className={`rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium ${colorClass}`}>
      {icon} {label}
    </span>
  );
}

/** Certainty assessment pane — discriminating evidence table */
function CertaintyAssessmentPane({ interp }: { interp: SyndromeInterpretation }) {
  return (
    <div>
      <p className="mb-2 text-xs leading-relaxed text-foreground/80">
        {interp.certaintyRationale}
      </p>
      <div className="space-y-0.5">
        {interp.discriminatingEvidence.map((disc, i) => (
          <DiscriminatingEvidenceRow key={i} disc={disc} />
        ))}
      </div>
    </div>
  );
}

/** Single row in discriminating evidence table */
function DiscriminatingEvidenceRow({ disc }: { disc: DiscriminatingFinding }) {
  const icon =
    disc.status === "supports" ? "\u2713"
    : disc.status === "argues_against" ? "\u2298"
    : "\u2014";
  const iconColor =
    disc.status === "supports" ? "text-green-600"
    : disc.status === "argues_against" ? "text-amber-600"
    : "text-muted-foreground/40";
  const dirArrow = disc.expectedDirection === "up" ? "\u2191" : "\u2193";
  const actualArrow = disc.actualDirection === "up" ? "\u2191" : disc.actualDirection === "down" ? "\u2193" : "";

  return (
    <div className="flex items-start gap-1.5 text-xs">
      <span className={`shrink-0 ${iconColor}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="text-foreground">{disc.endpoint}</span>
        <span className="ml-1 text-muted-foreground">
          expected {dirArrow}
          {disc.status === "not_available"
            ? " \u2014 not available"
            : disc.status === "argues_against"
              ? `, found ${actualArrow} (argues against)`
              : `, found ${actualArrow}`}
        </span>
      </span>
      <span className="shrink-0 text-[9px] text-muted-foreground">
        {disc.weight === "strong" ? "STRONG" : "moderate"}
      </span>
    </div>
  );
}

/** Histopathology context pane — specimen-by-specimen cross-reference */
function HistopathContextPane({ crossRefs }: { crossRefs: HistopathCrossRef[] }) {
  return (
    <div className="space-y-3">
      {crossRefs.map((ref) => (
        <div key={ref.specimen}>
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span className="text-foreground">{ref.specimen}</span>
            <span className="text-muted-foreground">
              ({ref.examined ? "examined" : "not examined"})
            </span>
          </div>

          {!ref.examined && (
            <p className="ml-2 text-[10px] text-muted-foreground italic">Not examined in study</p>
          )}

          {ref.examined && (
            <div className="ml-2 mt-1">
              {ref.expectedFindings.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Expected: {ref.expectedFindings.join(", ").toLowerCase()}
                </p>
              )}
              {ref.observedFindings.length > 0 && (
                <div className="mt-0.5 space-y-0.5">
                  {ref.observedFindings.filter(o => o.peakIncidence > 0).map((obs, i) => (
                    <div key={i} className="text-[10px]">
                      <span className={
                        obs.relevance === "expected" ? "text-green-600"
                        : obs.relevance === "unexpected" ? "text-amber-600"
                        : "text-foreground/70"
                      }>
                        {obs.finding}
                      </span>
                      <span className="ml-1 text-muted-foreground">
                        peak {Math.round(obs.peakIncidence * 100)}%, {obs.doseResponse}
                      </span>
                      {obs.proxy && (
                        <span className="ml-1 text-[9px] text-muted-foreground italic">
                          (proxy: {obs.proxy.relationship.split(".")[0].toLowerCase()})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-1 text-[10px] font-medium">
                <span className={
                  ref.assessment === "supports" ? "text-green-600"
                  : ref.assessment === "argues_against" ? "text-amber-600"
                  : "text-muted-foreground"
                }>
                  Assessment: {ref.assessment.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Clinical observations pane (Phase C) */
function ClinicalObservationsPane({ support }: { support: SyndromeInterpretation["clinicalObservationSupport"] }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Assessment:</span>
        <span className={`text-xs font-medium ${
          support.assessment === "strengthens" ? "text-green-600"
          : support.assessment === "weakens" ? "text-amber-600"
          : "text-muted-foreground"
        }`}>
          {support.assessment}
        </span>
      </div>
      {support.correlatingObservations.length > 0 ? (
        <div className="space-y-0.5">
          {support.correlatingObservations.map((obs, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="shrink-0 text-green-600">{"\u2713"}</span>
              <span className="text-foreground">{obs.observation}</span>
              <span className="text-muted-foreground">
                {obs.incidenceDoseDependent ? "dose-dependent" : ""}
                {` (Tier ${obs.tier})`}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">No correlating clinical observations.</p>
      )}
    </div>
  );
}

/** Mortality context pane (Phase B) */
function MortalityContextPane({ mortality }: { mortality: MortalityContext }) {
  return (
    <div>
      <p className="mb-2 text-xs leading-relaxed text-foreground/80">
        {mortality.mortalityNarrative}
      </p>
      {mortality.mortalityNoaelCap != null && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">NOAEL cap:</span>
          <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
            Dose level {mortality.mortalityNoaelCap}
          </span>
        </div>
      )}
      {mortality.deathDetails.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Death details
          </div>
          {mortality.deathDetails.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="shrink-0 font-mono text-muted-foreground">{d.animalId}</span>
              <span className="shrink-0 text-muted-foreground">dose {d.doseGroup}</span>
              <span className="shrink-0 text-muted-foreground">day {d.dispositionDay}</span>
              {d.causeOfDeath && (
                <span className="min-w-0 flex-1 truncate text-foreground/80" title={d.causeOfDeath}>
                  {d.causeOfDeath}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Food consumption context pane (Phase B) */
function FoodConsumptionPane({
  context,
  rawData,
}: {
  context: FoodConsumptionContext;
  rawData?: import("@/lib/syndrome-interpretation").FoodConsumptionSummaryResponse;
}) {
  // Find highest-dose entries with reduced FE for the mini summary
  const reducedEntries = rawData?.periods?.flatMap((p) =>
    p.by_dose_sex.filter((e) => e.food_efficiency_reduced)
  ) ?? [];

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Assessment:</span>
        <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
          {context.bwFwAssessment.replace(/_/g, " ")}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-foreground/80">
        {context.fwNarrative}
      </p>

      {/* Food efficiency by dose (mini summary) */}
      {reducedEntries.length > 0 && (
        <div className="mt-2">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Food efficiency by dose
          </div>
          <div className="mt-1 space-y-0.5">
            {reducedEntries.map((e, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <span className="shrink-0 text-muted-foreground">
                  Dose {e.dose_level} ({e.sex})
                </span>
                <span className="text-foreground">
                  FE={e.mean_food_efficiency.toFixed(2)}
                </span>
                {e.food_efficiency_control != null && (
                  <span className="text-muted-foreground">
                    vs {e.food_efficiency_control.toFixed(2)} control
                  </span>
                )}
                {e.fe_p_value != null && (
                  <span className="font-mono text-[10px] text-muted-foreground">
                    p={formatPValue(e.fe_p_value)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recovery section */}
      {rawData?.recovery?.available && (
        <div className="mt-2">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recovery
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">FW:</span>
            <span className={rawData.recovery.fw_recovered ? "text-green-600" : "text-amber-600"}>
              {rawData.recovery.fw_recovered ? "recovered" : "not recovered"}
            </span>
            <span className="text-muted-foreground">BW:</span>
            <span className={rawData.recovery.bw_recovered ? "text-green-600" : "text-amber-600"}>
              {rawData.recovery.bw_recovered ? "recovered" : "not recovered"}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {rawData.recovery.interpretation}
          </p>
        </div>
      )}
    </div>
  );
}

/** Recovery pane (Phase A, Component 3) */
function RecoveryPane({ recovery }: { recovery: SyndromeInterpretation["recovery"] }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Status:</span>
        <span className={`rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium ${
          recovery.status === "recovered" ? "text-green-600"
          : recovery.status === "not_recovered" ? "text-amber-600"
          : "text-gray-600"
        }`}>
          {recovery.status.replace(/_/g, " ")}
        </span>
      </div>
      <p className="text-xs text-foreground/80">{recovery.summary}</p>
      {recovery.endpoints.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {recovery.endpoints.map((ep, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate text-foreground">
                {ep.label}{ep.sex !== "Both" && ` (${ep.sex})`}
              </span>
              <span className="shrink-0 text-muted-foreground">
                terminal |d|={Math.abs(ep.terminalEffect).toFixed(2)}
              </span>
              {ep.recoveryEffect != null && (
                <span className="shrink-0 text-muted-foreground">
                  recovery |d|={Math.abs(ep.recoveryEffect).toFixed(2)}
                </span>
              )}
              <span className={`shrink-0 text-[9px] font-medium ${
                ep.status === "recovered" ? "text-green-600"
                : ep.status === "not_recovered" ? "text-amber-600"
                : "text-muted-foreground"
              }`}>
                {ep.status.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
