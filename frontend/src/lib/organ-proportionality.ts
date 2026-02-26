/**
 * Organ Proportionality Index (OPI) computation for XS09 wasting syndrome.
 *
 * OPI = (organ weight Δ% from control) / (body weight Δ% from control)
 * Computed per-sex — M and F BW Δ% are separate denominators.
 */

import type { UnifiedFinding, GroupStat } from "@/types/analysis";
import type { RecoveryRow } from "@/lib/syndrome-interpretation-types";

// ─── Types ──────────────────────────────────────────────────

export type OpiClassification =
  | "proportionate"
  | "partially_proportionate"
  | "disproportionate"
  | "inverse"
  | "not_applicable";

export type MiConcordance =
  | "concordant_proportionate"
  | "concordant_disproportionate"
  | "discordant_weight_only"
  | "discordant_mi_only"
  | "mi_not_collected"
  | "mi_only";

export interface DoseOpiDetail {
  doseLevel: number;
  bwDeltaPct: number;
  organWtDeltaPct: number | null;
  opi: number | null;
  classification: OpiClassification;
}

export interface OrganOpiRow {
  organ: string;
  sex: string;
  organWtDeltaPct: number | null;
  bwDeltaPct: number;
  opi: number | null;
  classification: OpiClassification;
  absWt: number | null;
  relWt: number | null;
  miStatus: "finding_present" | "examined_clean" | "not_examined";
  miFindings: string[];
  miSeverity: number | null;
  miIncidence: string | null;
  concordance: MiConcordance;
  recoveryResolutionPct: number | null;
  recoveryStatus: "recovered" | "partial" | "not_recovered" | null;
  byDose: DoseOpiDetail[];
}

export interface SexSummary {
  bwDeltaPct: number;
  disproportionateCount: number;
  proportionateCount: number;
  inverseCount: number;
  partiallyProportionateCount: number;
  notApplicableCount: number;
  totalAssessed: number;
  disproportionateOrgans: string[];
  inverseOrgans: string[];
}

export interface OrganProportionalityResult {
  available: boolean;
  bwDeltaPct: Record<string, number>;
  organs: OrganOpiRow[];
  bySex: Record<string, SexSummary>;
  narrative: string;
  caveats: string[];
}

// ─── Constants ──────────────────────────────────────────────

/** Sex-limited organs — safety net filter (data-first filtering is primary) */
const MALE_ONLY_ORGANS = new Set([
  "testis", "testes", "epididymis", "epididymides", "prostate", "seminal vesicle", "seminal vesicles",
]);
const FEMALE_ONLY_ORGANS = new Set([
  "uterus", "ovary", "ovaries", "mammary gland",
]);

/** MI terms indicating atrophy/degeneration */
const ATROPHY_TERMS = [
  "atrophy", "atrophic", "degeneration", "degenerative", "necrosis",
  "necrotic", "decreased cellularity", "hypocellularity", "aplasia",
  "hypoplasia", "involution",
];

/** Paired organs — normalize to singular combined name */
const PAIRED_ORGAN_ALIASES: Record<string, string> = {
  "kidneys": "kidney",
  "kidney": "kidney",
  "adrenals": "adrenal",
  "adrenal": "adrenal",
  "gland, adrenal": "adrenal",
  "testes": "testis",
  "testis": "testis",
  "ovaries": "ovary",
  "ovary": "ovary",
  "epididymides": "epididymis",
  "epididymis": "epididymis",
};

const BW_DELTA_THRESHOLD = 5; // below this, OPI is not_applicable

// ─── Main computation ───────────────────────────────────────

