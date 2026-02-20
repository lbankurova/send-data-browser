/**
 * SyndromeContextPanel — group-level context panel shown when a syndrome
 * card header is clicked in Syndrome grouping mode.
 *
 * Restructured per syndrome-context-panel-restructure-spec-v2.md:
 * 15 panes → 8 sections: Answer → Evidence → Context → Reference.
 */

import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useFindingsAnalytics } from "@/contexts/FindingsAnalyticsContext";
import { useFindings } from "@/hooks/useFindings";
import { useCollapseAll } from "@/hooks/useCollapseAll";
import { CollapsiblePane } from "./CollapsiblePane";
import { CollapseAllButtons } from "./CollapseAllButtons";
import {
  formatPValue,
  formatEffectSize,
  getDoseGroupColor,
} from "@/lib/severity-colors";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { EndpointSummary } from "@/lib/derive-summaries";
import { getSyndromeTermReport, getSyndromeDefinition } from "@/lib/cross-domain-syndromes";
import type { TermReportEntry, CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import { findClinicalMatchForEndpoint, getClinicalTierTextClass } from "@/lib/lab-clinical-catalog";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import { interpretSyndrome, mapDeathRecordsToDispositions } from "@/lib/syndrome-interpretation";
import type { SyndromeInterpretation, DiscriminatingFinding, HistopathCrossRef, MortalityContext, TumorFinding, FoodConsumptionContext, OverallSeverity, RecoveryRow, TranslationalConfidence, UpgradeEvidenceResult } from "@/lib/syndrome-interpretation";
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
  if (formatted.startsWith("<")) return `p${formatted}`;
  return `p=${formatted}`;
}

// ─── Static data ────────────────────────────────────────────

/** Static empty filters — fetch all findings */
const ALL_FILTERS: FindingsFilters = {
  domain: null, sex: null, severity: null, search: "",
  organ_system: null, endpoint_label: null, dose_response_pattern: null,
};

/** Authored interpretation content per syndrome */
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
    label: string;
    expectThisDir: string;
    expectOtherDir: string;
    testCodes?: string[];
    specimenTerms?: { specimen: string[]; finding: string[] };
    organWeightTerms?: { specimen: string[] };
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

// ─── Severity accent helpers ───────────────────────────────

const SEVERITY_LABELS: Record<OverallSeverity, string> = {
  S0_Death: "S0 Death",
  carcinogenic: "Carcinogenic",
  proliferative: "Proliferative",
  S4_Critical: "S4 Critical",
  S3_Adverse: "S3 Adverse",
  S2_Concern: "S2 Concern",
  S1_Monitor: "S1 Monitor",
};

function getSeverityAccent(severity: OverallSeverity | undefined): {
  borderClass: string;
  borderColor: string | undefined;
  labelClass: string;
} {
  switch (severity) {
    case "S0_Death":
    case "S4_Critical":
    case "carcinogenic":
      return { borderClass: "border-l-4", borderColor: "#DC2626", labelClass: "text-sm font-semibold text-foreground" };
    case "S3_Adverse":
    case "proliferative":
      return { borderClass: "border-l-4", borderColor: "#D97706", labelClass: "text-sm font-semibold text-foreground" };
    case "S2_Concern":
      return { borderClass: "border-l-2", borderColor: undefined, labelClass: "text-sm font-medium text-foreground" };
    case "S1_Monitor":
    default:
      return { borderClass: "", borderColor: undefined, labelClass: "text-sm font-medium text-muted-foreground" };
  }
}

// ─── FC verdict config ─────────────────────────────────────

