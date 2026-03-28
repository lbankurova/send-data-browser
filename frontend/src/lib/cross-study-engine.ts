/**
 * Cross-Study Intelligence Engine — Pipeline 2.
 *
 * Consumes StudySummaryRecord objects ONLY. Never touches raw SEND data,
 * evidence bundles, or single-study pipeline internals.
 *
 * Architecture: Program Index → Comparability Engine → Pattern Evaluators → Program Synthesizer
 *
 * @see docs/_internal/incoming/sendex-cross-study-spec.md
 * @see docs/_internal/incoming/scalability-architecture-plan.md
 */

import type { StudySummaryRecord, Program } from "@/types/pipeline-contracts";
import kmFactors from "../../../shared/config/km-factors.json";

// ─── Types ──────────────────────────────────────────────────

export interface PatternResult {
  pattern_id: string;
  pattern_name: string;
  classification: string;
  studies_compared: string[];
  details: Record<string, unknown>;
  confidence_notes: string[];
}

export interface WatchlistItem {
  priority: 1 | 2;
  organ_system: string;
  parameters: string[];
  seen_in: string[];
  not_confirmed_in: string[];
  onset_context: string | null;
  severity_at_loael: string | null;
}

export interface NoaelReconciliation {
  study_id: string;
  species: string;
  noael_dose: number | null;
  noael_unit: string;
  hed: number | null;
  most_sensitive: boolean;
}

export interface ProgramConclusion {
  program_id: string;
  compound_name: string;
  studies_analyzed: string[];
  pattern_results: PatternResult[];
  program_noael: NoaelReconciliation[] | null;
  watchlist: WatchlistItem[];
}

// ─── Comparability checks ───────────────────────────────────

function sameSpecies(a: StudySummaryRecord, b: StudySummaryRecord): boolean {
  return a.species.toUpperCase() === b.species.toUpperCase();
}

function sameRoute(a: StudySummaryRecord, b: StudySummaryRecord): boolean {
  return a.route.toUpperCase() === b.route.toUpperCase();
}

function doseLevelsOverlap(a: StudySummaryRecord, b: StudySummaryRecord): boolean {
  const setA = new Set(a.dose_levels);
  return b.dose_levels.some((d) => setA.has(d));
}

// ─── Pattern: XSI_CONCORDANCE ───────────────────────────────

function evaluateConcordance(
  anchor: StudySummaryRecord,
  references: StudySummaryRecord[],
): PatternResult | null {
  const crossSpecies = references.filter((r) => !sameSpecies(anchor, r));
  if (crossSpecies.length === 0) return null;

  const anchorOrgans = new Set(anchor.target_organs.map((o) => o.organ_system.toUpperCase()));
  const shared: string[] = [];
  const anchorOnly: string[] = [];
  const allRefOrgans = new Set<string>();

  for (const ref of crossSpecies) {
    for (const o of ref.target_organs) {
      allRefOrgans.add(o.organ_system.toUpperCase());
    }
  }

  for (const organ of anchorOrgans) {
    if (allRefOrgans.has(organ)) shared.push(organ);
    else anchorOnly.push(organ);
  }

  const classification = shared.length > 0
    ? "CONCORDANCE_CONFIRMED"
    : anchorOrgans.size > 0
      ? "SPECIES_LIMITED"
      : "NOT_DETECTED";

  const notes: string[] = [];
  if (!crossSpecies.every((r) => sameRoute(anchor, r))) {
    notes.push("Route differs between studies — non-concordance may reflect route-dependent exposure differences");
  }
  if (crossSpecies.some((r) => !doseLevelsOverlap(anchor, r))) {
    notes.push("Dose ranges do not overlap — non-concordance may reflect dose ceiling");
  }

  return {
    pattern_id: "XSI_CONCORDANCE",
    pattern_name: "Cross-Species Target Organ Concordance",
    classification,
    studies_compared: [anchor.study_id, ...crossSpecies.map((r) => r.study_id)],
    details: { shared_organs: shared, anchor_only: anchorOnly },
    confidence_notes: notes,
  };
}

// ─── Pattern: XSI_DURATION ──────────────────────────────────

