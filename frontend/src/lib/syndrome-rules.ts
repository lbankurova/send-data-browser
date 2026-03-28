/**
 * Concordant syndrome detection — histopathology-specific syndrome rules.
 * Rules loaded from shared/rules/histopath-syndromes.json.
 * Matching logic and detection algorithm remain in code.
 */

import type { LesionSeverityRow, SignalSummaryRow } from "@/types/analysis-views";
import type { StudyContext } from "@/types/study-context";
import histopathConfig from "../../../shared/rules/histopath-syndromes.json";

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
  /** IMP-06a: Which sex the syndrome was detected in */
  detectedInSex: "M" | "F" | "BOTH";
  /** IMP-06a: Restrict display to this sex (null = both) */
  sexRestriction: "M" | "F" | null;
  /** IMP-06b: Strain context note (e.g., "Common spontaneous finding in SD males") */
  strainNote: string | null;
  /** IMP-06b: Confidence adjustment for strain-expected findings (-0.3, -0.2, etc.) */
  confidenceAdjustment: number;
}

// ── Rules loaded from JSON ────────────────────────────────────

export const SYNDROME_RULES: SyndromeRule[] = histopathConfig.rules as SyndromeRule[];

// Legacy inline rules removed — see shared/rules/histopath-syndromes.json

// ── Strain suppressions ──────────────────────────────────────

interface StrainSuppression {
  syndrome_id: string;
  strains: string[];
  sex: "M" | "F" | null;
  confidence_adjustment: number;
  note: string;
}

const STRAIN_SUPPRESSIONS: StrainSuppression[] = histopathConfig.strain_suppressions as StrainSuppression[];

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
  studyContext?: StudyContext | null,
): SyndromeMatch[] {
  const matches: SyndromeMatch[] = [];

  for (const rule of SYNDROME_RULES) {
    // IMP-06a: Determine sex filter based on rule
    const sexRestriction: "M" | "F" | null =
      rule.sex === "M" ? "M" : rule.sex === "F" ? "F" : null;

    for (const ruleOrgan of rule.organ) {
      // Find study organs that match this rule organ
      const matchingOrgans = [...studyData.keys()].filter((studyOrgan) =>
        studyOrgan.toUpperCase().includes(ruleOrgan) ||
        ruleOrgan.includes(studyOrgan.toUpperCase()),
      );

      for (const organKey of matchingOrgans) {
        const allOrganRows = studyData.get(organKey)!;

        // IMP-06a: Sex-filter rows for sex-restricted syndromes
        const organRows = sexRestriction
          ? allOrganRows.filter((r) => r.sex === sexRestriction)
          : allOrganRows;
        if (organRows.length === 0) continue;

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
          const gradedSevs = reqRows.filter((r) => r.severity_status === "graded").map((r) => r.avg_severity!);
          const maxSev = gradedSevs.length > 0 ? Math.max(...gradedSevs) : 0;
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

        // IMP-06a: Determine detected sex
        const detectedInSex: "M" | "F" | "BOTH" = sexRestriction ?? "BOTH";

        // IMP-06b: Strain-dependent suppression
        let strainNote: string | null = null;
        let confidenceAdjustment = 0;
        if (studyContext) {
          const strain = studyContext.strain.toUpperCase();
          const suppression = STRAIN_SUPPRESSIONS.find(
            (s) =>
              s.syndrome_id === rule.syndrome_id &&
              s.strains.some((st: string) => strain.includes(st)) &&
              (s.sex === null || s.sex === detectedInSex),
          );
          if (suppression) {
            strainNote = suppression.note;
            confidenceAdjustment = suppression.confidence_adjustment;
          }

          // IMP-06c: Suppress injection site reaction for oral routes
          // @route ROUTE-01 — oral routes make injection site findings unexpected
          if (rule.syndrome_id === "injection_site_reaction") {
            const route = studyContext.route.toUpperCase();
            if (route.includes("ORAL") || route.includes("GAVAGE") || route.includes("DIET")) {
              strainNote = "Unexpected: study uses oral route — injection site findings warrant investigation";
              confidenceAdjustment = 0.2; // boost confidence — this is unusual
            }
          }
        }

        matches.push({
          syndrome: rule,
          organ: organKey,
          sex: detectedInSex === "BOTH" ? "Combined" : detectedInSex,
          requiredFinding: requiredMatch,
          supportingFindings: supportingMatches,
          concordantGroups: concordant.map(String),
          relatedOrganMatches,
          relatedEndpointMatches,
          confidenceBoost,
          exclusionWarning,
          detectedInSex,
          sexRestriction,
          strainNote,
          confidenceAdjustment,
        });
      }
    }
  }

  return matches;
}