function getVerdictConfig(assessment: FoodConsumptionContext["bwFwAssessment"]) {
  switch (assessment) {
    case "primary_weight_loss":
      return {
        label: "Primary weight loss",
        description: "BW loss disproportionate to food intake reduction",
        borderClass: "border-l-4 pl-1.5 py-0.5",
        borderColor: "#D97706",
        labelClass: "text-sm font-semibold text-foreground",
        headerLabel: "Primary weight loss",
        headerBorderClass: "border-l-4 pl-1.5",
        headerBorderColor: "#D97706",
        headerTextClass: "font-medium text-foreground",
      };
    case "secondary_to_food":
      return {
        label: "Secondary to reduced intake",
        description: "BW and FC decreased proportionally \u2014 FE preserved",
        borderClass: "",
        borderColor: undefined,
        labelClass: "text-sm font-medium text-muted-foreground",
        headerLabel: "Secondary to intake",
        headerBorderClass: "",
        headerBorderColor: undefined,
        headerTextClass: "text-muted-foreground",
      };
    case "malabsorption":
      return {
        label: "Indeterminate",
        description: "Borderline pattern \u2014 review FE dose-response below",
        borderClass: "border-l-2 pl-1.5 py-0.5",
        borderColor: "currentColor",
        labelClass: "text-sm font-medium text-foreground",
        headerLabel: "Indeterminate",
        headerBorderClass: "border-l-2 pl-1.5",
        headerBorderColor: undefined,
        headerTextClass: "font-medium text-foreground",
      };
    default:
      return {
        label: "No effect",
        description: "No effect on body weight or food consumption",
        borderClass: "",
        borderColor: undefined,
        labelClass: "text-xs text-muted-foreground",
        headerLabel: "No effect",
        headerBorderClass: "",
        headerBorderColor: undefined,
        headerTextClass: "text-muted-foreground",
      };
  }
}

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
  const clinicalObservations = useMemo(() => {
    if (!clTimecourse?.timecourse?.length) return [];
    const key = (obs: string, dose: number, sex: string) => `${obs}|${dose}|${sex}`;
    const peaks = new Map<string, { observation: string; doseGroup: number; sex: string; incidence: number; totalN: number }>();
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
  }, [detected, allEndpoints, histopathData, studyContext, mortalityRaw, tumorFindings, foodConsumptionSummary, clinicalObservations, recoveryData, analytics.syndromes]);

  // Interpretation content
  const interpretation = SYNDROME_INTERPRETATIONS[syndromeId];

  // Differential pair
  const differential = DIFFERENTIAL_PAIRS[syndromeId] ?? null;

  // ── Conditional display flags (§4 master table) ──
  const hasHistopath = (syndromeInterp?.histopathContext.length ?? 0) > 0;
  const hasClinicalFindings =
    syndromeInterp != null &&
    syndromeInterp.clinicalObservationSupport.assessment !== "no_cl_data" &&
    syndromeInterp.clinicalObservationSupport.correlatingObservations.length > 0;
  const hasMortality = (syndromeInterp?.mortalityContext.treatmentRelatedDeaths ?? 0) > 0;
  const hasTranslational = syndromeInterp?.translationalConfidence.tier !== "insufficient_data";
  const showFoodConsumption =
    syndromeId === "XS08" ||
    syndromeId === "XS09" ||
    (syndromeInterp?.foodConsumptionContext.available === true &&
     syndromeInterp.foodConsumptionContext.bwFwAssessment !== "not_applicable" &&
     analytics.syndromes.some(s => s.id === "XS09"));

  // ── Severity accent for header ──
  const sevAccent = getSeverityAccent(syndromeInterp?.overallSeverity);

  // ── Header text helpers ──
  const mechanismText = syndromeInterp
    ? syndromeInterp.mechanismCertainty === "mechanism_confirmed" ? "Confirmed mechanism"
      : syndromeInterp.mechanismCertainty === "mechanism_uncertain" ? "Uncertain mechanism"
      : "Pattern only"
    : null;
  const mechanismClass = syndromeInterp
    ? syndromeInterp.mechanismCertainty === "mechanism_confirmed" ? "text-muted-foreground" : "text-foreground"
    : "text-muted-foreground";
  const mechanismTooltip = syndromeInterp
    ? syndromeInterp.mechanismCertainty === "mechanism_confirmed"
      ? "Supporting findings confirm this specific mechanism over alternatives"
      : syndromeInterp.mechanismCertainty === "mechanism_uncertain"
        ? "Required findings present but some findings argue against, or key tests were not measured"
        : "Statistical pattern detected but no mechanism-specific findings available"
    : "";

  const recoveryText = syndromeInterp
    ? syndromeInterp.recovery.status === "recovered" ? "Recovered"
      : syndromeInterp.recovery.status === "not_recovered" ? "Not recovered"
      : syndromeInterp.recovery.status === "partial" ? "Partial recovery"
      : syndromeInterp.recovery.status === "not_examined" ? "No recovery arm"
      : "Recovery unknown"
    : null;
  const recoveryIsAttention = syndromeInterp
    ? syndromeInterp.recovery.status === "not_recovered" || syndromeInterp.recovery.status === "partial"
    : false;

  const trLabel = syndromeInterp
    ? syndromeInterp.treatmentRelatedness.overall === "treatment_related" ? "Treatment-related"
      : syndromeInterp.treatmentRelatedness.overall === "possibly_related" ? "Possibly related"
      : "Not related"
    : null;
  const advLabel = syndromeInterp
    ? syndromeInterp.adversity.overall === "adverse" ? "Adverse"
      : syndromeInterp.adversity.overall === "non_adverse" ? "Non-adverse"
      : "Equivocal"
    : null;
  const mortalityCap = syndromeInterp?.mortalityContext.mortalityNoaelCap;

  return (
    <div>
      {/* ══ STICKY HEADER (verdict) ══ */}
      <div
        className={`sticky top-0 z-10 border-b bg-background px-4 py-3 ${sevAccent.borderClass}`}
        style={sevAccent.borderColor ? { borderLeftColor: sevAccent.borderColor } : undefined}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">{name}</h3>
          <CollapseAllButtons onExpandAll={expandAll} onCollapseAll={collapseAll} />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {syndromeId} · {endpointCount} endpoint{endpointCount !== 1 ? "s" : ""} · {domainCount} domain{domainCount !== 1 ? "s" : ""}
          {detected?.sexes && detected.sexes.length > 0 && (
            <> · {detected.sexes.length === 1
              ? `${detected.sexes[0]} only`
              : detected.sexes.join(" + ")}</>
          )}
        </p>
        {syndromeInterp && (
          <>
            {/* Line 1: Severity label */}
            <div className={`mt-1.5 ${sevAccent.labelClass}`}>
              {SEVERITY_LABELS[syndromeInterp.overallSeverity]}
            </div>
            {/* Line 2: Mechanism certainty · Recovery */}
            <div className="mt-0.5 text-[10px]">
              <span className={mechanismClass} title={mechanismTooltip}>{mechanismText}</span>
              {recoveryText && (
                <>
                  <span className="text-muted-foreground"> · </span>
                  <span className={recoveryIsAttention ? "text-foreground" : "text-muted-foreground"}>{recoveryText}</span>
                </>
              )}
            </div>
            {/* Line 3: TR/ADV · optional NOAEL cap */}
            {trLabel && advLabel && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {trLabel} · {advLabel}
                {mortalityCap != null && (
                  <span className="text-foreground"> · NOAEL capped by mortality</span>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Loading state */}
      {!syndromeInterp && (
        <div className="px-4 py-6 text-xs text-muted-foreground">Loading interpretation…</div>
      )}

      {/* ══ EVIDENCE PANE ══ */}
      {syndromeInterp && (
        <CollapsiblePane title="Evidence" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <EvidencePane
            syndromeId={syndromeId}
            syndromeInterp={syndromeInterp}
            termReport={termReport}
            labMatches={analytics.labMatches}
            allEndpoints={allEndpoints}
            rawFindings={rawData?.findings}
            doseGroups={rawData?.dose_groups}
            differential={differential}
            detectedSyndromes={analytics.syndromes}
            syndromeName={name}
          />
        </CollapsiblePane>
      )}

      {/* ══ DOSE-RESPONSE & RECOVERY PANE ══ */}
      {syndromeInterp && detected && (
        <CollapsiblePane title="Dose-response & recovery" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <DoseResponseRecoveryPane
            syndromeInterp={syndromeInterp}
            domainsCovered={detected.domainsCovered}
            allEndpoints={allEndpoints}
          />
        </CollapsiblePane>
      )}

      {/* ══ HISTOPATHOLOGY (conditional) ══ */}
      {syndromeInterp && hasHistopath && (
        <CollapsiblePane title="Histopathology" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <HistopathContextPane crossRefs={syndromeInterp.histopathContext} />
        </CollapsiblePane>
      )}

      {/* ══ FOOD CONSUMPTION (conditional) ══ */}
      {syndromeInterp && showFoodConsumption && (
        <CollapsiblePane
          title="Food consumption"
          defaultOpen={syndromeInterp.foodConsumptionContext.available && syndromeInterp.foodConsumptionContext.bwFwAssessment !== "not_applicable"}
          headerRight={
            syndromeInterp.foodConsumptionContext.available && syndromeInterp.foodConsumptionContext.bwFwAssessment !== "not_applicable"
              ? <FoodConsumptionHeaderRight assessment={syndromeInterp.foodConsumptionContext.bwFwAssessment} />
              : undefined
          }
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

      {/* ══ CLINICAL OBSERVATIONS (conditional, collapsed) ══ */}
      {syndromeInterp && hasClinicalFindings && (
        <CollapsiblePane
          title="Clinical observations"
          defaultOpen={false}
          headerRight={
            <span className="text-muted-foreground">
              {syndromeInterp.clinicalObservationSupport.correlatingObservations.length} correlating
            </span>
          }
          expandAll={expandGen}
          collapseAll={collapseGen}
        >
          <ClinicalObservationsPane support={syndromeInterp.clinicalObservationSupport} />
        </CollapsiblePane>
      )}

      {/* ══ MORTALITY (conditional, collapsed) ══ */}
      {syndromeInterp && hasMortality && (
        <CollapsiblePane
          title="Mortality"
          defaultOpen={false}
          headerRight={
            <span
              className="border-l-4 pl-1.5 font-medium text-foreground"
              style={{ borderLeftColor: "#DC2626" }}
            >
              {syndromeInterp.mortalityContext.treatmentRelatedDeaths} death{syndromeInterp.mortalityContext.treatmentRelatedDeaths !== 1 ? "s" : ""}
              {syndromeInterp.mortalityContext.mortalityNoaelCap != null && " \u2014 NOAEL capped"}
            </span>
          }
          expandAll={expandGen}
          collapseAll={collapseGen}
        >
          <MortalityContextPane mortality={syndromeInterp.mortalityContext} />
        </CollapsiblePane>
      )}

      {/* ══ TRANSLATIONAL CONFIDENCE (conditional, collapsed) ══ */}
      {syndromeInterp && hasTranslational && (
        <CollapsiblePane
          title="Translational confidence"
          defaultOpen={false}
          headerRight={
            <span className="text-muted-foreground capitalize">
              {syndromeInterp.translationalConfidence.tier.replace(/_/g, " ")}
            </span>
          }
          expandAll={expandGen}
          collapseAll={collapseGen}
        >
          <TranslationalConfidencePane confidence={syndromeInterp.translationalConfidence} />
        </CollapsiblePane>
      )}

      {/* ══ REFERENCE (always, collapsed) ══ */}
      <CollapsiblePane title="Reference" defaultOpen={false} expandAll={expandGen} collapseAll={collapseGen}>
        {interpretation && (
          <div className="space-y-3">
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Description</div>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{interpretation.description}</p>
            </div>
            <div>
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Regulatory significance</div>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{interpretation.regulatory}</p>
            </div>
            {interpretation.discriminator && (
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Key discriminator</div>
                <p className="mt-0.5 text-xs leading-relaxed text-foreground/80">{interpretation.discriminator}</p>
              </div>
            )}
          </div>
        )}
        {/* Separator */}
        {interpretation && <div className="my-3 border-t" />}
        {/* Navigation links — 4 reviewer-relevant views */}
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
             onClick={(e) => { e.preventDefault(); if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}`); }}>
            View study summary &#x2192;
          </a>
        </div>
      </CollapsiblePane>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ══ EVIDENCE PANE ═════════════════════════════════════════
// ═══════════════════════════════════════════════════════════

function EvidencePane({
  syndromeId,
  syndromeInterp,
  termReport: rawReport,
  labMatches,
  allEndpoints,
  rawFindings,
  doseGroups,
  differential,
  detectedSyndromes,
  syndromeName,
}: {
  syndromeId: string;
  syndromeInterp: SyndromeInterpretation;
  termReport: NonNullable<ReturnType<typeof getSyndromeTermReport>> | null;
  labMatches: LabClinicalMatch[];
  allEndpoints: EndpointSummary[];
  rawFindings?: UnifiedFinding[];
  doseGroups?: DoseGroup[];
  differential: DifferentialPair | null;
  detectedSyndromes: CrossDomainSyndrome[];
  syndromeName: string;
}) {
  // Override "not_measured" entries for food consumption when API says data is available
  const report = useMemo(() => {
    if (!rawReport) return null;
    if (!syndromeInterp.foodConsumptionContext?.available) return rawReport;
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
  }, [rawReport, syndromeInterp.foodConsumptionContext]);

  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const isHepatic = syndromeId === "XS01" || syndromeId === "XS02";

  return (
    <div className="space-y-3">
      {/* ── Required/Supporting findings ── */}
      {report && (
        <>
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
        </>
      )}

      {/* ── Discriminating evidence (merged differential) ── */}
      {syndromeInterp.discriminatingEvidence.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Discriminating{differential ? ` (vs ${differential.vsName})` : ""}
          </div>
          <p className="mt-0.5 mb-1.5 text-xs leading-relaxed text-foreground/80">
            {syndromeInterp.certaintyRationale}
          </p>
          <div className="space-y-0.5">
            {syndromeInterp.discriminatingEvidence.map((disc, i) => (
              <DiscriminatingEvidenceRow key={i} disc={disc} differential={differential} />
            ))}
          </div>

          {/* Differential assessment line */}
          {differential && (
            <DifferentialAssessmentLine
              differential={differential}
              syndromeInterp={syndromeInterp}
              detectedSyndromes={detectedSyndromes}
              syndromeName={syndromeName}
            />
          )}
        </div>
      )}

      {/* ── Hy's Law (only TRIGGERED/APPROACHING) ── */}
      {isHepatic && (
        <HysLawFiltered
          labMatches={labMatches}
          allEndpoints={allEndpoints}
          rawFindings={rawFindings}
          doseGroups={doseGroups}
        />
      )}

      {/* ── Upgrade evidence (collapsible sub-section) ── */}
      {syndromeInterp.upgradeEvidence && syndromeInterp.upgradeEvidence.levelsLifted >= 0 && (
        <div>
          <button
            className="text-[10px] text-primary cursor-pointer hover:underline"
            onClick={() => setUpgradeOpen(!upgradeOpen)}
          >
            {upgradeOpen ? "Hide" : "Show"} upgrade evidence ({syndromeInterp.upgradeEvidence.tier.toUpperCase()} tier
            {syndromeInterp.upgradeEvidence.levelsLifted > 0
              ? ` \u2192 lifted ${syndromeInterp.upgradeEvidence.levelsLifted} level`
              : ""}) {upgradeOpen ? "\u25be" : "\u25b8"}
          </button>
          {upgradeOpen && (
            <div className="mt-1.5">
              <UpgradeEvidenceContent evidence={syndromeInterp.upgradeEvidence} />
            </div>
          )}
        </div>
      )}

      {/* ── Domain coverage (compact bottom line) ── */}
      {report && (
        <div className="text-xs text-muted-foreground">
          {report.domainsCovered.length > 0 && (
            <span>Domains: {report.domainsCovered.join(", ")}</span>
          )}
          {report.missingDomains.length > 0 && (
            <span> · Missing: {report.missingDomains.join(", ")} (would strengthen confidence)</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Evidence sub-components ──────────────────────────────

/** Single row in the term checklist — font-weight differentiation */
function TermChecklistRow({ entry, labMatches }: { entry: TermReportEntry; labMatches: LabClinicalMatch[] }) {
  const clinicalTag = entry.status === "matched" && entry.matchedEndpoint
    ? findClinicalMatchForEndpoint(entry.matchedEndpoint, labMatches)
    : null;

  if (entry.status === "matched") {
    return (
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground">
        <span className="min-w-0 flex-1 truncate" title={entry.label}>{entry.label}{entry.sex && <span className="text-[9px] text-muted-foreground"> ({entry.sex})</span>}</span>
        <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">
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
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={entry.label}>{entry.label}</span>
        <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">
          {entry.domain}
        </span>
        <span className="shrink-0 text-[9px] italic">found {dirArrow} (argues against)</span>
      </div>
    );
  }

  if (entry.status === "not_significant") {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="min-w-0 flex-1 truncate" title={entry.label}>{entry.label}</span>
        <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">
          {entry.domain}
        </span>
        <span className="shrink-0 text-[9px] italic text-muted-foreground">present, not significant</span>
      </div>
    );
  }

  // not_measured
  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
      <span className="min-w-0 flex-1 truncate" title={entry.label}>{entry.label}</span>
      <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">
        {entry.domain}
      </span>
      <span className="shrink-0 text-[9px] italic text-muted-foreground">not measured</span>
    </div>
  );
}

/** Single row in discriminating evidence — extended with differential implication */
function DiscriminatingEvidenceRow({ disc, differential }: {
  disc: DiscriminatingFinding;
  differential: DifferentialPair | null;
}) {
  const dirArrow = disc.expectedDirection === "up" ? "\u2191" : "\u2193";
  const actualArrow = disc.actualDirection === "up" ? "\u2191" : disc.actualDirection === "down" ? "\u2193" : "";

  // Derive differential implication text
  let diffText: string | null = null;
  if (differential) {
    if (disc.status === "supports") {
      diffText = `rules out ${differential.vsName.toLowerCase()}`;
    } else if (disc.status === "argues_against") {
      diffText = `suggests ${differential.vsName.toLowerCase()}`;
    } else if (disc.status === "not_available") {
      diffText = "not examined";
    }
  }

  const textClass = disc.status === "not_available"
    ? "text-muted-foreground/60"
    : disc.status === "supports"
      ? "font-medium text-foreground"
      : "text-muted-foreground";

  return (
    <div className={`flex items-start gap-1.5 text-[10px] ${textClass}`}>
      <span className="min-w-0 flex-1">
        <span>{disc.endpoint}</span>
        <span className="ml-1 text-muted-foreground">
          expected {dirArrow}
          {disc.status === "not_available"
            ? " \u2014 not available"
            : disc.status === "argues_against"
              ? `, found ${actualArrow} (argues against)`
              : `, found ${actualArrow}`}
        </span>
        {diffText && (
          <span className="ml-1 text-muted-foreground/60"> \u2192 {diffText}</span>
        )}
      </span>
      <span className="shrink-0 text-[9px] text-muted-foreground">
        {disc.weight === "strong" ? "STRONG" : "moderate"}
      </span>
    </div>
  );
}

/** Overall differential assessment line */
function DifferentialAssessmentLine({
  differential, syndromeInterp, detectedSyndromes, syndromeName,
}: {
  differential: DifferentialPair;
  syndromeInterp: SyndromeInterpretation;
  detectedSyndromes: CrossDomainSyndrome[];
  syndromeName: string;
}) {
  const otherDetected = detectedSyndromes.find((s) => s.id === differential.vsId);
  const supportsThis = syndromeInterp.discriminatingEvidence.filter((d) => d.status === "supports").length;
  const arguesAgainst = syndromeInterp.discriminatingEvidence.filter((d) => d.status === "argues_against").length;
  const notAvailable = syndromeInterp.discriminatingEvidence.filter((d) => d.status === "not_available").length;

  let assessment: string;
  if (otherDetected) {
    assessment = `Both syndromes detected \u2014 review discriminating findings to distinguish.`;
  } else if (supportsThis > arguesAgainst) {
    assessment = `${syndromeName} favored over ${differential.vsName.toLowerCase()}`;
  } else if (arguesAgainst > supportsThis) {
    assessment = `${differential.vsName} may be more likely than ${syndromeName.toLowerCase()}`;
  } else if (notAvailable === syndromeInterp.discriminatingEvidence.length) {
    assessment = `Cannot distinguish \u2014 discriminating findings not available`;
  } else {
    assessment = `Inconclusive \u2014 mixed evidence`;
  }

  return (
    <div className="mt-1.5 text-[10px] font-medium text-foreground/80">
      Assessment: {assessment}
    </div>
  );
}

/** Hy's Law — only show TRIGGERED/APPROACHING rules */
function HysLawFiltered({
  labMatches, allEndpoints, rawFindings, doseGroups,
}: {
  labMatches: LabClinicalMatch[];
  allEndpoints: EndpointSummary[];
  rawFindings?: UnifiedFinding[];
  doseGroups?: DoseGroup[];
}) {
  const HYS_RULES = ["L03", "L07", "L08"] as const;

  const doseLabelMap = new Map<number, string>();
  if (doseGroups) {
    for (const dg of doseGroups) {
      if (dg.dose_value != null && dg.dose_unit) {
        doseLabelMap.set(dg.dose_level, `${dg.dose_value} ${dg.dose_unit}`);
      }
    }
  }

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

  function getEndpointSeverity(testCodes: string[]): string | null {
    const codes = testCodes.map((c) => c.toUpperCase());
    const ep = allEndpoints.find(
      (e) => e.domain === "LB" && codes.includes(e.testCode?.toUpperCase() ?? ""),
    );
    return ep?.worstSeverity ?? null;
  }

  function doseContext(name: string, testCodes: string[], direction: "up" | "down"): string {
    const arrow = direction === "up" ? " \u2191" : " \u2193";
    const dose = findSignificantDose(testCodes);
    const sev = getEndpointSeverity(testCodes);
    const parts = [`${name}${arrow} present`];
    if (dose) parts[0] += ` at ${dose}`;
    if (sev) parts[0] += ` (${sev})`;
    return parts[0];
  }

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

  const biliApproaching = biliPresent && !biliUp && (
    (biliEp.maxEffectSize != null && Math.abs(biliEp.maxEffectSize) > 0.8) ||
    (biliEp.minPValue != null && biliEp.minPValue < 0.1)
  );

  const ruleStatuses = HYS_RULES.map((ruleId) => {
    const matched = labMatches.find((m) => m.ruleId === ruleId);

    if (matched) {
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

    if (ruleId === "L03") {
      if (!altUp && !astUp) {
        return { ruleId, status: "NOT TRIGGERED" as const, label: "Concurrent ALT + bilirubin", explanation: "ALT/AST not elevated" };
      }
      if (!biliPresent) {
        return { ruleId, status: "NOT EVALUATED" as const, label: "Concurrent ALT + bilirubin", explanation: "Bilirubin not measured in study" };
      }
      if (biliApproaching) {
        const transaminase = altUp ? doseContext("ALT", ["ALT", "ALAT"], "up") : doseContext("AST", ["AST", "ASAT"], "up");
        const biliDetail = biliEp.minPValue != null
          ? `Bilirubin borderline (p=${formatPValue(biliEp.minPValue)}, |d|=${formatEffectSize(Math.abs(biliEp.maxEffectSize ?? 0))})`
          : "Bilirubin approaching threshold";
        return { ruleId, status: "APPROACHING" as const, label: "Concurrent ALT + bilirubin", explanation: `${transaminase}; ${biliDetail}` };
      }
      if (!biliUp) {
        return { ruleId, status: "NOT TRIGGERED" as const, label: "Concurrent ALT + bilirubin", explanation: "" };
      }
      return { ruleId, status: "NOT TRIGGERED" as const, label: "Concurrent ALT + bilirubin", explanation: "" };
    }
    if (ruleId === "L07") {
      if (!altUp && !astUp) {
        return { ruleId, status: "NOT TRIGGERED" as const, label: "Classic Hy's Law", explanation: "" };
      }
      if (alpUp) {
        return { ruleId, status: "NOT TRIGGERED" as const, label: "Classic Hy's Law", explanation: "" };
      }
      return { ruleId, status: "NOT EVALUATED" as const, label: "Classic Hy's Law", explanation: "ULN-relative not computed" };
    }
    // L08
    if (!altUp && !astUp) {
      return { ruleId, status: "NOT TRIGGERED" as const, label: "Modified Hy's Law (animal)", explanation: "" };
    }
    if (!biliPresent) {
      return { ruleId, status: "NOT EVALUATED" as const, label: "Modified Hy's Law (animal)", explanation: "Bilirubin not available" };
    }
    if (biliApproaching) {
      const transaminase = altUp ? doseContext("ALT", ["ALT", "ALAT"], "up") : doseContext("AST", ["AST", "ASAT"], "up");
      const biliDetail = biliEp.minPValue != null
        ? `Bilirubin borderline (p=${formatPValue(biliEp.minPValue)}, |d|=${formatEffectSize(Math.abs(biliEp.maxEffectSize ?? 0))})`
        : "Bilirubin approaching threshold";
      return { ruleId, status: "APPROACHING" as const, label: "Modified Hy's Law (animal)", explanation: `${transaminase}; ${biliDetail}` };
    }
    if (!biliUp) {
      return { ruleId, status: "NOT TRIGGERED" as const, label: "Modified Hy's Law (animal)", explanation: "" };
    }
    return { ruleId, status: "NOT TRIGGERED" as const, label: "Modified Hy's Law (animal)", explanation: "" };
  });

  // Filter: only show actionable rules
  const triggered = ruleStatuses.filter(r => r.status === "TRIGGERED");
  const approaching = ruleStatuses.filter(r => r.status === "APPROACHING");
  const notEvaluated = ruleStatuses.filter(r => r.status === "NOT EVALUATED");

  if (triggered.length === 0 && approaching.length === 0) {
    // No actionable rules — show "cannot evaluate" only when ALL rules are NOT EVALUATED
    // (no NOT TRIGGERED results at all)
    if (notEvaluated.length > 0 && ruleStatuses.every(r => r.status !== "NOT TRIGGERED")) {
      return (
        <div className="text-[10px] text-muted-foreground">
          Hy&apos;s Law: cannot evaluate ({notEvaluated.map(r => r.explanation).filter(Boolean).join("; ") || "required endpoints not measured"})
        </div>
      );
    }
    return null;
  }

  // Show TRIGGERED or APPROACHING as accent blocks
  const actionable = [...triggered, ...approaching];
  return (
    <div className="space-y-1.5">
      {actionable.map((rs) => {
        const isTrig = rs.status === "TRIGGERED";
        return (
          <div
            key={rs.ruleId}
            className={`${isTrig ? "border-l-4" : "border-l-2"} pl-1.5 py-0.5`}
            style={{ borderLeftColor: isTrig ? "#DC2626" : "#D97706" }}
          >
            <div className={`text-[10px] ${isTrig ? "font-semibold" : "font-medium"} text-foreground`}>
              Hy&apos;s Law: {rs.status} ({rs.ruleId})
            </div>
            {rs.explanation && (
              <div className="text-[10px] text-muted-foreground">{rs.explanation}</div>
            )}
          </div>
        );
      })}
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

/** Upgrade evidence content (used in collapsible sub-section) */
function UpgradeEvidenceContent({ evidence }: { evidence: UpgradeEvidenceResult }) {
  const metCount = evidence.items.filter(i => i.met).length;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
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
      <div className="space-y-0.5">
        {evidence.items.map((item) => (
          <div key={item.id} className={`flex items-start gap-1.5 text-[10px] ${item.met ? "font-medium text-foreground" : "text-muted-foreground/60"}`}>
            <span className="min-w-0 flex-1">
              <span>{item.id} {item.label}</span>
              <span className="ml-1 text-muted-foreground/60">
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

// ═══════════════════════════════════════════════════════════
// ══ DOSE-RESPONSE & RECOVERY PANE ═════════════════════════
// ═══════════════════════════════════════════════════════════

function DoseResponseRecoveryPane({
  syndromeInterp,
  domainsCovered,
  allEndpoints,
}: {
  syndromeInterp: SyndromeInterpretation;
  domainsCovered: string[];
  allEndpoints: EndpointSummary[];
}) {
  const [factorsOpen, setFactorsOpen] = useState(false);

  const tr = syndromeInterp.treatmentRelatedness;
  const adv = syndromeInterp.adversity;
  const recovery = syndromeInterp.recovery;

  // Dose-response pattern text
  const drPattern = tr.doseResponse === "strong" ? "monotonic" : tr.doseResponse === "weak" ? "non-monotonic" : "absent";

  // Find lead endpoint (lowest p-value among syndrome matched endpoints)
  const leadEp = useMemo(() => {
    const sorted = [...allEndpoints].filter(e => e.minPValue != null).sort((a, b) => (a.minPValue ?? 1) - (b.minPValue ?? 1));
    return sorted[0] ?? null;
  }, [allEndpoints]);

  const trLabel = tr.overall === "treatment_related" ? "Yes"
    : tr.overall === "possibly_related" ? "Possibly" : "No";
  const advLabel = adv.overall === "adverse" ? "Yes"
    : adv.overall === "non_adverse" ? "No" : "Equivocal";

  return (
    <div className="space-y-3">
      {/* ── Dose-response summary ── */}
      <div className="space-y-0.5">
        <div className="flex items-baseline gap-1.5 text-[10px]">
          <span className="text-muted-foreground">Dose-response:</span>
          <span className="font-mono font-medium text-foreground">{drPattern}</span>
        </div>
        {leadEp && (
          <div className="flex items-baseline gap-1.5 text-[10px]">
            <span className="text-muted-foreground">Lead endpoint:</span>
            <span className="font-medium text-foreground">{leadEp.endpoint_label}</span>
            {leadEp.minPValue != null && (
              <span className="font-mono text-muted-foreground">{formatPValueWithPrefix(leadEp.minPValue)}</span>
            )}
            {leadEp.maxEffectSize != null && (
              <span className="font-mono text-muted-foreground">d={Math.abs(leadEp.maxEffectSize).toFixed(2)}</span>
            )}
          </div>
        )}
        <div className="flex items-baseline gap-1.5 text-[10px]">
          <span className="text-muted-foreground">Magnitude:</span>
          <span className="font-medium text-foreground">
            {adv.magnitudeLevel}
            {leadEp?.maxEffectSize != null && ` (d=${Math.abs(leadEp.maxEffectSize).toFixed(1)})`}
          </span>
        </div>
      </div>

      {/* ── Recovery with border-left blocks ── */}
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Recovery</div>
        {recovery.status === "not_examined" ? (
          <p className="mt-1 text-[10px] text-muted-foreground italic">No recovery arm in study</p>
        ) : recovery.endpoints.length > 0 ? (
          <div className="mt-1 space-y-0.5">
            {recovery.endpoints.map((ep, i) => {
              const isRecovered = ep.status === "recovered";
              const isPartial = ep.status === "partial";
              const borderClass = isRecovered
                ? "border-l-2 border-l-emerald-400/40 pl-2"
                : isPartial
                  ? "border-l-2 border-l-amber-300/40 pl-2"
                  : "border-l-2 border-l-amber-400/60 pl-2";
              const textClass = isRecovered
                ? "text-[10px] text-muted-foreground"
                : isPartial
                  ? "text-[10px] text-foreground/80"
                  : "text-[10px] font-medium text-foreground";

              return (
                <div key={i} className={`${borderClass} ${textClass}`}>
                  <span>{ep.label}{ep.sex !== "Both" && ` (${ep.sex})`}</span>
                  <span className="ml-1.5 font-mono text-muted-foreground">
                    d={Math.abs(ep.terminalEffect).toFixed(1)}
                    {ep.recoveryEffect != null && ` \u2192 d=${Math.abs(ep.recoveryEffect).toFixed(1)}`}
                  </span>
                  <span className="ml-1.5">{ep.status.replace(/_/g, " ")}</span>
                </div>
              );
            })}

            {/* Conclusion line */}
            <div className="mt-1 text-[10px] text-muted-foreground">
              {recovery.summary}
            </div>
          </div>
        ) : (
          <p className="mt-1 text-[10px] text-muted-foreground">{recovery.summary}</p>
        )}
      </div>

      {/* ── Collapsible "All A/B factors" ── */}
      <div>
        <button
          className="text-[10px] text-primary cursor-pointer hover:underline"
          onClick={() => setFactorsOpen(!factorsOpen)}
        >
          {factorsOpen ? "Hide" : "Show"} all A/B factors {factorsOpen ? "\u25be" : "\u25b8"}
        </button>
        {factorsOpen && (
          <div className="mt-1.5 space-y-3">
            {/* Treatment-relatedness */}
            <div>
              <div className="mb-1 text-xs font-medium text-foreground">Treatment-related: {trLabel}</div>
              <div className="space-y-0.5 pl-2">
                <EcetocFactorRow label="A-1 Dose-response" value={tr.doseResponse} />
                <EcetocFactorRow label="A-2 Cross-endpoint" value={tr.crossEndpoint === "concordant" ? `concordant (${domainsCovered.join(", ")})` : "isolated"} />
                <EcetocFactorRow label="A-4 Historical control" value={tr.hcdComparison === "no_hcd" ? "no data" : tr.hcdComparison.replace(/_/g, " ")} />
                <EcetocFactorRow label="A-6 Significance" value={tr.statisticalSignificance.replace(/_/g, " ")} />
                <EcetocFactorRow label="CL observations" value={tr.clinicalObservationSupport ? "supports" : "no support"} />
              </div>
            </div>
            {/* Adversity — hide B-2, B-6, B-7 (unimplemented) */}
            <div>
              <div className="mb-1 text-xs font-medium text-foreground">Adverse: {advLabel}</div>
              <div className="space-y-0.5 pl-2">
                <EcetocFactorRow label="B-1 Adaptive response" value={adv.adaptive ? "yes" : "no"} />
                <EcetocFactorRow label="B-3 Reversible" value={adv.reversible === true ? "yes" : adv.reversible === false ? "no" : "unknown"} />
                <EcetocFactorRow label="B-4 Magnitude" value={adv.magnitudeLevel} />
                <EcetocFactorRow label="B-5 Cross-domain" value={adv.crossDomainSupport ? "yes" : "no"} />
              </div>
            </div>
          </div>
        )}
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

// ═══════════════════════════════════════════════════════════
// ══ CONTEXT PANES ═════════════════════════════════════════
// ═══════════════════════════════════════════════════════════

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

/** Clinical observations pane (compact) */
function ClinicalObservationsPane({ support }: { support: SyndromeInterpretation["clinicalObservationSupport"] }) {
  return (
    <div className="space-y-0.5">
      {support.correlatingObservations.map((obs, i) => (
        <div key={i} className={`text-[10px] ${obs.incidenceDoseDependent ? "font-medium text-foreground" : "text-muted-foreground"}`}>
          <span>{obs.observation}</span>
          <span className="ml-1.5 text-muted-foreground">
            {obs.incidenceDoseDependent ? "dose-dependent" : ""}
            {` (Tier ${obs.tier})`}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Mortality context pane — death details + NOAEL cap */
function MortalityContextPane({ mortality }: { mortality: MortalityContext }) {
  return (
    <div>
      {mortality.mortalityNoaelCap != null && (
        <div className="mb-2 text-[10px] font-medium text-foreground">
          NOAEL cap: dose level {mortality.mortalityNoaelCap}
          {mortality.mortalityNoaelCapRelevant === false && (
            <span className="ml-1 font-normal text-muted-foreground">(unrelated)</span>
          )}
          {mortality.mortalityNoaelCapRelevant === null && (
            <span className="ml-1 font-normal text-muted-foreground italic">(review)</span>
          )}
        </div>
      )}
      {mortality.deathDetails.length > 0 && (
        <div className="space-y-0.5">
          {mortality.deathDetails.map((d, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
              <span className="shrink-0">{d.animalId}</span>
              <span className="shrink-0">{d.doseLabel ?? `dose ${d.doseGroup}`}</span>
              <span className="shrink-0">day {d.dispositionDay}</span>
              {d.causeOfDeath && (
                <span className="min-w-0 flex-1 truncate font-sans text-foreground/80" title={d.causeOfDeath}>
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

// ═══════════════════════════════════════════════════════════
// ══ FOOD CONSUMPTION PANE ═════════════════════════════════
// ═══════════════════════════════════════════════════════════

/** FC headerRight — classification label with triage accent */
function FoodConsumptionHeaderRight({ assessment }: { assessment: FoodConsumptionContext["bwFwAssessment"] }) {
  const cfg = getVerdictConfig(assessment);
  return (
    <span
      className={`${cfg.headerBorderClass} ${cfg.headerTextClass}`}
      style={cfg.headerBorderColor ? { borderLeftColor: cfg.headerBorderColor } : undefined}
    >
      {cfg.headerLabel}
    </span>
  );
}

/** Single recovery parameter row with border-left accent (§5.5) */
function RecoveryParameterRow({ label, recovered, residualPct }: {
  label: string;
  recovered: boolean;
  residualPct: number | null;
}) {
  if (recovered) {
    return (
      <div className="border-l-2 border-l-emerald-400/40 pl-2 text-[10px] text-muted-foreground" role="listitem" aria-label={`${label} recovered`}>
        {label} recovered
      </div>
    );
  }
  return (
    <div className="border-l-2 border-l-amber-400/60 pl-2 text-[10px] font-medium text-foreground" role="listitem" aria-label={`${label} not recovered`}>
      {label} not recovered{residualPct != null ? ` — still ↓${Math.abs(residualPct)}% at recovery` : ""}
    </div>
  );
}

/** Food consumption context pane — redesigned per food-consumption-pane-spec-v2.md */
function FoodConsumptionPane({
  context,
  rawData,
  doseGroups,
}: {
  context: FoodConsumptionContext;
  rawData?: import("@/lib/syndrome-interpretation").FoodConsumptionSummaryResponse;
  doseGroups?: DoseGroup[];
}) {
  const [showRaw, setShowRaw] = useState(false);
  const verdict = getVerdictConfig(context.bwFwAssessment);

  const getDoseLabel = (level: number): string => {
    if (level === 0) return "Control";
    if (!doseGroups?.length) return `Dose ${level}`;
    const dg = doseGroups.find((d) => d.dose_level === level);
    if (!dg?.dose_value || !dg.dose_unit) return `Dose ${level}`;
    return `${dg.dose_value} ${dg.dose_unit}`;
  };

  // ── Key stats: extract highest-dose worst-sex data ──
  const keyStats = useMemo(() => {
    if (!rawData?.periods?.length) return null;
    // Use terminal period (last)
    const termPeriod = rawData.periods[rawData.periods.length - 1];
    if (!termPeriod) return null;
    const entries = termPeriod.by_dose_sex;
    const maxDose = Math.max(...entries.map(e => e.dose_level));
    const highDoseEntries = entries.filter(e => e.dose_level === maxDose);

    // Pick worst-affected sex (by FE pct change magnitude)
    let worstEntry = highDoseEntries[0];
    for (const e of highDoseEntries) {
      const ctrl = e.food_efficiency_control;
      const fePct = ctrl && ctrl > 0 ? ((e.mean_food_efficiency - ctrl) / ctrl) * 100 : null;
      const worstCtrl = worstEntry?.food_efficiency_control;
      const worstFePct = worstCtrl && worstCtrl > 0 ? ((worstEntry.mean_food_efficiency - worstCtrl) / worstCtrl) * 100 : null;
      if (fePct != null && (worstFePct == null || Math.abs(fePct) > Math.abs(worstFePct))) {
        worstEntry = e;
      }
    }
    if (!worstEntry) return null;

    const bwPct = worstEntry.bw_pct_change;
    const fcPct = worstEntry.fw_pct_change;
    const feCtrl = worstEntry.food_efficiency_control;
    const fePct = feCtrl && feCtrl > 0 ? Math.round(((worstEntry.mean_food_efficiency - feCtrl) / feCtrl) * 100) : null;
    const doseLabel = getDoseLabel(maxDose);

    return { bwPct, fcPct, fePct, doseLabel, sex: worstEntry.sex };
  }, [rawData, doseGroups]);

  // ── Onset dose: lowest dose where |fePctChange| >= 20% ──
  const onsetDose = useMemo(() => {
    if (!rawData?.periods?.length) return null;
    const termPeriod = rawData.periods[rawData.periods.length - 1];
    if (!termPeriod) return null;
    const entries = termPeriod.by_dose_sex;
    const doseLevels = [...new Set(entries.filter(e => e.dose_level > 0).map(e => e.dose_level))].sort((a, b) => a - b);
    const maxDose = Math.max(...doseLevels);

    for (const dose of doseLevels) {
      const doseEntries = entries.filter(e => e.dose_level === dose);
      for (const e of doseEntries) {
        const ctrl = e.food_efficiency_control;
        if (ctrl && ctrl > 0) {
          const fePct = ((e.mean_food_efficiency - ctrl) / ctrl) * 100;
          if (Math.abs(fePct) >= 20 && dose < maxDose) {
            return { dose: getDoseLabel(dose), fePct: Math.round(fePct) };
          }
        }
      }
    }
    return null;
  }, [rawData, doseGroups]);

  // ── Period data for FE by dose ──
  const periodData = useMemo(() => {
    if (!rawData?.periods) return [];
    return rawData.periods.map((p) => {
      const entries = p.by_dose_sex;
      const sexes = [...new Set(entries.map((e) => e.sex))].sort();
      const doseLevels = [0, ...new Set(entries.filter((e) => e.dose_level > 0).map((e) => e.dose_level))].sort((a, b) => a - b);
      // Deduplicate: 0 might already be included
      const uniqueDoses = [...new Set(doseLevels)].sort((a, b) => a - b);

      const lookup = new Map(entries.map((e) => [`${e.dose_level}_${e.sex}`, e]));

      const doseRows = uniqueDoses.map((dose) => {
        const sexData = sexes.map((sex) => {
          const e = lookup.get(`${dose}_${sex}`);
          if (!e) return { sex, fe: null, pct: null, reduced: false };
          const ctrl = e.food_efficiency_control;
          const pct = ctrl && ctrl > 0 ? ((e.mean_food_efficiency - ctrl) / ctrl) * 100 : null;
          return { sex, fe: e.mean_food_efficiency, pct: pct != null ? Math.round(pct) : null, reduced: e.food_efficiency_reduced ?? false };
        });
        return { dose, sexData, anyReduced: sexData.some((s) => s.reduced) };
      });

      return {
        label: p.label,
        startDay: p.start_day,
        endDay: p.end_day,
        doseRows,
      };
    });
  }, [rawData]);

  // ── Raw metrics data for toggle ──
  const rawMetrics = useMemo(() => {
    if (!rawData?.periods) return null;
    const periods = rawData.periods;
    const sexes = [...new Set(periods.flatMap(p => p.by_dose_sex.map(e => e.sex)))].sort();
    const doseLevels = [...new Set(periods.flatMap(p => p.by_dose_sex.map(e => e.dose_level)))].sort((a, b) => a - b);

    const buildTable = (getValue: (e: { mean_food_efficiency: number; mean_fw: number; mean_bw_gain: number }) => number) => {
      return {
        periods: periods.map(p => ({
          label: p.label ?? `Days ${p.start_day}\u2013${p.end_day}`,
          rows: doseLevels.map(dose => ({
            dose,
            values: sexes.map(sex => {
              const e = p.by_dose_sex.find(e => e.dose_level === dose && e.sex === sex);
              return e ? getValue(e) : null;
            }),
          })),
        })),
        sexes,
      };
    };

    return {
      fe: buildTable(e => e.mean_food_efficiency),
      fc: buildTable(e => e.mean_fw),
      bw: buildTable(e => e.mean_bw_gain),
    };
  }, [rawData]);

  return (
    <div>
      {/* ── Verdict block (§5.2) ── */}
      {verdict.borderClass ? (
        <div
          className={verdict.borderClass}
          style={verdict.borderColor ? { borderLeftColor: verdict.borderColor } : undefined}
          role="status"
          aria-label={`${verdict.label}: ${verdict.description}`}
        >
          <div className={verdict.labelClass}>{verdict.label}</div>
          {verdict.description && (
            <div className="text-[10px] text-muted-foreground">{verdict.description}</div>
          )}
        </div>
      ) : (
        <div role="status" aria-label={verdict.label}>
          <div className={verdict.labelClass}>
            {context.bwFwAssessment === "not_applicable" ? verdict.label : verdict.label}
          </div>
          {verdict.description && (
            <div className="text-[10px] text-muted-foreground">{verdict.description}</div>
          )}
        </div>
      )}

      {/* ── Key stats block (§5.3) ── */}
      {keyStats && (
        <div className="mt-2">
          <div className="flex gap-x-4">
            {keyStats.bwPct != null && (
              <div className="flex flex-col" aria-label={`Body weight: ${keyStats.bwPct > 0 ? "increased" : "decreased"} ${Math.abs(Math.round(keyStats.bwPct))} percent`}>
                <span className="text-sm font-semibold font-mono">
                  {keyStats.bwPct > 0 ? "\u2191" : "\u2193"}{Math.abs(Math.round(keyStats.bwPct))}%
                </span>
                <span className="text-[9px] text-muted-foreground">body weight</span>
              </div>
            )}
            {keyStats.fcPct != null && (
              <div className="flex flex-col" aria-label={`Food consumption: ${keyStats.fcPct > 0 ? "increased" : "decreased"} ${Math.abs(Math.round(keyStats.fcPct))} percent`}>
                <span className="text-sm font-semibold font-mono">
                  {keyStats.fcPct > 0 ? "\u2191" : "\u2193"}{Math.abs(Math.round(keyStats.fcPct))}%
                </span>
                <span className="text-[9px] text-muted-foreground">food consump</span>
              </div>
            )}
            {keyStats.fePct != null && (
              <div className="flex flex-col" aria-label={`Food efficiency: ${keyStats.fePct > 0 ? "increased" : "decreased"} ${Math.abs(keyStats.fePct)} percent`}>
                <span className="text-sm font-semibold font-mono">
                  {keyStats.fePct > 0 ? "\u2191" : "\u2193"}{Math.abs(keyStats.fePct)}%
                </span>
                <span className="text-[9px] text-muted-foreground">food efficiency</span>
              </div>
            )}
          </div>
          <div className="mt-0.5 text-[9px] text-muted-foreground">
            at {keyStats.doseLabel}{keyStats.sex ? ` (${keyStats.sex === "M" ? "males" : keyStats.sex === "F" ? "females" : "worst affected sex"})` : ""}
          </div>
          {/* Onset line (§5.4) / edge case (§7): increased FC with weight loss */}
          {keyStats.fcPct != null && keyStats.fcPct > 0 && keyStats.bwPct != null && keyStats.bwPct < 0 ? (
            <div className="mt-0.5 text-[10px] font-medium text-foreground">
              Weight loss despite increased intake
            </div>
          ) : onsetDose ? (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              Onset: {onsetDose.dose} (FE {onsetDose.fePct > 0 ? "+" : ""}{onsetDose.fePct}%)
            </div>
          ) : null}
        </div>
      )}

      {/* ── Recovery block (§5.5) ── */}
      {context.bwFwAssessment !== "not_applicable" && rawData?.recovery && (
        <div className="mt-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Recovery</div>
          {rawData.recovery.available ? (
            <div className="mt-1 space-y-0.5">
              {/* FC recovery */}
              <RecoveryParameterRow
                label="FC"
                recovered={rawData.recovery.fw_recovered}
                residualPct={(() => {
                  if (rawData.recovery.fw_recovered || !rawData.periods?.length) return null;
                  const recPeriod = rawData.periods.find(p => p.label?.toLowerCase().includes("recov"));
                  if (!recPeriod) return null;
                  const e = recPeriod.by_dose_sex;
                  const maxDose = Math.max(...e.map(x => x.dose_level));
                  const entry = e.find(x => x.dose_level === maxDose);
                  return entry?.fw_pct_change != null ? Math.round(entry.fw_pct_change) : null;
                })()}
              />
              {/* BW recovery */}
              <RecoveryParameterRow
                label="BW"
                recovered={rawData.recovery.bw_recovered}
                residualPct={(() => {
                  if (rawData.recovery.bw_recovered || !rawData.periods?.length) return null;
                  const recPeriod = rawData.periods.find(p => p.label?.toLowerCase().includes("recov"));
                  if (!recPeriod) return null;
                  const e = recPeriod.by_dose_sex;
                  const maxDose = Math.max(...e.map(x => x.dose_level));
                  const entry = e.find(x => x.dose_level === maxDose);
                  return entry?.bw_pct_change != null ? Math.round(entry.bw_pct_change) : null;
                })()}
              />
              {/* FE recovery — derive from period data */}
              {rawData.periods && rawData.periods.length > 0 && (() => {
                const recPeriod = rawData.periods.find(p => p.label?.toLowerCase().includes("recov"));
                if (!recPeriod) return null;
                const entries = recPeriod.by_dose_sex;
                const maxDose = Math.max(...entries.map(e => e.dose_level));
                const highDoseEntries = entries.filter(e => e.dose_level === maxDose);
                const anyFeReduced = highDoseEntries.some(e => e.food_efficiency_reduced);
                // Compute residual FE pct
                let residualFePct: number | null = null;
                if (anyFeReduced) {
                  const worst = highDoseEntries[0];
                  const ctrl = worst?.food_efficiency_control;
                  if (worst && ctrl && ctrl > 0) {
                    residualFePct = Math.round(((worst.mean_food_efficiency - ctrl) / ctrl) * 100);
                  }
                }
                return (
                  <RecoveryParameterRow
                    label="FE"
                    recovered={!anyFeReduced}
                    residualPct={residualFePct}
                  />
                );
              })()}
            </div>
          ) : (
            <p className="mt-1 text-[10px] text-muted-foreground italic">Recovery: no recovery arm in this study</p>
          )}
        </div>
      )}

      {/* ── FE dose-response by period (§5.6) ── */}
      {periodData.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            Food efficiency by dose
          </div>
          <div className="mt-1.5 space-y-2.5">
            {periodData.map((period, pi) => (
              <div key={pi} className="border-l-2 border-muted-foreground/25 pl-2">
                <div className="text-[10px] font-medium text-muted-foreground mb-1">
                  {period.label ?? `Days ${period.startDay}\u2013${period.endDay}`}
                </div>
                <div className="space-y-0.5">
                  {period.doseRows.map(({ dose, sexData, anyReduced }) => (
                    <div key={dose} className={`flex items-baseline gap-1.5 text-[10px] leading-snug ${anyReduced ? "font-medium text-foreground" : "text-muted-foreground/60"}`}>
                      <span
                        className="shrink-0 font-mono w-16"
                        style={{ color: getDoseGroupColor(dose) }}
                      >
                        {getDoseLabel(dose)}
                      </span>
                      {sexData.map((s) => (
                        <span key={s.sex} className="shrink-0">
                          {s.sex} {s.fe != null ? s.fe.toFixed(2) : "\u2014"}
                          {s.pct != null && ` (${s.pct > 0 ? "+" : ""}${s.pct}%)`}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Raw metrics toggle (§5.7) ── */}
      <div className="mt-2">
        <button
          className="text-[10px] text-primary cursor-pointer hover:underline"
          onClick={() => setShowRaw(!showRaw)}
          aria-expanded={showRaw}
        >
          {showRaw ? "Hide raw metrics \u25be" : "Show raw metrics \u25b8"}
        </button>
        {showRaw && rawMetrics && (
          <div className="mt-1.5 space-y-3">
            <RawMetricsTable title="Food efficiency" data={rawMetrics.fe} getDoseLabel={getDoseLabel} />
            <RawMetricsTable title="Food consumption" data={rawMetrics.fc} getDoseLabel={getDoseLabel} />
            <RawMetricsTable title="Body weight gain" data={rawMetrics.bw} getDoseLabel={getDoseLabel} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact raw metrics table */
function RawMetricsTable({ title, data, getDoseLabel }: {
  title: string;
  data: {
    periods: Array<{
      label: string;
      rows: Array<{ dose: number; values: (number | null)[] }>;
    }>;
    sexes: string[];
  };
  getDoseLabel: (level: number) => string;
}) {
  if (data.periods.length === 0) return null;
  return (
    <div>
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</div>
      <table className="mt-0.5 w-full text-left">
        <thead>
          <tr>
            <th className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Dose</th>
            {data.periods.map(p => (
              data.sexes.map(sex => (
                <th key={`${p.label}-${sex}`} className="px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {p.label} {sex}
                </th>
              ))
            ))}
          </tr>
        </thead>
        <tbody>
          {data.periods[0].rows.map((row, ri) => (
            <tr key={ri}>
              <td className="px-2 py-0.5 font-mono text-[10px]">{row.dose === 0 ? "Ctrl" : getDoseLabel(row.dose)}</td>
              {data.periods.map((p, pi) => (
                data.sexes.map((_sex, si) => (
                  <td key={`${pi}-${si}`} className="px-2 py-0.5 font-mono text-[10px] tabular-nums">
                    {p.rows[ri]?.values[si]?.toFixed(2) ?? "\u2014"}
                  </td>
                ))
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Translational Confidence Pane ────────────────────────

function TranslationalConfidencePane({ confidence }: { confidence: TranslationalConfidence }) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-foreground">
        {confidence.tier.charAt(0).toUpperCase() + confidence.tier.slice(1)}
      </div>
      <p className="text-[11px] text-foreground leading-relaxed">{confidence.summary}</p>

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

      {confidence.absenceCaveat && (
        <p className="text-[10px] text-muted-foreground leading-relaxed italic">
          {confidence.absenceCaveat}
        </p>
      )}

      <p className="text-[9px] text-muted-foreground/60">Data: {confidence.dataVersion}</p>
    </div>
  );
}