function evaluateDuration(
  anchor: StudySummaryRecord,
  references: StudySummaryRecord[],
): PatternResult[] {
  const results: PatternResult[] = [];
  const sameSpeciesRefs = references.filter(
    (r) => sameSpecies(anchor, r) && sameRoute(anchor, r) && r.study_id !== anchor.study_id,
  );

  for (const ref of sameSpeciesRefs) {
    if (!doseLevelsOverlap(anchor, ref)) continue;

    const anchorWeeks = anchor.duration_weeks ?? 0;
    const refWeeks = ref.duration_weeks ?? 0;
    const [shorter, longer] = anchorWeeks <= refWeeks ? [anchor, ref] : [ref, anchor];

    const shorterSyndromes = new Set(shorter.detected_syndromes.map((s) => s.syndrome_id));
    const longerSyndromes = new Map(longer.detected_syndromes.map((s) => [s.syndrome_id, s]));

    for (const ss of shorter.detected_syndromes) {
      const ls = longerSyndromes.get(ss.syndrome_id);
      let classification: string;

      if (!ls) {
        classification = "RESOLVED";
      } else {
        const sevOrder = ["minimal", "mild", "moderate", "marked", "severe"];
        const shortSev = sevOrder.indexOf(ss.severity.toLowerCase());
        const longSev = sevOrder.indexOf(ls.severity.toLowerCase());
        if (longSev > shortSev) classification = "PROGRESSIVE";
        else if (longSev < shortSev) classification = "ADAPTIVE";
        else classification = "STABLE";
      }

      results.push({
        pattern_id: "XSI_DURATION",
        pattern_name: "Duration Escalation Trajectory",
        classification,
        studies_compared: [shorter.study_id, longer.study_id],
        details: {
          syndrome_id: ss.syndrome_id,
          target_organ: ss.target_organ,
          shorter_duration_weeks: shorter.duration_weeks,
          longer_duration_weeks: longer.duration_weeks,
          shorter_severity: ss.severity,
          longer_severity: ls?.severity ?? "not_detected",
        },
        confidence_notes: [],
      });
    }

    // Check for EMERGENT — in longer but not shorter
    for (const [sid, ls] of longerSyndromes) {
      if (!shorterSyndromes.has(sid)) {
        results.push({
          pattern_id: "XSI_DURATION",
          pattern_name: "Duration Escalation Trajectory",
          classification: "EMERGENT",
          studies_compared: [shorter.study_id, longer.study_id],
          details: {
            syndrome_id: sid,
            target_organ: ls.target_organ,
            shorter_duration_weeks: shorter.duration_weeks,
            longer_duration_weeks: longer.duration_weeks,
            shorter_severity: "not_detected",
            longer_severity: ls.severity,
          },
          confidence_notes: [],
        });
      }
    }
  }

  return results;
}

// ─── Pattern: XSI_NOAEL ────────────────────────────────────

function evaluateNoael(
  studies: StudySummaryRecord[],
): NoaelReconciliation[] {
  const humanKm = kmFactors.human_km;
  const speciesKm = kmFactors.species as Record<string, { km: number }>;

  return studies
    .filter((s) => s.combined_noael !== null)
    .map((s) => {
      const noaelDose = s.combined_noael!.dose_value;
      const sp = s.species.toLowerCase();
      const km = speciesKm[sp]?.km ?? speciesKm["rat"]?.km ?? 6;
      const hed = noaelDose !== null ? noaelDose * (km / humanKm) : null;

      return {
        study_id: s.study_id,
        species: s.species,
        noael_dose: noaelDose,
        noael_unit: s.combined_noael!.dose_unit,
        hed,
        most_sensitive: false,
      };
    })
    .sort((a, b) => (a.hed ?? Infinity) - (b.hed ?? Infinity))
    .map((r, i) => ({ ...r, most_sensitive: i === 0 }));
}

// ─── Pattern: XSI_WATCHLIST ─────────────────────────────────

function evaluateWatchlist(
  submittedStudies: StudySummaryRecord[],
): WatchlistItem[] {
  const organCount = new Map<string, { seenIn: string[]; params: Set<string> }>();

  for (const s of submittedStudies) {
    for (const to of s.target_organs) {
      const organ = to.organ_system.toUpperCase();
      const entry = organCount.get(organ) ?? { seenIn: [], params: new Set() };
      entry.seenIn.push(s.study_id);
      for (const syn of s.detected_syndromes) {
        if (syn.target_organ.toUpperCase() === organ) {
          syn.affected_parameters.forEach((p) => entry.params.add(p));
        }
      }
      organCount.set(organ, entry);
    }
  }

  return [...organCount.entries()].map(([organ, data]) => ({
    priority: data.seenIn.length >= 2 ? 1 : 2,
    organ_system: organ,
    parameters: [...data.params],
    seen_in: data.seenIn,
    not_confirmed_in: [],
    onset_context: null,
    severity_at_loael: null,
  }));
}

// ─── Pattern: XSI_NOVEL ────────────────────────────────────

function evaluateNovel(
  anchor: StudySummaryRecord,
  priorStudies: StudySummaryRecord[],
): PatternResult[] {
  const results: PatternResult[] = [];
  const priorSyndromeIds = new Set<string>();
  const priorSameSpecies = new Set<string>();

  for (const s of priorStudies) {
    for (const syn of s.detected_syndromes) {
      priorSyndromeIds.add(syn.syndrome_id);
      if (sameSpecies(anchor, s)) priorSameSpecies.add(syn.syndrome_id);
    }
  }

  for (const syn of anchor.detected_syndromes) {
    let classification: string;
    if (priorSameSpecies.has(syn.syndrome_id)) {
      const count = priorStudies.filter(
        (s) => sameSpecies(anchor, s) && s.detected_syndromes.some((ss) => ss.syndrome_id === syn.syndrome_id),
      ).length;
      classification = count >= 2 ? "KNOWN_CONFIRMED" : "KNOWN_SINGLE";
    } else if (priorSyndromeIds.has(syn.syndrome_id)) {
      classification = "KNOWN_SINGLE";
    } else {
      classification = "NOVEL_ALL_SPECIES";
    }

    results.push({
      pattern_id: "XSI_NOVEL",
      pattern_name: "Novel Finding Flag",
      classification,
      studies_compared: [anchor.study_id, ...priorStudies.map((s) => s.study_id)],
      details: { syndrome_id: syn.syndrome_id, target_organ: syn.target_organ },
      confidence_notes: [],
    });
  }

  return results;
}

