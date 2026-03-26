import { HistopathologyView } from "./HistopathologyView";
import { useRailModePreference } from "@/hooks/useRailModePreference";

export function HistopathologyViewWrapper() {
  useRailModePreference("specimen");
  return <HistopathologyView />;
}
