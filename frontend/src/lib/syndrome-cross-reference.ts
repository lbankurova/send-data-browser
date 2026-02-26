/**
 * Syndrome Cross-Reference Module
 *
 * Histopathology cross-referencing, recovery assessment,
 * clinical observation correlation, and study design notes.
 *
 * Extracted from syndrome-interpretation.ts for module ergonomics.
 */

import type { EndpointSummary } from "@/lib/derive-summaries";
import type { CrossDomainSyndrome } from "@/lib/cross-domain-syndromes";
import { getSyndromeDefinition } from "@/lib/cross-domain-syndromes";
import type { LesionSeverityRow } from "@/types/analysis-views";
import type { StudyContext } from "@/types/study-context";
import { SYNDROME_CL_CORRELATES } from "@/lib/syndrome-interpretation-types";
import type {
  SyndromeDiscriminators,
  HistopathCrossRef,
  HistopathObservation,
  SyndromeRecoveryAssessment,
  EndpointRecovery,
  ClinicalObservationSupport,
  ClinicalObservation,
  RecoveryRow,
  FoodConsumptionSummaryResponse,
} from "@/lib/syndrome-interpretation-types";
import {
  annotateWithProxy,
  checkFindingWithProxies,
  classifyFindingDoseResponse,
} from "@/lib/syndrome-certainty";

// ─── Private helpers ──────────────────────────────────────

/** BW-relevant syndromes that benefit from food consumption context. */
const BW_RELEVANT_SYNDROMES = new Set(["XS07", "XS08", "XS09"]);

/**
 * Get expected histopath findings for a specimen from discriminators.
 */
function getExpectedFindings(
  discriminators: SyndromeDiscriminators,
  specimen: string,
): string[] {
  const findings: string[] = [];
  for (const disc of discriminators.findings) {
    if ((disc.source === "MI" || disc.source === "MA") && disc.endpoint.includes("::")) {
      const [spec, finding] = disc.endpoint.split("::");
      if (
        spec.toUpperCase() === specimen.toUpperCase() ||
        specimen.toUpperCase().includes(spec.toUpperCase())
      ) {
        if (disc.expectedDirection === "up") {
          findings.push(finding.trim());
        }
      }
    }
  }
  return findings;
}

/**
 * Get findings that the differential syndrome would expect (opposite expectations).
 */
function getDifferentialExpected(
  discriminators: SyndromeDiscriminators,
  specimen: string,
): string[] {
  const findings: string[] = [];
  for (const disc of discriminators.findings) {
    if ((disc.source === "MI" || disc.source === "MA") && disc.endpoint.includes("::")) {
      const [spec, finding] = disc.endpoint.split("::");
      if (
        spec.toUpperCase() === specimen.toUpperCase() ||
        specimen.toUpperCase().includes(spec.toUpperCase())
      ) {
        // If we expect it DOWN (absent), the differential expects it UP (present)
        if (disc.expectedDirection === "down") {
          findings.push(finding.trim());
        }
      }
    }
  }
  return findings;
}

/**
 * Check if CL observations show dose-dependent incidence.
 */
function isDoseDependentCL(observations: ClinicalObservation[]): boolean {
  if (observations.length < 2) return false;
  const byDose = new Map<number, number>();
  for (const obs of observations) {
    const rate = obs.totalN > 0 ? obs.incidence / obs.totalN : 0;
    byDose.set(obs.doseGroup, Math.max(byDose.get(obs.doseGroup) ?? 0, rate));
  }
  const sorted = [...byDose.entries()].sort((a, b) => a[0] - b[0]);
  if (sorted.length < 2) return false;
  // Simple: higher doses have higher incidence
  return sorted[sorted.length - 1][1] > sorted[0][1];
}

// ─── Component 2: Histopath cross-reference ────────────────

/**
 * Cross-reference histopath findings for specimens related to a syndrome.
 */
