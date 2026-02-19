/**
 * Syndrome Engine Reference Generator
 *
 * Reads all syndrome definitions, magnitude floors, directional gates,
 * discriminators, certainty caps, and translational configs from the live
 * codebase and writes a structured markdown reference document.
 *
 * Run with: npm test -- generate-engine-reference
 * Output:   docs/knowledge/syndrome-engine-reference.md
 *
 * Use this output as context when producing JSON decision specs
 * to ensure new configs map onto existing interfaces cleanly.
 */
import { describe, test, expect } from "vitest";
import {
  SYNDROME_DEFINITIONS,
  DIRECTIONAL_GATES,
  ENDPOINT_CLASS_FLOORS,
  getTermDisplayLabel,
} from "@/lib/cross-domain-syndromes";
import type {
  SyndromeDefinition,
  SyndromeTermMatch,
  DirectionalGateConfig,
  MagnitudeFloor,
} from "@/lib/cross-domain-syndromes";
import {
  DISCRIMINATOR_REGISTRY,
  SYNDROME_CL_CORRELATES,
  SYNDROME_SOC_MAP,
  TRANSLATIONAL_BINS,
  STAT_SIG_THRESHOLDS,
  DOSE_RESPONSE_THRESHOLDS,
} from "@/lib/syndrome-interpretation";
import type {
  SyndromeDiscriminators,
} from "@/lib/syndrome-interpretation";

import { writeFileSync } from "fs";
import { resolve } from "path";

// ─── Helpers ─────────────────────────────────────────────────

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function fmtDirection(d: "up" | "down" | "any"): string {
  if (d === "up") return "\u2191";
  if (d === "down") return "\u2193";
  return "\u2195";
}

function fmtTermIdentity(term: SyndromeTermMatch): string {
  if (term.testCodes?.length) return term.testCodes.join("/");
  if (term.specimenTerms) {
    const spec = term.specimenTerms.specimen.join("|") || "*";
    const find = term.specimenTerms.finding.join("|");
    return `${spec} \u2014 ${find}`;
  }
  if (term.organWeightTerms) {
    return `OM:${term.organWeightTerms.specimen.join("|") || "*"}`;
  }
  if (term.canonicalLabels?.length) return term.canonicalLabels.join("/");
  return "?";
}

function fmtRequiredLogic(def: SyndromeDefinition): string {
  const logic = def.requiredLogic;
  if (logic.type === "any") return `ANY of ${def.terms.filter(t => t.role === "required").length} required`;
  if (logic.type === "all") return `ALL ${def.terms.filter(t => t.role === "required").length} required`;
  return `COMPOUND: ${logic.expression}`;
}

// ─── Generator ───────────────────────────────────────────────

