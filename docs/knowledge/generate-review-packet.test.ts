/**
 * Scientific Logic Review Packet Generator
 *
 * Runs the full syndrome detection + interpretation pipeline on PointCross data
 * and writes a self-contained markdown review document that domain experts
 * (toxicologists, pathologists, biostatisticians) can review without reading TypeScript.
 *
 * Run with: npm test -- generate-review-packet
 * Output:   docs/knowledge/scientific-logic-review.md
 */
import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { EndpointSummary } from "@/lib/derive-summaries";
import {
  detectCrossDomainSyndromes,
  getSyndromeTermReport,
  getSyndromeDefinition,
  getTermDisplayLabel,
} from "@/lib/cross-domain-syndromes";
import type {
  CrossDomainSyndrome,
  TermReportEntry,
} from "@/lib/cross-domain-syndromes";
import {
  interpretSyndrome,
  computeTreatmentRelatedness,
  assessClinicalObservationSupport,
  TRANSLATIONAL_BINS,
  STAT_SIG_THRESHOLDS,
  DOSE_RESPONSE_THRESHOLDS,
} from "@/lib/syndrome-interpretation";
import type {
  SyndromeInterpretation,
  TreatmentRelatednessScore,
  FoodConsumptionSummaryResponse,
  StudyContext,
} from "@/lib/syndrome-interpretation";
import { getRuleDefinition, describeThreshold } from "@/lib/lab-clinical-catalog";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";

import fixture from "../../frontend/tests/fixtures/pointcross-findings.json";

// ─── Pipeline setup ──────────────────────────────────────────

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const syndromes = detectCrossDomainSyndromes(endpoints);

const defaultContext: StudyContext = {
  studyId: "PointCross",
  species: "RAT",
  strain: "SPRAGUE-DAWLEY",
  route: "ORAL GAVAGE",
  studyType: "SUBCHRONIC",
  dosingDurationWeeks: 13,
  recoveryPeriodDays: null,
  terminalSacrificeWeeks: 13,
  sexPopulation: "BOTH",
  ageAtStartWeeks: null,
  estimatedNecropsyAgeWeeks: null,
  supplier: "",
  vehicle: "",
  treatment: "",
  studyDesign: "",
  plannedSubjectsM: null,
  plannedSubjectsF: null,
  diet: "",
  glpCompliant: true,
  sendCtVersion: "",
  title: "",
  ecgInterpretation: {
    qtcTranslational: false,
    preferredCorrection: null,
    rationale:
      "Rodent ventricular repolarization is Ito-dominated; QTc prolongation has limited translational value to humans.",
  },
};

const noFoodData: FoodConsumptionSummaryResponse = {
  available: false,
  water_consumption: null,
};

// ─── Clinical descriptions (hand-written for reviewers) ─────

const SYNDROME_DESCRIPTIONS: Record<string, string> = {
  XS01: "Direct damage to liver parenchymal cells (hepatocytes), typically from reactive metabolites, mitochondrial dysfunction, or oxidative stress. Key markers: ALT/AST elevation with histopathological confirmation (necrosis, degeneration). Distinguished from cholestatic injury (XS02) by enzyme profile.",
  XS02: "Impaired bile formation or flow (cholestasis), with or without hepatocellular involvement. Key markers: ALP/GGT/5'-nucleotidase elevation. May present as intrahepatic (drug/metabolite-induced) or extrahepatic (biliary obstruction). R-ratio classification differentiates hepatocellular vs. cholestatic vs. mixed injury.",
  XS03: "Toxic injury to the kidney, affecting glomerular filtration, tubular reabsorption, or both. Key markers: BUN/creatinine elevation with kidney weight changes and histopathological findings (tubular necrosis, mineralization). Electrolyte disturbances (Na, K, Ca, P) provide supporting evidence.",
  XS04: "Decreased bone marrow production of blood cells (suppressed hematopoiesis). Distinct from peripheral destruction (XS05). Key differentiator: reticulocyte direction — decreased in myelosuppression, increased in hemolysis. Multi-lineage cytopenias (neutropenia, thrombocytopenia, anemia) suggest stem cell-level toxicity.",
  XS05: "Accelerated destruction of circulating red blood cells (hemolytic anemia). Distinguished from myelosuppression (XS04) by reticulocyte response (increased = regenerative response to peripheral RBC loss). Supporting evidence: bilirubin elevation, spleen enlargement, Heinz bodies, spherocytes.",
  XS06: "Excessive accumulation of phospholipids within lysosomes of multiple cell types, typically caused by cationic amphiphilic drugs that inhibit lysosomal phospholipases. Key histopathological hallmark: lamellar bodies visible on electron microscopy. Often multi-organ (liver, lung, kidney, lymph nodes).",
  XS07: "Drug-induced suppression or dysregulation of the immune system. May manifest as lymphoid depletion, thymic atrophy, altered immunoglobulin levels, or impaired functional immune response. Key markers: WBC/lymphocyte changes, organ weight decreases (thymus, spleen), histopathological lymphoid depletion.",
  XS08: "Non-specific physiological stress response (distress), often secondary to excessive toxicity or palatability issues. Key markers: adrenal hypertrophy, thymic atrophy, body weight loss, corticosterone elevation. Must be distinguished from direct organ toxicity — stress response findings alone should not drive NOAEL.",
  XS09: "Progressive loss of organ mass (atrophy/wasting) with or without functional decline. Typically manifests as decreased organ weights with histopathological atrophy, often accompanied by body weight loss. May be primary (direct toxicity) or secondary (generalized wasting from severe systemic toxicity).",
  XS10: "Drug-induced effects on the cardiovascular system, including cardiac functional changes (heart rate, ECG parameters, blood pressure), structural changes (cardiomyocyte degeneration, fibrosis), and vascular effects. Species differences in translational relevance (e.g., rodent QTc has limited predictive value for human risk).",
};

// ─── Per-syndrome review questions (hand-written) ───────────

