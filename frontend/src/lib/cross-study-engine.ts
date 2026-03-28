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

// ─── Pattern: XSI_EXPOSURE (Phase 7) ────────────────────────

export interface ExposureComparison {
  study_id: string;
  species: string;
  noael_dose: number | null;
  noael_unit: string;
  auc_at_noael: number | null;
  cmax_at_noael: number | null;
  tk_unit: string | null;
  hed: number | null;
  auc_margin: number | null;
}

function evaluateExposure(
  studies: StudySummaryRecord[],
  clinicalDose?: { auc?: number; cmax?: number; unit?: string } | null,
): { comparisons: ExposureComparison[]; pattern: PatternResult | null } {
  const humanKm = kmFactors.human_km;
  const speciesKm = kmFactors.species as Record<string, { km: number }>;

  const comparisons: ExposureComparison[] = studies
    .filter((s) => s.combined_noael !== null)
    .map((s) => {
      const noaelDose = s.combined_noael!.dose_value;
      const sp = s.species.toLowerCase();
      const km = speciesKm[sp]?.km ?? speciesKm["rat"]?.km ?? 6;
      const hed = noaelDose !== null ? noaelDose * (km / humanKm) : null;
      const aucMargin = s.auc_at_noael !== null && clinicalDose?.auc
        ? s.auc_at_noael / clinicalDose.auc
        : null;

      return {
        study_id: s.study_id,
        species: s.species,
        noael_dose: noaelDose,
        noael_unit: s.combined_noael!.dose_unit,
        auc_at_noael: s.auc_at_noael,
        cmax_at_noael: s.cmax_at_noael,
        tk_unit: s.tk_unit,
        hed,
        auc_margin: aucMargin,
      };
    })
    .sort((a, b) => (a.hed ?? Infinity) - (b.hed ?? Infinity));

  // Only produce a pattern result if TK data exists in at least one study
  const withTk = comparisons.filter((c) => c.auc_at_noael !== null);
  if (withTk.length === 0) {
    return { comparisons, pattern: null };
  }

  const notes: string[] = [];
  if (withTk.length < comparisons.length) {
    notes.push(`TK data available for ${withTk.length} of ${comparisons.length} studies — dose-based comparison used for studies without TK`);
  }
  if (!clinicalDose?.auc) {
    notes.push("No clinical AUC provided — AUC-based safety margin not computed. Enter proposed clinical dose on the Program record to enable.");
  }

  // Check for nonlinear kinetics warning
  const doseSorted = withTk.filter((c) => c.noael_dose !== null).sort((a, b) => a.noael_dose! - b.noael_dose!);
  if (doseSorted.length >= 2) {
    const aucSorted = doseSorted.map((c) => c.auc_at_noael!);
    const dosesAreIncreasing = doseSorted.every((c, i) => i === 0 || c.noael_dose! >= doseSorted[i - 1].noael_dose!);
    const aucsAreIncreasing = aucSorted.every((v, i) => i === 0 || v >= aucSorted[i - 1]);
    if (dosesAreIncreasing && !aucsAreIncreasing) {
      notes.push("Possible nonlinear kinetics detected — AUC does not increase proportionally with dose. AUC-based margins may be misleading.");
    }
  }

  // Determine if dose-based and exposure-based rankings agree
  const doseRanked = [...comparisons].sort((a, b) => (a.hed ?? Infinity) - (b.hed ?? Infinity));
  const aucRanked = [...withTk].sort((a, b) => (a.auc_at_noael ?? Infinity) - (b.auc_at_noael ?? Infinity));

  let classification: string;
  if (withTk.length >= 2 && doseRanked[0]?.study_id !== aucRanked[0]?.study_id) {
    classification = "DOSE_EXPOSURE_DISCORDANT";
    notes.push("Most sensitive species differs between dose-based and exposure-based ranking. The exposure-based ranking (AUC) is preferred per ICH M3(R2).");
  } else if (withTk.length >= 2) {
    classification = "DOSE_EXPOSURE_CONCORDANT";
  } else {
    classification = "SINGLE_STUDY_TK";
  }

  return {
    comparisons,
    pattern: {
      pattern_id: "XSI_EXPOSURE",
      pattern_name: "TK/AUC Exposure-Normalized Comparison",
      classification,
      studies_compared: withTk.map((c) => c.study_id),
      details: { comparisons: withTk, clinical_auc: clinicalDose?.auc ?? null },
      confidence_notes: notes,
    },
  };
}

// ─── Pattern: XSI_MARGIN (Phase 7) ─────────────────────────