export function computeOrganProportionality(
  findings: UnifiedFinding[],
  recoveryRows: RecoveryRow[],
  /** Optional driver context (e.g., "secondary to FC") appended to narrative */
  driver?: string | null,
): OrganProportionalityResult {
  // 1. Extract BW data per sex
  const bwFindings = findings.filter(
    (f) => f.domain === "BW" && f.test_code === "BW",
  );
  const bwDeltaPct = computeBwDelta(bwFindings);
  // Per-dose BW deltas for dose-by-dose OPI
  const bwDeltaByDoseSex = computeBwDeltaByDoseSex(bwFindings);
  // Terminal BW mean at highest dose per sex (for relWt = organWt / terminalBW × 100)
  const terminalBwMean = computeTerminalBwMean(bwFindings);

  // No BW data → not available
  if (Object.keys(bwDeltaPct).length === 0) {
    return makeUnavailable();
  }

  // 2. Extract OM data per organ per sex
  const omFindings = findings.filter((f) => f.domain === "OM");
  if (omFindings.length === 0) {
    return makeUnavailable();
  }

  // 3. Extract MI data for cross-reference
  const miFindings = findings.filter((f) => f.domain === "MI");

  // 4. Build organ rows
  const rows: OrganOpiRow[] = [];
  const omByOrganSex = groupOmByOrganSex(omFindings);

  for (const [key, omFs] of omByOrganSex) {
    const [organ, sex] = key.split("|");

    // Filter sex-limited organs
    if (sex === "F" && isMaleOnlyOrgan(organ)) continue;
    if (sex === "M" && isFemaleOnlyOrgan(organ)) continue;

    const sexBwDelta = bwDeltaPct[sex];
    if (sexBwDelta === undefined) continue;

    // Compute organ weight Δ% from control vs highest dose
    const organDelta = computeOrganDelta(omFs);
    const byDose = computeByDose(omFs, bwDeltaPct[sex], sex, bwDeltaByDoseSex);

    // OPI classification
    const opi = computeOpi(organDelta, sexBwDelta);
    const classification = classifyOpi(opi, sexBwDelta);

    // MI cross-reference
    const mi = crossReferenceMi(organ, sex, miFindings);

    // Concordance
    const concordance = classifyConcordance(classification, mi);

    // Recovery
    const recovery = matchRecovery(organ, sex, organDelta, recoveryRows);

    // Absolute weight at highest dose
    const absWt = getHighestDoseMean(omFs);
    // Relative weight: organ / terminal BW × 100
    const bwMean = terminalBwMean[sex];
    const relWt = absWt != null && bwMean != null && bwMean > 0
      ? (absWt / bwMean) * 100
      : null;

    rows.push({
      organ,
      sex,
      organWtDeltaPct: organDelta,
      bwDeltaPct: sexBwDelta,
      opi,
      classification,
      absWt,
      relWt,
      miStatus: mi.status,
      miFindings: mi.findings,
      miSeverity: mi.severity,
      miIncidence: mi.incidence,
      concordance,
      recoveryResolutionPct: recovery.resolutionPct,
      recoveryStatus: recovery.status,
      byDose,
    });
  }

  // Add MI-only organs (MI finding but no OM data)
  const omOrgans = new Set(rows.map((r) => `${normalizeOrgan(r.organ)}|${r.sex}`));
  const miBySpecimenSex = groupMiBySpecimenSex(miFindings);
  for (const [key, miFs] of miBySpecimenSex) {
    if (omOrgans.has(key)) continue;
    const [specimen, sex] = key.split("|");
    if (sex === "F" && isMaleOnlyOrgan(specimen)) continue;
    if (sex === "M" && isFemaleOnlyOrgan(specimen)) continue;

    const sexBwDelta = bwDeltaPct[sex];
    if (sexBwDelta === undefined) continue;

    // Check if any finding has atrophy terms
    const atrophyFindings = miFs.filter((f) =>
      hasAtrophyTerm(f.finding),
    );
    if (atrophyFindings.length === 0) continue;

    const mi = extractMiInfo(miFs);

    rows.push({
      organ: specimen,
      sex,
      organWtDeltaPct: null,
      bwDeltaPct: sexBwDelta,
      opi: null,
      classification: "not_applicable",
      absWt: null,
      relWt: null,
      miStatus: "finding_present",
      miFindings: mi.findings,
      miSeverity: mi.severity,
      miIncidence: mi.incidence,
      concordance: "mi_only",
      recoveryResolutionPct: null,
      recoveryStatus: null,
      byDose: [],
    });
  }

  // Sort by concern level
  rows.sort(organSortComparator);

  // Build per-sex summaries
  const bySex: Record<string, SexSummary> = {};
  for (const sex of Object.keys(bwDeltaPct)) {
    const sexRows = rows.filter((r) => r.sex === sex && r.concordance !== "mi_only");
    bySex[sex] = {
      bwDeltaPct: bwDeltaPct[sex],
      disproportionateCount: sexRows.filter((r) => r.classification === "disproportionate").length,
      proportionateCount: sexRows.filter((r) => r.classification === "proportionate").length,
      inverseCount: sexRows.filter((r) => r.classification === "inverse").length,
      partiallyProportionateCount: sexRows.filter((r) => r.classification === "partially_proportionate").length,
      notApplicableCount: sexRows.filter((r) => r.classification === "not_applicable").length,
      totalAssessed: sexRows.length,
      disproportionateOrgans: sexRows.filter((r) => r.classification === "disproportionate").map((r) => r.organ),
      inverseOrgans: sexRows.filter((r) => r.classification === "inverse").map((r) => r.organ),
    };
  }

  const caveats = generateCaveats(bwDeltaPct, bySex, rows);
  const narrative = generateNarrative(bySex, driver);

  return {
    available: true,
    bwDeltaPct,
    organs: rows,
    bySex,
    narrative,
    caveats,
  };
}

