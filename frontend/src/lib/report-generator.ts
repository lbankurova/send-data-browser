/**
 * Generates a standalone HTML study report and opens it in a new tab.
 * Fetches all study data via existing API functions, builds HTML with inline CSS.
 */

import { fetchStudyMetadata } from "@/lib/api";
import { formatDoseShortLabel } from "@/lib/severity-colors";
import {
  fetchStudySignalSummary,
  fetchTargetOrganSummary,
  fetchNoaelSummary,
  fetchAdverseEffectSummary,
  fetchRuleResults,
} from "@/lib/analysis-view-api";
import type { StudyMetadata } from "@/types";
import type {
  SignalSummaryRow,
  TargetOrganRow,
  NoaelSummaryRow,
  AdverseEffectSummaryRow,
} from "@/types/analysis-views";
import { buildOrganGroups, type OrganGroup } from "@/lib/rule-synthesis";

const BRAND = "#2083d5";

function escapeHtml(str: string | null | undefined): string {
  if (!str) return "—";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function severityBadge(sev: string): string {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    adverse: { bg: "#FEE2E2", text: "#991B1B", border: "#FECACA" },
    warning: { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
    normal: { bg: "#D1FAE5", text: "#065F46", border: "#A7F3D0" },
    critical: { bg: "#FEE2E2", text: "#991B1B", border: "#FECACA" },
    info: { bg: "#DBEAFE", text: "#1E40AF", border: "#BFDBFE" },
  };
  const c = colors[sev] ?? colors.normal;
  return `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:600;background:${c.bg};color:${c.text};border:1px solid ${c.border}">${escapeHtml(sev)}</span>`;
}

const TIER_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Critical: { bg: "#FEE2E2", text: "#991B1B", border: "#FECACA" },
  Notable: { bg: "#FEF3C7", text: "#92400E", border: "#FDE68A" },
  Observed: { bg: "#F3F4F6", text: "#6B7280", border: "#E5E7EB" },
};

function tierBadge(tier: string): string {
  const c = TIER_COLORS[tier] ?? TIER_COLORS.Observed;
  return `<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:9px;font-weight:600;background:${c.bg};color:${c.text};border:1px solid ${c.border}">${escapeHtml(tier)}</span>`;
}

function formatDuration(iso: string | null): string {
  if (!iso) return "—";
  const wMatch = iso.match(/^P(\d+)W$/);
  if (wMatch) return `${wMatch[1]} weeks`;
  const dMatch = iso.match(/^P(\d+)D$/);
  if (dMatch) return `${dMatch[1]} days`;
  return iso;
}

