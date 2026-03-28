/**
 * Comparison engine — pure functions for reference vs study group computation
 * and saved cohort filter serialization.
 */
import { fishersExact2x2 } from "@/lib/statistics";
import type {
  CohortSubject,
  CohortFindingRow,
  ComparisonRow,
  CohortPreset,
  FilterGroup,
  FilterPredicate,
  FilterOperator,
  SerializedFilterState,
  SerializedFilterGroup,
  SerializedFilterPredicate,
} from "@/types/cohort";

// ── Default reference computation ───────────────────────────

/**
 * Compute default reference group: concurrent controls matching the
 * sex distribution of the active (study) subjects.
 */
export function computeDefaultReference(
  allSubjects: CohortSubject[],
  activeSubjects: CohortSubject[],
): Set<string> {
  const activeSexes = new Set(activeSubjects.map((s) => s.sex));
  const controlIds = new Set<string>();
  for (const s of allSubjects) {
    if (s.isControl && activeSexes.has(s.sex)) {
      controlIds.add(s.usubjid);
    }
  }
  return controlIds;
}

// ── Comparison computation ──────────────────────────────────

/**
 * Compute comparison results for each finding row between reference
 * and study subject groups.
 */
export function computeComparison(
  findingRows: CohortFindingRow[],
  referenceIds: Set<string>,
  studyIds: Set<string>,
): ComparisonRow[] {
  return findingRows.map((row) => {
    if (row.dataType === "incidence") {
      return computeIncidenceRow(row, referenceIds, studyIds);
    }
    return computeContinuousRow(row, referenceIds, studyIds);
  });
}

function computeIncidenceRow(
  row: CohortFindingRow,
  refIds: Set<string>,
  studyIds: Set<string>,
): ComparisonRow {
  let refAffected = 0;
  let refTotal = 0;
  let studyAffected = 0;
  let studyTotal = 0;

  for (const [id, val] of Object.entries(row.subjectValues)) {
    if (refIds.has(id)) {
      refTotal++;
      if (val != null && val !== 0) refAffected++;
    }
    if (studyIds.has(id)) {
      studyTotal++;
      if (val != null && val !== 0) studyAffected++;
    }
  }

  // If no per-subject data, fall back to groupStats
  if (refTotal === 0 && studyTotal === 0) {
    return fallbackFromGroupStats(row, refIds, studyIds);
  }

  const refIncidence = refTotal > 0 ? refAffected / refTotal : 0;
  const studyIncidence = studyTotal > 0 ? studyAffected / studyTotal : 0;

  const fisherP =
    refTotal > 0 || studyTotal > 0
      ? fishersExact2x2(
          studyAffected,
          studyTotal - studyAffected,
          refAffected,
          refTotal - refAffected,
        )
      : 1;

  const isDiscriminating = studyIncidence > 0.1 && refIncidence <= 0.05;

  return {
    findingKey: row.key,
    domain: row.domain,
    finding: row.finding,
    dataType: "incidence",
    refAggregate: refIncidence,
    studyAggregate: studyIncidence,
    delta: fisherP,
    deltaType: "fisher_p",
    isDiscriminating,
  };
}

function computeContinuousRow(
  row: CohortFindingRow,
  refIds: Set<string>,
  studyIds: Set<string>,
): ComparisonRow {
  const refValues: number[] = [];
  const studyValues: number[] = [];

  for (const [id, val] of Object.entries(row.subjectValues)) {
    if (val == null || typeof val !== "number") continue;
    if (refIds.has(id)) refValues.push(val);
    if (studyIds.has(id)) studyValues.push(val);
  }

  const refMean =
    refValues.length > 0
      ? refValues.reduce((a, b) => a + b, 0) / refValues.length
      : null;
  const studyMean =
    studyValues.length > 0
      ? studyValues.reduce((a, b) => a + b, 0) / studyValues.length
      : null;

  let foldChange: number | null = null;
  if (refMean != null && studyMean != null && refMean !== 0) {
    foldChange = studyMean / refMean;
  }

  const isDiscriminating =
    foldChange != null && Math.abs(foldChange - 1) > 0.5;

  return {
    findingKey: row.key,
    domain: row.domain,
    finding: row.finding,
    dataType: "continuous",
    refAggregate: refMean,
    studyAggregate: studyMean,
    delta: foldChange,
    deltaType: "fold_change",
    isDiscriminating,
  };
}