describe("Syndrome Engine Reference", () => {
  test("generates reference document", () => {
    const lines: string[] = [];
    const now = new Date().toISOString().split("T")[0];

    lines.push("# Syndrome Engine Reference");
    lines.push("");
    lines.push(`**Generated:** ${now}  `);
    lines.push(`**Source:** Live code extraction via \`generate-engine-reference.test.ts\`  `);
    lines.push(`**Syndromes:** ${SYNDROME_DEFINITIONS.length}  `);
    lines.push(`**Magnitude floor classes:** ${ENDPOINT_CLASS_FLOORS.length} + 3 organ weight subclasses  `);
    lines.push(`**Directional gates:** ${Object.keys(DIRECTIONAL_GATES).length} syndromes gated  `);
    lines.push(`**Discriminator sets:** ${Object.keys(DISCRIMINATOR_REGISTRY).length}  `);
    lines.push("");
    lines.push("---");
    lines.push("");

    // ──────────────────────────────────────────────────────────
    // Section 1: Syndrome Definitions
    // ──────────────────────────────────────────────────────────

    lines.push("## 1. Syndrome Definitions");
    lines.push("");

    for (const def of SYNDROME_DEFINITIONS) {
      const soc = SYNDROME_SOC_MAP[def.id] ?? "unmapped";
      lines.push(`### ${def.id}: ${def.name}`);
      lines.push("");
      lines.push(`- **SOC:** ${soc}`);
      lines.push(`- **Required logic:** ${fmtRequiredLogic(def)}`);
      lines.push(`- **Min domains:** ${def.minDomains}`);
      lines.push("");

      // Terms table
      lines.push("| Role | Tag | Domain | Dir | Identity | Display label |");
      lines.push("|------|-----|--------|-----|----------|---------------|");
      for (const term of def.terms) {
        const role = term.role === "required" ? "**R**" : "S";
        const tag = term.tag ?? "";
        const dir = fmtDirection(term.direction);
        const identity = fmtTermIdentity(term);
        const display = getTermDisplayLabel(term);
        lines.push(`| ${role} | ${tag} | ${term.domain} | ${dir} | ${identity} | ${display} |`);
      }
      lines.push("");

      // Directional gates
      const gates = DIRECTIONAL_GATES[def.id];
      if (gates?.length) {
        lines.push("**Directional gates:**");
        for (const g of gates) {
          lines.push(`- ${g.term} expected ${fmtDirection(g.expectedDirection)} \u2192 action: \`${g.action}\`${g.overrideCondition ? ` (override: ${g.overrideCondition})` : ""}`);
        }
        lines.push("");
      }

      // Discriminators
      const disc = DISCRIMINATOR_REGISTRY[def.id];
      if (disc) {
        lines.push("**Discriminating evidence:**");
        lines.push(`- Differential: ${disc.differential}`);
        for (const f of disc.findings) {
          const dir = fmtDirection(f.expectedDirection);
          const absence = f.absenceMeaningful ? " (absence meaningful)" : "";
          lines.push(`- ${f.endpoint} ${dir} [${f.source}, ${f.weight}] \u2014 ${f.rationale}${absence}`);
        }
        lines.push("");
      }

      // CL correlates
      const cl = SYNDROME_CL_CORRELATES[def.id];
      if (cl) {
        lines.push("**Expected clinical observations:**");
        for (let i = 0; i < cl.expectedObservations.length; i++) {
          lines.push(`- Tier ${cl.tier[i]}: ${cl.expectedObservations[i]}`);
        }
        lines.push("");
      }

      lines.push("---");
      lines.push("");
    }

    // ──────────────────────────────────────────────────────────
    // Section 2: Magnitude Floors
    // ──────────────────────────────────────────────────────────

    lines.push("## 2. Magnitude Floors (v0.2.0)");
    lines.push("");
    lines.push("Logic: endpoint passes if `|g| \u2265 minG` **OR** `|FC-1| \u2265 minFcDelta`. Either criterion is sufficient.");
    lines.push("");

    lines.push("### 2.1 Endpoint class floors");
    lines.push("");
    lines.push("| Class | min |g| | min |FC-1| | Test codes |");
    lines.push("|-------|---------|------------|------------|");
    for (const entry of ENDPOINT_CLASS_FLOORS) {
      const codes = entry.testCodes.join(", ");
      lines.push(`| ${entry.class} | ${entry.floor.minG} | ${entry.floor.minFcDelta} | ${codes} |`);
    }
    lines.push("");

    lines.push("### 2.2 Organ weight subclasses");
    lines.push("");
    lines.push("OM domain endpoints have `testCode=WEIGHT` for all organs. Subclass determined by keyword matching on `specimen` or `endpoint_label`.");
    lines.push("");
    lines.push("| Subclass | min |g| | min |FC-1| | Organ keywords |");
    lines.push("|----------|---------|------------|----------------|");
    lines.push("| General | 0.8 | 0.10 | liver, kidney, heart, spleen, lung, brain |");
    lines.push("| Reproductive | 0.8 | 0.05 | testis, epididymis, ovary, uterus, prostate, seminal |");
    lines.push("| Immune | 0.8 | 0.10 | thymus, adrenal |");
    lines.push("");

    lines.push("### 2.3 Conditional overrides");
    lines.push("");
    lines.push("**RETIC conditional override:** When checking RETIC/RET/RETI, if concordant anemia is present (\u22652 of RBC/HGB/HCT \u2193 each meeting erythroid floor), the RETIC floor relaxes:");
    lines.push("- Base: minFcDelta = 0.25");
    lines.push("- Relaxed: minFcDelta = 0.15");
    lines.push("");
    lines.push("**Rare leukocyte concordance:** MONO/EOS/BASO must have \u22651 primary leukocyte (WBC/NEUT/ANC/LYMPH/LYM) shifting same direction with meaningful effect (p \u2264 0.05 or |g| \u2265 0.5 or |FC-1| \u2265 0.05). Without concordance, the finding is blocked even if it passes the magnitude floor.");
    lines.push("");

    // ──────────────────────────────────────────────────────────
    // Section 3: Certainty Caps
    // ──────────────────────────────────────────────────────────

    lines.push("## 3. Certainty Assessment & Caps");
    lines.push("");
    lines.push("Certainty levels (ordered): `pattern_only` < `mechanism_uncertain` < `mechanism_confirmed`");
    lines.push("");

    lines.push("### 3.1 Base certainty logic (assessCertainty)");
    lines.push("");
    lines.push("1. If `requiredMet = false` \u2192 `pattern_only`");
    lines.push("2. If strong argues_against evidence \u2192 `mechanism_uncertain`");
    lines.push("3. If strong supporting + no strong against \u2192 `mechanism_confirmed`");
    lines.push("4. If moderate supporting only + no against \u2192 `mechanism_confirmed`");
    lines.push("5. If no discriminating evidence available \u2192 `mechanism_uncertain`");
    lines.push("6. If moderate against only \u2192 `mechanism_uncertain`");
    lines.push("");

    lines.push("### 3.2 Certainty caps (applyCertaintyCaps)");
    lines.push("");
    lines.push("Applied in order after base certainty:");
    lines.push("");
    lines.push("| Cap | Condition | Max certainty | Rationale |");
    lines.push("|-----|-----------|---------------|-----------|");
    lines.push("| Directional gate | Gate fired (REM-09) | Per gate action | Opposite-direction key term contradicts syndrome |");
    lines.push("| Single-domain | XS04 or XS05 + 1 domain only | pattern_only | Single domain cannot confirm mechanism |");
    lines.push("| Data sufficiency | Confirmatory domain missing | pattern_only | MI required for XS01/XS03/XS04/XS07; LB supporting for XS10 |");
    lines.push("| Data sufficiency | Supporting domain missing | mechanism_uncertain | Missing supporting domain reduces confidence |");
    lines.push("| Liver enzyme | XS01 + single enzyme + no MI/OM/multi-enzyme | pattern_only | Single biomarker cannot confirm hepatotoxicity (Ramaiah 2017) |");
    lines.push("");

    lines.push("### 3.3 Data sufficiency requirements");
    lines.push("");
    lines.push("| Syndrome | Domain | Role | Effect when missing |");
    lines.push("|----------|--------|------|---------------------|");
    lines.push("| XS01 | MI | confirmatory | cap at pattern_only |");
    lines.push("| XS03 | MI | confirmatory | cap at pattern_only |");
    lines.push("| XS04 | MI | confirmatory | cap at pattern_only |");
    lines.push("| XS07 | MI | confirmatory | cap at pattern_only |");
    lines.push("| XS10 | LB | supporting | cap at mechanism_uncertain |");
    lines.push("");

    // ──────────────────────────────────────────────────────────
    // Section 4: Treatment-Relatedness (A-factors)
    // ──────────────────────────────────────────────────────────

    lines.push("## 4. Treatment-Relatedness Assessment (A-factors)");
    lines.push("");
    lines.push("Six A-factors scored independently, then combined:");
    lines.push("");
    lines.push("| Factor | Method | Weight |");
    lines.push("|--------|--------|--------|");
    lines.push("| A-1 Dose-response | Pattern classification + trend p-value | Primary |");
    lines.push("| A-2 Cross-endpoint | Domain count from syndrome detection | Primary |");
    lines.push("| A-3 HCD comparison | (Reserved \u2014 not yet implemented) | Secondary |");
    lines.push("| A-4 Temporal onset | (Reserved \u2014 not yet implemented) | Secondary |");
    lines.push("| A-5 Mechanism plausibility | (Reserved \u2014 not yet implemented) | Secondary |");
    lines.push("| A-6 Statistical significance | Min p-value from matched endpoints | Primary |");
    lines.push("| CL support | Clinical observation correlation | Modifier |");
    lines.push("");

    lines.push("**Dose-response thresholds:**");
    lines.push(`- Strong pattern p-value: < ${DOSE_RESPONSE_THRESHOLDS.strongPatternP}`);
    lines.push(`- Pairwise high-confidence p: < ${DOSE_RESPONSE_THRESHOLDS.pairwiseHighP}`);
    lines.push(`- Pairwise min effect size: \u2265 ${DOSE_RESPONSE_THRESHOLDS.pairwiseMinEffect}`);
    lines.push(`- Strong patterns: ${DOSE_RESPONSE_THRESHOLDS.strongPatterns.join(", ")}`);
    lines.push("");

    lines.push("**Statistical significance thresholds:**");
    lines.push(`- Significant: p \u2264 ${STAT_SIG_THRESHOLDS.significant}`);
    lines.push(`- Borderline: p \u2264 ${STAT_SIG_THRESHOLDS.borderline}`);
    lines.push("");

    // ──────────────────────────────────────────────────────────
    // Section 5: Adversity (B-factors)
    // ──────────────────────────────────────────────────────────

    lines.push("## 5. Adversity Assessment (B-factors)");
    lines.push("");
    lines.push("| Factor | Method |");
    lines.push("|--------|--------|");
    lines.push("| B-1 Adaptive response | Liver weight + hypertrophy without necrosis \u2192 equivocal |");
    lines.push("| B-2 Stress confound | (Reserved) XS08 endpoints overlapping XS07/XS04 |");
    lines.push("| B-3 Reversibility | Recovery arm data: endpoint recovery status |");
    lines.push("| B-4 Magnitude | Cohen's d thresholds: <0.5=minimal, 0.5\u20131.0=mild, 1.0\u20132.0=moderate, 2.0\u20133.0=marked, \u22653.0=severe |");
    lines.push("| B-5 Cross-domain support | Domain count from syndrome detection |");
    lines.push("| B-6 Precursor to worse | (Reserved) Progression from adaptive to adverse |");
    lines.push("| B-7 Secondary to other | (Reserved) Effects secondary to primary toxicity |");
    lines.push("");

    lines.push("**Adversity outcomes:** `adverse`, `non_adverse`, `equivocal`");
    lines.push("");

    // ──────────────────────────────────────────────────────────
    // Section 6: Severity Scale
    // ──────────────────────────────────────────────────────────

    lines.push("## 6. Severity Scale");
    lines.push("");
    lines.push("| Tier | Label | Condition |");
    lines.push("|------|-------|-----------|");
    lines.push("| S0 | Death | Treatment-related deaths |");
    lines.push("| \u2014 | Carcinogenic | Tumor progression detected |");
    lines.push("| \u2014 | Proliferative | Tumor present, no progression |");
    lines.push("| S4 | Critical | adverse + marked/severe + mechanism_confirmed, OR treatment-related deaths |");
    lines.push("| S3 | Adverse | adverse + (mechanism_confirmed OR mechanism_uncertain) |");
    lines.push("| S2 | Concern | adverse + pattern_only, OR non_adverse/equivocal + any certainty |");
    lines.push("| S1 | Monitor | Non-adverse + minimal magnitude, or insufficient evidence |");
    lines.push("");

    // ──────────────────────────────────────────────────────────
    // Section 7: Translational Confidence
    // ──────────────────────────────────────────────────────────

    lines.push("## 7. Translational Confidence");
    lines.push("");
    lines.push("### 7.1 SOC classification");
    lines.push("");
    lines.push("| Syndrome | Primary SOC |");
    lines.push("|----------|-------------|");
    for (const [id, soc] of Object.entries(SYNDROME_SOC_MAP)) {
      const def = SYNDROME_DEFINITIONS.find(d => d.id === id);
      lines.push(`| ${id} | ${soc}${def ? ` (${def.name})` : ""} |`);
    }
    lines.push("");

    lines.push("### 7.2 Translational tier bins");
    lines.push("");
    lines.push("| Level | Endpoint LR+ | SOC LR+ |");
    lines.push("|-------|-------------|---------|");
    lines.push(`| High | \u2265 ${TRANSLATIONAL_BINS.endpoint.high} | \u2265 ${TRANSLATIONAL_BINS.soc.high} |`);
    lines.push(`| Moderate | \u2265 ${TRANSLATIONAL_BINS.endpoint.moderate} | \u2265 ${TRANSLATIONAL_BINS.soc.moderate} |`);
    lines.push("| Low | below moderate | below moderate |");
    lines.push("| Insufficient data | LR+ not available | LR+ not available |");
    lines.push("");

    // ──────────────────────────────────────────────────────────
    // Section 8: Interface Summary
    // ──────────────────────────────────────────────────────────

    lines.push("## 8. Interface Summary");
    lines.push("");
    lines.push("### 8.1 Key types");
    lines.push("");
    lines.push("```typescript");
    lines.push("// Syndrome term matching");
    lines.push("interface SyndromeTermMatch {");
    lines.push("  testCodes?: string[];              // LB domain matching (OR)");
    lines.push("  canonicalLabels?: string[];         // Normalized label matching (OR)");
    lines.push("  specimenTerms?: {                   // MI/MA: specimen AND finding");
    lines.push("    specimen: string[];");
    lines.push("    finding: string[];");
    lines.push("  };");
    lines.push("  organWeightTerms?: {                // OM: organ specimen matching");
    lines.push("    specimen: string[];");
    lines.push("  };");
    lines.push("  domain: string;                     // Required domain (LB, MI, MA, OM, BW, CL)");
    lines.push("  direction: \"up\" | \"down\" | \"any\";");
    lines.push("  role: \"required\" | \"supporting\";");
    lines.push("  tag?: string;                       // For compound logic grouping");
    lines.push("}");
    lines.push("");
    lines.push("// Syndrome definition");
    lines.push("interface SyndromeDefinition {");
    lines.push("  id: string;                         // XS01-XS10");
    lines.push("  name: string;");
    lines.push("  requiredLogic: RequiredLogic;       // any | all | compound");
    lines.push("  terms: SyndromeTermMatch[];");
    lines.push("  minDomains: number;                 // Minimum matched domains");
    lines.push("}");
    lines.push("");
    lines.push("// Required logic types");
    lines.push("type RequiredLogic =");
    lines.push("  | { type: \"any\" }                           // >=1 required term matches");
    lines.push("  | { type: \"all\" }                           // ALL required terms must match");
    lines.push("  | { type: \"compound\"; expression: string }; // e.g., \"ALP AND (GGT OR 5NT)\"");
    lines.push("");
    lines.push("// Directional gate");
    lines.push("interface DirectionalGateConfig {");
    lines.push("  term: string;                       // Tag to check (e.g., \"RETIC\")");
    lines.push("  expectedDirection: \"up\" | \"down\";");
    lines.push("  action: \"reject\" | \"strong_against\" | \"weak_against\";");
    lines.push("  overrideCondition?: string;         // Softens reject to strong_against");
    lines.push("}");
    lines.push("");
    lines.push("// Discriminator config");
    lines.push("interface SyndromeDiscriminators {");
    lines.push("  findings: DiscriminatorFinding[];");
    lines.push("  differential: string;               // e.g., \"cholestatic vs hepatocellular\"");
    lines.push("}");
    lines.push("");
    lines.push("// Discriminator finding (config shape, in SyndromeDiscriminators.findings[])");
    lines.push("interface DiscriminatorFinding {");
    lines.push("  endpoint: string;                   // Test code or label");
    lines.push("  expectedDirection: \"up\" | \"down\";");
    lines.push("  source: \"LB\" | \"MI\" | \"MA\" | \"OM\" | \"EG\" | \"VS\";");
    lines.push("  weight: \"strong\" | \"moderate\";");
    lines.push("  rationale: string;                  // Why this endpoint discriminates");
    lines.push("  absenceMeaningful?: boolean;        // true = absence argues against");
    lines.push("}");
    lines.push("");
    lines.push("// Magnitude floor");
    lines.push("interface MagnitudeFloor {");
    lines.push("  minG: number;                       // Minimum |Hedges' g|");
    lines.push("  minFcDelta: number;                 // Minimum |fold change - 1|");
    lines.push("}");
    lines.push("```");
    lines.push("");

    lines.push("### 8.2 Key functions");
    lines.push("");
    lines.push("| Function | Module | Input | Output |");
    lines.push("|----------|--------|-------|--------|");
    lines.push("| `detectCrossDomainSyndromes` | cross-domain-syndromes | EndpointSummary[] | CrossDomainSyndrome[] |");
    lines.push("| `getSyndromeTermReport` | cross-domain-syndromes | syndromeId, endpoints | SyndromeTermReport |");
    lines.push("| `checkMagnitudeFloor` | cross-domain-syndromes | endpoint, domain, allEndpoints? | string (blocked) or null (pass) |");
    lines.push("| `assessCertainty` | syndrome-interpretation | syndrome, discriminators, endpoints, histopath | { certainty, evidence, rationale } |");
    lines.push("| `computeTreatmentRelatedness` | syndrome-interpretation | syndrome, endpoints, context, \u2026 | TreatmentRelatednessScore |");
    lines.push("| `computeAdversity` | syndrome-interpretation | syndrome, certainty, recovery, \u2026 | AdversityAssessment |");
    lines.push("| `deriveOverallSeverity` | syndrome-interpretation | certainty, adversity, mortality, tumor | OverallSeverity |");
    lines.push("| `assignTranslationalTier` | syndrome-interpretation | species, soc, endpointLRs | high/moderate/low/insufficient |");
    lines.push("| `interpretSyndrome` | syndrome-interpretation | syndrome, endpoints, context, \u2026 | SyndromeInterpretation (full) |");
    lines.push("");

    // ──────────────────────────────────────────────────────────
    // Write
    // ──────────────────────────────────────────────────────────

    const content = lines.join("\n") + "\n";
    const outPath = resolve(__dirname, "syndrome-engine-reference.md");
    writeFileSync(outPath, content, "utf-8");

    const lineCount = content.split("\n").length;
    console.log(`  \u2713 Reference document written to: ${outPath}`);
    console.log(`    ${lineCount} lines, ${content.length} characters`);
    console.log(`    Syndromes: ${SYNDROME_DEFINITIONS.length}`);
    console.log(`    Magnitude floor classes: ${ENDPOINT_CLASS_FLOORS.length}`);
    console.log(`    Directional gates: ${Object.values(DIRECTIONAL_GATES).flat().length}`);
    console.log(`    Discriminator sets: ${Object.keys(DISCRIMINATOR_REGISTRY).length}`);

    // Sanity checks
    expect(SYNDROME_DEFINITIONS.length).toBeGreaterThanOrEqual(9);
    expect(ENDPOINT_CLASS_FLOORS.length).toBeGreaterThanOrEqual(13);
    expect(Object.keys(DISCRIMINATOR_REGISTRY).length).toBeGreaterThanOrEqual(6);
    expect(lineCount).toBeGreaterThan(100);
  });
});
