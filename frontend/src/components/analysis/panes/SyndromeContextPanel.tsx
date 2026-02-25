/**
 * SyndromeContextPanel — group-level context panel shown when a syndrome
 * card header is clicked in Syndrome grouping mode.
 *
 * Restructured per syndrome-context-panel-restructure-spec-v2.md:
 * 15 panes → 8 sections: Answer → Evidence → Context → Reference.
 */

import { Fragment, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
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
import type { EndpointSummary } from "@/lib/derive-summaries";
import { getSyndromeTermReport, getSyndromeDefinition } from "@/lib/cross-domain-syndromes";
import type { TermReportEntry, CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import { findClinicalMatchForEndpoint, getClinicalTierTextClass } from "@/lib/lab-clinical-catalog";
import type { LabClinicalMatch } from "@/lib/lab-clinical-catalog";
import { interpretSyndrome, mapDeathRecordsToDispositions } from "@/lib/syndrome-interpretation";
import type { SyndromeInterpretation, DiscriminatingFinding, HistopathCrossRef, MortalityContext, TumorFinding, FoodConsumptionContext, OverallSeverity, RecoveryRow, TranslationalConfidence, UpgradeEvidenceResult } from "@/lib/syndrome-interpretation-types";
import { useLesionSeveritySummary } from "@/hooks/useLesionSeveritySummary";
import { useStudyMortality } from "@/hooks/useStudyMortality";
import type { StudyMortality } from "@/types/mortality";
import { useTumorSummary } from "@/hooks/useTumorSummary";
import { useCrossAnimalFlags } from "@/hooks/useCrossAnimalFlags";
import { useFoodConsumptionSummary } from "@/hooks/useFoodConsumptionSummary";
import { useScheduledOnly } from "@/contexts/ScheduledOnlyContext";
import { useClinicalObservations } from "@/hooks/useClinicalObservations";
import { useRecoveryComparison } from "@/hooks/useRecoveryComparison";
import { useStudyContext } from "@/hooks/useStudyContext";
import type { FindingsFilters, UnifiedFinding, DoseGroup } from "@/types/analysis";
import { computeOrganProportionality, checkSexDivergence } from "@/lib/organ-proportionality";
import { useOrganWeightNormalization } from "@/hooks/useOrganWeightNormalization";
import { useStatMethods } from "@/hooks/useStatMethods";
import type { OrganProportionalityResult, OrganOpiRow, OpiClassification } from "@/lib/organ-proportionality";

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
    description: "Target organ wasting indicates generalized toxicity with decreased body weight and food consumption. Organ weight decreases are evaluated for proportionality to body weight loss: proportionate decreases are secondary (expected consequence of general wasting), while disproportionate decreases suggest direct target organ toxicity. The Organ Proportionality Index (OPI) quantifies this relationship. Organs with OPI > 1.3 warrant independent toxicologic evaluation.",
    regulatory: "Confounds interpretation of organ weight changes \u2014 organ weights should be evaluated both as absolute and as ratio-to-body-weight. Body weight decrease >10% typically requires noting as a confounder in all organ weight assessments. Proportionate organ weight decreases do not independently affect NOAEL. Disproportionate decreases may independently contribute to adverse classification and NOAEL capping.",
    discriminator: "Proportionality analysis is the key discriminator. Organ weight decreases proportionate to body weight (OPI 0.7\u20131.3) are likely secondary. Disproportionate decreases (OPI > 1.3) or MI-confirmed atrophy/degeneration indicate direct organ effects. Organs showing inverse changes (weight increase despite BW decrease) suggest active pathological processes requiring separate evaluation.",
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

  // Use shared derivation — single source of truth (includes all fields)
  const allEndpoints = analytics.endpoints;

  // Normalization engine — for OM term annotations and B-7 BW confounding
  const { effectSize } = useStatMethods(studyId);
  const normalization = useOrganWeightNormalization(studyId, true, effectSize);

  // Evidence Summary: term report
  const syndromeSexes = detected?.sexes;
  const normContexts = normalization.state?.contexts;
  const termReport = useMemo(
    () => getSyndromeTermReport(syndromeId, allEndpoints, syndromeSexes, normContexts),
    [syndromeId, allEndpoints, syndromeSexes, normContexts],
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

  // Exclusion state for reactive confounder checks
  const { excludedSubjects } = useScheduledOnly();

  // Tumor data for interpretation layer
  const { data: tumorSummary } = useTumorSummary(studyId);
  const { data: crossAnimalFlags } = useCrossAnimalFlags(studyId);
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

  // Convert OM findings to OrganWeightRow[] for interpretSyndrome
  const organWeightRows = useMemo(() => {
    if (!rawData?.findings?.length) return [];
    return rawData.findings
      .filter((f) => f.domain === "OM")
      .flatMap((f) =>
        f.group_stats
          .filter((g) => g.mean != null)
          .map((g) => ({
            specimen: f.specimen ?? f.finding,
            dose_level: g.dose_level,
            sex: f.sex,
            mean: g.mean!,
            p_value: f.pairwise?.find((p) => p.dose_level === g.dose_level)?.p_value ?? null,
          })),
      );
  }, [rawData]);

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
      organWeightRows,
      tumorFindings,
      mortalityDispositions,
      foodConsumptionSummary ?? { available: false, water_consumption: null },
      clinicalObservations,
      studyContext,
      mortalityRaw?.mortality_noael_cap,
      analytics.syndromes.map((s) => s.id),
      normContexts,
    );
  }, [detected, allEndpoints, histopathData, studyContext, mortalityRaw, tumorFindings, foodConsumptionSummary, clinicalObservations, recoveryData, organWeightRows, analytics.syndromes, normContexts]);

  // Organ Proportionality Index (XS09 only) — computed after syndromeInterp for FC driver
  const fcDriver = useMemo(() => {
    if (!syndromeInterp?.foodConsumptionContext?.available) return null;
    const a = syndromeInterp.foodConsumptionContext.bwFwAssessment;
    if (a === "secondary_to_food") return "secondary to FC";
    if (a === "primary_weight_loss") return "primary weight loss (not FC-driven)";
    if (a === "malabsorption") return "indeterminate FC relationship";
    return null;
  }, [syndromeInterp]);

  const xs09Active = syndromeId === "XS09" || analytics.syndromes.some((s) => s.id === "XS09");
  const organProportionality = useMemo<OrganProportionalityResult | null>(() => {
    if (!xs09Active || !rawData?.findings?.length) return null;
    return computeOrganProportionality(rawData.findings, recoveryData, fcDriver);
  }, [xs09Active, rawData, recoveryData, fcDriver]);
  const showOrganProportionality = xs09Active && organProportionality?.available === true;

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

  // ── Organ-matched specimens for tumor cross-reference (§8B) ──
  const matchedSpecimens = useMemo(() => {
    if (!detected) return new Set<string>();
    const specs = new Set<string>();
    for (const ep of detected.matchedEndpoints) {
      if (ep.domain !== "MI" && ep.domain !== "MA" && ep.domain !== "OM") continue;
      const summary = allEndpoints.find(
        (s) => s.endpoint_label === ep.endpoint_label && s.domain === ep.domain,
      );
      if (summary?.specimen) specs.add(summary.specimen.toUpperCase());
    }
    return specs;
  }, [detected, allEndpoints]);

  // ── Reactive confounder check: tumor-bearing animals in group stats (§8D) ──
  const tumorConfounders = useMemo(() => {
    if (!syndromeId || syndromeId === "XS01") return [];
    const tdr = crossAnimalFlags?.tumor_linkage?.tumor_dose_response;
    if (!tdr?.length) return [];

    const confounders: {
      specimen: string;
      finding: string;
      includedCount: number;
      doseLabel: string;
    }[] = [];

    for (const t of tdr) {
      if (t.behavior !== "MALIGNANT") continue;
      const includedIds = t.animal_ids.filter((id) => !excludedSubjects.has(id));
      if (includedIds.length === 0) continue;
      const highestAffected = [...t.incidence_by_dose]
        .reverse()
        .find((d) => d.males.affected + d.females.affected > 0);
      confounders.push({
        specimen: t.specimen,
        finding: t.finding.toLowerCase(),
        includedCount: includedIds.length,
        doseLabel: highestAffected?.dose_label ?? "unknown",
      });
    }
    return confounders;
  }, [syndromeId, crossAnimalFlags, excludedSubjects]);

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
            {/* Line 4: Organ proportionality narrative (XS09 only) */}
            {xs09Active && organProportionality?.narrative && (
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {organProportionality.narrative}
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
            organProportionality={organProportionality}
          />
        </CollapsiblePane>
      )}

      {/* ══ HISTOPATHOLOGY (conditional) ══ */}
      {syndromeInterp && hasHistopath && (
        <CollapsiblePane title="Histopathology" defaultOpen expandAll={expandGen} collapseAll={collapseGen}>
          <HistopathContextPane crossRefs={syndromeInterp.histopathContext} organProportionality={organProportionality} />
          {/* §8C: XS01 organ-matched tumor progression cross-reference */}
          {syndromeId === "XS01" && matchedSpecimens.size > 0 &&
            crossAnimalFlags?.tumor_linkage?.tumor_dose_response
              ?.filter((t) =>
                t.behavior === "MALIGNANT" &&
                t.flags.length > 0 &&
                matchedSpecimens.has(t.specimen.toUpperCase()),
              )
              .map((t) => {
                const maxDose = t.incidence_by_dose.reduce((best, d) =>
                  (d.males.affected + d.females.affected) > (best.males.affected + best.females.affected) ? d : best,
                );
                const affected = maxDose.males.affected + maxDose.females.affected;
                const bothSexes = maxDose.males.affected > 0 && maxDose.females.affected > 0;
                return (
                  <div key={`${t.specimen}-${t.finding}`} className="mt-2 border-l-2 border-amber-400 bg-amber-50/50 px-2 py-1.5 text-[10px]">
                    <AlertTriangle className="inline h-3 w-3 shrink-0 align-text-bottom" style={{ color: "#D97706" }} /> {t.finding.toLowerCase()} at {maxDose.dose_label} ({affected} animal{affected !== 1 ? "s" : ""}{bothSexes ? ", both sexes" : ""})
                    <span className="ml-1 text-muted-foreground">— consistent with progression from hepatocellular injury to neoplasia</span>
                  </div>
                );
              })
          }
          {/* §8D: Reactive confounder check — tumor-bearing animals in group stats */}
          {tumorConfounders.length > 0 && tumorConfounders.map((c) => (
            <div key={`confounder-${c.specimen}-${c.finding}`} className="mt-2 border-l-2 border-amber-400 bg-amber-50/50 px-2 py-1.5 text-[10px]">
              <div><AlertTriangle className="inline h-3 w-3 shrink-0 align-text-bottom" style={{ color: "#D97706" }} /> {c.includedCount} animal{c.includedCount !== 1 ? "s" : ""} with {c.finding} included in group stats</div>
              <div className="text-muted-foreground ml-3">Group means at {c.doseLabel} may reflect tumor burden</div>
            </div>
          ))}
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

      {/* ══ ORGAN PROPORTIONALITY (XS09 only) ══ */}
      {syndromeInterp && showOrganProportionality && organProportionality && (
        <CollapsiblePane
          title="Organ proportionality"
          defaultOpen={true}
          headerRight={<OrganProportionalityHeaderRight result={organProportionality} />}
          expandAll={expandGen}
          collapseAll={collapseGen}
        >
          <OrganProportionalityPane result={organProportionality} doseGroups={rawData?.dose_groups} />
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
          <MortalityContextPane mortality={syndromeInterp.mortalityContext} mortalityRaw={mortalityRaw} />
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
             onClick={(e) => { e.preventDefault(); if (studyId) navigate(`/studies/${encodeURIComponent(studyId)}/noael-determination`); }}>
            View NOAEL determination &#x2192;
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
      <div>
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
        {entry.magnitudeFloorNote && entry.domain === "OM" && (
          <div className="ml-2 mt-0.5 text-[9px] text-amber-700">
            {entry.magnitudeFloorNote}
          </div>
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
          <span className="ml-1 text-muted-foreground/60"> {"\u2192"} {diffText}</span>
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
  organProportionality,
}: {
  syndromeInterp: SyndromeInterpretation;
  domainsCovered: string[];
  allEndpoints: EndpointSummary[];
  organProportionality: OrganProportionalityResult | null;
}) {
  const [factorsOpen, setFactorsOpen] = useState(false);

  const tr = syndromeInterp.treatmentRelatedness;
  const adv = syndromeInterp.adversity;
  const recovery = syndromeInterp.recovery;

  // Dose-response strength (A-1 factor)
  const drTooltip = tr.doseResponse === "strong"
    ? "At least one matched endpoint has a strong dose-response pattern (linear, monotonic, or threshold) with p < 0.1, or pairwise p < 0.01 with |d| ≥ 0.8"
    : tr.doseResponse === "weak"
      ? "At least one matched endpoint has a non-flat pattern, but none meet the strength criteria for strong"
      : "No dose-response pattern detected in matched endpoints";

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
          <span className="font-mono font-medium text-foreground underline decoration-dotted decoration-muted-foreground/40 underline-offset-2" title={drTooltip}>{tr.doseResponse}</span>
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

        {/* Organ weight recovery rows (XS09) */}
        {organProportionality?.available && (() => {
          const organRecRows = organProportionality.organs.filter(
            (r) => r.recoveryStatus != null,
          );
          if (organRecRows.length === 0) return null;

          // Check if BW recovered
          const bwRecEndpoint = recovery.endpoints.find(
            (ep) => ep.label.toLowerCase().includes("body weight") || ep.label.toLowerCase().includes("bw"),
          );
          const bwRecovered = bwRecEndpoint?.status === "recovered";

          return (
            <div className="mt-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Organ weight recovery</div>
              <div className="mt-1 space-y-0.5">
                {organRecRows.map((r, i) => {
                  const isRec = r.recoveryStatus === "recovered";
                  const isPart = r.recoveryStatus === "partial";
                  const borderClass = isRec
                    ? "border-l-2 border-l-emerald-400/40 pl-2"
                    : isPart
                      ? "border-l-2 border-l-amber-300/40 pl-2"
                      : "border-l-2 border-l-amber-400/60 pl-2";
                  const textClass = isRec
                    ? "text-[10px] text-muted-foreground"
                    : isPart
                      ? "text-[10px] text-foreground/80"
                      : "text-[10px] font-medium text-foreground";
                  const persistent = !isRec && bwRecovered;

                  return (
                    <div key={i} className={`${borderClass} ${textClass}`}>
                      <span>{r.organ} weight ({r.sex})</span>
                      {r.recoveryResolutionPct != null && (
                        <span className="ml-1.5 font-mono text-muted-foreground">
                          {Math.round(r.recoveryResolutionPct)}% resolved
                        </span>
                      )}
                      <span className="ml-1.5">{r.recoveryStatus!.replace(/_/g, " ")}</span>
                      {persistent && (
                        <span className="ml-1.5 text-foreground"> — persistent despite BW improvement</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
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
            {/* Adversity — B-2 and B-6 still unimplemented */}
            <div>
              <div className="mb-1 text-xs font-medium text-foreground">Adverse: {advLabel}</div>
              <div className="space-y-0.5 pl-2">
                <EcetocFactorRow label="B-1 Adaptive response" value={adv.adaptive ? "yes" : "no"} />
                <EcetocFactorRow label="B-3 Reversible" value={adv.reversible === true ? "yes" : adv.reversible === false ? "no" : "unknown"} />
                <EcetocFactorRow label="B-4 Magnitude" value={adv.magnitudeLevel} />
                <EcetocFactorRow label="B-5 Cross-domain" value={adv.crossDomainSupport ? "yes" : "no"} />
                <EcetocFactorRow
                  label="B-7 Secondary to BW"
                  value={adv.secondaryToBW
                    ? `yes (g=${adv.secondaryToBW.bwG.toFixed(2)}, ${adv.secondaryToBW.confidence})`
                    : adv.secondaryToOther ? "secondary to food" : "no"}
                />
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
function HistopathContextPane({
  crossRefs,
  organProportionality,
}: {
  crossRefs: HistopathCrossRef[];
  organProportionality: OrganProportionalityResult | null;
}) {
  return (
    <div className="space-y-3">
      {crossRefs.map((ref) => {
        // Find OPI rows for this specimen
        const opiRows = organProportionality?.available
          ? organProportionality.organs.filter(
              (r) => r.organ.toLowerCase().trim() === ref.specimen.toLowerCase().trim(),
            )
          : [];

        return (
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
                {/* OPI concordance line */}
                {opiRows.length > 0 && (
                  <div className="mt-0.5 text-[10px] text-muted-foreground">
                    Concordance: {opiRows[0].concordance.replace(/_/g, " ").replace(/^(\w+) /, "$1 \u2014 ")}
                    {opiRows.length === 1
                      ? ` (${opiRows[0].sex} OPI ${opiRows[0].opi?.toFixed(2) ?? "n/a"})`
                      : ` (${opiRows.map((r) => `${r.sex} OPI ${r.opi?.toFixed(2) ?? "n/a"}`).join(", ")})`}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
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
function MortalityContextPane({ mortality, mortalityRaw }: { mortality: MortalityContext; mortalityRaw?: StudyMortality }) {
  // Derive NOAEL cap label: dose level below mortality LOAEL
  const noaelCapLabel = (() => {
    if (mortality.mortalityNoaelCap == null || !mortalityRaw?.mortality_loael) return null;
    const capLevel = mortalityRaw.mortality_loael - 1;
    const capDose = mortalityRaw.by_dose.find(d => d.dose_level === capLevel);
    const mortalityDose = mortalityRaw.by_dose.find(d => d.dose_level === mortalityRaw.mortality_loael);
    const unit = mortalityRaw.mortality_loael_label?.match(/\d[\d.]*\s*(mg\/kg|mg|µg\/kg|µg|g\/kg|g)/)?.[1] ?? "";
    const capStr = capDose?.dose_value != null && unit ? `${capDose.dose_value} ${unit}` : null;
    const mortStr = mortalityDose?.dose_value != null && unit ? `${mortalityDose.dose_value} ${unit}` : null;
    if (capStr && mortStr) return `NOAEL \u2264 ${capStr} (mortality at ${mortStr})`;
    if (mortStr) return `NOAEL capped below ${mortStr}`;
    return `NOAEL capped at dose level ${mortality.mortalityNoaelCap}`;
  })();

  return (
    <div>
      {mortality.mortalityNoaelCap != null && (
        <div className="mb-2 text-[10px] font-medium text-foreground">
          {noaelCapLabel ?? `NOAEL cap: dose level ${mortality.mortalityNoaelCap}`}
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

  // ── Key stats: extract highest-dose per-sex data ──
  const keyStats = useMemo(() => {
    if (!rawData?.periods?.length) return null;
    const termPeriod = rawData.periods[rawData.periods.length - 1];
    if (!termPeriod) return null;
    const entries = termPeriod.by_dose_sex;
    const sexes = [...new Set(entries.map(e => e.sex))].sort();

    const bySex = sexes.map(sex => {
      const sexEntries = entries.filter(e => e.sex === sex);
      const maxDose = Math.max(...sexEntries.map(e => e.dose_level));
      const e = sexEntries.find(x => x.dose_level === maxDose);
      if (!e) return null;
      const feCtrl = e.food_efficiency_control;
      const fePct = feCtrl && feCtrl > 0 ? Math.round(((e.mean_food_efficiency - feCtrl) / feCtrl) * 100) : null;
      return {
        sex: sex as string,
        bwPct: e.bw_pct_change as number | null,
        fcPct: e.fw_pct_change as number | null,
        fePct,
        doseLabel: getDoseLabel(maxDose),
      };
    }).filter((s): s is NonNullable<typeof s> => s != null);

    if (!bySex.length) return null;
    // Derive per-sex recovery from recovery period data, fall back to study-level
    const recPeriod = rawData.periods.find(p => p.label?.toLowerCase().includes("recov"));
    let recoverySex: Array<{ sex: string; bwRecovered: boolean | null; fcRecovered: boolean | null }> | null = null;

    if (recPeriod) {
      recoverySex = sexes.map(sex => {
        const sexEntries = recPeriod.by_dose_sex.filter(e => e.sex === sex);
        const sexMaxDose = Math.max(...sexEntries.map(e => e.dose_level));
        const e = sexEntries.find(x => x.dose_level === sexMaxDose);
        if (!e) return null;
        const bwRecovered = e.bw_pct_change != null ? Math.abs(e.bw_pct_change) < 5 : null;
        const fcRecovered = e.fw_pct_change != null ? Math.abs(e.fw_pct_change) < 5 : null;
        return { sex, bwRecovered, fcRecovered };
      }).filter((s): s is NonNullable<typeof s> => s != null);
    } else if (rawData.recovery?.available) {
      // Study-level fallback — same values for all sexes
      recoverySex = sexes.map(sex => ({
        sex,
        bwRecovered: rawData.recovery?.bw_recovered ?? null,
        fcRecovered: rawData.recovery?.fw_recovered ?? null,
      }));
    }

    return { bySex, recoverySex };
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
      {/* ── Verdict description only ── */}
      {verdict.description && (
        <div className="text-[10px] text-muted-foreground">{verdict.description}</div>
      )}

      {/* ── Key stats — per-sex, aligned inline (§5.3) ── */}
      {keyStats && (
        <div className="mt-1.5 space-y-0.5">
          {keyStats.bySex.map(s => {
            const hasEdgeCase = s.fcPct != null && s.fcPct > 0 && s.bwPct != null && s.bwPct < 0;
            const rec = keyStats.recoverySex?.find(r => r.sex === s.sex);
            const fmtPct = (v: number | null, threshold: number) => {
              if (v == null) return null;
              const text = `${v > 0 ? "+" : ""}${Math.round(v)}%`;
              return <span className={Math.abs(v) >= threshold ? "font-medium text-foreground" : "text-muted-foreground"}>{text}</span>;
            };
            return (
              <div key={s.sex} className="text-[10px]">
                <span className="inline-block font-medium text-foreground" style={{ width: 46 }}>{s.sex === "M" ? "Males" : "Females"}</span>
                {s.bwPct != null && (
                  <span className="inline-block" style={{ width: 52 }}>
                    <span className="text-muted-foreground">BW </span>
                    <span className="tabular-nums font-mono">{fmtPct(s.bwPct, 10)}</span>
                  </span>
                )}
                {s.fcPct != null && (
                  <span className="inline-block" style={{ width: 52 }} title="Food consumption">
                    <span className="text-muted-foreground">FC </span>
                    <span className="tabular-nums font-mono">{fmtPct(s.fcPct, 10)}</span>
                  </span>
                )}
                {s.fePct != null && (
                  <span className="inline-block" style={{ width: 52 }} title="Food efficiency">
                    <span className="text-muted-foreground">FE </span>
                    <span className="tabular-nums font-mono">{fmtPct(s.fePct, 20)}</span>
                  </span>
                )}
                <span className="inline-block" style={{ width: 80 }}>
                  <span className="text-muted-foreground">at {s.doseLabel}</span>
                </span>
                {rec && (
                  <span className="inline-block">
                    <span className="text-muted-foreground">Recovery: </span>
                    {rec.bwRecovered != null && (
                      <span className="inline-block" style={{ width: 36 }}>
                        <span className="text-muted-foreground">BW </span>
                        <span className={rec.bwRecovered ? "text-muted-foreground" : "font-medium text-foreground"}>
                          {rec.bwRecovered ? "yes" : "no"}
                        </span>
                      </span>
                    )}
                    {rec.fcRecovered != null && (
                      <span className="inline-block" style={{ width: 36 }}>
                        <span className="text-muted-foreground">FC </span>
                        <span className={rec.fcRecovered ? "text-muted-foreground" : "font-medium text-foreground"}>
                          {rec.fcRecovered ? "yes" : "no"}
                        </span>
                      </span>
                    )}
                  </span>
                )}
                {hasEdgeCase && (
                  <span className="font-medium text-foreground ml-1.5">— weight loss despite increased intake</span>
                )}
              </div>
            );
          })}
          {!keyStats.recoverySex && rawData?.recovery && !rawData.recovery.available && (
            <div className="text-[10px] text-muted-foreground italic">Recovery: no recovery arm</div>
          )}
        </div>
      )}

      {/* ── FE dose-response by period (§5.6) — table layout ── */}
      {periodData.length > 0 && (
        <div className="mt-2.5">
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr className="text-[9px] text-muted-foreground">
                <th
                  className="text-left font-semibold uppercase tracking-wider pr-2 pb-0.5"
                  title="Food efficiency = body weight gain / food consumed per period. Values shown as mean FE with % change vs control."
                >
                  FE by dose
                </th>
                {periodData.map((period, pi) => (
                  <th key={pi} colSpan={4} className="text-right font-medium pb-0.5 pl-1 pr-0.5">
                    {period.label ?? `Days ${period.startDay}\u2013${period.endDay}`}
                  </th>
                ))}
              </tr>
              <tr className="text-[9px] text-muted-foreground/60 border-b border-muted-foreground/15">
                <th className="pb-0.5" />
                {periodData.map((_p, pi) => (
                  <Fragment key={pi}>
                    <th colSpan={2} className="text-right font-normal pb-0.5 pl-1 pr-0.5">M</th>
                    <th colSpan={2} className="text-right font-normal pb-0.5 pl-1 pr-0.5">F</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {(periodData[0]?.doseRows ?? []).map(({ dose }) => {
                const rowReduced = periodData.some(p =>
                  p.doseRows.find(r => r.dose === dose)?.anyReduced
                );
                return (
                  <tr
                    key={dose}
                    className={rowReduced ? "font-medium text-foreground" : "text-muted-foreground/60"}
                  >
                    <td className="py-0.5 pr-2">
                      <span
                        className="border-l-2 pl-1.5 font-mono whitespace-nowrap"
                        style={{ borderLeftColor: getDoseGroupColor(dose) }}
                      >
                        {getDoseLabel(dose)}
                      </span>
                    </td>
                    {periodData.map((period, pi) => {
                      const row = period.doseRows.find(r => r.dose === dose);
                      const mData = row?.sexData.find(s => s.sex === "M");
                      const fData = row?.sexData.find(s => s.sex === "F");
                      return (
                        <Fragment key={pi}>
                          <td className="text-right pl-1 py-0.5 font-mono tabular-nums">
                            {mData?.fe != null ? mData.fe.toFixed(2) : "\u2014"}
                          </td>
                          <td className="text-right pr-1 py-0.5 font-mono tabular-nums">
                            {mData?.pct != null ? <span className={rowReduced ? "" : "text-muted-foreground/60"}>({mData.pct > 0 ? "+" : ""}{mData.pct}%)</span> : ""}
                          </td>
                          <td className="text-right pl-1 py-0.5 font-mono tabular-nums">
                            {fData?.fe != null ? fData.fe.toFixed(2) : "\u2014"}
                          </td>
                          <td className="text-right pr-1 py-0.5 font-mono tabular-nums">
                            {fData?.pct != null ? <span className={rowReduced ? "" : "text-muted-foreground/60"}>({fData.pct > 0 ? "+" : ""}{fData.pct}%)</span> : ""}
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
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
            <RawMetricsTable title="FE" data={rawMetrics.fe} getDoseLabel={getDoseLabel} />
            <RawMetricsTable title="FC" data={rawMetrics.fc} getDoseLabel={getDoseLabel} />
            <RawMetricsTable title="BW gain" data={rawMetrics.bw} getDoseLabel={getDoseLabel} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact raw metrics table — same layout as FE by dose */
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
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="text-[9px] text-muted-foreground">
            <th className="text-left font-semibold uppercase tracking-wider pr-2 pb-0.5">{title}</th>
            {data.periods.map((p, pi) => (
              <th key={pi} colSpan={data.sexes.length} className="text-right font-medium pb-0.5 pl-1 pr-0.5">
                {p.label}
              </th>
            ))}
          </tr>
          <tr className="text-[9px] text-muted-foreground/60 border-b border-muted-foreground/15">
            <th className="pb-0.5" />
            {data.periods.map((_p, pi) => (
              <Fragment key={pi}>
                {data.sexes.map(sex => (
                  <th key={sex} className="text-right font-normal pb-0.5 pl-1 pr-0.5">{sex}</th>
                ))}
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.periods[0].rows.map((row, ri) => (
            <tr key={ri} className="text-muted-foreground/60">
              <td className="py-0.5 pr-2">
                <span
                  className="border-l-2 pl-1.5 font-mono whitespace-nowrap"
                  style={{ borderLeftColor: getDoseGroupColor(row.dose) }}
                >
                  {getDoseLabel(row.dose)}
                </span>
              </td>
              {data.periods.map((p, pi) => (
                <Fragment key={pi}>
                  {data.sexes.map((_sex, si) => (
                    <td key={si} className="text-right pl-1 pr-0.5 py-0.5 font-mono tabular-nums">
                      {p.rows[ri]?.values[si]?.toFixed(2) ?? "\u2014"}
                    </td>
                  ))}
                </Fragment>
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

// ═══════════════════════════════════════════════════════════
// ══ ORGAN PROPORTIONALITY PANE ════════════════════════════
// ═══════════════════════════════════════════════════════════

function OrganProportionalityHeaderRight({ result }: { result: OrganProportionalityResult }) {
  const sexesDiverge = checkSexDivergence(result.bySex);
  const sexes = Object.keys(result.bySex).sort();

  if (sexesDiverge && sexes.length === 2) {
    return (
      <span className="text-muted-foreground">
        {sexes.map((sex) => {
          const s = result.bySex[sex];
          return `${sex}: ${s.disproportionateCount + s.inverseCount} disprop`;
        }).join(" · ")}
      </span>
    );
  }

  const totalDisprop = sexes.reduce(
    (sum, s) => sum + result.bySex[s].disproportionateCount + result.bySex[s].inverseCount,
    0,
  );
  const totalProp = sexes.reduce(
    (sum, s) => sum + result.bySex[s].proportionateCount,
    0,
  );

  return (
    <span className="text-muted-foreground">
      {totalDisprop} disproportionate · {totalProp} proportionate
    </span>
  );
}

function OrganProportionalityPane({
  result,
  doseGroups,
}: {
  result: OrganProportionalityResult;
  doseGroups?: DoseGroup[];
}) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const sexesDiverge = checkSexDivergence(result.bySex);
  const sexes = Object.keys(result.bySex).sort();

  const getDoseLabel = (level: number): string => {
    if (level === 0) return "Control";
    if (!doseGroups?.length) return `Dose ${level}`;
    const dg = doseGroups.find((d) => d.dose_level === level);
    if (!dg?.dose_value || !dg.dose_unit) return `Dose ${level}`;
    return `${dg.dose_value} ${dg.dose_unit}`;
  };

  const fmtDelta = (pct: number | null) => {
    if (pct == null) return "—";
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(1)}%`;
  };

  const fmtOpi = (opi: number | null) => {
    if (opi == null) return "—";
    return opi.toFixed(2);
  };

  const getClassBorder = (c: OpiClassification) => {
    switch (c) {
      case "disproportionate":
        return "border-l-4 pl-1.5";
      case "inverse":
        return "border-l-4 pl-1.5";
      case "partially_proportionate":
        return "border-l-2 pl-1.5";
      default:
        return "pl-2.5";
    }
  };

  const getClassBorderColor = (c: OpiClassification): string | undefined => {
    switch (c) {
      case "disproportionate":
        return "#D97706";
      case "inverse":
        return "#DC2626";
      default:
        return undefined;
    }
  };

  const getClassTextClass = (c: OpiClassification) => {
    switch (c) {
      case "disproportionate":
      case "inverse":
        return "font-medium text-foreground";
      case "partially_proportionate":
        return "text-foreground/80";
      case "proportionate":
        return "text-muted-foreground";
      case "not_applicable":
        return "text-muted-foreground/60";
    }
  };

  const getMiGlyph = (status: OrganOpiRow["miStatus"], findings: string[]) => {
    switch (status) {
      case "finding_present":
        return <span className="text-foreground" title={findings.join(", ")}>●</span>;
      case "examined_clean":
        return <span className="text-muted-foreground" title="Examined, no atrophy">○</span>;
      case "not_examined":
        return <span className="text-muted-foreground/60" title="Not examined">—</span>;
    }
  };

  const getRecoveryIndicator = (row: OrganOpiRow) => {
    if (row.recoveryStatus == null) return <span className="text-muted-foreground/60">—</span>;
    switch (row.recoveryStatus) {
      case "recovered":
        return <span className="border-l-2 border-l-emerald-400/40 pl-1 text-muted-foreground" title={`${Math.round(row.recoveryResolutionPct ?? 0)}% resolved`}>rec</span>;
      case "partial":
        return <span className="border-l-2 border-l-amber-300/40 pl-1 text-foreground/80" title={`${Math.round(row.recoveryResolutionPct ?? 0)}% resolved`}>part</span>;
      case "not_recovered":
        return <span className="border-l-2 border-l-amber-400/60 pl-1 font-medium text-foreground" title={`${Math.round(row.recoveryResolutionPct ?? 0)}% resolved`}>pers</span>;
    }
  };

  const renderOrganRow = (row: OrganOpiRow) => {
    const key = `${row.organ}-${row.sex}`;
    const isExpanded = expandedKey === key;
    const borderClass = getClassBorder(row.classification);
    const borderColor = getClassBorderColor(row.classification);
    const textClass = getClassTextClass(row.classification);

    return (
      <Fragment key={key}>
        <tr
          className={`cursor-pointer hover:bg-muted/30 ${textClass}`}
          onClick={() => setExpandedKey(isExpanded ? null : key)}
        >
          <td
            className={`py-0.5 pr-2 text-[10px] ${borderClass}`}
            style={borderColor ? { borderLeftColor: borderColor } : undefined}
          >
            {row.organ}{row.concordance === "mi_only" && <span className="ml-1 text-[9px] text-muted-foreground italic">MI-only</span>}
          </td>
          <td className="py-0.5 px-1 text-[9px] text-muted-foreground">{row.sex}</td>
          <td className="py-0.5 px-1 text-[10px] font-mono tabular-nums text-right">{fmtDelta(row.bwDeltaPct)}</td>
          <td className="py-0.5 px-1 text-[10px] font-mono tabular-nums text-right">{fmtDelta(row.organWtDeltaPct)}</td>
          <td className="py-0.5 px-1 text-[10px] font-mono tabular-nums text-right">{fmtOpi(row.opi)}</td>
          <td className="py-0.5 px-1 text-[10px]">{row.classification.replace(/_/g, " ")}</td>
          <td className="py-0.5 px-1 text-[10px] text-center">{getMiGlyph(row.miStatus, row.miFindings)}</td>
          <td className="py-0.5 px-1 text-[10px]">{getRecoveryIndicator(row)}</td>
        </tr>

        {/* Expandable detail */}
        {isExpanded && (
          <tr>
            <td colSpan={8} className="pb-2 pt-0.5">
              <OrganDetailExpanded row={row} getDoseLabel={getDoseLabel} />
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  const renderSexGroupHeader = (sex: string) => {
    const s = result.bySex[sex];
    if (!s) return null;
    return (
      <tr key={`header-${sex}`}>
        <td colSpan={8} className="pt-2 pb-0.5 text-[9px] font-semibold text-muted-foreground">
          ── {sex === "F" ? "Females" : "Males"} (BW {fmtDelta(s.bwDeltaPct)}) ──
        </td>
      </tr>
    );
  };

  return (
    <div>
      {/* Coverage line */}
      {sexesDiverge ? (
        <div className="space-y-0.5">
          {sexes.map((sex) => {
            const s = result.bySex[sex];
            if (!s) return null;
            return (
              <div key={sex} className="text-[10px] text-muted-foreground">
                {sex === "F" ? "F" : "M"} (BW {fmtDelta(s.bwDeltaPct)}): {s.totalAssessed} organs · {s.disproportionateCount + s.inverseCount} disprop · {s.proportionateCount} prop
                {s.partiallyProportionateCount > 0 && ` · ${s.partiallyProportionateCount} borderline`}
                {s.notApplicableCount > 0 && ` · ${s.notApplicableCount} n/a`}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[10px] text-muted-foreground">
          {(() => {
            const totals = sexes.reduce(
              (acc, sex) => {
                const s = result.bySex[sex];
                return {
                  total: acc.total + s.totalAssessed,
                  disprop: acc.disprop + s.disproportionateCount + s.inverseCount,
                  prop: acc.prop + s.proportionateCount,
                  partial: acc.partial + s.partiallyProportionateCount,
                  na: acc.na + s.notApplicableCount,
                };
              },
              { total: 0, disprop: 0, prop: 0, partial: 0, na: 0 },
            );
            return (
              <>
                OM assessed: {totals.total} organs · Disproportionate: {totals.disprop} · Proportionate: {totals.prop}
                {totals.partial > 0 && ` · Borderline: ${totals.partial}`}
                {totals.na > 0 && ` · N/A: ${totals.na}`}
              </>
            );
          })()}
        </div>
      )}

      {/* Caveats */}
      {result.caveats.length > 0 && (
        <div className="mt-1.5 space-y-0.5">
          {result.caveats.map((c, i) => (
            <p key={i} className="text-[10px] italic text-foreground/80">{c}</p>
          ))}
        </div>
      )}

      {/* Organ ranking table */}
      <table className="mt-2 w-full border-collapse text-[10px]">
        <thead>
          <tr className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <th className="py-0.5 pr-2 text-left">Organ</th>
            <th className="py-0.5 px-1 text-left">Sex</th>
            <th className="py-0.5 px-1 text-right">BW Δ%</th>
            <th className="py-0.5 px-1 text-right">Wt Δ%</th>
            <th className="py-0.5 px-1 text-right">OPI</th>
            <th className="py-0.5 px-1 text-left">Class</th>
            <th className="py-0.5 px-1 text-center">MI</th>
            <th className="py-0.5 px-1 text-left">Rec</th>
          </tr>
        </thead>
        <tbody>
          {sexesDiverge
            ? sexes.flatMap((sex) => [
                renderSexGroupHeader(sex),
                ...result.organs.filter((r) => r.sex === sex).map(renderOrganRow),
              ])
            : (() => {
                // Interleave M/F per organ for easy comparison
                const organOrder: string[] = [];
                const seen = new Set<string>();
                for (const r of result.organs) {
                  const key = r.organ.toLowerCase().trim();
                  if (!seen.has(key)) {
                    seen.add(key);
                    organOrder.push(key);
                  }
                }
                return organOrder.flatMap((key) =>
                  result.organs.filter((r) => r.organ.toLowerCase().trim() === key).map(renderOrganRow),
                );
              })()}
        </tbody>
      </table>

      {/* Interpretive summary for flagged organs */}
      {(() => {
        const flagged = result.organs.filter(
          (r) => r.classification === "disproportionate" || r.classification === "inverse",
        );
        if (flagged.length === 0) return null;

        // Group by organ to detect same-organ-both-sexes
        const byOrgan = new Map<string, OrganOpiRow[]>();
        for (const r of flagged) {
          const key = r.organ.toLowerCase().trim();
          const arr = byOrgan.get(key) ?? [];
          arr.push(r);
          byOrgan.set(key, arr);
        }

        return (
          <div className="mt-3 space-y-1">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Interpretive summary</div>
            {[...byOrgan.entries()].map(([key, rows]) => {
              const bothSexes = rows.length >= 2;
              const borderColor = rows.some((r) => r.classification === "inverse") ? "#DC2626" : "#D97706";
              // Find highest dose where organ is flagged (for dose label)
              const peakDose = rows[0].byDose.length > 0
                ? rows[0].byDose[rows[0].byDose.length - 1]
                : null;
              const doseText = peakDose ? ` at ${getDoseLabel(peakDose.doseLevel)}` : "";

              if (bothSexes) {
                // Both sexes flagged
                const opiText = rows.map((r) => `${r.sex} OPI ${r.opi?.toFixed(2) ?? "n/a"}`).join(", ");
                const concordText = rows[0].concordance.includes("concordant") ? "MI-concordant" : "";
                return (
                  <div
                    key={key}
                    className="border-l-4 pl-1.5 text-[10px] text-foreground"
                    style={{ borderLeftColor: borderColor }}
                  >
                    {rows[0].organ}: OPI {opiText}{doseText} — {rows[0].classification.replace(/_/g, " ")} in both sexes
                    {concordText && ` (${concordText})`}
                  </div>
                );
              }

              // Single sex
              const r = rows[0];
              const oppositeSex = result.organs.find(
                (o) => o.organ.toLowerCase().trim() === key && o.sex !== r.sex,
              );
              const sexNote = oppositeSex
                ? ` Note: ${oppositeSex.classification.replace(/_/g, " ")} in ${oppositeSex.sex} (OPI ${oppositeSex.opi?.toFixed(2) ?? "n/a"}).`
                : "";
              const concordText = r.concordance.includes("concordant_disproportionate")
                ? r.miFindings.length > 0 ? `, MI-concordant (${r.miFindings[0]})` : ", MI-concordant"
                : "";
              const deltaText = r.classification === "inverse" && r.organWtDeltaPct != null
                ? ` ${r.organWtDeltaPct >= 0 ? "+" : ""}${r.organWtDeltaPct.toFixed(0)}% despite ${r.bwDeltaPct >= 0 ? "+" : ""}${r.bwDeltaPct.toFixed(0)}% BW`
                : "";

              return (
                <div
                  key={key}
                  className="border-l-4 pl-1.5 text-[10px] text-foreground"
                  style={{ borderLeftColor: borderColor }}
                >
                  {r.organ} ({r.sex}): OPI {r.opi?.toFixed(2) ?? "n/a"}{doseText} — {r.classification.replace(/_/g, " ")}
                  {deltaText}{concordText}.{sexNote}
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}

/** Inline expanded detail for a single organ row */
function OrganDetailExpanded({
  row,
  getDoseLabel,
}: {
  row: OrganOpiRow;
  getDoseLabel: (level: number) => string;
}) {
  return (
    <div className="ml-3 space-y-1.5 border-l border-muted pl-2">
      {/* Dose-by-dose OPI */}
      {row.byDose.length > 0 && (
        <div>
          <div className="text-[9px] font-semibold text-muted-foreground">Dose-by-dose</div>
          <div className="mt-0.5 space-y-0.5">
            {row.byDose.map((d) => (
              <div key={d.doseLevel} className="flex items-baseline gap-2 text-[10px] font-mono tabular-nums">
                <span className="text-muted-foreground" style={{ width: 70 }}>{getDoseLabel(d.doseLevel)}</span>
                <span className="text-muted-foreground" style={{ width: 50 }}>Wt {d.organWtDeltaPct != null ? `${d.organWtDeltaPct >= 0 ? "+" : ""}${d.organWtDeltaPct.toFixed(1)}%` : "—"}</span>
                <span className={`font-medium ${d.classification === "disproportionate" || d.classification === "inverse" ? "text-foreground" : "text-muted-foreground"}`} style={{ width: 40 }}>
                  {d.opi != null ? d.opi.toFixed(2) : "—"}
                </span>
                <span className="text-muted-foreground">{d.classification.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MI detail */}
      {row.miStatus === "finding_present" && (
        <div className="text-[10px]">
          <span className="text-muted-foreground">MI: </span>
          <span className="text-foreground">{row.miFindings.join(", ")}</span>
          {row.miIncidence && (
            <span className="ml-1.5 text-muted-foreground">{row.miIncidence}</span>
          )}
          {row.miSeverity != null && (
            <span className="ml-1.5 text-muted-foreground">severity {row.miSeverity.toFixed(1)}</span>
          )}
        </div>
      )}

      {/* Concordance */}
      <div className="text-[10px] text-muted-foreground">
        Concordance: {row.concordance.replace(/_/g, " ")}
        {row.opi != null && ` (OPI ${row.opi.toFixed(2)}`}
        {row.opi != null && row.miStatus === "finding_present" && row.miFindings.length > 0
          ? ` confirmed by ${row.miFindings[0]}${row.miIncidence ? ` ${row.miIncidence} ${row.sex}` : ""})`
          : row.opi != null ? ")" : ""}
        {row.concordance === "discordant_weight_only" && "; review for weighing artifact"}
      </div>

      {/* Recovery */}
      {row.recoveryStatus != null && (
        <div className="text-[10px] text-muted-foreground">
          Recovery: {row.recoveryStatus.replace(/_/g, " ")}
          {row.recoveryResolutionPct != null && ` (${Math.round(row.recoveryResolutionPct)}% resolved)`}
        </div>
      )}
    </div>
  );
}
