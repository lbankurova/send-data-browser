/**
 * Cohort View computation engine.
 *
 * Pure functions that derive cohort subjects, preset sets, organ signals,
 * finding rows, and shared findings from the unified data.
 *
 * Key data model note: unified_findings has raw_subject_values for continuous
 * domains (LB, OM, BW) but NOT for incidence domains (MI, MA, CL).
 * For incidence domains, we use group_stats matched to cohort dose levels.
 */
import type { SubjectContextRow } from "@/hooks/useSubjectContext";
import type { StudyMortality } from "@/types/mortality";
import type { CrossAnimalFlags } from "@/lib/analysis-view-api";
import type { UnifiedFinding, GroupStat } from "@/types/analysis";
import type {
  CohortSubject,
  CohortPreset,
  HistoReason,
  OrganSignal,
  CohortFindingRow,
  GroupStatEntry,
  SharedFinding,
  FilterGroup,
  FilterPredicate,
} from "@/types/cohort";
import { presetToFilter } from "@/lib/filter-engine";

// Domains with per-subject raw values
const CONTINUOUS_DOMAINS = new Set(["LB", "OM", "BW"]);

// ── Build subject roster ─────────────────────────────────────

export function buildCohortSubjects(
  subjectContext: SubjectContextRow[],
  mortality: StudyMortality | null,
  crossAnimalFlags: CrossAnimalFlags | null,
  findings: UnifiedFinding[],
): CohortSubject[] {
  // Build mortality lookups
  const trsIds = new Set<string>();
  const accidentalIds = new Set<string>();
  const deathDayMap = new Map<string, number>();
  if (mortality) {
    for (const d of mortality.deaths) {
      trsIds.add(d.USUBJID);
      if (d.study_day != null) deathDayMap.set(d.USUBJID, d.study_day);
    }
    for (const a of mortality.accidentals) {
      accidentalIds.add(a.USUBJID);
      if (a.study_day != null) deathDayMap.set(a.USUBJID, a.study_day);
    }
    for (const id of Object.keys(mortality.early_death_subjects)) {
      if (!accidentalIds.has(id)) trsIds.add(id);
    }
    // Also get day from early_death_details if not already set
    for (const d of mortality.early_death_details) {
      if (!deathDayMap.has(d.USUBJID)) {
        // early_death_details doesn't have study_day directly, but deaths do
      }
    }
  }

  // Histopath qualification
  const histoResult = computeHistoReasons(findings, crossAnimalFlags);

  // Sex derivation
  const sexMap = deriveSexMap(mortality, findings);

  return subjectContext.map((sc) => {
    const isTrs = trsIds.has(sc.USUBJID);

    // Determine histopath reason for this subject
    let histoReason: HistoReason | null = histoResult.reasons.get(sc.USUBJID) ?? null;
    // Criterion 1: MI adverse at subject's dose level (non-control)
    if (!histoReason && !sc.IS_CONTROL && histoResult.miAdverseDoseLevels.has(sc.DOSE_GROUP_ORDER)) {
      histoReason = "adverse";
    }
    // Criterion 3: MI findings in ≥2 organs at subject's dose level (non-control)
    if (!histoReason && !sc.IS_CONTROL && histoResult.multiOrganDoseLevels.has(sc.DOSE_GROUP_ORDER)) {
      histoReason = "pattern";
    }

    // Badge priority: TRS > adverse > pattern > rec > tk
    let badge: CohortSubject["badge"] = null;
    if (isTrs) badge = "trs";
    else if (histoReason === "adverse" || histoReason === "cod") badge = "adverse";
    else if (histoReason === "pattern") badge = "pattern";
    else if (sc.HAS_RECOVERY && !sc.IS_CONTROL) badge = "rec";
    else if (sc.IS_TK) badge = "tk";

    // Sacrifice day: prefer mortality death day, then subject_context
    const sacrificeDay = deathDayMap.get(sc.USUBJID) ?? sc.SACRIFICE_DY;

    return {
      usubjid: sc.USUBJID,
      sex: sc.SEX ?? sexMap.get(sc.USUBJID) ?? "?",
      dose: sc.DOSE,
      doseLabel: sc.DOSE_LEVEL,
      doseGroupOrder: sc.DOSE_GROUP_ORDER,
      isControl: sc.IS_CONTROL,
      isRecovery: sc.HAS_RECOVERY,
      isTK: sc.IS_TK,
      sacrificeDay,
      plannedDay: sc.TREATMENT_END_DY,
      recoveryStartDay: sc.RECOVERY_START_DY,
      arm: sc.ARM,
      badge,
      histoReason,
    };
  });
}