// ─── BW delta computation ───────────────────────────────────

function computeBwDelta(bwFindings: UnifiedFinding[]): Record<string, number> {
  const result: Record<string, number> = {};

  // Group by sex, pick highest day (terminal)
  const bySex = new Map<string, UnifiedFinding[]>();
  for (const f of bwFindings) {
    const arr = bySex.get(f.sex) ?? [];
    arr.push(f);
    bySex.set(f.sex, arr);
  }

  for (const [sex, fs] of bySex) {
    // Use highest day to get terminal BW
    const maxDay = Math.max(...fs.map((f) => f.day ?? 0));
    const terminal = fs.filter((f) => (f.day ?? 0) === maxDay);
    // If multiple at same day, use first
    const f = terminal[0];
    if (!f?.group_stats?.length) continue;

    const controlMean = getControlMean(f.group_stats);
    const highDoseMean = getHighestDoseMean2(f.group_stats);
    if (controlMean == null || controlMean === 0 || highDoseMean == null) continue;

    result[sex] = ((highDoseMean - controlMean) / controlMean) * 100;
  }

  return result;
}

/** Compute BW Δ% per (dose_level, sex) for dose-by-dose OPI */
function computeBwDeltaByDoseSex(bwFindings: UnifiedFinding[]): Map<string, number> {
  const result = new Map<string, number>();

  // Group by sex, pick highest day (terminal)
  const bySex = new Map<string, UnifiedFinding[]>();
  for (const f of bwFindings) {
    const arr = bySex.get(f.sex) ?? [];
    arr.push(f);
    bySex.set(f.sex, arr);
  }

  for (const [sex, fs] of bySex) {
    const maxDay = Math.max(...fs.map((f) => f.day ?? 0));
    const terminal = fs.filter((f) => (f.day ?? 0) === maxDay);
    const f = terminal[0];
    if (!f?.group_stats?.length) continue;

    const controlMean = getControlMean(f.group_stats);
    if (controlMean == null || controlMean === 0) continue;

    for (const g of f.group_stats) {
      if (g.dose_level === 0 || g.mean == null) continue;
      const delta = ((g.mean - controlMean) / controlMean) * 100;
      result.set(`${g.dose_level}|${sex}`, delta);
    }
  }

  return result;
}

/** Compute terminal BW mean at highest dose per sex (for relWt computation) */
function computeTerminalBwMean(bwFindings: UnifiedFinding[]): Record<string, number> {
  const result: Record<string, number> = {};

  const bySex = new Map<string, UnifiedFinding[]>();
  for (const f of bwFindings) {
    const arr = bySex.get(f.sex) ?? [];
    arr.push(f);
    bySex.set(f.sex, arr);
  }

  for (const [sex, fs] of bySex) {
    const maxDay = Math.max(...fs.map((f) => f.day ?? 0));
    const terminal = fs.filter((f) => (f.day ?? 0) === maxDay);
    const f = terminal[0];
    if (!f?.group_stats?.length) continue;

    const highDoseMean = getHighestDoseMean2(f.group_stats);
    if (highDoseMean != null) {
      result[sex] = highDoseMean;
    }
  }

  return result;
}

// ─── OM delta computation ───────────────────────────────────

/** Normalize paired organ name (kidneys → kidney, testes → testis, etc.) */
function normalizePairedOrgan(name: string): string {
  const lower = normalizeOrgan(name);
  return PAIRED_ORGAN_ALIASES[lower] ?? name;
}

