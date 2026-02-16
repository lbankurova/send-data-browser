/**
 * Concordant syndrome detection — 11 well-established toxicological syndromes.
 * Hardcoded rules + matching loop. No admin UI, no JSON loading.
 */

import type { LesionSeverityRow, SignalSummaryRow } from "@/types/analysis-views";

// ── Types ───────────────────────────────────────────────────

export interface SyndromeRule {
  syndrome_id: string;
  syndrome_name: string;
  organ: string[];
  sex: "M" | "F" | "both";
  required_findings: string[];
  supporting_findings: string[];
  min_supporting: number;
  exclusion_findings: string[];
  max_severity_for_required: number | null;
  related_organ_findings: {
    organ: string;
    findings: string[];
  }[];
  related_endpoints: {
    type: "organ_weight" | "clinical_observation" | "sperm_parameter";
    organ?: string;
    finding?: string;
    parameters?: string[];
    direction?: "increased" | "decreased";
  }[];
  interpretation_note: string;
}

export interface SyndromeMatch {
  syndrome: SyndromeRule;
  organ: string;
  sex: string;
  requiredFinding: string;
  supportingFindings: string[];
  concordantGroups: string[];
  relatedOrganMatches: string[];
  relatedEndpointMatches: string[];
  confidenceBoost: boolean;
  exclusionWarning: string | null;
}

// ── Hardcoded ruleset ────────────────────────────────────────

