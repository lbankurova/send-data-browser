import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { classifyProtectiveSignal, getProtectiveBadgeStyle } from "@/lib/protective-signal";
import type { ProtectiveClassification } from "@/lib/protective-signal";
import { specimenToOrganSystem } from "@/lib/histopathology-helpers";
import { useStudySelection } from "@/contexts/StudySelectionContext";
import type { RuleResult, SignalSummaryRow } from "@/types/analysis-views";

interface ProtectiveFinding {
  finding: string;
  specimens: string[];
  sexes: string;
  ctrlPct: string;
  highPct: string;
  classification: ProtectiveClassification;
}

function aggregateProtectiveFindings(rules: RuleResult[]): ProtectiveFinding[] {
  const map = new Map<string, { specimens: Set<string>; sexes: Set<string>; ctrlPct: string; highPct: string; hasR19: boolean }>();

  for (const r of rules) {
    if (r.rule_id !== "R18" && r.rule_id !== "R19") continue;

    const p = r.params;
    if (p?.finding && p?.specimen && p?.ctrl_pct) {
      const findingName = p.finding;
      const entry = map.get(findingName) ?? { specimens: new Set(), sexes: new Set(), ctrlPct: p.ctrl_pct, highPct: p.high_pct ?? "", hasR19: false };
      entry.specimens.add(p.specimen);
      if (p.sex) entry.sexes.add(p.sex);
      if (parseInt(p.ctrl_pct) > parseInt(entry.ctrlPct)) { entry.ctrlPct = p.ctrl_pct; entry.highPct = p.high_pct ?? ""; }
      if (r.rule_id === "R19") entry.hasR19 = true;
      map.set(findingName, entry);
    }
  }

  return [...map.entries()]
    .map(([finding, info]) => {
      const ctrlInc = parseInt(info.ctrlPct) / 100;
      const highInc = parseInt(info.highPct) / 100;
      const result = classifyProtectiveSignal({
        finding,
        controlIncidence: ctrlInc,
        highDoseIncidence: highInc,
        doseConsistency: info.hasR19 ? "Moderate" : "Weak",
        direction: "decreasing",
        crossDomainCorrelateCount: info.hasR19 ? 2 : 0,
      });
      return {
        finding,
        specimens: [...info.specimens].sort(),
        sexes: [...info.sexes].sort().join(", "),
        ctrlPct: info.ctrlPct,
        highPct: info.highPct,
        classification: result?.classification ?? "background" as ProtectiveClassification,
      };
    })
    .sort((a, b) => {
      const order: Record<ProtectiveClassification, number> = { pharmacological: 0, "treatment-decrease": 1, background: 2 };
      const d = order[a.classification] - order[b.classification];
      if (d !== 0) return d;
      return parseInt(b.ctrlPct) - parseInt(a.ctrlPct);
    });
}

