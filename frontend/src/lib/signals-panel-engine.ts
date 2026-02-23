/**
 * Signals Panel Engine — structured, section-based findings for the Signals panel.
 *
 * Derives deterministic study-level findings from NOAEL, target organ, and
 * signal summary data, organizes them into UI sections by priority band,
 * and merges compound statements (organ headline + evidence + dose-response).
 *
 * Section assignment is by priority only:
 *   900–1000 → Decision Summary
 *   800–899  → Target Organs (headline)
 *   600–799  → Target Organs (sub-lines, merged)
 *   400–599  → Modifiers
 *   200–399  → Caveats & Review Flags
 *   <200     → suppressed
 */

import type {
  NoaelSummaryRow,
  TargetOrganRow,
  SignalSummaryRow,
} from "@/types/analysis-views";

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type UISection =
  | "DecisionBar"
  | "TargetOrgansHeadline"
  | "TargetOrgansEvidence"
  | "Modifiers"
  | "Caveats"
  | null;

export type StatementIcon = "fact" | "warning" | "review-flag";

export interface PanelStatement {
  id: string;
  priority: number;
  icon: StatementIcon;
  text: string;
  section: UISection;
  organSystem: string | null;
  /** Click target — endpoint label or null */
  clickEndpoint: string | null;
  /** Click target — organ system key or null */
  clickOrgan: string | null;
}

export interface OrganBlock {
  organ: string;
  organKey: string;
  domains: string[];
  evidenceScore: number;
  headline: PanelStatement;
  evidenceLines: PanelStatement[];
  doseResponse: {
    nEndpoints: number;
    topEndpoint: string;
  } | null;
}

export interface MetricsLine {
  noael: string;
  noaelSex: string;
  loael: string;
  driver: string | null;
  targets: number;
  significantRatio: string;
  doseResponse: number;
  domains: number;
  nAdverseAtLoael: number;
  adverseDomainsAtLoael: string[];
  noaelConfidence: number | null;
}

export interface SignalsPanelData {
  decisionBar: PanelStatement[];
  studyStatements: PanelStatement[];
  organBlocks: OrganBlock[];
  modifiers: PanelStatement[];
  caveats: PanelStatement[];
  metrics: MetricsLine;
}

// ---------------------------------------------------------------------------
// Slot formatters (pure functions)
// ---------------------------------------------------------------------------

export function sexLabel(sex: string): string {
  if (sex === "Combined" || sex === "BOTH") return "M+F";
  if (sex === "M") return "males";
  if (sex === "F") return "females";
  return sex;
}

