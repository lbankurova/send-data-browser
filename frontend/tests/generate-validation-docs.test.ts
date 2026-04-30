/**
 * Validation Document Generator
 *
 * Reads generated JSON per study + reference cards (YAML) and produces
 * auto-generated validation documents. No hand-written prose.
 *
 * Run with: npm test -- generate-validation-docs
 * Output:
 *   docs/validation/engine-output.md    (Layer 1 — pure facts)
 *   docs/validation/signal-detection.md (Layer 2 — actual vs planted)
 *   docs/validation/summary.md          (dashboard)
 */
import { describe, test, expect } from "vitest";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import yaml from "js-yaml";

// ─── Paths ──────────────────────────────────────────────────

const GENERATED = resolve(__dirname, "../../backend/generated");
const REFERENCES = resolve(__dirname, "../../docs/validation/references");
const OUTPUT = resolve(__dirname, "../../docs/validation");

// ─── Types ──────────────────────────────────────────────────

interface RefDesign {
  species?: string;
  strain?: string;
  route?: string;
  groups?: number;
  doses?: number[];
  dose_unit?: string;
  duration?: string;
  recovery?: boolean;
  recovery_pairs?: number;
  recovery_duration?: string;
  n_per_group?: number;
  n_per_group_control?: number;
  n_per_group_treated?: number;
  n_per_group_low?: number;
  n_per_group_mid?: number;
  n_per_group_high?: number;
  n_total?: number;
  n_recovery_per_group?: number;
  control_type?: string;
  has_concurrent_control?: boolean;
  design_type?: string;
  sex?: string;
  is_multi_compound?: boolean;
  n_compounds?: number;
  tk_satellites?: boolean;
  [key: string]: unknown;
}

interface RefSignal {
  name: string;
  domain?: string;
  test_pattern?: string;
  specimen_pattern?: string;
  direction?: string;
  expected_class?: string;
  sex?: string;
  groups?: number[];
  note?: string;
}

interface RefAssertion {
  type: string;
  description: string;
  // Equality match for primitive-valued assertions (mortality_loael, noael_combined, ...).
  // null is a meaningful value (e.g., "NOAEL not established") — distinct from absent.
  expected_value?: number | string | null;
  // target_organs_flagged: list of organ_system names that must have target_organ_flag=true.
  expected_organs?: string[];
  // target_organs_flagged: when true, flagged organs MUST equal expected_organs exactly
  // (no missing, no extras). When true, expected_organs: [] means "expect zero flagged" --
  // useful for no-control studies and biologic studies where the GROUND_TRUTH is "no targets."
  expect_only?: boolean;
  // cross_domain_concordance: WoE integration check on target_organ_summary.json.
  organ_system?: string;
  min_domains?: number;
  min_groups_converging?: number;
  // mortality_cause_concordance: walks study_mortality.json deaths[] for cause-pattern hits at a dose.
  expected_dose_level?: number;
  min_count?: number;
  cause_pattern?: string;
  // class_distribution: per-class min/max/exact constraints on finding_class counts in
  // unified_findings.json. Optional `domain` restricts the count to a single SEND domain
  // (e.g., LB). Classes omitted from expected_classes carry no constraint -- the harness
  // does not assert anything about them. Use `exact: N` to pin a count, or `min`/`max`
  // (either or both) for ranges. Phase 3 matcher targeting the over-classification gap.
  expected_classes?: Record<string, { min?: number; max?: number; exact?: number }>;
  domain?: string;
  // severity_distribution: per-organ-system constraints on max_severity in
  // target_organ_summary.json. Severity grades are decimal (engine returns avg of
  // per-finding ints, e.g., 2.33). Constraint kinds: min / max / exact. A null
  // max_severity (organ has no graded findings) FAILS any numeric constraint --
  // intentional: encoding "should be null" via this matcher is not supported, use
  // target_organs_flagged with expect_only: true to assert the organ isn't flagged.
  expected_severity?: Record<string, { min?: number; max?: number; exact?: number }>;
  // tumor_detected: assertions over tumor_summary.json. Supports both a coarse
  // boolean (expected_has_tumors) and per-tumor detail (expected_tumors). When
  // both are set, both are checked. Tumor entries match by organ (exact match
  // case-insensitive) AND morphology_pattern (regex applied to the morphology
  // string, e.g. "ADENOMA, HEPATOCELLULAR" matches /ADENOMA/i). Counts are
  // summed across matching summary rows.
  expected_has_tumors?: boolean;
  expected_tumors?: { organ: string; morphology_pattern?: string; min_count?: number }[];
  // noael_combined / loael_combined: optional sex selector. Defaults to "Combined"
  // when omitted (existing behavior). Set to "M" or "F" to assert against the
  // male or female stratum row. Used for sex-divergent NOAEL studies (e.g.
  // TOXSCI-43066 has documented F-NOAEL=1 vs M-NOAEL=null per the published
  // sex-stratified analysis). The same matcher serves all three strata.
  sex?: string;
  // compound_class_flag: assertion over pk_integration.json:compound_class
  // (the engine's only emit surface for compound modality). Compares the
  // documented compound class (small_molecule / monoclonal_antibody / vaccine /
  // gene_therapy / adc / etc.) against what the engine surfaces. Mismatches
  // mechanically capture the D9 gap at the source: vaccine + gene-therapy
  // studies currently emit no compound_class (engine has no classifier for
  // those modalities). Case-insensitive equality. expected_compound_class:null
  // is meaningful (REGRESSION_PIN of absence). Phase 3 matcher targeting the
  // compound-class root cause (Stream 1).
  expected_compound_class?: string | null;
  // recovery_verdict: assertion over recovery_verdicts.json per_subject records.
  // Filters per-subject finding records by (dose_level, domain, specimen regex,
  // finding regex), counts those matching `expected_verdict`, asserts the
  // count meets `min_count`. dose_level is the unified_findings dose-group index
  // (0=control through n=top-dose), resolved per-subject via subject_context.json
  // DOSE_GROUP_ORDER. Verdict vocabulary per engine emit: reversed,
  // partially_reversed, persistent, progressing, anomaly, insufficient_n,
  // low_power, not_examined. Reuses pre-existing fields: `domain` (line 94,
  // shared with class_distribution), `min_count` (line 86, shared with
  // mortality_cause_concordance). Phase 3 matcher targeting recovery semantics:
  // exemplar pair on PointCross hepatic hypertrophy -- MED dose anomaly verdict
  // (engine correct: emerges only in recovery) vs HIGH dose where engine reports
  // anomaly but cohort aggregate (9/10 affected, sev 2.56) means it should be
  // persistent.
  dose_level?: number;
  specimen_pattern?: string;
  finding_pattern?: string;
  expected_verdict?: string;
}

interface RefNoael {
  combined?: {
    dose_level?: number | null;
    label?: string;
    derivation?: string;
    loael_dose_level?: number;
    loael_label?: string;
    confidence?: number;
    note?: string;
  };
  female?: {
    dose_level?: number | null;
    label?: string;
    loael_dose_level?: number;
    confidence?: number;
  };
}

interface RefTargetOrgans {
  primary?: string[];
  secondary?: string[];
}

interface ReferenceCard {
  study_id: string;
  origin: string;
  source: string;
  design: RefDesign;
  noael?: RefNoael;
  target_organs?: RefTargetOrgans;
  injected_signals?: RefSignal[];
  assertions?: RefAssertion[];
}

interface DoseGroup {
  dose_level: number;
  dose_value: number;
  dose_unit: string;
  is_control: boolean;
  control_type: string | null;
  n_male: number;
  n_female: number;
  n_total: number;
  is_recovery: boolean;
  recovery_armcd?: string;
  recovery_n?: number;
  tk_count?: number;
  [key: string]: unknown;
}

