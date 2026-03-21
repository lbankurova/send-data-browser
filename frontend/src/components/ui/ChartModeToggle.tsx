import { PanePillToggle } from "./PanePillToggle";

export type ChartDisplayMode = "compact" | "scaled";

const chartModeOptions = [
  { value: "compact" as const, label: "C" },
  { value: "scaled" as const, label: "S" },
];

export function ChartModeToggle({ mode, onChange }: { mode: ChartDisplayMode; onChange: (m: ChartDisplayMode) => void }) {
  return <PanePillToggle value={mode} options={chartModeOptions} onChange={onChange} />;
}