export function organName(organ: string): string {
  if (organ.toLowerCase() === "general") return "General (systemic)";
  return organ
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function endpointFmt(label: string): string {
  return label.replace(/\.$/, "");
}

function assignSection(priority: number): UISection {
  if (priority >= 900) return "DecisionBar";
  if (priority >= 800) return "TargetOrgansHeadline";
  if (priority >= 600) return "TargetOrgansEvidence";
  if (priority >= 400) return "Modifiers";
  if (priority >= 200) return "Caveats";
  return null;
}

// ---------------------------------------------------------------------------
// Internal rule type
// ---------------------------------------------------------------------------

interface DerivedRule {
  id: string;
  priority: number;
  icon: StatementIcon;
  text: string;
  organSystem: string | null;
  clickEndpoint: string | null;
  clickOrgan: string | null;
  /** For organ blocks: domain list */
  domains?: string[];
  /** For organ dose-response sub-lines */
  drInfo?: { nEndpoints: number; topEndpoint: string };
}

// ---------------------------------------------------------------------------
// NOAEL rules → Decision Summary
// ---------------------------------------------------------------------------

// @field FIELD-48 — panel statement (structured signals panel entry)
function deriveNoaelRules(
  noael: NoaelSummaryRow[],
  signals: SignalSummaryRow[]
): DerivedRule[] {
  if (noael.length === 0) return [];
  const rules: DerivedRule[] = [];

  const combined = noael.find((n) => n.sex === "Combined") ?? noael[0];
  const maleRow = noael.find((n) => n.sex === "M");
  const femaleRow = noael.find((n) => n.sex === "F");
  const unit = combined.noael_dose_unit || "mg/kg";

  // Find driving endpoint at LOAEL dose
  const loaelSignals = signals.filter(
    (s) =>
      s.dose_level === combined.loael_dose_level &&
      s.severity === "adverse" &&
      s.treatment_related
  );
  const driving = [...loaelSignals].sort(
    (a, b) => Math.abs(b.effect_size ?? 0) - Math.abs(a.effect_size ?? 0)
  )[0];

  // Get LOAEL dose value
  const loaelDose = signals.find(
    (s) => s.dose_level === combined.loael_dose_level && s.dose_value !== null
  )?.dose_value;

  const hasAdverse = signals.some(
    (s) => s.severity === "adverse" && s.treatment_related
  );

  if (!hasAdverse) {
    const maxDose = Math.max(
      ...signals.filter((s) => s.dose_value !== null).map((s) => s.dose_value!),
      0
    );
    rules.push({
      id: "noael.no.adverse.effects",
      priority: 990,
      icon: "fact",
      text: `No adverse effects identified. NOAEL is the highest dose tested (${maxDose} ${unit}).`,
      organSystem: null,
      clickEndpoint: null,
      clickOrgan: null,
    });
  } else if (combined.noael_dose_value === 0) {
    const loaelStr =
      loaelDose != null
        ? `${loaelDose} ${unit}`
        : combined.loael_label.replace(/^Group \d+,\s*/, "");
    const driverStr = driving ? endpointFmt(driving.endpoint_label) : null;
    rules.push({
      id: "noael.all.doses.adverse",
      priority: 990,
      icon: "fact",
      text: `NOAEL is Control (${sexLabel(combined.sex)})${driverStr ? `, driven by ${driverStr}` : ""}. LOAEL is ${loaelStr}.`,
      organSystem: null,
      clickEndpoint: driving?.endpoint_label ?? null,
      clickOrgan: null,
    });
  } else {
    const loaelStr = loaelDose != null ? `${loaelDose} ${unit}` : "";
    const driverStr = driving ? endpointFmt(driving.endpoint_label) : null;
    rules.push({
      id: "noael.assignment",
      priority: 1000,
      icon: "fact",
      text: `NOAEL is ${combined.noael_dose_value} ${unit} (${sexLabel(combined.sex)})${driverStr ? `, driven by ${driverStr}` : ""}. LOAEL is ${loaelStr}.`,
      organSystem: null,
      clickEndpoint: driving?.endpoint_label ?? null,
      clickOrgan: null,
    });
  }

  // Sex difference
  if (
    maleRow &&
    femaleRow &&
    maleRow.noael_dose_value !== femaleRow.noael_dose_value
  ) {
    rules.push({
      id: "noael.sex.difference",
      priority: 940,
      icon: "warning",
      text: `NOAEL differs by sex: ${maleRow.noael_dose_value} ${unit} (M) vs. ${femaleRow.noael_dose_value} ${unit} (F). Combined NOAEL uses the lower value.`,
      organSystem: null,
      clickEndpoint: null,
      clickOrgan: null,
    });
  }

  // Low-confidence caveat
  if (combined.noael_confidence != null && combined.noael_confidence < 0.6) {
    rules.push({
      id: "noael.low.confidence",
      priority: 930,
      icon: "review-flag",
      text: `NOAEL confidence is low (${Math.round(combined.noael_confidence * 100)}%) — review for limited endpoints, sex inconsistency, or borderline significance.`,
      organSystem: null,
      clickEndpoint: null,
      clickOrgan: null,
    });
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Organ rules → Target Organs section
// ---------------------------------------------------------------------------

function deriveOrganRules(
  targetOrgans: TargetOrganRow[],
  signals: SignalSummaryRow[]
): DerivedRule[] {
  const rules: DerivedRule[] = [];

  for (const organ of targetOrgans) {
    if (!organ.target_organ_flag) continue;

    // Headline: organ.target.identification (priority 850)
    rules.push({
      id: "organ.target.identification",
      priority: 850,
      icon: "fact",
      text: `${organName(organ.organ_system)} — target organ identified`,
      organSystem: organ.organ_system,
      clickEndpoint: null,
      clickOrgan: organ.organ_system,
      domains: organ.domains,
    });

    // Dose-response sub-line: synthesis.organ.dose.response (priority 750)
    const organSigs = signals.filter(
      (s) => s.organ_system === organ.organ_system
    );
    const monotonic = organSigs.filter(
      (s) =>
        s.dose_response_pattern === "monotonic_increase" ||
        s.dose_response_pattern === "monotonic_decrease"
    );
    // Unique endpoint labels with monotonic trend
    const monEndpoints = new Map<string, number>();
    for (const s of monotonic) {
      const existing = monEndpoints.get(s.endpoint_label) ?? 0;
      monEndpoints.set(
        s.endpoint_label,
        Math.max(existing, Math.abs(s.effect_size ?? 0))
      );
    }
    if (monEndpoints.size >= 3) {
      let topEndpoint = "";
      let topScore = -1;
      for (const [ep, score] of monEndpoints) {
        if (score > topScore) {
          topEndpoint = ep;
          topScore = score;
        }
      }
      rules.push({
        id: "synthesis.organ.dose.response",
        priority: 750,
        icon: "fact",
        text: `Dose-response: ${monEndpoints.size} endpoints · ${topEndpoint} strongest`,
        organSystem: organ.organ_system,
        clickEndpoint: null,
        clickOrgan: organ.organ_system,
        drInfo: { nEndpoints: monEndpoints.size, topEndpoint },
      });
    }
  }

  // Single-domain non-targets → Caveats (priority 350)
  for (const organ of targetOrgans) {
    if (organ.target_organ_flag) continue;
    if (organ.n_domains !== 1 || organ.evidence_score < 0.3) continue;

    rules.push({
      id: "organ.single.domain.only",
      priority: 350,
      icon: "review-flag",
      text: `${organName(organ.organ_system)}: effects noted, single domain (${organ.domains[0]}) — review target organ status.`,
      organSystem: organ.organ_system,
      clickEndpoint: null,
      clickOrgan: organ.organ_system,
    });
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Study rules → Decision Summary (last line)
// ---------------------------------------------------------------------------

function deriveStudyRules(
  signals: SignalSummaryRow[],
  nTargetOrgans: number
): DerivedRule[] {
  const rules: DerivedRule[] = [];

  const hasTR = signals.some((s) => s.treatment_related);
  const hasDR = signals.some((s) => s.dose_response_flag);

  if (hasTR && hasDR) {
    // Demote when ≥2 organ-scope target organ facts already convey this
    const boost = nTargetOrgans >= 2 ? -100 : 0;
    rules.push({
      id: "study.treatment.related.signal",
      priority: 750 + boost,
      icon: "fact",
      text: "Treatment-related effects are present with dose-response behavior.",
      organSystem: null,
      clickEndpoint: null,
      clickOrgan: null,
    });
  } else if (!hasTR) {
    rules.push({
      id: "study.no.treatment.effect",
      priority: 740,
      icon: "fact",
      text: "No treatment-related effects detected at any dose level.",
      organSystem: null,
      clickEndpoint: null,
      clickOrgan: null,
    });
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Promotion rules → Modifiers & Caveats
// ---------------------------------------------------------------------------

function deriveSynthesisPromotions(
  signals: SignalSummaryRow[]
): DerivedRule[] {
  const rules: DerivedRule[] = [];

  // Sex-specific organ pattern → Modifiers (priority 450)
  const epSex = new Map<string, { organ: string; mSig: boolean; fSig: boolean }>();
  for (const s of signals) {
    if (s.sex !== "M" && s.sex !== "F") continue;
    if (s.p_value === null) continue;
    const key = `${s.endpoint_label}||${s.organ_system}`;
    let entry = epSex.get(key);
    if (!entry) {
      entry = { organ: s.organ_system, mSig: false, fSig: false };
      epSex.set(key, entry);
    }
    if (s.p_value < 0.05) {
      if (s.sex === "M") entry.mSig = true;
      else entry.fSig = true;
    }
  }

  const organSexCounts = new Map<string, number>();
  for (const entry of epSex.values()) {
    if (entry.mSig === entry.fSig) continue;
    const sex = entry.mSig ? "M" : "F";
    const key = `${entry.organ}||${sex}`;
    organSexCounts.set(key, (organSexCounts.get(key) ?? 0) + 1);
  }

  for (const [key, count] of organSexCounts) {
    if (count < 3) continue;
    const [organ, sex] = key.split("||");
    rules.push({
      id: "synthesis.organ.sex.specific",
      priority: 450,
      icon: "warning",
      text: `${organName(organ)} changes in ${sexLabel(sex)} only.`,
      organSystem: organ,
      clickEndpoint: null,
      clickOrgan: organ,
    });
  }

  // Widespread low power → Caveats (priority 300)
  const lowPower = signals.filter(
    (s) =>
      s.effect_size !== null &&
      Math.abs(s.effect_size) >= 0.8 &&
      (s.p_value === null || s.p_value >= 0.05)
  );
  const lpOrgans = new Set(lowPower.map((s) => s.organ_system));
  const lpEndpoints = new Set(lowPower.map((s) => s.endpoint_label));
  if (lpEndpoints.size >= 3 && lpOrgans.size >= 2) {
    rules.push({
      id: "synthesis.study.low.power",
      priority: 300,
      icon: "review-flag",
      text: `Large effects without significance in ${lpEndpoints.size} endpoints across ${lpOrgans.size} organs — review for adequate power.`,
      organSystem: null,
      clickEndpoint: null,
      clickOrgan: null,
    });
  }

  return rules;
}

// ---------------------------------------------------------------------------
// Compound merge + section assignment
// ---------------------------------------------------------------------------

function buildOrganBlocks(rules: DerivedRule[], targetOrgans: TargetOrganRow[]): OrganBlock[] {
  // Group by organ_system
  const organMap = new Map<string, {
    headline: DerivedRule | null;
    evidence: DerivedRule[];
    drInfo: { nEndpoints: number; topEndpoint: string } | null;
  }>();

  for (const rule of rules) {
    if (rule.id === "organ.target.identification" && rule.organSystem) {
      let entry = organMap.get(rule.organSystem);
      if (!entry) {
        entry = { headline: null, evidence: [], drInfo: null };
        organMap.set(rule.organSystem, entry);
      }
      entry.headline = rule;
    }
    if (rule.id === "synthesis.organ.dose.response" && rule.organSystem) {
      let entry = organMap.get(rule.organSystem);
      if (!entry) {
        entry = { headline: null, evidence: [], drInfo: null };
        organMap.set(rule.organSystem, entry);
      }
      entry.drInfo = rule.drInfo ?? null;
    }
  }

  const blocks: OrganBlock[] = [];
  for (const [key, data] of organMap) {
    if (!data.headline) continue;
    const target = targetOrgans.find((t) => t.organ_system === key);
    blocks.push({
      organ: organName(key),
      organKey: key,
      domains: data.headline.domains ?? [],
      evidenceScore: target?.evidence_score ?? 0,
      headline: {
        id: data.headline.id,
        priority: data.headline.priority,
        icon: data.headline.icon,
        text: data.headline.text,
        section: "TargetOrgansHeadline",
        organSystem: key,
        clickEndpoint: null,
        clickOrgan: key,
      },
      evidenceLines: data.evidence.map((r) => ({
        id: r.id,
        priority: r.priority,
        icon: r.icon,
        text: r.text,
        section: "TargetOrgansEvidence" as UISection,
        organSystem: key,
        clickEndpoint: null,
        clickOrgan: key,
      })),
      doseResponse: data.drInfo,
    });
  }

  // Sort by evidence score descending
  blocks.sort((a, b) => b.evidenceScore - a.evidenceScore);
  return blocks;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function buildMetrics(
  noael: NoaelSummaryRow[],
  targetOrgans: TargetOrganRow[],
  signals: SignalSummaryRow[]
): MetricsLine {
  const combined = noael.find((n) => n.sex === "Combined") ?? noael[0];
  const nTargets = targetOrgans.filter((t) => t.target_organ_flag).length;
  const nSig = signals.filter(
    (s) => s.p_value !== null && s.p_value < 0.05
  ).length;
  const nDR = signals.filter((s) => s.dose_response_flag).length;
  const nDomains = new Set(signals.map((s) => s.domain)).size;

  let noaelStr: string;
  if (!combined) noaelStr = "Not established";
  else if (combined.noael_dose_value === 0) noaelStr = "Control";
  else
    noaelStr = `${combined.noael_dose_value} ${combined.noael_dose_unit || "mg/kg"}`;

  // LOAEL string
  const unit = combined?.noael_dose_unit || "mg/kg";
  let loaelStr = "—";
  if (combined) {
    const loaelDose = signals.find(
      (s) => s.dose_level === combined.loael_dose_level && s.dose_value !== null
    )?.dose_value;
    if (loaelDose != null) loaelStr = `${loaelDose} ${unit}`;
    else if (combined.loael_label) loaelStr = combined.loael_label.replace(/^Group \d+,\s*/, "");
  }

  // Driving endpoint at LOAEL
  let driverStr: string | null = null;
  if (combined) {
    const loaelSignals = signals.filter(
      (s) =>
        s.dose_level === combined.loael_dose_level &&
        s.severity === "adverse" &&
        s.treatment_related
    );
    const driving = [...loaelSignals].sort(
      (a, b) => Math.abs(b.effect_size ?? 0) - Math.abs(a.effect_size ?? 0)
    )[0];
    if (driving) driverStr = endpointFmt(driving.endpoint_label);
  }

  return {
    noael: noaelStr,
    noaelSex: combined ? sexLabel(combined.sex) : "",
    loael: loaelStr,
    driver: driverStr,
    targets: nTargets,
    significantRatio: `${nSig}/${signals.length}`,
    doseResponse: nDR,
    domains: nDomains,
    nAdverseAtLoael: combined?.n_adverse_at_loael ?? 0,
    adverseDomainsAtLoael: combined?.adverse_domains_at_loael ?? [],
    noaelConfidence: combined?.noael_confidence ?? null,
  };
}

/** Recalculate filter-responsive metrics (sig/D-R/domains update with filters). */
export function buildFilteredMetrics(
  baseMetrics: MetricsLine,
  filteredSignals: SignalSummaryRow[]
): MetricsLine {
  const nSig = filteredSignals.filter(
    (s) => s.p_value !== null && s.p_value < 0.05
  ).length;
  const nDR = filteredSignals.filter((s) => s.dose_response_flag).length;
  const nDomains = new Set(filteredSignals.map((s) => s.domain)).size;
  return {
    ...baseMetrics,
    significantRatio: `${nSig}/${filteredSignals.length}`,
    doseResponse: nDR,
    domains: nDomains,
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function buildSignalsPanelData(
  noael: NoaelSummaryRow[],
  targetOrgans: TargetOrganRow[],
  signals: SignalSummaryRow[]
): SignalsPanelData {
  const noaelRules = deriveNoaelRules(noael, signals);
  const organRules = deriveOrganRules(targetOrgans, signals);
  const nTargetOrgans = organRules.filter(
    (r) => r.id === "organ.target.identification"
  ).length;
  const studyRules = deriveStudyRules(signals, nTargetOrgans);
  const promotions = deriveSynthesisPromotions(signals);

  const allRules = [...noaelRules, ...organRules, ...studyRules, ...promotions];

  // Assign sections by priority
  const statements: PanelStatement[] = allRules.map((r) => ({
    id: r.id,
    priority: r.priority,
    icon: r.icon,
    text: r.text,
    section: assignSection(r.priority),
    organSystem: r.organSystem,
    clickEndpoint: r.clickEndpoint,
    clickOrgan: r.clickOrgan,
  }));

  // Decision Bar: NOAEL-scope rules only (priority >= 900)
  const decisionBar = statements
    .filter((s) => s.section === "DecisionBar")
    .sort((a, b) => b.priority - a.priority);

  // Study-scope statements that land in the findings body (not in Decision Bar)
  // study.treatment.related.signal (priority 750 or 650) and study.no.treatment.effect (740)
  const studyStatements = statements
    .filter(
      (s) =>
        (s.id === "study.treatment.related.signal" ||
          s.id === "study.no.treatment.effect") &&
        s.section !== "DecisionBar"
    )
    .sort((a, b) => b.priority - a.priority);

  // Build organ blocks from organ-scope rules (merging headline + evidence + dose-response)
  const organBlocks = buildOrganBlocks(allRules, targetOrgans);

  // Modifiers
  const modifiers = statements
    .filter((s) => s.section === "Modifiers")
    .sort((a, b) => b.priority - a.priority);

  // Caveats
  const caveats = statements
    .filter((s) => s.section === "Caveats")
    .sort((a, b) => b.priority - a.priority);

  return {
    decisionBar,
    studyStatements,
    organBlocks,
    modifiers,
    caveats,
    metrics: buildMetrics(noael, targetOrgans, signals),
  };
}