function deriveSexMap(
  mortality: StudyMortality | null,
  findings: UnifiedFinding[],
): Map<string, string> {
  const map = new Map<string, string>();
  if (mortality) {
    for (const d of [...mortality.deaths, ...mortality.accidentals]) {
      if (d.sex) map.set(d.USUBJID, d.sex);
    }
    for (const d of mortality.early_death_details) {
      if (d.sex) map.set(d.USUBJID, d.sex);
    }
  }
  for (const f of findings) {
    if (!f.raw_subject_values || !f.sex) continue;
    for (const entry of f.raw_subject_values) {
      for (const id of Object.keys(entry)) {
        if (!map.has(id)) map.set(id, f.sex);
      }
    }
  }
  return map;
}

interface HistoReasonResult {
  reasons: Map<string, HistoReason>;
  miAdverseDoseLevels: Set<number>;
  multiOrganDoseLevels: Set<number>;
}

function computeHistoReasons(
  findings: UnifiedFinding[],
  crossAnimalFlags: CrossAnimalFlags | null,
): HistoReasonResult {
  const reasons = new Map<string, HistoReason>();

  // Criterion 1: ≥1 MI finding at severity ≥ "adverse"
  // MI lacks raw_subject_values, so we use group_stats: any MI adverse finding
  // at a non-control dose level — collect the dose levels with MI adverse signal
  const miAdverseDoseLevels = new Set<number>();
  for (const f of findings) {
    if (f.domain !== "MI" || f.severity !== "adverse") continue;
    for (const gs of f.group_stats ?? []) {
      if (gs.dose_level > 0 && (gs.affected ?? 0) > 0) {
        miAdverseDoseLevels.add(gs.dose_level);
      }
    }
  }

  // Criterion 2: COD-related flags
  if (crossAnimalFlags) {
    for (const flagged of crossAnimalFlags.tissue_battery.flagged_animals) {
      if (!reasons.has(flagged.animal_id)) {
        reasons.set(flagged.animal_id, "cod");
      }
    }
  }

  // Criterion 3: MI findings in ≥2 distinct organs per dose level
  const miOrgansByDose = new Map<number, Set<string>>();
  for (const f of findings) {
    if (f.domain !== "MI") continue;
    const organ = f.organ_name ?? f.organ_system ?? null;
    if (!organ) continue;
    for (const gs of f.group_stats ?? []) {
      if (gs.dose_level > 0 && (gs.affected ?? 0) > 0) {
        if (!miOrgansByDose.has(gs.dose_level)) miOrgansByDose.set(gs.dose_level, new Set());
        miOrgansByDose.get(gs.dose_level)!.add(organ);
      }
    }
  }
  const multiOrganDoseLevels = new Set<number>();
  for (const [dl, organs] of miOrgansByDose) {
    if (organs.size >= 2) multiOrganDoseLevels.add(dl);
  }

  return { reasons, miAdverseDoseLevels, multiOrganDoseLevels };
}

// ── Preset filtering ─────────────────────────────────────────

export function computePresetSubjects(
  allSubjects: CohortSubject[],
  preset: CohortPreset,
  includeTK: boolean,
): Set<string> {
  const ids = new Set<string>();
  switch (preset) {
    case "trs":
      for (const s of allSubjects) {
        if (s.badge === "trs") ids.add(s.usubjid);
      }
      break;
    case "histo":
      for (const s of allSubjects) {
        if (s.histoReason !== null) ids.add(s.usubjid);
      }
      break;
    case "recovery":
      for (const s of allSubjects) {
        if (s.isRecovery) ids.add(s.usubjid);
      }
      break;
    case "all":
      for (const s of allSubjects) {
        if (!s.isTK || includeTK) ids.add(s.usubjid);
      }
      break;
  }
  return ids;
}

// ── Preset + custom filter composition ────────────────────────