function groupOmByOrganSex(omFindings: UnifiedFinding[]): Map<string, UnifiedFinding[]> {
  const map = new Map<string, UnifiedFinding[]>();
  for (const f of omFindings) {
    const rawOrgan = f.specimen ?? f.finding;
    // Normalize paired organs so L/R entries combine
    const organ = normalizePairedOrgan(rawOrgan);
    const key = `${organ}|${f.sex}`;
    const arr = map.get(key) ?? [];
    arr.push(f);
    map.set(key, arr);
  }
  return map;
}

function computeOrganDelta(omFindings: UnifiedFinding[]): number | null {
  // Use the first finding's group_stats (all findings for same organ/sex should share stats)
  const f = omFindings[0];
  if (!f?.group_stats?.length) return null;

  const controlMean = getControlMean(f.group_stats);
  const highDoseMean = getHighestDoseMean2(f.group_stats);
  if (controlMean == null || controlMean === 0 || highDoseMean == null) return null;

  return ((highDoseMean - controlMean) / controlMean) * 100;
}

function computeByDose(
  omFindings: UnifiedFinding[],
  fallbackBwDelta: number,
  sex: string,
  bwDeltaByDoseSex: Map<string, number>,
): DoseOpiDetail[] {
  const f = omFindings[0];
  if (!f?.group_stats?.length) return [];

  const controlMean = getControlMean(f.group_stats);
  if (controlMean == null || controlMean === 0) return [];

  const details: DoseOpiDetail[] = [];
  const nonControl = f.group_stats
    .filter((g) => g.dose_level > 0)
    .sort((a, b) => a.dose_level - b.dose_level);

  for (const g of nonControl) {
    if (g.mean == null) continue;
    const organDelta = ((g.mean - controlMean) / controlMean) * 100;
    // Use per-dose BW Δ% if available, fall back to terminal (highest dose) BW Δ%
    const doseBwDelta = bwDeltaByDoseSex.get(`${g.dose_level}|${sex}`) ?? fallbackBwDelta;
    const opi = computeOpi(organDelta, doseBwDelta);
    const classification = classifyOpi(opi, doseBwDelta);
    details.push({
      doseLevel: g.dose_level,
      bwDeltaPct: doseBwDelta,
      organWtDeltaPct: organDelta,
      opi,
      classification,
    });
  }

  return details;
}

// ─── OPI classification ─────────────────────────────────────

function computeOpi(organDelta: number | null, bwDelta: number): number | null {
  if (organDelta == null) return null;
  if (Math.abs(bwDelta) < BW_DELTA_THRESHOLD) return null;
  if (bwDelta === 0) return null;
  return organDelta / bwDelta;
}

// @field FIELD-12 — OPI classification (proportionate/disproportionate/inverse)
export function classifyOpi(opi: number | null, bwDelta: number): OpiClassification {
  if (Math.abs(bwDelta) < BW_DELTA_THRESHOLD) return "not_applicable";
  if (opi == null) return "not_applicable";

  // For negative BW delta (weight loss), negative organ delta is expected
  // OPI > 0 and 0.7-1.3 means proportionate
  // But if organ went UP while BW went DOWN, OPI is negative → inverse
  if (opi < 0) return "inverse";
  if (opi < 0.3) return "inverse";
  if (opi >= 0.3 && opi < 0.7) return "partially_proportionate";
  if (opi >= 0.7 && opi <= 1.3) return "proportionate";
  return "disproportionate";
}

// ─── MI cross-reference ─────────────────────────────────────

interface MiInfo {
  status: "finding_present" | "examined_clean" | "not_examined";
  findings: string[];
  severity: number | null;
  incidence: string | null;
}

function crossReferenceMi(
  organ: string,
  sex: string,
  miFindings: UnifiedFinding[],
): MiInfo {
  const normalOrgan = normalizeOrgan(organ);
  const matched = miFindings.filter(
    (f) =>
      f.sex === sex &&
      f.specimen != null &&
      normalizeOrgan(f.specimen) === normalOrgan,
  );

  if (matched.length === 0) {
    return {
      status: "not_examined",
      findings: [],
      severity: null,
      incidence: null,
    };
  }

  // Check for atrophy/degeneration terms
  const atrophyMatches = matched.filter((f) => hasAtrophyTerm(f.finding));
  if (atrophyMatches.length > 0) {
    return extractMiInfo(atrophyMatches);
  }

  // Examined but no atrophy findings
  return {
    status: "examined_clean",
    findings: matched.map((f) => f.finding),
    severity: null,
    incidence: buildIncidence(matched),
  };
}

