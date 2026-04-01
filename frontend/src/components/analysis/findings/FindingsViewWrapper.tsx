import { FindingsView } from "./FindingsView";
import { useRailModePreference } from "@/hooks/useRailModePreference";
import { StudyBannerConnected } from "@/components/analysis/StudyBannerConnected";

export function FindingsViewWrapper() {
  useRailModePreference("organ");
  return (
    <>
      <StudyBannerConnected />
      <FindingsView />
    </>
  );
}