function evaluateMargin(
  exposureComparisons: ExposureComparison[],
  clinicalDose?: { auc?: number; cmax?: number; dose_value?: number; unit?: string } | null,
): PatternResult | null {
  if (!clinicalDose?.auc && !clinicalDose?.dose_value) return null;

  const margins: Array<{ study_id: string; species: string; margin_type: string; margin_value: number }> = [];
  const notes: string[] = [];

  for (const comp of exposureComparisons) {
    if (comp.auc_at_noael !== null && clinicalDose?.auc) {
      margins.push({
        study_id: comp.study_id,
        species: comp.species,
        margin_type: "AUC-based",
        margin_value: comp.auc_at_noael / clinicalDose.auc,
      });
    } else if (comp.hed !== null && clinicalDose?.dose_value) {
      margins.push({
        study_id: comp.study_id,
        species: comp.species,
        margin_type: "dose-based (HED)",
        margin_value: comp.hed / clinicalDose.dose_value,
      });
    }
  }

  if (margins.length === 0) return null;

  const minMargin = Math.min(...margins.map((m) => m.margin_value));
  let classification: string;
  if (minMargin >= 10) {
    classification = "ADEQUATE_MARGIN";
  } else if (minMargin >= 3) {
    classification = "NARROW_MARGIN";
    notes.push(`Minimum safety margin is ${minMargin.toFixed(1)}x — below 10x FDA guideline default safety factor.`);
  } else {
    classification = "INSUFFICIENT_MARGIN";
    notes.push(`Minimum safety margin is ${minMargin.toFixed(1)}x — critically narrow. Review dose selection rationale.`);
  }

  return {
    pattern_id: "XSI_MARGIN",
    pattern_name: "Human Safety Margin",
    classification,
    studies_compared: margins.map((m) => m.study_id),
    details: { margins, min_margin: minMargin, clinical_dose: clinicalDose },
    confidence_notes: notes,
  };
}

// ─── Pattern: XSI_CONCORDANCE_MATRIX (Phase 7) ─────────────

function evaluateConcordanceMatrix(
  studies: StudySummaryRecord[],
): PatternResult | null {
  if (studies.length < 3) return null;

  // Build matrix: syndrome × study → present/absent
  const allSyndromes = new Set<string>();
  for (const s of studies) {
    for (const syn of s.detected_syndromes) allSyndromes.add(syn.syndrome_id);
  }

  const matrix: Record<string, Record<string, boolean>> = {};
  for (const synId of allSyndromes) {
    matrix[synId] = {};
    for (const s of studies) {
      matrix[synId][s.study_id] = s.detected_syndromes.some((syn) => syn.syndrome_id === synId);
    }
  }

  // Count concordance: how many syndromes appear in all studies vs some
  let universalCount = 0;
  let partialCount = 0;
  let uniqueCount = 0;
  for (const synId of allSyndromes) {
    const presentIn = Object.values(matrix[synId]).filter(Boolean).length;
    if (presentIn === studies.length) universalCount++;
    else if (presentIn === 1) uniqueCount++;
    else partialCount++;
  }

  return {
    pattern_id: "XSI_CONCORDANCE_MATRIX",
    pattern_name: "Findings Concordance Matrix",
    classification: universalCount > 0 ? "CONCORDANCE_PATTERN" : partialCount > 0 ? "PARTIAL_CONCORDANCE" : "NO_CONCORDANCE",
    studies_compared: studies.map((s) => s.study_id),
    details: {
      matrix,
      total_syndromes: allSyndromes.size,
      universal: universalCount,
      partial: partialCount,
      unique: uniqueCount,
    },
    confidence_notes: [],
  };
}

// ─── Pattern: XSI_RECOVERY_ADEQUACY (Phase 7) ──────────────