function extractMiInfo(miFs: UnifiedFinding[]): MiInfo {
  const findings = [...new Set(miFs.map((f) => f.finding))];
  const severity = miFs.reduce((max, f) => {
    const s = f.avg_severity ?? 0;
    return s > max ? s : max;
  }, 0);

  return {
    status: "finding_present",
    findings,
    severity: severity > 0 ? severity : null,
    incidence: buildIncidence(miFs),
  };
}

function buildIncidence(miFs: UnifiedFinding[]): string | null {
  if (miFs.length === 0) return null;
  const f = miFs[0];
  if (!f.group_stats?.length) return null;

  const controlGroup = f.group_stats.find((g) => g.dose_level === 0);
  const highDose = f.group_stats
    .filter((g) => g.dose_level > 0)
    .sort((a, b) => b.dose_level - a.dose_level)[0];

  if (!highDose) return null;

  const txAffected = highDose.affected ?? 0;
  const txN = highDose.n;
  const ctrlAffected = controlGroup?.affected ?? 0;
  const ctrlN = controlGroup?.n ?? 0;

  return `${txAffected}/${txN} vs ${ctrlAffected}/${ctrlN}`;
}

// ─── MI grouping ────────────────────────────────────────────

function groupMiBySpecimenSex(miFindings: UnifiedFinding[]): Map<string, UnifiedFinding[]> {
  const map = new Map<string, UnifiedFinding[]>();
  for (const f of miFindings) {
    if (!f.specimen) continue;
    const key = `${normalizeOrgan(f.specimen)}|${f.sex}`;
    const arr = map.get(key) ?? [];
    arr.push(f);
    map.set(key, arr);
  }
  return map;
}

// ─── Concordance classification ─────────────────────────────

function classifyConcordance(
  classification: OpiClassification,
  mi: MiInfo,
): MiConcordance {
  if (mi.status === "not_examined") return "mi_not_collected";

  const hasAtrophy = mi.status === "finding_present";
  const isProportionate = classification === "proportionate";
  const isDisproportionate = classification === "disproportionate" || classification === "inverse";
  const isPartial = classification === "partially_proportionate";

  if (isProportionate && !hasAtrophy) return "concordant_proportionate";
  if (isProportionate && hasAtrophy) return "discordant_mi_only";
  if (isDisproportionate && hasAtrophy) return "concordant_disproportionate";
  if (isDisproportionate && !hasAtrophy) return "discordant_weight_only";
  if (isPartial && hasAtrophy) return "concordant_disproportionate";
  if (isPartial && !hasAtrophy) return "concordant_proportionate";

  return "mi_not_collected";
}

// ─── Recovery matching ──────────────────────────────────────

function matchRecovery(
  organ: string,
  sex: string,
  terminalDelta: number | null,
  recoveryRows: RecoveryRow[],
): { resolutionPct: number | null; status: "recovered" | "partial" | "not_recovered" | null } {
  if (terminalDelta == null || recoveryRows.length === 0) {
    return { resolutionPct: null, status: null };
  }

  const normalOrgan = normalizeOrgan(organ);
  const matched = recoveryRows.filter(
    (r) =>
      r.sex === sex &&
      normalizeOrgan(r.endpoint_label).includes(normalOrgan),
  );

  if (matched.length === 0) {
    return { resolutionPct: null, status: null };
  }

  // Use highest dose recovery row
  const row = matched.sort((a, b) => b.dose_level - a.dose_level)[0];
  if (row.terminal_effect == null || row.effect_size == null) {
    return { resolutionPct: null, status: null };
  }

  // Resolution % = ((terminal effect - recovery effect) / terminal effect) * 100
  const termEffect = Math.abs(row.terminal_effect);
  const recEffect = Math.abs(row.effect_size);
  if (termEffect === 0) return { resolutionPct: null, status: null };

  const resolutionPct = ((termEffect - recEffect) / termEffect) * 100;

  let status: "recovered" | "partial" | "not_recovered";
  if (resolutionPct >= 80) status = "recovered";
  else if (resolutionPct >= 30) status = "partial";
  else status = "not_recovered";

  return { resolutionPct, status };
}

// ─── Narrative generation ───────────────────────────────────

