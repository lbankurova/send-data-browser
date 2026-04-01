/**
 * Per-subject cross-organ concordance computation.
 *
 * Takes a SubjectProfile and produces a flat array of organ-scatter points
 * showing how this animal's endpoints deviate from control — grouped by
 * organ system, spanning LB (lab), OM (organ weight), and MI (histopath).
 */

import type { SubjectProfile } from "@/types/timecourse";
import { ORGAN_SYSTEM_OVERRIDES } from "@/lib/derive-summaries";
import { specimenToOrganSystem } from "@/lib/histopathology-helpers";
import { severityNum } from "@/lib/subject-profile-logic";

// ─── Types ───────────────────────────────────────────────

export interface OrganScatterPoint {
  /** Organ system key (hepatic, renal, hematologic, ...) */
  organSystem: string;
  /** Human label for the endpoint (e.g. "ALT", "LIVER", "Necrosis") */
  label: string;
  /** Source domain */
  domain: "LB" | "OM" | "MI";
  /** Fold-change vs control (continuous) or severity grade 1-5 (incidence) */
  value: number;
  /** "continuous" for LB/OM fold-change, "incidence" for MI severity */
  type: "continuous" | "incidence";
  /** Raw measurement value (for tooltip) */
  rawValue: number;
  /** Control mean (for tooltip, continuous only) */
  controlMean?: number;
  /** Unit (for tooltip) */
  unit?: string;
  /** MI finding text (for tooltip, incidence only) */
  finding?: string;
  /** MI severity label (for tooltip, incidence only) */
  severity?: string;
}

// ─── Organ system display order ──────────────────────────

const ORGAN_ORDER: string[] = [
  "hepatic", "renal", "hematologic", "cardiovascular",
  "respiratory", "endocrine", "gastrointestinal", "reproductive",
  "neurological", "musculoskeletal", "integumentary", "ocular",
  "electrolyte", "metabolic", "general",
];

function organSystemOrder(organ: string): number {
  const idx = ORGAN_ORDER.indexOf(organ);
  return idx >= 0 ? idx : ORGAN_ORDER.length;
}

export { organSystemOrder };

// ─── Main computation ────────────────────────────────────

export function computeSubjectConcordance(
  profile: SubjectProfile,
): OrganScatterPoint[] {
  const points: OrganScatterPoint[] = [];
  const labStats = profile.control_stats?.lab;
  const omStats = profile.control_stats?.om;

  // LB: fold-change vs control (terminal timepoint only)
  if (profile.domains.LB?.measurements && labStats) {
    // Group by test_code, take latest (terminal) measurement
    const byTest = new Map<string, { day: number; value: number; unit: string }>();
    for (const m of profile.domains.LB.measurements) {
      const existing = byTest.get(m.test_code);
      if (!existing || m.day > existing.day) {
        byTest.set(m.test_code, { day: m.day, value: m.value, unit: m.unit });
      }
    }

    for (const [testCode, meas] of byTest) {
      const ctrl = labStats[testCode];
      if (!ctrl || ctrl.mean === 0) continue;
      const foldChange = meas.value / ctrl.mean;
      // Only include endpoints with meaningful deviation
      if (foldChange < 0.67 || foldChange > 1.5) {
        points.push({
          organSystem: ORGAN_SYSTEM_OVERRIDES[testCode.toUpperCase()] ?? "general",
          label: testCode,
          domain: "LB",
          type: "continuous",
          value: foldChange,
          rawValue: meas.value,
          controlMean: ctrl.mean,
          unit: meas.unit || ctrl.unit,
        });
      }
    }
  }

  // OM: fold-change vs control (deduplicate: one measurement per organ)
  if (profile.domains.OM?.measurements && omStats) {
    // Group by test_code (OMSPEC = organ name), take latest day
    const byOrgan = new Map<string, { day: number; value: number; unit: string }>();
    for (const m of profile.domains.OM.measurements) {
      const existing = byOrgan.get(m.test_code);
      if (!existing || m.day > existing.day) {
        byOrgan.set(m.test_code, { day: m.day, value: m.value, unit: m.unit });
      }
    }

    for (const [organ, meas] of byOrgan) {
      const ctrl = omStats[organ];
      if (!ctrl || ctrl.mean === 0) continue;
      const foldChange = meas.value / ctrl.mean;
      if (foldChange < 0.67 || foldChange > 1.5) {
        points.push({
          organSystem: specimenToOrganSystem(organ),
          label: organ,
          domain: "OM",
          type: "continuous",
          value: foldChange,
          rawValue: meas.value,
          controlMean: ctrl.mean,
          unit: meas.unit || ctrl.unit,
        });
      }
    }
  }

  // MI: severity grade (non-normal findings only)
  if (profile.domains.MI?.findings) {
    for (const f of profile.domains.MI.findings) {
      const sev = severityNum(f.severity);
      if (sev === 0) continue; // Skip normal / no-severity findings
      // Skip "NORMAL" / "UNREMARKABLE" text findings
      const upper = f.finding.toUpperCase();
      if (upper === "NORMAL" || upper === "UNREMARKABLE" || upper === "WITHIN NORMAL LIMITS") continue;

      points.push({
        organSystem: specimenToOrganSystem(f.specimen),
        label: f.specimen,
        domain: "MI",
        type: "incidence",
        value: sev,
        rawValue: sev,
        finding: f.finding,
        severity: f.severity ?? undefined,
      });
    }
  }

  // Sort: by organ system order, then by domain (LB, OM, MI), then by absolute deviation
  points.sort((a, b) => {
    const oa = organSystemOrder(a.organSystem);
    const ob = organSystemOrder(b.organSystem);
    if (oa !== ob) return oa - ob;
    // Within same organ: LB before OM before MI
    const domOrd = { LB: 0, OM: 1, MI: 2 } as const;
    const da = domOrd[a.domain];
    const db = domOrd[b.domain];
    if (da !== db) return da - db;
    // By absolute deviation (largest first)
    const absA = a.type === "continuous" ? Math.abs(Math.log2(a.value)) : a.value;
    const absB = b.type === "continuous" ? Math.abs(Math.log2(b.value)) : b.value;
    return absB - absA;
  });

  return points;
}