export const SYNDROME_RULES: SyndromeRule[] = [
  {
    syndrome_id: "testicular_degeneration",
    syndrome_name: "Testicular Degeneration Syndrome",
    organ: ["TESTIS"],
    sex: "M",
    required_findings: ["atrophy", "degeneration", "tubular degeneration"],
    supporting_findings: [
      "azoospermia", "aspermia", "small", "soft",
      "decreased spermatogenesis", "sertoli cell only",
      "mineralization", "giant cells",
    ],
    min_supporting: 1,
    exclusion_findings: [],
    max_severity_for_required: null,
    related_organ_findings: [
      { organ: "EPIDIDYMIS", findings: ["hypospermia", "aspermia", "oligospermia", "cell debris", "decreased sperm", "atrophy", "small"] },
      { organ: "PROSTATE", findings: ["atrophy", "decreased secretion", "small"] },
      { organ: "SEMINAL VESICLE", findings: ["atrophy", "decreased secretion", "small"] },
    ],
    related_endpoints: [
      { type: "organ_weight", organ: "TESTIS", direction: "decreased" },
      { type: "organ_weight", organ: "EPIDIDYMIS", direction: "decreased" },
    ],
    interpretation_note: "Testicular degeneration is common in rodent studies. Atrophy with secondary changes (azoospermia, reduced size/consistency) indicates tubular damage. When confined to a single dose group without dose-response, consider age-related spontaneous degeneration.",
  },
  {
    syndrome_id: "hepatotoxicity_classic",
    syndrome_name: "Hepatotoxicity (Classic Pattern)",
    organ: ["LIVER"],
    sex: "both",
    required_findings: ["necrosis", "hepatocellular necrosis", "single cell necrosis"],
    supporting_findings: [
      "hypertrophy", "hepatocellular hypertrophy", "vacuolation",
      "inflammation", "increased mitosis", "bile duct hyperplasia",
      "karyomegaly", "pigment",
    ],
    min_supporting: 1,
    exclusion_findings: [],
    max_severity_for_required: null,
    related_organ_findings: [
      { organ: "GALLBLADDER", findings: ["hyperplasia", "inflammation"] },
    ],
    related_endpoints: [
      { type: "organ_weight", organ: "LIVER", direction: "increased" },
    ],
    interpretation_note: "Classic hepatotoxicity pattern: necrosis as the primary lesion with secondary adaptive and inflammatory responses.",
  },
  {
    syndrome_id: "hepatocellular_adaptation",
    syndrome_name: "Hepatocellular Adaptation",
    organ: ["LIVER"],
    sex: "both",
    required_findings: ["hypertrophy", "hepatocellular hypertrophy"],
    supporting_findings: ["increased liver weight", "enzyme induction"],
    min_supporting: 0,
    exclusion_findings: ["necrosis", "hepatocellular necrosis", "single cell necrosis", "apoptosis", "inflammation"],
    max_severity_for_required: 2.0,
    related_organ_findings: [],
    related_endpoints: [
      { type: "organ_weight", organ: "LIVER", direction: "increased" },
    ],
    interpretation_note: "Hepatocellular hypertrophy without necrosis or inflammation typically represents enzyme induction \u2014 an adaptive, non-adverse response. If necrosis is also present, evaluate for progression to toxicity.",
  },
  {
    syndrome_id: "nephrotoxicity_tubular",
    syndrome_name: "Tubular Nephrotoxicity",
    organ: ["KIDNEY"],
    sex: "both",
    required_findings: ["tubular degeneration", "tubular necrosis", "necrosis"],
    supporting_findings: [
      "regeneration", "basophilic tubules", "casts", "dilatation",
      "mineralization", "tubular regeneration",
    ],
    min_supporting: 1,
    exclusion_findings: [],
    max_severity_for_required: null,
    related_organ_findings: [
      { organ: "URINARY BLADDER", findings: ["hyperplasia", "inflammation"] },
    ],
    related_endpoints: [
      { type: "organ_weight", organ: "KIDNEY", direction: "increased" },
    ],
    interpretation_note: "Tubular degeneration/necrosis with regenerative response indicates active nephrotoxicity.",
  },
  {
    syndrome_id: "cpn",
    syndrome_name: "Chronic Progressive Nephropathy",
    organ: ["KIDNEY"],
    sex: "both",
    required_findings: ["basophilic tubules"],
    supporting_findings: [
      "tubular regeneration", "interstitial fibrosis",
      "glomerulosclerosis", "protein casts", "chronic progressive nephropathy",
    ],
    min_supporting: 1,
    exclusion_findings: [],
    max_severity_for_required: null,
    related_organ_findings: [],
    related_endpoints: [],
    interpretation_note: "CPN is a spontaneous, age-related condition in rats. Its exacerbation by treatment is common but must be distinguished from direct nephrotoxicity.",
  },
  {
    syndrome_id: "bone_marrow_suppression",
    syndrome_name: "Bone Marrow Suppression",
    organ: ["BONE MARROW"],
    sex: "both",
    required_findings: ["hypocellularity", "decreased cellularity", "atrophy"],
    supporting_findings: ["necrosis", "hemorrhage"],
    min_supporting: 0,
    exclusion_findings: [],
    max_severity_for_required: null,
    related_organ_findings: [
      { organ: "SPLEEN", findings: ["atrophy", "decreased cellularity", "lymphoid depletion"] },
      { organ: "THYMUS", findings: ["atrophy", "decreased cellularity", "lymphoid depletion"] },
      { organ: "LYMPH NODE", findings: ["atrophy", "decreased cellularity", "lymphoid depletion"] },
    ],
    related_endpoints: [],
    interpretation_note: "Bone marrow hypocellularity with secondary lymphoid organ effects indicates systemic hematopoietic suppression.",
  },
  {
    syndrome_id: "lymphoid_depletion",
    syndrome_name: "Lymphoid Depletion",
    organ: ["SPLEEN", "THYMUS", "LYMPH NODE"],
    sex: "both",
    required_findings: ["lymphoid depletion", "atrophy", "decreased cellularity"],
    supporting_findings: ["necrosis", "apoptosis"],
    min_supporting: 0,
    exclusion_findings: [],
    max_severity_for_required: null,
    related_organ_findings: [
      { organ: "BONE MARROW", findings: ["hypocellularity", "decreased cellularity"] },
    ],
    related_endpoints: [],
    interpretation_note: "Lymphoid depletion across multiple organs suggests immunosuppression. Check for correlation with bone marrow findings.",
  },
  {
    syndrome_id: "gi_toxicity",
    syndrome_name: "Gastrointestinal Toxicity",
    organ: ["STOMACH", "INTESTINE", "DUODENUM", "JEJUNUM", "ILEUM", "CECUM", "COLON", "RECTUM"],
    sex: "both",
    required_findings: ["erosion", "ulceration", "necrosis"],
    supporting_findings: ["inflammation", "hemorrhage", "hyperplasia", "degeneration"],
    min_supporting: 1,
    exclusion_findings: [],
    max_severity_for_required: null,
    related_organ_findings: [],
    related_endpoints: [],
    interpretation_note: "Erosion/ulceration with inflammation in GI tract. Check for correlation across multiple GI segments.",
  },
  {
    syndrome_id: "cardiac_toxicity",
    syndrome_name: "Cardiac Toxicity",
    organ: ["HEART"],
    sex: "both",
    required_findings: ["degeneration", "necrosis", "myocardial degeneration", "myocardial necrosis"],
    supporting_findings: ["inflammation", "fibrosis", "vacuolation", "mineralization"],
    min_supporting: 0,
    exclusion_findings: [],
    max_severity_for_required: null,
    related_organ_findings: [],
    related_endpoints: [],
    interpretation_note: "Myocardial degeneration/necrosis is a serious finding. Even minimal severity warrants attention.",
  },
  {
    syndrome_id: "adrenal_hypertrophy",
    syndrome_name: "Adrenal Cortical Hypertrophy",
    organ: ["ADRENAL GLAND", "ADRENAL"],
    sex: "both",
    required_findings: ["cortical hypertrophy", "hypertrophy"],
    supporting_findings: ["vacuolation", "increased weight"],
    min_supporting: 0,
    exclusion_findings: [],
    max_severity_for_required: null,
    related_organ_findings: [],
    related_endpoints: [
      { type: "organ_weight", organ: "ADRENAL", direction: "increased" },
    ],
    interpretation_note: "Adrenal cortical hypertrophy may be a stress response or direct pharmacological effect.",
  },
  {
    syndrome_id: "phospholipidosis",
    syndrome_name: "Phospholipidosis",
    organ: ["LIVER", "LUNG", "KIDNEY", "LYMPH NODE", "SPLEEN"],
    sex: "both",
    required_findings: ["vacuolation", "foamy macrophages", "foamy vacuolation"],
    supporting_findings: [],
    min_supporting: 0,
    exclusion_findings: [],
    max_severity_for_required: null,
    related_organ_findings: [],
    related_endpoints: [],
    interpretation_note: "Foamy/lamellar vacuolation across multiple organs simultaneously suggests phospholipidosis \u2014 a class effect of cationic amphiphilic drugs.",
  },
];

