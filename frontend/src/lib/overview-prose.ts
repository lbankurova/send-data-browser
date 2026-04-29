/**
 * Pure composition utilities for the Overview executive summary.
 *
 * All functions take already-fetched JSON shapes and return strings (or
 * null when a clause has no data). No data fetching, no React.
 *
 * Tested against PointCross fixtures in `frontend/tests/overview-prose.test.ts`.
 */

import type { StudyMetadata, DoseGroup } from "@/types";
import type { StudyContext } from "@/types/study-context";
import type {
  NoaelSummaryRow,
  TargetOrganRow,
} from "@/types/analysis-views";
import type { SyndromeRollup } from "@/types/syndrome-rollup";
import { specimenToOrganSystem } from "@/lib/histopathology-helpers";
import {
  findDominantSetsLoaelSyndrome,
  findLoaelDriverOrgan,
} from "@/lib/syndrome-utils";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RecoveryPerFindingEntry {
  domain: string;
  specimen: string;
  finding: string;
  verdict: string | null;
  main_incidence?: unknown;
  recovery_incidence?: unknown;
  subjects_reversed?: unknown;
  subjects_persistent?: unknown;
}

export interface HeadlineFinding {
  headline: string;
  /** Sub-line. Null when target-organ count is 0 (drop entire sub-line per spec). */
  subline: string | null;
  /** Integer 0–100 when present, null when noael_confidence is null (drop chip). */
  confidencePercent: number | null;
}