/**
 * Combine active presets and a custom FilterGroup into a single FilterGroup.
 *
 * Returns the preset layer as a FilterGroup. CohortContext applies convenience
 * predicates (dose, sex, search) as a second filtering pass on top.
 *
 * Logic:
 * 1. If activePresets is empty or contains only "all", no preset predicates
 *    are added (identity). If includeTK is false, a TK exclusion predicate is added.
 * 2. If activePresets has one specific preset, convert it via presetToFilter and
 *    merge with customFilters predicates into an AND group.
 * 3. If activePresets has multiple specific presets (e.g. trs + recovery), convert
 *    each via presetToFilter and merge all their predicates into an OR group
 *    (selecting multiple presets = union). Custom filters are then AND'd separately
 *    by the caller (CohortContext evaluates in two stages).
 */
export function buildPresetFilterGroup(
  activePresets: Set<CohortPreset>,
  customFilters: FilterGroup,
  includeTK: boolean,
): FilterGroup {
  // "all" or empty → identity (no preset narrowing)
  if (activePresets.has("all") || activePresets.size === 0) {
    const predicates: FilterPredicate[] = [];
    if (!includeTK) {
      predicates.push({ type: "tk", isTK: false });
    }
    predicates.push(...customFilters.predicates);
    return { operator: "and", predicates };
  }

  // Convert each active preset to a FilterGroup
  const presetFilters = [...activePresets].map((p) => presetToFilter(p, includeTK));

  if (presetFilters.length === 1) {
    // Single preset — AND its predicates with custom filters
    return {
      operator: "and",
      predicates: [...presetFilters[0].predicates, ...customFilters.predicates],
    };
  }

  // Multiple presets — OR all preset predicates (union semantics).
  // Custom filters cannot be merged into this flat OR group, so the caller
  // (CohortContext) evaluates custom filters as a separate AND pass.
  const orPredicates: FilterPredicate[] = [];
  for (const pf of presetFilters) {
    if (pf.predicates.length === 0) {
      // An empty-predicate preset (identity) — just apply custom filters
      return { operator: "and", predicates: [...customFilters.predicates] };
    }
    orPredicates.push(...pf.predicates);
  }
  return { operator: "or", predicates: orPredicates };
}

// ── Organ signals ────────────────────────────────────────────

export function computeOrganSignals(
  findings: UnifiedFinding[],
  activeSubjects: CohortSubject[],
): OrganSignal[] {
  if (activeSubjects.length === 0) return [];

  const subjectIds = new Set(activeSubjects.map((s) => s.usubjid));
  const cohortDoseLevels = new Set(activeSubjects.map((s) => s.doseGroupOrder));
  const cohortSexes = new Set(activeSubjects.map((s) => s.sex));
  const organMap = new Map<string, { worst: "adverse" | "warning" | "normal"; count: number }>();

  for (const f of findings) {
    const organ = f.organ_name ?? f.organ_system ?? null;
    if (!organ) continue;

    let relevant = false;

    if (CONTINUOUS_DOMAINS.has(f.domain) && f.raw_subject_values) {
      // Continuous: check per-subject values directly
      for (const entry of f.raw_subject_values) {
        for (const id of Object.keys(entry)) {
          if (subjectIds.has(id) && entry[id] != null) {
            relevant = true;
            break;
          }
        }
        if (relevant) break;
      }
    } else if (f.domain === "CL" && f.raw_subject_onset_days) {
      // CL with per-subject onset days: check directly
      for (const entry of f.raw_subject_onset_days) {
        for (const id of Object.keys(entry)) {
          if (subjectIds.has(id) && entry[id] != null) {
            relevant = true;
            break;
          }
        }
        if (relevant) break;
      }
    } else {
      // Incidence domains (MI, MA) or missing raw values:
      // Relevant if finding has group_stats at a cohort dose level
      // AND matches cohort sex (findings are per-sex)
      if (f.sex && !cohortSexes.has(f.sex)) continue;
      for (const gs of f.group_stats ?? []) {
        if (cohortDoseLevels.has(gs.dose_level) && gs.dose_level > 0) {
          // Only count if there's actual signal (affected > 0 or mean differs)
          if (gs.affected != null && gs.affected > 0) { relevant = true; break; }
          if (gs.incidence != null && gs.incidence > 0) { relevant = true; break; }
          if (gs.mean != null) { relevant = true; break; }
        }
      }
    }

    if (!relevant) continue;

    if (!organMap.has(organ)) organMap.set(organ, { worst: "normal", count: 0 });
    const entry = organMap.get(organ)!;
    entry.count++;
    if (f.severity === "adverse") entry.worst = "adverse";
    else if (f.severity === "warning" && entry.worst !== "adverse") entry.worst = "warning";
  }

  return [...organMap.entries()]
    .map(([name, { worst, count }]) => ({
      organName: name,
      worstSeverity: worst,
      findingCount: count,
    }))
    .sort((a, b) => a.organName.localeCompare(b.organName));
}