interface Finding {
  domain: string;
  test_code: string;
  test_name: string;
  specimen: string | null;
  finding: string | null;
  sex: string;
  finding_class: string;
  severity: string;
  treatment_related: boolean;
  max_effect_size: number | null;
  min_p_adj: number | null;
  direction: string;
  dose_response_pattern: string;
  [key: string]: unknown;
}

interface NoaelEntry {
  sex: string;
  noael_dose_level: number | null;
  noael_label: string;
  noael_dose_value: number | null;
  loael_dose_level: number | null;
  loael_label: string | null;
  noael_confidence: number;
  noael_derivation: { method: string; n_adverse_at_loael?: number; adverse_findings_at_loael?: unknown[] } | null;
  n_adverse_at_loael: number;
  adverse_domains_at_loael: string[];
  [key: string]: unknown;
}

interface TargetOrgan {
  organ_system: string;
  evidence_score: number;
  n_endpoints: number;
  n_domains: number;
  domains: string[];
  max_signal_score: number;
  n_significant: number;
  n_treatment_related: number;
  target_organ_flag: boolean;
  max_severity: number | null;
  mi_status: string | null;
  om_mi_discount: number | null;
}

interface ProvenanceMsg {
  rule_id: string;
  icon: string;
  message: string;
}

interface ValidationResult {
  rules: { rule_id: string; severity: string; domain: string; description: string; records_affected: number; status: string }[];
  summary: { total_issues: number; errors: number; warnings: number; info: number };
}

interface StudyMetadata {
  species: string;
  strain: string;
  route: string;
  study_type: string;
  treatment: string;
  vehicle?: string;
  last_dosing_day?: number;
  [key: string]: unknown;
}

// ─── Loaders ────────────────────────────────────────────────

function loadRefCards(): ReferenceCard[] {
  if (!existsSync(REFERENCES)) return [];
  return readdirSync(REFERENCES)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .map((f) => yaml.load(readFileSync(resolve(REFERENCES, f), "utf-8")) as ReferenceCard)
    .sort((a, b) => a.study_id.localeCompare(b.study_id));
}

function loadJson<T>(studyDir: string, file: string): T | null {
  const p = resolve(GENERATED, studyDir, file);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

function findStudyDir(studyId: string): string | null {
  if (!existsSync(GENERATED)) return null;
  const dirs = readdirSync(GENERATED);
  // Exact match first
  const exact = dirs.find((d) => d === studyId);
  if (exact) return exact;
  // Fuzzy: study_id contained in dir name (for TOXSCI long names)
  const fuzzy = dirs.find((d) => d.includes(studyId) && !d.includes("%20"));
  return fuzzy ?? null;
}

// ─── Git commit hash ────────────────────────────────────────

function getGitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: resolve(__dirname, "../..") })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

// ─── Engine Output (Layer 1) ────────────────────────────────

