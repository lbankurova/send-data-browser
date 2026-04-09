/**
 * Pure merge logic for the Outliers pane — combines LOO, sentinel, and influence
 * data into a unified subject list for display.
 *
 * Extracted to enable unit testing independent of React (AC-15).
 */
import type { UnifiedFinding } from "@/types/analysis";
import type {
  SubjectSentinelData,
  SentinelAnimal,
  SentinelEndpointDetail,
  AnimalInfluenceData,
} from "@/types/analysis-views";
import { LOO_THRESHOLD } from "@/lib/loo-constants";

export interface MergedOutlierSubject {
  usubjid: string;
  doseLevel: number;
  sex: string;
  isLoo: boolean;
  isBio: boolean;
  bioType: "outlier" | "sole" | "non-resp" | null;
  zScore: number | null;
  instability: number | null;
  poc: Record<string, number> | null;
  days: number[];
  worstRatio: number | null;
  alarmScore: number | null;
  /** True when the finding is an incidence sole finding and LOO is tautological. */
  looTautological: boolean;
}

// ── Sentinel endpoint matching ─────────────────────────────────
// Sentinel endpoint_name uses short test codes (ALT, BW, INFLAMMATION) that
// do NOT match findings' endpoint_label (Alanine Aminotransferase, Body Weight,
// EPIDIDYMIS – ASPERMIA). For incidence (MI/MA), match via endpoint_id parsing
// against the finding's test_code. For continuous, influence data (100% match)
// is used instead.

function matchSentinelToFinding(
  detail: SentinelEndpointDetail,
  domain: string,
  testCode: string,
): boolean {
  if (detail.domain !== domain) return false;
  // MI/MA: endpoint_id format is "domain:organ_finding:organ:sex"
  // organ_finding matches finding.test_code case-insensitively
  const parts = detail.endpoint_id.split(":");
  if (parts.length >= 2) {
    return parts[1].toUpperCase() === testCode.toUpperCase();
  }
  return false;
}

