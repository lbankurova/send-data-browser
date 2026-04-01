import { StudySummaryView } from "./StudySummaryView";
import { StudyBannerConnected } from "./StudyBannerConnected";

export function StudySummaryViewWrapper() {
  return (
    <>
      <StudyBannerConnected />
      <StudySummaryView />
    </>
  );
}