const SYNDROME_REVIEW_QUESTIONS: Record<string, string[]> = {
  XS01: [
    "Are ALT + AST sufficient required markers for rodent hepatocellular injury, or should SDH (sorbitol dehydrogenase) be required as a more liver-specific marker?",
    "Should GLDH (glutamate dehydrogenase) be included as a required or supporting marker for hepatocellular injury in rats?",
    "Is the 'any' required logic appropriate (any single required term triggers), or should compound logic (e.g., ALT AND AST) be used?",
    "Are the histopathological findings (necrosis, degeneration, hypertrophy) correctly classified as supporting rather than required?",
  ],
  XS02: [
    "Is the compound logic 'ALP AND (GGT OR 5NT)' appropriate for cholestasis detection in rodents?",
    "Should total bilirubin be required (not just supporting) for cholestasis?",
    "Is ALP elevation alone sufficient to suggest cholestasis, or is concurrent GGT/5NT essential to rule out bone-origin ALP?",
  ],
  XS03: [
    "Are BUN and creatinine sufficient required markers, or should urinalysis parameters (proteinuria, glucosuria) also be required?",
    "Is the 'any' required logic appropriate — can a single marker (e.g., BUN alone) reliably indicate nephrotoxicity without creatinine confirmation?",
    "Should kidney weight changes be required rather than supporting?",
  ],
  XS04: [
    "Reticulocyte direction is the primary XS04/XS05 discriminator. Is this sufficient, or should MCV/MCH/MCHC also be considered?",
    "Is the compound logic 'ANY(NEUT, PLAT, (RBC AND HGB))' appropriate? Should lymphocyte count also be included?",
    "Should bone marrow cellularity assessment (if available) override peripheral blood parameters?",
    "Is minDomains=1 (LB only) too permissive? Should histopath confirmation be required?",
  ],
  XS05: [
    "Is reticulocyte increase sufficient to distinguish hemolysis from myelosuppression, or could reticulocyte increase also occur in recovery from transient myelosuppression?",
    "Should indirect bilirubin (vs. total bilirubin) be the preferred supporting marker?",
    "Should the required logic be 'all' (requiring both RBC decrease and reticulocyte increase simultaneously)?",
  ],
  XS06: [
    "Is the current marker set sufficient to detect phospholipidosis without electron microscopy confirmation?",
    "Should the definition include specific histopathological findings (lamellar bodies, foamy macrophages) as required terms?",
    "Should cationic amphiphilic drug (CAD) structure be a prerequisite or modifier for phospholipidosis detection?",
  ],
  XS07: [
    "Should functional immune endpoints (e.g., antibody response to T-dependent antigen) be included if available?",
    "Is the distinction between immunosuppression (decreased function) and immunotoxicity (structural damage) adequately captured?",
    "Should thymus weight be required rather than supporting for immunotoxicity assessment?",
  ],
  XS08: [
    "How should the system distinguish primary adrenal toxicity from secondary stress-related adrenal hypertrophy?",
    "Should body weight loss be required for stress response classification, or can adrenal/thymus changes alone qualify?",
    "At what threshold of body weight change (%) should stress response become the primary classification vs. secondary to another syndrome?",
  ],
  XS09: [
    "How should the system distinguish primary organ atrophy (direct toxicity) from secondary wasting (systemic toxicity)?",
    "Should body weight loss percentage thresholds be defined for classifying severity of wasting?",
    "Is it correct that organ weight decreases alone can trigger this syndrome, without histopathological confirmation of atrophy?",
  ],
  XS10: [
    "Given that rodent QTc has limited translational value, should cardiac functional parameters (HR, ECG) receive reduced weight in rodent studies?",
    "Should troponin levels be included as a sensitive marker for cardiomyocyte injury?",
    "How should the system handle species-specific differences in cardiovascular susceptibility (e.g., rat vs. dog)?",
  ],
};

// ─── Formatting helpers ─────────────────────────────────────

function dirArrow(dir: string | null | undefined): string {
  if (dir === "up") return "↑";
  if (dir === "down") return "↓";
  return "—";
}

function fmtP(p: number | null | undefined): string {
  if (p == null) return "n/a";
  if (p < 0.0001) return "<0.0001";
  if (p < 0.001) return p.toFixed(4);
  return p.toFixed(3);
}

function fmtEffect(d: number | null | undefined): string {
  if (d == null) return "n/a";
  return `${d >= 0 ? "+" : ""}${d.toFixed(2)}`;
}

function fmtFold(f: number | null | undefined): string {
  if (f == null) return "n/a";
  return `${f.toFixed(2)}×`;
}

/** Build endpoint index for fast lookups */
function buildEndpointIndex(eps: EndpointSummary[]): Map<string, EndpointSummary> {
  const m = new Map<string, EndpointSummary>();
  for (const ep of eps) {
    if (!m.has(ep.endpoint_label)) m.set(ep.endpoint_label, ep);
  }
  return m;
}

// ─── Lab rule IDs ───────────────────────────────────────────

const LAB_RULE_IDS = [
  "L01", "L02", "L03", "L04", "L05", "L06", "L07", "L08", "L09", "L10", "L11",
  "L12", "L13", "L14", "L15", "L16", "L17", "L18", "L19", "L20", "L21", "L22",
  "L23", "L24", "L25a", "L25b", "L25c", "L26", "L27", "L28", "L29", "L30", "L31",
];

// ─── Document generation ────────────────────────────────────

