import type { PanelStatement } from "@/lib/signals-panel-engine";

function StatementIcon({ icon }: { icon: PanelStatement["icon"] }) {
  switch (icon) {
    case "fact":
      return <span className="mt-0.5 shrink-0 text-[11px] text-muted-foreground">{"\u25CF"}</span>;
    case "warning":
      return <span className="mt-0.5 shrink-0 text-[11px] text-amber-600">{"\u25B2"}</span>;
    case "review-flag":
      return <span className="mt-0.5 shrink-0 text-[11px] text-amber-600">{"\u26A0"}</span>;
  }
}

export function StudyStatementsBar({ statements, modifiers, caveats }: { statements: PanelStatement[]; modifiers: PanelStatement[]; caveats: PanelStatement[] }) {
  const studyModifiers = modifiers.filter((s) => !s.organSystem);
  const studyCaveats = caveats.filter((s) => !s.organSystem);
  if (statements.length === 0 && studyModifiers.length === 0 && studyCaveats.length === 0) return null;
  return (
    <div className="shrink-0 border-b px-4 py-2">
      {statements.map((s, i) => (<div key={i} className="flex items-start gap-2 text-sm leading-relaxed"><StatementIcon icon={s.icon} /><span>{s.text}</span></div>))}
      {studyModifiers.length > 0 && (<div className="mt-1 space-y-0.5">{studyModifiers.map((s, i) => (<div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80"><span className="mt-0.5 shrink-0 text-[11px] text-amber-600">{"\u25B2"}</span><span>{s.text}</span></div>))}</div>)}
      {studyCaveats.length > 0 && (<div className="mt-1 space-y-0.5">{studyCaveats.map((s, i) => (<div key={i} className="flex items-start gap-2 text-xs leading-relaxed text-foreground/80"><span className="mt-0.5 shrink-0 text-[11px] text-amber-600">{"\u26A0"}</span><span>{s.text}</span></div>))}</div>)}
    </div>
  );
}
