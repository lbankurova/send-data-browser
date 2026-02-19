/**
 * Pipeline Diagnostic Trace
 *
 * Runs the full syndrome pipeline for every detected PointCross syndrome and
 * logs a structured diagnostic report per syndrome. The report shows:
 *   - Term matching with direction/status and raw endpoint data
 *   - Treatment-relatedness assessment factors
 *   - Certainty, CL support, recovery, mortality
 *   - ⚠ anomaly markers for contradictions (direction mismatch, strength mismatch)
 *
 * This test always passes — its value is the output, not the assertions.
 * Run with: npm test -- pipeline-trace --reporter=verbose
 */
import { describe, test, expect } from "vitest";
import { deriveEndpointSummaries } from "@/lib/derive-summaries";
import type { EndpointSummary } from "@/lib/derive-summaries";
import {
  detectCrossDomainSyndromes,
  getSyndromeTermReport,
  getSyndromeDefinition,
} from "@/lib/cross-domain-syndromes";
import type {
  CrossDomainSyndrome,
  SyndromeTermReport,
  TermReportEntry,
} from "@/lib/cross-domain-syndromes";
import {
  interpretSyndrome,
  computeTreatmentRelatedness,
  assessClinicalObservationSupport,
} from "@/lib/syndrome-interpretation";
import type {
  SyndromeInterpretation,
  TreatmentRelatednessScore,
  ClinicalObservationSupport,
  FoodConsumptionSummaryResponse,
  StudyContext,
} from "@/lib/syndrome-interpretation";
import type { AdverseEffectSummaryRow } from "@/types/analysis-views";

import fixture from "./fixtures/pointcross-findings.json";

// ─── Setup ───────────────────────────────────────────────────

const endpoints = deriveEndpointSummaries(fixture as AdverseEffectSummaryRow[]);
const syndromes = detectCrossDomainSyndromes(endpoints);

const defaultContext: StudyContext = {
  studyId: "PointCross",
  species: "RAT",
  strain: "SPRAGUE-DAWLEY",
  route: "ORAL GAVAGE",
  studyType: "SUBCHRONIC",
  dosingDurationWeeks: 13,
  recoveryPeriodDays: null,
  terminalSacrificeWeeks: 13,
  sexPopulation: "BOTH",
  ageAtStartWeeks: null,
  estimatedNecropsyAgeWeeks: null,
  supplier: "",
  vehicle: "",
  treatment: "",
  studyDesign: "",
  plannedSubjectsM: null,
  plannedSubjectsF: null,
  diet: "",
  glpCompliant: true,
  sendCtVersion: "",
  title: "",
  ecgInterpretation: {
    qtcTranslational: false,
    preferredCorrection: null,
    rationale: "Rodent ventricular repolarization is Ito-dominated; QTc prolongation has limited translational value to humans.",
  },
};

const noFoodData: FoodConsumptionSummaryResponse = {
  available: false,
  water_consumption: null,
};

// ─── Formatting helpers ──────────────────────────────────────

function pad(s: string, len: number): string {
  return s.length >= len ? s : s + " ".repeat(len - s.length);
}

function dirArrow(dir: string | null | undefined): string {
  if (dir === "up") return "↑";
  if (dir === "down") return "↓";
  return "—";
}

function fmtP(p: number | null | undefined): string {
  if (p == null) return "—";
  if (p < 0.0001) return "p<0.0001";
  if (p < 0.001) return `p=${p.toFixed(4)}`;
  return `p=${p.toFixed(3)}`;
}

function fmtD(d: number | null | undefined): string {
  if (d == null) return "—";
  return `d=${d >= 0 ? "+" : ""}${d.toFixed(2)}`;
}

function fmtFold(f: number | null | undefined): string {
  if (f == null) return "—";
  return `fold=${f.toFixed(2)}`;
}