function evaluateRecoveryAdequacy(
  studies: StudySummaryRecord[],
): PatternResult[] {
  const results: PatternResult[] = [];
  const withRecovery = studies.filter((s) => s.recovery_weeks !== null && s.recovery_weeks > 0);
  if (withRecovery.length < 2) return results;

  // Compare recovery period adequacy for the same syndrome across studies
  const syndromeRecovery = new Map<string, Array<{ study_id: string; species: string; recovery_weeks: number; status: string }>>();

  for (const s of withRecovery) {
    for (const [synId, status] of Object.entries(s.recovery_outcomes)) {
      const entries = syndromeRecovery.get(synId) ?? [];
      entries.push({ study_id: s.study_id, species: s.species, recovery_weeks: s.recovery_weeks!, status });
      syndromeRecovery.set(synId, entries);
    }
  }

  for (const [synId, entries] of syndromeRecovery) {
    if (entries.length < 2) continue;

    const hasIncomplete = entries.some((e) => e.status === "partial" || e.status === "incomplete" || e.status === "not_reversed");
    const hasComplete = entries.some((e) => e.status === "complete" || e.status === "reversed");

    let classification: string;
    const notes: string[] = [];

    if (hasIncomplete && hasComplete) {
      // Find if longer recovery period helped
      const sorted = [...entries].sort((a, b) => a.recovery_weeks - b.recovery_weeks);
      const shortestIncomplete = sorted.find((e) => e.status !== "complete" && e.status !== "reversed");
      const longestComplete = [...sorted].reverse().find((e) => e.status === "complete" || e.status === "reversed");

      if (shortestIncomplete && longestComplete && longestComplete.recovery_weeks > shortestIncomplete.recovery_weeks) {
        classification = "DURATION_DEPENDENT_RECOVERY";
        notes.push(`Recovery appears duration-dependent: incomplete at ${shortestIncomplete.recovery_weeks}wk, complete at ${longestComplete.recovery_weeks}wk.`);
      } else {
        classification = "INADEQUATE_DURATION";
        notes.push("Incomplete recovery observed — longer recovery period may be needed for chronic study design.");
      }
    } else if (hasComplete) {
      classification = "ADEQUATE_DURATION";
    } else {
      classification = "INADEQUATE_DURATION";
      notes.push("No complete recovery observed in any study — consider extending recovery period.");
    }

    results.push({
      pattern_id: "XSI_RECOVERY_ADEQUACY",
      pattern_name: "Recovery Period Adequacy Comparison",
      classification,
      studies_compared: entries.map((e) => e.study_id),
      details: { syndrome_id: synId, entries },
      confidence_notes: notes,
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

  // XSI_EXPOSURE: TK/AUC exposure-normalized comparison (Phase 7)
  const { comparisons: exposureComps, pattern: exposurePattern } = evaluateExposure(allStudies, program.clinical_dose);
  if (exposurePattern) patternResults.push(exposurePattern);

  // XSI_MARGIN: human safety margin (Phase 7)
  const marginPattern = evaluateMargin(exposureComps, program.clinical_dose);
  if (marginPattern) patternResults.push(marginPattern);

  // XSI_CONCORDANCE_MATRIX: findings concordance across 3+ studies (Phase 7)
  const concordanceMatrix = evaluateConcordanceMatrix(allStudies);
  if (concordanceMatrix) patternResults.push(concordanceMatrix);

  // XSI_RECOVERY_ADEQUACY: recovery period adequacy comparison (Phase 7)
  patternResults.push(...evaluateRecoveryAdequacy(allStudies));

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

// ─── Mode 2: Program Synthesis (symmetric, no anchor) ──────

/**
 * Run all cross-study patterns in program synthesis mode.
 * No anchor study — all studies are treated symmetrically.
 * Produces a program-level overview for IND submission preparation.
 *
 * All inputs are StudySummaryRecord — never raw SEND data.
 */
export function synthesizeProgram(
  studies: StudySummaryRecord[],
  program: Program,
): ProgramConclusion {
  if (studies.length === 0) {
    return {
      program_id: program.id,
      compound_name: program.compound,
      studies_analyzed: [],
      pattern_results: [],
      program_noael: null,
      watchlist: [],
    };
  }

  const submittedStudies = studies.filter((s) => s.study_stage === "SUBMITTED");
  const patternResults: PatternResult[] = [];

  // XSI_CONCORDANCE: run for each unique species pair
  const speciesGroups = new Map<string, StudySummaryRecord[]>();
  for (const s of studies) {
    const sp = s.species.toUpperCase();
    const group = speciesGroups.get(sp) ?? [];
    group.push(s);
    speciesGroups.set(sp, group);
  }
  if (speciesGroups.size >= 2) {
    // Use first study from the species with most studies as pseudo-anchor
    const sorted = [...speciesGroups.entries()].sort((a, b) => b[1].length - a[1].length);
    const pseudoAnchor = sorted[0][1][0];
    const refs = studies.filter((s) => s.study_id !== pseudoAnchor.study_id);
    const conc = evaluateConcordance(pseudoAnchor, refs);
    if (conc) patternResults.push(conc);
  }

  // XSI_DURATION: run for each same-species pair
  for (const [, group] of speciesGroups) {
    if (group.length >= 2) {
      patternResults.push(...evaluateDuration(group[0], group.slice(1)));
    }
  }

  // XSI_RECOVERY: all studies
  patternResults.push(...evaluateRecovery(studies));

  // XSI_SEVERITY: all studies
  patternResults.push(...evaluateSeverity(studies));

  // XSI_EXPOSURE: TK comparison
  const { comparisons: exposureComps, pattern: exposurePattern } = evaluateExposure(studies, program.clinical_dose);
  if (exposurePattern) patternResults.push(exposurePattern);

  // XSI_MARGIN: safety margin
  const marginPattern = evaluateMargin(exposureComps, program.clinical_dose);
  if (marginPattern) patternResults.push(marginPattern);

  // XSI_CONCORDANCE_MATRIX: 3+ studies
  const concordanceMatrix = evaluateConcordanceMatrix(studies);
  if (concordanceMatrix) patternResults.push(concordanceMatrix);

  // XSI_RECOVERY_ADEQUACY: recovery period comparison
  patternResults.push(...evaluateRecoveryAdequacy(studies));

  // XSI_NOAEL: program NOAEL
  const noaelReconciliation = evaluateNoael(studies);

  // XSI_WATCHLIST: monitoring watchlist
  const watchlist = evaluateWatchlist(submittedStudies);

  return {
    program_id: program.id,
    compound_name: program.compound,
    studies_analyzed: studies.map((s) => s.study_id),
    pattern_results: patternResults,
    program_noael: noaelReconciliation.length > 0 ? noaelReconciliation : null,
    watchlist,
  };
}