/** Fallback when subjectValues is empty — use groupStats dose-level aggregates. */
function fallbackFromGroupStats(
  row: CohortFindingRow,
  _refIds: Set<string>,
  _studyIds: Set<string>,
): ComparisonRow {
  // Use control (dose 0) as ref, highest dose as study
  const controlStat = row.groupStats.find((g) => g.doseLevel === 0);
  const treatedStats = row.groupStats
    .filter((g) => g.doseLevel > 0)
    .sort((a, b) => b.doseLevel - a.doseLevel);
  const highDoseStat = treatedStats[0] ?? null;

  const refInc = controlStat?.incidence ?? null;
  const studyInc = highDoseStat?.incidence ?? null;

  let fisherP: number | null = null;
  if (
    controlStat &&
    highDoseStat &&
    controlStat.n > 0 &&
    highDoseStat.n > 0
  ) {
    const refAff = controlStat.affected ?? 0;
    const studyAff = highDoseStat.affected ?? 0;
    fisherP = fishersExact2x2(
      studyAff,
      highDoseStat.n - studyAff,
      refAff,
      controlStat.n - refAff,
    );
  }

  const isDiscriminating =
    (studyInc ?? 0) > 0.1 && (refInc ?? 0) <= 0.05;

  return {
    findingKey: row.key,
    domain: row.domain,
    finding: row.finding,
    dataType: "incidence",
    refAggregate: refInc,
    studyAggregate: studyInc,
    delta: fisherP,
    deltaType: "fisher_p",
    isDiscriminating,
  };
}

// ── Filter state serialization ──────────────────────────────

export function serializeFilterState(
  activePresets: Set<CohortPreset>,
  filterGroup: FilterGroup,
  doseFilter: Set<number> | null,
  sexFilter: Set<string> | null,
  searchQuery: string,
  includeTK: boolean,
): SerializedFilterState {
  return {
    activePresets: [...activePresets],
    filterGroup: serializeFilterGroup(filterGroup),
    doseFilter: doseFilter ? [...doseFilter] : null,
    sexFilter: sexFilter ? [...sexFilter] : null,
    searchQuery,
    includeTK,
  };
}

export function deserializeFilterState(data: SerializedFilterState): {
  activePresets: Set<CohortPreset>;
  filterGroup: FilterGroup;
  doseFilter: Set<number> | null;
  sexFilter: Set<string> | null;
  searchQuery: string;
  includeTK: boolean;
} {
  return {
    activePresets: new Set(data.activePresets as CohortPreset[]),
    filterGroup: deserializeFilterGroup(data.filterGroup),
    doseFilter: data.doseFilter ? new Set(data.doseFilter) : null,
    sexFilter: data.sexFilter ? new Set(data.sexFilter) : null,
    searchQuery: data.searchQuery,
    includeTK: data.includeTK,
  };
}

function serializeFilterGroup(fg: FilterGroup): SerializedFilterGroup {
  return {
    operator: fg.operator,
    predicates: fg.predicates.map(serializePredicate),
  };
}

function deserializeFilterGroup(sfg: SerializedFilterGroup): FilterGroup {
  return {
    operator: sfg.operator as FilterOperator,
    predicates: sfg.predicates.map(deserializePredicate),
  };
}

function serializePredicate(p: FilterPredicate): SerializedFilterPredicate {
  switch (p.type) {
    case "dose":
      return { type: "dose", values: [...p.values] };
    case "sex":
      return { type: "sex", values: [...p.values] };
    case "disposition":
      return { type: "disposition", values: [...p.values] };
    default:
      // All other predicate types are already JSON-safe (no Sets)
      return p as SerializedFilterPredicate;
  }
}

function deserializePredicate(sp: SerializedFilterPredicate): FilterPredicate {
  switch (sp.type) {
    case "dose":
      return { type: "dose", values: new Set(sp.values) };
    case "sex":
      return { type: "sex", values: new Set(sp.values) };
    case "disposition":
      return { type: "disposition", values: new Set(sp.values) };
    default:
      return sp as FilterPredicate;
  }
}