/** Build a lookup from endpoint_label → EndpointSummary for fast access */
function buildEndpointIndex(eps: EndpointSummary[]): Map<string, EndpointSummary> {
  const m = new Map<string, EndpointSummary>();
  for (const ep of eps) {
    // First entry wins (aggregate preferred over per-sex)
    if (!m.has(ep.endpoint_label)) m.set(ep.endpoint_label, ep);
  }
  return m;
}

// ─── Main trace formatter ────────────────────────────────────

function formatSyndromeTrace(
  syndrome: CrossDomainSyndrome,
  termReport: SyndromeTermReport,
  relatedness: TreatmentRelatednessScore,
  interp: SyndromeInterpretation,
  epIndex: Map<string, EndpointSummary>,
): string {
  const lines: string[] = [];
  const w = `═══ ${syndrome.id}: ${syndrome.name} (${syndrome.confidence}, ${syndrome.domainsCovered.length} domains) ═══`;
  lines.push("");
  lines.push(w);

  // ── Term matching ──
  lines.push("");
  lines.push("TERM MATCHING:");

  const formatEntry = (entry: TermReportEntry) => {
    const roleTag = entry.role === "required" ? "[R]" : "[S]";
    const label = pad(`${entry.label}`, 30);
    const status = entry.status.toUpperCase();

    if (entry.status === "not_measured") {
      lines.push(`  ${roleTag} ${label} → NOT_MEASURED`);
      return;
    }

    // Find the matched endpoint data for richer info
    const ep = entry.matchedEndpoint ? epIndex.get(entry.matchedEndpoint) : null;
    const epLabel = pad(entry.matchedEndpoint ?? "—", 25);
    const domain = pad(entry.domain, 4);
    const dir = dirArrow(entry.foundDirection);
    const d = ep ? fmtD(ep.maxEffectSize != null ? (ep.direction === "down" ? -ep.maxEffectSize : ep.maxEffectSize) : null) : "—";
    const p = fmtP(entry.pValue);
    const pattern = ep ? `pattern=${ep.pattern}` : "";
    const fold = ep ? fmtFold(ep.maxFoldChange) : "";

    lines.push(`  ${roleTag} ${label} → ${pad(status, 16)} ${epLabel} ${domain} ${dir}  ${d}  ${p}  ${pattern}  ${fold}`);

    // ⚠ Direction anomaly: term expects one direction, endpoint goes the other way
    if (entry.status === "opposite") {
      const termDir = entry.label.includes("↑") ? "↑" : entry.label.includes("↓") ? "↓" : "?";
      lines.push(`      ⚠ OPPOSITE DIRECTION: term expects ${termDir}, endpoint is ${dir}`);
    }

    // ⚠ Matched but endpoint is actually opposite to what the term requires
    if (entry.status === "matched" && entry.foundDirection && entry.label.includes("↓") && entry.foundDirection === "up") {
      lines.push(`      ⚠ DIRECTION MISMATCH IN MATCH: term expects ↓, endpoint is ↑`);
    }
    if (entry.status === "matched" && entry.foundDirection && entry.label.includes("↑") && entry.foundDirection === "down") {
      lines.push(`      ⚠ DIRECTION MISMATCH IN MATCH: term expects ↑, endpoint is ↓`);
    }
  };

  for (const entry of termReport.requiredEntries) formatEntry(entry);
  for (const entry of termReport.supportingEntries) formatEntry(entry);

  // ── Treatment-relatedness ──
  lines.push("");
  lines.push("TREATMENT-RELATEDNESS:");
  lines.push(`  A-1 doseResponse: ${relatedness.doseResponse}`);

  // ⚠ Check for strong individual endpoints with weak overall rating
  if (relatedness.doseResponse === "weak") {
    const matchedLabels = new Set(syndrome.matchedEndpoints.map((m) => m.endpoint_label));
    for (const ep of endpoints) {
      if (!matchedLabels.has(ep.endpoint_label)) continue;
      const isMonotonic = ep.pattern.includes("monotonic") || ep.pattern === "linear";
      if (isMonotonic && ep.maxEffectSize != null && Math.abs(ep.maxEffectSize) > 2.0 && ep.minPValue != null && ep.minPValue < 0.001) {
        lines.push(`      ⚠ STRENGTH MISMATCH: ${ep.endpoint_label} has ${ep.pattern}, |d|=${Math.abs(ep.maxEffectSize).toFixed(2)}, ${fmtP(ep.minPValue)}`);
      }
    }
  }

  lines.push(`  A-2 crossEndpoint: ${relatedness.crossEndpoint} (${syndrome.domainsCovered.length} domains)`);
  lines.push(`  A-6 significance: ${relatedness.statisticalSignificance} (min p from matched endpoints)`);
  lines.push(`  CL support: ${relatedness.clinicalObservationSupport ? "yes" : "no"}`);
  lines.push(`  Overall: ${relatedness.overall}`);

  // ── Certainty ──
  lines.push("");
  lines.push(`CERTAINTY: ${interp.certainty}`);
  if (interp.certaintyRationale) {
    lines.push(`  Rationale: ${interp.certaintyRationale}`);
  }

  // ── CL support detail ──
  const clSupport = interp.clinicalObservationSupport;
  const def = getSyndromeDefinition(syndrome.id);
  const hasCLTerms = def?.terms.some((t) => t.domain === "CL") ?? false;
  lines.push(`CL SUPPORT: ${clSupport.assessment}  (${hasCLTerms ? "has CL terms in definition" : "no CL terms in definition"})`);
  if (clSupport.correlatingObservations.length > 0) {
    for (const c of clSupport.correlatingObservations) {
      lines.push(`  ${c.observation} (tier ${c.tier}, dose-dependent: ${c.incidenceDoseDependent})`);
    }
  }

  // ── Recovery ──
  lines.push(`RECOVERY: ${interp.recovery.status}`);
  if (interp.recovery.endpoints.length > 0) {
    for (const r of interp.recovery.endpoints) {
      lines.push(`  ${r.label} (${r.sex}): ${r.status} — terminal d=${r.terminalEffect.toFixed(2)}, recovery d=${r.recoveryEffect?.toFixed(2) ?? "—"}`);
    }
  }

  // ── Mortality ──
  lines.push(`MORTALITY: ${interp.mortalityContext.treatmentRelatedDeaths > 0 ? `${interp.mortalityContext.treatmentRelatedDeaths} treatment-related deaths` : "[empty — no mortality data provided]"}`);

  // ── Severity ──
  lines.push(`SEVERITY: ${interp.overallSeverity}`);

  lines.push("");
  return lines.join("\n");
}