// ── Finding rows for a selected organ ────────────────────────

const DOMAIN_ORDER: Record<string, number> = {
  MI: 0, MA: 1, LB: 2, OM: 3, CL: 4, BW: 5,
};

export function buildCohortFindingRows(
  findings: UnifiedFinding[],
  organName: string,
  activeSubjects: CohortSubject[],
): CohortFindingRow[] {
  if (activeSubjects.length === 0) return [];

  const subjectIds = new Set(activeSubjects.map((s) => s.usubjid));
  const cohortDoseLevels = new Set(activeSubjects.map((s) => s.doseGroupOrder));
  const cohortSexes = new Set(activeSubjects.map((s) => s.sex));
  const rows: CohortFindingRow[] = [];

  for (const f of findings) {
    const fOrgan = f.organ_name ?? f.organ_system ?? null;
    if (fOrgan !== organName) continue;

    // Sex filter: only include findings matching cohort sexes
    if (f.sex && !cohortSexes.has(f.sex)) continue;

    // Build subject values map
    const subjectValues: Record<string, number | string | null> = {};
    if (CONTINUOUS_DOMAINS.has(f.domain) && f.raw_subject_values) {
      for (const entry of f.raw_subject_values) {
        for (const [id, val] of Object.entries(entry)) {
          if (subjectIds.has(id)) {
            subjectValues[id] = val;
          }
        }
      }
    }
    // CL: use onset days as per-subject values
    if (f.domain === "CL" && f.raw_subject_onset_days) {
      for (const entry of f.raw_subject_onset_days) {
        for (const [id, val] of Object.entries(entry)) {
          if (subjectIds.has(id)) {
            subjectValues[id] = val;
          }
        }
      }
    }

    // For incidence domains without per-subject data: include if group_stats
    // show data at cohort dose levels
    let hasRelevantData = Object.keys(subjectValues).length > 0;
    if (!hasRelevantData && !CONTINUOUS_DOMAINS.has(f.domain)) {
      for (const gs of f.group_stats ?? []) {
        if (cohortDoseLevels.has(gs.dose_level)) {
          hasRelevantData = true;
          break;
        }
      }
    }

    if (!hasRelevantData) continue;

    const groupStats: GroupStatEntry[] = (f.group_stats ?? []).map((gs: GroupStat) => ({
      doseLevel: gs.dose_level,
      n: gs.n,
      mean: gs.mean,
      sd: gs.sd,
      affected: gs.affected ?? null,
      incidence: gs.incidence ?? null,
    }));

    rows.push({
      key: `${f.domain}-${f.finding}-${f.day ?? "all"}-${f.sex}`,
      domain: f.domain,
      finding: f.finding,
      testCode: f.test_code,
      organName,
      sex: f.sex,
      day: f.day,
      severity: f.severity,
      direction: f.direction,
      findingId: f.id,
      groupStats,
      subjectValues,
      dataType: f.data_type,
      maxFoldChange: f.max_fold_change ?? null,
      maxIncidence: f.max_incidence ?? null,
    });
  }

  // Sort by domain priority, then by signal strength
  rows.sort((a, b) => {
    const domA = DOMAIN_ORDER[a.domain] ?? 9;
    const domB = DOMAIN_ORDER[b.domain] ?? 9;
    if (domA !== domB) return domA - domB;
    const sigA = a.maxIncidence ?? a.maxFoldChange ?? 0;
    const sigB = b.maxIncidence ?? b.maxFoldChange ?? 0;
    return Math.abs(sigB) - Math.abs(sigA);
  });

  return rows;
}

// ── Shared findings ──────────────────────────────────────────