// ── Finding name matching ────────────────────────────────────

export function findingMatches(studyFinding: string, ruleFinding: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[,_-]/g, " ").replace(/\s+/g, " ").trim();

  const a = normalize(studyFinding);
  const b = normalize(ruleFinding);

  // Exact match after normalization
  if (a === b) return true;

  // One contains the other
  if (a.includes(b) || b.includes(a)) return true;

  // Token overlap: all tokens of the shorter are in the longer
  const tokensA = a.split(" ");
  const tokensB = b.split(" ");
  const [shorter, longer] =
    tokensA.length <= tokensB.length ? [tokensA, tokensB] : [tokensB, tokensA];
  if (shorter.every((t) => longer.some((l) => l.includes(t)))) return true;

  return false;
}

// ── Detection algorithm ──────────────────────────────────────

export function detectSyndromes(
  studyData: Map<string, LesionSeverityRow[]>,
  signalData: SignalSummaryRow[] | null,
): SyndromeMatch[] {
  const matches: SyndromeMatch[] = [];

  for (const rule of SYNDROME_RULES) {
    for (const ruleOrgan of rule.organ) {
      // Find study organs that match this rule organ
      const matchingOrgans = [...studyData.keys()].filter((studyOrgan) =>
        studyOrgan.toUpperCase().includes(ruleOrgan) ||
        ruleOrgan.includes(studyOrgan.toUpperCase()),
      );

      for (const organKey of matchingOrgans) {
        const organRows = studyData.get(organKey)!;
        const organFindings = [...new Set(organRows.map((r) => r.finding))];

        // Check required findings
        const requiredMatch = organFindings.find((f) =>
          rule.required_findings.some((rf) => findingMatches(f, rf)),
        );
        if (!requiredMatch) continue;

        // Check exclusion findings
        const exclusionPresent = organFindings.some((f) =>
          rule.exclusion_findings.some((ef) => findingMatches(f, ef)),
        );

        // Check max severity for required
        if (rule.max_severity_for_required !== null) {
          const reqRows = organRows.filter((r) =>
            findingMatches(r.finding, requiredMatch),
          );
          const maxSev = Math.max(...reqRows.map((r) => r.avg_severity ?? 0));
          if (maxSev > rule.max_severity_for_required) continue;
        }

        // Check supporting findings
        const supportingMatches = organFindings.filter((f) =>
          rule.supporting_findings.some((sf) => findingMatches(f, sf)),
        );
        if (supportingMatches.length < rule.min_supporting) continue;

        // Check group concordance
        const reqGroups = new Set(
          organRows
            .filter((r) => findingMatches(r.finding, requiredMatch))
            .map((r) => r.dose_level),
        );
        const supGroups = new Set(
          organRows
            .filter((r) =>
              supportingMatches.some((sm) => findingMatches(r.finding, sm)),
            )
            .map((r) => r.dose_level),
        );
        const concordant = [...reqGroups].filter((g) => supGroups.has(g));
        if (supportingMatches.length > 0 && concordant.length === 0) continue;

        // Check related organ findings (optional, boosts confidence)
        const relatedOrganMatches: string[] = [];
        for (const rel of rule.related_organ_findings) {
          const relOrgans = [...studyData.keys()].filter(
            (o) =>
              o.toUpperCase().includes(rel.organ) ||
              rel.organ.includes(o.toUpperCase()),
          );
          for (const relOrgan of relOrgans) {
            const relRows = studyData.get(relOrgan)!;
            const relFindings = [...new Set(relRows.map((r) => r.finding))];
            const relMatch = relFindings.find((f) =>
              rel.findings.some((rf) => findingMatches(f, rf)),
            );
            if (relMatch) relatedOrganMatches.push(`${relOrgan}: ${relMatch}`);
          }
        }

        // Check related endpoints (organ weight, etc.)
        const relatedEndpointMatches: string[] = [];
        if (signalData) {
          for (const rel of rule.related_endpoints) {
            if (rel.type === "organ_weight" && rel.organ) {
              const owMatch = signalData.find(
                (s) =>
                  s.domain === "OM" &&
                  s.organ_system?.toUpperCase().includes(rel.organ!.toUpperCase()) &&
                  (rel.direction === "decreased"
                    ? s.direction === "down"
                    : s.direction === "up") &&
                  s.p_value !== null &&
                  s.p_value < 0.05,
              );
              if (owMatch) {
                relatedEndpointMatches.push(
                  `${rel.organ} weight ${rel.direction} (p=${owMatch.p_value!.toFixed(4)})`,
                );
              }
            }
          }
        }

        const confidenceBoost =
          supportingMatches.length >= 2 ||
          relatedOrganMatches.length >= 1 ||
          relatedEndpointMatches.length >= 1;

        const exclusionWarning = exclusionPresent
          ? `\u26A0 ${rule.exclusion_findings
              .filter((ef) => organFindings.some((f) => findingMatches(f, ef)))
              .join(", ")} also present \u2014 evaluate for progression`
          : null;

        matches.push({
          syndrome: rule,
          organ: organKey,
          sex: "Combined",
          requiredFinding: requiredMatch,
          supportingFindings: supportingMatches,
          concordantGroups: concordant.map(String),
          relatedOrganMatches,
          relatedEndpointMatches,
          confidenceBoost,
          exclusionWarning,
        });
      }
    }
  }

  return matches;
}