export function crossReferenceHistopath(
  syndrome: CrossDomainSyndrome,
  discriminators: SyndromeDiscriminators,
  histopathData: LesionSeverityRow[],
): HistopathCrossRef[] {
  // Collect specimens from discriminators (MI/MA sources)
  const specimens = new Set<string>();

  for (const disc of discriminators.findings) {
    if (disc.source === "MI" || disc.source === "MA") {
      if (disc.endpoint.includes("::")) {
        const specimen = disc.endpoint.split("::")[0];
        specimens.add(specimen.toUpperCase());
      }
    }
  }

  // Also add specimens from the syndrome's MI/MA matched endpoints
  const synDef = getSyndromeDefinition(syndrome.id);
  if (synDef) {
    for (const term of synDef.terms) {
      if (
        (term.domain === "MI" || term.domain === "MA") &&
        term.specimenTerms
      ) {
        for (const spec of term.specimenTerms.specimen) {
          specimens.add(spec.toUpperCase());
        }
      }
    }
  }

  if (specimens.size === 0) return [];

  const results: HistopathCrossRef[] = [];

  for (const specimen of specimens) {
    const specimenRows = histopathData.filter((r) =>
      (r.specimen ?? "").toUpperCase().includes(specimen),
    );

    const expectedFindings = getExpectedFindings(discriminators, specimen);

    if (specimenRows.length === 0) {
      results.push({
        specimen,
        examined: false,
        expectedFindings,
        observedFindings: [],
        assessment: "not_examined",
      });
      continue;
    }

    // Catalog all findings for this specimen
    const findingNames = [...new Set(specimenRows.map((r) => r.finding ?? ""))].filter(Boolean);
    const differentialExpected = getDifferentialExpected(
      discriminators,
      specimen,
    );

    const observations: HistopathObservation[] = findingNames.map((finding) => {
      const rows = specimenRows.filter((r) => r.finding === finding);
      const maxSev = Math.max(...rows.map((r) => r.avg_severity ?? 0));
      const maxInc = Math.max(
        ...rows.map((r) => (r.n > 0 ? r.affected / r.n : 0)),
      );

      const isExpected = expectedFindings.some((e) =>
        finding.toUpperCase().includes(e.toUpperCase()),
      );
      const isUnexpected = differentialExpected.some((e) =>
        finding.toUpperCase().includes(e.toUpperCase()),
      );

      const obs: HistopathObservation = {
        finding,
        peakSeverity: maxSev,
        peakIncidence: maxInc,
        doseResponse: classifyFindingDoseResponse(rows),
        relevance: isExpected
          ? "expected"
          : isUnexpected
            ? "unexpected"
            : "neutral",
      };

      return annotateWithProxy(obs);
    });

    // Assess: do the histopath findings support this syndrome?
    let directSupport = 0;
    let proxySupport = 0;
    let proxyAgainst = 0;

    for (const ef of expectedFindings) {
      const result = checkFindingWithProxies(ef, observations);
      if (result.found && result.direct) directSupport++;
      else if (result.found && !result.direct) proxySupport++;
      else if (!result.found && result.proxyMatch) proxyAgainst++;
    }

    const unexpectedPresent = observations.filter(
      (o) => o.relevance === "unexpected" && o.peakIncidence > 0,
    );

    let assessment: HistopathCrossRef["assessment"];
    if (
      directSupport + proxySupport > 0 &&
      unexpectedPresent.length === 0 &&
      proxyAgainst === 0
    ) {
      assessment = "supports";
    } else if (unexpectedPresent.length > 0 || proxyAgainst > 0) {
      if (directSupport + proxySupport > 0) {
        assessment = "inconclusive";
      } else {
        assessment = "argues_against";
      }
    } else {
      assessment = "inconclusive";
    }

    results.push({
      specimen,
      examined: true,
      expectedFindings,
      observedFindings: observations,
      assessment,
    });
  }

  return results;
}

// ─── Component 3: Recovery assessment ──────────────────────

/**
 * Assess recovery status for a syndrome's matched endpoints.
 */
