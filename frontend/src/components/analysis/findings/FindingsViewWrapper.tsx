import { FindingsView } from "./FindingsView";
import { useRailModePreference } from "@/hooks/useRailModePreference";

export function FindingsViewWrapper() {
  useRailModePreference("organ");
  return <FindingsView />;
}