function generateReviewDocument(): string {
  const lines: string[] = [];
  const now = new Date().toISOString().slice(0, 10);
  const epIndex = buildEndpointIndex(endpoints);

  // ═══ Header ═══

  lines.push("# Scientific Logic Review — SEND Data Browser");
  lines.push("");
  lines.push(`**Generated:** ${now}  `);
  lines.push(`**Study:** PointCross (${defaultContext.species}, ${defaultContext.strain}, ${defaultContext.route}, ${defaultContext.dosingDurationWeeks}-week ${defaultContext.studyType.toLowerCase()})  `);
  lines.push(`**Pipeline:** ${endpoints.length} endpoint summaries → ${syndromes.length} detected syndromes (${syndromes.map(s => s.id).join(", ")})`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## Instructions for Reviewers");
  lines.push("");
  lines.push("This document is **auto-generated from code** — every definition, threshold, and worked example reflects the system's current logic. When the code changes, this document regenerates.");
  lines.push("");
  lines.push("Your task: read each section and answer the **► Review questions**. You do not need to read any code. Focus on:");
  lines.push("- Are the syndrome definitions clinically appropriate?");
  lines.push("- Are the interpretation thresholds reasonable for preclinical regulatory studies?");
  lines.push("- Do the worked examples (Part D) produce conclusions you agree with?");
  lines.push("- Are any ⚠ anomaly markers genuine problems or acceptable edge cases?");
  lines.push("");
  lines.push("Mark each question with ✅ (agree), ❌ (disagree — explain), or ❓ (need more info).");
  lines.push("");
  lines.push("---");
  lines.push("");

  // ═══ Part A: Syndrome Pattern Definitions ═══

  lines.push("# Part A: Syndrome Pattern Definitions");
  lines.push("");
  lines.push("The system defines 10 cross-domain syndrome patterns (XS01–XS10). Each pattern specifies required and supporting evidence across laboratory (LB), microscopic pathology (MI), macroscopic pathology (MA), organ weight (OM), clinical observation (CL), and other domains.");
  lines.push("");

  const syndromeIds = ["XS01", "XS02", "XS03", "XS04", "XS05", "XS06", "XS07", "XS08", "XS09", "XS10"];

  for (const sid of syndromeIds) {
    const def = getSyndromeDefinition(sid);
    if (!def) {
      lines.push(`## ${sid} — (not found in engine)`);
      lines.push("");
      continue;
    }

    lines.push(`## ${sid}: ${def.name}`);
    lines.push("");
    lines.push(`**Clinical description:** ${SYNDROME_DESCRIPTIONS[sid] ?? "(no description)"}`);
    lines.push("");

    // Required logic
    const logicStr = def.requiredLogic.type === "compound"
      ? `Compound: \`${(def.requiredLogic as { type: "compound"; expression: string }).expression}\``
      : def.requiredLogic.type === "all"
        ? "ALL required terms must match"
        : "ANY one required term triggers detection";
    lines.push(`**Required logic:** ${logicStr}  `);
    lines.push(`**Minimum domains:** ${def.minDomains}`);
    lines.push("");

    // Terms table
    const requiredTerms = def.terms.filter((t: { role: string }) => t.role === "required");
    const supportingTerms = def.terms.filter((t: { role: string }) => t.role === "supporting");

    if (requiredTerms.length > 0) {
      lines.push("**Required evidence:**");
      lines.push("");
      lines.push("| Term | Domain | Direction | Tag |");
      lines.push("|------|--------|-----------|-----|");
      for (const t of requiredTerms) {
        const label = getTermDisplayLabel(t);
        const tag = (t as { tag?: string }).tag ?? "—";
        lines.push(`| ${label} | ${t.domain} | ${t.direction} | ${tag} |`);
      }
      lines.push("");
    }

    if (supportingTerms.length > 0) {
      lines.push("**Supporting evidence:**");
      lines.push("");
      lines.push("| Term | Domain | Direction |");
      lines.push("|------|--------|-----------|");
      for (const t of supportingTerms) {
        const label = getTermDisplayLabel(t);
        lines.push(`| ${label} | ${t.domain} | ${t.direction} |`);
      }
      lines.push("");
    }

    // Review questions
    const questions = SYNDROME_REVIEW_QUESTIONS[sid];
    if (questions && questions.length > 0) {
      lines.push("**► Review questions:**");
      lines.push("");
      for (const q of questions) {
        lines.push(`- [ ] ${q}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  // ═══ Part B: Interpretation Framework ═══

  lines.push("# Part B: Interpretation Framework");
  lines.push("");
  lines.push("After detecting syndrome patterns, the system interprets each through a multi-step pipeline. Each step produces a structured assessment that feeds into the next.");
  lines.push("");

  // B.1 Certainty
  lines.push("## B.1: Certainty Assessment");
  lines.push("");
  lines.push("Classifies each syndrome into one of three certainty levels:");
  lines.push("");
  lines.push("| Level | Meaning | Criteria |");
  lines.push("|-------|---------|----------|");
  lines.push("| `mechanism_confirmed` | Strong mechanistic evidence supports the pattern | Histopath cross-references confirm expected findings in target organs; discriminating evidence favors this syndrome over alternatives |");
  lines.push("| `mechanism_uncertain` | Pattern detected but mechanistic evidence is incomplete | Some discriminating findings present but not all; histopath may be absent or inconclusive |");
  lines.push("| `pattern_only` | Statistical pattern with no mechanistic confirmation | No histopath data, no discriminating findings, or discriminating evidence is equivocal |");
  lines.push("");
  lines.push("**Decision logic:** The system evaluates discriminating findings (endpoints that distinguish this syndrome from its differential diagnosis). Each finding scores as `confirms`, `argues_against`, or `not_measured`. The ratio of confirms to argues_against, combined with histopathological cross-reference, determines the certainty level.");
  lines.push("");

  // B.2 Treatment-relatedness
  lines.push("## B.2: Treatment-Relatedness (ECETOC A-Factors)");
  lines.push("");
  lines.push("Scores treatment-relatedness using weighted factors adapted from ECETOC Technical Report No. 85 (2002):");
  lines.push("");
  lines.push("| Factor | Scoring | Weight |");
  lines.push("|--------|---------|--------|");
  lines.push(`| A-1: Dose-response | \`strong\` (${DOSE_RESPONSE_THRESHOLDS.strongPatterns.join("/")} pattern + p<${DOSE_RESPONSE_THRESHOLDS.strongPatternP}, OR p<${DOSE_RESPONSE_THRESHOLDS.pairwiseHighP} + |g|≥${DOSE_RESPONSE_THRESHOLDS.pairwiseMinEffect}), \`weak\` (any non-flat pattern), \`absent\` | Primary |`);
  lines.push("| A-2: Cross-endpoint concordance | `concordant` (≥2 domains), `isolated` (single domain) | Supporting |");
  lines.push(`| A-6: Statistical significance | \`significant\` (min p<${STAT_SIG_THRESHOLDS.significant} across matched endpoints), \`borderline\` (min p<${STAT_SIG_THRESHOLDS.borderline}), \`not_significant\` | Supporting |`);
  lines.push("| CL: Clinical observation support | `yes`/`no` — correlating clinical signs present | Modifier |");
  lines.push("");
  lines.push("**Overall classification:**");
  lines.push("- `treatment_related` — strong dose-response OR (significant + concordant) OR (adverse severity + monotonic pattern)");
  lines.push("- `possibly_related` — weak evidence or borderline significance without concordance");
  lines.push("- `not_related` — no dose-response, not significant, no concordance");
  lines.push("");

  // B.3 Adversity
  lines.push("## B.3: Adversity Assessment (ECETOC B-Factors)");
  lines.push("");
  lines.push("Evaluates whether the syndrome represents an adverse effect using a multi-factor framework:");
  lines.push("");
  lines.push("| Factor | Assessment | Source |");
  lines.push("|--------|-----------|--------|");
  lines.push("| Adaptive response | `true`/`false` — are changes adaptive (e.g., enzyme induction without injury)? | Endpoint patterns |");
  lines.push("| Reversibility | `true`/`false`/`null` — do effects reverse in recovery period? | Recovery arm data |");
  lines.push("| Magnitude | `minimal`/`mild`/`moderate`/`marked`/`severe` — Cohen's d thresholds | Effect sizes |");
  lines.push("| Cross-domain support | `true`/`false` — do multiple domains converge? | Domain count |");
  lines.push("| Precursor to worse | `true`/`false` — could changes progress to more serious injury? | Syndrome definition |");
  lines.push("| Secondary to other | `true`/`false` — are changes secondary to another primary toxicity? | Cross-syndrome analysis |");
  lines.push("");
  lines.push("**Magnitude thresholds (Cohen's d):**");
  lines.push("- `minimal`: |d| < 0.5");
  lines.push("- `mild`: 0.5 ≤ |d| < 1.0");
  lines.push("- `moderate`: 1.0 ≤ |d| < 2.0");
  lines.push("- `marked`: 2.0 ≤ |d| < 3.0");
  lines.push("- `severe`: |d| ≥ 3.0");
  lines.push("");
  lines.push("**Overall adversity:** `adverse`, `non_adverse`, or `equivocal`");
  lines.push("");

  // B.4 Severity cascade
  lines.push("## B.4: Severity Cascade");
  lines.push("");
  lines.push("Assigns an overall severity tier based on the interpretation results. Priority order (highest to lowest):");
  lines.push("");
  lines.push("| Tier | Label | Trigger |");
  lines.push("|------|-------|---------|");
  lines.push("| S0 | Death | Treatment-related mortality detected |");
  lines.push("| — | Carcinogenic | Tumor progression sequence detected |");
  lines.push("| — | Proliferative | Tumors present (no progression) |");
  lines.push("| S4 | Critical | Treatment-related mortality (non-syndrome organs) |");
  lines.push("| S3 | Adverse | Adversity=adverse + mechanism_confirmed or mechanism_uncertain |");
  lines.push("| S2 | Concern | Adversity=equivocal OR pattern_only with adverse signals |");
  lines.push("| S1 | Monitor | Non-adverse, minimal magnitude, or insufficient evidence |");
  lines.push("");

  // B.5 Translational confidence
  lines.push("## B.5: Translational Confidence");
  lines.push("");
  lines.push("Estimates how likely the animal findings translate to human risk, using species-specific likelihood ratios (LR+) from published concordance databases:");
  lines.push("");
  lines.push("| Tier | LR+ range | Interpretation |");
  lines.push("|------|-----------|----------------|");
  lines.push(`| \`high\` | Endpoint LR+ ≥ ${TRANSLATIONAL_BINS.endpoint.high} or SOC LR+ ≥ ${TRANSLATIONAL_BINS.soc.high} | Strong positive predictive value — animal findings reliably predict human toxicity at this SOC/endpoint level |`);
  lines.push(`| \`moderate\` | Endpoint LR+ ≥ ${TRANSLATIONAL_BINS.endpoint.moderate} or SOC LR+ ≥ ${TRANSLATIONAL_BINS.soc.moderate} | Modest predictive value — some concordance but significant false positive rate |`);
  lines.push("| `low` | Below moderate thresholds | Poor predictive value — animal findings at this SOC have limited relevance to human risk |");
  lines.push("| `insufficient_data` | No data | LR+ not available for this species/SOC combination |");
  lines.push("");
  lines.push("**Data source:** SOC-level and endpoint-level LR+ from published preclinical-to-clinical concordance studies (Bailey et al., Olson et al.).");
  lines.push("");

  // B.6 Statistical methods (REM-06)
  lines.push("## B.6: Statistical Methods (REM-06)");
  lines.push("");
  lines.push("All p-values and effect sizes in this document are computed by the backend analysis engine. Method documentation: `docs/knowledge/methods.md`.");
  lines.push("");
  lines.push("### Test Assignment by Endpoint Type");
  lines.push("");
  lines.push("| Domain | Endpoint type | Pairwise test | Trend test | Effect size |");
  lines.push("|--------|--------------|---------------|------------|-------------|");
  lines.push("| LB, BW, OM, EG, VS | Continuous | Welch's t-test (unequal variance) | Jonckheere-Terpstra (Spearman rank proxy) | Hedges' g (bias-corrected) |");
  lines.push("| MI, MA, TF | Incidence (binary) | Fisher's exact test (2×2) | Cochran-Armitage trend | — |");
  lines.push("| CL, DS | Incidence (event) | Fisher's exact test (2×2) | — | — |");
  lines.push("");
  lines.push("### Key Method Details");
  lines.push("");
  lines.push("- **Effect size** column (`Effect Size (g)`) uses Hedges' g with small-sample correction: g = d × (1 − 3/(4·df − 1)), where d = Cohen's d from pooled SD.");
  lines.push("- **P-values** for continuous endpoints are Bonferroni-corrected across dose groups. Incidence p-values are NOT corrected (Fisher's exact is inherently conservative with small counts).");
  lines.push("- **Dose-response pattern** is classified via step-wise noise-tolerant analysis: 0.5× pooled SD equivalence band for continuous endpoints (STAT-11 binomial tolerance for incidence).");
  lines.push("- **Trend p-value** uses Spearman rank correlation as a proxy for the Jonckheere-Terpstra test (both are rank-order-based; Spearman is available in scipy).");
  lines.push("");
  lines.push("### Limitations");
  lines.push("");
  lines.push("- Williams' test (optimal for monotonic dose-response) and Steel's test (nonparametric many-to-one) are not implemented.");
  lines.push("- Dunnett's test is computed but not used in classification logic (supplementary evidence only).");
  lines.push("- MI severity grades (1–5) have no formal ordinal test applied in the active pipeline.");
  lines.push("- No multiplicity correction within domains for incidence tests.");
  lines.push("");

  // B review questions
  lines.push("**► Review questions for interpretation framework:**");
  lines.push("");
  lines.push("- [ ] Cohen's d thresholds for adversity magnitude: <0.5=minimal, 0.5–1.0=mild, 1.0–2.0=moderate, 2.0–3.0=marked, ≥3.0=severe. Are these appropriate for preclinical studies with n=5–30 per group?");
  lines.push(`- [ ] Treatment-relatedness uses minimum p-value across matched endpoints (p<${STAT_SIG_THRESHOLDS.significant} = significant). Is this threshold appropriate for a screening tool?`);
  lines.push("- [ ] The severity cascade always elevates to S0 (Death) if treatment-related mortality is detected, regardless of other factors. Should there be exceptions (e.g., single early death with ambiguous cause)?");
  lines.push("- [ ] Should translational confidence modify the severity tier, or should it remain an independent annotation?");
  lines.push("- [ ] Is the three-level certainty scale (confirmed/uncertain/pattern_only) sufficient, or should intermediate levels be added?");
  lines.push("- [ ] Should reversibility data (when available) be able to override an 'adverse' classification to 'non_adverse'?");
  lines.push("");
  lines.push("---");
  lines.push("");

  // ═══ Part C: Classification Rules ═══

  lines.push("# Part C: Lab Clinical Significance Rules");
  lines.push("");
  lines.push("The system uses 33 rules to classify individual lab parameter changes. Each rule specifies the parameter(s), direction, threshold, and severity tier.");
  lines.push("");

  // Group by category
  const rulesByCategory: Record<string, Array<{ id: string; name: string; severity: string; category: string; source: string; params: string; thresholds: string }>> = {};

  for (const ruleId of LAB_RULE_IDS) {
    const def = getRuleDefinition(ruleId);
    if (!def) continue;

    const cat = def.category;
    if (!rulesByCategory[cat]) rulesByCategory[cat] = [];

    const params = def.parameters
      .map((p: { canonical: string; direction: string; role: string }) => `${p.canonical} ${p.direction} (${p.role})`)
      .join("; ");

    const thresholds: string[] = [];
    for (const p of def.parameters) {
      const desc = describeThreshold(ruleId, p.canonical);
      if (desc) thresholds.push(`${p.canonical}: ${desc}`);
    }

    rulesByCategory[cat].push({
      id: ruleId,
      name: def.name,
      severity: def.severity,
      category: cat,
      source: def.source,
      params,
      thresholds: thresholds.length > 0 ? thresholds.join("; ") : "—",
    });
  }

  for (const [category, rules] of Object.entries(rulesByCategory)) {
    lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)} Rules`);
    lines.push("");
    lines.push("| ID | Name | Severity | Parameters | Thresholds | Source |");
    lines.push("|-----|------|----------|------------|------------|--------|");
    for (const r of rules) {
      lines.push(`| ${r.id} | ${r.name} | ${r.severity} | ${r.params} | ${r.thresholds} | ${r.source} |`);
    }
    lines.push("");
  }

  lines.push("**► Review questions for classification rules:**");
  lines.push("");
  lines.push("- [ ] Are the fold-change thresholds for liver enzymes (L01: ≥2×, L02: ≥5×) appropriate across species?");
  lines.push("- [ ] Should Hy's Law criteria (L07) apply to preclinical studies, or is this strictly a clinical concept?");
  lines.push("- [ ] Are the governance rules (L26: multi-domain convergence, L27: syndrome pattern bonus) appropriately weighted?");
  lines.push("- [ ] For bidirectional parameters (L20: Potassium, L21: Glucose), is the threshold symmetry appropriate?");
  lines.push("- [ ] Should reticulocyte direction (L23 vs L31) use different thresholds for increase vs decrease?");
  lines.push("- [ ] Are graded increase rules (L28–L30) at the right severity level, given that increases may represent reactive rather than toxic responses?");
  lines.push("");
  lines.push("---");
  lines.push("");

  // ═══ Part D: PointCross Worked Examples ═══

  lines.push("# Part D: PointCross Worked Examples");
  lines.push("");
  lines.push("This section shows the system's actual output for each syndrome detected in the PointCross study. Every value below is computed by the pipeline — nothing is hand-edited.");
  lines.push("");
  lines.push(`**Study:** PointCross  `);
  lines.push(`**Species:** ${defaultContext.species} (${defaultContext.strain})  `);
  lines.push(`**Route:** ${defaultContext.route}  `);
  lines.push(`**Duration:** ${defaultContext.dosingDurationWeeks} weeks (${defaultContext.studyType.toLowerCase()})  `);
  lines.push(`**Detected syndromes:** ${syndromes.map(s => `${s.id} (${s.name})`).join(", ")}`);
  lines.push("");

  for (const syndrome of syndromes) {
    const termReport = getSyndromeTermReport(syndrome.id, endpoints, syndrome.sexes);
    if (!termReport) continue;

    const clSupport = assessClinicalObservationSupport(syndrome.id, []);
    const relatedness = computeTreatmentRelatedness(syndrome, endpoints, clSupport);

    const interp = interpretSyndrome(
      syndrome,
      endpoints,
      [], // histopath (not in fixture)
      [], // recovery (not in fixture)
      [], // organWeights
      [], // tumors
      [], // mortality
      noFoodData,
      [], // clinicalObservations
      defaultContext,
      undefined, // mortalityNoaelCap
      syndromes.map(s => s.id), // REM-10: pass all detected syndrome IDs for stress confound check
    );

    lines.push(`## ${syndrome.id}: ${syndrome.name}`);
    lines.push("");
    lines.push(`**Confidence:** ${syndrome.confidence}  `);
    lines.push(`**Domains covered:** ${syndrome.domainsCovered.join(", ")}  `);
    lines.push(`**Sexes:** ${syndrome.sexes.join(", ") || "combined"}  `);
    lines.push(`**Required logic met:** ${syndrome.requiredMet ? "Yes" : "No"} (${termReport.requiredMetCount}/${termReport.requiredTotal} required terms, logic: ${termReport.requiredLogicText})`);
    lines.push("");

    // Term-by-term evidence table
    lines.push("### Term-by-Term Match Evidence");
    lines.push("");
    lines.push("> Column key: **g** = Hedges' g (Welch's t pairwise); **p** = Bonferroni-adjusted (continuous) or Fisher's exact (incidence); **FC** = treated/control ratio. See §B.6.");
    lines.push("");
    lines.push("| Role | Term | Status | Matched Endpoint | Domain | Dir | Effect Size (g) | p-value | Fold Change | Pattern |");
    lines.push("|------|------|--------|------------------|--------|-----|-----------------|---------|-------------|---------|");

    const allEntries = [...termReport.requiredEntries, ...termReport.supportingEntries];
    let anomalyCount = 0;

    for (const entry of allEntries) {
      const ep = entry.matchedEndpoint ? epIndex.get(entry.matchedEndpoint) : null;
      const role = entry.role === "required" ? "**R**" : "S";
      const status = entry.status === "matched" ? "✓ matched"
        : entry.status === "opposite" ? "⚠ opposite"
        : entry.status === "not_significant" ? "○ not sig"
        : "— not measured";
      const dir = entry.foundDirection ? dirArrow(entry.foundDirection) : "—";
      // REM-01C: effect size is already signed from the pipeline (negative for decreases).
      // No direction-based sign flip needed.
      const effectSigned = ep?.maxEffectSize != null
        ? fmtEffect(ep.maxEffectSize)
        : "n/a";
      const pVal = fmtP(entry.pValue);
      const fold = ep ? fmtFold(ep.maxFoldChange) : "n/a";
      const pattern = ep?.pattern ?? "—";

      lines.push(`| ${role} | ${entry.label} | ${status} | ${entry.matchedEndpoint ?? "—"} | ${entry.domain} | ${dir} | ${effectSigned} | ${pVal} | ${fold} | ${pattern} |`);

      // Check for anomalies
      if (entry.status === "opposite") {
        anomalyCount++;
      }
      if (entry.status === "matched" && entry.foundDirection) {
        const expectsUp = entry.label.includes("↑");
        const expectsDown = entry.label.includes("↓");
        if ((expectsUp && entry.foundDirection === "down") || (expectsDown && entry.foundDirection === "up")) {
          lines.push("");
          lines.push(`> ⚠ **Direction mismatch in match:** ${entry.label} expects ${expectsUp ? "↑" : "↓"} but endpoint direction is ${dirArrow(entry.foundDirection)}`);
          anomalyCount++;
        }
      }
      // Strength mismatch: matched endpoint with large effect but weak overall dose-response
      if (entry.status === "matched" && ep && relatedness.doseResponse === "weak") {
        const isMonotonic = ep.pattern.includes("monotonic") || ep.pattern === "linear";
        if (isMonotonic && ep.maxEffectSize != null && Math.abs(ep.maxEffectSize) > 2.0 && ep.minPValue != null && ep.minPValue < 0.001) {
          lines.push("");
          lines.push(`> ⚠ **Strength mismatch:** ${ep.endpoint_label} has strong individual evidence (${ep.pattern}, |g|=${Math.abs(ep.maxEffectSize).toFixed(2)}, p=${fmtP(ep.minPValue)}) but overall dose-response rated "weak"`);
          anomalyCount++;
        }
      }
    }
    lines.push("");

    if (termReport.oppositeCount > 0) {
      lines.push(`> ⚠ **${termReport.oppositeCount} opposite-direction match(es)** — endpoints matching term identity but in the wrong direction.`);
      lines.push("");
    }

    // REM-09: Directional gate block
    if (syndrome.directionalGate?.gateFired) {
      const g = syndrome.directionalGate;
      lines.push("**Directional gate:**");
      if (g.action === "reject" && !g.overrideApplied) {
        lines.push(`- gate_fired: true`);
        lines.push(`- override_applied: false`);
        lines.push(`- action: ruled_out`);
        lines.push(`- reason: ${g.explanation}`);
      } else if (g.overrideApplied) {
        lines.push(`- gate_fired: true`);
        lines.push(`- override_applied: true`);
        lines.push(`- override_reason: ${g.overrideReason}`);
        lines.push(`- certainty_cap: ${g.certaintyCap}`);
      } else {
        lines.push(`- gate_fired: true`);
        lines.push(`- action: ${g.action}`);
        lines.push(`- certainty_cap: ${g.certaintyCap}`);
        lines.push(`- reason: ${g.explanation}`);
      }
      lines.push("");
    }

    if (termReport.missingDomains.length > 0) {
      lines.push(`**Missing domains:** ${termReport.missingDomains.join(", ")}`);
      lines.push("");
    }

    // Interpretation summary
    lines.push("### Interpretation");
    lines.push("");
    lines.push("| Component | Result | Detail |");
    lines.push("|-----------|--------|--------|");
    lines.push(`| Certainty | \`${interp.certainty}\` | ${interp.certaintyRationale} |`);
    const trScore = relatedness.reasoning.reduce((s: number, r: { score: number }) => s + r.score, 0);
    lines.push(`| Treatment-relatedness | \`${interp.treatmentRelatedness.overall}\` | score ${trScore.toFixed(1)}: ${relatedness.reasoning.map((r: { factor: string; value: string; score: number }) => `${r.factor}=${r.value}[${r.score}]`).join(", ")} |`);
    const advParts = [
      `adaptive=${interp.adversity.adaptive}`,
      `stressConfound=${interp.adversity.stressConfound}`,
      `reversible=${interp.adversity.reversible ?? "unknown"}`,
      `magnitude=${interp.adversity.magnitudeLevel}`,
      `precursor=${interp.adversity.precursorToWorse}`,
    ];
    lines.push(`| Adversity | \`${interp.adversity.overall}\` | ${advParts.join(", ")} |`);
    const histoGradeStr = interp.histopathSeverityGrade ?? "n/a";
    lines.push(`| Regulatory significance | \`${interp.overallSeverity}\` | Cascade: certainty=${interp.certainty}, adversity=${interp.adversity.overall} |`);
    lines.push(`| Histopathologic severity | \`${histoGradeStr}\` | Max tissue grade from MI data (pathologist's morphologic grading) |`);
    lines.push(`| Recovery | \`${interp.recovery.status}\` | ${interp.recovery.summary || "No recovery data available"} |`);
    // REM-03: Show which LR+ drove the tier (endpoint-level preferred over SOC)
    const tc = interp.translationalConfidence;
    const tierSource = tc.endpointLRPlus.length > 0
      ? `endpoint LR+: ${Math.max(...tc.endpointLRPlus.map(e => e.lrPlus)).toFixed(1)} (${tc.endpointLRPlus.map(e => e.endpoint).join(", ")})`
      : `SOC LR+: ${tc.socLRPlus ?? "n/a"}`;
    lines.push(`| Translational | \`${tc.tier}\` | ${tierSource}; SOC: ${tc.primarySOC || "—"} |`);
    lines.push("");

    // Translational endpoint LR+ if available
    if (interp.translationalConfidence.endpointLRPlus.length > 0) {
      lines.push("**Endpoint-level translational evidence:**");
      lines.push("");
      lines.push("| Endpoint | LR+ | Species |");
      lines.push("|----------|-----|---------|");
      for (const ep of interp.translationalConfidence.endpointLRPlus) {
        lines.push(`| ${ep.endpoint} | ${ep.lrPlus.toFixed(1)} | ${ep.species} |`);
      }
      lines.push("");
    }

    // REM-17: TR factor-by-factor reasoning detail
    if (relatedness.reasoning && relatedness.reasoning.length > 0) {
      lines.push("**Treatment-relatedness reasoning (REM-17):**");
      lines.push("");
      lines.push("| Factor | Value | Score | Detail |");
      lines.push("|--------|-------|-------|--------|");
      for (const r of relatedness.reasoning as Array<{ factor: string; value: string; score: number; detail: string }>) {
        lines.push(`| ${r.factor} | ${r.value} | ${r.score} | ${r.detail} |`);
      }
      lines.push("");
    }

    // Discriminating findings
    if (interp.discriminatingEvidence.length > 0) {
      lines.push("**Discriminating findings:**");
      lines.push("");
      lines.push("| Endpoint | Expected | Actual | Status | Weight |");
      lines.push("|----------|----------|--------|--------|--------|");
      for (const df of interp.discriminatingEvidence) {
        lines.push(`| ${df.endpoint} | ${dirArrow(df.expectedDirection)} | ${dirArrow(df.actualDirection)} | ${df.status} | ${df.weight} |`);
      }
      lines.push("");
    }

    // REM-11: Species-preferred markers
    if (interp.speciesMarkers && (interp.speciesMarkers.present.length > 0 || interp.speciesMarkers.absent.length > 0)) {
      lines.push("**Species-specific preferred markers (REM-11):**");
      lines.push("");
      if (interp.speciesMarkers.present.length > 0) {
        lines.push(`- ✓ Measured: ${interp.speciesMarkers.present.join(", ")}`);
      }
      if (interp.speciesMarkers.absent.length > 0) {
        lines.push(`- ✗ Not measured: ${interp.speciesMarkers.absent.join(", ")}`);
      }
      if (interp.speciesMarkers.narrative) {
        lines.push(`- ${interp.speciesMarkers.narrative}`);
      }
      lines.push("");
    }

    // REM-05: Group statistics for matched endpoints
    const matchedEps = allEntries
      .filter(e => e.status === "matched" && e.matchedEndpoint)
      .map(e => epIndex.get(e.matchedEndpoint!))
      .filter((ep): ep is EndpointSummary => ep != null && ep.controlStats != null);
    if (matchedEps.length > 0) {
      lines.push("**Group statistics (REM-05):**");
      lines.push("");
      lines.push("| Endpoint | Control (n, mean±SD) | Worst Treated (n, mean±SD, dose) |");
      lines.push("|----------|---------------------|----------------------------------|");
      for (const ep of matchedEps) {
        const ctrl = ep.controlStats;
        const worst = ep.worstTreatedStats;
        const ctrlStr = ctrl && ctrl.mean != null
          ? `n=${ctrl.n}, ${ctrl.mean.toFixed(3)}±${(ctrl.sd ?? 0).toFixed(3)}`
          : "—";
        const worstStr = worst && worst.mean != null
          ? `n=${worst.n}, ${worst.mean.toFixed(3)}±${(worst.sd ?? 0).toFixed(3)} (dose ${worst.doseLevel})`
          : "—";
        lines.push(`| ${ep.endpoint_label} | ${ctrlStr} | ${worstStr} |`);
      }
      lines.push("");
    }

    // Anomaly summary
    if (anomalyCount > 0) {
      lines.push(`> **Anomaly summary:** ${anomalyCount} anomaly marker(s) detected in this syndrome. Review marked items (⚠) above.`);
      lines.push("");
    }

    // Per-syndrome review questions
    const sq = SYNDROME_REVIEW_QUESTIONS[syndrome.id];
    if (sq && sq.length > 0) {
      lines.push("**► Syndrome-specific review questions:**");
      lines.push("");
      for (const q of sq) {
        lines.push(`- [ ] ${q}`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  // ═══ Part E: Cross-Cutting Review Questions ═══

  lines.push("# Part E: Cross-Cutting Review Questions");
  lines.push("");
  lines.push("These questions span multiple syndromes and the overall interpretation framework.");
  lines.push("");
  lines.push("## Syndrome Detection");
  lines.push("");
  lines.push("- [ ] Are the 10 defined syndromes (XS01–XS10) sufficient to cover the major toxicological patterns seen in preclinical regulatory studies?");
  lines.push("- [ ] Are there important syndromes missing from the current set? Consider: cardiotoxicity markers (troponin), neurotoxicity (FOB parameters), reproductive/developmental toxicity, dermal toxicity.");
  lines.push("- [ ] Is the minimum domain count appropriate for each syndrome? Some syndromes (XS04, XS05, XS10) require only 1 domain — is single-domain detection too permissive?");
  lines.push("- [ ] Should the system consider temporal patterns (onset timing, progression) in syndrome detection, or is endpoint-level data sufficient?");
  lines.push("");
  lines.push("## Interpretation Pipeline");
  lines.push("");
  lines.push("- [ ] Is the sequential pipeline order (certainty → treatment-relatedness → adversity → severity → translational) appropriate, or should some steps run in parallel?");
  lines.push("- [ ] Should historical control data (HCD) comparison be mandatory rather than optional for treatment-relatedness assessment?");
  lines.push("- [ ] Is the current approach of running the full pipeline with empty data arrays (no histopath, no recovery, no mortality in this study fixture) valid, or should the system flag 'insufficient data' more aggressively?");
  lines.push("- [ ] Should syndromes interact — e.g., should XS08 (Stress response) finding automatically reduce certainty for other syndromes that could be secondary to stress?");
  lines.push("");
  lines.push("## Data Quality");
  lines.push("");
  lines.push("- [ ] The fixture contains only LB/BW/MI/MA/OM domain data. Should the system explicitly warn when expected domains (CL, EG, VS) are absent from the study data?");
  lines.push("- [ ] Should the system distinguish between 'not measured' (domain not in study) and 'measured but not significant' (domain present, no findings)?");
  lines.push("- [ ] How should the system handle parameters with sex-discordant results (significant in one sex, not in the other)?");
  lines.push("");
  lines.push("## Regulatory Context");
  lines.push("");
  lines.push("- [ ] Are the severity tiers (S0–S4) aligned with regulatory agency expectations (FDA, EMA, PMDA)?");
  lines.push("- [ ] Should the system produce different interpretations for different regulatory contexts (e.g., IND-enabling vs. NDA-supporting studies)?");
  lines.push("- [ ] Is the translational confidence assessment appropriately conservative for regulatory decision-making?");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*End of review document. Generated by `generate-review-packet.test.ts`.*");

  return lines.join("\n");
}

// ─── Test suite ─────────────────────────────────────────────

describe("Scientific Logic Review Packet", () => {
  test("generates review document", () => {
    const doc = generateReviewDocument();

    // Write to file
    const outPath = resolve(__dirname, "scientific-logic-review.md");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, doc, "utf-8");

    // Verify structure
    expect(doc).toContain("# Scientific Logic Review");
    expect(doc).toContain("# Part A: Syndrome Pattern Definitions");
    expect(doc).toContain("# Part B: Interpretation Framework");
    expect(doc).toContain("# Part C: Lab Clinical Significance Rules");
    expect(doc).toContain("# Part D: PointCross Worked Examples");
    expect(doc).toContain("# Part E: Cross-Cutting Review Questions");

    // Verify all 10 syndrome definitions present in Part A
    for (const sid of ["XS01", "XS02", "XS03", "XS04", "XS05", "XS06", "XS07", "XS08", "XS09", "XS10"]) {
      expect(doc).toContain(`## ${sid}:`);
    }

    // Verify detected syndromes have worked examples in Part D
    for (const s of syndromes) {
      expect(doc).toContain(`## ${s.id}: ${s.name}`);
      expect(doc).toContain("### Term-by-Term Match Evidence");
      expect(doc).toContain("### Interpretation");
    }

    // Verify lab rules section populated
    expect(doc).toContain("L01");
    expect(doc).toContain("L31");

    // Verify anomaly markers are present (at least the marker syntax)
    expect(doc).toContain("⚠");

    // Log success
    console.log(`\n  ✓ Review document written to: ${outPath}`);
    console.log(`    ${doc.split("\n").length} lines, ${doc.length} characters`);
    console.log(`    Syndromes documented: ${syndromes.map(s => s.id).join(", ")}`);
  });
});