export function ProtectiveSignalsBar({
  rules,
  studyId,
  signalData,
}: {
  rules: RuleResult[];
  studyId: string;
  signalData?: SignalSummaryRow[];
}) {
  const navigate = useNavigate();
  const { navigateTo } = useStudySelection();
  const findings = useMemo(() => aggregateProtectiveFindings(rules), [rules]);

  const correlatesByFinding = useMemo(() => {
    const map = new Map<string, { label: string; direction: string }[]>();
    if (!signalData || findings.length === 0) return map;
    for (const f of findings) {
      if (f.classification === "background") continue;
      const spec = f.specimens[0];
      if (!spec) continue;
      const organ = specimenToOrganSystem(spec).toLowerCase();
      const correlates: { label: string; direction: string }[] = [];
      const seen = new Set<string>();
      for (const row of signalData) {
        if (row.organ_system.toLowerCase() !== organ) continue;
        if (row.endpoint_label.toLowerCase() === f.finding.toLowerCase()) continue;
        if (seen.has(row.endpoint_label)) continue;
        seen.add(row.endpoint_label);
        const dir = row.direction === "down" ? "\u2193" : row.direction === "up" ? "\u2191" : "";
        if (dir) correlates.push({ label: row.endpoint_label, direction: dir });
      }
      if (correlates.length > 0) map.set(f.finding, correlates.slice(0, 5));
    }
    return map;
  }, [findings, signalData]);

  if (findings.length === 0) return null;

  const pharmacological = findings.filter((f) => f.classification === "pharmacological");
  const treatmentDecrease = findings.filter((f) => f.classification === "treatment-decrease");
  const background = findings.filter((f) => f.classification === "background");

  const classifiedCount = pharmacological.length + treatmentDecrease.length;

  return (
    <div className="shrink-0 border-b px-4 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Protective signals
        </span>
        <span className="text-[11px] text-muted-foreground">
          {findings.length} finding{findings.length !== 1 ? "s" : ""} with decreased incidence
          {classifiedCount > 0 && ` \u00b7 ${pharmacological.length} pharmacological \u00b7 ${treatmentDecrease.length} treatment-related`}
        </span>
      </div>
      <div className="space-y-1.5">
        {pharmacological.map((f) => (
          <div key={`ph-${f.finding}`} className="border-l-2 border-l-blue-400 py-1 pl-2.5">
            <div className="flex items-baseline gap-2">
              <button
                className="text-xs font-semibold hover:underline"
                onClick={() => {
                  const spec = f.specimens[0];
                  if (spec) {
                    navigateTo({ specimen: spec });
                    navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { specimen: spec, finding: f.finding } });
                  }
                }}
              >
                {f.finding}
              </button>
              <span className="text-[11px] font-medium text-muted-foreground">{f.sexes}</span>
              <span className={cn("rounded px-1.5 py-0.5", getProtectiveBadgeStyle("pharmacological"))}>pharmacological</span>
            </div>
            <div className="text-[11px] leading-snug text-muted-foreground">
              {f.ctrlPct}% control {"\u2192"} {f.highPct}% high dose in {f.specimens.join(", ")}
            </div>
            {correlatesByFinding.get(f.finding) && (
              <div className="mt-0.5 text-[11px] text-muted-foreground/70">
                Correlated: {correlatesByFinding.get(f.finding)!.map((c, i) => (
                  <span key={c.label}>{i > 0 && ", "}{c.label} {c.direction}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {treatmentDecrease.map((f) => (
          <div key={`td-${f.finding}`} className="border-l-2 border-l-slate-400 py-0.5 pl-2.5">
            <div className="flex items-baseline gap-2">
              <button
                className="text-xs font-medium hover:underline"
                onClick={() => {
                  const spec = f.specimens[0];
                  if (spec) {
                    navigateTo({ specimen: spec });
                    navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { specimen: spec, finding: f.finding } });
                  }
                }}
              >
                {f.finding}
              </button>
              <span className="text-[11px] text-muted-foreground">{f.sexes}</span>
              <span className={cn("rounded px-1.5 py-0.5", getProtectiveBadgeStyle("treatment-decrease"))}>treatment decrease</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                {f.ctrlPct}% {"\u2192"} {f.highPct}%
              </span>
            </div>
            {f.specimens.length > 0 && (
              <div className="text-[10px] text-muted-foreground/70">{f.specimens.join(", ")}</div>
            )}
            {correlatesByFinding.get(f.finding) && (
              <div className="text-[11px] text-muted-foreground/70">
                Correlated: {correlatesByFinding.get(f.finding)!.map((c, i) => (
                  <span key={c.label}>{i > 0 && ", "}{c.label} {c.direction}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {background.length > 0 && (
          <div className="space-y-0.5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
              Other decreased findings
            </div>
            {background.slice(0, 5).map((f) => (
              <div key={`bg-${f.finding}`} className="border-l-2 border-l-gray-300 py-0.5 pl-2.5">
                <div className="flex items-baseline gap-2">
                  <button
                    className="text-xs font-medium hover:underline"
                    onClick={() => {
                      const spec = f.specimens[0];
                      if (spec) {
                        navigateTo({ specimen: spec });
                        navigate(`/studies/${encodeURIComponent(studyId)}/histopathology`, { state: { specimen: spec, finding: f.finding } });
                      }
                    }}
                  >
                    {f.finding}
                  </button>
                  <span className="text-[11px] text-muted-foreground">{f.sexes}</span>
                  <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                    {f.ctrlPct}% {"\u2192"} {f.highPct}%
                  </span>
                </div>
              </div>
            ))}
            {background.length > 5 && (
              <div className="pl-2.5 text-[11px] text-muted-foreground/50">
                +{background.length - 5} more
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