function metaRow(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<tr><td style="color:#6b7280;padding:3px 12px 3px 0;font-size:12px">${escapeHtml(label)}</td><td style="font-size:12px">${escapeHtml(value)}</td></tr>`;
}

function buildStudyInfoSection(meta: StudyMetadata): string {
  const subjects =
    meta.subjects && meta.males && meta.females
      ? `${meta.subjects} (${meta.males}M, ${meta.females}F)`
      : meta.subjects;
  return `
    <h2 style="color:${BRAND};border-bottom:2px solid ${BRAND};padding-bottom:4px;margin-top:32px">1. Study Information</h2>
    <table style="border-collapse:collapse;width:100%;margin-top:8px">
      ${metaRow("Study ID", meta.study_id)}
      ${metaRow("Title", meta.title)}
      ${metaRow("Protocol", meta.protocol)}
      ${metaRow("Species / Strain", meta.species && meta.strain ? `${meta.species} / ${meta.strain}` : meta.species)}
      ${metaRow("Study Type", meta.study_type)}
      ${metaRow("Sponsor", meta.sponsor)}
      ${metaRow("Test Facility", meta.test_facility)}
      ${metaRow("Study Director", meta.study_director)}
      ${metaRow("GLP Compliance", meta.glp)}
      ${metaRow("SEND Version", meta.send_version)}
      ${metaRow("Subjects", subjects)}
      ${metaRow("Duration", formatDuration(meta.dosing_duration))}
      ${metaRow("Start Date", meta.start_date)}
      ${metaRow("End Date", meta.end_date)}
    </table>
  `;
}

function buildDesignSection(
  meta: StudyMetadata,
  signals: SignalSummaryRow[]
): string {
  // Extract unique dose groups from signal data
  const doseMap = new Map<number, string>();
  for (const row of signals) {
    if (!doseMap.has(row.dose_level)) {
      doseMap.set(row.dose_level, formatDoseShortLabel(row.dose_label));
    }
  }
  const doses = [...doseMap.entries()].sort((a, b) => a[0] - b[0]);

  return `
    <h2 style="color:${BRAND};border-bottom:2px solid ${BRAND};padding-bottom:4px;margin-top:32px">2. Study Design</h2>
    <table style="border-collapse:collapse;width:100%;margin-top:8px">
      ${metaRow("Design", meta.design)}
      ${metaRow("Route", meta.route)}
      ${metaRow("Test Article", meta.treatment)}
      ${metaRow("Vehicle", meta.vehicle)}
    </table>
    <h3 style="font-size:13px;margin-top:16px;color:#374151">Dose Groups</h3>
    <table style="border-collapse:collapse;margin-top:4px;font-size:12px">
      <tr style="background:#f3f4f6"><th style="padding:4px 16px 4px 0;text-align:left;color:#6b7280">Level</th><th style="padding:4px 0;text-align:left;color:#6b7280">Label</th></tr>
      ${doses.map(([level, label]) => `<tr><td style="padding:3px 16px 3px 0">${level}</td><td style="padding:3px 0">${escapeHtml(label)}</td></tr>`).join("")}
    </table>
  `;
}

function buildKeyFindingsSection(
  signals: SignalSummaryRow[],
  organs: TargetOrganRow[],
  adverse: AdverseEffectSummaryRow[]
): string {
  const targetOrgans = organs.filter((o) => o.target_organ_flag);
  const trRelated = signals.filter((s) => s.treatment_related);
  const adverseCount = adverse.length;

  return `
    <h2 style="color:${BRAND};border-bottom:2px solid ${BRAND};padding-bottom:4px;margin-top:32px">3. Key Findings</h2>
    <div style="display:flex;gap:24px;margin-top:12px">
      <div style="flex:1;padding:12px;background:#EFF6FF;border-radius:6px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:${BRAND}">${targetOrgans.length}</div>
        <div style="font-size:11px;color:#6b7280">Target Organs</div>
      </div>
      <div style="flex:1;padding:12px;background:#FEF3C7;border-radius:6px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#92400E">${trRelated.length}</div>
        <div style="font-size:11px;color:#6b7280">Treatment-Related Signals</div>
      </div>
      <div style="flex:1;padding:12px;background:#FEE2E2;border-radius:6px;text-align:center">
        <div style="font-size:28px;font-weight:700;color:#991B1B">${adverseCount}</div>
        <div style="font-size:11px;color:#6b7280">Adverse Effects</div>
      </div>
    </div>
    ${targetOrgans.length > 0 ? `
    <h3 style="font-size:13px;margin-top:16px;color:#374151">Target Organs Identified</h3>
    <table style="border-collapse:collapse;width:100%;margin-top:4px;font-size:12px">
      <tr style="background:#f3f4f6">
        <th style="padding:4px 12px 4px 0;text-align:left;color:#6b7280">Organ System</th>
        <th style="padding:4px 12px;text-align:right;color:#6b7280">Evidence Score</th>
        <th style="padding:4px 12px;text-align:right;color:#6b7280">Endpoints</th>
        <th style="padding:4px 12px;text-align:right;color:#6b7280">Domains</th>
      </tr>
      ${targetOrgans
        .sort((a, b) => b.evidence_score - a.evidence_score)
        .map(
          (o) =>
            `<tr style="border-bottom:1px solid #e5e7eb"><td style="padding:4px 12px 4px 0">${escapeHtml(o.organ_system)}</td><td style="padding:4px 12px;text-align:right">${o.evidence_score.toFixed(2)}</td><td style="padding:4px 12px;text-align:right">${o.n_endpoints}</td><td style="padding:4px 12px;text-align:right">${o.n_domains}</td></tr>`
        )
        .join("")}
    </table>` : ""}
  `;
}

function buildNoaelSection(noael: NoaelSummaryRow[]): string {
  if (noael.length === 0)
    return `<h2 style="color:${BRAND};border-bottom:2px solid ${BRAND};padding-bottom:4px;margin-top:32px">4. NOAEL Determination</h2><p style="font-size:12px;color:#6b7280">NOAEL data not available.</p>`;

  return `
    <h2 style="color:${BRAND};border-bottom:2px solid ${BRAND};padding-bottom:4px;margin-top:32px">4. NOAEL Determination</h2>
    <div style="display:flex;gap:16px;margin-top:12px;flex-wrap:wrap">
      ${noael
        .map(
          (r) => `
        <div style="flex:1;min-width:200px;padding:12px;border:1px solid #e5e7eb;border-radius:6px">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${escapeHtml(r.sex)}</div>
          <div style="font-size:18px;font-weight:700;color:${BRAND}">${r.noael_dose_value} ${escapeHtml(r.noael_dose_unit)}</div>
          <div style="font-size:11px;color:#6b7280">NOAEL: ${escapeHtml(r.noael_label)}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:4px">LOAEL: ${escapeHtml(r.loael_label)} (${r.n_adverse_at_loael} adverse)</div>
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function buildOrganSection(
  organs: TargetOrganRow[],
  adverse: AdverseEffectSummaryRow[],
  organGroups: OrganGroup[]
): string {
  const targetOrgans = organs
    .filter((o) => o.target_organ_flag)
    .sort((a, b) => b.evidence_score - a.evidence_score);

  if (targetOrgans.length === 0) {
    return `<h2 style="color:${BRAND};border-bottom:2px solid ${BRAND};padding-bottom:4px;margin-top:32px;page-break-before:always">5. Findings by Organ System</h2><p style="font-size:12px;color:#6b7280">No target organs identified.</p>`;
  }

  const sections = targetOrgans.map((organ) => {
    const organEffects = adverse.filter(
      (a) => a.organ_system === organ.organ_system
    );
    // Find the synthesized group for this organ
    const synthGroup = organGroups.find((g) => g.organ === organ.organ_system);
    const signalLine = synthGroup?.synthLines.find((l) => l.isWarning)?.text ?? "";

    return `
      <div style="margin-top:16px;padding:12px;border:1px solid #e5e7eb;border-radius:6px">
        <div style="display:flex;align-items:center;gap:8px">
          <h3 style="font-size:14px;font-weight:600;color:#111827;margin:0">${escapeHtml(organ.organ_system)}</h3>
          ${synthGroup ? tierBadge(synthGroup.tier) : ""}
        </div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px">
          Evidence: ${organ.evidence_score.toFixed(2)} · ${organ.n_endpoints} endpoints across ${organ.n_domains} domain(s)
        </div>
        ${signalLine ? `<div style="font-size:11px;color:#374151;margin-top:6px;padding:4px 8px;border-left:3px solid #F59E0B;background:#FFFBEB">${escapeHtml(signalLine)}</div>` : ""}
        ${organEffects.length > 0 ? `
        <table style="border-collapse:collapse;width:100%;margin-top:8px;font-size:11px">
          <tr style="background:#f3f4f6">
            <th style="padding:3px 8px 3px 0;text-align:left;color:#6b7280">Endpoint</th>
            <th style="padding:3px 8px;text-align:left;color:#6b7280">Sex</th>
            <th style="padding:3px 8px;text-align:left;color:#6b7280">Dose</th>
            <th style="padding:3px 8px;text-align:right;color:#6b7280">p-value</th>
            <th style="padding:3px 8px;text-align:center;color:#6b7280">Severity</th>
          </tr>
          ${organEffects
            .slice(0, 20)
            .map(
              (e) =>
                `<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:3px 8px 3px 0">${escapeHtml(e.endpoint_label)}</td><td style="padding:3px 8px">${escapeHtml(e.sex)}</td><td style="padding:3px 8px">${escapeHtml(formatDoseShortLabel(e.dose_label))}</td><td style="padding:3px 8px;text-align:right;font-family:monospace">${e.p_value != null ? e.p_value.toFixed(4) : "—"}</td><td style="padding:3px 8px;text-align:center">${severityBadge(e.severity)}</td></tr>`
            )
            .join("")}
          ${organEffects.length > 20 ? `<tr><td colspan="5" style="padding:4px 0;font-size:10px;color:#6b7280">...and ${organEffects.length - 20} more</td></tr>` : ""}
        </table>` : `<p style="font-size:11px;color:#6b7280;margin-top:4px">No adverse effects recorded for this organ.</p>`}
      </div>
    `;
  });

  return `
    <h2 style="color:${BRAND};border-bottom:2px solid ${BRAND};padding-bottom:4px;margin-top:32px;page-break-before:always">5. Findings by Organ System</h2>
    ${sections.join("")}
  `;
}