export function computeSharedFindings(
  findings: UnifiedFinding[],
  activeSubjects: CohortSubject[],
): SharedFinding[] {
  const subjectIds = new Set(activeSubjects.map((s) => s.usubjid));
  const cohortDoseLevels = new Set(activeSubjects.map((s) => s.doseGroupOrder));
  const shared: SharedFinding[] = [];

  for (const f of findings) {
    if (f.severity === "normal") continue; // Only share notable findings

    let isShared = false;

    if (CONTINUOUS_DOMAINS.has(f.domain) && f.raw_subject_values) {
      // Continuous: every active subject must have a value
      const subjectsWithValue = new Set<string>();
      for (const entry of f.raw_subject_values) {
        for (const [id, val] of Object.entries(entry)) {
          if (subjectIds.has(id) && val != null) subjectsWithValue.add(id);
        }
      }
      isShared = subjectsWithValue.size === subjectIds.size;
    } else if (!CONTINUOUS_DOMAINS.has(f.domain)) {
      // Incidence: "shared" means all cohort dose levels have this finding
      // (we can't know per-subject, so use dose-level coverage as proxy)
      const doseLevelsWithData = new Set<number>();
      for (const gs of f.group_stats ?? []) {
        if (gs.dose_level > 0 && (gs.affected ?? 0) > 0) {
          doseLevelsWithData.add(gs.dose_level);
        }
      }
      const nonControlDoseLevels = new Set([...cohortDoseLevels].filter((d) => d > 0));
      isShared = nonControlDoseLevels.size > 0 &&
        [...nonControlDoseLevels].every((d) => doseLevelsWithData.has(d));
    }

    if (isShared) {
      shared.push({
        domain: f.domain,
        finding: f.finding,
        direction: f.direction,
        severity: f.severity,
      });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const deduped: SharedFinding[] = [];
  for (const s of shared) {
    const key = `${s.domain}-${s.finding}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }

  // Sort: adverse first, then domain priority
  deduped.sort((a, b) => {
    if (a.severity === "adverse" && b.severity !== "adverse") return -1;
    if (b.severity === "adverse" && a.severity !== "adverse") return 1;
    return (DOMAIN_ORDER[a.domain] ?? 9) - (DOMAIN_ORDER[b.domain] ?? 9);
  });

  return deduped;
}

// ── Per-subject organ involvement (for rail enrichment) ─────

/**
 * For each subject, count distinct organs where the subject has findings.
 * Continuous domains: check raw_subject_values. CL: check raw_subject_onset_days.
 * MI/MA: proxy via dose-level incidence (individual data not in unified_findings).
 */
export function computeSubjectOrganCounts(
  findings: UnifiedFinding[],
  allSubjects: CohortSubject[],
): Map<string, number> {
  const subjectOrgans = new Map<string, Set<string>>();

  for (const f of findings) {
    const organ = f.organ_name ?? f.organ_system ?? null;
    if (!organ) continue;

    // Continuous domains with per-subject values
    if (f.raw_subject_values) {
      for (const entry of f.raw_subject_values) {
        for (const [id, val] of Object.entries(entry)) {
          if (val != null) {
            if (!subjectOrgans.has(id)) subjectOrgans.set(id, new Set());
            subjectOrgans.get(id)!.add(organ);
          }
        }
      }
    }
    // CL onset days
    if (f.raw_subject_onset_days) {
      for (const entry of f.raw_subject_onset_days) {
        for (const [id, val] of Object.entries(entry)) {
          if (val != null) {
            if (!subjectOrgans.has(id)) subjectOrgans.set(id, new Set());
            subjectOrgans.get(id)!.add(organ);
          }
        }
      }
    }
    // MI/MA proxy: dose-level incidence → attribute to all subjects at that dose+sex
    if (!f.raw_subject_values && !f.raw_subject_onset_days) {
      const affectedDoseLevels = new Set<number>();
      for (const gs of f.group_stats ?? []) {
        if (gs.dose_level > 0 && ((gs.affected ?? 0) > 0 || (gs.incidence ?? 0) > 0)) {
          affectedDoseLevels.add(gs.dose_level);
        }
      }
      if (affectedDoseLevels.size > 0) {
        for (const s of allSubjects) {
          if (affectedDoseLevels.has(s.doseGroupOrder) && (!f.sex || s.sex === f.sex)) {
            if (!subjectOrgans.has(s.usubjid)) subjectOrgans.set(s.usubjid, new Set());
            subjectOrgans.get(s.usubjid)!.add(organ);
          }
        }
      }
    }
  }

  const result = new Map<string, number>();
  for (const [id, organs] of subjectOrgans) {
    result.set(id, organs.size);
  }
  return result;
}