export function mergeOutlierSubjects(
  finding: Pick<
    UnifiedFinding,
    "endpoint_label" | "finding" | "domain" | "sex" | "test_code" | "data_type"
  >,
  allFindings: UnifiedFinding[],
  sentinelData: SubjectSentinelData | undefined,
  influenceData: AnimalInfluenceData | undefined,
): MergedOutlierSubject[] {
  const endpointLabel = finding.endpoint_label ?? finding.finding;
  const outlierZ = sentinelData?.thresholds?.outlier_z ?? 3.5;

  // Pre-compute sentinel animal lookup (Array -> Map)
  const sentinelBySubject = new Map<string, SentinelAnimal>();
  if (sentinelData) {
    for (const a of sentinelData.animals) {
      sentinelBySubject.set(a.subject_id, a);
    }
  }

  // Pre-compute influence animal sex lookup
  const influenceSexBySubject = new Map<string, string>();
  if (influenceData) {
    for (const a of influenceData.animals) {
      influenceSexBySubject.set(a.subject_id, a.sex);
    }
  }

  const merged = new Map<string, MergedOutlierSubject>();

  // ── Step 1: LOO subjects (cross-day aggregation, unchanged) ──────────
  for (const f of allFindings) {
    const ep = f.endpoint_label ?? f.finding;
    if (ep !== endpointLabel || f.domain !== finding.domain) continue;
    if (f.day == null) continue;

    const perSubject = f.loo_per_subject;
    if (!perSubject) continue;

    for (const [usubjid, entry] of Object.entries(perSubject)) {
      if (entry.ratio >= LOO_THRESHOLD) continue;

      const existing = merged.get(usubjid);
      if (existing) {
        existing.isLoo = true;
        if (!existing.days.includes(f.day)) existing.days.push(f.day);
        if (existing.worstRatio === null || entry.ratio < existing.worstRatio) {
          existing.worstRatio = entry.ratio;
        }
      } else {
        merged.set(usubjid, {
          usubjid,
          doseLevel: entry.dose_level,
          sex: f.sex ?? "",
          isLoo: true,
          isBio: false,
          bioType: null,
          zScore: null,
          instability: null,
          poc: null,
          days: [f.day],
          worstRatio: entry.ratio,
          alarmScore: null,
          looTautological: false,
        });
      }
    }
  }

  // ── Step 2: Bio outlier subjects ─────────────────────────────────────
  if (finding.data_type === "continuous") {
    // Step 2a: influence data (100% endpoint_name match)
    if (influenceData) {
      for (const [subjectId, details] of Object.entries(
        influenceData.endpoint_details,
      )) {
        for (const d of details) {
          if (d.endpoint_name !== endpointLabel || d.domain !== finding.domain)
            continue;
          if (d.bio_z_raw === null || Math.abs(d.bio_z_raw) <= outlierZ) continue;

          const subjectSex =
            influenceSexBySubject.get(subjectId) ??
            sentinelBySubject.get(subjectId)?.sex;

          const existing = merged.get(subjectId);
          if (existing) {
            existing.isBio = true;
            existing.bioType = "outlier";
            existing.zScore = d.bio_z_raw;
            existing.instability = existing.instability ?? d.instability;
            existing.alarmScore = d.alarm_score ?? existing.alarmScore;
          } else {
            merged.set(subjectId, {
              usubjid: subjectId,
              doseLevel:
                influenceData.animals.find((a) => a.subject_id === subjectId)
                  ?.dose_level ?? 0,
              sex: subjectSex ?? finding.sex ?? "",
              isLoo: false,
              isBio: true,
              bioType: "outlier",
              zScore: d.bio_z_raw,
              instability: d.instability,
              poc: null,
              days: [],
              worstRatio: null,
              alarmScore: d.alarm_score,
              looTautological: false,
            });
          }
          break; // one match per subject
        }
      }
    }

    // Step 2b: sentinel outliers not already caught by influence
    // Sentinel uses robust z-scores (Qn/MAD) which may flag outliers that
    // influence's Hamada-based z misses. endpoint_name is the short test code
    // (AST, ALT, etc.) — match via sentinel endpoint_id or endpoint_name.
    if (sentinelData) {
      for (const [subjectId, details] of Object.entries(
        sentinelData.endpoint_details,
      )) {
        if (merged.has(subjectId) && merged.get(subjectId)!.isBio) continue;
        for (const d of details) {
          if (d.domain !== finding.domain) continue;
          if (!d.is_outlier) continue;
          // Match by test_code: sentinel endpoint_name is the short code (AST),
          // finding.test_code is also the short code
          if (d.endpoint_name.toUpperCase() !== finding.test_code.toUpperCase()) continue;

          const subjectSex = sentinelBySubject.get(subjectId)?.sex;

          const existing = merged.get(subjectId);
          if (existing) {
            existing.isBio = true;
            existing.bioType = "outlier";
            existing.zScore = d.z_score;
          } else {
            merged.set(subjectId, {
              usubjid: subjectId,
              doseLevel: sentinelBySubject.get(subjectId)?.dose_level ?? 0,
              sex: subjectSex ?? finding.sex ?? "",
              isLoo: false,
              isBio: true,
              bioType: "outlier",
              zScore: d.z_score,
              instability: null,
              poc: null,
              days: [],
              worstRatio: null,
              alarmScore: null,
              looTautological: false,
            });
          }
          break;
        }
      }
    }
  } else if (finding.data_type === "incidence" && sentinelData) {
    // Incidence: use sentinel with test_code matching
    for (const [subjectId, details] of Object.entries(
      sentinelData.endpoint_details,
    )) {
      for (const d of details) {
        if (!matchSentinelToFinding(d, finding.domain, finding.test_code))
          continue;
        if (!d.is_sole_finding && !d.is_non_responder) continue;

        const subjectSex = sentinelBySubject.get(subjectId)?.sex;

        const bioType: "sole" | "non-resp" = d.is_sole_finding
          ? "sole"
          : "non-resp";

        const existing = merged.get(subjectId);
        if (existing) {
          existing.isBio = true;
          existing.bioType = bioType;
          // LOO is tautological for sole findings
          if (d.is_sole_finding) existing.looTautological = true;
        } else {
          merged.set(subjectId, {
            usubjid: subjectId,
            doseLevel:
              sentinelBySubject.get(subjectId)?.dose_level ?? 0,
            sex: subjectSex ?? finding.sex ?? "",
            isLoo: false,
            isBio: true,
            bioType,
            zScore: null, // z-scores not applicable for incidence
            instability: null,
            poc: null,
            days: [],
            worstRatio: null,
            alarmScore: null,
            looTautological: d.is_sole_finding,
          });
        }
        break; // one match per subject
      }
    }
  }

  // ── Step 3: Enrich with influence data (bio_z_raw fallback, alarm_score) ──
  if (influenceData) {
    for (const subj of merged.values()) {
      const details = influenceData.endpoint_details[subj.usubjid];
      if (!details) continue;
      for (const d of details) {
        if (d.endpoint_name !== endpointLabel || d.domain !== finding.domain)
          continue;
        // z-score fallback from influence (for LOO-only subjects below sentinel threshold)
        if (subj.zScore === null && d.bio_z_raw !== null) {
          subj.zScore = d.bio_z_raw;
        }
        // instability from influence
        if (subj.instability === null && d.instability !== null) {
          subj.instability = d.instability;
        }
        // alarm_score for sorting
        if (subj.alarmScore === null) {
          subj.alarmScore = d.alarm_score;
        }
        break;
      }
    }
  }

  // ── Step 4: Enrich with POC concordance from sentinel ────────────────
  for (const subj of merged.values()) {
    const animal = sentinelBySubject.get(subj.usubjid);
    if (animal?.poc && Object.values(animal.poc).some((v) => v >= 2)) {
      subj.poc = animal.poc;
    }
  }

  // ── Step 5: Sort days + final sort ───────────────────────────────────
  const result = [...merged.values()];
  for (const s of result) {
    s.days.sort((a, b) => a - b);
  }

  // 3-tier sort: both > LOO > bio. Within tier: alarm_score desc, fallbacks.
  result.sort((a, b) => {
    const tierA = a.isLoo && a.isBio ? 0 : a.isLoo ? 1 : 2;
    const tierB = b.isLoo && b.isBio ? 0 : b.isLoo ? 1 : 2;
    if (tierA !== tierB) return tierA - tierB;

    // Within tier: alarm_score descending (null -> 0)
    const scoreA = a.alarmScore ?? 0;
    const scoreB = b.alarmScore ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;

    // Per-subject fallback
    if (a.isBio && b.isBio && a.zScore !== null && b.zScore !== null) {
      return Math.abs(b.zScore) - Math.abs(a.zScore);
    }
    if (a.isLoo && b.isLoo && a.worstRatio !== null && b.worstRatio !== null) {
      return a.worstRatio - b.worstRatio;
    }

    return 0;
  });

  return result;
}