function buildMethodsSection(): string {
  return `
    <h2 style="color:${BRAND};border-bottom:2px solid ${BRAND};padding-bottom:4px;margin-top:32px;page-break-before:always">6. Statistical Methods</h2>
    <div style="font-size:12px;line-height:1.6;color:#374151">
      <p><strong>Continuous endpoints:</strong> Group means compared to control using Dunnett's test (parametric) or Dunn's test (non-parametric). Dose-response trends assessed via Jonckheere-Terpstra trend test.</p>
      <p style="margin-top:8px"><strong>Categorical/incidence endpoints:</strong> Fisher's exact test for pairwise comparisons; Cochran-Armitage trend test for dose-response.</p>
      <p style="margin-top:8px"><strong>Signal scoring:</strong> Composite score (0–1) combining statistical significance, effect size, dose-response pattern, and biological plausibility. Treatment-related flag set when signal score ≥ 0.6 with consistent dose-response.</p>
      <p style="margin-top:8px"><strong>NOAEL determination:</strong> Based on identification of adverse effects at each dose level. NOAEL is the highest dose with no adverse treatment-related effects. LOAEL is the lowest dose with at least one adverse effect.</p>
    </div>
  `;
}

function buildAppendicesSection(
  signals: SignalSummaryRow[],
  adverse: AdverseEffectSummaryRow[],
  organGroups: OrganGroup[]
): string {
  // Top 50 signals sorted by signal_score desc
  const topSignals = [...signals]
    .sort((a, b) => b.signal_score - a.signal_score)
    .slice(0, 50);

  // Top 50 adverse effects
  const topAdverse = adverse.slice(0, 50);

  return `
    <h2 style="color:${BRAND};border-bottom:2px solid ${BRAND};padding-bottom:4px;margin-top:32px;page-break-before:always">7. Appendices</h2>

    <h3 style="font-size:13px;margin-top:16px;color:#374151">A. Signal Summary (Top ${topSignals.length})</h3>
    <table style="border-collapse:collapse;width:100%;margin-top:4px;font-size:10px">
      <tr style="background:#f3f4f6">
        <th style="padding:3px 6px;text-align:left;color:#6b7280">Endpoint</th>
        <th style="padding:3px 6px;text-align:left;color:#6b7280">Organ</th>
        <th style="padding:3px 6px;text-align:left;color:#6b7280">Sex</th>
        <th style="padding:3px 6px;text-align:left;color:#6b7280">Dose</th>
        <th style="padding:3px 6px;text-align:right;color:#6b7280">Score</th>
        <th style="padding:3px 6px;text-align:right;color:#6b7280">p-value</th>
        <th style="padding:3px 6px;text-align:center;color:#6b7280">Severity</th>
      </tr>
      ${topSignals
        .map(
          (s) =>
            `<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:2px 6px">${escapeHtml(s.endpoint_label)}</td><td style="padding:2px 6px">${escapeHtml(s.organ_system)}</td><td style="padding:2px 6px">${escapeHtml(s.sex)}</td><td style="padding:2px 6px">${escapeHtml(formatDoseShortLabel(s.dose_label))}</td><td style="padding:2px 6px;text-align:right;font-family:monospace">${s.signal_score.toFixed(3)}</td><td style="padding:2px 6px;text-align:right;font-family:monospace">${s.p_value != null ? s.p_value.toFixed(4) : "—"}</td><td style="padding:2px 6px;text-align:center">${severityBadge(s.severity)}</td></tr>`
        )
        .join("")}
    </table>

    <h3 style="font-size:13px;margin-top:24px;color:#374151;page-break-before:always">B. Adverse Effects (Top ${topAdverse.length})</h3>
    <table style="border-collapse:collapse;width:100%;margin-top:4px;font-size:10px">
      <tr style="background:#f3f4f6">
        <th style="padding:3px 6px;text-align:left;color:#6b7280">Endpoint</th>
        <th style="padding:3px 6px;text-align:left;color:#6b7280">Organ</th>
        <th style="padding:3px 6px;text-align:left;color:#6b7280">Sex</th>
        <th style="padding:3px 6px;text-align:left;color:#6b7280">Dose</th>
        <th style="padding:3px 6px;text-align:center;color:#6b7280">Direction</th>
        <th style="padding:3px 6px;text-align:right;color:#6b7280">p-value</th>
        <th style="padding:3px 6px;text-align:center;color:#6b7280">Severity</th>
      </tr>
      ${topAdverse
        .map(
          (a) =>
            `<tr style="border-bottom:1px solid #f3f4f6"><td style="padding:2px 6px">${escapeHtml(a.endpoint_label)}</td><td style="padding:2px 6px">${escapeHtml(a.organ_system)}</td><td style="padding:2px 6px">${escapeHtml(a.sex)}</td><td style="padding:2px 6px">${escapeHtml(formatDoseShortLabel(a.dose_label))}</td><td style="padding:2px 6px;text-align:center">${escapeHtml(a.direction ?? "—")}</td><td style="padding:2px 6px;text-align:right;font-family:monospace">${a.p_value != null ? a.p_value.toFixed(4) : "—"}</td><td style="padding:2px 6px;text-align:center">${severityBadge(a.severity)}</td></tr>`
        )
        .join("")}
    </table>

    <h3 style="font-size:13px;margin-top:24px;color:#374151;page-break-before:always">C. Synthesized Insights by Organ System</h3>
    <div style="margin-top:8px">
      ${organGroups
        .map(
          (g) => `
        <div style="margin-bottom:16px;padding:10px 12px;border:1px solid #e5e7eb;border-radius:6px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            ${tierBadge(g.tier)}
            <span style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#374151">${escapeHtml(g.displayName)}</span>
          </div>
          ${g.endpointCount > 0 ? `<div style="font-size:10px;color:#9ca3af;margin-bottom:6px">${g.endpointCount} endpoint${g.endpointCount !== 1 ? "s" : ""}${g.domainCount > 0 ? `, ${g.domainCount} domain${g.domainCount !== 1 ? "s" : ""}` : ""}</div>` : ""}
          ${g.synthLines
            .map((line) => {
              if (line.chips) {
                return `<div style="margin-top:4px"><div style="font-size:10px;color:#9ca3af;margin-bottom:3px">${escapeHtml(line.text)}</div><div style="display:flex;flex-wrap:wrap;gap:4px">${line.chips.map((c) => `<span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;background:#f3f4f6;color:#6b7280">${escapeHtml(c)}</span>`).join("")}</div></div>`;
              }
              if (line.isWarning) {
                return `<div style="font-size:11px;color:#374151;padding:3px 8px;border-left:3px solid #F59E0B;background:#FFFBEB;margin-top:4px">${escapeHtml(line.text)}</div>`;
              }
              return `<div style="font-size:11px;color:#6b7280;margin-top:4px">${escapeHtml(line.text)}</div>`;
            })
            .join("")}
        </div>
      `
        )
        .join("")}
    </div>
  `;
}

function buildHtml(
  meta: StudyMetadata,
  signals: SignalSummaryRow[],
  organs: TargetOrganRow[],
  noael: NoaelSummaryRow[],
  adverse: AdverseEffectSummaryRow[],
  organGroups: OrganGroup[]
): string {
  const now = new Date().toLocaleString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Study Report — ${escapeHtml(meta.study_id)}</title>
  <style>
    @media print {
      body { font-size: 11px; }
      .no-print { display: none; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      max-width: 900px;
      margin: 0 auto;
      padding: 32px 24px;
      color: #111827;
      font-size: 13px;
      line-height: 1.5;
    }
    h1 { font-size: 22px; margin: 0; }
    h2 { font-size: 16px; margin-bottom: 8px; }
    h3 { font-size: 13px; margin-bottom: 4px; }
    table { border-spacing: 0; }
    p { margin: 0; }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="border-bottom:3px solid ${BRAND};padding-bottom:12px;margin-bottom:8px">
    <h1 style="color:${BRAND}">Study Report</h1>
    <div style="font-size:18px;font-weight:600;margin-top:4px">${escapeHtml(meta.study_id)}</div>
    ${meta.title ? `<div style="font-size:13px;color:#6b7280;margin-top:2px">${escapeHtml(meta.title)}</div>` : ""}
    <div style="font-size:11px;color:#9ca3af;margin-top:8px">Generated ${escapeHtml(now)} · Preclinical Case</div>
  </div>

  ${buildStudyInfoSection(meta)}
  ${buildDesignSection(meta, signals)}
  ${buildKeyFindingsSection(signals, organs, adverse)}
  ${buildNoaelSection(noael)}
  ${buildOrganSection(organs, adverse, organGroups)}
  ${buildMethodsSection()}
  ${buildAppendicesSection(signals, adverse, organGroups)}

  <!-- Footer -->
  <div style="margin-top:48px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;text-align:center">
    Generated by Preclinical Case · ${escapeHtml(now)}
  </div>
</body>
</html>`;
}

export async function generateStudyReport(studyId: string): Promise<void> {
  // Fetch all data in parallel
  const [meta, signals, organs, noael, adverse, rules] = await Promise.all([
    fetchStudyMetadata(studyId),
    fetchStudySignalSummary(studyId),
    fetchTargetOrganSummary(studyId),
    fetchNoaelSummary(studyId),
    fetchAdverseEffectSummary(studyId),
    fetchRuleResults(studyId),
  ]);

  const organGroups = buildOrganGroups(rules);
  const html = buildHtml(meta, signals, organs, noael, adverse, organGroups);

  // Open in new tab
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}
