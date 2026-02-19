/**
 * SyndromeContextPanel — group-level context panel shown when a syndrome
 * card header is clicked in Syndrome grouping mode.
 *
 * Displays: Interpretation, Evidence Summary, Differential, Member Endpoints.
 */

import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import { useFindings } from "@/hooks/useFindings";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import {
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
import type { SyndromeInterpretation, DiscriminatingFinding, HistopathCrossRef, MortalityContext, TumorFinding, FoodConsumptionContext, TreatmentRelatednessScore, AdversityAssessment, OverallSeverity, ClinicalObservation, RecoveryRow, TranslationalConfidence, UpgradeEvidenceResult } from "@/lib/syndrome-interpretation";
import { useLesionSeveritySummary } from "@/hooks/useLesionSeveritySummary";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import { useTumorSummary } from "@/hooks/useTumorSummary";
import { useFoodConsumptionSummary } from "@/hooks/useFoodConsumptionSummary";
import { useClinicalObservations } from "@/hooks/useClinicalObservations";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
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
  XS10: {
    description: "Cardiovascular syndrome indicates drug effects on cardiac electrophysiology or hemodynamics, detected through ECG interval changes (QTc, PR, RR) or vital sign shifts (heart rate). Multi-domain convergence with heart weight and cardiac histopathology strengthens confidence in structural cardiac toxicity.",
    regulatory: "ICH S7B and E14 govern cardiac safety assessment. QTc prolongation is the most scrutinized signal \u2014 may require dedicated QT study or thorough QT (TQT) in clinical program. Species-specific QTc correction formulas apply. Heart rate changes may be primary (direct ion channel effects) or secondary (autonomic compensation).",
    discriminator: "Functional vs structural: isolated rate/interval changes without histopathology or troponin elevation suggest functional effect (ion channel modulation). Concurrent heart weight increase, cardiomyopathy, or troponin elevation indicates structural myocardial damage.",
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
  const navigate = useNavigate();
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

  // Clinical observations for interpretation layer (Phase C)
  const { data: clTimecourse } = useClinicalObservations(studyId);
  const clinicalObservations = useMemo<ClinicalObservation[]>(() => {
    if (!clTimecourse?.timecourse?.length) return [];
    // Aggregate CL timecourse into peak incidence per finding × dose × sex
    const key = (obs: string, dose: number, sex: string) => `${obs}|${dose}|${sex}`;
    const peaks = new Map<string, ClinicalObservation>();
    for (const tp of clTimecourse.timecourse) {
      for (const g of tp.counts) {
        for (const [finding, count] of Object.entries(g.findings)) {
          const k = key(finding, g.dose_level, g.sex);
          const existing = peaks.get(k);
          if (!existing || count > existing.incidence) {
            peaks.set(k, {
              observation: finding,
              doseGroup: g.dose_level,
              sex: g.sex,
              incidence: count,
              totalN: g.total_subjects,
            });
          }
        }
      }
    }
    return [...peaks.values()];
  }, [clTimecourse]);

  // Recovery comparison data for interpretation layer
  const { data: recoveryComparison } = useRecoveryComparison(studyId);
  const recoveryData = useMemo<RecoveryRow[]>(() => {
    if (!recoveryComparison?.available) return [];
    return recoveryComparison.rows.map((r) => ({
      endpoint_label: r.endpoint_label,
      sex: r.sex,
      recovery_day: r.recovery_day,
      dose_level: r.dose_level,
      mean: r.mean,
      sd: r.sd,
      p_value: r.p_value,
      effect_size: r.effect_size,
      terminal_effect: r.terminal_effect,
    }));
  }, [recoveryComparison]);

  // Compute syndrome interpretation (Phase A + Phase B + Phase C)
  const syndromeInterp = useMemo<SyndromeInterpretation | null>(() => {
    if (!detected || allEndpoints.length === 0 || !studyContext) return null;
    const mortalityDispositions = mortalityRaw
      ? mapDeathRecordsToDispositions(mortalityRaw)
      : [];
    return interpretSyndrome(
      detected,
      allEndpoints,
      histopathData ?? [],
      recoveryData,
      [], // organ weights
      tumorFindings,
      mortalityDispositions,
      foodConsumptionSummary ?? { available: false, water_consumption: null },
      clinicalObservations,
      studyContext,
      mortalityRaw?.mortality_noael_cap,
      analytics.syndromes.map((s) => s.id),
    );
  }, [detected, allEndpoints, histopathData, studyContext, mortalityRaw, tumorFindings, foodConsumptionSummary, clinicalObservations, recoveryData]);

  // Interpretation content
  const interpretation = SYNDROME_INTERPRETATIONS[syndromeId];

  // Differential pair
  const differential = DIFFERENTIAL_PAIRS[syndromeId] ?? null;

  return (
    <div>
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b bg-background px-4 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{name}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {syndromeId} · {endpointCount} endpoint{endpointCount !== 1 ? "s" : ""} · {domainCount} domain{domainCount !== 1 ? "s" : ""}
          {detected?.sexes && detected.sexes.length > 0 && (
            <> · Detected in: {detected.sexes.length === 1
              ? `${detected.sexes[0]} only`
              : detected.sexes.join(", ")}</>
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

      {/* Verdict Card — compact glanceable summary */}
      {syndromeInterp && detected && (
        <div className="border-b px-4 py-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {/* Confidence */}
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Confidence</div>
              <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
                {detected.confidence}
              </span>
            </div>
            {/* Recovery */}
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Recovery</div>
              <span className="text-xs font-medium text-foreground">
                {syndromeInterp.recovery.status.replace(/_/g, " ")}
              </span>
            </div>
            {/* NOAEL Impact */}
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">NOAEL impact</div>
              <span className="text-xs font-medium text-foreground">
                {syndromeInterp.mortalityContext.mortalityNoaelCap != null
                  ? `Capped at dose level ${syndromeInterp.mortalityContext.mortalityNoaelCap}`
                  : "No mortality impact"}
              </span>
            </div>
            {/* Translational */}
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Translational</div>
              <span className="text-xs font-medium text-foreground">
                {syndromeInterp.translationalConfidence.tier === "insufficient_data"
                  ? "insufficient data"
                  : syndromeInterp.translationalConfidence.tier}
              </span>
            </div>
          </div>
          {/* Key discriminator — surfaced when mechanism is uncertain */}
          {syndromeInterp.mechanismCertainty === "mechanism_uncertain" && interpretation?.discriminator && (
            <p className="mt-2 text-[10px] leading-relaxed text-foreground/70">
              {interpretation.discriminator}
            </p>
          )}
          {/* Conditional mortality callout */}
          {syndromeInterp.mortalityContext.treatmentRelatedDeaths > 0 && (
            <div className="mt-2 flex items-start gap-1.5 rounded bg-muted/30 px-2.5 py-1.5 text-[10px] text-muted-foreground">
              <span className="mt-0.5 shrink-0">&#x26A0;</span>
              <span>
                {syndromeInterp.mortalityContext.treatmentRelatedDeaths} treatment-related death{syndromeInterp.mortalityContext.treatmentRelatedDeaths !== 1 ? "s" : ""}
                {syndromeInterp.mortalityContext.mortalityNoaelCap != null && " \u2014 mortality caps NOAEL"}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Pane: CERTAINTY ASSESSMENT (Phase A, Component 1) */}
      {syndromeInterp && (
        <CollapsiblePane title="Certainty assessment" defaultOpen={syndromeInterp.discriminatingEvidence.length > 0} expandAll={expandGen} collapseAll={collapseGen}>
          {syndromeInterp.discriminatingEvidence.length > 0 ? (
            <CertaintyAssessmentPane interp={syndromeInterp} />
          ) : (
            <p className="text-xs text-muted-foreground italic">No certainty-discriminating evidence available.</p>
          )}
        </CollapsiblePane>
      )}

      {/* Pane: UPGRADE EVIDENCE (v0.3.0 PATCH-04) */}
      {syndromeInterp?.upgradeEvidence && (
        <CollapsiblePane title="Enzyme tier upgrade evidence" defaultOpen={syndromeInterp.upgradeEvidence.levelsLifted > 0} expandAll={expandGen} collapseAll={collapseGen}>
          <UpgradeEvidencePane evidence={syndromeInterp.upgradeEvidence} />
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
            foodConsumptionContext={syndromeInterp?.foodConsumptionContext}
          />
        ) : (
          <p className="text-xs text-muted-foreground">No evidence data available.</p>
        )}
      </CollapsiblePane>

      {/* Pane: DIFFERENTIAL (only shown when pair exists) */}
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
      {syndromeInterp && (
        <CollapsiblePane title="Histopathology context" defaultOpen={syndromeInterp.histopathContext.length > 0} expandAll={expandGen} collapseAll={collapseGen}>
          {syndromeInterp.histopathContext.length > 0 ? (
            <HistopathContextPane crossRefs={syndromeInterp.histopathContext} />
          ) : (
            <p className="text-xs text-muted-foreground italic">No histopathology cross-references for this syndrome.</p>
          )}
        </CollapsiblePane>
      )}

      {/* Pane: CLINICAL OBSERVATIONS (Phase C) */}
      {syndromeInterp && (
        <CollapsiblePane title="Clinical observations" defaultOpen={syndromeInterp.clinicalObservationSupport.assessment !== "no_cl_data"} expandAll={expandGen} collapseAll={collapseGen}>
          {syndromeInterp.clinicalObservationSupport.assessment !== "no_cl_data" ? (
            <ClinicalObservationsPane support={syndromeInterp.clinicalObservationSupport} />
          ) : (
            <p className="text-xs text-muted-foreground italic">No clinical observation data available for this study.</p>
          )}
        </CollapsiblePane>
      )}

      {/* Pane: RECOVERY (Phase A, Component 3) */}
      {syndromeInterp && (
        <CollapsiblePane title="Recovery" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <RecoveryPane recovery={syndromeInterp.recovery} />
        </CollapsiblePane>
      )}

      {/* Pane: MORTALITY CONTEXT (Phase B) */}
      {syndromeInterp && (
        <CollapsiblePane title="Mortality context" defaultOpen={syndromeInterp.mortalityContext.treatmentRelatedDeaths > 0} expandAll={expandGen} collapseAll={collapseGen}>
          {syndromeInterp.mortalityContext.treatmentRelatedDeaths > 0 ? (
            <MortalityContextPane mortality={syndromeInterp.mortalityContext} />
          ) : (
            <p className="text-xs text-muted-foreground italic">No treatment-related mortality detected.</p>
          )}
        </CollapsiblePane>
      )}

      {/* Pane: FOOD CONSUMPTION CONTEXT (Phase B) */}
      {syndromeInterp && (
        <CollapsiblePane
          title="Food consumption"
          defaultOpen={syndromeInterp.foodConsumptionContext.available && syndromeInterp.foodConsumptionContext.bwFwAssessment !== "not_applicable"}
          expandAll={expandGen}
          collapseAll={collapseGen}
        >
          {syndromeInterp.foodConsumptionContext.available &&
            syndromeInterp.foodConsumptionContext.bwFwAssessment !== "not_applicable" ? (
            <FoodConsumptionPane
              context={syndromeInterp.foodConsumptionContext}
              rawData={foodConsumptionSummary}
              doseGroups={rawData?.dose_groups}
            />
          ) : (
            <p className="text-xs text-muted-foreground italic">Food consumption data not available for this study.</p>
          )}
        </CollapsiblePane>
      )}

      {/* Pane: ECETOC ASSESSMENT (Steps 14-15) */}
      {syndromeInterp && detected && (
        <CollapsiblePane title="ECETOC assessment" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
          <EcetocAssessmentPane
            treatmentRelatedness={syndromeInterp.treatmentRelatedness}
            adversity={syndromeInterp.adversity}
            overallSeverity={syndromeInterp.overallSeverity}
            domainsCovered={detected.domainsCovered}
          />
        </CollapsiblePane>
      )}

      {/* Pane: TRANSLATIONAL CONFIDENCE */}
      {syndromeInterp && (
        <CollapsiblePane title="Translational confidence" defaultOpen={syndromeInterp.translationalConfidence.tier !== "insufficient_data"} expandAll={expandGen} collapseAll={collapseGen}>
          {syndromeInterp.translationalConfidence.tier !== "insufficient_data" ? (
            <TranslationalConfidencePane confidence={syndromeInterp.translationalConfidence} />
          ) : (
            <p className="text-xs text-muted-foreground italic">Insufficient data to assess translational confidence.</p>
          )}
        </CollapsiblePane>
      )}

      {/* Pane: INTERPRETATION — collapsible, default closed */}
      {interpretation && (
        <CollapsiblePane title="Interpretation" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
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
        </CollapsiblePane>
      )}

      {/* Pane: RELATED VIEWS — navigation links */}
      <CollapsiblePane title="Related views" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        <div className="space-y-1 text-[11px]">
          <a href="#" className="block text-primary hover:underline"
             onClick={(e) => { e.preventDefault(); if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/dose-response`); }}>
            View dose-response &#x2192;
          </a>
          <a href="#" className="block text-primary hover:underline"
             onClick={(e) => { e.preventDefault(); if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`); }}>
            View histopathology &#x2192;
          </a>
          <a href="#" className="block text-primary hover:underline"
             onClick={(e) => { e.preventDefault(); if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-decision`); }}>
            View NOAEL decision &#x2192;
          </a>
          <a href="#" className="block text-primary hover:underline"
             onClick={(e) => { e.preventDefault(); if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/validation`); }}>
            View validation &#x2192;
          </a>
          <a href="#" className="block text-primary hover:underline"
             onClick={(e) => { e.preventDefault(); if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}`); }}>
            View study summary &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────

/** Evidence Summary pane content */
function EvidenceSummaryContent({
  report: rawReport,
  confidence,
  labMatches,
  syndromeId,
  allEndpoints,
  rawFindings,
  doseGroups,
  foodConsumptionContext,
}: {
  report: NonNullable<ReturnType<typeof getSyndromeTermReport>>;
  confidence: "HIGH" | "MODERATE" | "LOW";
  labMatches: LabClinicalMatch[];
  syndromeId: string;
  allEndpoints: EndpointSummary[];
  rawFindings?: UnifiedFinding[];
  doseGroups?: DoseGroup[];
  foodConsumptionContext?: FoodConsumptionContext;
}) {
  // Override "not_measured" entries for food consumption when API says data is available
  const report = useMemo(() => {
    if (!foodConsumptionContext?.available) return rawReport;
    const foodPattern = /food\s*consumption|food\s*intake/i;
    const overrideEntry = (entry: TermReportEntry): TermReportEntry => {
      if (entry.status === "not_measured" && foodPattern.test(entry.label)) {
        return { ...entry, status: "matched" };
      }
      return entry;
    };
    return {
      ...rawReport,
      supportingEntries: rawReport.supportingEntries.map(overrideEntry),
      requiredEntries: rawReport.requiredEntries.map(overrideEntry),
    };
  }, [rawReport, foodConsumptionContext]);
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
        {cappedConfidence !== confidence && (
          <span className="text-[9px] text-muted-foreground italic">
            reduced from {confidence} — {report.oppositeCount} opposing finding{report.oppositeCount !== 1 ? "s" : ""}
          </span>
        )}
        {cappedConfidence === confidence && report.oppositeCount > 0 && (
          <span className="text-[9px] text-muted-foreground">
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
      case "TRIGGERED": return "text-foreground font-semibold";
      case "NOT TRIGGERED": return "text-muted-foreground";
      case "NOT EVALUATED": return "text-muted-foreground";
      case "APPROACHING": return "text-foreground font-medium";
      default: return "text-muted-foreground";
    }
  };

  return (
    <div className="mt-3 border-t pt-2">
      <div className="mb-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        Hy&apos;s Law assessment
      </div>
      <p className="mb-1.5 text-[9px] text-muted-foreground/60">
        Triggered: concurrent transaminase + bilirubin elevation (p &lt; 0.05). Approaching: one elevated, other borderline (p &lt; 0.1 or |d| &gt; 0.8).
      </p>
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
        <span className="shrink-0 text-muted-foreground">{"\u2713"}</span>
        <span className="min-w-0 flex-1 truncate" title={entry.label}>{entry.label}{entry.sex && <span className="text-[9px] text-muted-foreground"> ({entry.sex})</span>}</span>
        <span className={"shrink-0 text-[9px] font-semibold text-muted-foreground"}>
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
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="shrink-0">{"\u2298"}</span>
        <span className="min-w-0 flex-1 truncate" title={entry.label}>{entry.label}</span>
        <span className={"shrink-0 text-[9px] font-semibold text-muted-foreground"}>
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
        <span className="min-w-0 flex-1 truncate" title={entry.label}>{entry.label}</span>
        <span className={"shrink-0 text-[9px] font-semibold text-muted-foreground"}>
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
      <span className="min-w-0 flex-1 truncate" title={entry.label}>{entry.label}</span>
      <span className={"shrink-0 text-[9px] font-semibold text-muted-foreground"}>
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

// ─── Interpretation layer sub-components ────────────────────

/** Mechanism certainty badge with icon + color + tooltip */
function CertaintyBadge({ certainty }: { certainty: SyndromeInterpretation["mechanismCertainty"] }) {
  const label =
    certainty === "mechanism_confirmed" ? "CONFIRMED"
    : certainty === "mechanism_uncertain" ? "UNCERTAIN"
    : "PATTERN ONLY";
  const colorClass = "text-gray-600";
  const icon =
    certainty === "mechanism_confirmed" ? "\u2713"
    : certainty === "mechanism_uncertain" ? "?"
    : "\u2014";
  const tooltip =
    certainty === "mechanism_confirmed"
      ? "Supporting findings confirm this specific mechanism over alternatives"
      : certainty === "mechanism_uncertain"
        ? "Required findings present but some findings argue against, or key tests were not measured"
        : "Statistical pattern detected but no mechanism-specific findings available";

  return (
    <span
      className={`rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium ${colorClass}`}
      title={tooltip}
    >
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

/** v0.3.0 PATCH-04: Upgrade evidence pane — shows tier, cap, and individual UE items */
function UpgradeEvidencePane({ evidence }: { evidence: UpgradeEvidenceResult }) {
  const metCount = evidence.items.filter(i => i.met).length;
  return (
    <div className="space-y-2">
      {/* Summary */}
      <div className="flex items-center gap-2 text-xs">
        <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
          {evidence.tier.toUpperCase()}
        </span>
        <span className="text-muted-foreground">
          Capped at {evidence.cappedCertainty.replace(/_/g, " ")}
          {evidence.levelsLifted > 0
            ? ` \u2192 lifted ${evidence.levelsLifted} level(s) to ${evidence.finalCertainty.replace(/_/g, " ")}`
            : ""}
        </span>
      </div>
      <div className="text-[10px] text-muted-foreground">
        Score {evidence.totalScore.toFixed(1)} ({metCount}/{evidence.items.length} items met)
      </div>

      {/* Individual items */}
      <div className="space-y-0.5">
        {evidence.items.map((item) => (
          <div key={item.id} className="flex items-start gap-1.5 text-xs">
            <span className={`shrink-0 ${item.met ? "text-muted-foreground" : "text-muted-foreground/40"}`}>
              {item.met ? "\u2713" : "\u2014"}
            </span>
            <span className="min-w-0 flex-1">
              <span className={item.met ? "text-foreground" : "text-muted-foreground/60"}>
                {item.id} {item.label}
              </span>
              <span className="ml-1 text-muted-foreground/60 text-[10px]">
                ({item.strength}, {item.score.toFixed(1)})
              </span>
              <span className="ml-1 text-[10px] text-muted-foreground/50">
                {item.detail}
              </span>
            </span>
          </div>
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
  const iconColor = disc.status === "not_available" ? "text-muted-foreground/40" : "text-muted-foreground";
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
                      <span className="text-foreground">
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
                <span className={ref.assessment === "inconclusive" ? "text-muted-foreground" : "text-foreground"}>
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
          support.assessment === "neutral" ? "text-muted-foreground" : "text-foreground"
        }`}>
          {support.assessment}
        </span>
      </div>
      {support.correlatingObservations.length > 0 ? (
        <div className="space-y-0.5">
          {support.correlatingObservations.map((obs, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="shrink-0 text-muted-foreground">{"\u2713"}</span>
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
          {mortality.mortalityNoaelCapRelevant === false && (
            <span className="text-[9px] text-muted-foreground">(unrelated)</span>
          )}
          {mortality.mortalityNoaelCapRelevant === null && (
            <span className="text-[9px] text-muted-foreground italic">(review)</span>
          )}
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
              <span className="shrink-0 text-muted-foreground">{d.doseLabel ?? `dose ${d.doseGroup}`}</span>
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
  doseGroups,
}: {
  context: FoodConsumptionContext;
  rawData?: import("@/lib/syndrome-interpretation").FoodConsumptionSummaryResponse;
  doseGroups?: DoseGroup[];
}) {
  // Replace generic "at high dose" with actual dose label
  const narrative = useMemo(() => {
    if (!doseGroups?.length) return context.fwNarrative;
    const maxLevel = Math.max(...doseGroups.map((dg) => dg.dose_level));
    const highDose = doseGroups.find((dg) => dg.dose_level === maxLevel);
    if (!highDose?.dose_value || !highDose.dose_unit) return context.fwNarrative;
    const label = `at ${highDose.dose_value} ${highDose.dose_unit}`;
    return context.fwNarrative.replace(/at high dose/gi, label);
  }, [context.fwNarrative, doseGroups]);

  const getDoseLabel = (level: number): string => {
    if (level === 0) return "Control";
    if (!doseGroups?.length) return `Dose ${level}`;
    const dg = doseGroups.find((d) => d.dose_level === level);
    if (!dg?.dose_value || !dg.dose_unit) return `Dose ${level}`;
    return `${dg.dose_value} ${dg.dose_unit}`;
  };

  // Build rich display data per period: all dose groups with pct change, sex comparison
  const periodData = useMemo(() => {
    if (!rawData?.periods) return [];
    return rawData.periods.map((p) => {
      const entries = p.by_dose_sex;
      const sexes = [...new Set(entries.map((e) => e.sex))].sort();
      const doseLevels = [...new Set(entries.filter((e) => e.dose_level > 0).map((e) => e.dose_level))].sort((a, b) => a - b);

      // Lookup: "dose_sex" -> entry
      const lookup = new Map(entries.map((e) => [`${e.dose_level}_${e.sex}`, e]));

      // Build rows: one per dose level, with per-sex data
      const doseRows = doseLevels.map((dose) => {
        const sexData = sexes.map((sex) => {
          const e = lookup.get(`${dose}_${sex}`);
          if (!e) return { sex, fe: null, ctrl: null, pct: null, reduced: false, pSig: "", pVal: null as number | null };
          const ctrl = e.food_efficiency_control;
          const pct = ctrl && ctrl > 0 ? ((e.mean_food_efficiency - ctrl) / ctrl) * 100 : null;
          const pv = e.fe_p_value;
          const pSig = pv == null ? "" : pv < 0.001 ? "***" : pv < 0.01 ? "**" : pv < 0.05 ? "*" : "";
          return { sex, fe: e.mean_food_efficiency, ctrl, pct: pct != null ? Math.round(pct) : null, reduced: e.food_efficiency_reduced ?? false, pSig, pVal: pv };
        });
        return { dose, sexData, anyReduced: sexData.some((s) => s.reduced) };
      });

      const reducedRows = doseRows.filter((r) => r.anyReduced);

      return {
        label: p.label,
        startDay: p.start_day,
        endDay: p.end_day,
        doseRows,
        hasReduced: reducedRows.length > 0,
      };
    });
  }, [rawData]);

  return (
    <div>
      {/* Assessment badge + narrative */}
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Assessment:</span>
        <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
          {context.bwFwAssessment.replace(/_/g, " ")}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-foreground/80">{narrative}</p>

      {/* Recovery — elevated position */}
      {rawData?.recovery?.available && (
        <div className="mt-2">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Recovery</div>
          <div className="mt-0.5 flex gap-4 text-xs">
            <div className="flex items-center gap-1">
              <span className={rawData.recovery.fw_recovered ? "text-emerald-600" : "text-amber-600"}>
                {rawData.recovery.fw_recovered ? "\u2713" : "\u2715"}
              </span>
              <span className="text-muted-foreground">FW:</span>
              <span className={rawData.recovery.fw_recovered ? "text-foreground" : "text-foreground font-medium"}>
                {rawData.recovery.fw_recovered ? "recovered" : "not recovered"}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <span className={rawData.recovery.bw_recovered ? "text-emerald-600" : "text-amber-600"}>
                {rawData.recovery.bw_recovered ? "\u2713" : "\u2715"}
              </span>
              <span className="text-muted-foreground">BW:</span>
              <span className={rawData.recovery.bw_recovered ? "text-foreground" : "text-foreground font-medium"}>
                {rawData.recovery.bw_recovered ? "recovered" : "not recovered"}
              </span>
            </div>
          </div>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
            {rawData.recovery.interpretation}
          </p>
        </div>
      )}

      {/* Food efficiency by dose — dose-response across all groups, grouped by period */}
      {periodData.some((p) => p.hasReduced) && (
        <div className="mt-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Food efficiency by dose
          </div>
          <div className="mt-1.5 space-y-2.5">
            {periodData.filter((p) => p.hasReduced).map((period, pi) => (
              <div key={pi} className="border-l-2 border-muted-foreground/25 pl-2">
                {/* Period label — elevated hierarchy */}
                <div className="text-[10px] font-medium text-muted-foreground mb-1">
                  {period.label ?? `Days ${period.startDay}\u2013${period.endDay}`}
                </div>

                {/* Dose-response: all groups, reduced ones get full detail */}
                <div className="space-y-0.5">
                  {period.doseRows.map(({ dose, sexData, anyReduced }) =>
                    anyReduced ? (
                      /* Reduced group: full detail with FE values + pct */
                      <div key={dose} className="mt-0.5">
                        <div className="text-[10px] font-medium text-foreground">{getDoseLabel(dose)}</div>
                        {sexData.map((s) =>
                          s.fe != null ? (
                            <div key={s.sex} className="flex items-baseline gap-1 ml-2 text-[10px] leading-snug">
                              <span className="w-3 shrink-0 text-muted-foreground">{s.sex}</span>
                              <span className="text-foreground">{s.fe.toFixed(2)}</span>
                              {s.ctrl != null && (
                                <span className="text-muted-foreground">vs {s.ctrl.toFixed(2)} ctrl</span>
                              )}
                              {s.pct != null && (
                                <span className="font-medium text-foreground">
                                  ({s.pct > 0 ? "+" : ""}{s.pct}%)
                                </span>
                              )}
                              {s.pSig ? (
                                <span className="text-muted-foreground/50 text-[9px]">{s.pSig}</span>
                              ) : s.pVal != null && s.pVal < 0.10 ? (
                                <span className="font-mono text-[9px] text-muted-foreground/60">p={s.pVal.toFixed(3)}</span>
                              ) : null}
                            </div>
                          ) : null,
                        )}
                      </div>
                    ) : (
                      /* Non-reduced: compact dose-response line */
                      <div key={dose} className="flex items-center gap-1 text-[10px] text-muted-foreground/60 leading-snug">
                        <span className="shrink-0">{getDoseLabel(dose)}</span>
                        {sexData.map((s) => (
                          <span key={s.sex}>
                            {s.sex} {s.pct != null ? `${s.pct > 0 ? "+" : ""}${s.pct}%` : "\u2014"}
                          </span>
                        ))}
                        {sexData.some((s) => s.pSig) && (
                          <span className="text-muted-foreground/40">{sexData.find((s) => s.pSig)?.pSig}</span>
                        )}
                        {!sexData.some((s) => s.pSig) && sexData.some((s) => s.pVal != null && s.pVal < 0.10) && (
                          <span className="font-mono text-[9px] text-muted-foreground/40">
                            p={sexData.find((s) => s.pVal != null && s.pVal < 0.10)?.pVal?.toFixed(3)}
                          </span>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </div>
            ))}
          </div>
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
        <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
          {recovery.status.replace(/_/g, " ")}
        </span>
      </div>
      <p className="text-xs text-foreground/80">{recovery.summary}</p>
      {recovery.endpoints.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {recovery.endpoints.map((ep, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate text-foreground" title={`${ep.label}${ep.sex !== "Both" ? ` (${ep.sex})` : ""}`}>
                {ep.label}{ep.sex !== "Both" && ` (${ep.sex})`}
              </span>
              <span className="shrink-0 text-muted-foreground">
                terminal d={Math.abs(ep.terminalEffect).toFixed(2)}
              </span>
              {ep.recoveryEffect != null && (
                <span className="shrink-0 text-muted-foreground">
                  recovery d={Math.abs(ep.recoveryEffect).toFixed(2)}
                </span>
              )}
              <span className="shrink-0 text-[9px] font-medium text-muted-foreground">
                {ep.status.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── ECETOC Assessment Pane ───────────────────────────────

const SEVERITY_LABELS: Record<OverallSeverity, string> = {
  S0_Death: "Death",
  carcinogenic: "Carcinogenic",
  proliferative: "Proliferative",
  S4_Critical: "Critical",
  S3_Adverse: "Adverse",
  S2_Concern: "Concern",
  S1_Monitor: "Monitor",
};

function EcetocAssessmentPane({
  treatmentRelatedness,
  adversity,
  overallSeverity,
  domainsCovered,
}: {
  treatmentRelatedness: TreatmentRelatednessScore;
  adversity: AdversityAssessment;
  overallSeverity: OverallSeverity;
  domainsCovered: string[];
}) {
  const trLabel = treatmentRelatedness.overall === "treatment_related" ? "Yes"
    : treatmentRelatedness.overall === "possibly_related" ? "Possibly" : "No";
  const advLabel = adversity.overall === "adverse" ? "Yes"
    : adversity.overall === "non_adverse" ? "No" : "Equivocal";

  return (
    <div className="space-y-3">
      {/* Overall severity */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Severity:</span>
        <span className="rounded-sm border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium text-gray-600">
          {SEVERITY_LABELS[overallSeverity]}
        </span>
      </div>

      {/* Treatment-relatedness */}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">Treatment-related: {trLabel}</span>
        </div>
        <div className="space-y-0.5 pl-2">
          <EcetocFactorRow label="A-1 Dose-response" value={treatmentRelatedness.doseResponse} />
          <EcetocFactorRow label="A-2 Cross-endpoint" value={treatmentRelatedness.crossEndpoint === "concordant" ? `concordant (${domainsCovered.join(", ")})` : "isolated"} />
          <EcetocFactorRow label="A-4 Historical control" value={treatmentRelatedness.hcdComparison === "no_hcd" ? "no data" : treatmentRelatedness.hcdComparison.replace(/_/g, " ")} />
          <EcetocFactorRow label="A-6 Significance" value={treatmentRelatedness.statisticalSignificance.replace(/_/g, " ")} />
          <EcetocFactorRow label="CL observations" value={treatmentRelatedness.clinicalObservationSupport ? "supports" : "no support"} />
        </div>
      </div>

      {/* Adversity */}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-xs font-medium text-foreground">Adverse: {advLabel}</span>
        </div>
        <div className="space-y-0.5 pl-2">
          <EcetocFactorRow label="B-3 Reversible" value={adversity.reversible === true ? "yes" : adversity.reversible === false ? "no" : "unknown"} />
          <EcetocFactorRow label="B-4 Magnitude" value={adversity.magnitudeLevel} />
          <EcetocFactorRow label="B-5 Cross-domain" value={adversity.crossDomainSupport ? "yes" : "no"} />
          <EcetocFactorRow label="B-6 Precursor" value={adversity.precursorToWorse ? "yes" : "no"} />
          <EcetocFactorRow label="B-7 Secondary" value={adversity.secondaryToOther ? "yes" : "no"} />
        </div>
      </div>
    </div>
  );
}

function EcetocFactorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5 text-[10px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

// ─── Translational Confidence Pane ────────────────────────

function TranslationalConfidencePane({ confidence }: { confidence: TranslationalConfidence }) {
  return (
    <div className="space-y-2">
      {/* Tier + summary */}
      <div className="flex items-baseline gap-1.5">
        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] font-semibold text-gray-600 border border-gray-200">
          {confidence.tier.toUpperCase()}
        </span>
      </div>
      <p className="text-[11px] text-foreground leading-relaxed">{confidence.summary}</p>

      {/* PT-level matches */}
      {confidence.endpointLRPlus.length > 0 && (
        <div className="space-y-0.5">
          {confidence.endpointLRPlus.map((pt) => (
            <div key={`${pt.endpoint}-${pt.species}`} className="flex items-baseline gap-1 text-[10px]">
              <span className="text-muted-foreground">{pt.endpoint}:</span>
              <span className="text-foreground">LR+ {pt.lrPlus}</span>
              <span className="text-muted-foreground">({pt.species})</span>
            </div>
          ))}
        </div>
      )}

      {/* Absence caveat */}
      {confidence.absenceCaveat && (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          <span className="mr-1">⚠</span>{confidence.absenceCaveat}
        </p>
      )}

      {/* Data version */}
      <p className="text-[9px] text-muted-foreground">Data: {confidence.dataVersion}</p>
    </div>
  );
}