// @field FIELD-06 — syndrome-level recovery status roll-up
// @field FIELD-28 — per-endpoint recovery entries
export function assessSyndromeRecovery(
  syndrome: CrossDomainSyndrome,
  recoveryData: RecoveryRow[],
  terminalEndpoints: EndpointSummary[],
  foodConsumptionData?: FoodConsumptionSummaryResponse,
): SyndromeRecoveryAssessment {
  if (recoveryData.length === 0) {
    // For BW-relevant syndromes, check food consumption recovery data as fallback
    if (
      foodConsumptionData?.recovery?.available &&
      BW_RELEVANT_SYNDROMES.has(syndrome.id)
    ) {
      const { fw_recovered, bw_recovered } = foodConsumptionData.recovery;
      let status: SyndromeRecoveryAssessment["status"];
      let summary: string;
      if (fw_recovered && bw_recovered) {
        status = "recovered";
        summary = "Food consumption and body weight both recovered.";
      } else if (!fw_recovered && !bw_recovered) {
        status = "not_recovered";
        summary = "Neither food consumption nor body weight recovered.";
      } else {
        status = "partial";
        summary = fw_recovered
          ? "Food consumption recovered but body weight remained depressed."
          : "Body weight recovered but food consumption remained depressed.";
      }
      return { status, endpoints: [], summary };
    }
    return {
      status: "not_examined",
      endpoints: [],
      summary: "Recovery not examined in this study.",
    };
  }

  const endpointRecoveries: EndpointRecovery[] = [];

  for (const ep of syndrome.matchedEndpoints) {
    const terminal = terminalEndpoints.find(
      (e) => e.endpoint_label === ep.endpoint_label,
    );
    if (!terminal) continue;

    const recoveryRows = recoveryData.filter(
      (r) => r.endpoint_label === ep.endpoint_label,
    );

    if (recoveryRows.length === 0) {
      endpointRecoveries.push({
        label: ep.endpoint_label,
        canonical: ep.endpoint_label,
        sex: "Both",
        terminalEffect: terminal.maxEffectSize ?? 0,
        recoveryEffect: null,
        recoveryPValue: null,
        status: "not_examined",
        recoveryDay: null,
      });
      continue;
    }

    // Per-sex recovery assessment
    const sexes = [...new Set(recoveryRows.map((r) => r.sex))];
    for (const sex of sexes) {
      const sexRecoveryRows = recoveryRows.filter((r) => r.sex === sex);
      const highDoseRecovery = sexRecoveryRows.reduce((best, r) =>
        r.dose_level > best.dose_level ? r : best,
      );

      const terminalEffect = terminal.maxEffectSize ?? 0;
      const recoveryEffect = highDoseRecovery.effect_size;
      const recoveryP = highDoseRecovery.p_value;

      let status: EndpointRecovery["status"];
      if (recoveryP == null) {
        status = "not_examined";
      } else if (recoveryP >= 0.05) {
        if (
          recoveryEffect != null &&
          terminalEffect !== 0 &&
          Math.abs(recoveryEffect) > Math.abs(terminalEffect) * 0.33
        ) {
          status = "partial";
        } else {
          status = "recovered";
        }
      } else if (
        recoveryEffect != null &&
        Math.abs(recoveryEffect) < Math.abs(terminalEffect) * 0.5
      ) {
        status = "partial";
      } else {
        status = "not_recovered";
      }

      endpointRecoveries.push({
        label: ep.endpoint_label,
        canonical: ep.endpoint_label,
        sex,
        terminalEffect,
        recoveryEffect,
        recoveryPValue: recoveryP,
        status,
        recoveryDay: highDoseRecovery.recovery_day,
      });
    }
  }

  // Overall syndrome recovery status
  const statuses = endpointRecoveries.map((r) => r.status);
  const uniqueStatuses = new Set(statuses.filter((s) => s !== "not_examined"));

  let overallStatus: SyndromeRecoveryAssessment["status"];
  if (uniqueStatuses.size === 0) {
    overallStatus = "not_examined";
  } else if (uniqueStatuses.size === 1) {
    overallStatus = [...uniqueStatuses][0] as SyndromeRecoveryAssessment["status"];
  } else {
    overallStatus = "mixed";
  }

  const recovered = endpointRecoveries.filter((r) => r.status === "recovered");
  const partial = endpointRecoveries.filter((r) => r.status === "partial");
  const notRecovered = endpointRecoveries.filter(
    (r) => r.status === "not_recovered",
  );

  let summary: string;
  if (overallStatus === "recovered") {
    summary = `All syndrome endpoints recovered by Day ${endpointRecoveries[0]?.recoveryDay}.`;
  } else if (overallStatus === "not_examined") {
    summary = "Recovery not examined in this study.";
  } else if (overallStatus === "not_recovered") {
    summary =
      `Effects persisted at recovery timepoint (Day ${endpointRecoveries[0]?.recoveryDay}). ` +
      `Irreversible or longer recovery period needed.`;
  } else {
    const parts: string[] = [];
    if (recovered.length > 0) {
      parts.push(
        `${recovered.map((r) => r.canonical).join(", ")} recovered`,
      );
    }
    if (partial.length > 0) {
      parts.push(
        `${partial.map((r) => r.canonical).join(", ")} partially recovered`,
      );
    }
    if (notRecovered.length > 0) {
      parts.push(
        `${notRecovered.map((r) => r.canonical).join(", ")} did not recover`,
      );
    }
    summary = parts.join(". ") + ".";
  }

  return { status: overallStatus, endpoints: endpointRecoveries, summary };
}

// ─── Phase C: CL clinical observation support ──────────────

/**
 * Assess whether clinical observations correlate with syndrome expectations.
 */