function generateNarrative(
  bySex: Record<string, SexSummary>,
  driver?: string | null,
): string {
  const sexes = Object.keys(bySex).sort();
  if (sexes.length === 0) return "";

  const driverSuffix = driver ? `; driver: ${driver}` : "";

  const sexesDiverge = checkSexDivergence(bySex);

  // Also show per-sex narrative when BW deltas diverge by >10pp (spec requirement)
  const bwDiverges = sexes.length === 2 &&
    Math.abs(bySex[sexes[0]].bwDeltaPct - bySex[sexes[1]].bwDeltaPct) > 10;

  if (sexesDiverge || bwDiverges) {
    // Per-sex narrative
    const parts = sexes.map((sex) => {
      const s = bySex[sex];
      const dispCount = s.disproportionateCount + s.inverseCount;
      const dispOrgans = [...s.disproportionateOrgans, ...s.inverseOrgans];
      if (dispCount > 0) {
        return `${sex} (BW ${formatDelta(s.bwDeltaPct)}): ${dispOrgans.join(", ")} disproportionate; ${s.proportionateCount} proportionate`;
      }
      return `${sex} (BW ${formatDelta(s.bwDeltaPct)}): all proportionate`;
    });
    return parts.join(". ") + driverSuffix;
  }

  // Pooled narrative
  const totalDisprop = sexes.reduce(
    (sum, s) => sum + bySex[s].disproportionateCount + bySex[s].inverseCount,
    0,
  );
  const totalProp = sexes.reduce(
    (sum, s) => sum + bySex[s].proportionateCount,
    0,
  );

  if (totalDisprop === 0) {
    const perSexCounts = sexes.map((s) => `${s}: ${bySex[s].totalAssessed} organs`).join(", ");
    return `All weighed organs proportionate to BW decrease (${perSexCounts}); no evidence of direct organ toxicity`;
  }

  const allDispOrgans = [
    ...new Set(sexes.flatMap((s) => [...bySex[s].disproportionateOrgans, ...bySex[s].inverseOrgans])),
  ];
  return `${totalDisprop} organ${totalDisprop !== 1 ? "s" : ""} disproportionate (${allDispOrgans.join(", ")}); ${totalProp} proportionate${driverSuffix}`;
}

// ─── Caveat generation ──────────────────────────────────────

function generateCaveats(
  bwDeltaPct: Record<string, number>,
  _bySex: Record<string, SexSummary>,
  rows: OrganOpiRow[],
): string[] {
  const caveats: string[] = [];
  const sexes = Object.keys(bwDeltaPct).sort();

  // BW > 30%
  for (const sex of sexes) {
    if (Math.abs(bwDeltaPct[sex]) > 30) {
      const label = sex === "M" ? "males" : "females";
      caveats.push(
        `BW decrease exceeds 30% (${label}). OPI may be unreliable for BW-resistant organs (brain) and BW-hypersensitive organs (thymus, fat pads).`,
      );
    }
  }

  // Sex-divergent BW
  if (sexes.length === 2) {
    const diff = Math.abs(bwDeltaPct[sexes[0]] - bwDeltaPct[sexes[1]]);
    if (diff > 10) {
      caveats.push(
        `Sex-divergent BW loss (F: ${formatDelta(bwDeltaPct["F"] ?? bwDeltaPct[sexes[0]])}%, M: ${formatDelta(bwDeltaPct["M"] ?? bwDeltaPct[sexes[1]])}%). OPI classifications differ between sexes — review M and F separately.`,
      );
    }
  }

  // Brain OPI < 0.3
  const brainRows = rows.filter((r) => normalizeOrgan(r.organ) === "brain" && r.opi != null && r.opi < 0.3);
  if (brainRows.length > 0) {
    caveats.push("Brain OPI < 0.3 is expected (BW-resistant organ), not inverse.");
  }

  // Uterus without estrous staging
  const uterusRows = rows.filter((r) => normalizeOrgan(r.organ) === "uterus");
  if (uterusRows.length > 0) {
    caveats.push("Uterine weight varies with estrous cycle; OPI unreliable without staging data.");
  }

  // Adrenal increase + thymus decrease pattern
  const adrenalInverse = rows.some(
    (r) => normalizeOrgan(r.organ) === "adrenal" && r.classification === "inverse",
  );
  const thymusDecreased = rows.some(
    (r) => normalizeOrgan(r.organ) === "thymus" && (r.organWtDeltaPct ?? 0) < 0,
  );
  if (adrenalInverse && thymusDecreased) {
    caveats.push(
      "Adrenal increase + thymus decrease pattern consistent with stress response (Everds 2013).",
    );
  }

  // Organ classifies differently between sexes
  const organSexMap = new Map<string, Map<string, OpiClassification>>();
  for (const r of rows) {
    if (r.classification === "not_applicable") continue;
    const norm = normalizeOrgan(r.organ);
    if (!organSexMap.has(norm)) organSexMap.set(norm, new Map());
    organSexMap.get(norm)!.set(r.sex, r.classification);
  }
  for (const [organ, sexMap] of organSexMap) {
    if (sexMap.size < 2) continue;
    const classes = [...sexMap.values()];
    if (classes[0] !== classes[1]) {
      const entries = [...sexMap.entries()];
      caveats.push(
        `${capitalizeFirst(organ)} classifies differently by sex (${entries.map(([s, c]) => `${c.replace(/_/g, " ")} in ${s}`).join(" vs ")}) — evaluate independently.`,
      );
    }
  }

  return caveats;
}