export interface RecoverySummary {
  totalEvaluable: number;
  recoveredCount: number;
  persistedCount: number;
  nonEvaluable: number;
  persistedEntries: RecoveryPerFindingEntry[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const PLURAL_S = (n: number, suffix = "s") => (n === 1 ? "" : suffix);

/** Oxford-style comma join: ["a"] → "a"; ["a","b"] → "a and b"; ["a","b","c"] → "a, b, and c". */
export function oxfordJoin(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/** Plural-aware singular/plural form (no oxford). For "X dose group{s}"-style fragments. */
export function pluralWord(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : plural ?? `${singular}s`;
}

// ─── Section 2: About paragraph ─────────────────────────────────────────────

/**
 * About paragraph template:
 *   {durationWeeks}-week repeat-dose {route} toxicology in {speciesLong} with a
 *   {recoveryWeeks}-week recovery cohort. Test article dosed at {doses} mg/kg
 *   across {groupCount} groups — {mainSubjectCount} main-study subjects,
 *   {recoverySubjectCount} recovery, {tkSubjectCount} toxicokinetic.
 *
 * Returns null only when both lead-in and dose sentence collapse — i.e. the
 * underlying study metadata is so sparse that no defensible prose remains.
 * In practice the "Test article dosed at..." sentence renders for any study
 * that has dose groups.
 */
export function composeAboutParagraph(
  meta: StudyMetadata | undefined,
  studyCtx: StudyContext | undefined,
): string | null {
  if (!meta) return null;

  const doseGroups = meta.dose_groups ?? [];
  const treated = doseGroups.filter(
    (dg) =>
      !dg.is_recovery &&
      !dg.is_control &&
      dg.dose_value != null &&
      dg.dose_value > 0,
  );
  const groupCount = doseGroups.filter((dg) => !dg.is_recovery).length;
  const mainSubjectCount = doseGroups.reduce(
    (s, dg) => s + (dg.n_total ?? 0),
    0,
  );
  const recoverySubjectCount = doseGroups.reduce(
    (s, dg) => s + (dg.recovery_n ?? 0),
    0,
  );
  const tkSubjectCount = doseGroups.reduce(
    (s, dg) => s + (dg.tk_count ?? 0),
    0,
  );

  // Lead-in sentence (durationWeeks-week ... toxicology in speciesLong [with recovery]).
  // Sub-week studies (acute toxicity) drop the lead-in — "0-week repeat-dose"
  // would mislead, and the chip strip already names the duration.
  const durationWeeksRaw = studyCtx?.dosingDurationWeeks ?? null;
  const durationWeeks =
    durationWeeksRaw != null && durationWeeksRaw >= 1
      ? Math.round(durationWeeksRaw)
      : null;
  const route = meta.route ? meta.route.toLowerCase() : null;
  const speciesLong = formatSpeciesLong(meta.species, meta.strain);
  const recoveryWeeksLabel = formatRecoveryLabel(studyCtx?.recoveryPeriodDays ?? null);

  let leadIn: string | null = null;
  if (durationWeeks != null) {
    const routeFrag = route ? `${route} ` : "";
    const speciesFrag = speciesLong ? ` in ${speciesLong}` : "";
    const recoveryFrag = recoveryWeeksLabel
      ? ` with a ${recoveryWeeksLabel} recovery cohort`
      : "";
    leadIn = `${durationWeeks}-week repeat-dose ${routeFrag}toxicology${speciesFrag}${recoveryFrag}.`;
  }

  // Dose sentence ("Test article dosed at <doses> mg/kg across <groupCount> groups
  // — <mainSubjectCount> main-study subjects[, <recoveryN> recovery][, <tkN>
  // toxicokinetic].").
  let doseSentence: string | null = null;
  if (treated.length > 0) {
    const doseValues = treated
      .map((t) => t.dose_value)
      .filter((v): v is number => v != null);
    const dosesFragment =
      doseValues.length === 1
        ? `at ${doseValues[0]} mg/kg`
        : `at ${oxfordJoin(doseValues.map((v) => v.toString()))} mg/kg`;
    const subjectFragments = [`${mainSubjectCount} main-study subjects`];
    if (recoverySubjectCount > 0)
      subjectFragments.push(`${recoverySubjectCount} recovery`);
    if (tkSubjectCount > 0)
      subjectFragments.push(`${tkSubjectCount} toxicokinetic`);
    doseSentence = `Test article dosed ${dosesFragment} across ${groupCount} group${PLURAL_S(groupCount)} — ${subjectFragments.join(", ")}.`;
  }

  if (!leadIn && !doseSentence) return null;
  return [leadIn, doseSentence].filter(Boolean).join(" ");
}

function formatSpeciesLong(
  species: string | null | undefined,
  strain: string | null | undefined,
): string | null {
  if (!species && !strain) return null;
  const speciesLower = species ? species.toLowerCase() : null;
  // Pluralize basic English species names ("rat" → "rats", "dog" → "dogs").
  // Does NOT cover irregular plurals (mouse → mice); falls through unchanged.
  const pluralized = speciesLower
    ? /(rat|dog|monkey|rabbit|pig|hamster|mouse|guinea pig)$/.test(speciesLower)
      ? speciesLower.endsWith("mouse")
        ? speciesLower.replace(/mouse$/, "mice")
        : `${speciesLower}s`
      : speciesLower
    : null;
  if (strain && pluralized) return `${strain} ${pluralized}`;
  return pluralized ?? strain ?? null;
}

function formatRecoveryLabel(recoveryPeriodDays: number | null): string | null {
  if (recoveryPeriodDays == null || recoveryPeriodDays <= 0) return null;
  if (recoveryPeriodDays < 7) return "0.5-week";
  const weeks = recoveryPeriodDays / 7;
  const rounded = Math.round(weeks * 2) / 2;
  return `${rounded === Math.floor(rounded) ? rounded.toFixed(0) : rounded}-week`;
}

// ─── Section 3: Headline finding ────────────────────────────────────────────

export function composeHeadlineFinding(
  combinedNoael: NoaelSummaryRow | undefined,
  targetOrganCount: number,
  drivingOrgan: string | null,
  loaelEstablished: boolean,
): HeadlineFinding {
  const noaelValue = combinedNoael?.noael_dose_value ?? null;
  const loaelValue = combinedNoael?.loael_dose_value ?? null;
  const noaelUnit = combinedNoael?.noael_dose_unit ?? "mg/kg";

  let headline: string;
  if (noaelValue != null && loaelValue != null) {
    headline = `NOAEL ${noaelValue} ${noaelUnit} · LOAEL ${loaelValue} ${noaelUnit}`;
  } else if (noaelValue == null && loaelValue != null) {
    headline = `LOAEL set at ${loaelValue} ${noaelUnit} · NOAEL not established`;
  } else if (noaelValue != null && loaelValue == null) {
    headline = `NOAEL ${noaelValue} ${noaelUnit} · LOAEL not reached at highest tested dose`;
  } else {
    headline = "NOAEL and LOAEL not established";
  }

  // Sub-line tokens. Drop sub-line entirely when no target organs flagged.
  if (targetOrganCount === 0) {
    return { headline, subline: null, confidencePercent: null };
  }

  const segments: string[] = [];
  segments.push(
    `${targetOrganCount} organ system${PLURAL_S(targetOrganCount)} flagged`,
  );
  if (loaelEstablished && drivingOrgan) {
    segments.push(`${drivingOrgan.toLowerCase()} drives LOAEL`);
  }
  // Confidence chip — null indicates "drop the chip"; renderer still shows
  // the rest of the sub-line.
  const confidenceRaw = combinedNoael?.noael_confidence;
  const confidencePercent =
    confidenceRaw == null || Number.isNaN(confidenceRaw)
      ? null
      : Math.round(confidenceRaw * 100);

  return {
    headline,
    subline: segments.join(" · "),
    confidencePercent,
  };
}

// ─── Section 4: Findings paragraph ──────────────────────────────────────────

/**
 * Compose the Findings paragraph from the inputs the Overview already has
 * in scope. Each clause is included only when its source data is non-empty;
 * the paragraph collapses gracefully on sparse studies.
 */
export function composeFindingsParagraph(
  targetOrgans: TargetOrganRow[] | undefined,
  syndromeRollup: SyndromeRollup | undefined,
  recoveryPerFinding: Record<string, RecoveryPerFindingEntry> | undefined,
  doseGroups: DoseGroup[] | undefined,
): string | null {
  const flagged = (targetOrgans ?? []).filter((t) => t.target_organ_flag);

  // Sentence 1 — Target organs.
  const organNames = flagged.map((t) => t.organ_system.toLowerCase());
  let sentence1: string | null = null;
  if (organNames.length === 0) {
    sentence1 = "No adverse target organs identified.";
  } else if (organNames.length === 1) {
    sentence1 = `Target organ is ${organNames[0]}.`;
  } else {
    sentence1 = `Target organs are ${oxfordJoin(organNames)}.`;
  }

  // Sentence 2 — LOAEL driver. Constrained to flagged target organs so the
  // driver also appears in sentence 1's target-organs enumeration; this
  // matches the constraint applied to the Headline sub-line driver, so the
  // two surfaces cannot name different organs.
  const flaggedSet = new Set(flagged.map((t) => t.organ_system.toLowerCase()));
  const drivingOrgan = findLoaelDriverOrgan(syndromeRollup?.by_organ, flaggedSet);
  let sentence2: string | null = null;
  if (drivingOrgan && syndromeRollup) {
    const drivingSyndrome = findDominantSetsLoaelSyndrome(
      syndromeRollup.by_organ,
      drivingOrgan,
    );
    if (drivingSyndrome) {
      const organCap = capitalize(drivingOrgan);
      sentence2 = `${organCap} ${drivingSyndrome.syndrome_name.toLowerCase()} sets the LOAEL.`;
    }
  }

  // Sentence 3 — Secondary corroboration. Strict grade=strong only.
  const secondary = flagged
    .filter((t) => t.organ_system.toLowerCase() !== (drivingOrgan ?? "").toLowerCase())
    .filter((t) => t.evidence_quality?.grade === "strong")
    .sort((a, b) => b.evidence_score - a.evidence_score);
  let sentence3: string | null = null;
  if (secondary.length > 0) {
    const names = secondary.map((t) => t.organ_system.toLowerCase());
    const allCorroborated = secondary.every((t) => {
      const status = t.evidence_quality?.corroboration?.status;
      return status === "positive" || status === "examined_normal";
    });
    const verb = secondary.length === 1 ? "shows" : "show";
    const corroborationClause = allCorroborated ? " with positive corroboration" : "";
    sentence3 = `${capitalize(oxfordJoin(names))} ${verb} strong evidence at the high dose${corroborationClause}.`;
  }

  // Sentence 4 — Recovery.
  const recoverySummary = summarizeRecovery(recoveryPerFinding);
  const highestDose = highestNonRecoveryDose(doseGroups);
  let sentence4: string | null = null;
  let caveat: string | null = null;
  if (recoverySummary.totalEvaluable > 0) {
    if (recoverySummary.persistedCount === 0) {
      sentence4 = `${recoverySummary.recoveredCount} of ${recoverySummary.totalEvaluable} evaluable findings reversed in recovery.`;
    } else {
      const persistedOrgans = derivePersistedOrgans(recoverySummary.persistedEntries);
      const organQualifier =
        persistedOrgans.length > 0 ? ` ${oxfordJoin(persistedOrgans)}` : "";
      const doseSuffix =
        highestDose != null ? ` at ${highestDose} mg/kg` : "";
      sentence4 = `${recoverySummary.recoveredCount} of ${recoverySummary.totalEvaluable} evaluable findings reversed in recovery; ${recoverySummary.persistedCount}${organQualifier} finding${PLURAL_S(recoverySummary.persistedCount)} persisted${doseSuffix}.`;
    }
  }
  if (recoverySummary.nonEvaluable > 0) {
    caveat = `(${recoverySummary.nonEvaluable} additional finding${PLURAL_S(recoverySummary.nonEvaluable)} had insufficient recovery data.)`;
  }

  const sentences = [sentence1, sentence2, sentence3, sentence4, caveat].filter(
    (s): s is string => !!s,
  );
  if (sentences.length === 0) return null;
  return sentences.join(" ");
}

export function summarizeRecovery(
  perFinding: Record<string, RecoveryPerFindingEntry> | undefined,
): RecoverySummary {
  if (!perFinding) {
    return {
      totalEvaluable: 0,
      recoveredCount: 0,
      persistedCount: 0,
      nonEvaluable: 0,
      persistedEntries: [],
    };
  }
  const all = Object.values(perFinding);
  const evaluable = all.filter((pf) => {
    const v = pf.verdict;
    return v != null && v !== "insufficient_n" && v !== "low_power";
  });
  const recoveredCount = evaluable.filter(
    (pf) => pf.verdict === "reversed" || pf.verdict === "partially_reversed",
  ).length;
  const persistedEntries = evaluable.filter(
    (pf) =>
      pf.verdict === "persistent" ||
      pf.verdict === "progressing" ||
      pf.verdict === "anomaly",
  );
  return {
    totalEvaluable: evaluable.length,
    recoveredCount,
    persistedCount: persistedEntries.length,
    nonEvaluable: all.length - evaluable.length,
    persistedEntries,
  };
}

/**
 * Derive a unique, ordered list of organ-system labels from the persisted
 * recovery entries — keyed via specimen→organ_system mapping. Specimens
 * that resolve to "general" (the fallback bucket in
 * `specimenToOrganSystem`) are omitted from the list (NOT from the count),
 * so the prose doesn't render a misleading "general" qualifier on
 * aggregate-specimen findings (e.g., "ALL TISSUES").
 */
export function derivePersistedOrgans(
  persistedEntries: RecoveryPerFindingEntry[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const pf of persistedEntries) {
    if (!pf.specimen) continue;
    const organ = specimenToOrganSystem(pf.specimen);
    if (organ === "general") continue;
    if (seen.has(organ)) continue;
    seen.add(organ);
    out.push(organ);
  }
  return out;
}

function highestNonRecoveryDose(doseGroups: DoseGroup[] | undefined): number | null {
  if (!doseGroups) return null;
  const treated = doseGroups.filter(
    (dg) =>
      !dg.is_recovery &&
      !dg.is_control &&
      dg.dose_value != null &&
      dg.dose_value > 0,
  );
  if (treated.length === 0) return null;
  return Math.max(
    ...treated.map((dg) => (dg.dose_value as number)),
  );
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