// ─── Test suite ──────────────────────────────────────────────

describe("Pipeline Diagnostic Trace", () => {
  test("detected syndromes exist", () => {
    expect(syndromes.length).toBeGreaterThan(0);
    console.log(`\n  Detected ${syndromes.length} syndromes: ${syndromes.map((s) => s.id).join(", ")}`);
  });

  const epIndex = buildEndpointIndex(endpoints);

  test.each(syndromes.map((s) => [s.id, s] as const))(
    "trace %s",
    (_id, syndrome) => {
      // Build term report
      const termReport = getSyndromeTermReport(syndrome.id, endpoints, syndrome.sexes);
      expect(termReport).not.toBeNull();

      // Build CL support (empty — no CL data in fixture)
      const clSupport = assessClinicalObservationSupport(syndrome.id, []);

      // Build treatment-relatedness
      const relatedness = computeTreatmentRelatedness(syndrome, endpoints, clSupport);

      // Build full interpretation
      const interp = interpretSyndrome(
        syndrome,
        endpoints,
        [], // histopath
        [], // recovery
        [], // organWeights
        [], // tumors
        [], // mortality
        noFoodData,
        [], // clinicalObservations
        defaultContext,
      );

      // Format and log
      const trace = formatSyndromeTrace(syndrome, termReport!, relatedness, interp, epIndex);
      console.log(trace);

      // Always passes — the value is the logged output
      expect(true).toBe(true);
    },
  );
});