// ─── Pattern: XSI_RECOVERY ──────────────────────────────────

function evaluateRecovery(
  studies: StudySummaryRecord[],
): PatternResult[] {
  const results: PatternResult[] = [];
  const syndromeRecovery = new Map<string, Array<{ study_id: string; species: string; status: string }>>();

  for (const s of studies) {
    for (const [synId, status] of Object.entries(s.recovery_outcomes)) {
      const entries = syndromeRecovery.get(synId) ?? [];
      entries.push({ study_id: s.study_id, species: s.species, status });
      syndromeRecovery.set(synId, entries);
    }
  }

  for (const [synId, entries] of syndromeRecovery) {
    if (entries.length < 2) continue;
    const statuses = new Set(entries.map((e) => e.status));
    const species = new Set(entries.map((e) => e.species.toUpperCase()));

    let classification: string;
    if (statuses.size === 1) {
      classification = "CONSISTENT_RECOVERY";
    } else if (species.size > 1) {
      classification = "SPECIES_DIVERGENT";
    } else {
      classification = "DURATION_DEPENDENT";
    }

    results.push({
      pattern_id: "XSI_RECOVERY",
      pattern_name: "Reversibility Comparison",
      classification,
      studies_compared: entries.map((e) => e.study_id),
      details: { syndrome_id: synId, entries },
      confidence_notes: [],
    });
  }

  return results;
}

// ─── Pattern: XSI_SEVERITY ──────────────────────────────────

function evaluateSeverity(
  studies: StudySummaryRecord[],
): PatternResult[] {
  const results: PatternResult[] = [];
  const syndromeSeverity = new Map<string, Array<{ study_id: string; species: string; severity: string }>>();

  for (const s of studies) {
    for (const syn of s.detected_syndromes) {
      const entries = syndromeSeverity.get(syn.syndrome_id) ?? [];
      entries.push({ study_id: s.study_id, species: s.species, severity: syn.severity });
      syndromeSeverity.set(syn.syndrome_id, entries);
    }
  }

  for (const [synId, entries] of syndromeSeverity) {
    if (entries.length < 2) continue;
    const severities = new Set(entries.map((e) => e.severity));
    const species = new Set(entries.map((e) => e.species.toUpperCase()));

    let classification: string;
    if (severities.size === 1) {
      classification = "CONCORDANT";
    } else if (species.size > 1) {
      classification = "SPECIES_DIVERGENT";
    } else {
      classification = "DOSE_DEPENDENT";
    }

    results.push({
      pattern_id: "XSI_SEVERITY",
      pattern_name: "Severity Grade Comparison",
      classification,
      studies_compared: entries.map((e) => e.study_id),
      details: { syndrome_id: synId, entries },
      confidence_notes: [],
    });
  }

  return results;
}

// ─── Main entry point: Mode 1 (Anchor Comparison) ──────────

/**
 * Run all cross-study patterns in anchor comparison mode.
 * The anchor study is compared against reference studies.
 *
 * All inputs are StudySummaryRecord — never raw SEND data.
 */
export function analyzeProgram(
  anchor: StudySummaryRecord,
  references: StudySummaryRecord[],
  program: Program,
): ProgramConclusion {
  const allStudies = [anchor, ...references];
  const submittedStudies = allStudies.filter((s) => s.study_stage === "SUBMITTED");
  const patternResults: PatternResult[] = [];

  // XSI_CONCORDANCE: cross-species target organ comparison
  const concordance = evaluateConcordance(anchor, references);
  if (concordance) patternResults.push(concordance);

  // XSI_DURATION: severity trajectory across durations
  patternResults.push(...evaluateDuration(anchor, references));

  // XSI_NOVEL: novel finding detection
  patternResults.push(...evaluateNovel(anchor, references));

  // XSI_RECOVERY: reversibility comparison
  patternResults.push(...evaluateRecovery(allStudies));

  // XSI_SEVERITY: severity grade comparison
  patternResults.push(...evaluateSeverity(allStudies));

  // XSI_NOAEL: program NOAEL reconciliation
  const noaelReconciliation = evaluateNoael(allStudies);

  // XSI_WATCHLIST: monitoring watchlist from submitted studies
  const watchlist = evaluateWatchlist(submittedStudies);

  return {
    program_id: program.id,
    compound_name: program.compound,
    studies_analyzed: allStudies.map((s) => s.study_id),
    pattern_results: patternResults,
    program_noael: noaelReconciliation.length > 0 ? noaelReconciliation : null,
    watchlist,
  };
}