export function assessClinicalObservationSupport(
  syndromeId: string,
  clinicalObservations: ClinicalObservation[],
): ClinicalObservationSupport {
  const expected = SYNDROME_CL_CORRELATES[syndromeId];
  if (!expected || clinicalObservations.length === 0) {
    return { correlatingObservations: [], assessment: "no_cl_data" };
  }

  const correlating = expected.expectedObservations
    .map((obs, i) => {
      const found = clinicalObservations.filter((c) =>
        c.observation.toUpperCase().includes(obs),
      );
      return {
        observation: obs,
        tier: expected.tier[i],
        expectedForSyndrome: true,
        incidenceDoseDependent: found.length > 0 && isDoseDependentCL(found),
      };
    })
    .filter((c) => c.incidenceDoseDependent);

  return {
    correlatingObservations: correlating,
    assessment: correlating.length >= 1 ? "strengthens" : "neutral",
  };
}

// ─── Component 7: Study design notes ────────────────────────

/**
 * Assemble study-design caveats relevant to a specific syndrome.
 * Rules are species-agnostic; interpretation is species-aware.
 */
export function assembleStudyDesignNotes(
  syndrome: CrossDomainSyndrome,
  studyContext: StudyContext,
): string[] {
  const notes: string[] = [];

  // ECG interpretation caveats — species-aware QTc relevance
  if (syndrome.id === "XS10") {
    const ecg = studyContext.ecgInterpretation;
    if (!ecg.qtcTranslational) {
      notes.push(
        `${studyContext.species || "This species"} has Ito-dominated cardiac repolarization — ` +
        `QTc changes have limited translational value to human arrhythmia risk. ` +
        `Interpret ECG findings as mechanistic signals, not direct safety predictors.`,
      );
    } else {
      if (ecg.preferredCorrection) {
        notes.push(
          `QTc correction: ${ecg.preferredCorrection} formula is preferred for ` +
          `${studyContext.species?.toLowerCase() || "this species"}. ${ecg.rationale}`,
        );
      }
      const species = (studyContext.species ?? "").toUpperCase();
      if (species === "DOG" || species === "BEAGLE") {
        notes.push(
          "Dog ECG: body temperature affects QTc (~14 ms per \u00B0C). " +
          "Verify temperature-corrected intervals if animals were under anesthesia.",
        );
      }
    }
  }

  // ── Strain-specific ──

  // @strain STRAIN-01-F344 — high background mononuclear cell leukemia (~38% males)
  if (["XS04", "XS05"].includes(syndrome.id)) {
    const strain = studyContext.strain.toUpperCase();
    if (strain.includes("FISCHER") || strain.includes("F344")) {
      notes.push(
        "Fischer 344 rats have high background mononuclear cell leukemia (~38% males). " +
        "Interpret hematology findings in context of strain predisposition.",
      );
    }
  }

  // ── Duration-specific ──

  const duration = studyContext.dosingDurationWeeks;
  if (duration != null && duration <= 13) {
    const hasMiFindings = syndrome.matchedEndpoints.some(
      (ep) => ep.domain === "MI",
    );
    if (hasMiFindings) {
      const neoTerms = /carcinom|adenom|tumor|neoplas/i;
      const hasNeo = syndrome.matchedEndpoints.some(
        (ep) => ep.domain === "MI" && neoTerms.test(ep.endpoint_label),
      );
      if (hasNeo) {
        notes.push(
          `Neoplastic findings at ${duration} weeks are extremely rare ` +
          `spontaneously in ${studyContext.strain || studyContext.species}. ` +
          `Any tumors are likely treatment-related.`,
        );
      }
    }
  }

  // ── Route-specific ──

  // @route ROUTE-01 — gavage can cause local GI irritation distinct from systemic toxicity
  if (studyContext.route?.toUpperCase().includes("GAVAGE")) {
    if (syndrome.id === "XS08") {
      notes.push(
        "Oral gavage route: GI tract findings may include route-related irritation. " +
        "Distinguish local (esophagus, forestomach) from systemic (small intestine, colon) effects.",
      );
    }
  }

  // ── Recovery arm ──

  if (studyContext.recoveryPeriodDays != null && studyContext.recoveryPeriodDays > 0) {
    const weeks = Math.round(studyContext.recoveryPeriodDays / 7);
    notes.push(
      `Recovery period: ${weeks > 0 ? `${weeks} week${weeks !== 1 ? "s" : ""}` : `${studyContext.recoveryPeriodDays} days`}. ` +
      `Reversibility data available — see Recovery section.`,
    );
  }

  return notes;
}