// ─── Helpers ────────────────────────────────────────────────

function makeUnavailable(): OrganProportionalityResult {
  return {
    available: false,
    bwDeltaPct: {},
    organs: [],
    bySex: {},
    narrative: "",
    caveats: [],
  };
}

function normalizeOrgan(name: string): string {
  return name.toLowerCase().trim()
    .replace(/\s*\(.*\)$/, "")  // strip parenthetical
    .replace(/\s+/g, " ");
}

function isMaleOnlyOrgan(organ: string): boolean {
  return MALE_ONLY_ORGANS.has(normalizeOrgan(organ));
}

function isFemaleOnlyOrgan(organ: string): boolean {
  return FEMALE_ONLY_ORGANS.has(normalizeOrgan(organ));
}

function hasAtrophyTerm(finding: string): boolean {
  const lower = finding.toLowerCase();
  return ATROPHY_TERMS.some((t) => lower.includes(t));
}

function getControlMean(stats: GroupStat[]): number | null {
  const ctrl = stats.find((g) => g.dose_level === 0);
  return ctrl?.mean ?? null;
}

function getHighestDoseMean2(stats: GroupStat[]): number | null {
  const sorted = stats
    .filter((g) => g.dose_level > 0 && g.mean != null)
    .sort((a, b) => b.dose_level - a.dose_level);
  return sorted[0]?.mean ?? null;
}

function getHighestDoseMean(omFindings: UnifiedFinding[]): number | null {
  const f = omFindings[0];
  if (!f?.group_stats?.length) return null;
  return getHighestDoseMean2(f.group_stats);
}

function formatDelta(pct: number): string {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${Math.round(pct)}%`;
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Sort comparator: inverse → disproportionate → partial → proportionate → n/a, then |OPI-1| desc */
function organSortComparator(a: OrganOpiRow, b: OrganOpiRow): number {
  const order: Record<OpiClassification, number> = {
    inverse: 0,
    disproportionate: 1,
    partially_proportionate: 2,
    proportionate: 3,
    not_applicable: 4,
  };
  const diff = order[a.classification] - order[b.classification];
  if (diff !== 0) return diff;

  // Within same classification, sort by |OPI - 1.0| descending
  const aOpiDist = a.opi != null ? Math.abs(a.opi - 1.0) : 0;
  const bOpiDist = b.opi != null ? Math.abs(b.opi - 1.0) : 0;
  return bOpiDist - aOpiDist;
}

/** Check if sexes diverge in their OPI patterns */
export function checkSexDivergence(bySex: Record<string, SexSummary>): boolean {
  const sexes = Object.keys(bySex).sort();
  if (sexes.length < 2) return false;

  const a = bySex[sexes[0]];
  const b = bySex[sexes[1]];

  // Different sets of disproportionate organs
  const aSet = new Set([...a.disproportionateOrgans, ...a.inverseOrgans].map(normalizeOrgan));
  const bSet = new Set([...b.disproportionateOrgans, ...b.inverseOrgans].map(normalizeOrgan));

  if (aSet.size !== bSet.size) return true;
  for (const o of aSet) {
    if (!bSet.has(o)) return true;
  }

  // Counts differ by more than 1
  const aTotalFlagged = a.disproportionateCount + a.inverseCount;
  const bTotalFlagged = b.disproportionateCount + b.inverseCount;
  if (Math.abs(aTotalFlagged - bTotalFlagged) > 1) return true;

  return false;
}