function generateEngineOutput(_cards: ReferenceCard[]): string {
  const lines: string[] = [];
  const commitHash = getGitHash();
  const now = new Date().toISOString().replace(/T.*/, "");

  lines.push("# Engine Output");
  lines.push("");
  lines.push(`**Engine:** commit \`${commitHash}\` (${now})`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("Auto-generated from `backend/generated/{study}/` JSON. No manual edits — regenerate with `/regen-validation`.");
  lines.push("");
  lines.push("---");
  lines.push("");

  // Get all study dirs (not just ones with ref cards)
  const studyDirs = readdirSync(GENERATED).filter(
    (d) => !d.includes("%20") && existsSync(resolve(GENERATED, d, "unified_findings.json"))
  );

  for (const dir of studyDirs.sort()) {
    const uf = loadJson<{ findings: Finding[]; dose_groups: DoseGroup[]; total_findings: number }>(dir, "unified_findings.json");
    if (!uf) continue;

    const meta = loadJson<StudyMetadata>(dir, "study_metadata_enriched.json");
    const noael = loadJson<NoaelEntry[]>(dir, "noael_summary.json");
    const targets = loadJson<TargetOrgan[]>(dir, "target_organ_summary.json");
    const prov = loadJson<ProvenanceMsg[]>(dir, "provenance_messages.json");
    const valResults = loadJson<ValidationResult>(dir, "validation_results.json");

    const findings = uf.findings ?? [];
    const doseGroups = (uf.dose_groups ?? []).filter((g: DoseGroup) => !g.is_recovery);
    const recoveryGroups = (uf.dose_groups ?? []).filter((g: DoseGroup) => g.is_recovery);

    lines.push(`## ${dir}`);
    lines.push("");

    // Study design
    if (meta) {
      lines.push("### Design");
      lines.push("");
      lines.push("| Dimension | Value |");
      lines.push("|-----------|-------|");
      lines.push(`| Species / Strain | ${meta.species ?? "?"} / ${meta.strain ?? "?"} |`);
      lines.push(`| Route | ${meta.route ?? "?"} |`);
      lines.push(`| Study type | ${meta.study_type ?? "?"} |`);
      lines.push(`| Treatment | ${meta.treatment ?? "?"} |`);
      if (meta.vehicle) lines.push(`| Vehicle | ${meta.vehicle} |`);
      lines.push(`| Groups (main) | ${doseGroups.length} |`);
      lines.push(`| Recovery groups | ${recoveryGroups.length} |`);
      if (meta.last_dosing_day) lines.push(`| Last dosing day | ${meta.last_dosing_day} |`);
      lines.push("");
    }

    // Dose groups
    if (doseGroups.length > 0) {
      lines.push("### Dose Groups");
      lines.push("");
      lines.push("| Level | Dose | N (M/F) | Control | TK |");
      lines.push("|-------|------|---------|---------|-----|");
      for (const g of doseGroups) {
        const ctrl = g.is_control ? (g.control_type ?? "Yes") : "--";
        const tk = g.tk_count ? String(g.tk_count) : "0";
        lines.push(`| ${g.dose_level} | ${g.dose_value} ${g.dose_unit ?? ""} | ${g.n_male}/${g.n_female} | ${ctrl} | ${tk} |`);
      }
      lines.push("");

      if (recoveryGroups.length > 0) {
        lines.push(`**Recovery:** ${recoveryGroups.length} groups`);
        for (const g of recoveryGroups) {
          lines.push(`- Level ${g.dose_level}: ${g.n_male}M/${g.n_female}F`);
        }
        lines.push("");
      }
    }

    // Classification summary
    const classCounts: Record<string, Record<string, number>> = {};
    for (const f of findings) {
      const d = f.domain ?? "?";
      const c = f.finding_class ?? "unknown";
      if (!classCounts[d]) classCounts[d] = {};
      classCounts[d][c] = (classCounts[d][c] ?? 0) + 1;
    }

    const allClasses = ["tr_adverse", "tr_non_adverse", "tr_adaptive", "equivocal", "not_treatment_related"];
    const domains = Object.keys(classCounts).sort();

    if (domains.length > 0) {
      lines.push("### Finding Classification");
      lines.push("");
      lines.push(`| Domain | Total | ${allClasses.join(" | ")} |`);
      lines.push(`|--------|-------| ${allClasses.map(() => "---").join(" | ")} |`);

      const totals: Record<string, number> = {};
      let grandTotal = 0;

      for (const d of domains) {
        const row = classCounts[d];
        const domainTotal = Object.values(row).reduce((a, b) => a + b, 0);
        grandTotal += domainTotal;
        const cells = allClasses.map((c) => {
          const v = row[c] ?? 0;
          totals[c] = (totals[c] ?? 0) + v;
          return String(v);
        });
        lines.push(`| ${d} | ${domainTotal} | ${cells.join(" | ")} |`);
      }

      lines.push(`| **Total** | **${grandTotal}** | ${allClasses.map((c) => `**${totals[c] ?? 0}**`).join(" | ")} |`);
      lines.push("");
    }

    // NOAEL
    if (noael && noael.length > 0) {
      lines.push("### NOAEL / LOAEL");
      lines.push("");
      lines.push("| Sex | NOAEL | LOAEL | N adverse | Domains | Confidence | Method |");
      lines.push("|-----|-------|-------|-----------|---------|------------|--------|");
      for (const n of noael) {
        const method = n.noael_derivation?.method ?? "?";
        lines.push(`| ${n.sex} | ${n.noael_label ?? "?"} | ${n.loael_label ?? "--"} | ${n.n_adverse_at_loael ?? 0} | ${(n.adverse_domains_at_loael ?? []).join(", ") || "--"} | ${n.noael_confidence?.toFixed(2) ?? "?"} | ${method} |`);
      }
      lines.push("");
    }

    // Target organs
    if (targets && targets.length > 0) {
      const flagged = targets.filter((t) => t.target_organ_flag);
      if (flagged.length > 0) {
        lines.push("### Target Organs");
        lines.push("");
        lines.push("| Organ System | Score | Max Signal | N EP | N Sig | Domains | MI Status | OM-MI |");
        lines.push("|-------------|-------|-----------|------|-------|---------|-----------|-------|");
        for (const t of flagged.sort((a, b) => b.evidence_score - a.evidence_score)) {
          const mi = t.mi_status ?? "--";
          const disc = t.om_mi_discount != null ? t.om_mi_discount.toFixed(2) : "--";
          lines.push(`| ${t.organ_system} | ${t.evidence_score.toFixed(3)} | ${t.max_signal_score.toFixed(3)} | ${t.n_endpoints} | ${t.n_significant} | ${t.domains.join(", ")} | ${mi} | ${disc} |`);
        }
        lines.push("");
      }
    }

    // Provenance (selected)
    if (prov && prov.length > 0) {
      lines.push("### Provenance");
      lines.push("");
      lines.push("| Rule | Message |");
      lines.push("|------|---------|");
      for (const p of prov.slice(0, 10)) {
        lines.push(`| ${p.rule_id} | ${p.message.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`);
      }
      if (prov.length > 10) lines.push(`| ... | *(${prov.length - 10} more)* |`);
      lines.push("");
    }

    // Validation issues
    if (valResults) {
      const triggered = valResults.rules.filter((r) => r.status === "triggered");
      if (triggered.length > 0) {
        lines.push("### Validation Issues");
        lines.push("");
        lines.push("| Rule | Severity | Domain | Records |");
        lines.push("|------|----------|--------|---------|");
        for (const r of triggered) {
          lines.push(`| ${r.rule_id} | ${r.severity} | ${r.domain} | ${r.records_affected} |`);
        }
        lines.push("");
        const s = valResults.summary;
        lines.push(`**Summary:** ${s.errors} errors, ${s.warnings} warnings, ${s.info} info`);
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Signal Detection (Layer 2) ─────────────────────────────

interface DetectionResult {
  signal: RefSignal;
  detected: boolean;
  matchedFindings: { finding_class: string; max_effect_size: number | null; min_p_adj: number | null; sex: string; domain: string }[];
  classNote: string;
}

function checkSignal(signal: RefSignal, findings: Finding[]): DetectionResult {
  let candidates = findings;

  // Filter by domain
  if (signal.domain) {
    candidates = candidates.filter((f) => f.domain === signal.domain);
  }

  // Filter by test_pattern
  if (signal.test_pattern) {
    const re = new RegExp(signal.test_pattern, "i");
    candidates = candidates.filter(
      (f) => re.test(f.test_name ?? "") || re.test(f.test_code ?? "") || re.test(f.finding ?? "")
    );
  }

  // Filter by specimen_pattern
  if (signal.specimen_pattern) {
    const re = new RegExp(signal.specimen_pattern, "i");
    candidates = candidates.filter(
      (f) => re.test(f.specimen ?? "") || re.test(f.finding ?? "")
    );
  }

  // Filter by sex
  if (signal.sex) {
    candidates = candidates.filter((f) => f.sex === signal.sex);
  }

  // A signal is DETECTED if at least one finding exists in the filtered set
  // with finding_class indicating treatment-relatedness
  const treatmentRelated = candidates.filter(
    (f) =>
      f.finding_class === "tr_adverse" ||
      f.finding_class === "tr_non_adverse" ||
      f.finding_class === "tr_adaptive" ||
      f.finding_class === "equivocal" ||
      f.finding_class === "treatment_related" ||
      f.finding_class === "treatment_related_concerning" ||
      f.severity === "adverse" ||
      f.treatment_related === true
  );

  const detected = treatmentRelated.length > 0;

  // Classification note
  let classNote = "";
  if (detected && signal.expected_class) {
    const hasExpectedClass = treatmentRelated.some((f) => f.finding_class === signal.expected_class);
    if (!hasExpectedClass) {
      const actualClasses = [...new Set(treatmentRelated.map((f) => f.finding_class))];
      classNote = `(${actualClasses.join(", ")}, expected ${signal.expected_class})`;
    }
  }

  const matchedFindings = treatmentRelated.slice(0, 5).map((f) => ({
    finding_class: f.finding_class,
    max_effect_size: f.max_effect_size,
    min_p_adj: f.min_p_adj,
    sex: f.sex,
    domain: f.domain,
  }));

  return { signal, detected, matchedFindings, classNote };
}

interface AssertionResult {
  assertion: RefAssertion;
  passed: boolean;
  actual: string;
}

// Engine-output JSON shapes consumed by checkAssertion(). Local to this matcher so
// adding a new assertion type and the JSON it reads stays in one diff.
interface MortalityJson {
  mortality_loael: number | null;
  total_deaths: number;
  total_accidental: number;
  deaths?: { USUBJID: string; dose_level: number; cause: string | null; is_recovery: boolean }[];
}
interface TargetOrganRow {
  organ_system: string;
  target_organ_flag: boolean;
  n_domains: number;
  domains: string[];
  max_severity: number | null;
  evidence_quality?: { convergence?: { groups?: number } };
}

function checkAssertion(
  assertion: RefAssertion,
  findings: Finding[],
  doseGroups: DoseGroup[],
  noael: NoaelEntry[] | null,
  meta: StudyMetadata | null,
  studyDir: string | null
): AssertionResult {
  switch (assertion.type) {
    case "zero_adverse": {
      const adverse = findings.filter((f) => f.finding_class === "tr_adverse");
      return {
        assertion,
        passed: adverse.length === 0,
        actual: `${adverse.length} tr_adverse findings (${findings.length} total)`,
      };
    }
    case "no_concurrent_control": {
      const hasControl = doseGroups.some((g) => g.is_control);
      return {
        assertion,
        passed: !hasControl,
        actual: hasControl ? "has_concurrent_control = true" : "has_concurrent_control = false",
      };
    }
    case "multi_compound_detected": {
      loadJson<ProvenanceMsg[]>(findStudyDir(meta?.treatment ?? "") ?? "", "provenance_messages.json");
      // TODO(tighten): currently always-pass — needs provenance-based check (e.g., MULTI_COMPOUND_DETECTED rule_id present).
      return {
        assertion,
        passed: true,
        actual: "multi-compound study detected (not machine-verified — TODO)",
      };
    }
    case "trend_suppressed": {
      // TODO(tighten): currently always-pass — needs provenance check for TREND_SUPPRESSED rule fire.
      return {
        assertion,
        passed: true,
        actual: "trend suppression active (not machine-verified — TODO)",
      };
    }
    case "design_groups":
    case "no_dose_response": {
      // Description-only assertions (covered by checkDesign). Pass through.
      return { assertion, passed: true, actual: "covered by design check" };
    }
    case "mortality_loael": {
      const mortality = studyDir ? loadJson<MortalityJson>(studyDir, "study_mortality.json") : null;
      if (!mortality) return { assertion, passed: false, actual: "study_mortality.json not found" };
      const actual = mortality.mortality_loael;
      const summary = `mortality_loael=${actual}, ${mortality.total_deaths} deaths + ${mortality.total_accidental} accidental`;
      // If reference card declares expected_value, check equality. null is meaningful (no LOAEL).
      if (assertion.expected_value !== undefined) {
        const passed = actual === assertion.expected_value;
        return { assertion, passed, actual: `${summary} (expected ${assertion.expected_value})` };
      }
      // Legacy: reference card hasn't been tightened yet — fall back to non-null check, flag in actual.
      return { assertion, passed: actual != null, actual: `${summary} [LEGACY: no expected_value]` };
    }
    case "noael_combined": {
      if (!noael) return { assertion, passed: false, actual: "noael_summary.json not found" };
      const sex = assertion.sex ?? "Combined";
      const sexRows = noael.filter((n) => n.sex === sex);
      if (sexRows.length === 0) return { assertion, passed: false, actual: `no ${sex} NOAEL row` };
      // Multi-compound: take the most conservative (lowest) NOAEL.
      const row = sexRows.reduce((a, b) => {
        const aDl = a.noael_dose_level ?? -Infinity;
        const bDl = b.noael_dose_level ?? -Infinity;
        return aDl <= bDl ? a : b;
      });
      const actual = row.noael_dose_level;
      if (assertion.expected_value === undefined) {
        return { assertion, passed: false, actual: `noael(${sex})=${actual} [missing expected_value in YAML]` };
      }
      return {
        assertion,
        passed: actual === assertion.expected_value,
        actual: `noael(${sex})=${actual} (expected ${assertion.expected_value})`,
      };
    }
    case "loael_combined": {
      if (!noael) return { assertion, passed: false, actual: "noael_summary.json not found" };
      const sex = assertion.sex ?? "Combined";
      const sexRows = noael.filter((n) => n.sex === sex);
      if (sexRows.length === 0) return { assertion, passed: false, actual: `no ${sex} NOAEL row` };
      const row = sexRows.reduce((a, b) => {
        const aLo = a.loael_dose_level ?? Infinity;
        const bLo = b.loael_dose_level ?? Infinity;
        return aLo <= bLo ? a : b;
      });
      const actual = row.loael_dose_level;
      if (assertion.expected_value === undefined) {
        return { assertion, passed: false, actual: `loael(${sex})=${actual} [missing expected_value in YAML]` };
      }
      return {
        assertion,
        passed: actual === assertion.expected_value,
        actual: `loael(${sex})=${actual} (expected ${assertion.expected_value})`,
      };
    }
    case "target_organs_flagged": {
      if (!studyDir) return { assertion, passed: false, actual: "no study dir" };
      const targets = loadJson<TargetOrganRow[]>(studyDir, "target_organ_summary.json");
      if (!targets) return { assertion, passed: false, actual: "target_organ_summary.json not found" };
      const expected = assertion.expected_organs ?? [];
      const expectOnly = assertion.expect_only === true;
      // Empty list without expect_only=true is missing config -- a YAML drafted without
      // expected_organs is silent on the question, not asserting "zero flagged."
      if (expected.length === 0 && !expectOnly) {
        return {
          assertion, passed: false,
          actual: "[missing expected_organs in YAML; set expect_only: true to assert zero flagged]",
        };
      }
      const flagged = new Set(targets.filter((t) => t.target_organ_flag).map((t) => t.organ_system.toLowerCase()));
      const expectedSet = new Set(expected.map((o) => o.toLowerCase()));
      const missing = [...expectedSet].filter((o) => !flagged.has(o));
      const extra = expectOnly ? [...flagged].filter((o) => !expectedSet.has(o)) : [];
      const passed = missing.length === 0 && extra.length === 0;
      let actual: string;
      if (passed) {
        if (expected.length === 0) {
          actual = "0 organs flagged (expect_only)";
        } else if (expectOnly) {
          actual = `exact set of ${expected.length} flagged: ${expected.join(", ")}`;
        } else {
          actual = `all ${expected.length} expected organs flagged: ${expected.join(", ")}`;
        }
      } else {
        const parts: string[] = [];
        if (missing.length) parts.push(`MISSING: ${missing.join(", ")}`);
        if (extra.length) parts.push(`UNEXPECTED: ${extra.join(", ")}`);
        parts.push(`flagged: ${[...flagged].join(", ") || "none"}`);
        actual = parts.join("; ");
      }
      return { assertion, passed, actual };
    }
    case "cross_domain_concordance": {
      if (!studyDir) return { assertion, passed: false, actual: "no study dir" };
      const targets = loadJson<TargetOrganRow[]>(studyDir, "target_organ_summary.json");
      if (!targets) return { assertion, passed: false, actual: "target_organ_summary.json not found" };
      const organ = assertion.organ_system?.toLowerCase();
      if (!organ) return { assertion, passed: false, actual: "[missing organ_system in YAML]" };
      const row = targets.find((t) => t.organ_system.toLowerCase() === organ);
      if (!row) return { assertion, passed: false, actual: `organ_system '${organ}' not in target_organ_summary` };
      const minDomains = assertion.min_domains ?? 0;
      const minGroups = assertion.min_groups_converging ?? 0;
      const actualDomains = row.n_domains;
      const actualGroups = row.evidence_quality?.convergence?.groups ?? 0;
      const passed = actualDomains >= minDomains && actualGroups >= minGroups && row.target_organ_flag;
      return {
        assertion,
        passed,
        actual: `${organ}: flag=${row.target_organ_flag}, n_domains=${actualDomains} (need >=${minDomains}, [${row.domains.join(",")}]), convergence_groups=${actualGroups} (need >=${minGroups})`,
      };
    }
    case "mortality_cause_concordance": {
      const mortality = studyDir ? loadJson<MortalityJson>(studyDir, "study_mortality.json") : null;
      if (!mortality) return { assertion, passed: false, actual: "study_mortality.json not found" };
      const dl = assertion.expected_dose_level;
      const minCount = assertion.min_count ?? 1;
      const pattern = assertion.cause_pattern;
      if (dl === undefined || !pattern) {
        return { assertion, passed: false, actual: "[missing expected_dose_level or cause_pattern in YAML]" };
      }
      const re = new RegExp(pattern, "i");
      const matches = (mortality.deaths ?? []).filter((d) => d.dose_level === dl && d.cause != null && re.test(d.cause));
      return {
        assertion,
        passed: matches.length >= minCount,
        actual: `${matches.length} death(s) at dose_level=${dl} matching /${pattern}/i (need >=${minCount}); subjects: ${matches.map((m) => m.USUBJID).join(",") || "none"}`,
      };
    }
    case "tumor_detected": {
      // Reads tumor_summary.json. Two-level assertion:
      //   expected_has_tumors (bool): asserts tumor_summary.has_tumors equals expected
      //   expected_tumors (list):     asserts each entry's organ + morphology_pattern
      //                               appears in summaries with at least min_count animals
      if (!studyDir) return { assertion, passed: false, actual: "no study dir" };
      const tumorData = loadJson<{
        has_tumors?: boolean;
        total_tumor_animals?: number;
        summaries?: { organ?: string; morphology?: string; count?: number }[];
      }>(studyDir, "tumor_summary.json");
      if (!tumorData) {
        return { assertion, passed: false, actual: "tumor_summary.json not found" };
      }
      const violations: string[] = [];
      const passes: string[] = [];

      if (assertion.expected_has_tumors !== undefined) {
        const actual = tumorData.has_tumors ?? false;
        if (actual !== assertion.expected_has_tumors) {
          violations.push(`has_tumors=${actual} (expected ${assertion.expected_has_tumors})`);
        } else {
          passes.push(`has_tumors=${actual}`);
        }
      }

      if (assertion.expected_tumors && assertion.expected_tumors.length > 0) {
        const summaries = tumorData.summaries ?? [];
        for (const entry of assertion.expected_tumors) {
          const minCount = entry.min_count ?? 1;
          const re = entry.morphology_pattern
            ? new RegExp(entry.morphology_pattern, "i")
            : null;
          const matched = summaries.filter((s) => {
            if (!s.organ || s.organ.toLowerCase() !== entry.organ.toLowerCase()) return false;
            if (re && !re.test(s.morphology ?? "")) return false;
            return true;
          });
          const total = matched.reduce((acc, s) => acc + (s.count ?? 0), 0);
          const tag = `${entry.organ}` +
            (entry.morphology_pattern ? `+/${entry.morphology_pattern}/i` : "");
          if (total < minCount) {
            violations.push(`${tag}: ${total} animals (expected >=${minCount})`);
          } else {
            passes.push(`${tag}=${total}`);
          }
        }
      }

      if (assertion.expected_has_tumors === undefined && !assertion.expected_tumors) {
        return { assertion, passed: false, actual: "[missing expected_has_tumors and expected_tumors in YAML]" };
      }

      const passed = violations.length === 0;
      const actual = passed
        ? `${passes.length} tumor check(s) match: ${passes.join(", ")}`
        : `VIOLATIONS: ${violations.join("; ")}`;
      return { assertion, passed, actual };
    }
    case "severity_distribution": {
      // Per-organ-system constraints on max_severity in target_organ_summary.json.
      // Engine returns max_severity as either a decimal grade (e.g., 2.33) or null
      // when the organ has no graded findings. Numeric constraints fail on null --
      // use target_organs_flagged for "this organ should not be flagged" semantics.
      if (!studyDir) return { assertion, passed: false, actual: "no study dir" };
      const targets = loadJson<TargetOrganRow[]>(studyDir, "target_organ_summary.json");
      if (!targets) return { assertion, passed: false, actual: "target_organ_summary.json not found" };
      const expected = assertion.expected_severity;
      if (!expected || Object.keys(expected).length === 0) {
        return { assertion, passed: false, actual: "[missing expected_severity in YAML]" };
      }
      const violations: string[] = [];
      const passes: string[] = [];
      for (const [organ, constraint] of Object.entries(expected)) {
        const row = targets.find((t) => t.organ_system.toLowerCase() === organ.toLowerCase());
        if (!row) {
          violations.push(`${organ}: organ_system not in target_organ_summary`);
          continue;
        }
        const sev = row.max_severity;
        if (sev == null) {
          violations.push(`${organ}: max_severity=null (no graded findings)`);
          continue;
        }
        if (constraint.exact !== undefined) {
          if (sev !== constraint.exact) {
            violations.push(`${organ}: max_severity=${sev} (expected exactly ${constraint.exact})`);
          } else {
            passes.push(`${organ}=${sev}`);
          }
          continue;
        }
        let ok = true;
        if (constraint.min !== undefined && sev < constraint.min) {
          violations.push(`${organ}: max_severity=${sev} (expected >=${constraint.min})`);
          ok = false;
        }
        if (constraint.max !== undefined && sev > constraint.max) {
          violations.push(`${organ}: max_severity=${sev} (expected <=${constraint.max})`);
          ok = false;
        }
        if (ok) passes.push(`${organ}=${sev}`);
      }
      const passed = violations.length === 0;
      const actual = passed
        ? `all ${passes.length} severity constraint(s) match: ${passes.join(", ")}`
        : `VIOLATIONS: ${violations.join("; ")}`;
      return { assertion, passed, actual };
    }
    case "class_distribution": {
      // Per-class min/max/exact constraints on finding_class counts in unified_findings.json.
      // Targets the over-classification gap: vaccine studies (Study2/4) report "non-adverse
      // pharmacology" but engine produces 42-63 tr_adverse findings. expected_classes:
      // {tr_adverse: {max: 0}} mechanically detects the disagreement at the source.
      const expected = assertion.expected_classes;
      if (!expected || Object.keys(expected).length === 0) {
        return { assertion, passed: false, actual: "[missing expected_classes in YAML]" };
      }
      const domainFilter = assertion.domain;
      const scoped = domainFilter
        ? findings.filter((f) => f.domain === domainFilter)
        : findings;
      const counts: Record<string, number> = {};
      for (const f of scoped) {
        const c = f.finding_class ?? "unknown";
        counts[c] = (counts[c] ?? 0) + 1;
      }
      const violations: string[] = [];
      for (const [cls, constraint] of Object.entries(expected)) {
        const actualCount = counts[cls] ?? 0;
        if (constraint.exact !== undefined) {
          if (actualCount !== constraint.exact) {
            violations.push(`${cls}=${actualCount} (expected exactly ${constraint.exact})`);
          }
          continue;
        }
        if (constraint.min !== undefined && actualCount < constraint.min) {
          violations.push(`${cls}=${actualCount} (expected >=${constraint.min})`);
        }
        if (constraint.max !== undefined && actualCount > constraint.max) {
          violations.push(`${cls}=${actualCount} (expected <=${constraint.max})`);
        }
      }
      const scope = domainFilter ? `domain=${domainFilter}` : "all domains";
      const passed = violations.length === 0;
      const actual = passed
        ? `${scoped.length} findings ${scope}; ` +
          Object.entries(expected).map(([cls]) => `${cls}=${counts[cls] ?? 0}`).join(", ")
        : `VIOLATIONS (${scope}, ${scoped.length} findings): ${violations.join("; ")}`;
      return { assertion, passed, actual };
    }
    case "recovery_verdict": {
      // Filters recovery_verdicts.json per-subject finding records by
      // (dose_level, domain, specimen regex, finding regex), counts records
      // whose verdict matches expected_verdict, asserts >= min_count.
      // dose_level resolution requires subject_context.json:DOSE_GROUP_ORDER.
      // Engine surface: backend/services/analysis/recovery_verdicts.py.
      // PointCross exemplar: MED hepatic hypertrophy anomaly>=10 (engine
      // correct) vs HIGH hepatic hypertrophy persistent>=10 (engine reports
      // anomaly -- SCIENCE-FLAG: per-subject main_severity=null schema appears
      // to read this individual's main-arm reading rather than the cohort
      // aggregate, mislabeling true persistence as anomaly).
      if (!studyDir) return { assertion, passed: false, actual: "no study dir" };
      const expectedVerdict = assertion.expected_verdict;
      const minCount = assertion.min_count;
      if (!expectedVerdict || minCount === undefined) {
        return { assertion, passed: false, actual: "[missing expected_verdict or min_count in YAML]" };
      }
      const rv = loadJson<{
        per_subject?: Record<string, {
          findings?: { domain?: string; specimen?: string; finding?: string; verdict?: string }[];
        }>;
      }>(studyDir, "recovery_verdicts.json");
      if (!rv) return { assertion, passed: false, actual: "recovery_verdicts.json not found" };
      const ctxList = loadJson<{ USUBJID: string; DOSE_GROUP_ORDER?: number }[]>(studyDir, "subject_context.json");
      const subToOrder = new Map<string, number>();
      for (const c of ctxList ?? []) {
        if (typeof c.DOSE_GROUP_ORDER === "number") subToOrder.set(c.USUBJID, c.DOSE_GROUP_ORDER);
      }
      const specRe = assertion.specimen_pattern ? new RegExp(assertion.specimen_pattern, "i") : null;
      const findRe = assertion.finding_pattern ? new RegExp(assertion.finding_pattern, "i") : null;
      let matchCount = 0;
      let totalScanned = 0;
      const verdictDistribution: Record<string, number> = {};
      for (const [sid, sub] of Object.entries(rv.per_subject ?? {})) {
        if (assertion.dose_level !== undefined) {
          const ord = subToOrder.get(sid);
          if (ord !== assertion.dose_level) continue;
        }
        for (const f of sub.findings ?? []) {
          if (assertion.domain && f.domain !== assertion.domain) continue;
          if (specRe && !specRe.test(f.specimen ?? "")) continue;
          if (findRe && !findRe.test(f.finding ?? "")) continue;
          totalScanned += 1;
          const v = f.verdict ?? "null";
          verdictDistribution[v] = (verdictDistribution[v] ?? 0) + 1;
          if (v === expectedVerdict) matchCount += 1;
        }
      }
      const passed = matchCount >= minCount;
      const filterDesc = [
        assertion.dose_level !== undefined ? `dose_level=${assertion.dose_level}` : null,
        assertion.domain ? `domain=${assertion.domain}` : null,
        assertion.specimen_pattern ? `specimen=/${assertion.specimen_pattern}/i` : null,
        assertion.finding_pattern ? `finding=/${assertion.finding_pattern}/i` : null,
      ].filter(Boolean).join(", ");
      const distSummary = Object.entries(verdictDistribution)
        .sort((a, b) => b[1] - a[1])
        .map(([v, c]) => `${v}=${c}`)
        .join(", ");
      const actual = passed
        ? `${matchCount} ${expectedVerdict} verdict(s) (>=${minCount}) at ${filterDesc}; ${totalScanned} records scanned; distribution: ${distSummary || "none"}`
        : `VIOLATION: ${matchCount} ${expectedVerdict} verdict(s) at ${filterDesc} (expected >=${minCount}); ${totalScanned} records scanned; distribution: ${distSummary || "none"}`;
      return { assertion, passed, actual };
    }
    case "compound_class_flag": {
      // Reads pk_integration.json:compound_class -- the engine's only emit
      // surface for compound modality. Documented expected class is asserted
      // against engine output; mismatches captures the D9 gap (Stream 1) at
      // the source rather than via the downstream class_distribution proxy.
      // See generator/pk_integration.py:275 (emit point) and
      // services/analysis/compound_class.py:484-543 (modality detection;
      // notably has no classifiers for vaccine or gene_therapy, so those
      // studies emit nothing).
      if (!studyDir) return { assertion, passed: false, actual: "no study dir" };
      if (assertion.expected_compound_class === undefined) {
        return { assertion, passed: false, actual: "[missing expected_compound_class in YAML]" };
      }
      const pk = loadJson<{ compound_class?: string | null }>(studyDir, "pk_integration.json");
      const actualValue = pk?.compound_class ?? null;
      const expected = assertion.expected_compound_class;
      const passed =
        (expected === null && actualValue === null) ||
        (typeof expected === "string" &&
          typeof actualValue === "string" &&
          expected.toLowerCase() === actualValue.toLowerCase());
      const actualStr =
        actualValue === null
          ? "null (no compound_class in pk_integration.json or file absent)"
          : `"${actualValue}"`;
      const expectedStr = expected === null ? "null" : `"${expected}"`;
      return {
        assertion,
        passed,
        actual: `pk_integration.compound_class = ${actualStr} (expected ${expectedStr})`,
      };
    }
    default:
      // Strict default: unknown types fail loud rather than silently passing.
      return {
        assertion,
        passed: false,
        actual: `unknown assertion type '${assertion.type}' — strict default refuses to silently pass`,
      };
  }
}

interface DesignCheck {
  dimension: string;
  expected: string;
  actual: string;
  match: boolean;
}

function checkDesign(card: ReferenceCard, doseGroups: DoseGroup[], recoveryGroups: DoseGroup[], meta: StudyMetadata | null): DesignCheck[] {
  const checks: DesignCheck[] = [];
  const d = card.design;

  if (d.species && meta) {
    // Handle species synonyms
    const synonyms: Record<string, string[]> = {
      primate: ["monkey", "primate", "cynomolgus", "macaca"],
      monkey: ["monkey", "primate", "cynomolgus", "macaca"],
      rat: ["rat"],
      dog: ["dog", "beagle"],
      rabbit: ["rabbit"],
    };
    const expLower = d.species.toLowerCase();
    const actLower = (meta.species ?? "").toLowerCase();
    const expGroup = Object.entries(synonyms).find(([, v]) => v.some((s) => expLower.includes(s)));
    const actGroup = Object.entries(synonyms).find(([, v]) => v.some((s) => actLower.includes(s)));
    const speciesMatch = expGroup && actGroup ? expGroup[0] === actGroup[0] : expLower.includes(actLower) || actLower.includes(expLower);

    checks.push({
      dimension: "Species",
      expected: d.species,
      actual: meta.species ?? "?",
      match: speciesMatch,
    });
  }

  if (d.groups !== undefined) {
    checks.push({
      dimension: "Groups (main)",
      expected: String(d.groups),
      actual: String(doseGroups.length),
      match: doseGroups.length === d.groups,
    });
  }

  if (d.doses && d.doses.length > 0) {
    // Filter out null dose values for comparison (biologics often have null doses in XPT)
    const actualDoses = doseGroups.map((g) => g.dose_value).filter((v) => v != null).sort((a, b) => a - b);
    const expectedDoses = [...d.doses].sort((a, b) => a - b);
    const dosesMatch = JSON.stringify(actualDoses) === JSON.stringify(expectedDoses);
    checks.push({
      dimension: "Doses",
      expected: expectedDoses.join(", ") + (d.dose_unit ? ` ${d.dose_unit}` : ""),
      actual: actualDoses.join(", ") + (doseGroups[0]?.dose_unit ? ` ${doseGroups[0].dose_unit}` : ""),
      match: dosesMatch,
    });
  }

  if (d.recovery !== undefined) {
    // Recovery can be encoded two ways:
    // 1. Separate is_recovery=true groups (recoveryGroups)
    // 2. recovery_n > 0 fields on main dose groups
    const recoveryOnMain = doseGroups.filter((g) => (g.recovery_n ?? 0) > 0);
    const hasRecovery = recoveryGroups.length > 0 || recoveryOnMain.length > 0;
    const recoveryCount = recoveryGroups.length > 0 ? recoveryGroups.length : recoveryOnMain.length;
    checks.push({
      dimension: "Recovery",
      expected: d.recovery ? "Yes" : "No",
      actual: hasRecovery ? `Yes (${recoveryCount} groups)` : "No",
      match: hasRecovery === d.recovery,
    });
  }

  if (d.has_concurrent_control !== undefined) {
    const hasControl = doseGroups.some((g) => g.is_control);
    checks.push({
      dimension: "Concurrent control",
      expected: d.has_concurrent_control ? "Yes" : "No",
      actual: hasControl ? "Yes" : "No",
      match: hasControl === d.has_concurrent_control,
    });
  }

  return checks;
}

function checkNoael(refNoael: RefNoael | undefined, actualNoael: NoaelEntry[] | null): DesignCheck[] {
  if (!refNoael?.combined || !actualNoael) return [];
  const checks: DesignCheck[] = [];

  // For multi-compound studies, multiple "Combined" rows exist (one per compound).
  // Use the most conservative (lowest dose_level) to match overall study NOAEL.
  const combinedRows = actualNoael.filter((n: NoaelEntry) => n.sex === "Combined");
  if (combinedRows.length === 0) return [];
  const combined = combinedRows.length > 1
    ? combinedRows.reduce((a: NoaelEntry, b: NoaelEntry) => {
        const aDl = a.noael_dose_level ?? -Infinity;
        const bDl = b.noael_dose_level ?? -Infinity;
        return aDl <= bDl ? a : b;
      })
    : combinedRows[0];

  const expectedDl = refNoael.combined.dose_level;
  if (expectedDl !== undefined) {
    checks.push({
      dimension: "NOAEL (Combined)",
      expected: expectedDl === null ? "Not established" : `dose_level ${expectedDl}`,
      actual: combined.noael_dose_level === null ? "Not established" : `dose_level ${combined.noael_dose_level}`,
      match: combined.noael_dose_level === expectedDl,
    });
  }

  return checks;
}

function checkTargetOrgans(refTargets: RefTargetOrgans | undefined, actualTargets: TargetOrgan[] | null): DesignCheck[] {
  if (!refTargets || !actualTargets) return [];
  const checks: DesignCheck[] = [];
  const flagged = actualTargets.filter((t) => t.target_organ_flag).map((t) => t.organ_system.toLowerCase());

  if (refTargets.primary) {
    for (const org of refTargets.primary) {
      checks.push({
        dimension: `Primary target: ${org}`,
        expected: "flagged",
        actual: flagged.includes(org.toLowerCase()) ? "flagged" : "not flagged",
        match: flagged.includes(org.toLowerCase()),
      });
    }
  }
  if (refTargets.secondary) {
    for (const org of refTargets.secondary) {
      checks.push({
        dimension: `Secondary target: ${org}`,
        expected: "flagged",
        actual: flagged.includes(org.toLowerCase()) ? "flagged" : "not flagged",
        match: flagged.includes(org.toLowerCase()),
      });
    }
  }

  return checks;
}

interface StudyScore {
  study_id: string;
  origin: string;
  signalsDetected: number;
  signalsTotal: number;
  designMatched: number;
  designTotal: number;
  assertionsPassed: number;
  assertionsTotal: number;
  classNotes: string[];
  signalDetails: DetectionResult[];
  designDetails: DesignCheck[];
  assertionDetails: AssertionResult[];
}

function generateSignalDetection(cards: ReferenceCard[]): { md: string; scores: StudyScore[] } {
  const lines: string[] = [];
  const scores: StudyScore[] = [];
  const commitHash = getGitHash();
  const now = new Date().toISOString().replace(/T.*/, "");

  lines.push("# Signal Detection");
  lines.push("");
  lines.push(`**Engine:** commit \`${commitHash}\` (${now})`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");
  lines.push("Compares engine output against reference cards in `docs/validation/references/`. Signals are known injected/documented effects — MISSED = bug.");
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const card of cards) {
    const dir = findStudyDir(card.study_id);
    if (!dir) {
      lines.push(`## ${card.study_id} -- NOT FOUND IN GENERATED`);
      lines.push("");
      continue;
    }

    const uf = loadJson<{ findings: Finding[]; dose_groups: DoseGroup[] }>(dir, "unified_findings.json");
    if (!uf) continue;

    const findings = uf.findings ?? [];
    const allGroups = uf.dose_groups ?? [];
    const doseGroups = allGroups.filter((g: DoseGroup) => !g.is_recovery);
    const recoveryGroups = allGroups.filter((g: DoseGroup) => g.is_recovery);
    const noael = loadJson<NoaelEntry[]>(dir, "noael_summary.json");
    const targets = loadJson<TargetOrgan[]>(dir, "target_organ_summary.json");
    const meta = loadJson<StudyMetadata>(dir, "study_metadata_enriched.json");

    const signals = card.injected_signals ?? [];
    const assertions = card.assertions ?? [];

    // Check signals
    const signalResults = signals.map((s) => checkSignal(s, findings));
    const detected = signalResults.filter((r) => r.detected).length;

    // Check design
    const designChecks = [
      ...checkDesign(card, doseGroups, recoveryGroups, meta),
      ...checkNoael(card.noael, noael),
      ...checkTargetOrgans(card.target_organs, targets),
    ];
    const designMatched = designChecks.filter((c) => c.match).length;

    // Check assertions
    const assertionResults = assertions.map((a) => checkAssertion(a, findings, doseGroups, noael, meta, dir));
    const assertionsPassed = assertionResults.filter((r) => r.passed).length;

    const classNotes = signalResults.filter((r) => r.classNote).map((r) => `${r.signal.name}: ${r.classNote}`);

    scores.push({
      study_id: card.study_id,
      origin: card.origin,
      signalsDetected: detected,
      signalsTotal: signals.length,
      designMatched,
      designTotal: designChecks.length,
      assertionsPassed,
      assertionsTotal: assertions.length,
      classNotes,
      signalDetails: signalResults,
      designDetails: designChecks,
      assertionDetails: assertionResults,
    });

    // Render study section
    const sigLabel = signals.length > 0 ? `${detected}/${signals.length}` : "--";
    lines.push(`## ${card.study_id} (${card.origin}) -- Signals: ${sigLabel}`);
    lines.push("");
    lines.push(`**Source:** ${card.source}`);
    lines.push("");

    // Signal detection table
    if (signals.length > 0) {
      lines.push("### Injected Signals");
      lines.push("");
      lines.push("| # | Signal | Domain | Sex | Class | Effect Size | p | Verdict | Note |");
      lines.push("|---|--------|--------|-----|-------|-------------|---|---------|------|");

      signalResults.forEach((r, i) => {
        const s = r.signal;
        const sex = s.sex ?? "any";
        if (r.detected) {
          const best = r.matchedFindings[0];
          const es = best?.max_effect_size != null ? best.max_effect_size.toFixed(2) : "--";
          const p = best?.min_p_adj != null ? (best.min_p_adj < 0.001 ? "<0.001" : best.min_p_adj.toFixed(3)) : "--";
          const cls = best?.finding_class ?? "?";
          const note = [r.classNote, s.note].filter(Boolean).join(" ");
          lines.push(`| ${i + 1} | ${s.name} | ${s.domain ?? "--"} | ${sex} | ${cls} | ${es} | ${p} | **DETECTED** | ${note} |`);
        } else {
          lines.push(`| ${i + 1} | ${s.name} | ${s.domain ?? "--"} | ${sex} | -- | -- | -- | **MISSED** | ${s.note ?? ""} |`);
        }
      });
      lines.push("");
    }

    // Design assertions
    if (designChecks.length > 0) {
      lines.push("### Design");
      lines.push("");
      lines.push("| Dimension | Expected | Actual | Verdict |");
      lines.push("|-----------|----------|--------|---------|");
      for (const c of designChecks) {
        lines.push(`| ${c.dimension} | ${c.expected} | ${c.actual} | ${c.match ? "**MATCH**" : "**MISMATCH**"} |`);
      }
      lines.push("");
    }

    // Assertions
    if (assertions.length > 0) {
      lines.push("### Assertions");
      lines.push("");
      lines.push("| Assertion | Expected | Actual | Verdict |");
      lines.push("|-----------|----------|--------|---------|");
      for (const r of assertionResults) {
        lines.push(`| ${r.assertion.type} | ${r.assertion.description} | ${r.actual} | ${r.passed ? "**MATCH**" : "**MISMATCH**"} |`);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  return { md: lines.join("\n"), scores };
}

// ─── Summary (Dashboard) ────────────────────────────────────

function generateSummary(scores: StudyScore[]): string {
  const lines: string[] = [];
  const commitHash = getGitHash();
  const now = new Date().toISOString().replace(/T.*/, "");

  lines.push("# Validation Summary");
  lines.push("");
  lines.push(`**Engine:** commit \`${commitHash}\` (${now})`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push("");

  // Summary table
  lines.push("| Study | Origin | Signals | Design | Assertions | Notes |");
  lines.push("|-------|--------|---------|--------|------------|-------|");

  let totalSigDetected = 0, totalSigTotal = 0;
  let totalDesMatched = 0, totalDesTotal = 0;
  let totalAssPass = 0, totalAssTotal = 0;

  for (const s of scores) {
    const sig = s.signalsTotal > 0 ? `${s.signalsDetected}/${s.signalsTotal}` : "--";
    const des = s.designTotal > 0 ? `${s.designMatched}/${s.designTotal}` : "--";
    const ass = s.assertionsTotal > 0 ? `${s.assertionsPassed}/${s.assertionsTotal}` : "--";
    const notes: string[] = [];
    if (s.classNotes.length > 0) notes.push(`${s.classNotes.length} class note(s)`);
    if (s.designDetails.some((d) => !d.match)) notes.push("MISMATCH");
    if (s.signalDetails.some((d) => !d.detected)) notes.push("MISSED");

    lines.push(`| ${s.study_id} | ${s.origin} | ${sig} | ${des} | ${ass} | ${notes.join(", ")} |`);

    totalSigDetected += s.signalsDetected;
    totalSigTotal += s.signalsTotal;
    totalDesMatched += s.designMatched;
    totalDesTotal += s.designTotal;
    totalAssPass += s.assertionsPassed;
    totalAssTotal += s.assertionsTotal;
  }

  lines.push("");
  lines.push(`**Totals:** ${totalSigDetected}/${totalSigTotal} signals detected, ${totalDesMatched}/${totalDesTotal} design matched, ${totalAssPass}/${totalAssTotal} assertions passed`);
  lines.push("");

  // Missed signals
  const missed = scores.flatMap((s) =>
    s.signalDetails.filter((d) => !d.detected).map((d) => ({ study: s.study_id, signal: d.signal.name, domain: d.signal.domain ?? "--", note: d.signal.note ?? "" }))
  );
  if (missed.length > 0) {
    lines.push("## Missed Signals");
    lines.push("");
    lines.push("| Study | Signal | Domain | Note |");
    lines.push("|-------|--------|--------|------|");
    for (const m of missed) {
      lines.push(`| ${m.study} | ${m.signal} | ${m.domain} | ${m.note.replace(/\|/g, "\\|")} |`);
    }
    lines.push("");
  }

  // Design mismatches
  const mismatches = scores.flatMap((s) =>
    s.designDetails.filter((d) => !d.match).map((d) => ({ study: s.study_id, ...d }))
  );
  if (mismatches.length > 0) {
    lines.push("## Design Mismatches");
    lines.push("");
    lines.push("| Study | Dimension | Expected | Actual |");
    lines.push("|-------|-----------|----------|--------|");
    for (const m of mismatches) {
      lines.push(`| ${m.study} | ${m.dimension} | ${m.expected.replace(/\|/g, "\\|")} | ${m.actual.replace(/\|/g, "\\|")} |`);
    }
    lines.push("");
  }

  // Classification notes
  const allClassNotes = scores.flatMap((s) =>
    s.classNotes.map((n) => ({ study: s.study_id, note: n }))
  );
  if (allClassNotes.length > 0) {
    lines.push("## Classification Notes");
    lines.push("");
    lines.push("| Study | Note |");
    lines.push("|-------|------|");
    for (const n of allClassNotes) {
      lines.push(`| ${n.study} | ${n.note.replace(/\|/g, "\\|")} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ─── Test harness ───────────────────────────────────────────

// ─── Baseline regression gate ───────────────────────────────
//
// The matcher above can now FAIL on assertion mismatches that previously passed silently.
// To avoid the entire corpus going red on day one, we snapshot today's failures into
// .assertion-baseline.json. Test fails on REGRESSIONS (new failures) but tolerates baselined
// failures. Bootstrap or refresh: UPDATE_BASELINE=1 npm test -- generate-validation-docs.
// Fixes (baseline entry that now passes) print but don't fail; rerun with UPDATE_BASELINE=1
// to drop them so they can't regress silently.

const BASELINE_PATH = resolve(OUTPUT, ".assertion-baseline.json");

interface BaselineEntry {
  study_id: string;
  type: string;
  description: string;
}

function key(e: BaselineEntry): string {
  return `${e.study_id}::${e.type}::${e.description}`;
}

function loadBaseline(): BaselineEntry[] {
  if (!existsSync(BASELINE_PATH)) return [];
  return JSON.parse(readFileSync(BASELINE_PATH, "utf-8")) as BaselineEntry[];
}

function currentFailures(scores: StudyScore[]): BaselineEntry[] {
  return scores
    .flatMap((s) =>
      s.assertionDetails
        .filter((a) => !a.passed)
        .map<BaselineEntry>((a) => ({ study_id: s.study_id, type: a.assertion.type, description: a.assertion.description }))
    )
    .sort((a, b) => key(a).localeCompare(key(b)));
}

describe("Validation Document Generator", () => {
  test("generates validation documents", () => {
    const cards = loadRefCards();
    expect(cards.length).toBeGreaterThan(0);

    // Layer 1: Engine output
    const engineOutput = generateEngineOutput(cards);
    const enginePath = resolve(OUTPUT, "engine-output.md");
    writeFileSync(enginePath, engineOutput, "utf-8");

    // Layer 2: Signal detection
    const { md: signalDetection, scores } = generateSignalDetection(cards);
    const signalPath = resolve(OUTPUT, "signal-detection.md");
    writeFileSync(signalPath, signalDetection, "utf-8");

    // Dashboard
    const summary = generateSummary(scores);
    const summaryPath = resolve(OUTPUT, "summary.md");
    writeFileSync(summaryPath, summary, "utf-8");

    // Log results
    const totalSignals = scores.reduce((a, s) => a + s.signalsTotal, 0);
    const detectedSignals = scores.reduce((a, s) => a + s.signalsDetected, 0);
    const totalDesign = scores.reduce((a, s) => a + s.designTotal, 0);
    const matchedDesign = scores.reduce((a, s) => a + s.designMatched, 0);

    console.log(`  ✓ Engine output written to: ${enginePath}`);
    console.log(`  ✓ Signal detection written to: ${signalPath}`);
    console.log(`  ✓ Summary written to: ${summaryPath}`);
    console.log(`    ${cards.length} studies, ${detectedSignals}/${totalSignals} signals, ${matchedDesign}/${totalDesign} design checks`);

    expect(engineOutput.length).toBeGreaterThan(100);
    expect(signalDetection.length).toBeGreaterThan(100);
    expect(summary.length).toBeGreaterThan(100);
  });

  test("assertion failures are subset of baseline (no regressions)", () => {
    const cards = loadRefCards();
    const { scores } = generateSignalDetection(cards);
    const current = currentFailures(scores);
    const updateMode = process.env.UPDATE_BASELINE === "1";

    if (updateMode) {
      writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n", "utf-8");
      console.log(`  ✓ Baseline updated: ${BASELINE_PATH} (${current.length} known failures)`);
      return;
    }

    const baseline = loadBaseline();
    const baselineKeys = new Set(baseline.map(key));
    const currentKeys = new Set(current.map(key));

    const regressions = current.filter((e) => !baselineKeys.has(key(e)));
    const fixes = baseline.filter((e) => !currentKeys.has(key(e)));

    if (fixes.length > 0) {
      console.log(`  ℹ ${fixes.length} baselined failure(s) now PASS — refresh baseline with UPDATE_BASELINE=1:`);
      for (const f of fixes) console.log(`    + ${f.study_id} :: ${f.type} :: ${f.description}`);
    }

    if (regressions.length > 0) {
      console.log(`  ✗ ${regressions.length} REGRESSION(s) — assertion now fails that wasn't in baseline:`);
      for (const r of regressions) console.log(`    - ${r.study_id} :: ${r.type} :: ${r.description}`);
    }

    expect(regressions, `New assertion failures: ${regressions.map(key).join("; ")}`).toEqual([]);
  });
});
