import { CohortView } from "./CohortView";
import { StudyBannerConnected } from "./StudyBannerConnected";

export function CohortViewWrapper() {
  return (
    <>
      <StudyBannerConnected />
      <CohortView />
    </>
  );
}
